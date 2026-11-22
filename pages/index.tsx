import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import StatusBadge from '@/components/StatusBadge';
import { useScheduler } from '@/context/SchedulerContext';
import { getDailyCount, getHourlyCount } from '@/lib/api';
import { pad, STATUS_STYLES, ymd } from '@/lib/format';
import { ALL_EXECUTION_STATUSES, DailyCount, ExecutionStatus, HourlyCount } from '@/types/scheduler';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type StatusCounts = Partial<Record<ExecutionStatus, number>>;

function sum(c: StatusCounts): number {
  return Object.values(c).reduce((a, b) => a + (b || 0), 0);
}

export default function CalendarPage() {
  const { cfg, timezone, ready } = useScheduler();
  // On phones the day detail sits below the calendar; scroll to it when a day is picked.
  const detailRef = useRef<HTMLElement>(null);

  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [queueFilter, setQueueFilter] = useState('');
  const [daily, setDaily] = useState<DailyCount[]>([]);
  const [hourly, setHourly] = useState<HourlyCount[]>([]);
  const [selectedDay, setSelectedDay] = useState<string>(() => ymd(new Date()));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 6-week grid starting on Sunday
  const cells = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const start = new Date(first);
    start.setDate(1 - first.getDay());
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [month]);

  const rangeStart = ymd(cells[0]);
  const rangeEnd = ymd(cells[cells.length - 1]);

  const loadDaily = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getDailyCount(cfg, {
        timezone,
        start_date: rangeStart,
        end_date: rangeEnd,
        queue_id: queueFilter || undefined,
      });
      setDaily(data);
    } catch (e) {
      setDaily([]);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [cfg, timezone, rangeStart, rangeEnd, queueFilter]);

  const loadHourly = useCallback(async () => {
    try {
      const data = await getHourlyCount(cfg, {
        timezone,
        start_date: selectedDay,
        end_date: selectedDay,
        queue_id: queueFilter || undefined,
      });
      setHourly(data);
    } catch (e) {
      setHourly([]);
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [cfg, timezone, selectedDay, queueFilter]);

  useEffect(() => {
    if (ready) loadDaily();
  }, [ready, loadDaily]);

  useEffect(() => {
    if (ready) loadHourly();
  }, [ready, loadHourly]);

  const byDay = useMemo(() => {
    const m = new Map<string, StatusCounts>();
    for (const r of daily) {
      const c = m.get(r.day) ?? {};
      c[r.status] = (c[r.status] || 0) + r.count;
      m.set(r.day, c);
    }
    return m;
  }, [daily]);

  const queues = useMemo(
    () => Array.from(new Set(daily.map((d) => d.queue_id))).sort(),
    [daily],
  );

  // Hours of the selected day: 0..23 -> counts. Server hour looks like "2026-11-22 07:00:00".
  const hourRows = useMemo(() => {
    const m = new Map<number, StatusCounts>();
    for (const r of hourly) {
      const h = parseInt(r.hour.slice(11, 13), 10);
      if (isNaN(h)) continue;
      const c = m.get(h) ?? {};
      c[r.status] = (c[r.status] || 0) + r.count;
      m.set(h, c);
    }
    return Array.from({ length: 24 }, (_, h) => ({ hour: h, counts: m.get(h) ?? {} }));
  }, [hourly]);

  const maxHour = Math.max(1, ...hourRows.map((r) => sum(r.counts)));
  const todayStr = ymd(new Date());

  const shiftMonth = (delta: number) =>
    setMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-6">
      <section className="card p-2 sm:p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button className="btn" onClick={() => shiftMonth(-1)}>
            ←
          </button>
          <h1 className="min-w-0 flex-1 text-center text-lg font-semibold sm:min-w-[9rem] sm:flex-none">
            {month.toLocaleString(undefined, { month: 'long', year: 'numeric' })}
          </h1>
          <button className="btn" onClick={() => shiftMonth(1)}>
            →
          </button>
          <button
            className="btn"
            onClick={() => {
              const d = new Date();
              setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
              setSelectedDay(ymd(d));
            }}
          >
            Today
          </button>

          <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
            <select
              className="input min-w-0 flex-1 sm:w-52 sm:flex-none"
              value={queueFilter}
              onChange={(e) => setQueueFilter(e.target.value)}
            >
              <option value="">All queues</option>
              {queueFilter && !queues.includes(queueFilter) && (
                <option value={queueFilter}>{queueFilter}</option>
              )}
              {queues.map((q) => (
                <option key={q} value={q}>
                  {q}
                </option>
              ))}
            </select>
            <button className="btn" onClick={() => (loadDaily(), loadHourly())} disabled={loading}>
              {loading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-md border border-slate-200 bg-slate-200">
          {WEEKDAYS.map((w) => (
            <div key={w} className="bg-slate-100 px-2 py-1 text-center text-xs font-semibold text-slate-500">
              {w}
            </div>
          ))}
          {cells.map((d) => {
            const key = ymd(d);
            const counts = byDay.get(key) ?? {};
            const total = sum(counts);
            const inMonth = d.getMonth() === month.getMonth();
            const selected = key === selectedDay;
            return (
              <button
                key={key}
                onClick={() => {
                  setSelectedDay(key);
                  if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                    detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }
                }}
                className={`flex min-h-[3.75rem] flex-col items-stretch gap-1 bg-white p-1 text-left transition hover:bg-indigo-50 sm:min-h-[5.5rem] sm:p-1.5 ${
                  inMonth ? '' : 'bg-slate-50 text-slate-400'
                } ${selected ? 'ring-2 ring-inset ring-indigo-500' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`text-xs font-semibold ${
                      key === todayStr
                        ? 'rounded-full bg-indigo-600 px-1.5 py-0.5 text-white'
                        : ''
                    }`}
                  >
                    {d.getDate()}
                  </span>
                  {total > 0 && (
                    <span className="text-[10px] font-medium text-slate-500 sm:font-normal sm:text-slate-400">
                      {total}
                    </span>
                  )}
                </div>
                {/* Phones: just coloured dots per status; the count is in the corner */}
                <div className="flex flex-wrap gap-0.5 sm:hidden">
                  {ALL_EXECUTION_STATUSES.filter((s) => counts[s]).map((s) => (
                    <span key={s} className={`h-2 w-2 rounded-full ${STATUS_STYLES[s].dot}`} />
                  ))}
                </div>
                <div className="hidden flex-col gap-0.5 sm:flex">
                  {ALL_EXECUTION_STATUSES.filter((s) => counts[s]).map((s) => (
                    <div key={s} className="flex items-center gap-1 text-[11px] leading-tight">
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_STYLES[s].dot}`} />
                      <span className="truncate">
                        {counts[s]} {s.toLowerCase().replace('_', ' ')}
                      </span>
                    </div>
                  ))}
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
          {ALL_EXECUTION_STATUSES.map((s) => (
            <span key={s} className="inline-flex items-center gap-1">
              <span className={`h-2 w-2 rounded-full ${STATUS_STYLES[s].dot}`} />
              {s}
            </span>
          ))}
        </div>
      </section>

      <aside ref={detailRef} className="card h-fit scroll-mt-28 p-3 sm:p-4 lg:scroll-mt-4">
        <div className="mb-1 flex items-baseline justify-between">
          <h2 className="text-base font-semibold">{selectedDay}</h2>
          <span className="text-xs text-slate-500">{timezone}</span>
        </div>
        <p className="mb-3 text-xs text-slate-500">Hourly breakdown</p>

        <div className="space-y-1">
          {hourRows.map(({ hour, counts }) => {
            const total = sum(counts);
            return (
              <div key={hour} className="flex items-center gap-2">
                <span className="w-9 shrink-0 font-mono text-xs text-slate-500">{pad(hour)}:00</span>
                <div className="flex h-4 flex-1 overflow-hidden rounded bg-slate-100">
                  {ALL_EXECUTION_STATUSES.filter((s) => counts[s]).map((s) => (
                    <div
                      key={s}
                      className={STATUS_STYLES[s].dot}
                      style={{ width: `${((counts[s] || 0) / maxHour) * 100}%` }}
                      title={`${s}: ${counts[s]}`}
                    />
                  ))}
                </div>
                <span className="w-6 text-right font-mono text-xs text-slate-600">{total || ''}</span>
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap gap-1">
          {ALL_EXECUTION_STATUSES.filter((s) =>
            hourRows.some((r) => r.counts[s]),
          ).map((s) => (
            <StatusBadge key={s} status={s} />
          ))}
        </div>

        <Link
          href={`/executions?queue_id=${encodeURIComponent(queueFilter)}&day=${selectedDay}`}
          className="btn mt-4 w-full"
        >
          View executions →
        </Link>
      </aside>
    </div>
  );
}
