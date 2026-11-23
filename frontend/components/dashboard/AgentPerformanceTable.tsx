'use client';

import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { AgentPerformance } from '@/hooks/dashboard/useDashboardMetrics';

interface AgentPerformanceTableProps {
  agents: AgentPerformance[];
  loading: boolean;
  className?: string;
}

const numberFormatter = new Intl.NumberFormat('es-AR');

const formatMinutes = (minutes: number) => {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = Math.round(minutes % 60);
  return `${hours}h ${remainder}m`;
};

const formatPercent = (value: number) =>
  new Intl.NumberFormat('es-AR', { style: 'percent', maximumFractionDigits: 0 }).format(value);

export function AgentPerformanceTable({ agents, loading, className }: AgentPerformanceTableProps) {
  return (
    <section className={cn('rounded-2xl border border-border bg-card p-5 shadow-xs', className)}>
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h2 className="text-sm font-black text-foreground">Performance por agente</h2>
          <p className="text-xs text-muted-foreground">Tiempos promedio y cumplimiento SLA</p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={`agent-row-${index}`} className="h-8 w-full" />
          ))}
        </div>
      ) : agents.length === 0 ? (
        <div className="flex h-[200px] items-center justify-center rounded-xl border border-dashed border-border">
          <p className="text-xs text-muted-foreground">Sin métricas de agentes para este rango.</p>
        </div>
      ) : (
        <Table
          className="max-md:min-w-140"
          containerProps={{
            role: 'region',
            'aria-label': 'Performance por agente',
            tabIndex: 0,
          }}
        >
          <TableHeader>
            <TableRow>
              <TableHead>Agente</TableHead>
              <TableHead>Tickets</TableHead>
              <TableHead>Resp. prom.</TableHead>
              <TableHead>Resol. prom.</TableHead>
              <TableHead>SLA %</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {agents.map((agent) => {
              const sla = agent.slaCompliance;
              const slaVariant = sla >= 0.9 ? 'default' : sla >= 0.75 ? 'secondary' : 'destructive';

              return (
                <TableRow key={agent.agentId}>
                  <TableCell className="font-medium text-foreground max-md:max-w-48 max-md:whitespace-normal max-md:wrap-anywhere">
                    {agent.name}
                  </TableCell>
                  <TableCell>{numberFormatter.format(agent.ticketsHandled)}</TableCell>
                  <TableCell>{formatMinutes(agent.avgResponseTime)}</TableCell>
                  <TableCell>{formatMinutes(agent.avgResolutionTime)}</TableCell>
                  <TableCell>
                    <Badge variant={slaVariant}>{formatPercent(sla)}</Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
