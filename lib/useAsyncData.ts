import { useCallback, useEffect, useRef, useState } from 'react';
import { describeError, isAbortError } from '@/lib/api';

export type LoadState = 'loading' | 'ok' | 'error';

interface Result<T> {
  /** The fetcher this result belongs to. */
  fetcher: unknown;
  data: T;
  state: LoadState;
  error: string;
}

/**
 * Loads data asynchronously and never blocks rendering.
 *
 * - `fetcher` must be memoised (useCallback) with everything it depends on (URL params, API config…).
 *   When it changes the previous request is aborted and a new one starts, so a late response can
 *   never overwrite a newer one.
 * - `enabled` is false until URL params / settings are ready.
 * - `state` is 'loading' in the very same render in which the fetcher changes (not one effect
 *   later), so callers never mistake data of the previous query for the new one.
 * - While reloading, the previous `data` is kept so the UI can dim it instead of collapsing.
 * - `initial` should be a stable constant (e.g. a module-level empty array).
 */
export function useAsyncData<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  enabled: boolean,
  initial: T,
) {
  const [result, setResult] = useState<Result<T>>({
    fetcher: null,
    data: initial,
    state: 'loading',
    error: '',
  });
  const [token, setToken] = useState(0);
  const initialRef = useRef(initial);

  useEffect(() => {
    if (!enabled) return;
    const ac = new AbortController();
    setResult((r) => ({ ...r, fetcher, state: 'loading', error: '' }));
    fetcher(ac.signal)
      .then((data) => {
        if (ac.signal.aborted) return;
        setResult({ fetcher, data, state: 'ok', error: '' });
      })
      .catch((e) => {
        if (ac.signal.aborted || isAbortError(e)) return;
        setResult({ fetcher, data: initialRef.current, state: 'error', error: describeError(e) });
      });
    return () => ac.abort();
  }, [fetcher, enabled, token]);

  const reload = useCallback(() => setToken((n) => n + 1), []);

  const current = enabled && result.fetcher === fetcher;
  return {
    data: result.data,
    state: current ? result.state : ('loading' as LoadState),
    error: current ? result.error : '',
    reload,
  };
}
