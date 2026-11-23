/**
 * Tipos del módulo de Analytics.
 * Métricas de tickets, agentes, departamentos y flujo bot/humano.
 */

// ── Filtros globales ──────────────────────────────────────────────────────────

export interface AnalyticsFilters {
  from?: Date;
  to?: Date;
  department?: string;
  agentId?: string;
}

// ── KPIs de tickets ──────────────────────────────────────────────────────────

export interface TicketKPIs {
  openTickets: number;
  inProgressTickets: number;
  resolvedTickets: number;
  closedTickets: number;
  slaBreachedTickets: number;
}

// ── Tiempos promedio ─────────────────────────────────────────────────────────

/** Tiempos en minutos */
export interface TicketTimings {
  /** Tiempo promedio hasta primer mensaje de agente desde apertura del ticket (minutos) */
  avgFirstResponseTime: number;
  /** Tiempo promedio desde apertura hasta cierre (minutos) */
  avgResolutionTime: number;
  /** Tiempo promedio de manejo total (minutos) — alias de avgResolutionTime en este modelo */
  avgHandleTime: number;
}

// ── Volumen diario ────────────────────────────────────────────────────────────

export interface DailyVolume {
  date: string; // ISO date string: "YYYY-MM-DD"
  opened: number;
  closed: number;
}

// ── SLA ───────────────────────────────────────────────────────────────────────

/** SLA: primera respuesta dentro de los primeros 10 minutos desde creación del ticket */
export interface SlaMetrics {
  met: number;
  breached: number;
  complianceRate: number; // 0–1
}

// ── Performance de agentes ────────────────────────────────────────────────────

export interface AgentPerformance {
  agentId: string;
  name: string;
  ticketsHandled: number;
  /** Minutos */
  avgResponseTime: number;
  /** Minutos */
  avgResolutionTime: number;
  /** 0–1 */
  slaCompliance: number;
}

// ── Distribución por departamento ─────────────────────────────────────────────

export interface DepartmentDistribution {
  department: string;
  count: number;
}

// ── Métricas de flujo bot/humano ──────────────────────────────────────────────

export interface FlowMetrics {
  botFlow: number;
  humanFlow: number;
  escalated: number;
}

// ── Respuestas de los endpoints ───────────────────────────────────────────────

export interface DashboardMetrics {
  kpis: TicketKPIs;
  timings: TicketTimings;
  dailyVolume: DailyVolume[];
  sla: SlaMetrics;
  flow: FlowMetrics;
}

export interface TicketMetrics {
  kpis: TicketKPIs;
  timings: TicketTimings;
  dailyVolume: DailyVolume[];
  sla: SlaMetrics;
}

export interface AgentMetrics {
  agents: AgentPerformance[];
}

export interface DepartmentMetrics {
  departments: DepartmentDistribution[];
}
