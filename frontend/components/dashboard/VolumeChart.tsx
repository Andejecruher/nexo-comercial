'use client';

import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import type { DailyVolume } from '@/hooks/dashboard/useDashboardMetrics';

interface VolumeChartProps {
  data: DailyVolume[];
  loading: boolean;
  className?: string;
}

const formatLabel = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short' }).format(date);
};

export function VolumeChart({ data, loading, className }: VolumeChartProps) {
  return (
    <section className={cn('rounded-2xl border border-border bg-card p-5 shadow-xs', className)}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-black text-foreground">Volumen diario</h2>
          <p className="text-xs text-muted-foreground">Tickets abiertos vs cerrados</p>
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-[220px] w-full" />
      ) : data.length === 0 ? (
        <div className="flex h-[220px] items-center justify-center rounded-xl border border-dashed border-border">
          <p className="text-xs text-muted-foreground">No hay volumen registrado para el rango.</p>
        </div>
      ) : (
        <ChartContainer
          config={{
            opened: { label: 'Abiertos', color: 'var(--color-primary)' },
            closed: { label: 'Cerrados', color: 'var(--color-accent)' },
          }}
          className="h-[220px] max-md:aspect-auto max-md:w-full max-md:min-w-0"
        >
          <AreaChart data={data} margin={{ left: 12, right: 12 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={formatLabel}
              tick={{ fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <ChartTooltip
              cursor={{ fill: 'var(--color-muted)' }}
              content={
                <ChartTooltipContent className="max-md:min-w-0 max-md:max-w-[calc(100vw-12rem)] max-md:whitespace-normal max-md:wrap-anywhere" />
              }
            />
            <Area
              type="monotone"
              dataKey="opened"
              stroke="var(--color-opened)"
              fill="var(--color-opened)"
              fillOpacity={0.18}
              strokeWidth={2.4}
            />
            <Area
              type="monotone"
              dataKey="closed"
              stroke="var(--color-closed)"
              fill="var(--color-closed)"
              fillOpacity={0.12}
              strokeWidth={2.4}
            />
          </AreaChart>
        </ChartContainer>
      )}
    </section>
  );
}
