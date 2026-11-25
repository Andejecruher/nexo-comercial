'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/shared/utils';
import type { LucideIcon } from 'lucide-react';

interface CriticalAlertItem {
  title: string;
  description: string;
  value: number;
  icon: LucideIcon;
  tone: 'warning' | 'danger' | 'neutral';
}

interface CriticalAlertsProps {
  items: CriticalAlertItem[];
  loading: boolean;
  className?: string;
}

const numberFormatter = new Intl.NumberFormat('es-AR');

const toneStyles: Record<CriticalAlertItem['tone'], string> = {
  neutral: 'bg-muted text-muted-foreground',
  warning: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
  danger: 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300',
};

export function CriticalAlerts({ items, loading, className }: CriticalAlertsProps) {
  return (
    <section className={cn('rounded-2xl border border-border bg-card p-5 shadow-xs', className)}>
      <div className="mb-4">
        <h2 className="text-sm font-black text-foreground">Alertas críticas</h2>
        <p className="text-xs text-muted-foreground">Prioridades que requieren atención</p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={`alert-skeleton-${index}`} className="h-16 w-full" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div
              key={item.title}
              className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/30 px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-xl',
                    toneStyles[item.tone],
                  )}
                >
                  <item.icon className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-foreground">{item.title}</p>
                  <p className="text-xs text-muted-foreground">{item.description}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xl font-black text-foreground">
                  {numberFormatter.format(item.value)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
