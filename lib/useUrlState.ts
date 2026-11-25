import { useRouter } from 'next/router';
import { useCallback, useRef } from 'react';

export type ParamValue = string | number | string[] | null | undefined;
export type ParamUpdates = Record<string, ParamValue>;

function isEmpty(v: ParamValue): boolean {
  return v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
}

function serialize(q: Record<string, string | string[] | undefined>): string {
  return Object.keys(q)
    .filter((k) => q[k] !== undefined)
    .sort()
    .map((k) => `${k}=${([] as string[]).concat(q[k] as string | string[]).join(',')}`)
    .join('&');
}

/**
 * URL query params as the single source of truth for page state.
 *
 * - `ready` is false until Next has parsed the URL (static export: router.query is empty before that).
 *   Wait for it before reading params or fetching data.
 * - `push` always PUSHES a history entry (shallow, no data-fetching re-run) so the browser Back
 *   button undoes the interaction. Empty values remove the param. Pushing a URL identical to the
 *   current one is skipped, so Back never lands on a duplicate entry.
 * - `open`/`close` handle detail views/modals: opening pushes a param; closing goes Back when the
 *   view was opened from inside the app (so no duplicate history entries), otherwise pushes the
 *   URL without the param.
 */
export function useUrlState() {
  const router = useRouter();
  const openedInApp = useRef<Set<string>>(new Set());

  const get = useCallback(
    (key: string): string => {
      const v = router.query[key];
      return Array.isArray(v) ? (v[0] ?? '') : (v ?? '');
    },
    [router.query],
  );

  const getAll = useCallback(
    (key: string): string[] => {
      const v = router.query[key];
      if (v === undefined) return [];
      return Array.isArray(v) ? v : [v];
    },
    [router.query],
  );

  const push = useCallback(
    (updates: ParamUpdates): Promise<boolean> => {
      const query: Record<string, string | string[]> = {};
      for (const [k, v] of Object.entries(router.query)) {
        if (v !== undefined) query[k] = v;
      }
      for (const [k, v] of Object.entries(updates)) {
        if (isEmpty(v)) delete query[k];
        else query[k] = Array.isArray(v) ? (v as string[]) : String(v);
      }
      if (serialize(query) === serialize(router.query)) return Promise.resolve(true);
      return router.push({ pathname: router.pathname, query }, undefined, { shallow: true });
    },
    [router],
  );

  const open = useCallback(
    (key: string, value: string) => {
      openedInApp.current.add(key);
      return push({ [key]: value });
    },
    [push],
  );

  const close = useCallback(
    (key: string) => {
      if (openedInApp.current.has(key)) {
        openedInApp.current.delete(key);
        router.back();
        return;
      }
      push({ [key]: null });
    },
    [push, router],
  );

  return { router, ready: router.isReady, get, getAll, push, open, close };
}
