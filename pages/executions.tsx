import { useRouter } from 'next/router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Modal from '@/components/Modal';
import StatusBadge from '@/components/StatusBadge';
import { useScheduler } from '@/context/SchedulerContext';
import { cancelTaskExecution, listTaskExecutions } from '@/lib/api';
import { fmtDateTime, prettyJson, ymd } from '@/lib/format';
import { ALL_EXECUTION_STATUSES, ExecutionStatus, TaskExecution } from '@/types/scheduler';

const CANCELLABLE: ExecutionStatus[] = ['PENDING'];
const PAGE_SIZE = 50;

type SortMode = 'upcoming' | 'asc' | 'desc';

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: 'upcoming', label: 'Upcoming first' },
  { value: 'asc', label: 'Time ↑ (oldest first)' },
  { value: 'desc', label: 'Time ↓ (newest first)' },
];

function runTime(t: TaskExecution): number {
  const ms = new Date(t.scheduled_run_at).getTime();
  return isNaN(ms) ? 0 : ms;
}

/**
 * - upcoming: tasks scheduled from now on, nearest first, followed by past tasks, most recent first
 * - asc / desc: plain scheduled time order
 */
function sortTasks(list: TaskExecution[], mode: SortMode): TaskExecution[] {
  const out = [...list];
  if (mode === 'asc') return out.sort((a, b) => runTime(a) - runTime(b));
  if (mode === 'desc') return out.sort((a, b) => runTime(b) - runTime(a));

  const now = Date.now();
  const upcoming = out.filter((t) => runTime(t) >= now).sort((a, b) => runTime(a) - runTime(b));
  const past = out.filter((t) => runTime(t) < now).sort((a, b) => runTime(b) - runTime(a));
  return [...upcoming, ...past];
}

export default function ExecutionsPage() {
  const router = useRouter();
  const { cfg, timezone, ready } = useScheduler();

  const [queueId, setQueueId] = useState('');
  const [recurringId, setRecurringId] = useState('');
  const [day, setDay] = useState('');
  const [statuses, setStatuses] = useState<ExecutionStatus[]>([]);
  const [search, setSearch] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('upcoming');
  const [tasks, setTasks] = useState<TaskExecution[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<TaskExecution | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);

  // Pick up filters from the URL (e.g. coming from the calendar / recurring pages).
  useEffect(() => {
    if (!router.isReady) return;
    const q = router.query;
    if (typeof q.queue_id === 'string') setQueueId(q.queue_id);
    if (typeof q.recurring_task_id === 'string') setRecurringId(q.recurring_task_id);
    if (typeof q.day === 'string') setDay(q.day);
  }, [router.isReady, router.query]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listTaskExecutions(cfg, { queue_id: queueId || undefined });
      setTasks(data);
      setPage(0);
    } catch (e) {
      setTasks([]);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [cfg, queueId]);

  useEffect(() => {
    if (ready && router.isReady) load();
  }, [ready, router.isReady, load]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return tasks.filter((t) => {
      if (statuses.length && !statuses.includes(t.status)) return false;
      if (recurringId && t.recurring_task_id !== recurringId) return false;
      if (day) {
        // Compare the calendar day in the selected timezone.
        const d = new Date(t.scheduled_run_at);
        const local = new Intl.DateTimeFormat('en-CA', {
          timeZone: timezone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(d);
        if (local !== day) return false;
      }
      if (s) {
        const hay = `${t.id} ${t.queue_id} ${prettyJson(t.input)} ${prettyJson(
          t.execution_state?.output,
        )}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [tasks, statuses, recurringId, day, search, timezone]);

  const sorted = useMemo(() => sortTasks(filtered, sortMode), [filtered, sortMode]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const visible = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const statusCounts = useMemo(() => {
    const m: Partial<Record<ExecutionStatus, number>> = {};
    for (const t of tasks) m[t.status] = (m[t.status] || 0) + 1;
    return m;
  }, [tasks]);

  const toggleStatus = (s: ExecutionStatus) => {
    setStatuses((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));
    setPage(0);
  };

  const cancel = async (t: TaskExecution) => {
    if (!window.confirm(`Cancel execution ${t.id}?`)) return;
    setCancelling(t.id);
    try {
      await cancelTaskExecution(cfg, t);
      setSelected(null);
      await load();
    } catch (e) {
      window.alert(`Cancel failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setCancelling(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-xl font-semibold">Task executions</h1>
          <p className="text-xs text-slate-500">
            {filtered.length} of {tasks.length} shown
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-end gap-3">
          <div className="w-52">
            <label className="label">Queue ID</label>
            <input
              className="input font-mono"
              placeholder="sendInvoice()"
              value={queueId}
              onChange={(e) => setQueueId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && load()}
            />
          </div>
          <div className="w-40">
            <label className="label">Day ({timezone})</label>
            <input
              type="date"
              className="input"
              value={day}
              onChange={(e) => {
                setDay(e.target.value);
                setPage(0);
              }}
            />
          </div>
          <div className="w-56">
            <label className="label">Search</label>
            <input
              className="input"
              placeholder="id, input, output…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
            />
          </div>
          <div className="w-48">
            <label className="label">Sort</label>
            <select
              className="input"
              value={sortMode}
              onChange={(e) => {
                setSortMode(e.target.value as SortMode);
                setPage(0);
              }}
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <button className="btn" onClick={() => setDay(ymd(new Date()))}>
            Today
          </button>
          <button className="btn btn-primary" onClick={load} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {recurringId && (
        <div className="flex items-center gap-2 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-800">
          Filtered by recurring task <code className="font-mono">{recurringId}</code>
          <button className="ml-auto underline" onClick={() => setRecurringId('')}>
            clear
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {ALL_EXECUTION_STATUSES.map((s) => {
          const on = statuses.includes(s);
          return (
            <button
              key={s}
              onClick={() => toggleStatus(s)}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                on
                  ? 'border-indigo-600 bg-indigo-600 text-white'
                  : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-100'
              }`}
            >
              {s} <span className="opacity-70">{statusCounts[s] || 0}</span>
            </button>
          );
        })}
        {(statuses.length > 0 || day) && (
          <button
            className="text-xs text-slate-500 underline"
            onClick={() => {
              setStatuses([]);
              setDay('');
            }}
          >
            clear filters
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="th">Scheduled</th>
              <th className="th">Queue</th>
              <th className="th">Status</th>
              <th className="th">Assignment</th>
              <th className="th">Mode</th>
              <th className="th">Output</th>
              <th className="th" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visible.map((t) => (
              <tr key={`${t.queue_id}/${t.id}`} className="hover:bg-slate-50">
                <td className="td whitespace-nowrap font-mono text-xs">
                  {fmtDateTime(t.scheduled_run_at, timezone)}
                </td>
                <td className="td font-mono text-xs">{t.queue_id}</td>
                <td className="td">
                  <StatusBadge status={t.status} />
                </td>
                <td className="td text-xs">
                  {t.assignment_status}
                  {t.assignment_state && (
                    <span className="text-slate-500"> → node {t.assignment_state.assigned_to}</span>
                  )}
                </td>
                <td className="td text-xs">{t.execution_mode}</td>
                <td className="td max-w-[14rem] truncate font-mono text-xs text-slate-600">
                  {t.execution_state ? prettyJson(t.execution_state.output) : '—'}
                </td>
                <td className="td whitespace-nowrap text-right">
                  <button className="btn" onClick={() => setSelected(t)}>
                    Details
                  </button>
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-sm text-slate-500">
                  {loading ? 'Loading…' : 'No executions match the current filters.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          <button className="btn" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            ← Prev
          </button>
          <span className="text-slate-600">
            Page {page + 1} / {pageCount}
          </span>
          <button
            className="btn"
            disabled={page >= pageCount - 1}
            onClick={() => setPage((p) => p + 1)}
          >
            Next →
          </button>
        </div>
      )}

      {selected && (
        <Modal title="Task execution" wide onClose={() => setSelected(null)}>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge status={selected.status} />
              <code className="break-all font-mono text-xs text-slate-600">{selected.id}</code>
              {CANCELLABLE.includes(selected.status) && (
                <button
                  className="btn btn-danger ml-auto"
                  disabled={cancelling === selected.id}
                  onClick={() => cancel(selected)}
                >
                  {cancelling === selected.id ? 'Cancelling…' : 'Cancel execution'}
                </button>
              )}
            </div>
            <dl className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1.5 text-sm">
              <dt className="text-slate-500">Queue</dt>
              <dd className="font-mono">{selected.queue_id}</dd>
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
        </Modal>
      )}
    </div>
  );
}
