'use client';

import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/shared/utils';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import type { DepartmentDistribution } from '@/hooks/indicadores/useDashboardMetrics';

interface DepartmentDistributionChartProps {
  departments: DepartmentDistribution[];
  loading: boolean;
  className?: string;
}

const sliceDepartments = (items: DepartmentDistribution[]) => {
  if (items.length <= 6) return items;
  const top = items.slice(0, 6);
  const rest = items.slice(6).reduce((acc, item) => acc + item.count, 0);
  return [...top, { department: 'Otros', count: rest }];
};

export function DepartmentDistributionChart({
  departments,
  loading,
  className,
}: DepartmentDistributionChartProps) {
  const data = sliceDepartments(departments);

  return (
    <section className={cn('rounded-2xl border border-border bg-card p-5 shadow-xs', className)}>
      <div className="mb-4">
        <h2 className="text-sm font-black text-foreground">Distribución por departamento</h2>
        <p className="text-xs text-muted-foreground">Tickets agrupados por área</p>
      </div>

      {loading ? (
        <Skeleton className="h-[220px] w-full" />
      ) : data.length === 0 ? (
        <div className="flex h-[220px] items-center justify-center rounded-xl border border-dashed border-border">
          <p className="text-xs text-muted-foreground">Sin distribución disponible.</p>
        </div>
      ) : (
        <ChartContainer
          config={{
            count: { label: 'Tickets', color: 'var(--color-primary)' },
          }}
          className="h-[220px] max-md:aspect-auto max-md:w-full max-md:min-w-0"
        >
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis
              dataKey="department"
              type="category"
              tick={{ fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={90}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  nameKey="department"
                  className="max-md:min-w-0 max-md:max-w-[calc(100vw-12rem)] max-md:whitespace-normal max-md:wrap-anywhere"
                />
              }
            />
            <Bar dataKey="count" radius={[0, 6, 6, 0]} fill="var(--color-count)" />
          </BarChart>
        </ChartContainer>
      )}
    </section>
  );
}
