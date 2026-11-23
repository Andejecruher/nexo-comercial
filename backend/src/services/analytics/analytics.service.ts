/**
 * AnalyticsService — Métricas de tickets, agentes, departamentos y flujo bot/humano.
 *
 * Decisiones de diseño:
 * - No usamos SQL raw: toda la lógica es Prisma client (groupBy, aggregate, findMany con select).
 * - El cálculo de SLA (10 min primer respuesta) se hace en memoria sobre los datos ya obtenidos,
 *   para evitar SQL complejo que dependería del dialecto PostgreSQL.
 * - avgFirstResponseTime requiere el primer mensaje outbound del agente → usamos TicketMessage
 *   con actorType AGENT y el mensaje relacionado. Si no hay mensaje de agente, no se cuenta.
 * - Cache LRU en memoria con TTL 300s (por instancia). Key: analytics:{sha256(filtros-JSON)}.
 *   El reemplazo del cache Redis por uno in-process es un tradeoff consciente:
 *   evita la dependencia de Redis (serverless) a costa de no compartir cache entre instancias.
 */

import * as crypto from 'crypto';
import { AnalyticsPrismaLike, AnalyticsRepository } from '../../repositories/analytics.repository';
import type {
  AgentMetrics,
  AgentPerformance,
  AnalyticsFilters,
  DailyVolume,
  DashboardMetrics,
  DepartmentDistribution,
  DepartmentMetrics,
  FlowMetrics,
  SlaMetrics,
  TicketKPIs,
  TicketMetrics,
  TicketTimings,
} from './analytics.types';

/** SLA: primera respuesta del agente debe ocurrir dentro de estos minutos */
const SLA_FIRST_RESPONSE_MINUTES = 10;
const CACHE_TTL_SECONDS = 300;
const CACHE_KEY_PREFIX = 'analytics:';
/** Máximo de entradas en el cache LRU (evita crecimiento ilimitado en instancias de larga vida). */
const CACHE_MAX_ENTRIES = 100;

export class AnalyticsService {
  private readonly repository: AnalyticsRepository;
  /** Cache LRU in-process: key → { raw JSON, expiresAt } */
  private readonly cache = new Map<string, { raw: string; expiresAt: number }>();

  constructor(repositoryOrPrisma: AnalyticsRepository | AnalyticsPrismaLike) {
    this.repository =
      repositoryOrPrisma instanceof AnalyticsRepository
        ? repositoryOrPrisma
        : new AnalyticsRepository(repositoryOrPrisma);
  }

  // ── Cache helpers ──────────────────────────────────────────────────────────

  private buildCacheKey(namespace: string, filters: AnalyticsFilters): string {
    const hash = crypto
      .createHash('sha256')
      .update(JSON.stringify({ namespace, ...filters }))
      .digest('hex')
      .slice(0, 16);
    return `${CACHE_KEY_PREFIX}${hash}`;
  }

  private fromCache<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (entry.expiresAt <= Date.now()) {
      this.cache.delete(key);
      return undefined;
    }

    // LRU touch: recolocar la entrada al final (más reciente)
    this.cache.delete(key);
    this.cache.set(key, entry);
    return JSON.parse(entry.raw) as T;
  }

  private toCache<T>(key: string, value: T): void {
    const raw = JSON.stringify(value);
    this.cache.delete(key);
    this.cache.set(key, { raw, expiresAt: Date.now() + CACHE_TTL_SECONDS * 1000 });

    if (this.cache.size > CACHE_MAX_ENTRIES) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
  }

  // ── Filtros → where clause ─────────────────────────────────────────────────

  private buildTicketWhere(filters: AnalyticsFilters) {
    const where: Record<string, unknown> = {};

    if (filters.from ?? filters.to) {
      where['createdAt'] = {
        ...(filters.from ? { gte: filters.from } : {}),
        ...(filters.to ? { lte: filters.to } : {}),
      };
    }

    if (filters.department) {
      where['departmentSlug'] = filters.department;
    }

    if (filters.agentId) {
      where['assignedUserId'] = filters.agentId;
    }

    return where;
  }

  // ── KPIs ───────────────────────────────────────────────────────────────────

  private async getKPIs(filters: AnalyticsFilters): Promise<TicketKPIs> {
    const where = this.buildTicketWhere(filters);

    const [open, inProgress, resolved, closed] = await Promise.all([
      this.repository.countTickets({ ...where, status: 'OPEN' }),
      this.repository.countTickets({ ...where, status: 'IN_PROGRESS' }),
      this.repository.countTickets({ ...where, status: 'RESOLVED' }),
      this.repository.countTickets({ ...where, status: 'CLOSED' }),
    ]);

    // SLA breached: tickets donde el primer mensaje del agente llegó después de 10 min
    const slaBreachedTickets = await this.countSlaBreached(filters);

    return {
      openTickets: open,
      inProgressTickets: inProgress,
      resolvedTickets: resolved,
      closedTickets: closed,
      slaBreachedTickets,
    };
  }

  // ── SLA ────────────────────────────────────────────────────────────────────

  /**
   * Calcula SLA en memoria sobre los tickets del período.
   * Lógica: para cada ticket, busca el primer TicketMessage con actorType=AGENT.
   * Si la diferencia con createdAt del ticket > 10 min → breached.
   * Si no hay mensaje de agente → no contabilizado en SLA (omitido).
   */
  private async computeSla(filters: AnalyticsFilters): Promise<SlaMetrics> {
    const where = this.buildTicketWhere(filters);

    // Traemos tickets con sus ticketMessages ordenados por createdAt
    const tickets = await this.repository.findTickets<{
      id: string;
      createdAt: Date;
      ticketMessages: Array<{ createdAt: Date }>;
    }>({
      where,
      select: {
        id: true,
        createdAt: true,
        ticketMessages: {
          where: { actorType: 'AGENT' },
          orderBy: { createdAt: 'asc' },
          take: 1,
          select: { createdAt: true },
        },
      },
    });

    let met = 0;
    let breached = 0;

    for (const ticket of tickets) {
      const firstAgentMsg = ticket.ticketMessages[0];
      if (!firstAgentMsg) continue; // no hay respuesta de agente → no se evalúa

      const diffMs = firstAgentMsg.createdAt.getTime() - ticket.createdAt.getTime();
      const diffMin = diffMs / 60_000;

      if (diffMin <= SLA_FIRST_RESPONSE_MINUTES) {
        met++;
      } else {
        breached++;
      }
    }

    const total = met + breached;
    const complianceRate = total === 0 ? 0 : met / total;

    return { met, breached, complianceRate };
  }

  private async countSlaBreached(filters: AnalyticsFilters): Promise<number> {
    const sla = await this.computeSla(filters);
    return sla.breached;
  }

  // ── Timings ────────────────────────────────────────────────────────────────

  private async getTimings(filters: AnalyticsFilters): Promise<TicketTimings> {
    const where = this.buildTicketWhere(filters);

    // avgResolutionTime: promedio de (closedAt - createdAt) en minutos
    const closedTickets = await this.repository.findTickets<{
      createdAt: Date;
      closedAt: Date | null;
    }>({
      where: { ...where, closedAt: { not: null } },
      select: { createdAt: true, closedAt: true },
    });

    let totalResolution = 0;
    for (const t of closedTickets) {
      if (t.closedAt) {
        totalResolution += (t.closedAt.getTime() - t.createdAt.getTime()) / 60_000;
      }
    }
    const avgResolutionTime = closedTickets.length > 0 ? totalResolution / closedTickets.length : 0;

    // avgFirstResponseTime: promedio del primer mensaje de agente - createdAt del ticket
    const tickets = await this.repository.findTickets<{
      createdAt: Date;
      ticketMessages: Array<{ createdAt: Date }>;
    }>({
      where,
      select: {
        createdAt: true,
        ticketMessages: {
          where: { actorType: 'AGENT' },
          orderBy: { createdAt: 'asc' },
          take: 1,
          select: { createdAt: true },
        },
      },
    });

    let totalFirstResponse = 0;
    let countFirstResponse = 0;
    for (const t of tickets) {
      const first = t.ticketMessages[0];
      if (first) {
        totalFirstResponse += (first.createdAt.getTime() - t.createdAt.getTime()) / 60_000;
        countFirstResponse++;
      }
    }
    const avgFirstResponseTime =
      countFirstResponse > 0 ? totalFirstResponse / countFirstResponse : 0;

    // avgHandleTime: (último mensaje del ticket - primer mensaje de agente) por ticket.
    // Incluye todos los mensajes del ticket (AGENT + CITIZEN) para obtener el "último".
    const handleTickets = await this.repository.findTickets<{
      ticketMessages: Array<{ createdAt: Date; actorType: string }>;
    }>({
      where,
      select: {
        ticketMessages: {
          orderBy: { createdAt: 'asc' },
          select: { createdAt: true, actorType: true },
        },
      },
    });

    let totalHandleTime = 0;
    let countHandleTime = 0;
    for (const t of handleTickets) {
      const msgs = t.ticketMessages;
      if (msgs.length === 0) continue;
      const firstAgentMsg = msgs.find((m) => m.actorType === 'AGENT');
      if (!firstAgentMsg) continue;
      const lastMsg = msgs[msgs.length - 1];
      const diff = (lastMsg.createdAt.getTime() - firstAgentMsg.createdAt.getTime()) / 60_000;
      totalHandleTime += diff;
      countHandleTime++;
    }
    const avgHandleTime = countHandleTime > 0 ? totalHandleTime / countHandleTime : 0;

    return {
      avgFirstResponseTime: Math.round(avgFirstResponseTime * 100) / 100,
      avgResolutionTime: Math.round(avgResolutionTime * 100) / 100,
      avgHandleTime: Math.round(avgHandleTime * 100) / 100,
    };
  }

  // ── Volumen diario ─────────────────────────────────────────────────────────

  private async getDailyVolume(filters: AnalyticsFilters): Promise<DailyVolume[]> {
    const where = this.buildTicketWhere(filters);

    // opened: agrupar por fecha de creación
    const openedGroups = await this.repository.groupTickets<{
      createdAt: Date;
      _count: { id: number };
    }>({
      by: ['createdAt'],
      where,
      _count: { id: true },
    });

    // closed: agrupar por fecha de cierre
    const closedGroups = await this.repository.groupTickets<{
      closedAt: Date | null;
      _count: { id: number };
    }>({
      by: ['closedAt'],
      where: { ...where, closedAt: { not: null } },
      _count: { id: true },
    });

    // Acumular por fecha (YYYY-MM-DD)
    const map = new Map<string, { opened: number; closed: number }>();

    const toDateStr = (d: Date) => d.toISOString().slice(0, 10);

    for (const g of openedGroups) {
      const day = toDateStr(g.createdAt);
      const entry = map.get(day) ?? { opened: 0, closed: 0 };
      entry.opened += g._count.id;
      map.set(day, entry);
    }

    for (const g of closedGroups) {
      if (!g.closedAt) continue;
      const day = toDateStr(g.closedAt);
      const entry = map.get(day) ?? { opened: 0, closed: 0 };
      entry.closed += g._count.id;
      map.set(day, entry);
    }

    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, counts]) => ({ date, ...counts }));
  }

  // ── Flujo bot/humano ───────────────────────────────────────────────────────

  async getFlowMetrics(filters: AnalyticsFilters): Promise<FlowMetrics> {
    const cacheKey = this.buildCacheKey('flow', filters);
    const cached = this.fromCache<FlowMetrics>(cacheKey);
    if (cached) return cached;

    // Construir where para ConversationMeta aplicando todos los filtros disponibles.
    // - from/to: filtra por createdAt de conversationMeta
    // - department: filtra por departmentSlug en conversation_meta
    // - agentId: filtra por conversation.assignedUserId (join via relación)
    const metaWhere: Record<string, unknown> = {};

    if (filters.from ?? filters.to) {
      metaWhere['createdAt'] = {
        ...(filters.from ? { gte: filters.from } : {}),
        ...(filters.to ? { lte: filters.to } : {}),
      };
    }

    if (filters.department) {
      metaWhere['departmentSlug'] = filters.department;
    }

    if (filters.agentId) {
      metaWhere['conversation'] = { assignedUserId: filters.agentId };
    }

    const [botFlow, humanFlow, escalated] = await Promise.all([
      this.repository.countConversationMeta({ ...metaWhere, flowState: 'BOT_FLOW' }),
      this.repository.countConversationMeta({ ...metaWhere, flowState: 'HUMAN_FLOW' }),
      this.repository.countConversationMeta({ ...metaWhere, flowState: 'ESCALATED' }),
    ]);

    const result: FlowMetrics = { botFlow, humanFlow, escalated };
    this.toCache(cacheKey, result);
    return result;
  }

  // ── Métricas de agentes ────────────────────────────────────────────────────

  async getAgentMetrics(filters: AnalyticsFilters): Promise<AgentMetrics> {
    const cacheKey = this.buildCacheKey('agents', filters);
    const cached = this.fromCache<AgentMetrics>(cacheKey);
    if (cached) return cached;

    const where = this.buildTicketWhere(filters);

    // Obtener tickets con assignedUser
    const tickets = await this.repository.findTickets<{
      assignedUserId: string | null;
      createdAt: Date;
      closedAt: Date | null;
      assignedUser: { id: string; fullName: string | null } | null;
      ticketMessages: Array<{ createdAt: Date }>;
    }>({
      where: { ...where, assignedUserId: { not: null } },
      select: {
        assignedUserId: true,
        createdAt: true,
        closedAt: true,
        assignedUser: { select: { id: true, fullName: true } },
        ticketMessages: {
          where: { actorType: 'AGENT' },
          orderBy: { createdAt: 'asc' },
          take: 1,
          select: { createdAt: true },
        },
      },
    });

    // Agrupar por agente
    const agentMap = new Map<
      string,
      {
        name: string;
        tickets: Array<{
          createdAt: Date;
          closedAt: Date | null;
          firstAgentMsgAt: Date | undefined;
        }>;
      }
    >();

    for (const t of tickets) {
      if (!t.assignedUserId || !t.assignedUser) continue;
      const entry = agentMap.get(t.assignedUserId) ?? {
        name: t.assignedUser.fullName ?? t.assignedUserId,
        tickets: [],
      };
      entry.tickets.push({
        createdAt: t.createdAt,
        closedAt: t.closedAt ?? null,
        firstAgentMsgAt: t.ticketMessages[0]?.createdAt,
      });
      agentMap.set(t.assignedUserId, entry);
    }

    const agents: AgentPerformance[] = [];

    for (const [agentId, { name, tickets: agentTickets }] of agentMap.entries()) {
      let totalResponse = 0;
      let countResponse = 0;
      let totalResolution = 0;
      let countResolution = 0;
      let slaMet = 0;
      let slaTotal = 0;

      for (const t of agentTickets) {
        if (t.firstAgentMsgAt) {
          const diff = (t.firstAgentMsgAt.getTime() - t.createdAt.getTime()) / 60_000;
          totalResponse += diff;
          countResponse++;
          slaTotal++;
          if (diff <= SLA_FIRST_RESPONSE_MINUTES) slaMet++;
        }
        if (t.closedAt) {
          totalResolution += (t.closedAt.getTime() - t.createdAt.getTime()) / 60_000;
          countResolution++;
        }
      }

      agents.push({
        agentId,
        name,
        ticketsHandled: agentTickets.length,
        avgResponseTime:
          countResponse > 0 ? Math.round((totalResponse / countResponse) * 100) / 100 : 0,
        avgResolutionTime:
          countResolution > 0 ? Math.round((totalResolution / countResolution) * 100) / 100 : 0,
        slaCompliance: slaTotal > 0 ? Math.round((slaMet / slaTotal) * 100) / 100 : 0,
      });
    }

    const result: AgentMetrics = { agents };
    this.toCache(cacheKey, result);
    return result;
  }

  // ── Métricas de departamentos ──────────────────────────────────────────────

  async getDepartmentMetrics(filters: AnalyticsFilters): Promise<DepartmentMetrics> {
    const cacheKey = this.buildCacheKey('departments', filters);
    const cached = this.fromCache<DepartmentMetrics>(cacheKey);
    if (cached) return cached;

    const where = this.buildTicketWhere(filters);

    const groups = await this.repository.groupTickets<{
      departmentSlug: string | null;
      _count: { id: number };
    }>({
      by: ['departmentSlug'],
      where: { ...where, departmentSlug: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    });

    const departments: DepartmentDistribution[] = groups.map((g) => ({
      department: g.departmentSlug ?? 'sin-asignar',
      count: g._count.id,
    }));

    const result: DepartmentMetrics = { departments };
    this.toCache(cacheKey, result);
    return result;
  }

  // ── Métricas de tickets ────────────────────────────────────────────────────

  async getTicketMetrics(filters: AnalyticsFilters): Promise<TicketMetrics> {
    const cacheKey = this.buildCacheKey('tickets', filters);
    const cached = this.fromCache<TicketMetrics>(cacheKey);
    if (cached) return cached;

    const [kpis, timings, dailyVolume, sla] = await Promise.all([
      this.getKPIs(filters),
      this.getTimings(filters),
      this.getDailyVolume(filters),
      this.computeSla(filters),
    ]);

    const result: TicketMetrics = { kpis, timings, dailyVolume, sla };
    this.toCache(cacheKey, result);
    return result;
  }

  // ── Dashboard (métricas completas) ────────────────────────────────────────

  async getDashboardMetrics(filters: AnalyticsFilters): Promise<DashboardMetrics> {
    const cacheKey = this.buildCacheKey('dashboard', filters);
    const cached = this.fromCache<DashboardMetrics>(cacheKey);
    if (cached) return cached;

    const [kpis, timings, dailyVolume, sla, flow] = await Promise.all([
      this.getKPIs(filters),
      this.getTimings(filters),
      this.getDailyVolume(filters),
      this.computeSla(filters),
      this.getFlowMetrics(filters),
    ]);

    const result: DashboardMetrics = { kpis, timings, dailyVolume, sla, flow };
    this.toCache(cacheKey, result);
    return result;
  }
}
