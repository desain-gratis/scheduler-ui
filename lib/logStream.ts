import { ApiConfig, ApiError, isAbortError } from '@/lib/api';
import { LogEntry } from '@/types/scheduler';

/**
 * A task's `log_url` points at the (future) full-log endpoint, e.g.
 *   http://tc-sg1:9100/task/log?queue_id=longRunning()&task_id=<id>
 * Today only live tailing exists, at `<log_url path>/tail`. Protocol, host and query are kept as is.
 * Returns null when the value is not a usable http(s) URL.
 */
export function tailUrlFromLogUrl(logUrl: string | undefined | null): string | null {
  if (!logUrl) return null;
  let u: URL;
  try {
    u = new URL(logUrl);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  const path = u.pathname.replace(/\/+$/, '');
  if (!path.endsWith('/tail')) u.pathname = `${path}/tail`;
  return u.toString();
}

/** True when the browser would block the request: an https page cannot read an http stream. */
export function isMixedContent(url: string): boolean {
  return typeof window !== 'undefined' && window.location.protocol === 'https:' && url.startsWith('http:');
}

const KNOWN = new Set(['time', 'level', 'msg', 'task_id', 'queue_id']);

/** Parse one NDJSON line. A line that is not JSON is kept (as raw text) instead of being lost. */
export function parseLogLine(line: string, seq: number): LogEntry {
  try {
    const o = JSON.parse(line);
    if (o && typeof o === 'object' && !Array.isArray(o)) {
      const extra: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(o)) if (!KNOWN.has(k)) extra[k] = v;
      return {
        seq,
        time: typeof o.time === 'string' ? o.time : '',
        level: typeof o.level === 'string' ? o.level : '',
        msg: typeof o.msg === 'string' ? o.msg : JSON.stringify(o.msg ?? ''),
        task_id: o.task_id,
        queue_id: o.queue_id,
        extra: Object.keys(extra).length ? extra : undefined,
      };
    }
  } catch {
    /* fall through */
  }
  return { seq, time: '', level: '', msg: line, unparsed: true };
}

export interface StreamHandlers {
  /** Called once the server accepted the request and the stream is open. */
  onOpen: () => void;
  /** Called with every batch of complete lines received (in order). */
  onLines: (lines: string[]) => void;
}

/**
 * Streams a newline-delimited text response. Resolves when the server closes the stream, rejects
 * with ApiError on failure, and rejects with an AbortError when `signal` is aborted.
 */
export async function streamLines(
  cfg: ApiConfig,
  url: string,
  signal: AbortSignal,
  h: StreamHandlers,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { 'X-Namespace': cfg.namespace }, signal });
  } catch (e) {
    if (isAbortError(e)) throw e;
    throw new ApiError(
      0,
      isMixedContent(url)
        ? `Your browser blocks this page (https) from reading ${new URL(url).origin} (http). Open the UI over http, or serve the log endpoint over https.`
        : `Could not reach ${new URL(url).origin}. Check that the node is up, reachable from this device, and allows requests from this site (CORS).`,
    );
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let msg = text;
    try {
      const parsed = JSON.parse(text);
      if (parsed?.error) msg = typeof parsed.error === 'string' ? parsed.error : JSON.stringify(parsed.error);
    } catch {
      /* plain text */
    }
    throw new ApiError(res.status, msg || res.statusText || 'No details provided');
  }
  if (!res.body) throw new ApiError(res.status, 'This browser cannot read streaming responses.');

  h.onOpen();
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split('\n');
      buf = parts.pop() ?? '';
      const lines = parts.map((l) => l.trim()).filter(Boolean);
      if (lines.length) h.onLines(lines);
    }
    buf += decoder.decode();
    if (buf.trim()) h.onLines([buf.trim()]);
  } catch (e) {
    if (isAbortError(e)) throw e;
    throw new ApiError(0, 'The connection was lost while streaming the log.');
  }
}
