import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ApiConfig } from '@/lib/api';
import { browserTimezone } from '@/lib/format';

interface SchedulerContextValue {
  baseUrl: string;
  namespace: string;
  timezone: string;
  ready: boolean;
  cfg: ApiConfig;
  setBaseUrl: (v: string) => void;
  setNamespace: (v: string) => void;
  setTimezone: (v: string) => void;
}

const DEFAULT_BASE = process.env.NEXT_PUBLIC_SCHEDULER_API || 'http://localhost:9100';
const DEFAULT_NS = process.env.NEXT_PUBLIC_DEFAULT_NAMESPACE || 'deployd';
const LS_KEY = 'scheduler-ui:settings';

const Ctx = createContext<SchedulerContextValue | null>(null);

export function SchedulerProvider({ children }: { children: React.ReactNode }) {
  const [baseUrl, setBaseUrlState] = useState(DEFAULT_BASE);
  const [namespace, setNamespaceState] = useState(DEFAULT_NS);
  const [timezone, setTimezoneState] = useState('UTC');
  const [ready, setReady] = useState(false);

  // Load persisted settings on the client only (static export => no SSR state).
  useEffect(() => {
    let tz = browserTimezone();
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s.baseUrl) setBaseUrlState(s.baseUrl);
        if (s.namespace) setNamespaceState(s.namespace);
        if (s.timezone) tz = s.timezone;
      }
    } catch {
      /* ignore corrupted storage */
    }
    setTimezoneState(tz);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ baseUrl, namespace, timezone }));
    } catch {
      /* storage unavailable */
    }
  }, [ready, baseUrl, namespace, timezone]);

  const setBaseUrl = useCallback((v: string) => setBaseUrlState(v.trim()), []);
  const setNamespace = useCallback((v: string) => setNamespaceState(v.trim()), []);
  const setTimezone = useCallback((v: string) => setTimezoneState(v.trim() || 'UTC'), []);

  const value = useMemo<SchedulerContextValue>(
    () => ({
      baseUrl,
      namespace,
      timezone,
      ready,
      cfg: { baseUrl, namespace },
      setBaseUrl,
      setNamespace,
      setTimezone,
    }),
    [baseUrl, namespace, timezone, ready, setBaseUrl, setNamespace, setTimezone],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useScheduler(): SchedulerContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useScheduler must be used inside <SchedulerProvider>');
  return v;
}
