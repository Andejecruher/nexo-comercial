/**
 * PrecampanaAnalyticsService — Métricas del dashboard de precampaña (Promovidos)
 * y gestión de metas (PrecampaignGoal).
 *
 * Decisiones de diseño:
 * - El servicio orquesta varias lecturas del repositorio en paralelo (Promise.all)
 *   y agrega todo en un único objeto `PrecampanaDashboardMetrics`.
 * - Los porcentajes de progreso se calculan en memoria y se acuñan a 100.
 * - El incremento semanal (badge) se deriva del delta entre las dos últimas
 *   semanas del array `weeklyGrowth`; null cuando no hay semana previa o su total es 0.
 * - Validación de metas con Zod; fallos → AppError.badRequest.
 */

import { z, ZodError } from 'zod';
import {
  ActiveCoordinatorRef,
  ActiveLeaderRef,
  ActiveSectionRef,
  CoordinatorGroup,
  CreateGoalInput,
  GoalCadence,
  GoalListFilter,
  GoalScope,
  LeaderGroup,
  PrecampaignGoalWithContext,
  PrecampanaAnalyticsRepository,
  PrecampanaFilter,
  PrecampanaFilterOptions,
  PrecampanaPrismaLike,
  SectionGroup,
} from '../../repositories/precampana-analytics.repository';
import { AppError } from '../../utils/app-error';

const MS_PER_DAY = 86_400_000;
const DASHBOARD_WEEKS = 12;
const MAX_PERIOD_DAYS = 366;

// ── Tipos de la respuesta del dashboard ───────────────────────────────────────

export interface GlobalGoalMetrics {
  id: string;
  title: string;
  target: number;
  progressPct: number;
}

export interface CurrentWeekGoalMetrics {
  id: string;
  title: string;
  target: number;
  current: number;
  progressPct: number;
}

export type GoalResolutionSource =
  | 'EXACT'
  | 'LEADER_QUOTA_FALLBACK'
  | 'SECTION_FALLBACK'
  | 'GLOBAL_FALLBACK'
  | 'AGGREGATED_PERIOD'
  | 'SECTION_VOTES_REQUIRED';

export interface ResolvedGoalMetrics {
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
}

export interface SectionMetrics {
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
}

export interface NeighborhoodMetrics {
  neighborhood: string;
  total: number;
}

export interface LeaderMetrics {
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
}

export interface CoordinatorMetrics {
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
}

export interface WeeklyGrowthMetrics {
  weekStart: string;
  weekLabel: string;
  total: number;
  cumulative: number;
}

export interface SectionCoverage {
  sectionCode: string;
  total: number;
  coveragePct: number | null;
  votesRequired: number | null;
  target: number | null;
}

export interface WeeklyLeaderActivity {
  weekLabel: string; // S1, S2, ...
  topLeaderName: string;
  topLeaderCount: number;
}

export interface PrecampanaDashboardMetrics {
  total: number;
  daysActive: number;
  weeklyIncrementPct: number | null;
  globalGoal: GlobalGoalMetrics | null;
  currentWeekGoal: CurrentWeekGoalMetrics | null;
  resolvedGoal: ResolvedGoalMetrics | null;
  resolvedWeeklyGoal: ResolvedGoalMetrics | null;
  bySection: SectionMetrics[];
  byNeighborhood: NeighborhoodMetrics[];
  byLeader: LeaderMetrics[];
  byCoordinator: CoordinatorMetrics[];
  weeklyGrowth: WeeklyGrowthMetrics[];
  lastRegistrationDate: string | null;
  activeLeadersCount: number;
  leadersMeetingQuota: number;
  leadersWithoutQuota: number;
  leaderEffectivenessPct: number;
  verifiedPromovidos: number;
  dataQualityPct: number;
  sectionCoverage: SectionCoverage[];
  weeklyLeaderActivity: WeeklyLeaderActivity[];
}

type DashboardScope = GoalScope | 'COORDINATOR';

// ── Esquemas Zod de validación de metas ────────────────────────────────────────

const goalScopeSchema = z.enum(['GLOBAL', 'SECTION', 'LEADER']);
const goalCadenceSchema = z.enum(['CAMPAIGN', 'MONTHLY', 'WEEKLY']);

const createGoalSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, 'title es requerido')
      .max(100, 'title debe tener ≤ 100 caracteres'),
    target: z.coerce.number().int('target debe ser entero').min(1, 'target debe ser ≥ 1'),
    scope: goalScopeSchema,
    cadence: goalCadenceSchema,
    sectionId: z.string().uuid().nullable().optional().default(null),
    leaderId: z.string().uuid().nullable().optional().default(null),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    isActive: z.boolean().optional().default(true),
  })
  .superRefine((data, ctx) => {
    if (data.startDate >= data.endDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'startDate debe ser anterior a endDate',
        path: ['startDate'],
      });
    }
    const validBinding =
      (data.scope === 'GLOBAL' && !data.sectionId && !data.leaderId) ||
      (data.scope === 'SECTION' && !!data.sectionId && !data.leaderId) ||
      (data.scope === 'LEADER' && !data.sectionId && !!data.leaderId);
    if (!validBinding) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Los identificadores no corresponden al alcance seleccionado',
        path: ['scope'],
      });
    }
  });

const updateGoalSchema = z.object({
  title: z.string().trim().min(1).max(100).optional(),
  target: z.coerce.number().int().min(1).optional(),
  scope: goalScopeSchema.optional(),
  cadence: goalCadenceSchema.optional(),
  sectionId: z.string().uuid().nullable().optional(),
  leaderId: z.string().uuid().nullable().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  isActive: z.boolean().optional(),
});

interface GoalFilterContext {
  selectedScope: DashboardScope;
  section: ActiveSectionRef | null;
  leader: ActiveLeaderRef | null;
  coordinator: ActiveCoordinatorRef | null;
  countFilter: PrecampanaFilter;
  contextLabel: string;
}

interface ResolvedCandidate {
  goal: PrecampaignGoalWithContext;
  source: Exclude<
    GoalResolutionSource,
    'AGGREGATED_PERIOD' | 'LEADER_QUOTA_FALLBACK' | 'SECTION_VOTES_REQUIRED'
  >;
}

/**
 * Meta derivada de la cuota operativa del líder (`Leader.promovidoQuota`).
 * No tiene fila en `precampaign_goals`.
 */
interface LeaderQuotaCandidate {
  quotaTarget: number;
}

interface VotesRequiredCandidate {
  dynamicTarget: number;
  title: string;
}

type CampaignCandidate = ResolvedCandidate | LeaderQuotaCandidate | VotesRequiredCandidate;

function isLeaderQuotaCandidate(candidate: CampaignCandidate): candidate is LeaderQuotaCandidate {
  return 'quotaTarget' in candidate;
}

function isVotesRequiredCandidate(
  candidate: CampaignCandidate,
): candidate is VotesRequiredCandidate {
  return 'dynamicTarget' in candidate;
}

function positiveTarget(value: number | null | undefined): number | null {
  return value !== null && value !== undefined && value > 0 ? value : null;
}

function coveragePct(total: number, target: number | null): number | null {
  if (target === null) return null;
  const pct = Math.round((total / target) * 10000) / 100;
  return Math.min(100, Math.max(0, pct));
}

function toSectionMetrics(row: SectionGroup): SectionMetrics {
  const target = positiveTarget(row.votesRequired);
  return {
    sectionId: row.sectionId,
    sectionCode: row.sectionCode,
    pollingStationCount: row.pollingStationCount,
    votesPerStation: row.votesPerStation,
    nominalList: row.nominalList,
    votesRequired: row.votesRequired,
    total: row.total,
    target,
    coveragePct: coveragePct(row.total, target),
    goalSource: target !== null ? 'SECTION_VOTES_REQUIRED' : null,
  };
}

function toLeaderMetrics(row: LeaderGroup): LeaderMetrics {
  const target = positiveTarget(row.promovidoQuota);
  return {
    leaderId: row.leaderId,
    leaderName: row.leaderName,
    sectionId: row.sectionId,
    sectionCode: row.sectionCode,
    coordinatorId: row.coordinatorId,
    coordinatorName: row.coordinatorName,
    promovidoQuota: row.promovidoQuota,
    total: row.total,
    target,
    coveragePct: coveragePct(row.total, target),
    goalSource: target !== null ? 'LEADER_QUOTA' : null,
  };
}

function toCoordinatorMetrics(row: CoordinatorGroup): CoordinatorMetrics {
  const quotaTarget = positiveTarget(row.quotaSum);
  const sectionTarget = quotaTarget === null ? positiveTarget(row.votesRequired) : null;
  const target = quotaTarget ?? sectionTarget;
  const goalSource =
    quotaTarget !== null
      ? 'COORDINATOR_QUOTA_SUM'
      : sectionTarget !== null
        ? 'SECTION_VOTES_REQUIRED'
        : null;
  return {
    coordinatorId: row.coordinatorId,
    coordinatorName: row.coordinatorName,
    sectionId: row.sectionId,
    sectionCode: row.sectionCode,
    votesRequired: row.votesRequired,
    total: row.total,
    leaderCount: row.leaderCount,
    leadersWithQuota: row.leadersWithQuota,
    quotaSum: row.quotaSum,
    target,
    coveragePct: coveragePct(row.total, target),
    goalSource,
  };
}

// ── Servicio ──────────────────────────────────────────────────────────────────

export class PrecampanaAnalyticsService {
  private readonly repository: PrecampanaAnalyticsRepository;

  constructor(repositoryOrPrisma: PrecampanaAnalyticsRepository | PrecampanaPrismaLike) {
    this.repository =
      repositoryOrPrisma instanceof PrecampanaAnalyticsRepository
        ? repositoryOrPrisma
        : new PrecampanaAnalyticsRepository(repositoryOrPrisma);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private capPct(value: number): number {
    const pct = Math.round(value * 100) / 100;
    return Math.min(100, Math.max(0, pct));
  }

  private computeWeeklyIncrementPct(weekly: Array<{ total: number }>): number | null {
    if (weekly.length < 2) return null;
    const last = weekly[weekly.length - 1].total;
    const prev = weekly[weekly.length - 2].total;
    if (prev === 0) return null;
    return Math.round(((last - prev) / prev) * 10000) / 100;
  }

  private async resolveFilterContext(filter?: PrecampanaFilter): Promise<GoalFilterContext> {
    if (filter?.coordinatorId) {
      const coordinator = await this.repository.findActiveCoordinatorById(filter.coordinatorId);
      if (!coordinator) {
        throw AppError.badRequest('El coordinador seleccionado no existe o está inactivo');
      }
      return {
        selectedScope: 'COORDINATOR',
        section: coordinator.section,
        leader: null,
        coordinator,
        countFilter: { coordinatorId: coordinator.id },
        contextLabel: `Coordinador ${coordinator.fullName}`,
      };
    }

    if (filter?.leaderId) {
      const leader = await this.repository.findActiveLeaderById(filter.leaderId);
      if (!leader) throw AppError.badRequest('El líder seleccionado no existe o está inactivo');
      return {
        selectedScope: 'LEADER',
        section: leader.section,
        leader,
        coordinator: null,
        countFilter: { leaderId: leader.id },
        contextLabel: `Líder ${leader.fullName}`,
      };
    }

    if (filter?.sectionId || filter?.sectionCode) {
      const section = filter.sectionId
        ? await this.repository.findActiveSectionById(filter.sectionId)
        : await this.repository.findActiveSectionByCode(filter.sectionCode!);
      if (!section) throw AppError.badRequest('La sección seleccionada no existe o está inactiva');
      return {
        selectedScope: 'SECTION',
        section,
        leader: null,
        coordinator: null,
        countFilter: filter.sectionId
          ? { sectionId: section.id }
          : { sectionCode: section.sectionCode },
        contextLabel: `Sección ${section.sectionCode}`,
      };
    }

    return {
      selectedScope: 'GLOBAL',
      section: null,
      leader: null,
      coordinator: null,
      countFilter: {},
      contextLabel: 'Todo el equipo',
    };
  }

  private async resolveConfiguredGoal(
    cadence: GoalCadence,
    at: Date,
    context: GoalFilterContext,
  ): Promise<ResolvedCandidate | null> {
    if (context.selectedScope === 'LEADER' && context.leader) {
      const leaderGoal = await this.repository.findExactGoalAt(
        'LEADER',
        cadence,
        at,
        context.leader.id,
      );
      if (leaderGoal) return { goal: leaderGoal, source: 'EXACT' };

      const sectionGoal = await this.repository.findExactGoalAt(
        'SECTION',
        cadence,
        at,
        context.leader.sectionId,
      );
      if (sectionGoal) return { goal: sectionGoal, source: 'SECTION_FALLBACK' };
    }

    if (
      (context.selectedScope === 'SECTION' || context.selectedScope === 'COORDINATOR') &&
      context.section
    ) {
      const sectionGoal = await this.repository.findExactGoalAt(
        'SECTION',
        cadence,
        at,
        context.section.id,
      );
      if (sectionGoal) {
        return {
          goal: sectionGoal,
          source: context.selectedScope === 'SECTION' ? 'EXACT' : 'SECTION_FALLBACK',
        };
      }
    }

    const globalGoal = await this.repository.findExactGoalAt('GLOBAL', cadence, at);
    if (!globalGoal) return null;
    return {
      goal: globalGoal,
      source: context.selectedScope === 'GLOBAL' ? 'EXACT' : 'GLOBAL_FALLBACK',
    };
  }

  private async resolveGoalAt(
    cadence: GoalCadence,
    at: Date,
    context: GoalFilterContext,
  ): Promise<CampaignCandidate | null> {
    if (cadence === 'CAMPAIGN') {
      if (context.selectedScope === 'LEADER' && context.leader) {
        const leaderGoal = await this.repository.findExactGoalAt(
          'LEADER',
          'CAMPAIGN',
          at,
          context.leader.id,
        );
        if (leaderGoal) return { goal: leaderGoal, source: 'EXACT' };

        const quota = positiveTarget(context.leader.promovidoQuota);
        if (quota !== null) return { quotaTarget: quota };

        const votesRequired = positiveTarget(context.section?.votesRequired);
        if (votesRequired !== null) {
          return {
            dynamicTarget: votesRequired,
            title: 'Votos necesarios de la sección',
          };
        }
      }

      if (context.selectedScope === 'SECTION' || context.selectedScope === 'COORDINATOR') {
        const votesRequired = positiveTarget(context.section?.votesRequired);
        if (votesRequired !== null) {
          return {
            dynamicTarget: votesRequired,
            title:
              context.selectedScope === 'COORDINATOR'
                ? 'Aporte a la meta seccional'
                : 'Votos necesarios de la sección',
          };
        }
      }
    }

    return this.resolveConfiguredGoal(cadence, at, context);
  }

  /**
   * Métricas de la cuota del líder: sin fila de meta, el avance es todo lo
   * acumulado por el líder y el período va desde su primer promovido hasta hoy.
   */
  private async toLeaderQuotaMetrics(
    quotaTarget: number,
    context: GoalFilterContext,
    asOf: Date,
  ): Promise<ResolvedGoalMetrics> {
    const [current, firstCreatedAt] = await Promise.all([
      this.repository.countActivePromovidos(context.countFilter),
      this.repository.findFirstCreatedAt(context.countFilter),
    ]);
    const startDate = firstCreatedAt && firstCreatedAt < asOf ? firstCreatedAt : asOf;
    return {
      id: null,
      title: 'Cuota de promovidos asignada',
      scope: 'LEADER',
      cadence: 'CAMPAIGN',
      target: quotaTarget,
      current,
      progressPct: this.capPct((current / quotaTarget) * 100),
      startDate: startDate.toISOString(),
      endDate: asOf.toISOString(),
      contextLabel: context.contextLabel,
      resolutionSource: 'LEADER_QUOTA_FALLBACK',
      fallbackSources: [],
      includedGoals: 0,
      missingWeeks: [],
    };
  }

  private async toVotesRequiredMetrics(
    candidate: VotesRequiredCandidate,
    context: GoalFilterContext,
    asOf: Date,
  ): Promise<ResolvedGoalMetrics> {
    const [current, firstCreatedAt] = await Promise.all([
      this.repository.countActivePromovidos(context.countFilter),
      this.repository.findFirstCreatedAt(context.countFilter),
    ]);
    const startDate = firstCreatedAt && firstCreatedAt < asOf ? firstCreatedAt : asOf;
    return {
      id: null,
      title: candidate.title,
      scope: 'SECTION',
      cadence: 'CAMPAIGN',
      target: candidate.dynamicTarget,
      current,
      progressPct: this.capPct((current / candidate.dynamicTarget) * 100),
      startDate: startDate.toISOString(),
      endDate: asOf.toISOString(),
      contextLabel: context.contextLabel,
      resolutionSource: 'SECTION_VOTES_REQUIRED',
      fallbackSources: [],
      includedGoals: 0,
      missingWeeks: [],
    };
  }

  private async toResolvedMetrics(
    resolved: CampaignCandidate | null,
    context: GoalFilterContext,
    asOf: Date,
  ): Promise<ResolvedGoalMetrics | null> {
    if (!resolved) return null;
    if (isLeaderQuotaCandidate(resolved)) {
      return this.toLeaderQuotaMetrics(resolved.quotaTarget, context, asOf);
    }
    if (isVotesRequiredCandidate(resolved)) {
      return this.toVotesRequiredMetrics(resolved, context, asOf);
    }
    const countEnd = new Date(Math.min(asOf.getTime(), resolved.goal.endDate.getTime()));
    const current =
      countEnd > resolved.goal.startDate
        ? await this.repository.countActiveInRange(
            resolved.goal.startDate,
            countEnd,
            context.countFilter,
          )
        : 0;
    return {
      id: resolved.goal.id,
      title: resolved.goal.title,
      scope: resolved.goal.scope,
      cadence: resolved.goal.cadence,
      target: resolved.goal.target,
      current,
      progressPct: this.capPct((current / resolved.goal.target) * 100),
      startDate: resolved.goal.startDate.toISOString(),
      endDate: resolved.goal.endDate.toISOString(),
      contextLabel: context.contextLabel,
      resolutionSource: resolved.source,
      fallbackSources:
        resolved.source === 'SECTION_FALLBACK' || resolved.source === 'GLOBAL_FALLBACK'
          ? [resolved.source]
          : [],
      includedGoals: 1,
      missingWeeks: [],
    };
  }

  private async resolvePeriodGoal(
    rangeStart: Date,
    rangeEndExclusive: Date,
    context: GoalFilterContext,
  ): Promise<ResolvedGoalMetrics> {
    const rangeDays = (rangeEndExclusive.getTime() - rangeStart.getTime()) / MS_PER_DAY;
    if (rangeDays <= 0) throw AppError.badRequest('El rango debe tener una fecha final posterior');
    if (rangeDays > MAX_PERIOD_DAYS) {
      throw AppError.badRequest(`El rango no puede superar ${MAX_PERIOD_DAYS} días`);
    }

    const orderedGoalSets: Array<{
      source: ResolvedCandidate['source'];
      goals: PrecampaignGoalWithContext[];
    }> = [];
    if (context.selectedScope === 'LEADER' && context.leader) {
      const [leaderGoals, sectionGoals, globalGoals] = await Promise.all([
        this.repository.findWeeklyGoalsOverlapping(
          'LEADER',
          rangeStart,
          rangeEndExclusive,
          context.leader.id,
        ),
        this.repository.findWeeklyGoalsOverlapping(
          'SECTION',
          rangeStart,
          rangeEndExclusive,
          context.leader.sectionId,
        ),
        this.repository.findWeeklyGoalsOverlapping('GLOBAL', rangeStart, rangeEndExclusive),
      ]);
      orderedGoalSets.push(
        { source: 'EXACT', goals: leaderGoals },
        { source: 'SECTION_FALLBACK', goals: sectionGoals },
        { source: 'GLOBAL_FALLBACK', goals: globalGoals },
      );
    } else if (
      (context.selectedScope === 'SECTION' || context.selectedScope === 'COORDINATOR') &&
      context.section
    ) {
      const [sectionGoals, globalGoals] = await Promise.all([
        this.repository.findWeeklyGoalsOverlapping(
          'SECTION',
          rangeStart,
          rangeEndExclusive,
          context.section.id,
        ),
        this.repository.findWeeklyGoalsOverlapping('GLOBAL', rangeStart, rangeEndExclusive),
      ]);
      orderedGoalSets.push(
        {
          source: context.selectedScope === 'SECTION' ? 'EXACT' : 'SECTION_FALLBACK',
          goals: sectionGoals,
        },
        { source: 'GLOBAL_FALLBACK', goals: globalGoals },
      );
    } else {
      orderedGoalSets.push({
        source: 'EXACT',
        goals: await this.repository.findWeeklyGoalsOverlapping(
          'GLOBAL',
          rangeStart,
          rangeEndExclusive,
        ),
      });
    }

    const included = new Map<string, ResolvedCandidate>();
    const missingWeeks: string[] = [];
    const firstDay = new Date(
      Date.UTC(
        rangeStart.getUTCFullYear(),
        rangeStart.getUTCMonth(),
        rangeStart.getUTCDate() - ((rangeStart.getUTCDay() + 6) % 7),
      ),
    );

    for (
      let weekStart = firstDay;
      weekStart < rangeEndExclusive;
      weekStart = new Date(weekStart.getTime() + 7 * MS_PER_DAY)
    ) {
      const weekEnd = new Date(weekStart.getTime() + 7 * MS_PER_DAY);
      const slotStart = new Date(Math.max(weekStart.getTime(), rangeStart.getTime()));
      const slotEnd = new Date(Math.min(weekEnd.getTime(), rangeEndExclusive.getTime()));
      const matchedSet = orderedGoalSets.find(({ goals }) =>
        goals.some((goal) => goal.startDate < slotEnd && goal.endDate > slotStart),
      );
      const matchedGoal = matchedSet?.goals.find(
        (goal) => goal.startDate < slotEnd && goal.endDate > slotStart,
      );
      if (matchedSet && matchedGoal) {
        included.set(matchedGoal.id, { goal: matchedGoal, source: matchedSet.source });
      } else {
        missingWeeks.push(weekStart.toISOString().slice(0, 10));
      }
    }

    const includedGoals = [...included.values()];
    const target = includedGoals.reduce((sum, item) => sum + item.goal.target, 0);
    const current = await this.repository.countActiveInRange(
      rangeStart,
      rangeEndExclusive,
      context.countFilter,
    );
    const scopes = new Set(includedGoals.map((item) => item.goal.scope));
    const fallbackSources = [
      ...new Set(
        includedGoals
          .map((item) => item.source)
          .filter((source): source is 'SECTION_FALLBACK' | 'GLOBAL_FALLBACK' => source !== 'EXACT'),
      ),
    ];

    return {
      id: includedGoals.length === 1 ? includedGoals[0].goal.id : null,
      title: includedGoals.length === 1 ? includedGoals[0].goal.title : 'Meta del período',
      scope: scopes.size === 1 ? (includedGoals[0]?.goal.scope ?? null) : null,
      cadence: 'PERIOD',
      target,
      current,
      progressPct: target > 0 ? this.capPct((current / target) * 100) : 0,
      startDate: rangeStart.toISOString(),
      endDate: rangeEndExclusive.toISOString(),
      contextLabel: context.contextLabel,
      resolutionSource: 'AGGREGATED_PERIOD',
      fallbackSources,
      includedGoals: includedGoals.length,
      missingWeeks,
    };
  }

  // ── Dashboard ────────────────────────────────────────────────────────────────

  async getDashboardMetrics(filter?: PrecampanaFilter): Promise<PrecampanaDashboardMetrics> {
    const now = new Date();
    const context = await this.resolveFilterContext(filter);
    const globalContext: GoalFilterContext = {
      selectedScope: 'GLOBAL',
      section: null,
      leader: null,
      coordinator: null,
      countFilter: {},
      contextLabel: 'Todo el equipo',
    };

    const resolvedCampaignPromise = this.resolveGoalAt('CAMPAIGN', now, context);
    const resolvedWeeklyPromise = this.resolveGoalAt('WEEKLY', now, context);
    const globalCampaignPromise =
      context.selectedScope === 'GLOBAL'
        ? resolvedCampaignPromise
        : this.resolveGoalAt('CAMPAIGN', now, globalContext);
    const globalWeeklyPromise =
      context.selectedScope === 'GLOBAL'
        ? resolvedWeeklyPromise
        : this.resolveGoalAt('WEEKLY', now, globalContext);

    const [
      total,
      firstCreatedAt,
      lastCreatedAt,
      verifiedPromovidos,
      sectionRows,
      byNeighborhood,
      leaderRows,
      coordinatorRows,
      weeklyGrowth,
      weeklyLeaderActivityRaw,
      resolvedCampaignCandidate,
      resolvedWeeklyCandidate,
      globalCampaignCandidate,
      globalWeeklyCandidate,
    ] = await Promise.all([
      this.repository.countActivePromovidos(filter),
      this.repository.findFirstCreatedAt(filter),
      this.repository.findLastCreatedAt(filter),
      this.repository.countVerifiedPromovidos(filter),
      this.repository.findAllSectionsWithCounts(filter),
      this.repository.groupByNeighborhood(filter),
      this.repository.findAllLeadersWithCounts(filter),
      this.repository.findAllCoordinatorsWithCounts(filter),
      this.repository.weeklyGrowth(DASHBOARD_WEEKS, filter),
      this.repository.weeklyLeaderActivity(DASHBOARD_WEEKS, filter),
      resolvedCampaignPromise,
      resolvedWeeklyPromise,
      globalCampaignPromise,
      globalWeeklyPromise,
    ]);

    const daysActive = firstCreatedAt
      ? Math.floor((now.getTime() - firstCreatedAt.getTime()) / MS_PER_DAY)
      : 0;

    const [globalCampaignMetrics, globalWeeklyMetrics] = await Promise.all([
      this.toResolvedMetrics(globalCampaignCandidate, globalContext, now),
      this.toResolvedMetrics(globalWeeklyCandidate, globalContext, now),
    ]);

    const globalGoal: GlobalGoalMetrics | null =
      globalCampaignMetrics && globalCampaignMetrics.id
        ? {
            id: globalCampaignMetrics.id,
            title: globalCampaignMetrics.title,
            target: globalCampaignMetrics.target,
            progressPct: globalCampaignMetrics.progressPct,
          }
        : null;

    const currentWeekGoal: CurrentWeekGoalMetrics | null =
      globalWeeklyMetrics && globalWeeklyMetrics.id
        ? {
            id: globalWeeklyMetrics.id,
            title: globalWeeklyMetrics.title,
            target: globalWeeklyMetrics.target,
            current: globalWeeklyMetrics.current,
            progressPct: globalWeeklyMetrics.progressPct,
          }
        : null;

    let resolvedGoal: ResolvedGoalMetrics | null;
    let resolvedWeeklyGoal: ResolvedGoalMetrics | null;
    if (filter?.from && filter.to) {
      resolvedGoal = await this.resolvePeriodGoal(filter.from, filter.to, context);
      resolvedWeeklyGoal = resolvedGoal;
    } else {
      [resolvedGoal, resolvedWeeklyGoal] = await Promise.all([
        this.toResolvedMetrics(resolvedCampaignCandidate, context, now),
        this.toResolvedMetrics(resolvedWeeklyCandidate, context, now),
      ]);
    }

    const dataQualityPct = total > 0 ? this.capPct((verifiedPromovidos / total) * 100) : 0;

    const bySection = sectionRows.map(toSectionMetrics);
    const byLeader = leaderRows.map(toLeaderMetrics);
    const byCoordinator = coordinatorRows.map(toCoordinatorMetrics);

    const activeLeadersCount = byLeader.length;
    const leadersWithQuota = byLeader.filter((leader) => leader.target !== null);
    const leadersMeetingQuota = leadersWithQuota.filter(
      (leader) => leader.total >= (leader.target ?? 0),
    ).length;
    const leadersWithoutQuota = activeLeadersCount - leadersWithQuota.length;
    const leaderEffectivenessPct =
      leadersWithQuota.length > 0
        ? this.capPct((leadersMeetingQuota / leadersWithQuota.length) * 100)
        : 0;

    const sectionCoverage: SectionCoverage[] = bySection.map((section) => ({
      sectionCode: section.sectionCode,
      total: section.total,
      coveragePct: section.coveragePct,
      votesRequired: section.votesRequired,
      target: section.target,
    }));

    const weeklyLeaderActivity: WeeklyLeaderActivity[] = weeklyLeaderActivityRaw.map((w) => ({
      weekLabel: w.weekLabel,
      topLeaderName: w.topLeaderName,
      topLeaderCount: w.topLeaderCount,
    }));

    return {
      total,
      daysActive,
      weeklyIncrementPct: this.computeWeeklyIncrementPct(weeklyGrowth),
      globalGoal,
      currentWeekGoal,
      resolvedGoal,
      resolvedWeeklyGoal,
      bySection,
      byNeighborhood,
      byLeader,
      byCoordinator,
      weeklyGrowth,
      lastRegistrationDate: lastCreatedAt ? lastCreatedAt.toISOString() : null,
      activeLeadersCount,
      leadersMeetingQuota,
      leadersWithoutQuota,
      leaderEffectivenessPct,
      verifiedPromovidos,
      dataQualityPct,
      sectionCoverage,
      weeklyLeaderActivity,
    };
  }

  getFilterOptions(): Promise<PrecampanaFilterOptions> {
    return this.repository.findFilterOptions();
  }

  // ── Metas ────────────────────────────────────────────────────────────────────

  getGoals(filter: GoalListFilter = {}): Promise<PrecampaignGoalWithContext[]> {
    return this.repository.findActiveGoals(filter);
  }

  async createGoal(input: unknown): Promise<PrecampaignGoalWithContext> {
    let data: CreateGoalInput;
    try {
      data = createGoalSchema.parse(input);
    } catch (err) {
      if (err instanceof ZodError) {
        throw AppError.badRequest(
          `Validación de meta fallida: ${err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
        );
      }
      throw err;
    }
    await this.validateGoalReferences(data);
    if (data.isActive && (await this.repository.findOverlappingGoal(data))) {
      throw AppError.conflict(
        'Ya existe una meta activa superpuesta para el mismo alcance y cadencia',
      );
    }
    return this.repository.createGoal(data);
  }

  async updateGoal(id: string, input: unknown): Promise<PrecampaignGoalWithContext> {
    const existing = await this.repository.findGoalById(id);
    if (!existing) {
      throw AppError.notFound('Meta no encontrada');
    }
    let data: CreateGoalInput;
    try {
      const patch = updateGoalSchema.parse(input);
      data = createGoalSchema.parse({
        title: patch.title ?? existing.title,
        target: patch.target ?? existing.target,
        scope: patch.scope ?? existing.scope,
        cadence: patch.cadence ?? existing.cadence,
        sectionId: patch.sectionId === undefined ? existing.sectionId : patch.sectionId,
        leaderId: patch.leaderId === undefined ? existing.leaderId : patch.leaderId,
        startDate: patch.startDate ?? existing.startDate,
        endDate: patch.endDate ?? existing.endDate,
        isActive: patch.isActive ?? existing.isActive,
      });
    } catch (err) {
      if (err instanceof ZodError) {
        throw AppError.badRequest(
          `Validación de meta fallida: ${err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
        );
      }
      throw err;
    }
    await this.validateGoalReferences(data);
    if (data.isActive && (await this.repository.findOverlappingGoal(data, id))) {
      throw AppError.conflict(
        'Ya existe una meta activa superpuesta para el mismo alcance y cadencia',
      );
    }
    return this.repository.updateGoal(id, data);
  }

  async deactivateGoal(id: string): Promise<PrecampaignGoalWithContext> {
    const existing = await this.repository.findGoalById(id);
    if (!existing) {
      throw AppError.notFound('Meta no encontrada');
    }
    return this.repository.deactivateGoal(id);
  }

  private async validateGoalReferences(data: CreateGoalInput): Promise<void> {
    if (data.scope === 'SECTION') {
      const section = await this.repository.findActiveSectionById(data.sectionId!);
      if (!section) throw AppError.badRequest('La sección seleccionada no existe o está inactiva');
    }
    if (data.scope === 'LEADER') {
      const leader = await this.repository.findActiveLeaderById(data.leaderId!);
      if (!leader) throw AppError.badRequest('El líder seleccionado no existe o está inactivo');
    }
  }
}
