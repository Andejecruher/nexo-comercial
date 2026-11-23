import { describe, expect, it, jest } from '@jest/globals';
import {
  PrecampanaAnalyticsRepository,
  type ActiveCoordinatorRef,
  type ActiveLeaderRef,
  type ActiveSectionRef,
  type CoordinatorGroup,
  type LeaderGroup,
  type PrecampaignGoalWithContext,
  type PrecampanaPrismaLike,
  type SectionGroup,
} from '../../repositories/precampana-analytics.repository';
import { PrecampanaAnalyticsService } from '../../services/analytics/precampana-analytics.service';

const NOW = new Date('2026-08-19T12:00:00.000Z');
const SECTION_ID = '11111111-1111-4111-8111-111111111111';
const LEADER_ID = '22222222-2222-4222-8222-222222222222';
const COORDINATOR_ID = '33333333-3333-4333-8333-333333333333';

function sectionRef(overrides: Partial<ActiveSectionRef> = {}): ActiveSectionRef {
  return {
    id: SECTION_ID,
    sectionCode: '2401',
    pollingStationCount: 3,
    votesPerStation: 200,
    nominalList: 1500,
    votesRequired: null,
    ...overrides,
  };
}

function leaderRef(overrides: Partial<ActiveLeaderRef> = {}): ActiveLeaderRef {
  return {
    id: LEADER_ID,
    fullName: 'Juan Pérez',
    sectionId: SECTION_ID,
    coordinatorId: COORDINATOR_ID,
    promovidoQuota: null,
    section: sectionRef(),
    ...overrides,
  };
}

function coordinatorRef(overrides: Partial<ActiveCoordinatorRef> = {}): ActiveCoordinatorRef {
  return {
    id: COORDINATOR_ID,
    fullName: 'Ana Torres',
    sectionId: SECTION_ID,
    section: sectionRef(),
    ...overrides,
  };
}

function goal(
  id: string,
  scope: 'GLOBAL' | 'SECTION' | 'LEADER',
  cadence: 'CAMPAIGN' | 'MONTHLY' | 'WEEKLY',
  startDate: string,
  endDate: string,
  target = 10,
): PrecampaignGoalWithContext {
  const sectionId = scope === 'SECTION' ? '11111111-1111-4111-8111-111111111111' : null;
  const leaderId = scope === 'LEADER' ? '22222222-2222-4222-8222-222222222222' : null;
  return {
    id,
    title: `Meta ${id}`,
    target,
    scope,
    cadence,
    sectionId,
    leaderId,
    startDate: new Date(startDate),
    endDate: new Date(endDate),
    isActive: true,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    section: sectionId ? { id: sectionId, sectionCode: '2401' } : null,
    leader: leaderId ? { id: leaderId, fullName: 'Juan Pérez', sectionId: 'section-1' } : null,
  };
}

function baseRepository(): jest.Mocked<PrecampanaAnalyticsRepository> {
  const repository = Object.create(
    PrecampanaAnalyticsRepository.prototype,
  ) as jest.Mocked<PrecampanaAnalyticsRepository>;
  repository.countActivePromovidos = jest
    .fn<PrecampanaAnalyticsRepository['countActivePromovidos']>()
    .mockResolvedValue(0);
  repository.findFirstCreatedAt = jest
    .fn<PrecampanaAnalyticsRepository['findFirstCreatedAt']>()
    .mockResolvedValue(null);
  repository.findLastCreatedAt = jest
    .fn<PrecampanaAnalyticsRepository['findLastCreatedAt']>()
    .mockResolvedValue(null);
  repository.countVerifiedPromovidos = jest
    .fn<PrecampanaAnalyticsRepository['countVerifiedPromovidos']>()
    .mockResolvedValue(0);
  repository.findAllSectionsWithCounts = jest
    .fn<PrecampanaAnalyticsRepository['findAllSectionsWithCounts']>()
    .mockResolvedValue([]);
  repository.findAllLeadersWithCounts = jest
    .fn<PrecampanaAnalyticsRepository['findAllLeadersWithCounts']>()
    .mockResolvedValue([]);
  repository.findAllCoordinatorsWithCounts = jest
    .fn<PrecampanaAnalyticsRepository['findAllCoordinatorsWithCounts']>()
    .mockResolvedValue([]);
  repository.findFilterOptions = jest
    .fn<PrecampanaAnalyticsRepository['findFilterOptions']>()
    .mockResolvedValue({ sections: [], coordinators: [], leaders: [] });
  repository.groupByNeighborhood = jest
    .fn<PrecampanaAnalyticsRepository['groupByNeighborhood']>()
    .mockResolvedValue([]);
  repository.weeklyGrowth = jest
    .fn<PrecampanaAnalyticsRepository['weeklyGrowth']>()
    .mockResolvedValue([]);
  repository.weeklyLeaderActivity = jest
    .fn<PrecampanaAnalyticsRepository['weeklyLeaderActivity']>()
    .mockResolvedValue([]);
  repository.findActiveSectionById = jest
    .fn<PrecampanaAnalyticsRepository['findActiveSectionById']>()
    .mockResolvedValue(sectionRef());
  repository.findActiveSectionByCode = jest
    .fn<PrecampanaAnalyticsRepository['findActiveSectionByCode']>()
    .mockResolvedValue(sectionRef());
  repository.findActiveLeaderById = jest
    .fn<PrecampanaAnalyticsRepository['findActiveLeaderById']>()
    .mockResolvedValue(leaderRef());
  repository.findActiveCoordinatorById = jest
    .fn<PrecampanaAnalyticsRepository['findActiveCoordinatorById']>()
    .mockResolvedValue(coordinatorRef());
  repository.findExactGoalAt = jest
    .fn<PrecampanaAnalyticsRepository['findExactGoalAt']>()
    .mockResolvedValue(null);
  repository.findWeeklyGoalsOverlapping = jest
    .fn<PrecampanaAnalyticsRepository['findWeeklyGoalsOverlapping']>()
    .mockResolvedValue([]);
  repository.countActiveInRange = jest
    .fn<PrecampanaAnalyticsRepository['countActiveInRange']>()
    .mockResolvedValue(0);
  repository.findOverlappingGoal = jest
    .fn<PrecampanaAnalyticsRepository['findOverlappingGoal']>()
    .mockResolvedValue(null);
  repository.createGoal = jest.fn<PrecampanaAnalyticsRepository['createGoal']>();
  repository.updateGoal = jest.fn<PrecampanaAnalyticsRepository['updateGoal']>();
  repository.findGoalById = jest
    .fn<PrecampanaAnalyticsRepository['findGoalById']>()
    .mockResolvedValue(null);
  repository.deactivateGoal = jest.fn<PrecampanaAnalyticsRepository['deactivateGoal']>();
  repository.findActiveGoals = jest
    .fn<PrecampanaAnalyticsRepository['findActiveGoals']>()
    .mockResolvedValue([]);
  return repository;
}

function withLeaderQuota(
  repository: jest.Mocked<PrecampanaAnalyticsRepository>,
  promovidoQuota: number | null,
): void {
  repository.findActiveLeaderById.mockResolvedValue(leaderRef({ promovidoQuota }));
}

describe('PrecampanaAnalyticsService goal resolution', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('resolves an exact leader campaign goal', async () => {
    const repository = baseRepository();
    const leaderGoal = goal(
      'leader-campaign',
      'LEADER',
      'CAMPAIGN',
      '2026-08-01T00:00:00.000Z',
      '2026-09-01T00:00:00.000Z',
      80,
    );
    repository.findExactGoalAt.mockImplementation(async (scope, cadence) =>
      scope === 'LEADER' && cadence === 'CAMPAIGN' ? leaderGoal : null,
    );
    repository.countActiveInRange.mockResolvedValue(24);

    const result = await new PrecampanaAnalyticsService(repository).getDashboardMetrics({
      leaderId: '22222222-2222-4222-8222-222222222222',
    });

    expect(result.resolvedGoal).toMatchObject({
      id: 'leader-campaign',
      scope: 'LEADER',
      resolutionSource: 'EXACT',
      current: 24,
      target: 80,
    });
  });

  it('falls back from leader to the leader section', async () => {
    const repository = baseRepository();
    const sectionGoal = goal(
      'section-campaign',
      'SECTION',
      'CAMPAIGN',
      '2026-08-01T00:00:00.000Z',
      '2026-09-01T00:00:00.000Z',
    );
    repository.findExactGoalAt.mockImplementation(async (scope, cadence) =>
      scope === 'SECTION' && cadence === 'CAMPAIGN' ? sectionGoal : null,
    );

    const result = await new PrecampanaAnalyticsService(repository).getDashboardMetrics({
      leaderId: '22222222-2222-4222-8222-222222222222',
    });

    expect(result.resolvedGoal).toMatchObject({
      id: 'section-campaign',
      resolutionSource: 'SECTION_FALLBACK',
    });
  });

  it('uses the leader promovido quota when no leader campaign goal exists', async () => {
    const repository = baseRepository();
    withLeaderQuota(repository, 50);
    repository.findExactGoalAt.mockImplementation(async (scope, cadence) =>
      scope === 'SECTION' && cadence === 'CAMPAIGN'
        ? goal(
            'section-campaign',
            'SECTION',
            'CAMPAIGN',
            '2026-08-01T00:00:00.000Z',
            '2026-09-01T00:00:00.000Z',
          )
        : null,
    );
    repository.countActivePromovidos.mockResolvedValue(20);
    repository.findFirstCreatedAt.mockResolvedValue(new Date('2026-08-01T00:00:00.000Z'));

    const result = await new PrecampanaAnalyticsService(repository).getDashboardMetrics({
      leaderId: '22222222-2222-4222-8222-222222222222',
    });

    expect(result.resolvedGoal).toMatchObject({
      id: null,
      scope: 'LEADER',
      cadence: 'CAMPAIGN',
      target: 50,
      current: 20,
      progressPct: 40,
      resolutionSource: 'LEADER_QUOTA_FALLBACK',
      startDate: '2026-08-01T00:00:00.000Z',
      endDate: NOW.toISOString(),
    });
    expect(result.resolvedWeeklyGoal).toBeNull();
  });

  it('prefers an exact leader campaign goal over the promovido quota', async () => {
    const repository = baseRepository();
    withLeaderQuota(repository, 50);
    const leaderGoal = goal(
      'leader-campaign',
      'LEADER',
      'CAMPAIGN',
      '2026-08-01T00:00:00.000Z',
      '2026-09-01T00:00:00.000Z',
      80,
    );
    repository.findExactGoalAt.mockImplementation(async (scope, cadence) =>
      scope === 'LEADER' && cadence === 'CAMPAIGN' ? leaderGoal : null,
    );

    const result = await new PrecampanaAnalyticsService(repository).getDashboardMetrics({
      leaderId: '22222222-2222-4222-8222-222222222222',
    });

    expect(result.resolvedGoal).toMatchObject({
      id: 'leader-campaign',
      target: 80,
      resolutionSource: 'EXACT',
    });
  });

  it('ignores the promovido quota for weekly goals', async () => {
    const repository = baseRepository();
    withLeaderQuota(repository, 50);
    const sectionWeekly = goal(
      'section-weekly',
      'SECTION',
      'WEEKLY',
      '2026-08-17T00:00:00.000Z',
      '2026-08-24T00:00:00.000Z',
      12,
    );
    repository.findExactGoalAt.mockImplementation(async (scope, cadence) =>
      scope === 'SECTION' && cadence === 'WEEKLY' ? sectionWeekly : null,
    );

    const result = await new PrecampanaAnalyticsService(repository).getDashboardMetrics({
      leaderId: '22222222-2222-4222-8222-222222222222',
    });

    expect(result.resolvedWeeklyGoal).toMatchObject({
      id: 'section-weekly',
      target: 12,
      resolutionSource: 'SECTION_FALLBACK',
    });
  });

  it('falls back from section to the global campaign goal', async () => {
    const repository = baseRepository();
    const globalGoal = goal(
      'global-campaign',
      'GLOBAL',
      'CAMPAIGN',
      '2026-08-01T00:00:00.000Z',
      '2026-09-01T00:00:00.000Z',
    );
    repository.findExactGoalAt.mockImplementation(async (scope, cadence) =>
      scope === 'GLOBAL' && cadence === 'CAMPAIGN' ? globalGoal : null,
    );

    const result = await new PrecampanaAnalyticsService(repository).getDashboardMetrics({
      sectionCode: '2401',
    });

    expect(result.resolvedGoal).toMatchObject({
      id: 'global-campaign',
      resolutionSource: 'GLOBAL_FALLBACK',
    });
  });

  it('sums three distinct weekly goals across a date range', async () => {
    const repository = baseRepository();
    repository.findWeeklyGoalsOverlapping.mockResolvedValue([
      goal('w1', 'GLOBAL', 'WEEKLY', '2026-08-03T00:00:00.000Z', '2026-08-10T00:00:00.000Z', 10),
      goal('w2', 'GLOBAL', 'WEEKLY', '2026-08-10T00:00:00.000Z', '2026-08-17T00:00:00.000Z', 20),
      goal('w3', 'GLOBAL', 'WEEKLY', '2026-08-17T00:00:00.000Z', '2026-08-24T00:00:00.000Z', 30),
    ]);
    repository.countActiveInRange.mockResolvedValue(45);

    const result = await new PrecampanaAnalyticsService(repository).getDashboardMetrics({
      from: new Date('2026-08-03T00:00:00.000Z'),
      to: new Date('2026-08-24T00:00:00.000Z'),
    });

    expect(result.resolvedGoal).toMatchObject({
      cadence: 'PERIOD',
      target: 60,
      current: 45,
      includedGoals: 3,
      missingWeeks: [],
    });
    expect(result.resolvedWeeklyGoal).toBe(result.resolvedGoal);
  });

  it('reports a missing week and does not prorate or invent its target', async () => {
    const repository = baseRepository();
    repository.findWeeklyGoalsOverlapping.mockResolvedValue([
      goal('w1', 'GLOBAL', 'WEEKLY', '2026-08-03T00:00:00.000Z', '2026-08-10T00:00:00.000Z', 15),
      goal('w3', 'GLOBAL', 'WEEKLY', '2026-08-17T00:00:00.000Z', '2026-08-24T00:00:00.000Z', 25),
    ]);

    const result = await new PrecampanaAnalyticsService(repository).getDashboardMetrics({
      from: new Date('2026-08-03T00:00:00.000Z'),
      to: new Date('2026-08-24T00:00:00.000Z'),
    });

    expect(result.resolvedGoal).toMatchObject({
      target: 40,
      includedGoals: 2,
      missingWeeks: ['2026-08-10'],
    });
  });

  it('rejects an overlapping active goal before creation', async () => {
    const repository = baseRepository();
    repository.findOverlappingGoal.mockResolvedValue(
      goal('existing', 'GLOBAL', 'WEEKLY', '2026-08-17T00:00:00.000Z', '2026-08-24T00:00:00.000Z'),
    );

    await expect(
      new PrecampanaAnalyticsService(repository).createGoal({
        title: 'Nueva semanal',
        target: 20,
        scope: 'GLOBAL',
        cadence: 'WEEKLY',
        startDate: '2026-08-20T00:00:00.000Z',
        endDate: '2026-08-27T00:00:00.000Z',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(repository.createGoal.mock.calls).toHaveLength(0);
  });

  it('prefers section votesRequired over a configured SECTION campaign goal', async () => {
    const repository = baseRepository();
    repository.findActiveSectionByCode.mockResolvedValue(sectionRef({ votesRequired: 400 }));
    repository.findExactGoalAt.mockImplementation(async (scope, cadence) =>
      scope === 'SECTION' && cadence === 'CAMPAIGN'
        ? goal(
            'section-campaign',
            'SECTION',
            'CAMPAIGN',
            '2026-08-01T00:00:00.000Z',
            '2026-09-01T00:00:00.000Z',
            999,
          )
        : null,
    );
    repository.countActivePromovidos.mockResolvedValue(80);

    const result = await new PrecampanaAnalyticsService(repository).getDashboardMetrics({
      sectionCode: '2401',
    });

    expect(result.resolvedGoal).toMatchObject({
      id: null,
      target: 400,
      current: 80,
      resolutionSource: 'SECTION_VOTES_REQUIRED',
      title: 'Votos necesarios de la sección',
    });
    expect(result.globalGoal).toBeNull();
  });

  it('falls back to the configured SECTION campaign goal when votesRequired is zero', async () => {
    const repository = baseRepository();
    repository.findActiveSectionByCode.mockResolvedValue(sectionRef({ votesRequired: 0 }));
    repository.findExactGoalAt.mockImplementation(async (scope, cadence) =>
      scope === 'SECTION' && cadence === 'CAMPAIGN'
        ? goal(
            'section-campaign',
            'SECTION',
            'CAMPAIGN',
            '2026-08-01T00:00:00.000Z',
            '2026-09-01T00:00:00.000Z',
            250,
          )
        : null,
    );

    const result = await new PrecampanaAnalyticsService(repository).getDashboardMetrics({
      sectionCode: '2401',
    });

    expect(result.resolvedGoal).toMatchObject({
      id: 'section-campaign',
      target: 250,
      resolutionSource: 'EXACT',
    });
  });

  it('measures a coordinator against section votesRequired, not a personal quota', async () => {
    const repository = baseRepository();
    repository.findActiveCoordinatorById.mockResolvedValue(
      coordinatorRef({ section: sectionRef({ votesRequired: 500 }) }),
    );
    repository.findExactGoalAt.mockImplementation(async (scope, cadence) =>
      scope === 'SECTION' && cadence === 'CAMPAIGN'
        ? goal(
            'section-campaign',
            'SECTION',
            'CAMPAIGN',
            '2026-08-01T00:00:00.000Z',
            '2026-09-01T00:00:00.000Z',
            999,
          )
        : null,
    );
    repository.countActivePromovidos.mockResolvedValue(125);

    const result = await new PrecampanaAnalyticsService(repository).getDashboardMetrics({
      coordinatorId: COORDINATOR_ID,
    });

    expect(result.resolvedGoal).toMatchObject({
      id: null,
      target: 500,
      current: 125,
      resolutionSource: 'SECTION_VOTES_REQUIRED',
      title: 'Aporte a la meta seccional',
      contextLabel: 'Coordinador Ana Torres',
    });
  });

  it('keeps weekly coordinator resolution on PrecampaignGoal, ignoring votesRequired', async () => {
    const repository = baseRepository();
    repository.findActiveCoordinatorById.mockResolvedValue(
      coordinatorRef({ section: sectionRef({ votesRequired: 500 }) }),
    );
    const sectionWeekly = goal(
      'section-weekly',
      'SECTION',
      'WEEKLY',
      '2026-08-17T00:00:00.000Z',
      '2026-08-24T00:00:00.000Z',
      12,
    );
    repository.findExactGoalAt.mockImplementation(async (scope, cadence) =>
      scope === 'SECTION' && cadence === 'WEEKLY' ? sectionWeekly : null,
    );

    const result = await new PrecampanaAnalyticsService(repository).getDashboardMetrics({
      coordinatorId: COORDINATOR_ID,
    });

    expect(result.resolvedWeeklyGoal).toMatchObject({
      id: 'section-weekly',
      target: 12,
      resolutionSource: 'SECTION_FALLBACK',
    });
  });
});

describe('PrecampanaAnalyticsService territorial roll-ups', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('includes active entities with zero promovidos and null coverage without a real denominator', async () => {
    const repository = baseRepository();
    const zeroSection: SectionGroup = {
      sectionId: SECTION_ID,
      sectionCode: '2401',
      pollingStationCount: 3,
      votesPerStation: 200,
      nominalList: 1500,
      votesRequired: null,
      total: 0,
    };
    const zeroLeader: LeaderGroup = {
      leaderId: LEADER_ID,
      leaderName: 'Juan Pérez',
      sectionId: SECTION_ID,
      sectionCode: '2401',
      coordinatorId: COORDINATOR_ID,
      coordinatorName: 'Ana Torres',
      promovidoQuota: null,
      total: 0,
    };
    const zeroCoordinator: CoordinatorGroup = {
      coordinatorId: COORDINATOR_ID,
      coordinatorName: 'Ana Torres',
      sectionId: SECTION_ID,
      sectionCode: '2401',
      votesRequired: null,
      total: 0,
      leaderCount: 1,
      leadersWithQuota: 0,
      quotaSum: null,
    };
    repository.findAllSectionsWithCounts.mockResolvedValue([zeroSection]);
    repository.findAllLeadersWithCounts.mockResolvedValue([zeroLeader]);
    repository.findAllCoordinatorsWithCounts.mockResolvedValue([zeroCoordinator]);

    const result = await new PrecampanaAnalyticsService(repository).getDashboardMetrics();

    expect(result.bySection[0]).toMatchObject({
      total: 0,
      target: null,
      coveragePct: null,
      goalSource: null,
    });
    expect(result.byLeader[0]).toMatchObject({ total: 0, target: null, coveragePct: null });
    expect(result.byCoordinator[0]).toMatchObject({ total: 0, target: null, coveragePct: null });
    expect(result.sectionCoverage[0].coveragePct).toBeNull();
  });

  it('uses votesRequired as the section row target and does not split a global goal', async () => {
    const repository = baseRepository();
    repository.findExactGoalAt.mockImplementation(async (scope, cadence) =>
      scope === 'GLOBAL' && cadence === 'CAMPAIGN'
        ? goal(
            'global-campaign',
            'GLOBAL',
            'CAMPAIGN',
            '2026-08-01T00:00:00.000Z',
            '2026-09-01T00:00:00.000Z',
            1000,
          )
        : null,
    );
    repository.findAllSectionsWithCounts.mockResolvedValue([
      {
        sectionId: SECTION_ID,
        sectionCode: '2401',
        pollingStationCount: 3,
        votesPerStation: 200,
        nominalList: 1500,
        votesRequired: 400,
        total: 100,
      },
    ]);

    const result = await new PrecampanaAnalyticsService(repository).getDashboardMetrics();

    expect(result.bySection[0]).toMatchObject({
      total: 100,
      target: 400,
      coveragePct: 25,
      goalSource: 'SECTION_VOTES_REQUIRED',
    });
    expect(result.globalGoal).toMatchObject({ id: 'global-campaign', target: 1000 });
  });

  it('rolls up coordinators from repository totals without double-counting leaders', async () => {
    const repository = baseRepository();
    repository.findAllLeadersWithCounts.mockResolvedValue([
      {
        leaderId: LEADER_ID,
        leaderName: 'Juan Pérez',
        sectionId: SECTION_ID,
        sectionCode: '2401',
        coordinatorId: COORDINATOR_ID,
        coordinatorName: 'Ana Torres',
        promovidoQuota: 10,
        total: 3,
      },
      {
        leaderId: '44444444-4444-4444-8444-444444444444',
        leaderName: 'Luis Mora',
        sectionId: SECTION_ID,
        sectionCode: '2401',
        coordinatorId: COORDINATOR_ID,
        coordinatorName: 'Ana Torres',
        promovidoQuota: 10,
        total: 2,
      },
    ]);
    repository.findAllCoordinatorsWithCounts.mockResolvedValue([
      {
        coordinatorId: COORDINATOR_ID,
        coordinatorName: 'Ana Torres',
        sectionId: SECTION_ID,
        sectionCode: '2401',
        votesRequired: 400,
        total: 5,
        leaderCount: 2,
        leadersWithQuota: 2,
        quotaSum: 20,
      },
    ]);

    const result = await new PrecampanaAnalyticsService(repository).getDashboardMetrics();

    expect(result.byLeader.reduce((sum, leader) => sum + leader.total, 0)).toBe(5);
    expect(result.byCoordinator[0]).toMatchObject({
      total: 5,
      target: 20,
      goalSource: 'COORDINATOR_QUOTA_SUM',
      coveragePct: 25,
    });
  });

  it('falls back to section votesRequired when a coordinator has incomplete leader quotas', async () => {
    const repository = baseRepository();
    repository.findAllCoordinatorsWithCounts.mockResolvedValue([
      {
        coordinatorId: COORDINATOR_ID,
        coordinatorName: 'Ana Torres',
        sectionId: SECTION_ID,
        sectionCode: '2401',
        votesRequired: 400,
        total: 40,
        leaderCount: 2,
        leadersWithQuota: 1,
        quotaSum: null,
      },
    ]);

    const result = await new PrecampanaAnalyticsService(repository).getDashboardMetrics();

    expect(result.byCoordinator[0]).toMatchObject({
      target: 400,
      goalSource: 'SECTION_VOTES_REQUIRED',
      coveragePct: 10,
    });
  });

  it('excludes leaders without quota from met and unmet counts', async () => {
    const repository = baseRepository();
    repository.findAllLeadersWithCounts.mockResolvedValue([
      {
        leaderId: LEADER_ID,
        leaderName: 'Juan Pérez',
        sectionId: SECTION_ID,
        sectionCode: '2401',
        coordinatorId: COORDINATOR_ID,
        coordinatorName: 'Ana Torres',
        promovidoQuota: 10,
        total: 10,
      },
      {
        leaderId: '44444444-4444-4444-8444-444444444444',
        leaderName: 'Luis Mora',
        sectionId: SECTION_ID,
        sectionCode: '2401',
        coordinatorId: COORDINATOR_ID,
        coordinatorName: 'Ana Torres',
        promovidoQuota: null,
        total: 80,
      },
    ]);

    const result = await new PrecampanaAnalyticsService(repository).getDashboardMetrics();

    expect(result.activeLeadersCount).toBe(2);
    expect(result.leadersMeetingQuota).toBe(1);
    expect(result.leadersWithoutQuota).toBe(1);
    expect(result.leaderEffectivenessPct).toBe(100);
    expect(result.byLeader[1]).toMatchObject({ target: null, coveragePct: null });
  });

  it('returns filter options from the repository catalog', async () => {
    const repository = baseRepository();
    repository.findFilterOptions.mockResolvedValue({
      sections: [{ id: SECTION_ID, sectionCode: '2401', votesRequired: 400, districtCode: '05' }],
      coordinators: [
        {
          id: COORDINATOR_ID,
          fullName: 'Ana Torres',
          sectionId: SECTION_ID,
          sectionCode: '2401',
          structureId: null,
          structureName: null,
        },
      ],
      leaders: [
        {
          id: LEADER_ID,
          fullName: 'Juan Pérez',
          coordinatorId: COORDINATOR_ID,
          coordinatorName: 'Ana Torres',
          sectionId: SECTION_ID,
          sectionCode: '2401',
          promovidoQuota: 10,
        },
      ],
    });

    const result = await new PrecampanaAnalyticsService(repository).getFilterOptions();
    expect(result.coordinators).toHaveLength(1);
    expect(result.leaders[0].coordinatorId).toBe(COORDINATOR_ID);
  });
});

describe('PrecampanaAnalyticsRepository sectionCode filters', () => {
  it('applies sectionCode to range and verified counts', async () => {
    const count = jest.fn<(args: unknown) => Promise<number>>().mockResolvedValue(0);
    const repository = new PrecampanaAnalyticsRepository({
      promovido: { count },
    } as unknown as PrecampanaPrismaLike);
    const filter = { sectionCode: '2401' };

    await repository.countActiveInRange(
      new Date('2026-08-01T00:00:00.000Z'),
      new Date('2026-09-01T00:00:00.000Z'),
      filter,
    );
    await repository.countVerifiedPromovidos(filter);

    expect(count).toHaveBeenNthCalledWith(1, {
      where: {
        isActive: true,
        createdAt: {
          gte: new Date('2026-08-01T00:00:00.000Z'),
          lt: new Date('2026-09-01T00:00:00.000Z'),
        },
        sectionCodeSnapshot: '2401',
      },
    });
    expect(count).toHaveBeenNthCalledWith(2, {
      where: {
        isActive: true,
        citizenId: { not: null },
        sectionCodeSnapshot: '2401',
      },
    });
  });

  it('applies coordinatorId through the leader relation', async () => {
    const count = jest.fn<(args: unknown) => Promise<number>>().mockResolvedValue(0);
    const repository = new PrecampanaAnalyticsRepository({
      promovido: { count },
    } as unknown as PrecampanaPrismaLike);
    const coordinatorId = '33333333-3333-4333-8333-333333333333';

    await repository.countActivePromovidos({ coordinatorId });

    expect(count).toHaveBeenCalledWith({
      where: {
        isActive: true,
        leader: { coordinatorId, isActive: true },
      },
    });
  });

  it('maps LEFT JOIN section rows with zero totals and operational fields', async () => {
    const queryRaw = jest.fn<(args: unknown) => Promise<unknown[]>>().mockResolvedValue([
      {
        sectionId: '11111111-1111-4111-8111-111111111111',
        sectionCode: '2401',
        pollingStationCount: 3,
        votesPerStation: 200,
        nominalList: 1500,
        votesRequired: 400,
        total: 0,
      },
    ]);
    const repository = new PrecampanaAnalyticsRepository({
      $queryRaw: queryRaw,
    } as unknown as PrecampanaPrismaLike);

    const rows = await repository.findAllSectionsWithCounts({
      coordinatorId: '33333333-3333-4333-8333-333333333333',
    });

    expect(rows).toEqual([
      {
        sectionId: '11111111-1111-4111-8111-111111111111',
        sectionCode: '2401',
        pollingStationCount: 3,
        votesPerStation: 200,
        nominalList: 1500,
        votesRequired: 400,
        total: 0,
      },
    ]);
    expect(queryRaw).toHaveBeenCalled();
  });

  it('maps coordinator quotaSum only when the SQL row provides it', async () => {
    const queryRaw = jest.fn<(args: unknown) => Promise<unknown[]>>().mockResolvedValue([
      {
        coordinatorId: '33333333-3333-4333-8333-333333333333',
        coordinatorName: 'Ana Torres',
        sectionId: '11111111-1111-4111-8111-111111111111',
        sectionCode: '2401',
        votesRequired: 400,
        total: 0,
        leaderCount: 2,
        leadersWithQuota: 1,
        quotaSum: null,
      },
    ]);
    const repository = new PrecampanaAnalyticsRepository({
      $queryRaw: queryRaw,
    } as unknown as PrecampanaPrismaLike);

    const rows = await repository.findAllCoordinatorsWithCounts();
    expect(rows[0]).toMatchObject({
      total: 0,
      quotaSum: null,
      leadersWithQuota: 1,
      leaderCount: 2,
    });
  });

  it('maps filter options including structure and coordinator names', async () => {
    const sectionFindMany = jest.fn<(args: unknown) => Promise<unknown[]>>().mockResolvedValue([
      {
        id: '11111111-1111-4111-8111-111111111111',
        sectionCode: '2401',
        votesRequired: 400,
        district: { code: '05' },
      },
    ]);
    const coordinatorFindMany = jest.fn<(args: unknown) => Promise<unknown[]>>().mockResolvedValue([
      {
        id: '33333333-3333-4333-8333-333333333333',
        fullName: 'Ana Torres',
        sectionId: '11111111-1111-4111-8111-111111111111',
        structureId: 'struct-1',
        structure: { name: 'Territorial' },
        section: { sectionCode: '2401' },
      },
    ]);
    const leaderFindMany = jest.fn<(args: unknown) => Promise<unknown[]>>().mockResolvedValue([
      {
        id: '22222222-2222-4222-8222-222222222222',
        fullName: 'Juan Pérez',
        coordinatorId: '33333333-3333-4333-8333-333333333333',
        sectionId: '11111111-1111-4111-8111-111111111111',
        promovidoQuota: 10,
        coordinator: { fullName: 'Ana Torres' },
        section: { sectionCode: '2401' },
      },
    ]);
    const repository = new PrecampanaAnalyticsRepository({
      section: { findMany: sectionFindMany },
      coordinator: { findMany: coordinatorFindMany },
      leader: { findMany: leaderFindMany },
    } as unknown as PrecampanaPrismaLike);

    const options = await repository.findFilterOptions();
    expect(options.sections[0].districtCode).toBe('05');
    expect(options.coordinators[0].structureName).toBe('Territorial');
    expect(options.leaders[0].coordinatorName).toBe('Ana Torres');
  });
});
