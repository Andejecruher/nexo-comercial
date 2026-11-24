import { cn } from '@/lib/shared/utils';

export function TableStatusBadge({
  active,
  activeLabel = 'Activo',
  inactiveLabel = 'Inactivo',
  className,
}: {
  active: boolean;
  activeLabel?: string;
  inactiveLabel?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium',
        active
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
          : 'border-slate-200 bg-slate-100 text-slate-600',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn('size-1.5 rounded-full', active ? 'bg-emerald-500' : 'bg-slate-400')}
      />
      {active ? activeLabel : inactiveLabel}
    </span>
  );
}
