import Link from 'next/link';
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { EmptyPanel, ErrorPanel, Skeleton } from '@/components/StatePanels';
import StatusBadge from '@/components/StatusBadge';
import { useToast } from '@/components/Toast';
import { useScheduler } from '@/context/SchedulerContext';
import { describeError, isAbortError, listTaskExecutions } from '@/lib/api';
import { fmtDateTime, fmtLogTime } from '@/lib/format';
import { parseLogLine, streamLines, tailUrlFromLogUrl } from '@/lib/logStream';
import { useAsyncData } from '@/lib/useAsyncData';
import { useUrlState } from '@/lib/useUrlState';
import { LogEntry, TaskExecution } from '@/types/scheduler';

/**
 * URL params:
 *   queue_id, task_id  — which execution's log to show (both required)
 *
 * The execution is looked up first (to get its `log_url`), then the log is streamed from that
 * URL with `/tail` appended (live tail only, for now). Lines are newline-delimited JSON.
 */

const NO_TASK = null as TaskExecution | null;
/** Oldest lines are dropped beyond this, so a very chatty task cannot exhaust the phone's memory. */
const MAX_LINES = 5000;

type Conn = 'connecting' | 'live' | 'ended' | 'error';

const LEVEL_STYLES: Record<string, string> = {
  DEBUG: 'bg-slate-100 text-slate-600 ring-slate-200',
  INFO: 'bg-sky-100 text-sky-800 ring-sky-200',
  WARN: 'bg-amber-100 text-amber-800 ring-amber-200',
  WARNING: 'bg-amber-100 text-amber-800 ring-amber-200',
  ERROR: 'bg-red-100 text-red-800 ring-red-200',
};

const LogRow = memo(function LogRow({ e, timezone }: { e: LogEntry; timezone: string }) {
  const level = e.level.toUpperCase();
  const levelStyle = LEVEL_STYLES[level] ?? 'bg-slate-100 text-slate-600 ring-slate-200';
  return (
    <div
      className={`border-b border-slate-100 px-3 py-1.5 sm:grid sm:grid-cols-[6.5rem_4rem_minmax(0,1fr)] sm:items-baseline sm:gap-x-3 ${
        level === 'ERROR' ? 'bg-red-50/50' : ''
      }`}
      title={e.time ? fmtDateTime(e.time, timezone, { weekday: true }) : undefined}
    >
      <div className="flex items-center gap-2 sm:contents">
        <time dateTime={e.time} className="font-mono text-xs text-slate-500">
          {e.unparsed ? '' : fmtLogTime(e.time, timezone)}
        </time>
        <span
          className={`inline-block w-14 rounded px-1.5 py-0.5 text-center font-mono text-[0.65rem] font-semibold ring-1 ring-inset ${
            e.unparsed ? 'invisible' : levelStyle
          }`}
        >
          {level || '—'}
        </span>
      </div>
      <p
        className={`mt-0.5 whitespace-pre-wrap break-words font-mono text-xs sm:mt-0 ${
          e.unparsed ? 'text-slate-500' : 'text-slate-800'
        }`}
      >
        {e.msg}
      </p>
    </div>
  );
});

export default function LogPage() {
  const { cfg, timezone, ready: settingsReady } = useScheduler();
  const { ready: urlReady, get } = useUrlState();
  const toast = useToast();
  const ready = settingsReady && urlReady;

  const queueId = get('queue_id');
  const taskId = get('task_id');
  const hasParams = !!queueId && !!taskId;

  // ---- 1. find the execution (and its log_url) ----
  const fetchTask = useCallback(
    async (signal: AbortSignal) => {
      const all = await listTaskExecutions(cfg, { queue_id: queueId }, { signal });
      return all.find((t) => t.id === taskId) ?? null;
    },
    [cfg, queueId, taskId],
  );
  const {
    data: task,
    state: taskState,
    error: taskError,
    reload: reloadTask,
  } = useAsyncData(fetchTask, ready && hasParams, NO_TASK);

  const tailUrl = task ? tailUrlFromLogUrl(task.log_url) : null;

  // ---- 2. stream the log ----
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [conn, setConn] = useState<Conn>('connecting');
  const [connError, setConnError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const seq = useRef(0);
  const pending = useRef<LogEntry[]>([]);
  const raf = useRef(0);

  // A different execution starts with an empty log.
  useEffect(() => {
    setEntries([]);
    seq.current = 0;
    pending.current = [];
  }, [tailUrl]);

  useEffect(() => {
    if (!tailUrl || !ready) return;
    const ac = new AbortController();
    setConn('connecting');
    setConnError('');

    // Lines arrive in bursts: collect them and render at most once per frame.
    const flush = () => {
      raf.current = 0;
      const batch = pending.current;
      if (!batch.length) return;
      pending.current = [];
      setEntries((prev) => {
        const next = prev.concat(batch);
        return next.length <= MAX_LINES ? next : next.slice(next.length - MAX_LINES);
      });
    };

    streamLines(cfg, tailUrl, ac.signal, {
      onOpen: () => {
        setConn('live');
        toast.notify({ kind: 'success', title: 'Connected', message: 'Streaming the live log.' });
      },
      onLines: (lines) => {
        for (const l of lines) pending.current.push(parseLogLine(l, seq.current++));
        if (!raf.current) raf.current = requestAnimationFrame(flush);
      },
    })
      .then(() => {
        if (!ac.signal.aborted) {
          flush();
          setConn('ended');
        }
      })
      .catch((e) => {
        if (ac.signal.aborted || isAbortError(e)) return;
        flush();
        setConnError(describeError(e));
        setConn('error');
      });

    return () => {
      ac.abort();
      if (raf.current) cancelAnimationFrame(raf.current);
      raf.current = 0;
    };
    // `toast` is intentionally left out: it must not restart the stream.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tailUrl, ready, cfg, attempt]);

  // Sequence numbers are contiguous, so what is missing from the front was dropped.
  const dropped = entries.length ? entries[entries.length - 1].seq + 1 - entries.length : 0;

  // ---- follow the newest line unless the user scrolled up ----
  const box = useRef<HTMLDivElement>(null);
  const [follow, setFollow] = useState(true);

  useLayoutEffect(() => {
    const el = box.current;
    if (el && follow) el.scrollTop = el.scrollHeight;
  }, [entries, follow]);

  const onScroll = () => {
    const el = box.current;
    if (!el) return;
    setFollow(el.scrollHeight - el.scrollTop - el.clientHeight < 24);
  };

  const jumpToLatest = () => {
    const el = box.current;
    if (el) el.scrollTop = el.scrollHeight;
    setFollow(true);
  };

  const executionHref = {
    pathname: '/executions',
    query: { queue_id: queueId, selected: taskId },
  };

  // ---- render ----
  const taskLoading = ready && hasParams && taskState === 'loading';

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Link href={executionHref} className="inline-block text-sm text-indigo-700 hover:underline">
          ← Execution
        </Link>
        <h1 className="text-lg font-semibold sm:text-xl">Task log</h1>
        {/* Fixed-height meta block so it does not shift when the execution loads. */}
        <div className="min-h-[3.25rem] space-y-1">
          {taskLoading || !ready ? (
            <>
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-5 w-1/2" />
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <code className="break-all font-mono text-xs text-slate-600">{taskId || '—'}</code>
                {task && <StatusBadge status={task.status} />}
              </div>
              <div className="break-all font-mono text-xs text-slate-500">{queueId || '—'}</div>
            </>
          )}
        </div>
      </div>

      {!hasParams && ready ? (
        <EmptyPanel
          minHeight="min-h-[16rem]"
          message="No execution selected. Open an execution and choose “View log”."
        >
          <Link href="/executions" className="btn">
            Go to executions
          </Link>
        </EmptyPanel>
      ) : taskLoading || !ready ? (
        <Skeleton className="h-[70vh] min-h-[22rem] supports-[height:1dvh]:h-[70dvh]" />
      ) : taskState === 'error' ? (
        <ErrorPanel
          minHeight="min-h-[16rem]"
          title="Could not load this execution"
          message={taskError}
          onRetry={reloadTask}
        />
      ) : !task ? (
        <EmptyPanel minHeight="min-h-[16rem]" message="This execution was not found.">
          <p className="max-w-sm text-xs">
            It may belong to a different namespace than the one currently selected, or it may no
            longer exist.
          </p>
        </EmptyPanel>
      ) : !tailUrl ? (
        <EmptyPanel minHeight="min-h-[16rem]" message="This execution has no log available.">
          <p className="max-w-sm text-xs">
            {task.log_url
              ? `Its log URL (${task.log_url}) is not a valid http(s) address.`
              : 'The server did not provide a log URL for it (older tasks may not have one).'}
          </p>
        </EmptyPanel>
      ) : (
        <>
          {/* Status + controls. Fixed height: the text changes, the row does not. */}
          <div className="flex min-h-[2.25rem] flex-wrap items-center gap-x-3 gap-y-2">
            <div role="status" className="flex items-center gap-2 text-sm">
              <span
                aria-hidden
                className={`h-2 w-2 rounded-full ${
                  conn === 'live'
                    ? 'animate-pulse bg-emerald-500'
                    : conn === 'connecting'
                      ? 'animate-pulse bg-amber-400'
                      : conn === 'error'
                        ? 'bg-red-500'
                        : 'bg-slate-400'
                }`}
              />
              <span className="text-slate-700">
                {conn === 'live' && 'Live'}
                {conn === 'connecting' && 'Connecting…'}
                {conn === 'ended' && 'Stream ended'}
                {conn === 'error' && 'Disconnected'}
              </span>
              <span className="text-xs text-slate-500">
                {entries.length.toLocaleString()} line{entries.length === 1 ? '' : 's'}
              </span>
            </div>
            <div className="ml-auto flex gap-2">
              {(conn === 'ended' || conn === 'error') && (
                <button type="button" className="btn" onClick={() => setAttempt((n) => n + 1)}>
                  Reconnect
                </button>
              )}
              {!follow && (
                <button type="button" className="btn" onClick={jumpToLatest}>
                  ↧ Latest
                </button>
              )}
            </div>
          </div>

          {conn === 'error' && (
            <div
              role="alert"
              className="break-words rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {connError}
            </div>
          )}
          {conn === 'ended' && (
            <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              The server closed the stream — the task has probably finished. Lines shown above
              stay here; Reconnect to keep listening.
            </p>
          )}

          <div
            ref={box}
            onScroll={onScroll}
            className="h-[70vh] min-h-[22rem] overflow-y-auto overscroll-contain rounded-md border border-slate-200 bg-white supports-[height:1dvh]:h-[70dvh]"
          >
            {dropped > 0 && (
              <div className="border-b border-slate-100 bg-slate-50 px-3 py-1.5 text-center text-xs text-slate-500">
                Showing the latest {MAX_LINES.toLocaleString()} lines ({dropped.toLocaleString()}{' '}
                older hidden)
              </div>
            )}
            {entries.length === 0 ? (
              <div className="flex h-full items-center justify-center px-4 text-center text-sm text-slate-500">
                {conn === 'connecting'
                  ? 'Connecting to the log stream…'
                  : conn === 'live'
                    ? 'Waiting for log lines… (live tail shows lines written from now on)'
                    : 'No log lines were received.'}
              </div>
            ) : (
              entries.map((e) => <LogRow key={e.seq} e={e} timezone={timezone} />)
            )}
          </div>
        </>
      )}
    </div>
  );
}
