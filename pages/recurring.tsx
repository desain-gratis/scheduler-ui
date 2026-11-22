import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import Modal from '@/components/Modal';
import { useScheduler } from '@/context/SchedulerContext';
import { createRecurringTask, listRecurringTasks } from '@/lib/api';
import { fmtDateTime, nowRFC3339WithOffset, prettyJson } from '@/lib/format';
import { RecurringTask } from '@/types/scheduler';

const CRON_PRESETS: { label: string; value: string }[] = [
  { label: 'Every minute', value: '* * * * *' },
  { label: 'Every 5 minutes', value: '*/5 * * * *' },
  { label: 'Hourly', value: '0 * * * *' },
  { label: 'Daily at 08:00', value: '0 8 * * *' },
  { label: 'Weekdays at 09:00', value: '0 9 * * 1-5' },
  { label: 'Monthly (1st, 00:00)', value: '0 0 1 * *' },
];

function CreateForm({ onCreated, onClose }: { onCreated: () => void; onClose: () => void }) {
  const { cfg } = useScheduler();
  const [queueId, setQueueId] = useState('');
  const [cron, setCron] = useState('0 8 * * *');
  const [userTime, setUserTime] = useState(nowRFC3339WithOffset());
  const [inputText, setInputText] = useState('{\n  \n}');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
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
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label className="label">Namespace</label>
        <input className="input font-mono" value={cfg.namespace} disabled />
      </div>
      <div>
        <label className="label">Queue ID</label>
        <input
          className="input font-mono"
          placeholder="sendInvoice()"
          value={queueId}
          onChange={(e) => setQueueId(e.target.value)}
          autoFocus
        />
      </div>
      <div>
        <label className="label">Cron</label>
        <div className="flex gap-2">
          <input
            className="input font-mono"
            value={cron}
            onChange={(e) => setCron(e.target.value)}
          />
          <select
            className="input w-48"
            value=""
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
        <label className="label">User time (RFC3339 — the offset sets the schedule&apos;s timezone)</label>
        <input
          className="input font-mono"
          value={userTime}
          onChange={(e) => setUserTime(e.target.value)}
        />
      </div>
      <div>
        <label className="label">Input (JSON)</label>
        <textarea
          className="input h-32 font-mono"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
        />
      </div>
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn" onClick={onClose}>
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
  const { cfg, timezone, ready } = useScheduler();
  const [tasks, setTasks] = useState<RecurringTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTasks(await listRecurringTasks(cfg));
    } catch (e) {
      setTasks([]);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [cfg]);

  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3">
        <div>
          <h1 className="text-xl font-semibold">Recurring tasks</h1>
          <p className="text-xs text-slate-500">
            Cron definitions in namespace <code className="font-mono">{cfg.namespace}</code>
          </p>
        </div>
        <div className="ml-auto flex gap-2">
          <button className="btn" onClick={load} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            + New recurring task
          </button>
        </div>
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
              <th className="th">Queue</th>
              <th className="th">Cron</th>
              <th className="th">Input</th>
              <th className="th">Generated until</th>
              <th className="th">Published</th>
              <th className="th" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {tasks.map((t) => (
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
                      <div className="text-slate-400">{t.state.generate_index} instances</div>
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="td whitespace-nowrap text-xs">{fmtDateTime(t.published_at, timezone)}</td>
                <td className="td whitespace-nowrap text-right">
                  <Link
                    className="btn"
                    href={`/executions?queue_id=${encodeURIComponent(
                      t.queue_id,
                    )}&recurring_task_id=${encodeURIComponent(t.id)}`}
                  >
                    Executions →
                  </Link>
                </td>
              </tr>
            ))}
            {tasks.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-sm text-slate-500">
                  {loading ? 'Loading…' : 'No recurring tasks in this namespace.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {creating && (
        <Modal title="New recurring task" onClose={() => setCreating(false)}>
          <CreateForm onCreated={load} onClose={() => setCreating(false)} />
        </Modal>
      )}
    </div>
  );
}
