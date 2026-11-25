import Link from 'next/link';
import { useCallback, useState } from 'react';
import type { FormEvent } from 'react';
import Modal from '@/components/Modal';
import { EmptyPanel, ErrorPanel, InlineError, Skeleton } from '@/components/StatePanels';
import { useToast } from '@/components/Toast';
import { useScheduler } from '@/context/SchedulerContext';
import { createRecurringTask, describeError, listRecurringTasks } from '@/lib/api';
import { fmtDateTime, nowRFC3339WithOffset } from '@/lib/format';
import { useAsyncData } from '@/lib/useAsyncData';
import { useUrlState } from '@/lib/useUrlState';
import { RecurringTask } from '@/types/scheduler';

/** URL params: new=1 opens the "new recurring task" dialog (so Back closes it). */

const EMPTY_TASKS: RecurringTask[] = [];
const SKELETON_ROWS = 4;

const CRON_PRESETS: { label: string; value: string }[] = [
  { label: 'Every minute', value: '* * * * *' },
  { label: 'Every 5 minutes', value: '*/5 * * * *' },
  { label: 'Hourly', value: '0 * * * *' },
  { label: 'Daily at 08:00', value: '0 8 * * *' },
  { label: 'Weekdays at 09:00', value: '0 9 * * 1-5' },
  { label: 'Monthly (1st, 00:00)', value: '0 0 1 * *' },
];

function executionsHref(t: RecurringTask): string {
  const p = new URLSearchParams({ queue_id: t.queue_id, recurring_task_id: t.id });
  return `/executions?${p.toString()}`;
}

function CreateForm({
  onCreated,
  onClose,
}: {
  onCreated: (task: { queueId: string; cron: string }) => void;
  onClose: () => void;
}) {
  const { cfg } = useScheduler();
  const [queueId, setQueueId] = useState('');
  const [cron, setCron] = useState('0 8 * * *');
  const [userTime, setUserTime] = useState(nowRFC3339WithOffset());
  const [inputText, setInputText] = useState('{\n  \n}');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);

    let input: unknown;
    try {
      input = inputText.trim() ? JSON.parse(inputText) : null;
    } catch {
      setError('Input is not valid JSON.');
      return;
    }
    if (!queueId.trim()) return setError('Queue ID is required.');
    if (cron.trim().split(/\s+/).length !== 5) return setError('Cron must have 5 fields.');
    if (!/[+-]\d{2}:\d{2}$|Z$/.test(userTime.trim()))
      return setError('User time must include a timezone offset, e.g. +07:00.');

    setBusy(true);
    try {
      await createRecurringTask(cfg, {
        namespace: cfg.namespace,
        queue_id: queueId.trim(),
        input,
        cron: cron.trim(),
        user_time: userTime.trim(),
      });
      onCreated({ queueId: queueId.trim(), cron: cron.trim() });
      onClose();
    } catch (err) {
      setError(`Could not create the recurring task: ${describeError(err)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label className="label" htmlFor="rt-ns">
          Namespace
        </label>
        <input id="rt-ns" className="input font-mono" value={cfg.namespace} disabled />
      </div>
      <div>
        <label className="label" htmlFor="rt-queue">
          Queue ID
        </label>
        <input
          id="rt-queue"
          className="input font-mono"
          placeholder="sendInvoice()"
          value={queueId}
          autoCapitalize="off"
          autoCorrect="off"
          onChange={(e) => setQueueId(e.target.value)}
          autoFocus
        />
      </div>
      <div>
        <label className="label" htmlFor="rt-cron">
          Cron
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="rt-cron"
            className="input font-mono"
            value={cron}
            autoCapitalize="off"
            autoCorrect="off"
            onChange={(e) => setCron(e.target.value)}
          />
          <select
            className="input sm:w-48"
            value=""
            aria-label="Cron presets"
            onChange={(e) => e.target.value && setCron(e.target.value)}
          >
            <option value="">Presets…</option>
            {CRON_PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="label" htmlFor="rt-time">
          User time (RFC3339 — the offset sets the schedule&apos;s timezone)
        </label>
        <input
          id="rt-time"
          className="input font-mono"
          value={userTime}
          autoCapitalize="off"
          autoCorrect="off"
          onChange={(e) => setUserTime(e.target.value)}
        />
      </div>
      <div>
        <label className="label" htmlFor="rt-input">
          Input (JSON)
        </label>
        <textarea
          id="rt-input"
          className="input h-32 font-mono"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
        />
      </div>
      {error && <InlineError message={error} />}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Creating…' : 'Create'}
        </button>
      </div>
    </form>
  );
}

export default function RecurringPage() {
  const { cfg, timezone, ready: settingsReady } = useScheduler();
  const { get, open, close, ready: urlReady } = useUrlState();
  const toast = useToast();
  const ready = settingsReady && urlReady;

  const creating = get('new') === '1';

  const fetchTasks = useCallback(
    (signal: AbortSignal) => listRecurringTasks(cfg, { signal }),
    [cfg],
  );
  const { data: tasks, state, error, reload } = useAsyncData(fetchTasks, ready, EMPTY_TASKS);

  const initialLoading = state === 'loading' && tasks.length === 0;
  const refreshing = state === 'loading' && tasks.length > 0;

  const onCreated = ({ queueId, cron }: { queueId: string; cron: string }) => {
    toast.notify({
      kind: 'success',
      title: 'Recurring task created',
      message: `${queueId} · ${cron}. It will start generating executions shortly.`,
    });
    reload();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-xl font-semibold">Recurring tasks</h1>
          <p className="text-xs text-slate-500">
            Cron definitions in namespace <code className="font-mono">{cfg.namespace}</code>
          </p>
        </div>
        <div className="flex w-full gap-2 sm:ml-auto sm:w-auto">
          <button
            className="btn min-w-[5.5rem] flex-1 sm:flex-none"
            onClick={reload}
            disabled={state === 'loading'}
          >
            {state === 'loading' ? 'Loading…' : 'Refresh'}
          </button>
          <button
            className="btn btn-primary flex-1 sm:flex-none"
            onClick={() => open('new', '1')}
          >
            + New recurring task
          </button>
        </div>
      </div>

      {/* The list area always keeps a minimum height, so loading / error / empty states don't shift the page. */}
      <div aria-busy={state === 'loading'}>
        {state === 'error' ? (
          <div className="card">
            <ErrorPanel
              minHeight="min-h-[16rem]"
              title="Could not load recurring tasks"
              message={error}
              onRetry={reload}
            />
          </div>
        ) : !initialLoading && tasks.length === 0 ? (
          <div className="card">
            <EmptyPanel
              minHeight="min-h-[16rem]"
              message="No recurring tasks in this namespace yet."
            >
              <button className="btn btn-primary" onClick={() => open('new', '1')}>
                + New recurring task
              </button>
            </EmptyPanel>
          </div>
        ) : (
          <div className={refreshing ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
            {/* Phones: one card per recurring task */}
            <div className="space-y-2 md:hidden">
              {initialLoading
                ? Array.from({ length: SKELETON_ROWS }, (_, i) => (
                    <Skeleton key={i} className="h-[11.5rem] w-full" />
                  ))
                : tasks.map((t) => (
                    <div key={t.id} className="card min-h-[11.5rem] p-3">
                      <div className="break-all font-mono text-sm font-medium">{t.queue_id}</div>
                      <div className="mt-0.5 break-all font-mono text-[10px] text-slate-400">
                        {t.id}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">
                          {t.cron}
                        </code>
                        <span className="text-[10px] text-slate-400">
                          tz offset {t.user_time.slice(-6)}
                        </span>
                      </div>
                      <pre className="mt-2 overflow-x-auto font-mono text-xs text-slate-600">
                        {JSON.stringify(t.input)}
                      </pre>
                      <div className="mt-2 text-xs text-slate-500">
                        {t.state ? (
                          <>
                            Generated until {fmtDateTime(t.state.last_generate_end, timezone)} ·{' '}
                            {t.state.generate_index} instances
                          </>
                        ) : (
                          'Not generated yet'
                        )}
                      </div>
                      <Link className="btn mt-3 w-full" href={executionsHref(t)}>
                        Executions →
                      </Link>
                    </div>
                  ))}
            </div>

            {/* Tablet / desktop: table */}
            <div className="card hidden overflow-x-auto md:block">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="th">Queue</th>
                    <th className="th">Cron</th>
                    <th className="th">Input</th>
                    <th className="th">Generated until</th>
                    <th className="th">Published</th>
                    <th className="th" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {initialLoading
                    ? Array.from({ length: SKELETON_ROWS }, (_, i) => (
                        <tr key={i}>
                          <td colSpan={6} className="px-3 py-2">
                            <Skeleton className="h-10" />
                          </td>
                        </tr>
                      ))
                    : tasks.map((t) => (
                        <tr key={t.id} className="hover:bg-slate-50">
                          <td className="td">
                            <div className="font-mono text-xs font-medium">{t.queue_id}</div>
                            <div className="font-mono text-[10px] text-slate-400">{t.id}</div>
                          </td>
                          <td className="td">
                            <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">
                              {t.cron}
                            </code>
                            <div className="mt-1 text-[10px] text-slate-400">
                              tz offset {t.user_time.slice(-6)}
                            </div>
                          </td>
                          <td className="td max-w-[16rem]">
                            <pre className="truncate font-mono text-xs text-slate-600">
                              {JSON.stringify(t.input)}
                            </pre>
                          </td>
                          <td className="td whitespace-nowrap text-xs">
                            {t.state ? (
                              <>
                                <div>{fmtDateTime(t.state.last_generate_end, timezone)}</div>
                                <div className="text-slate-400">
                                  {t.state.generate_index} instances
                                </div>
                              </>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="td whitespace-nowrap text-xs">
                            {fmtDateTime(t.published_at, timezone)}
                          </td>
                          <td className="td whitespace-nowrap text-right">
                            <Link className="btn" href={executionsHref(t)}>
                              Executions →
                            </Link>
                          </td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {creating && (
        <Modal title="New recurring task" onClose={() => close('new')}>
          <CreateForm onCreated={onCreated} onClose={() => close('new')} />
        </Modal>
      )}
    </div>
  );
}
