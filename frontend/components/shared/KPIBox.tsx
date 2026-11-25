'use client';

import { cn } from '@/lib/shared/utils';
import type { LucideIcon } from 'lucide-react';

type Tone = 'neutral' | 'positive' | 'warning' | 'danger';

const TONE_STYLES: Record<Tone, string> = {
  neutral: 'bg-muted text-muted-foreground',
  positive: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
  warning: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
  danger: 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300',
};

const numberFormatter = new Intl.NumberFormat('es-AR');

interface KPIBoxProps {
  label: string;
  value: number;
  helper?: string;
  icon?: LucideIcon;
  tone?: Tone;
  className?: string;
}

export function KPIBox({
  label,
  value,
  helper,
  icon: Icon,
  tone = 'neutral',
  className,
}: KPIBoxProps) {
  return (
    <div className={cn('rounded-2xl border border-border bg-card p-5 shadow-xs', className)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="mt-2 text-3xl font-black text-foreground">
            {numberFormatter.format(value)}
          </p>
        </div>
        {Icon ? (
          <span
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-xl',
              TONE_STYLES[tone],
            )}
          >
            <Icon className="h-5 w-5" />
          </span>
        ) : (
          <span className={cn('h-10 w-10 rounded-xl', TONE_STYLES[tone])} />
        )}
      </div>
      {helper ? <p className="mt-3 text-xs text-muted-foreground">{helper}</p> : <></>}
    </div>
  );
}
