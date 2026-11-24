import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  useDashboardMetrics,
  type DashboardMetrics,
} from '@/hooks/indicadores/useDashboardMetrics';
import {
  resetMockRouter,
  setMockPathname,
  setMockSearchParams,
} from '@/tests/shared/utils/next-navigation';

type ApiResult<T> = { ok: true; data: T } | { ok: false; message: string };

type AgentMetricsResponse = {
  agents: Array<{
    agentId: string;
    name: string;
    ticketsHandled: number;
    avgResponseTime: number;
    avgResolutionTime: number;
    slaCompliance: number;
  }>;
};

type DepartmentMetricsResponse = {
  departments: Array<{ department: string; count: number }>;
};

const mockGet = vi.hoisted(() => vi.fn());

vi.mock('@/lib/shared/api-client', () => ({
  apiClient: {
    get: mockGet,
  },
}));

const baseMetrics: DashboardMetrics = {
  kpis: {
    openTickets: 12,
    inProgressTickets: 5,
    resolvedTickets: 7,
    closedTickets: 9,
    slaBreachedTickets: 2,
  },
  timings: {
    avgFirstResponseTime: 42,
    avgResolutionTime: 120,
    avgHandleTime: 15,
  },
  dailyVolume: [{ date: '2024-02-01', opened: 10, closed: 8 }],
  sla: {
    met: 30,
    breached: 2,
    complianceRate: 0.94,
  },
  flow: {
    botFlow: 12,
    humanFlow: 18,
    escalated: 1,
  },
};

const baseAgents: AgentMetricsResponse = {
  agents: [
    {
      agentId: 'agent-1',
      name: 'Ada Lovelace',
      ticketsHandled: 20,
      avgResponseTime: 12,
      avgResolutionTime: 45,
      slaCompliance: 0.9,
    },
  ],
};

const baseDepartments: DepartmentMetricsResponse = {
  departments: [{ department: 'Soporte', count: 10 }],
};

const okResult = <T,>(data: T): ApiResult<T> => ({ ok: true, data });
const errorResult = (message: string): ApiResult<never> => ({ ok: false, message });

const createDeferred = <T,>() => {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

const mockSuccessCalls = () => {
  mockGet.mockImplementation((path: string) => {
    if (path.startsWith('/analytics/dashboard')) return Promise.resolve(okResult(baseMetrics));
    if (path.startsWith('/analytics/agents')) return Promise.resolve(okResult(baseAgents));
    if (path.startsWith('/analytics/departments')) {
      return Promise.resolve(okResult(baseDepartments));
    }
    return Promise.resolve(errorResult('Ruta inválida'));
  });
};

beforeEach(() => {
  setMockPathname('/admin/dashboard');
  setMockSearchParams(new URLSearchParams());
  resetMockRouter();
  mockGet.mockReset();
});

describe('useDashboardMetrics', () => {
  it('lee filtros desde search params', async () => {
    setMockSearchParams(
      new URLSearchParams('from=2024-01-01&to=2024-01-31&department=soporte&agent=123'),
    );
    mockSuccessCalls();

    const { result } = renderHook(() => useDashboardMetrics());

    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(3));

    expect(result.current.filters).toEqual({
      from: '2024-01-01',
      to: '2024-01-31',
      department: 'soporte',
      agentId: '123',
    });
  });

  it('transiciona loading y error al fallar el dashboard', async () => {
    const dashboardDeferred = createDeferred<ApiResult<DashboardMetrics>>();
    const agentsDeferred = createDeferred<ApiResult<AgentMetricsResponse>>();
    const departmentsDeferred = createDeferred<ApiResult<DepartmentMetricsResponse>>();

    mockGet
      .mockReturnValueOnce(dashboardDeferred.promise)
      .mockReturnValueOnce(agentsDeferred.promise)
      .mockReturnValueOnce(departmentsDeferred.promise);

    const { result } = renderHook(() => useDashboardMetrics());

    await waitFor(() => expect(result.current.loading).toBe(true));

    dashboardDeferred.resolve(errorResult('Falló el dashboard'));
    agentsDeferred.resolve(okResult({ agents: [] }));
    departmentsDeferred.resolve(okResult({ departments: [] }));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Falló el dashboard');
  });

  it('permite refrescar manualmente', async () => {
    mockSuccessCalls();

    const { result } = renderHook(() => useDashboardMetrics());

    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(3));

    act(() => {
      result.current.refresh();
    });

    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(6));
  });

  it('maneja polling habilitado y deshabilitado', async () => {
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    });

    vi.useFakeTimers();
    mockSuccessCalls();

    const { result } = renderHook(() => useDashboardMetrics());

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockGet).toHaveBeenCalledTimes(3);

    await act(async () => {
      vi.advanceTimersByTime(30_000);
      await Promise.resolve();
    });

    expect(mockGet).toHaveBeenCalledTimes(6);

    act(() => {
      result.current.setPollingEnabled(false);
    });

    await act(async () => {
      vi.advanceTimersByTime(30_000);
      await Promise.resolve();
    });

    expect(mockGet).toHaveBeenCalledTimes(6);

    vi.useRealTimers();
  });
});
