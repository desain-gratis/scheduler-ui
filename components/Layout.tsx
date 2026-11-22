import Link from 'next/link';
import { useRouter } from 'next/router';
import React from 'react';
import { useScheduler } from '@/context/SchedulerContext';

const NAV = [
  { href: '/', label: 'Calendar' },
  { href: '/executions', label: 'Executions' },
  { href: '/recurring', label: 'Recurring tasks' },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const { pathname } = useRouter();
  const { baseUrl, namespace, timezone, setBaseUrl, setNamespace, setTimezone } = useScheduler();

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-end gap-x-6 gap-y-3 px-4 py-3">
          <div className="mr-2 flex items-center gap-2 self-center">
            <span className="text-lg font-bold tracking-tight">⏱ scheduler-ui</span>
          </div>

          <nav className="flex gap-1 self-center">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  isActive(n.href)
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {n.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex flex-wrap items-end gap-3">
            <div className="w-64">
              <label className="label">API base URL</label>
              <input
                className="input font-mono"
                defaultValue={baseUrl}
                key={baseUrl}
                onBlur={(e) => e.target.value !== baseUrl && setBaseUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              />
            </div>
            <div className="w-36">
              <label className="label">Namespace</label>
              <input
                className="input font-mono"
                defaultValue={namespace}
                key={namespace}
                onBlur={(e) => e.target.value !== namespace && setNamespace(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              />
            </div>
            <div className="w-44">
              <label className="label">Timezone</label>
              <input
                className="input font-mono"
                defaultValue={timezone}
                key={timezone}
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
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
