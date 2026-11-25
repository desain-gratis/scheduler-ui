import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AutoSizer, List } from 'react-virtualized';
import type { ListRowProps } from 'react-virtualized';
import Modal from '@/components/Modal';
import { EmptyPanel, ErrorPanel, InlineError, Skeleton } from '@/components/StatePanels';
import StatusBadge from '@/components/StatusBadge';
import { useToast } from '@/components/Toast';
import { useScheduler } from '@/context/SchedulerContext';
import { cancelTaskExecution, describeError, listTaskExecutions } from '@/lib/api';
import { fmtDateTime, prettyJson, ymd } from '@/lib/format';
import { isValidYmd } from '@/lib/params';
import { useAsyncData } from '@/lib/useAsyncData';
import { useMediaQuery } from '@/lib/useMediaQuery';
import { useUrlState } from '@/lib/useUrlState';
import { ALL_EXECUTION_STATUSES, ExecutionStatus, TaskExecution } from '@/types/scheduler';

/**
 * URL params (all optional) — the page is fully described by its URL:
 *   queue_id, recurring_task_id, day (YYYY-MM-DD), status (repeatable), q (search),
 *   selected (execution id => detail dialog)
 *
 * The list is sorted by scheduled time, ascending, and virtualized (react-virtualized) so that
 * thousands of executions stay smooth. When it opens (and whenever the filters change) it is
 * positioned at the current time.
 */

const CANCELLABLE: ExecutionStatus[] = ['PENDING'];
const EMPTY_TASKS: TaskExecution[] = [];

// Row geometry (px). Rows have a fixed height, which is what lets the list virtualize cheaply
// and keeps the layout from shifting while data loads.
const CARD_ROW_HEIGHT = 116; // phones: 108px card + 8px gap
const TABLE_ROW_HEIGHT = 52; // md and up
const SKELETON_ROWS = 8;
// Same breakpoint as Tailwind's `md:`.
const DESKTOP_QUERY = '(min-width: 768px)';
const TABLE_GRID =
  'grid grid-cols-[10.5rem_minmax(7rem,1fr)_8.5rem_8rem_minmax(5rem,1fr)_5.5rem] items-center gap-x-3';

function runTime(t: TaskExecution): number {
  const ms = new Date(t.scheduled_run_at).getTime();
  return isNaN(ms) ? 0 : ms;
}

/** First index scheduled at or after `ms`, or -1 when everything is in the past. */
function findNowIndex(list: TaskExecution[], ms: number): number {
  return list.findIndex((t) => runTime(t) >= ms);
}

export default function ExecutionsPage() {
  const { cfg, timezone, ready: settingsReady } = useScheduler();
  const { get, getAll, push, open, close, ready: urlReady } = useUrlState();
  const toast = useToast();
  const ready = settingsReady && urlReady;
  const isDesktop = useMediaQuery(DESKTOP_QUERY);

  // ---- state that lives in the URL ----
  const queueId = get('queue_id');
  const recurringId = get('recurring_task_id');
  const dayParam = get('day');
  const day = isValidYmd(dayParam) ? dayParam : '';
  const search = get('q');
  const selectedId = get('selected');
  const statusKey = getAll('status').join(',');
  const statuses = useMemo(
    () =>
      (statusKey ? statusKey.split(',') : []).filter((s): s is ExecutionStatus =>
        (ALL_EXECUTION_STATUSES as string[]).includes(s),
      ),
    [statusKey],
  );

  // ---- local state: text being typed (committed to the URL on Enter / blur) and dialog state ----
  const [queueInput, setQueueInput] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState('');
  // Row the list should scroll to. Set for one render, then cleared (see below).
  const [scrollIndex, setScrollIndex] = useState<number | undefined>(undefined);

  useEffect(() => setQueueInput(queueId), [queueId]);
  useEffect(() => setSearchInput(search), [search]);
  useEffect(() => {
    setConfirming(false);
    setCancelError('');
  }, [selectedId]);

  // ---- data: loaded asynchronously once the URL has been read ----
  const fetchTasks = useCallback(
    (signal: AbortSignal) =>
      listTaskExecutions(cfg, { queue_id: queueId || undefined }, { signal }),
    [cfg, queueId],
  );
  const { data: tasks, state, error, reload } = useAsyncData(fetchTasks, ready, EMPTY_TASKS);

  const initialLoading = state === 'loading' && tasks.length === 0;
  const refreshing = state === 'loading' && tasks.length > 0;

  // Filtered, then sorted by scheduled time ascending (oldest first).
  const sorted = useMemo(() => {
    const s = search.trim().toLowerCase();
    return tasks
      .filter((t) => {
        if (statuses.length && !statuses.includes(t.status)) return false;
        if (recurringId && t.recurring_task_id !== recurringId) return false;
        if (day) {
          // Compare the calendar day in the selected timezone.
          const local = new Intl.DateTimeFormat('en-CA', {
            timeZone: timezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          }).format(new Date(t.scheduled_run_at));
          if (local !== day) return false;
        }
        if (s) {
          const hay = `${t.id} ${t.queue_id} ${prettyJson(t.input)} ${prettyJson(
            t.execution_state?.output,
          )}`.toLowerCase();
          if (!hay.includes(s)) return false;
        }
        return true;
      })
      .sort((a, b) => runTime(a) - runTime(b));
  }, [tasks, statuses, recurringId, day, search, timezone]);

  const statusCounts = useMemo(() => {
    const m: Partial<Record<ExecutionStatus, number>> = {};
    for (const t of tasks) m[t.status] = (m[t.status] || 0) + 1;
    return m;
  }, [tasks]);

  const selected = useMemo(
    () => (selectedId ? (tasks.find((t) => t.id === selectedId) ?? null) : null),
    [tasks, selectedId],
  );

  // ---- "current time" positioning ----
  // The first row scheduled from now on is marked; if everything is in the past, the newest row.
  const anchorIndex = useMemo(() => findNowIndex(sorted, Date.now()), [sorted]);

  const initialIndex = useMemo(() => {
    if (sorted.length === 0) return 0;
    // A specific past/future day is read from its start, not from "now".
    if (day && day !== ymd(new Date())) return 0;
    return anchorIndex >= 0 ? anchorIndex : sorted.length - 1;
  }, [sorted.length, day, anchorIndex]);

  const filterKey = [cfg.baseUrl, cfg.namespace, queueId, recurringId, day, search, statusKey].join(
    '|',
  );
  const pendingSnap = useRef(true);
  useEffect(() => {
    pendingSnap.current = true;
  }, [filterKey]);
  useEffect(() => {
    if (!pendingSnap.current || state !== 'ok' || sorted.length === 0) return;
    pendingSnap.current = false;
    setScrollIndex(initialIndex);
  }, [state, sorted.length, initialIndex, filterKey]);

  // scrollToIndex only needs to be set for the render that performs the scroll; clearing it
  // afterwards stops the list from snapping back when the user scrolls or the data re-renders.
  useEffect(() => {
    if (scrollIndex === undefined) return;
    const id = requestAnimationFrame(() => setScrollIndex(undefined));
    return () => cancelAnimationFrame(id);
  }, [scrollIndex]);

  const jumpToNow = () => {
    const i = findNowIndex(sorted, Date.now());
    setScrollIndex(i >= 0 ? i : sorted.length - 1);
  };

  // ---- URL-changing actions (each pushes a history entry) ----
  const commitQueue = () => {
    const v = queueInput.trim();
    if (v !== queueId) push({ queue_id: v });
  };
  const commitSearch = () => {
    const v = searchInput.trim();
    if (v !== search) push({ q: v });
  };
  const toggleStatus = (s: ExecutionStatus) =>
    push({ status: statuses.includes(s) ? statuses.filter((x) => x !== s) : [...statuses, s] });

  const cancel = async (t: TaskExecution) => {
    setCancelling(true);
    setCancelError('');
    try {
      await cancelTaskExecution(cfg, t);
      toast.notify({
        kind: 'success',
        title: 'Execution cancelled',
        message: `${t.queue_id} · ${fmtDateTime(t.scheduled_run_at, timezone)}`,
      });
      setConfirming(false);
      reload();
    } catch (e) {
      setCancelError(describeError(e));
    } finally {
      setCancelling(false);
    }
  };

  const hasFilters = statuses.length > 0 || !!day;

  // ---- rows ----
  const rowRenderer = ({ index, key, style }: ListRowProps) => {
    const t = sorted[index];
    // Marks where "now" falls in the (ascending) list.
    const isNow = index === anchorIndex;

    if (!isDesktop) {
      return (
        <div key={key} style={style} className="pb-2">
          <button
            type="button"
            onClick={() => open('selected', t.id)}
            className={`card block h-full w-full overflow-hidden p-3 text-left active:bg-slate-50 ${
              isNow ? 'border-t-2 border-t-indigo-500' : ''
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="font-mono text-sm font-medium">
                {fmtDateTime(t.scheduled_run_at, timezone)}
              </div>
              <StatusBadge status={t.status} />
            </div>
            <div className="mt-1 truncate font-mono text-xs text-slate-600">{t.queue_id}</div>
            <div className="mt-1 flex gap-x-3 truncate text-xs text-slate-500">
              <span>{t.execution_mode}</span>
              <span>
                {t.assignment_status}
                {t.assignment_state && ` → node ${t.assignment_state.assigned_to}`}
              </span>
            </div>
            {t.execution_state && (
              <div className="mt-1 truncate font-mono text-xs text-slate-600">
                {prettyJson(t.execution_state.output)}
              </div>
            )}
          </button>
        </div>
      );
    }

    return (
      <div
        key={key}
        style={style}
        role="row"
        className={`${TABLE_GRID} border-b border-slate-100 px-3 hover:bg-slate-50 ${
          isNow ? 'border-t-2 border-t-indigo-500' : ''
        }`}
      >
        <div className="whitespace-nowrap font-mono text-xs">
          {fmtDateTime(t.scheduled_run_at, timezone)}
        </div>
        <div className="truncate font-mono text-xs">{t.queue_id}</div>
        <div>
          <StatusBadge status={t.status} />
        </div>
        <div className="text-xs leading-tight">
          <div className="truncate">
            {t.assignment_status}
            {t.assignment_state && (
              <span className="text-slate-500"> → node {t.assignment_state.assigned_to}</span>
            )}
          </div>
          <div className="truncate text-slate-400">{t.execution_mode}</div>
        </div>
        <div className="truncate font-mono text-xs text-slate-600">
          {t.execution_state ? prettyJson(t.execution_state.output) : '—'}
        </div>
        <div className="text-right">
          <button className="btn" onClick={() => open('selected', t.id)}>
            Details
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-xl font-semibold">Task executions</h1>
          <div className="flex h-4 items-center text-xs text-slate-500">
            {initialLoading ? (
              <Skeleton className="h-3 w-28" />
            ) : state === 'error' ? (
              'Could not load'
            ) : (
              `${sorted.length} of ${tasks.length} shown`
            )}
          </div>
        </div>
        <div className="grid w-full grid-cols-2 gap-3 sm:ml-auto sm:flex sm:w-auto sm:flex-wrap sm:items-end">
          <div className="col-span-2 sm:w-52">
            <label className="label" htmlFor="f-queue">
              Queue ID
            </label>
            <input
              id="f-queue"
              className="input font-mono"
              placeholder="sendInvoice()"
              value={queueInput}
              autoCapitalize="off"
              autoCorrect="off"
              onChange={(e) => setQueueInput(e.target.value)}
              onBlur={commitQueue}
              onKeyDown={(e) => e.key === 'Enter' && commitQueue()}
            />
          </div>
          <div className="sm:w-40">
            <label className="label" htmlFor="f-day">
              Day ({timezone})
            </label>
            <input
              id="f-day"
              type="date"
              className="input"
              value={day}
              onChange={(e) => push({ day: e.target.value })}
            />
          </div>
          <div className="flex items-end">
            <button className="btn w-full" onClick={() => push({ day: ymd(new Date()) })}>
              Today
            </button>
          </div>
          <div className="col-span-2 sm:w-56">
            <label className="label" htmlFor="f-search">
              Search
            </label>
            <input
              id="f-search"
              className="input"
              placeholder="id, input, output…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onBlur={commitSearch}
              onKeyDown={(e) => e.key === 'Enter' && commitSearch()}
            />
          </div>
          <button
            className="btn btn-primary col-span-2 min-w-[5.5rem] sm:col-span-1"
            onClick={reload}
            disabled={state === 'loading'}
          >
            {state === 'loading' ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {recurringId && (
        <div className="flex items-center gap-2 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-800">
          <span className="min-w-0 break-all">
            Filtered by recurring task <code className="font-mono">{recurringId}</code>
          </span>
          <button
            className="ml-auto shrink-0 underline"
            onClick={() => push({ recurring_task_id: null })}
          >
            clear
          </button>
        </div>
      )}

      {/* Single scrollable row on phones, wrapping chips on larger screens */}
      <div className="-mx-3 flex min-h-[2.25rem] items-center gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {ALL_EXECUTION_STATUSES.map((s) => {
          const on = statuses.includes(s);
          return (
            <button
              key={s}
              onClick={() => toggleStatus(s)}
              aria-pressed={on}
              className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition sm:px-2.5 sm:py-1 ${
                on
                  ? 'border-indigo-600 bg-indigo-600 text-white'
                  : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-100'
              }`}
            >
              {s} <span className="opacity-70">{initialLoading ? '–' : statusCounts[s] || 0}</span>
            </button>
          );
        })}
        {hasFilters && (
          <button
            className="shrink-0 whitespace-nowrap text-xs text-slate-500 underline"
            onClick={() => push({ status: null, day: null })}
          >
            clear filters
          </button>
        )}
      </div>

      {/*
        The list area has one fixed height for every state (loading, error, empty, data), so
        switching between them never moves the rest of the page.
      */}
      <div className="relative h-[70vh] min-h-[22rem] supports-[height:1dvh]:h-[70dvh]" aria-busy={state === 'loading'}>
        {state === 'error' ? (
          <div className="card h-full">
            <ErrorPanel
              minHeight="h-full"
              title="Could not load task executions"
              message={error}
              onRetry={reload}
            />
          </div>
        ) : !initialLoading && sorted.length === 0 ? (
          <div className="card h-full">
            <EmptyPanel
              minHeight="h-full"
              message={
                tasks.length === 0
                  ? 'No task executions found in this namespace.'
                  : 'No executions match the current filters.'
              }
            >
              {hasFilters && (
                <button className="btn" onClick={() => push({ status: null, day: null })}>
                  Clear filters
                </button>
              )}
            </EmptyPanel>
          </div>
        ) : (
          <div
            className={`flex h-full flex-col overflow-hidden md:rounded-lg md:border md:border-slate-200 md:bg-white md:shadow-sm ${
              refreshing ? 'opacity-60 transition-opacity' : 'transition-opacity'
            }`}
          >
            {isDesktop && (
              <div
                role="row"
                className={`${TABLE_GRID} shrink-0 border-b border-slate-200 bg-slate-50 py-2 pl-3 pr-7 text-xs font-semibold uppercase tracking-wide text-slate-500`}
              >
                <div>Scheduled</div>
                <div>Queue</div>
                <div>Status</div>
                <div>Assignment</div>
                <div>Output</div>
                <div />
              </div>
            )}
            <div className="min-h-0 flex-1">
              {initialLoading ? (
                <div aria-hidden>
                  {Array.from({ length: SKELETON_ROWS }, (_, i) => (
                    <div
                      key={i}
                      style={{ height: isDesktop ? TABLE_ROW_HEIGHT : CARD_ROW_HEIGHT }}
                      className={isDesktop ? 'px-3 py-3' : 'pb-2'}
                    >
                      <Skeleton className="h-full w-full" />
                    </div>
                  ))}
                </div>
              ) : (
                <AutoSizer>
                  {({ height, width }: { height: number; width: number }) => (
                    <List
                      // Remount when switching between the card and table layouts (row height differs).
                      key={isDesktop ? 'table' : 'cards'}
                      width={width}
                      height={height}
                      rowCount={sorted.length}
                      rowHeight={isDesktop ? TABLE_ROW_HEIGHT : CARD_ROW_HEIGHT}
                      rowRenderer={rowRenderer}
                      overscanRowCount={6}
                      scrollToIndex={scrollIndex}
                      scrollToAlignment="center"
                    />
                  )}
                </AutoSizer>
              )}
            </div>
          </div>
        )}

        {!initialLoading && state !== 'error' && sorted.length > 0 && (
          <button
            className="btn btn-primary absolute bottom-3 right-4 shadow-lg"
            onClick={jumpToNow}
            aria-label="Scroll to the current time"
          >
            ↧ Now
          </button>
        )}
      </div>

      {selectedId && (
        <Modal title="Task execution" wide onClose={() => close('selected')}>
          {initialLoading ? (
            <div className="space-y-3" aria-busy="true">
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="h-40" />
              <Skeleton className="h-24" />
            </div>
          ) : state === 'error' ? (
            <ErrorPanel
              minHeight="min-h-[12rem]"
              title="Could not load this execution"
              message={error}
              onRetry={reload}
            />
          ) : !selected ? (
            <EmptyPanel minHeight="min-h-[12rem]" message="This execution was not found.">
              <p className="max-w-sm text-xs">
                It may belong to a different queue or namespace than the one currently selected, or
                it may no longer exist.
              </p>
            </EmptyPanel>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <StatusBadge status={selected.status} />
                <code className="break-all font-mono text-xs text-slate-600">{selected.id}</code>
                {CANCELLABLE.includes(selected.status) && (
                  <div className="w-full sm:ml-auto sm:w-auto">
                    {confirming ? (
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <span className="text-sm text-slate-600">Cancel this execution?</span>
                        <div className="flex gap-2">
                          <button
                            className="btn flex-1 sm:flex-none"
                            disabled={cancelling}
                            onClick={() => setConfirming(false)}
                          >
                            Keep
                          </button>
                          <button
                            className="btn btn-danger flex-1 sm:flex-none"
                            disabled={cancelling}
                            onClick={() => cancel(selected)}
                          >
                            {cancelling ? 'Cancelling…' : 'Yes, cancel'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        className="btn btn-danger w-full sm:w-auto"
                        onClick={() => setConfirming(true)}
                      >
                        Cancel execution
                      </button>
                    )}
                  </div>
                )}
              </div>
              {cancelError && <InlineError message={`Could not cancel the execution: ${cancelError}`} />}
              <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm sm:grid-cols-[9rem_minmax(0,1fr)]">
                <dt className="text-slate-500">Queue</dt>
                <dd className="break-all font-mono">{selected.queue_id}</dd>
                <dt className="text-slate-500">Scheduled run</dt>
                <dd>{fmtDateTime(selected.scheduled_run_at, timezone)}</dd>
                <dt className="text-slate-500">Actual run</dt>
                <dd>{fmtDateTime(selected.execution_state?.actual_run_at, timezone)}</dd>
                <dt className="text-slate-500">Completed</dt>
                <dd>{fmtDateTime(selected.execution_state?.completed_at, timezone)}</dd>
                <dt className="text-slate-500">Published</dt>
                <dd>{fmtDateTime(selected.published_at, timezone)}</dd>
                <dt className="text-slate-500">Mode</dt>
                <dd>{selected.execution_mode}</dd>
                <dt className="text-slate-500">Recurring task</dt>
                <dd className="break-all font-mono text-xs">{selected.recurring_task_id ?? '—'}</dd>
                <dt className="text-slate-500">Assignment</dt>
                <dd>
                  {selected.assignment_status}
                  {selected.assignment_state &&
                    ` — node ${selected.assignment_state.assigned_to} (by ${selected.assignment_state.assigned_by}, ×${selected.assignment_state.assignment_count})`}
                </dd>
              </dl>
              <div>
                <div className="label">Input</div>
                <pre className="max-h-48 overflow-auto rounded-md bg-slate-900 p-3 font-mono text-xs text-slate-100">
                  {prettyJson(selected.input)}
                </pre>
              </div>
              <div>
                <div className="label">Output</div>
                <pre className="max-h-48 overflow-auto rounded-md bg-slate-900 p-3 font-mono text-xs text-slate-100">
                  {selected.execution_state ? prettyJson(selected.execution_state.output) : '—'}
                </pre>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
