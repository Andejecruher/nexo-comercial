/**
 * PrecampanaAnalyticsRepository — Acceso a datos para el dashboard de precampaña.
 *
 * Expone lecturas sobre `promovido` (conteos, agrupaciones por sección/lider/colonia,
 * crecimiento semanal) y CRUD sobre `precampaignGoal`.
 *
 * Re-exporta los tipos generados por Prisma para que
 * service y controller puedan importarlos desde aquí sin depender directamente de
 * `@prisma/client`. La abstracción `PrecampanaPrismaLike` (un Pick del PrismaClient
 * real) permite inyectar dobles en tests sin perder type-safety ni recurrir a `as any`.
 */
import { type GoalCadence, type GoalScope, Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../services/prisma.service';
import { AppError } from '../utils/app-error';

// ── Re-export de tipos generados por Prisma ───────────────────────────────────

export type { GoalCadence, GoalScope };

const goalInclude = {
  section: { select: { id: true, sectionCode: true } },
  leader: { select: { id: true, fullName: true, sectionId: true } },
} satisfies Prisma.PrecampaignGoalInclude;

const activeSectionSelect = {
  id: true,
  sectionCode: true,
  pollingStationCount: true,
  votesPerStation: true,
  nominalList: true,
  votesRequired: true,
} as const;

export type PrecampaignGoalWithContext = Prisma.PrecampaignGoalGetPayload<{
  include: typeof goalInclude;
}>;

// ── Filtro compartido por todas las lecturas del dashboard ─────────────────────

/**
 * Filtro opcional aplicable a todas las lecturas de promovidos.
 * - `sectionId` / `leaderId` / `coordinatorId`: igualdad exacta sobre las FK.
 * - `from` / `to`: rango semiabierto sobre `createdAt` (`from <= value < to`).
 */
export type PrecampanaFilter = {
  sectionId?: string;
  sectionCode?: string;
  leaderId?: string;
  coordinatorId?: string;
  from?: Date; // createdAt >= from
  to?: Date; // createdAt < to
};

// ── Abstracción del cliente Prisma para tests ──────────────────────────────────

/**
 * Subset del PrismaClient que este repositorio necesita. Al ser un `Pick` del
 * cliente real, cualquier refactor de Prisma se propaga como error de tipos aquí,
 * en lugar de requerir mantener una interfaz manual sincronizada.
 */
export type PrecampanaPrismaLike = Pick<
  PrismaClient,
  | 'promovido'
  | 'precampaignGoal'
  | 'section'
  | 'leader'
  | 'coordinator'
  | '$queryRaw'
  | '$transaction'
>;

// ── Tipos de resultados de agrupaciones ────────────────────────────────────────

export interface SectionGroup {
  sectionId: string;
  sectionCode: string;
  pollingStationCount: number | null;
  votesPerStation: number | null;
  nominalList: number | null;
  votesRequired: number | null;
  total: number;
}

export interface LeaderGroup {
  leaderId: string;
  leaderName: string;
  sectionId: string;
  sectionCode: string;
  coordinatorId: string;
  coordinatorName: string;
  promovidoQuota: number | null;
  total: number;
}

export interface CoordinatorGroup {
  coordinatorId: string;
  coordinatorName: string;
  sectionId: string;
  sectionCode: string;
  votesRequired: number | null;
  total: number;
  leaderCount: number;
  leadersWithQuota: number;
  quotaSum: number | null;
}

export interface NeighborhoodGroup {
  neighborhood: string;
  total: number;
}

export interface WeeklyGrowthPoint {
  weekStart: string;
  weekLabel: string;
  total: number;
  cumulative: number;
}

export interface WeeklyLeaderActivityPoint {
  weekStart: string;
  weekLabel: string;
  topLeaderName: string;
  topLeaderCount: number;
}

export interface FilterSectionOption {
  id: string;
  sectionCode: string;
  votesRequired: number | null;
  districtCode: string | null;
}

export interface FilterCoordinatorOption {
  id: string;
  fullName: string;
  sectionId: string;
  sectionCode: string;
  structureId: string | null;
  structureName: string | null;
}

export interface FilterLeaderOption {
  id: string;
  fullName: string;
  coordinatorId: string | null;
  coordinatorName: string | null;
  sectionId: string;
  sectionCode: string;
  promovidoQuota: number | null;
}

export interface PrecampanaFilterOptions {
  sections: FilterSectionOption[];
  coordinators: FilterCoordinatorOption[];
  leaders: FilterLeaderOption[];
}

// ── Payloads de escritura ──────────────────────────────────────────────────────

export interface CreateGoalInput {
  title: string;
  target: number;
  scope: GoalScope;
  cadence: GoalCadence;
  sectionId: string | null;
  leaderId: string | null;
  startDate: Date;
  endDate: Date;
  isActive: boolean;
}

export interface GoalListFilter {
  scope?: GoalScope;
  cadence?: GoalCadence;
}

export interface ActiveSectionRef {
  id: string;
  sectionCode: string;
  pollingStationCount: number | null;
  votesPerStation: number | null;
  nominalList: number | null;
  votesRequired: number | null;
}

export interface ActiveLeaderRef {
  id: string;
  fullName: string;
  sectionId: string;
  coordinatorId: string;
  promovidoQuota: number | null;
  section: ActiveSectionRef;
}

export interface ActiveCoordinatorRef {
  id: string;
  fullName: string;
  sectionId: string;
  section: ActiveSectionRef;
}

function toNullableInt(value: bigint | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return Number(value);
}

function toInt(value: bigint | number | null | undefined): number {
  return toNullableInt(value) ?? 0;
}

// ── Repositorio ────────────────────────────────────────────────────────────────

export class PrecampanaAnalyticsRepository {
  constructor(private readonly prisma: PrismaService | PrecampanaPrismaLike) {}

  // ── Helpers de filtro ─────────────────────────────────────────────────────────

  /**
   * Construye un `Prisma.PromovidoWhereInput` con `isActive: true` + los campos
   * del filtro presentes. Pensado para las queries vía Prisma Client.
   */
  private buildWhere(filter?: PrecampanaFilter): Prisma.PromovidoWhereInput {
    const where: Prisma.PromovidoWhereInput = { isActive: true };
    if (filter?.sectionId) where.sectionId = filter.sectionId;
    if (filter?.sectionCode) where.sectionCodeSnapshot = filter.sectionCode;
    if (filter?.leaderId) where.leaderId = filter.leaderId;
    if (filter?.coordinatorId) {
      where.leader = { coordinatorId: filter.coordinatorId, isActive: true };
    }
    if (filter?.from || filter?.to) {
      where.createdAt = {};
      if (filter.from) where.createdAt.gte = filter.from;
      if (filter.to) where.createdAt.lt = filter.to;
    }
    return where;
  }

  /**
   * Construye un fragmento `Prisma.sql` con las condiciones adicionales
   * (prefijadas con `AND`) para insertar dentro del `WHERE` de un raw SQL.
   * Devuelve `Prisma.empty` cuando no hay condiciones, así el template queda
   * inofensivo. Todos los valores se inyectan como parámetros (sin concatenación).
   */
  private buildRawFilter(filter?: PrecampanaFilter): Prisma.Sql {
    if (!filter) return Prisma.empty;
    const fragments: Prisma.Sql[] = [];
    if (filter.sectionId) {
      fragments.push(Prisma.sql`AND p.section_id = ${filter.sectionId}::uuid`);
    }
    if (filter.sectionCode) {
      fragments.push(Prisma.sql`AND p.section_code_snapshot = ${filter.sectionCode}`);
    }
    if (filter.leaderId) {
      fragments.push(Prisma.sql`AND p.leader_id = ${filter.leaderId}::uuid`);
    }
    if (filter.coordinatorId) {
      fragments.push(Prisma.sql`
        AND p.leader_id IN (
          SELECT id FROM leaders
          WHERE coordinator_id = ${filter.coordinatorId}::uuid AND is_active = true
        )
      `);
    }
    if (filter.from) {
      fragments.push(Prisma.sql`AND p.created_at >= ${filter.from}`);
    }
    if (filter.to) {
      fragments.push(Prisma.sql`AND p.created_at < ${filter.to}`);
    }
    if (fragments.length === 0) return Prisma.empty;
    return Prisma.join(fragments, ' ');
  }

  private buildRawSectionScope(filter?: PrecampanaFilter): Prisma.Sql {
    if (filter?.coordinatorId) {
      return Prisma.sql`AND s.id = (SELECT section_id FROM coordinators WHERE id = ${filter.coordinatorId}::uuid)`;
    }
    if (filter?.leaderId) {
      return Prisma.sql`AND s.id = (SELECT section_id FROM leaders WHERE id = ${filter.leaderId}::uuid)`;
    }
    if (filter?.sectionId) {
      return Prisma.sql`AND s.id = ${filter.sectionId}::uuid`;
    }
    if (filter?.sectionCode) {
      return Prisma.sql`AND s.section_code = ${filter.sectionCode}`;
    }
    return Prisma.empty;
  }

  private buildRawLeaderScope(filter?: PrecampanaFilter): Prisma.Sql {
    if (filter?.coordinatorId) {
      return Prisma.sql`AND l.coordinator_id = ${filter.coordinatorId}::uuid`;
    }
    if (filter?.leaderId) {
      return Prisma.sql`AND l.id = ${filter.leaderId}::uuid`;
    }
    if (filter?.sectionId) {
      return Prisma.sql`AND l.section_id = ${filter.sectionId}::uuid`;
    }
    if (filter?.sectionCode) {
      return Prisma.sql`AND s.section_code = ${filter.sectionCode}`;
    }
    return Prisma.empty;
  }

  private buildRawCoordinatorScope(filter?: PrecampanaFilter): Prisma.Sql {
    if (filter?.coordinatorId) {
      return Prisma.sql`AND c.id = ${filter.coordinatorId}::uuid`;
    }
    if (filter?.leaderId) {
      return Prisma.sql`AND c.id = (SELECT coordinator_id FROM leaders WHERE id = ${filter.leaderId}::uuid)`;
    }
    if (filter?.sectionId) {
      return Prisma.sql`AND c.section_id = ${filter.sectionId}::uuid`;
    }
    if (filter?.sectionCode) {
      return Prisma.sql`AND s.section_code = ${filter.sectionCode}`;
    }
    return Prisma.empty;
  }

  // ── Promovidos ───────────────────────────────────────────────────────────────

  /** Total de promovidos activos (aprovecha el índice [isActive, createdAt]). */
  countActivePromovidos(filter?: PrecampanaFilter): Promise<number> {
    return this.prisma.promovido.count({ where: this.buildWhere(filter) });
  }

  /** Fecha de creación del promovido más antiguo (para calcular días activos). */
  async findFirstCreatedAt(filter?: PrecampanaFilter): Promise<Date | null> {
    const row = await this.prisma.promovido.findFirst({
      where: this.buildWhere(filter),
      orderBy: { createdAt: 'asc' },
      take: 1,
      select: { createdAt: true },
    });
    return row?.createdAt ?? null;
  }

  /** Fecha de creación del promovido más reciente (último registro cargado). */
  async findLastCreatedAt(filter?: PrecampanaFilter): Promise<Date | null> {
    const row = await this.prisma.promovido.findFirst({
      where: this.buildWhere(filter),
      orderBy: { createdAt: 'desc' },
      take: 1,
      select: { createdAt: true },
    });
    return row?.createdAt ?? null;
  }

  /** Conteo de promovidos activos creados dentro del rango [from, to). */
  countActiveInRange(from: Date, to: Date, filter?: PrecampanaFilter): Promise<number> {
    return this.prisma.promovido.count({
      where: this.buildWhere({ ...filter, from, to }),
    });
  }

  /**
   * Todas las secciones activas del alcance, con ceros cuando no hay promovidos
   * que coincidan con el filtro temporal.
   */
  async findAllSectionsWithCounts(filter?: PrecampanaFilter): Promise<SectionGroup[]> {
    const extraFilter = this.buildRawFilter(filter);
    const scopeFilter = this.buildRawSectionScope(filter);
    const rows = await this.prisma.$queryRaw<
      Array<{
        sectionId: string;
        sectionCode: string;
        pollingStationCount: number | null;
        votesPerStation: number | null;
        nominalList: number | null;
        votesRequired: bigint | number | null;
        total: bigint | number;
      }>
    >`
      SELECT s.id AS "sectionId",
             s.section_code AS "sectionCode",
             s.numero_casillas AS "pollingStationCount",
             s.votos_por_casilla AS "votesPerStation",
             s.lista_nominal AS "nominalList",
             s.votos_necesarios AS "votesRequired",
             COALESCE(p_agg.total, 0)::int AS total
      FROM sections s
      LEFT JOIN (
        SELECT p.section_id, COUNT(*)::int AS total
        FROM promovidos p
        WHERE p.is_active = true
          ${extraFilter}
        GROUP BY p.section_id
      ) p_agg ON p_agg.section_id = s.id
      WHERE s.is_active = true
        ${scopeFilter}
      ORDER BY total DESC, s.section_code ASC
    `;
    return rows.map((r) => ({
      sectionId: r.sectionId,
      sectionCode: r.sectionCode,
      pollingStationCount: r.pollingStationCount,
      votesPerStation: r.votesPerStation,
      nominalList: r.nominalList,
      votesRequired: toNullableInt(r.votesRequired),
      total: toInt(r.total),
    }));
  }

  /**
   * Todos los líderes activos del alcance, con ceros cuando no hay promovidos
   * que coincidan con el filtro temporal.
   */
  async findAllLeadersWithCounts(filter?: PrecampanaFilter): Promise<LeaderGroup[]> {
    const extraFilter = this.buildRawFilter(filter);
    const scopeFilter = this.buildRawLeaderScope(filter);
    const rows = await this.prisma.$queryRaw<
      Array<{
        leaderId: string;
        leaderName: string;
        sectionId: string;
        sectionCode: string;
        coordinatorId: string;
        coordinatorName: string;
        promovidoQuota: number | null;
        total: bigint | number;
      }>
    >`
      SELECT l.id AS "leaderId",
             l.full_name AS "leaderName",
             l.section_id AS "sectionId",
             s.section_code AS "sectionCode",
             l.coordinator_id AS "coordinatorId",
             c.full_name AS "coordinatorName",
             l.promovido_quota AS "promovidoQuota",
             COALESCE(p_agg.total, 0)::int AS total
      FROM leaders l
      JOIN sections s ON s.id = l.section_id AND s.is_active = true
      JOIN coordinators c ON c.id = l.coordinator_id
      LEFT JOIN (
        SELECT p.leader_id, COUNT(*)::int AS total
        FROM promovidos p
        WHERE p.is_active = true
          ${extraFilter}
        GROUP BY p.leader_id
      ) p_agg ON p_agg.leader_id = l.id
      WHERE l.is_active = true
        ${scopeFilter}
      ORDER BY total DESC, l.full_name ASC
    `;
    return rows.map((r) => ({
      leaderId: r.leaderId,
      leaderName: r.leaderName,
      sectionId: r.sectionId,
      sectionCode: r.sectionCode,
      coordinatorId: r.coordinatorId,
      coordinatorName: r.coordinatorName,
      promovidoQuota: r.promovidoQuota,
      total: toInt(r.total),
    }));
  }

  /**
   * Todos los coordinadores activos del alcance, con ceros cuando no hay
   * promovidos que coincidan con el filtro temporal. `quotaSum` solo se informa
   * cuando todos los líderes activos tienen cuota positiva.
   */
  async findAllCoordinatorsWithCounts(filter?: PrecampanaFilter): Promise<CoordinatorGroup[]> {
    const extraFilter = this.buildRawFilter(filter);
    const scopeFilter = this.buildRawCoordinatorScope(filter);
    const rows = await this.prisma.$queryRaw<
      Array<{
        coordinatorId: string;
        coordinatorName: string;
        sectionId: string;
        sectionCode: string;
        votesRequired: bigint | number | null;
        total: bigint | number;
        leaderCount: bigint | number;
        leadersWithQuota: bigint | number;
        quotaSum: bigint | number | null;
      }>
    >`
      SELECT c.id AS "coordinatorId",
             c.full_name AS "coordinatorName",
             s.id AS "sectionId",
             s.section_code AS "sectionCode",
             s.votos_necesarios AS "votesRequired",
             COALESCE(agg.total, 0)::int AS total,
             COALESCE(agg.leader_count, 0)::int AS "leaderCount",
             COALESCE(agg.leaders_with_quota, 0)::int AS "leadersWithQuota",
             CASE
               WHEN COALESCE(agg.leader_count, 0) > 0
                AND agg.leaders_with_quota = agg.leader_count
               THEN agg.quota_sum
               ELSE NULL
             END AS "quotaSum"
      FROM coordinators c
      JOIN sections s ON s.id = c.section_id AND s.is_active = true
      LEFT JOIN (
        SELECT l.coordinator_id,
               COALESCE(SUM(p_agg.total), 0)::int AS total,
               COUNT(l.id)::int AS leader_count,
               COUNT(l.promovido_quota) FILTER (WHERE l.promovido_quota > 0)::int AS leaders_with_quota,
               SUM(l.promovido_quota) FILTER (WHERE l.promovido_quota > 0)::int AS quota_sum
        FROM leaders l
        LEFT JOIN (
          SELECT p.leader_id, COUNT(*)::int AS total
          FROM promovidos p
          WHERE p.is_active = true
            ${extraFilter}
          GROUP BY p.leader_id
        ) p_agg ON p_agg.leader_id = l.id
        WHERE l.is_active = true
        GROUP BY l.coordinator_id
      ) agg ON agg.coordinator_id = c.id
      WHERE c.is_active = true
        ${scopeFilter}
      ORDER BY total DESC, c.full_name ASC
    `;
    return rows.map((r) => ({
      coordinatorId: r.coordinatorId,
      coordinatorName: r.coordinatorName,
      sectionId: r.sectionId,
      sectionCode: r.sectionCode,
      votesRequired: toNullableInt(r.votesRequired),
      total: toInt(r.total),
      leaderCount: toInt(r.leaderCount),
      leadersWithQuota: toInt(r.leadersWithQuota),
      quotaSum: toNullableInt(r.quotaSum),
    }));
  }

  /** Promovidos activos con `citizenId` no nulo (verificados / enlazados a Citizen). */
  countVerifiedPromovidos(filter?: PrecampanaFilter): Promise<number> {
    const where = this.buildWhere(filter);
    where.citizenId = { not: null };
    return this.prisma.promovido.count({ where });
  }

  /**
   * Colonias por número de promovidos activos.
   *
   * Promovido no tiene columna de colonia: hacemos un raw SQL que une
   * `promovidos` con `citizens` por `citizen_id` (LEFT JOIN, el ciudadano
   * puede ser null) y agrupa por `c.neighborhood` (string desnormalizado en
   * Citizen). Filtra `p.is_active = true` y `c.neighborhood IS NOT NULL`.
   */
  async groupByNeighborhood(filter?: PrecampanaFilter): Promise<NeighborhoodGroup[]> {
    const extraFilter = this.buildRawFilter(filter);
    const rows = await this.prisma.$queryRaw<Array<{ neighborhood: string; total: bigint }>>`
      SELECT c.neighborhood AS neighborhood, COUNT(*)::bigint AS total
      FROM promovidos p
      LEFT JOIN citizens c ON c.id = p.citizen_id
      WHERE p.is_active = true AND c.neighborhood IS NOT NULL
        ${extraFilter}
      GROUP BY c.neighborhood
      ORDER BY total DESC
    `;
    return rows.map((r) => ({
      neighborhood: r.neighborhood,
      total: Number(r.total),
    }));
  }

  /**
   * Crecimiento semanal de promovidos activos: una fila por semana (DATE_TRUNC)
   * para las últimas `weeksBack` semanas, orden ascendente. El acumulado se
   * calcula en TS. Las etiquetas son `S1, S2, ...` según el índice de la fila.
   */
  async weeklyGrowth(weeksBack: number, filter?: PrecampanaFilter): Promise<WeeklyGrowthPoint[]> {
    const extraFilter = this.buildRawFilter(filter);
    const rows = await this.prisma.$queryRaw<Array<{ week_start: Date; total: bigint }>>`
      WITH weeks AS (
        SELECT DATE_TRUNC('week', p.created_at) AS week_start
        FROM promovidos p
        WHERE p.is_active = true
          AND p.created_at >= DATE_TRUNC('week', NOW()) - (${weeksBack}::int - 1) * INTERVAL '1 week'
          ${extraFilter}
      )
      SELECT week_start, COUNT(*)::bigint AS total
      FROM weeks
      GROUP BY week_start
      ORDER BY week_start ASC
    `;
    let cumulative = 0;
    return rows.map((r, idx) => {
      cumulative += Number(r.total);
      return {
        weekStart: r.week_start.toISOString(),
        weekLabel: `S${idx + 1}`,
        total: Number(r.total),
        cumulative,
      };
    });
  }

  /**
   * Líder con más promovidos activos por semana, para las últimas `weeksBack`
   * semanas. Una fila por semana (la del top), orden ascendente. Las etiquetas
   * `S1, S2, ...` siguen el mismo criterio de indexación que `weeklyGrowth`.
   */
  async weeklyLeaderActivity(
    weeksBack: number,
    filter?: PrecampanaFilter,
  ): Promise<WeeklyLeaderActivityPoint[]> {
    const extraFilter = this.buildRawFilter(filter);
    const rows = await this.prisma.$queryRaw<
      Array<{ week_start: Date; leader_name: string; total: bigint }>
    >`
      WITH weekly_leader AS (
        SELECT DATE_TRUNC('week', p.created_at) AS week_start,
               p.leader_id, p.leader_name_snapshot AS leader_name,
               COUNT(*)::bigint AS total
        FROM promovidos p
        WHERE p.is_active = true
          AND p.created_at >= DATE_TRUNC('week', NOW()) - (${weeksBack}::int - 1) * INTERVAL '1 week'
          ${extraFilter}
        GROUP BY week_start, p.leader_id, p.leader_name_snapshot
      ),
      ranked AS (
        SELECT week_start, leader_name, total,
               ROW_NUMBER() OVER (PARTITION BY week_start ORDER BY total DESC) AS rn
        FROM weekly_leader
      )
      SELECT week_start, leader_name, total
      FROM ranked
      WHERE rn = 1
      ORDER BY week_start ASC
    `;
    return rows.map((r, idx) => ({
      weekStart: r.week_start.toISOString(),
      weekLabel: `S${idx + 1}`,
      topLeaderName: r.leader_name,
      topLeaderCount: Number(r.total),
    }));
  }

  async findFilterOptions(): Promise<PrecampanaFilterOptions> {
    const [sections, coordinators, leaders] = await Promise.all([
      this.prisma.section.findMany({
        where: { isActive: true },
        select: {
          id: true,
          sectionCode: true,
          votesRequired: true,
          district: { select: { code: true } },
        },
        orderBy: { sectionCode: 'asc' },
      }),
      this.prisma.coordinator.findMany({
        where: { isActive: true },
        select: {
          id: true,
          fullName: true,
          sectionId: true,
          structureId: true,
          structure: { select: { name: true } },
          section: { select: { sectionCode: true } },
        },
        orderBy: { fullName: 'asc' },
      }),
      this.prisma.leader.findMany({
        where: { isActive: true },
        select: {
          id: true,
          fullName: true,
          coordinatorId: true,
          sectionId: true,
          promovidoQuota: true,
          coordinator: { select: { fullName: true } },
          section: { select: { sectionCode: true } },
        },
        orderBy: { fullName: 'asc' },
      }),
    ]);

    return {
      sections: sections.map((section) => ({
        id: section.id,
        sectionCode: section.sectionCode,
        votesRequired: section.votesRequired,
        districtCode: section.district?.code ?? null,
      })),
      coordinators: coordinators.map((coordinator) => ({
        id: coordinator.id,
        fullName: coordinator.fullName,
        sectionId: coordinator.sectionId,
        sectionCode: coordinator.section.sectionCode,
        structureId: coordinator.structureId,
        structureName: coordinator.structure?.name ?? null,
      })),
      leaders: leaders.map((leader) => ({
        id: leader.id,
        fullName: leader.fullName,
        coordinatorId: leader.coordinatorId,
        coordinatorName: leader.coordinator?.fullName ?? null,
        sectionId: leader.sectionId,
        sectionCode: leader.section.sectionCode,
        promovidoQuota: leader.promovidoQuota,
      })),
    };
  }

  // ── Metas de precampaña ──────────────────────────────────────────────────────

  async findActiveSectionById(id: string): Promise<ActiveSectionRef | null> {
    return this.prisma.section.findFirst({
      where: { id, isActive: true },
      select: activeSectionSelect,
    });
  }

  async findActiveSectionByCode(sectionCode: string): Promise<ActiveSectionRef | null> {
    return this.prisma.section.findFirst({
      where: { sectionCode, isActive: true },
      select: activeSectionSelect,
      orderBy: { createdAt: 'asc' },
    });
  }

  async findActiveLeaderById(id: string): Promise<ActiveLeaderRef | null> {
    return this.prisma.leader.findFirst({
      where: { id, isActive: true, section: { isActive: true } },
      select: {
        id: true,
        fullName: true,
        sectionId: true,
        coordinatorId: true,
        promovidoQuota: true,
        section: { select: activeSectionSelect },
      },
    });
  }

  async findActiveCoordinatorById(id: string): Promise<ActiveCoordinatorRef | null> {
    return this.prisma.coordinator.findFirst({
      where: { id, isActive: true, section: { isActive: true } },
      select: {
        id: true,
        fullName: true,
        sectionId: true,
        section: { select: activeSectionSelect },
      },
    });
  }

  async findExactGoalAt(
    scope: GoalScope,
    cadence: GoalCadence,
    at: Date,
    targetId?: string,
  ): Promise<PrecampaignGoalWithContext | null> {
    return this.prisma.precampaignGoal.findFirst({
      where: {
        scope,
        cadence,
        isActive: true,
        startDate: { lte: at },
        endDate: { gt: at },
        sectionId: scope === 'SECTION' ? targetId : null,
        leaderId: scope === 'LEADER' ? targetId : null,
      },
      orderBy: { startDate: 'desc' },
      include: goalInclude,
    });
  }

  async findWeeklyGoalsOverlapping(
    scope: GoalScope,
    rangeStart: Date,
    rangeEndExclusive: Date,
    targetId?: string,
  ): Promise<PrecampaignGoalWithContext[]> {
    return this.prisma.precampaignGoal.findMany({
      where: {
        scope,
        cadence: 'WEEKLY',
        isActive: true,
        startDate: { lt: rangeEndExclusive },
        endDate: { gt: rangeStart },
        sectionId: scope === 'SECTION' ? targetId : null,
        leaderId: scope === 'LEADER' ? targetId : null,
      },
      orderBy: { startDate: 'asc' },
      include: goalInclude,
    });
  }

  async findOverlappingGoal(
    data: Pick<
      CreateGoalInput,
      'scope' | 'cadence' | 'sectionId' | 'leaderId' | 'startDate' | 'endDate'
    >,
    excludeId?: string,
  ): Promise<PrecampaignGoalWithContext | null> {
    return this.prisma.precampaignGoal.findFirst({
      where: this.overlapWhere(data, excludeId),
      orderBy: { startDate: 'asc' },
      include: goalInclude,
    });
  }

  /** Busca una meta por id (sin filtrar por isActive). */
  async findGoalById(id: string): Promise<PrecampaignGoalWithContext | null> {
    return this.prisma.precampaignGoal.findUnique({
      where: { id },
      include: goalInclude,
    });
  }

  /** Metas activas, opcionalmente filtradas por alcance y cadencia. */
  async findActiveGoals(filter: GoalListFilter = {}): Promise<PrecampaignGoalWithContext[]> {
    return this.prisma.precampaignGoal.findMany({
      where: { isActive: true, ...filter },
      orderBy: { startDate: 'desc' },
      include: goalInclude,
    });
  }

  /** Crea una meta y repite el control de solapamiento dentro de la transacción. */
  async createGoal(data: CreateGoalInput): Promise<PrecampaignGoalWithContext> {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await this.assertNoOverlap(tx, data);
          return tx.precampaignGoal.create({ data, include: goalInclude });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      this.rethrowTransactionConflict(error);
    }
  }

  /** Actualiza el estado ya combinado y lo valida transaccionalmente. */
  async updateGoal(id: string, data: CreateGoalInput): Promise<PrecampaignGoalWithContext> {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          if (data.isActive) await this.assertNoOverlap(tx, data, id);
          return tx.precampaignGoal.update({ where: { id }, data, include: goalInclude });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      this.rethrowTransactionConflict(error);
    }
  }

  /** Desactiva una meta (soft delete: isActive = false). */
  deactivateGoal(id: string): Promise<PrecampaignGoalWithContext> {
    return this.prisma.precampaignGoal.update({
      where: { id },
      data: { isActive: false },
      include: goalInclude,
    });
  }

  private overlapWhere(
    data: Pick<
      CreateGoalInput,
      'scope' | 'cadence' | 'sectionId' | 'leaderId' | 'startDate' | 'endDate'
    >,
    excludeId?: string,
  ): Prisma.PrecampaignGoalWhereInput {
    return {
      ...(excludeId ? { id: { not: excludeId } } : {}),
      scope: data.scope,
      cadence: data.cadence,
      sectionId: data.sectionId,
      leaderId: data.leaderId,
      isActive: true,
      startDate: { lt: data.endDate },
      endDate: { gt: data.startDate },
    };
  }

  private async assertNoOverlap(
    tx: Prisma.TransactionClient,
    data: CreateGoalInput,
    excludeId?: string,
  ): Promise<void> {
    const overlap = await tx.precampaignGoal.findFirst({
      where: this.overlapWhere(data, excludeId),
      select: { id: true },
    });
    if (overlap) {
      throw AppError.conflict(
        'Ya existe una meta activa superpuesta para el mismo alcance y cadencia',
      );
    }
  }

  private rethrowTransactionConflict(error: unknown): never {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2034') {
      throw AppError.conflict(
        'Otra operación modificó las metas al mismo tiempo; intentá nuevamente',
      );
    }
    throw error;
  }
}
