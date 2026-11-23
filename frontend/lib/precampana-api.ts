/**
 * Precampana (Promovidos) analytics API client.
 *
 * Mirrors the pattern in `promovidos-api.ts`: typed methods over `apiClient`,
 * URLSearchParams for optional query params, returns the raw `ApiResponse<T>`.
 */

import { apiClient } from '@/lib/api-client';

export type GoalScope = 'GLOBAL' | 'SECTION' | 'LEADER';
export type GoalCadence = 'CAMPAIGN' | 'MONTHLY' | 'WEEKLY';
export type GoalResolutionSource =
  | 'EXACT'
  | 'LEADER_QUOTA_FALLBACK'
  | 'SECTION_FALLBACK'
  | 'GLOBAL_FALLBACK'
  | 'AGGREGATED_PERIOD'
  | 'SECTION_VOTES_REQUIRED';

export type PrecampanaGoal = {
  id: string;
  title: string;
  target: number;
  scope: GoalScope;
  cadence: GoalCadence;
  sectionId: string | null;
  leaderId: string | null;
  startDate: string;
  endDate: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  section: { id: string; sectionCode: string } | null;
  leader: { id: string; fullName: string; sectionId: string } | null;
};

export type PrecampanaGoalPayload = {
  title: string;
  target: number;
  scope: GoalScope;
  cadence: GoalCadence;
  sectionId?: string | null;
  leaderId?: string | null;
  startDate: string;
  endDate: string;
  isActive?: boolean;
};

export type ResolvedGoalMetrics = {
  id: string | null;
  title: string;
  scope: GoalScope | null;
  cadence: GoalCadence | 'PERIOD';
  target: number;
  current: number;
  progressPct: number;
  startDate: string;
  endDate: string;
  contextLabel: string;
  resolutionSource: GoalResolutionSource;
  fallbackSources: Array<'SECTION_FALLBACK' | 'GLOBAL_FALLBACK'>;
  includedGoals: number;
  missingWeeks: string[];
};

export type PrecampanaGoalSummary = {
  id: string;
  title: string;
  target: number;
  progressPct: number;
};

export type SectionMetrics = {
  sectionId: string;
  sectionCode: string;
  pollingStationCount: number | null;
  votesPerStation: number | null;
  nominalList: number | null;
  votesRequired: number | null;
  total: number;
  target: number | null;
  coveragePct: number | null;
  goalSource: 'SECTION_VOTES_REQUIRED' | null;
};

export type LeaderMetrics = {
  leaderId: string;
  leaderName: string;
  sectionId: string;
  sectionCode: string;
  coordinatorId: string;
  coordinatorName: string;
  promovidoQuota: number | null;
  total: number;
  target: number | null;
  coveragePct: number | null;
  goalSource: 'LEADER_QUOTA' | null;
};

export type CoordinatorMetrics = {
  coordinatorId: string;
  coordinatorName: string;
  sectionId: string;
  sectionCode: string;
  votesRequired: number | null;
  total: number;
  leaderCount: number;
  leadersWithQuota: number;
  quotaSum: number | null;
  target: number | null;
  coveragePct: number | null;
  goalSource: 'COORDINATOR_QUOTA_SUM' | 'SECTION_VOTES_REQUIRED' | null;
};

export type PrecampanaDashboardMetrics = {
  total: number;
  daysActive: number;
  weeklyIncrementPct: number | null;
  globalGoal: PrecampanaGoalSummary | null;
  currentWeekGoal: {
    id: string;
    title: string;
    target: number;
    current: number;
    progressPct: number;
  } | null;
  resolvedGoal: ResolvedGoalMetrics | null;
  resolvedWeeklyGoal: ResolvedGoalMetrics | null;
  bySection: SectionMetrics[];
  byNeighborhood: { neighborhood: string; total: number }[];
  byLeader: LeaderMetrics[];
  byCoordinator: CoordinatorMetrics[];
  weeklyGrowth: { weekStart: string; weekLabel: string; total: number; cumulative: number }[];
  lastRegistrationDate: string | null;
  activeLeadersCount: number;
  leadersMeetingQuota: number;
  leadersWithoutQuota: number;
  leaderEffectivenessPct: number;
  verifiedPromovidos: number;
  dataQualityPct: number;
  sectionCoverage: {
    sectionCode: string;
    total: number;
    coveragePct: number | null;
    votesRequired: number | null;
    target: number | null;
  }[];
  weeklyLeaderActivity: { weekLabel: string; topLeaderName: string; topLeaderCount: number }[];
};

export type PrecampanaDashboardFilter = {
  sectionId?: string;
  sectionCode?: string;
  leaderId?: string;
  coordinatorId?: string;
  from?: string;
  to?: string;
};

export type PrecampanaFilterSectionOption = {
  id: string;
  sectionCode: string;
  votesRequired: number | null;
  districtCode: string | null;
};

export type PrecampanaFilterCoordinatorOption = {
  id: string;
  fullName: string;
  sectionId: string;
  sectionCode: string;
  structureId: string | null;
  structureName: string | null;
};

export type PrecampanaFilterLeaderOption = {
  id: string;
  fullName: string;
  coordinatorId: string | null;
  coordinatorName: string | null;
  sectionId: string;
  sectionCode: string;
  promovidoQuota: number | null;
};

export type PrecampanaFilterOptions = {
  sections: PrecampanaFilterSectionOption[];
  coordinators: PrecampanaFilterCoordinatorOption[];
  leaders: PrecampanaFilterLeaderOption[];
};

export const EMPTY_PRECAMPANA_METRICS: PrecampanaDashboardMetrics = {
  total: 0,
  daysActive: 0,
  weeklyIncrementPct: null,
  globalGoal: null,
  currentWeekGoal: null,
  resolvedGoal: null,
  resolvedWeeklyGoal: null,
  bySection: [],
  byNeighborhood: [],
  byLeader: [],
  byCoordinator: [],
  weeklyGrowth: [],
  lastRegistrationDate: null,
  activeLeadersCount: 0,
  leadersMeetingQuota: 0,
  leadersWithoutQuota: 0,
  leaderEffectivenessPct: 0,
  verifiedPromovidos: 0,
  dataQualityPct: 0,
  sectionCoverage: [],
  weeklyLeaderActivity: [],
};

export const precampanaApi = {
  dashboard(filter?: PrecampanaDashboardFilter) {
    const params = new URLSearchParams();
    if (filter?.sectionId) params.set('sectionId', filter.sectionId);
    if (filter?.sectionCode) params.set('sectionCode', filter.sectionCode);
    if (filter?.leaderId) params.set('leaderId', filter.leaderId);
    if (filter?.coordinatorId) params.set('coordinatorId', filter.coordinatorId);
    if (filter?.from) params.set('from', filter.from);
    if (filter?.to) params.set('to', filter.to);
    const suffix = params.size ? `?${params.toString()}` : '';
    return apiClient.get<PrecampanaDashboardMetrics>(`/analytics/precampana/dashboard${suffix}`);
  },
  filterOptions() {
    return apiClient.get<PrecampanaFilterOptions>('/analytics/precampana/filter-options');
  },
  listGoals(filter?: { scope?: GoalScope; cadence?: GoalCadence }) {
    const params = new URLSearchParams();
    if (filter?.scope) params.set('scope', filter.scope);
    if (filter?.cadence) params.set('cadence', filter.cadence);
    const suffix = params.size ? `?${params.toString()}` : '';
    return apiClient.get<PrecampanaGoal[]>(`/analytics/precampana/goals${suffix}`);
  },
  createGoal(payload: PrecampanaGoalPayload) {
    return apiClient.post<PrecampanaGoal>('/analytics/precampana/goals', payload);
  },
  updateGoal(id: string, payload: Partial<PrecampanaGoalPayload>) {
    return apiClient.patch<PrecampanaGoal>(`/analytics/precampana/goals/${id}`, payload);
  },
  deactivateGoal(id: string) {
    return apiClient.patch<PrecampanaGoal>(`/analytics/precampana/goals/${id}/deactivate`, {});
  },
};
