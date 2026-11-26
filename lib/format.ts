import { ExecutionStatus } from '@/types/scheduler';

export const STATUS_STYLES: Record<ExecutionStatus, { badge: string; dot: string }> = {
  PENDING: { badge: 'bg-amber-100 text-amber-800 ring-amber-200', dot: 'bg-amber-400' },
  IN_PROGRESS: { badge: 'bg-sky-100 text-sky-800 ring-sky-200', dot: 'bg-sky-500' },
  SUCCEED: { badge: 'bg-emerald-100 text-emerald-800 ring-emerald-200', dot: 'bg-emerald-500' },
  FAILED: { badge: 'bg-red-100 text-red-800 ring-red-200', dot: 'bg-red-500' },
  TIMEOUT: { badge: 'bg-orange-100 text-orange-800 ring-orange-200', dot: 'bg-orange-500' },
  INTERRUPTED: { badge: 'bg-purple-100 text-purple-800 ring-purple-200', dot: 'bg-purple-500' },
  MISSED: { badge: 'bg-rose-100 text-rose-800 ring-rose-200', dot: 'bg-rose-400' },
  CANCELLED: { badge: 'bg-slate-200 text-slate-700 ring-slate-300', dot: 'bg-slate-400' },
};

/**
 * Date and time in the viewer's default locale. `weekday: true` adds the short day of week
 * (e.g. "Sun"), so weekends and weekdays are easy to tell apart.
 */
export function fmtDateTime(
  iso?: string | null,
  timeZone?: string,
  opts: { weekday?: boolean } = {},
): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    ...(opts.weekday ? { weekday: 'short' as const } : {}),
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone,
  });
}

export function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** YYYY-MM-DD from local date parts (no UTC shifting). */
export function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** RFC3339 timestamp of "now" using the browser's local UTC offset (e.g. 2026-10-08T15:04:05+07:00). */
export function nowRFC3339WithOffset(): string {
  const d = new Date();
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}

export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function prettyJson(v: unknown): string {
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}
