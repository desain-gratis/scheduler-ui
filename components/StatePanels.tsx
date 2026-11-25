import React from 'react';

/** Pulsing placeholder block. Give it the height of the content it stands in for. */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded bg-slate-200 ${className}`} />;
}

interface PanelProps {
  /** Tailwind min-height classes so the panel occupies the same space as the loaded content. */
  minHeight?: string;
  className?: string;
}

/** Section-level error with retry. Replaces the content in place (no layout shift). */
export function ErrorPanel({
  title = 'Something went wrong',
  message,
  onRetry,
  retrying,
  minHeight = 'min-h-[12rem]',
  className = '',
}: PanelProps & {
  title?: string;
  message: string;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  return (
    <div
      role="alert"
      className={`flex ${minHeight} flex-col items-center justify-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-6 text-center ${className}`}
    >
      <div className="text-sm font-semibold text-red-800">{title}</div>
      <p className="max-w-prose break-words text-sm text-red-700">{message}</p>
      {onRetry && (
        <button type="button" className="btn mt-1" onClick={onRetry} disabled={retrying}>
          {retrying ? 'Retrying…' : 'Retry'}
        </button>
      )}
    </div>
  );
}

/** "Nothing here" state. Only render after loading has finished successfully. */
export function EmptyPanel({
  message,
  minHeight = 'min-h-[12rem]',
  className = '',
  children,
}: PanelProps & { message: string; children?: React.ReactNode }) {
  return (
    <div
      className={`flex ${minHeight} flex-col items-center justify-center gap-2 px-4 py-6 text-center text-sm text-slate-500 ${className}`}
    >
      <p>{message}</p>
      {children}
    </div>
  );
}

/** Inline form/section error (role=alert). */
export function InlineError({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="break-words rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
    >
      {message}
    </div>
  );
}
