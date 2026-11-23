import { EMPTY_PRECAMPANA_METRICS, type PrecampanaDashboardMetrics } from '@/lib/precampana-api';
import { describe, expect, it } from 'vitest';
import { buildPrecampanaReportRows } from '../report-rows';

describe('buildPrecampanaReportRows', () => {
  it('exports coordinator hierarchy, effective targets, sources and operational fields', () => {
    const metrics: PrecampanaDashboardMetrics = {
      ...EMPTY_PRECAMPANA_METRICS,
      leadersWithoutQuota: 1,
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
      ],
      byCoordinator: [
        {
          coordinatorId: 'coord-1',
          coordinatorName: 'Ana Torres',
          sectionId: 'sec-1',
          sectionCode: '2401',
          votesRequired: 400,
          total: 40,
          leaderCount: 2,
          leadersWithQuota: 1,
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

    const rows = buildPrecampanaReportRows(metrics);
    expect(rows).toContainEqual(['Líderes Sin Cuota', 1]);
    expect(rows).toContainEqual(['2401', 40, 400, 'SECTION_VOTES_REQUIRED', 10, 3, 200, 1500, 400]);
    expect(rows).toContainEqual(['Ana Torres', '2401', 40, 2, 400, 'SECTION_VOTES_REQUIRED', 10]);
    expect(rows).toContainEqual(['Juan Pérez', 'Ana Torres', '2401', 0, 'Sin cuota', 'Sin meta']);
  });
});
