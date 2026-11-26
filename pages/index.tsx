import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ErrorPanel, Skeleton } from '@/components/StatePanels';
import StatusBadge from '@/components/StatusBadge';
import { useScheduler } from '@/context/SchedulerContext';
import { getDailyCount, getHourlyCount } from '@/lib/api';
import { pad, STATUS_STYLES, ymd } from '@/lib/format';
import { isValidYmd, monthParam, parseMonthParam } from '@/lib/params';
import { useAsyncData } from '@/lib/useAsyncData';
import { useUrlState } from '@/lib/useUrlState';
import { ALL_EXECUTION_STATUSES, DailyCount, ExecutionStatus, HourlyCount } from '@/types/scheduler';

/**
 * URL params (all optional): month (YYYY-MM), day (YYYY-MM-DD), queue_id.
 * Defaults to the current month / today.
 */

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const EMPTY_DAILY: DailyCount[] = [];
const EMPTY_HOURLY: HourlyCount[] = [];
/** Desktop day cells have a fixed height, so at most this many status lines are listed. */
const MAX_LINES = 3;

type StatusCounts = Partial<Record<ExecutionStatus, number>>;

function sum(c: StatusCounts): number {
  return Object.values(c).reduce((a, b) => a + (b || 0), 0);
}

export default function CalendarPage() {
  const { cfg, timezone, ready: settingsReady } = useScheduler();
  const { get, push, ready: urlReady } = useUrlState();
  const ready = settingsReady && urlReady;
  // On phones the day detail sits below the calendar; scroll to it when a day is picked.
  const detailRef = useRef<HTMLElement>(null);

  // ---- state that lives in the URL ----
  const monthStr = get('month');
  const month = useMemo(() => {
    const now = new Date();
    return parseMonthParam(monthStr) ?? new Date(now.getFullYear(), now.getMonth(), 1);
  }, [monthStr]);
  const dayStr = get('day');
  const queueFilter = get('queue_id');
  const todayStr = ymd(new Date());
  const selectedDay = isValidYmd(dayStr) ? dayStr : todayStr;

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

  // ---- data: loaded asynchronously once the URL has been read ----
  const fetchDaily = useCallback(
    (signal: AbortSignal) =>
      getDailyCount(
        cfg,
        {
          timezone,
          start_date: rangeStart,
          end_date: rangeEnd,
          queue_id: queueFilter || undefined,
        },
        { signal },
      ),
    [cfg, timezone, rangeStart, rangeEnd, queueFilter],
  );
  const {
    data: daily,
    state: dailyState,
    error: dailyError,
    reload: reloadDaily,
  } = useAsyncData(fetchDaily, ready, EMPTY_DAILY);

  const fetchHourly = useCallback(
    (signal: AbortSignal) =>
      getHourlyCount(
        cfg,
        {
          timezone,
          start_date: selectedDay,
          end_date: selectedDay,
          queue_id: queueFilter || undefined,
        },
        { signal },
      ),
    [cfg, timezone, selectedDay, queueFilter],
  );
  const {
    data: hourly,
    state: hourlyState,
    error: hourlyError,
    reload: reloadHourly,
  } = useAsyncData(fetchHourly, ready, EMPTY_HOURLY);

  // Remember every queue seen so the filter can switch between queues even while one is selected.
  const [knownQueues, setKnownQueues] = useState<string[]>([]);
  useEffect(() => {
    if (dailyState !== 'ok') return;
    setKnownQueues((cur) => {
      const s = new Set(cur);
      daily.forEach((d) => s.add(d.queue_id));
      return s.size === cur.length ? cur : Array.from(s).sort();
    });
  }, [dailyState, daily]);

  const queueOptions = useMemo(() => {
    const s = new Set(knownQueues);
    if (queueFilter) s.add(queueFilter);
    return Array.from(s).sort();
  }, [knownQueues, queueFilter]);

  const byDay = useMemo(() => {
    const m = new Map<string, StatusCounts>();
    for (const r of daily) {
      const c = m.get(r.day) ?? {};
      c[r.status] = (c[r.status] || 0) + r.count;
      m.set(r.day, c);
    }
    return m;
  }, [daily]);

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

  const executionsHref = useMemo(() => {
    const p = new URLSearchParams();
    if (queueFilter) p.set('queue_id', queueFilter);
    p.set('day', selectedDay);
    return `/executions?${p.toString()}`;
  }, [queueFilter, selectedDay]);

  // ---- URL-changing actions (each pushes a history entry) ----
  const shiftMonth = (delta: number) =>
    push({ month: monthParam(new Date(month.getFullYear(), month.getMonth() + delta, 1)) });

  const selectDay = (key: string) => {
    push({ day: key });
    if (window.innerWidth < 1024) {
      detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const reloadAll = () => {
    reloadDaily();
    reloadHourly();
  };

  // Placeholder with the final layout/size until settings and URL are ready: no jump on first paint.
  if (!ready) {
    return (
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-6" aria-busy="true">
        <Skeleton className="h-[34rem] sm:h-[42rem]" />
        <Skeleton className="h-[40rem]" />
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-6">
      <section className="card p-2 sm:p-4" aria-busy={dailyState === 'loading'}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button className="btn" onClick={() => shiftMonth(-1)} aria-label="Previous month">
            ←
          </button>
          <h1 className="min-w-0 flex-1 text-center text-lg font-semibold sm:min-w-[9rem] sm:flex-none">
            {month.toLocaleString(undefined, { month: 'long', year: 'numeric' })}
          </h1>
          <button className="btn" onClick={() => shiftMonth(1)} aria-label="Next month">
            →
          </button>
          <button className="btn" onClick={() => push({ month: null, day: null })}>
            Today
          </button>

          <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
            <select
              className="input min-w-0 flex-1 sm:w-52 sm:flex-none"
              value={queueFilter}
              aria-label="Queue"
              onChange={(e) => push({ queue_id: e.target.value })}
            >
              <option value="">All queues</option>
              {queueOptions.map((q) => (
                <option key={q} value={q}>
                  {q}
                </option>
              ))}
            </select>
            <button
              className="btn min-w-[5.5rem]"
              onClick={reloadAll}
              disabled={dailyState === 'loading' || hourlyState === 'loading'}
            >
              {dailyState === 'loading' || hourlyState === 'loading' ? 'Loading…' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* The grid is always rendered (its shape only depends on the URL), so loading and errors never move it. */}
        <div className="relative">
          <div className="grid grid-cols-7 gap-px overflow-hidden rounded-md border border-slate-200 bg-slate-200">
            {WEEKDAYS.map((w) => (
              <div
                key={w}
                className="bg-slate-100 px-2 py-1 text-center text-xs font-semibold text-slate-500"
              >
                {w}
              </div>
            ))}
            {cells.map((d) => {
              const key = ymd(d);
              const counts = byDay.get(key) ?? {};
              const total = sum(counts);
              const inMonth = d.getMonth() === month.getMonth();
              const selected = key === selectedDay;
              const present = ALL_EXECUTION_STATUSES.filter((s) => counts[s]);
              const shown = present.slice(0, MAX_LINES);
              const extra = present.length - shown.length;
              return (
                <button
                  key={key}
                  onClick={() => selectDay(key)}
                  aria-pressed={selected}
                  className={`flex h-[3.75rem] flex-col items-stretch gap-1 overflow-hidden bg-white p-1 text-left transition hover:bg-indigo-50 sm:h-[5.5rem] sm:p-1.5 ${
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
                    {dailyState !== 'loading' && total > 0 && (
                      <span className="text-[10px] font-medium text-slate-500 sm:font-normal sm:text-slate-400">
                        {total}
                      </span>
                    )}
                  </div>
                  {dailyState === 'loading' ? (
                    <span aria-hidden className="h-2 w-6 animate-pulse rounded bg-slate-200" />
                  ) : (
                    <>
                      {/* Phones: just coloured dots per status; the count is in the corner */}
                      <div className="flex flex-wrap gap-0.5 sm:hidden">
                        {present.map((s) => (
                          <span
                            key={s}
                            className={`h-2 w-2 rounded-full ${STATUS_STYLES[s].dot}`}
                          />
                        ))}
                      </div>
                      <div className="hidden flex-col gap-0.5 sm:flex">
                        {shown.map((s) => (
                          <div key={s} className="flex items-center gap-1 text-[11px] leading-tight">
                            <span
                              className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_STYLES[s].dot}`}
                            />
                            <span className="truncate">
                              {counts[s]} {s.toLowerCase().replace('_', ' ')}
                            </span>
                          </div>
                        ))}
                        {extra > 0 && (
                          <div className="text-[11px] leading-tight text-slate-500">
                            +{extra} more
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </button>
              );
            })}
          </div>

          {dailyState === 'error' && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/90 p-3">
              <ErrorPanel
                className="w-full max-w-md"
                minHeight="min-h-0"
                title="Could not load the calendar"
                message={dailyError}
                onRetry={reloadDaily}
              />
            </div>
          )}
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

      <aside
        ref={detailRef}
        className="card h-fit scroll-mt-28 p-3 sm:p-4 lg:scroll-mt-4"
        aria-busy={hourlyState === 'loading'}
      >
        <div className="mb-1 flex items-baseline justify-between">
          <h2 className="text-base font-semibold">{selectedDay}</h2>
          <span className="text-xs text-slate-500">{timezone}</span>
        </div>
        <p className="mb-3 text-xs text-slate-500">
          Hourly breakdown — each bar shows the status mix of that hour; the number is its total.
        </p>

        {/* 24 fixed-height rows are always rendered; only their fill changes. */}
        <div className="relative">
          <div className="space-y-1">
            {hourRows.map(({ hour, counts }) => {
              const total = sum(counts);
              return (
                <div key={hour} className="flex items-center gap-2">
                  <span className="w-9 shrink-0 font-mono text-xs text-slate-500">
                    {pad(hour)}:00
                  </span>
                  <div
                    className={`flex h-4 flex-1 overflow-hidden rounded ${
                      hourlyState === 'loading' ? 'animate-pulse bg-slate-200' : 'bg-slate-100'
                    }`}
                  >
                    {hourlyState === 'ok' &&
                      ALL_EXECUTION_STATUSES.filter((s) => counts[s]).map((s) => (
                        <div
                          key={s}
                          className={STATUS_STYLES[s].dot}
                          // Every hour's bar is full width, split by each status's share of that hour.
                          style={{ flexGrow: counts[s] || 0, flexBasis: 0 }}
                          title={`${s}: ${counts[s]} (${Math.round(((counts[s] || 0) / total) * 100)}%)`}
                        />
                      ))}
                  </div>
                  <span className="w-6 text-right font-mono text-xs text-slate-600">
                    {hourlyState === 'ok' ? total || '' : ''}
                  </span>
                </div>
              );
            })}
          </div>

          {hourlyState === 'error' && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/90 p-2">
              <ErrorPanel
                className="w-full"
                minHeight="min-h-0"
                title="Could not load the hourly breakdown"
                message={hourlyError}
                onRetry={reloadHourly}
              />
            </div>
          )}
        </div>

        <div className="mt-4 flex min-h-[1.75rem] flex-wrap gap-1">
          {hourlyState === 'ok' &&
            ALL_EXECUTION_STATUSES.filter((s) => hourRows.some((r) => r.counts[s])).map((s) => (
              <StatusBadge key={s} status={s} />
            ))}
        </div>

        <Link href={executionsHref} className="btn mt-4 w-full">
          View executions →
        </Link>
      </aside>
    </div>
  );
}
