import { STATUS_STYLES } from '@/lib/format';
import { ExecutionStatus } from '@/types/scheduler';

export default function StatusBadge({ status }: { status: ExecutionStatus | string }) {
  const style = STATUS_STYLES[status as ExecutionStatus] ?? {
    badge: 'bg-slate-100 text-slate-700 ring-slate-200',
    dot: 'bg-slate-400',
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${style.badge}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {status}
    </span>
  );
}
