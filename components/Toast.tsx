import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

export type ToastKind = 'success' | 'error' | 'info';

export interface ToastInput {
  kind: ToastKind;
  title: string;
  message?: string;
}

interface ToastItem extends ToastInput {
  id: number;
}

interface ToastContextValue {
  notify: (t: ToastInput) => void;
}

const Ctx = createContext<ToastContextValue | null>(null);

const KIND_STYLES: Record<ToastKind, { box: string; icon: string; glyph: string }> = {
  success: { box: 'border-emerald-200 bg-emerald-50 text-emerald-900', icon: 'text-emerald-600', glyph: '✓' },
  error: { box: 'border-red-200 bg-red-50 text-red-900', icon: 'text-red-600', glyph: '!' },
  info: { box: 'border-sky-200 bg-sky-50 text-sky-900', icon: 'text-sky-600', glyph: 'i' },
};

// Successes disappear on their own; errors stay until dismissed.
const AUTO_DISMISS_MS: Partial<Record<ToastKind, number>> = { success: 6000, info: 6000 };

/**
 * Toasts are fixed-position overlays, so showing or hiding one never moves page content.
 * Bottom sheet-style on phones, top-right card from the sm breakpoint up.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setItems((cur) => cur.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const notify = useCallback(
    (t: ToastInput) => {
      const id = nextId.current++;
      setItems((cur) => [...cur.slice(-3), { ...t, id }]);
      const ms = AUTO_DISMISS_MS[t.kind];
      if (ms) timers.current.set(id, setTimeout(() => dismiss(id), ms));
    },
    [dismiss],
  );

  useEffect(() => {
    const current = timers.current;
    return () => current.forEach((timer) => clearTimeout(timer));
  }, []);

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col gap-2 p-3 sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-0 sm:w-96">
        {items.map((t) => {
          const s = KIND_STYLES[t.kind];
          return (
            <div
              key={t.id}
              role={t.kind === 'error' ? 'alert' : 'status'}
              className={`pointer-events-auto flex items-start gap-3 rounded-lg border p-3 shadow-lg ${s.box}`}
            >
              <span
                aria-hidden
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current text-xs font-bold ${s.icon}`}
              >
                {s.glyph}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">{t.title}</div>
                {t.message && <div className="mt-0.5 break-words text-sm">{t.message}</div>}
              </div>
              <button
                type="button"
                className="-m-1 px-2 py-1 text-lg leading-none opacity-60 hover:opacity-100"
                aria-label="Dismiss"
                onClick={() => dismiss(t.id)}
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useToast must be used inside <ToastProvider>');
  return v;
}
