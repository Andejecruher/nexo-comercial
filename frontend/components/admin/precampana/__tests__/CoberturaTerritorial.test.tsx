import { CoberturaTerritorial } from '@/components/admin/precampana/CoberturaTerritorial';
import { EMPTY_PRECAMPANA_METRICS, type PrecampanaDashboardMetrics } from '@/lib/precampana-api';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: unknown }) => <div>{children as never}</div>,
  BarChart: ({ children }: { children: unknown }) => (
    <div data-testid="bar-chart">{children as never}</div>
  ),
  CartesianGrid: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  Bar: () => null,
}));

const METRICS: PrecampanaDashboardMetrics = {
  ...EMPTY_PRECAMPANA_METRICS,
  bySection: [
    {
      sectionId: 'sec-1',
      sectionCode: '2401',
      pollingStationCount: 3,
      votesPerStation: 200,
      nominalList: 1500,
      votesRequired: 400,
      total: 40,
      target: 400,
      coveragePct: 10,
      goalSource: 'SECTION_VOTES_REQUIRED',
    },
    {
      sectionId: 'sec-2',
      sectionCode: '2402',
      pollingStationCount: null,
      votesPerStation: null,
      nominalList: null,
      votesRequired: null,
      total: 0,
      target: null,
      coveragePct: null,
      goalSource: null,
    },
  ],
  byNeighborhood: [{ neighborhood: 'Centro', total: 12 }],
  byCoordinator: [
    {
      coordinatorId: 'coord-1',
      coordinatorName: 'Ana Torres',
      sectionId: 'sec-1',
      sectionCode: '2401',
      votesRequired: 400,
      total: 40,
      leaderCount: 1,
      leadersWithQuota: 0,
      quotaSum: null,
      target: 400,
      coveragePct: 10,
      goalSource: 'SECTION_VOTES_REQUIRED',
    },
  ],
  byLeader: [
    {
      leaderId: 'leader-1',
      leaderName: 'Juan Pérez',
      sectionId: 'sec-1',
      sectionCode: '2401',
      coordinatorId: 'coord-1',
      coordinatorName: 'Ana Torres',
      promovidoQuota: null,
      total: 0,
      target: null,
      coveragePct: null,
      goalSource: null,
    },
  ],
};

describe('CoberturaTerritorial', () => {
  it('exposes the five territorial tabs and shows Sin meta when coverage is null', () => {
    render(<CoberturaTerritorial metrics={METRICS} />);

    expect(screen.getByRole('tab', { name: 'Resumen' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Sección' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Barrio' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Coordinador' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Líder' })).toBeInTheDocument();

    expect(screen.getAllByText('2401').length).toBeGreaterThan(0);
    expect(screen.getByText('2402')).toBeInTheDocument();
    expect(screen.getAllByText('Sin meta').length).toBeGreaterThan(0);
    expect(screen.getByText('Bajo')).toBeInTheDocument();
    expect(screen.getByText('1500')).toBeInTheDocument();
  });

  it('exposes coordinator and leader coverage tabs for zero rows', () => {
    render(<CoberturaTerritorial metrics={METRICS} />);
    expect(screen.getByRole('tab', { name: 'Coordinador' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Líder' })).toBeInTheDocument();
  });
});
