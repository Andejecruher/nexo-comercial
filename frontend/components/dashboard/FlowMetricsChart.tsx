'use client';

import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from 'recharts';
import type { FlowMetrics } from '@/hooks/dashboard/useDashboardMetrics';

interface FlowMetricsChartProps {
  flow: FlowMetrics | undefined;
  loading: boolean;
  className?: string;
}

export function FlowMetricsChart({ flow, loading, className }: FlowMetricsChartProps) {
  const data = [
    { name: 'Bot', value: flow?.botFlow ?? 0, key: 'bot' },
    { name: 'Humano', value: flow?.humanFlow ?? 0, key: 'human' },
    { name: 'Escalado', value: flow?.escalated ?? 0, key: 'escalated' },
  ];

  return (
    <section className={cn('rounded-2xl border border-border bg-card p-5 shadow-xs', className)}>
      <div className="mb-4">
        <h2 className="text-sm font-black text-foreground">Flujo operativo</h2>
        <p className="text-xs text-muted-foreground">Bot vs humano vs escalado</p>
      </div>

      {loading ? (
        <Skeleton className="h-[220px] w-full" />
      ) : data.every((item) => item.value === 0) ? (
        <div className="flex h-[220px] items-center justify-center rounded-xl border border-dashed border-border">
          <p className="text-xs text-muted-foreground">Sin eventos de flujo registrados.</p>
        </div>
      ) : (
        <ChartContainer
          config={{
            bot: { label: 'Bot', color: 'var(--color-secondary)' },
            human: { label: 'Humano', color: 'var(--color-primary)' },
            escalated: { label: 'Escalado', color: 'var(--color-accent)' },
          }}
          className="h-[220px] max-md:aspect-auto max-md:w-full max-md:min-w-0"
        >
          <BarChart data={data} margin={{ left: 8, right: 8 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  nameKey="name"
                  className="max-md:min-w-0 max-md:max-w-[calc(100vw-12rem)] max-md:whitespace-normal max-md:wrap-anywhere"
                />
              }
            />
            <Bar dataKey="value" radius={[6, 6, 0, 0]}>
              {data.map((entry) => (
                <Cell key={`flow-${entry.key}`} fill={`var(--color-${entry.key})`} />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      )}
    </section>
  );
}
