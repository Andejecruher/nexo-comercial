'use client';

import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/shared/utils';
import { Pie, PieChart } from 'recharts';
import type { SlaMetrics } from '@/hooks/indicadores/useDashboardMetrics';

interface SLAChartProps {
  sla: SlaMetrics | undefined;
  loading: boolean;
  className?: string;
}

const percentFormatter = new Intl.NumberFormat('es-AR', {
  style: 'percent',
  maximumFractionDigits: 0,
});

export function SLAChart({ sla, loading, className }: SLAChartProps) {
  const data = [
    { name: 'Cumplidas', value: sla?.met ?? 0, key: 'met' },
    { name: 'Incumplidas', value: sla?.breached ?? 0, key: 'breached' },
  ];

  const compliance = sla?.complianceRate ?? 0;

  return (
    <section className={cn('rounded-2xl border border-border bg-card p-5 shadow-xs', className)}>
      <div className="mb-4">
        <h2 className="text-sm font-black text-foreground">Cumplimiento SLA</h2>
        <p className="text-xs text-muted-foreground">Primera respuesta &lt; 10 min</p>
      </div>

      {loading ? (
        <Skeleton className="h-[220px] w-full" />
      ) : data.every((item) => item.value === 0) ? (
        <div className="flex h-[220px] items-center justify-center rounded-xl border border-dashed border-border">
          <p className="text-xs text-muted-foreground">Sin datos de SLA para este rango.</p>
        </div>
      ) : (
        <div className="relative">
          <ChartContainer
            config={{
              met: { label: 'Cumplidas', color: 'var(--color-primary)' },
              breached: { label: 'Incumplidas', color: 'var(--color-destructive)' },
            }}
            className="h-[220px] max-md:aspect-auto max-md:w-full max-md:min-w-0"
          >
            <PieChart>
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    nameKey="name"
                    className="max-md:min-w-0 max-md:max-w-[calc(100vw-12rem)] max-md:whitespace-normal max-md:wrap-anywhere"
                  />
                }
              />
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius={60}
                outerRadius={88}
                paddingAngle={2}
              />
            </PieChart>
          </ChartContainer>
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">SLA</p>
              <p className="text-2xl font-black text-foreground">
                {percentFormatter.format(compliance)}
              </p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
