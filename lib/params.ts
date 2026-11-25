import { pad } from '@/lib/format';

/** Parse a positive integer URL param, falling back when missing or invalid. */
export function parsePositiveInt(v: string, fallback: number): number {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 1 ? n : fallback;
}

/** True for a real calendar date written as YYYY-MM-DD. */
export function isValidYmd(v: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < 1900) return false;
  const dt = new Date(y, mo - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d;
}

/** "2026-11" => first day of that month (local), or null when invalid. */
export function parseMonthParam(v: string): Date | null {
  const m = /^(\d{4})-(\d{2})$/.exec(v);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (y < 1900 || mo < 1 || mo > 12) return null;
  return new Date(y, mo - 1, 1);
}

/** First day of a month => "2026-11". */
export function monthParam(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
