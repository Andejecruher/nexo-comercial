'use client';

import { AgentPerformanceTable } from '@/components/indicadores/AgentPerformanceTable';
import { CriticalAlerts } from '@/components/indicadores/CriticalAlerts';
import { DashboardFilters } from '@/components/indicadores/DashboardFilters';
import { DepartmentDistributionChart } from '@/components/indicadores/DepartmentDistributionChart';
import { FlowMetricsChart } from '@/components/indicadores/FlowMetricsChart';
import { KPIGrid, type KPIItem } from '@/components/shared/KPIGrid';
import { SLAChart } from '@/components/indicadores/SLAChart';
import { VolumeChart } from '@/components/indicadores/VolumeChart';
import { Button } from '@/components/ui/button';
import { useDashboardMetrics } from '@/hooks/indicadores/useDashboardMetrics';
import { useDepartments } from '@/hooks/shared/useDepartments';
import { adminUsersApi, type PanelUserDto } from '@/lib/shared/admin-users-api';
import { cn } from '@/lib/shared/utils';
import {
  AlarmClock,
  AlertTriangle,
  Inbox,
  RefreshCcw,
  ShieldCheck,
  Timer,
  Workflow,
  Wrench,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import styles from '@/components/indicadores/dashboard-view-atencion.module.css';

const numberFormatter = new Intl.NumberFormat('es-AR');

const formatTimestamp = (value: string | undefined) => {
  if (!value) return 'Sin sincronizar';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sin sincronizar';
  return new Intl.DateTimeFormat('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: 'short',
  }).format(date);
};

const formatMinutes = (minutes: number) => {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = Math.round(minutes % 60);
  return `${hours}h ${remainder}m`;
};

export function DashboardViewAtencion() {
  const {
    metrics,
    agents,
    departments,
    loading,
    error,
    filters,
    isEmpty,
    lastUpdated,
    pollingEnabled,
    setPollingEnabled,
    setFrom,
    setTo,
    setDepartment,
    setAgent,
    clearFilters,
    refresh,
  } = useDashboardMetrics();

  const { departments: catalogDepartments, loading: loadingDepartments } = useDepartments({
    autoFetch: true,
    pageSize: 100,
  });

  const [panelUsers, setPanelUsers] = useState<PanelUserDto[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(false);

  useEffect(() => {
    let active = true;

    const fetchAgents = async () => {
      setLoadingAgents(true);
      const result = await adminUsersApi.list();
      if (!active) return;
      if (result.ok) setPanelUsers(result.data.users);
      else setPanelUsers([]);
      setLoadingAgents(false);
    };

    void fetchAgents();
    return () => {
      active = false;
    };
  }, []);

  const kpiItems = useMemo<KPIItem[]>(() => {
    const kpis = metrics?.kpis;
    const timings = metrics?.timings;

    return [
      {
        label: 'Nuevos reportes',
        value: kpis?.openTickets ?? 0,
        helper: 'En cola de atención ciudadana',
        icon: Inbox,
        tone: 'warning',
      },
      {
        label: 'En gestión',
        value: kpis?.inProgressTickets ?? 0,
        helper: 'Casos activos con responsable asignado',
        icon: Workflow,
        tone: 'neutral',
      },
      {
        label: 'Canalizados',
        value: kpis?.resolvedTickets ?? 0,
        helper: `Tiempo medio de canalización ${formatMinutes(timings?.avgResolutionTime ?? 0)}`,
        icon: Wrench,
        tone: 'positive',
      },
      {
        label: 'Casos resueltos',
        value: kpis?.closedTickets ?? 0,
        helper: `1° respuesta ${formatMinutes(timings?.avgFirstResponseTime ?? 0)}`,
        icon: ShieldCheck,
        tone: 'neutral',
      },
      {
        label: 'SLA vencido',
        value: kpis?.slaBreachedTickets ?? 0,
        helper: 'Fuera del tiempo objetivo',
        icon: Timer,
        tone: 'danger',
      },
    ];
  }, [metrics]);

  const alerts = useMemo(() => {
    const kpis = metrics?.kpis;
    const backlog = (kpis?.openTickets ?? 0) + (kpis?.inProgressTickets ?? 0);

    return [
      {
        title: 'Reportes urgentes',
        description: 'Casos sin cerrar que requieren acción',
        value: kpis?.openTickets ?? 0,
        icon: AlarmClock,
        tone: 'warning' as const,
      },
      {
        title: 'SLA incumplido',
        description: 'Casos fuera del tiempo objetivo',
        value: kpis?.slaBreachedTickets ?? 0,
        icon: AlertTriangle,
        tone: 'danger' as const,
      },
      {
        title: 'Carga operativa alta',
        description: 'Nuevos reportes + en gestión',
        value: backlog,
        icon: Inbox,
        tone: backlog > 150 ? ('danger' as const) : ('neutral' as const),
      },
    ];
  }, [metrics]);

  const agentOptions = useMemo(
    () =>
      panelUsers.map((user) => ({
        id: user.id,
        name: user.fullName || user.email,
      })),
    [panelUsers],
  );

  return (
    <div className={cn('h-full min-w-0 max-w-full overflow-y-auto', styles.indicators)}>
      <div className="space-y-6 p-4 md:p-6 max-md:wrap-anywhere">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="max-md:min-w-0">
            <h1 className="text-xl font-black text-foreground">Indicadores de Gestión Social</h1>
            <p className="text-sm text-muted-foreground">
              Seguimiento de atención ciudadana y cumplimiento en tiempo casi real
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-full border border-border bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
              Última actualización: {formatTimestamp(lastUpdated)}
            </div>
            <Button variant="outline" size="sm" onClick={refresh} className="gap-2">
              <RefreshCcw className={cn('h-4 w-4', loading ? 'animate-spin' : '')} />
              Refrescar
            </Button>
          </div>
        </div>

        <DashboardFilters
          filters={filters}
          departments={catalogDepartments.map((dept) => ({ slug: dept.slug, name: dept.name }))}
          agents={agentOptions}
          loadingDepartments={loadingDepartments}
          loadingAgents={loadingAgents}
          pollingEnabled={pollingEnabled}
          onPollingChange={setPollingEnabled}
          onFromChange={setFrom}
          onToChange={setTo}
          onDepartmentChange={setDepartment}
          onAgentChange={setAgent}
          onClear={clearFilters}
          onRefresh={refresh}
          refreshing={loading}
        />

        {error ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center">
            <p className="text-sm font-semibold text-foreground">
              No pudimos cargar los indicadores de gestión.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{error}</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={refresh}>
              Reintentar
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {isEmpty && !loading ? (
              <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
                <p className="text-sm font-semibold text-foreground">Sin datos para este rango.</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Ajustá los filtros para visualizar información disponible.
                </p>
              </div>
            ) : (
              <></>
            )}

            <KPIGrid items={kpiItems} loading={loading} className="max-md:grid-cols-1" />

            <div className="grid gap-4 max-md:grid-cols-1 xl:grid-cols-3">
              <VolumeChart
                className="xl:col-span-2"
                data={metrics?.dailyVolume ?? []}
                loading={loading}
              />
              <SLAChart sla={metrics?.sla} loading={loading} />
            </div>

            <div className="grid gap-4 max-md:grid-cols-1 xl:grid-cols-3">
              <FlowMetricsChart flow={metrics?.flow} loading={loading} />
              <DepartmentDistributionChart departments={departments} loading={loading} />
              <CriticalAlerts items={alerts} loading={loading} />
            </div>

            <AgentPerformanceTable agents={agents} loading={loading} />

            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-border bg-card p-4 text-xs text-muted-foreground">
                Promedio de respuesta:{' '}
                <strong>{formatMinutes(metrics?.timings.avgFirstResponseTime ?? 0)}</strong>
              </div>
              <div className="rounded-2xl border border-border bg-card p-4 text-xs text-muted-foreground">
                Promedio de resolución:{' '}
                <strong>{formatMinutes(metrics?.timings.avgResolutionTime ?? 0)}</strong>
              </div>
              <div className="rounded-2xl border border-border bg-card p-4 text-xs text-muted-foreground">
                Total de casos procesados:{' '}
                <strong>
                  {numberFormatter.format(
                    (metrics?.kpis.openTickets ?? 0) +
                      (metrics?.kpis.inProgressTickets ?? 0) +
                      (metrics?.kpis.resolvedTickets ?? 0) +
                      (metrics?.kpis.closedTickets ?? 0),
                  )}
                </strong>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
