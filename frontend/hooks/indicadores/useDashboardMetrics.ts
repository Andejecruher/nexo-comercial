'use client';

import { apiClient } from '@/lib/shared/api-client';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

export interface TicketKPIs {
  openTickets: number;
  inProgressTickets: number;
  resolvedTickets: number;
  closedTickets: number;
  slaBreachedTickets: number;
}

export interface TicketTimings {
  avgFirstResponseTime: number;
  avgResolutionTime: number;
  avgHandleTime: number;
}

export interface DailyVolume {
  date: string;
  opened: number;
  closed: number;
}

export interface SlaMetrics {
  met: number;
  breached: number;
  complianceRate: number;
}

export interface FlowMetrics {
  botFlow: number;
  humanFlow: number;
  escalated: number;
}

export interface AgentPerformance {
  agentId: string;
  name: string;
  ticketsHandled: number;
  avgResponseTime: number;
  avgResolutionTime: number;
  slaCompliance: number;
}

export interface DepartmentDistribution {
  department: string;
  count: number;
}

export interface DashboardMetrics {
  kpis: TicketKPIs;
  timings: TicketTimings;
  dailyVolume: DailyVolume[];
  sla: SlaMetrics;
  flow: FlowMetrics;
}

interface AgentMetricsResponse {
  agents: AgentPerformance[];
}

interface DepartmentMetricsResponse {
  departments: DepartmentDistribution[];
}

export interface DashboardFilters {
  from?: string;
  to?: string;
  department?: string;
  agentId?: string;
}

const DEFAULT_POLL_MS = 30_000;

const parseFilters = (sp: URLSearchParams): DashboardFilters => ({
  from: sp.get('from') ?? undefined,
  to: sp.get('to') ?? undefined,
  department: sp.get('department') ?? undefined,
  agentId: sp.get('agent') ?? undefined,
});

const toIsoStart = (value: string | undefined) => {
  if (!value) return undefined;
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
};

const toIsoEnd = (value: string | undefined) => {
  if (!value) return undefined;
  const parsed = new Date(`${value}T23:59:59.999`);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
};

export function useDashboardMetrics() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filters = useMemo(
    () => parseFilters(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  const [metrics, setMetrics] = useState<DashboardMetrics | undefined>(undefined);
  const [agents, setAgents] = useState<AgentPerformance[]>([]);
  const [departments, setDepartments] = useState<DepartmentDistribution[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [lastUpdated, setLastUpdated] = useState<string | undefined>(undefined);
  const [pollingEnabled, setPollingEnabled] = useState(true);
  const latestRequest = useRef(0);
  const errorNotified = useRef({ dashboard: '', agents: '', departments: '' });

  const updateUrl = useCallback(
    (partial: Partial<DashboardFilters>) => {
      const next = new URLSearchParams(searchParams.toString());
      const merged = { ...filters, ...partial };

      if (merged.from) next.set('from', merged.from);
      else next.delete('from');

      if (merged.to) next.set('to', merged.to);
      else next.delete('to');

      if (merged.department) next.set('department', merged.department);
      else next.delete('department');

      if (merged.agentId) next.set('agent', merged.agentId);
      else next.delete('agent');

      router.replace(`${pathname}${next.toString() ? `?${next.toString()}` : ''}`);
    },
    [filters, pathname, router, searchParams],
  );

  const fetchMetrics = useCallback(async () => {
    const requestId = latestRequest.current + 1;
    latestRequest.current = requestId;

    setLoading(true);
    setError(undefined);

    const params = new URLSearchParams();
    const fromIso = toIsoStart(filters.from);
    const toIso = toIsoEnd(filters.to);

    if (fromIso) params.set('from', fromIso);
    if (toIso) params.set('to', toIso);
    if (filters.department) params.set('department', filters.department);
    if (filters.agentId) params.set('agentId', filters.agentId);

    const query = params.toString();
    const dashboardPath = `/analytics/dashboard${query ? `?${query}` : ''}`;
    const agentsPath = `/analytics/agents${query ? `?${query}` : ''}`;
    const departmentsPath = `/analytics/departments${query ? `?${query}` : ''}`;

    const [dashboardResult, agentsResult, departmentsResult] = await Promise.all([
      apiClient.get<DashboardMetrics>(dashboardPath),
      apiClient.get<AgentMetricsResponse>(agentsPath),
      apiClient.get<DepartmentMetricsResponse>(departmentsPath),
    ]);

    if (latestRequest.current !== requestId) return;

    if (dashboardResult.ok) {
      setMetrics(dashboardResult.data);
      setLastUpdated(new Date().toISOString());
      errorNotified.current.dashboard = '';
    } else {
      setError(dashboardResult.message);
      if (errorNotified.current.dashboard !== dashboardResult.message) {
        toast.error('No se pudieron cargar las métricas', { description: dashboardResult.message });
        errorNotified.current.dashboard = dashboardResult.message;
      }
    }

    if (agentsResult.ok) {
      setAgents(agentsResult.data.agents);
      errorNotified.current.agents = '';
    } else {
      setAgents([]);
      if (errorNotified.current.agents !== agentsResult.message) {
        toast.error('No se pudieron cargar las métricas de agentes', {
          description: agentsResult.message,
        });
        errorNotified.current.agents = agentsResult.message;
      }
    }

    if (departmentsResult.ok) {
      setDepartments(departmentsResult.data.departments);
      errorNotified.current.departments = '';
    } else {
      setDepartments([]);
      if (errorNotified.current.departments !== departmentsResult.message) {
        toast.error('No se pudo cargar la distribución por departamento', {
          description: departmentsResult.message,
        });
        errorNotified.current.departments = departmentsResult.message;
      }
    }

    setLoading(false);
  }, [filters]);

  useEffect(() => {
    void fetchMetrics();
  }, [fetchMetrics]);

  useEffect(() => {
    if (!pollingEnabled) return undefined;

    const tick = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      void fetchMetrics();
    };

    const id = window.setInterval(tick, DEFAULT_POLL_MS);
    return () => window.clearInterval(id);
  }, [fetchMetrics, pollingEnabled]);

  const isEmpty = useMemo(() => {
    if (!metrics) return false;
    const kpiTotal =
      metrics.kpis.openTickets +
      metrics.kpis.inProgressTickets +
      metrics.kpis.resolvedTickets +
      metrics.kpis.closedTickets +
      metrics.kpis.slaBreachedTickets;
    const dailyActive = metrics.dailyVolume.some((item) => item.opened > 0 || item.closed > 0);
    const flowTotal = metrics.flow.botFlow + metrics.flow.humanFlow + metrics.flow.escalated;
    const slaTotal = metrics.sla.met + metrics.sla.breached;
    return kpiTotal === 0 && !dailyActive && flowTotal === 0 && slaTotal === 0;
  }, [metrics]);

  return {
    metrics,
    agents,
    departments,
    loading,
    error,
    lastUpdated,
    filters,
    isEmpty,
    pollingEnabled,
    setPollingEnabled,
    setFrom: (from: string | undefined) => updateUrl({ from }),
    setTo: (to: string | undefined) => updateUrl({ to }),
    setDepartment: (department: string | undefined) => updateUrl({ department }),
    setAgent: (agentId: string | undefined) => updateUrl({ agentId }),
    clearFilters: () => router.replace(pathname),
    refresh: fetchMetrics,
  };
}
