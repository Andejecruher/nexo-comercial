import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DashboardViewAtencion as DashboardView } from '@/components/indicadores/dashboard-view-atencion';
import type {
  AgentPerformance,
  DashboardFilters,
  DashboardMetrics,
  DepartmentDistribution,
} from '@/hooks/indicadores/useDashboardMetrics';

type DashboardHookState = {
  metrics: DashboardMetrics | undefined;
  agents: AgentPerformance[];
  departments: DepartmentDistribution[];
  loading: boolean;
  error: string | undefined;
  filters: DashboardFilters;
  isEmpty: boolean;
  lastUpdated: string | undefined;
  pollingEnabled: boolean;
  setPollingEnabled: (value: boolean) => void;
  setFrom: (value: string | undefined) => void;
  setTo: (value: string | undefined) => void;
  setDepartment: (value: string | undefined) => void;
  setAgent: (value: string | undefined) => void;
  clearFilters: () => void;
  refresh: () => void;
};

const mockUseDashboardMetrics = vi.hoisted(() => vi.fn());
const mockUseDepartments = vi.hoisted(() => vi.fn());
const mockAdminUsersList = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/indicadores/useDashboardMetrics', () => ({
  useDashboardMetrics: mockUseDashboardMetrics,
}));

vi.mock('@/hooks/shared/useDepartments', () => ({
  useDepartments: mockUseDepartments,
}));

vi.mock('@/lib/shared/admin-users-api', () => ({
  adminUsersApi: {
    list: mockAdminUsersList,
  },
}));

vi.mock('@/components/indicadores/AgentPerformanceTable', () => ({
  AgentPerformanceTable: ({ agents }: { agents: AgentPerformance[] }) => (
    <div data-testid="agent-performance">{agents.length}</div>
  ),
}));

vi.mock('@/components/indicadores/CriticalAlerts', () => ({
  CriticalAlerts: ({ items }: { items: Array<{ title: string }> }) => (
    <div data-testid="critical-alerts">{items.map((item) => item.title).join('|')}</div>
  ),
}));

vi.mock('@/components/indicadores/DashboardFilters', () => ({
  DashboardFilters: ({ refreshing }: { refreshing: boolean }) => (
    <div data-testid="dashboard-filters">{refreshing ? 'refreshing' : 'idle'}</div>
  ),
}));

vi.mock('@/components/indicadores/DepartmentDistributionChart', () => ({
  DepartmentDistributionChart: ({ departments }: { departments: DepartmentDistribution[] }) => (
    <div data-testid="department-chart">{departments.length}</div>
  ),
}));

vi.mock('@/components/indicadores/FlowMetricsChart', () => ({
  FlowMetricsChart: () => <div data-testid="flow-chart" />,
}));

vi.mock('@/components/shared/KPIGrid', () => ({
  KPIGrid: ({ items }: { items: Array<{ label: string }> }) => (
    <div data-testid="kpi-grid">{items.map((item) => item.label).join('|')}</div>
  ),
}));

vi.mock('@/components/indicadores/SLAChart', () => ({
  SLAChart: () => <div data-testid="sla-chart" />,
}));

vi.mock('@/components/indicadores/VolumeChart', () => ({
  VolumeChart: () => <div data-testid="volume-chart" />,
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

const createHookState = (overrides: Partial<DashboardHookState>): DashboardHookState => ({
  metrics: baseMetrics,
  agents: [],
  departments: [],
  loading: false,
  error: undefined,
  filters: {},
  isEmpty: false,
  lastUpdated: '2024-02-15T10:20:30.000Z',
  pollingEnabled: true,
  setPollingEnabled: vi.fn(),
  setFrom: vi.fn(),
  setTo: vi.fn(),
  setDepartment: vi.fn(),
  setAgent: vi.fn(),
  clearFilters: vi.fn(),
  refresh: vi.fn(),
  ...overrides,
});

beforeEach(() => {
  mockUseDepartments.mockReturnValue({
    departments: [],
    loading: false,
  });
  mockAdminUsersList.mockResolvedValue({
    ok: true,
    data: { users: [] },
  });
});

describe('DashboardView', () => {
  it('renderiza con datos', async () => {
    const state = createHookState({});
    mockUseDashboardMetrics.mockReturnValue(state);

    await act(async () => {
      render(<DashboardView />);
      await Promise.resolve();
    });

    expect(screen.getByText('Indicadores de Gestión Social')).toBeInTheDocument();
    expect(screen.getByText(/Última actualización:/)).toBeInTheDocument();
    expect(screen.getByText('42 min')).toBeInTheDocument();
    expect(screen.getByTestId('kpi-grid')).toHaveTextContent('Nuevos reportes');
  });

  it('muestra estado de error', async () => {
    const state = createHookState({
      error: 'Error de conexión',
    });
    mockUseDashboardMetrics.mockReturnValue(state);

    await act(async () => {
      render(<DashboardView />);
      await Promise.resolve();
    });

    expect(screen.getByText('No pudimos cargar los indicadores de gestión.')).toBeInTheDocument();
    expect(screen.getByText('Error de conexión')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });

  it('muestra estado vacío', async () => {
    const state = createHookState({
      isEmpty: true,
    });
    mockUseDashboardMetrics.mockReturnValue(state);

    await act(async () => {
      render(<DashboardView />);
      await Promise.resolve();
    });

    expect(screen.getByText('Sin datos para este rango.')).toBeInTheDocument();
  });

  it('ejecuta refresh al hacer click', async () => {
    const refresh = vi.fn();
    const state = createHookState({ refresh });
    mockUseDashboardMetrics.mockReturnValue(state);

    await act(async () => {
      render(<DashboardView />);
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Refrescar' }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
