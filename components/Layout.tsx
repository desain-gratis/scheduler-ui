import Link from 'next/link';
import { useRouter } from 'next/router';
import React, { useEffect, useState } from 'react';
import { useScheduler } from '@/context/SchedulerContext';

const NAV = [
  { href: '/', label: 'Calendar' },
  { href: '/executions', label: 'Executions' },
  { href: '/recurring', label: 'Recurring' },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const { pathname } = useRouter();
  const { baseUrl, namespace, timezone, setBaseUrl, setNamespace, setTimezone } = useScheduler();
  // On small screens the connection settings are collapsed behind a toggle.
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => setShowSettings(false), [pathname]);

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-3 py-2 sm:px-4 sm:py-3">
          <div className="flex flex-1 items-center justify-between gap-2 md:flex-none">
            <span className="text-lg font-bold tracking-tight">⏱ scheduler-ui</span>
            <button
              type="button"
              className="btn max-w-[11rem] md:hidden"
              aria-expanded={showSettings}
              onClick={() => setShowSettings((v) => !v)}
            >
              <span className="truncate font-mono text-xs">{namespace || 'settings'}</span>
              <span aria-hidden>⚙</span>
            </button>
          </div>

          <nav className="-mx-1 order-last flex w-full gap-1 overflow-x-auto md:order-none md:mx-0 md:w-auto">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={`flex-1 whitespace-nowrap rounded-md px-3 py-2 text-center text-sm font-medium md:flex-none md:py-1.5 ${
                  isActive(n.href)
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {n.label}
              </Link>
            ))}
          </nav>

          <div
            className={`${
              showSettings ? 'grid' : 'hidden'
            } w-full grid-cols-1 gap-3 pb-1 sm:grid-cols-3 md:ml-auto md:flex md:w-auto md:flex-wrap md:items-end`}
          >
            <div className="md:w-64">
              <label className="label">API base URL</label>
              <input
                className="input font-mono"
                defaultValue={baseUrl}
                key={baseUrl}
                inputMode="url"
                autoCapitalize="off"
                autoCorrect="off"
                onBlur={(e) => e.target.value !== baseUrl && setBaseUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              />
            </div>
            <div className="md:w-36">
              <label className="label">Namespace</label>
              <input
                className="input font-mono"
                defaultValue={namespace}
                key={namespace}
                autoCapitalize="off"
                autoCorrect="off"
                onBlur={(e) => e.target.value !== namespace && setNamespace(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              />
            </div>
            <div className="md:w-44">
              <label className="label">Timezone</label>
              <input
                className="input font-mono"
                defaultValue={timezone}
                key={timezone}
                autoCapitalize="off"
                autoCorrect="off"
                onBlur={(e) => e.target.value !== timezone && setTimezone(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              />
            </div>
          </div>
        </div>
        {namespace === '*' && (
          <div className="border-t border-amber-200 bg-amber-50 px-4 py-1.5 text-center text-xs text-amber-800">
            Namespace “*” is currently broken on the server — use a real namespace.
          </div>
        )}
      </header>
      <main className="mx-auto max-w-7xl px-3 py-4 sm:px-4 sm:py-6">{children}</main>
    </div>
  );
}
