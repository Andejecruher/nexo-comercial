'use client';

import { KPIBox } from '@/components/shared/KPIBox';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/shared/utils';
import type { LucideIcon } from 'lucide-react';

export interface KPIItem {
  label: string;
  value: number;
  helper?: string;
  icon?: LucideIcon;
  tone?: 'neutral' | 'positive' | 'warning' | 'danger';
}

interface KPIGridProps {
  items: KPIItem[];
  loading: boolean;
  className?: string;
}

export function KPIGrid({ items, loading, className }: KPIGridProps) {
  if (loading) {
    return (
      <div className={cn('grid grid-cols-2 gap-4 xl:grid-cols-5', className)}>
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={`kpi-skeleton-${index}`}
            className="rounded-2xl border border-border bg-card p-5"
          >
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-4 h-8 w-20" />
            <Skeleton className="mt-4 h-3 w-32" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={cn('grid grid-cols-2 gap-4 xl:grid-cols-5', className)}>
      {items.map((item) => (
        <KPIBox key={item.label} {...item} />
      ))}
    </div>
  );
}
