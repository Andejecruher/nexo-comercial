/**
 * Tests unitarios para AnalyticsService.
 *
 * Cubre:
 * - getDashboardMetrics: retorno de estructura completa
 * - getTicketMetrics: KPIs, timings, volumen diario, SLA
 * - getAgentMetrics: performance por agente
 * - getDepartmentMetrics: distribución por departamento
 * - computeSla: lógica de cumplimiento SLA (10 min)
 * - Cache LRU en memoria: hit evita llamadas a Prisma
 */

import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { AnalyticsService } from '../../services/analytics/analytics.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const asyncMock = <T = unknown>() => jest.fn<() => Promise<T>>();

function makePrismaMock() {
  return {
    ticket: {
      count: asyncMock<number>(),
      findMany: asyncMock<unknown[]>(),
      groupBy: asyncMock<unknown[]>(),
    },
    conversationMeta: {
      count: asyncMock<number>(),
    },
  };
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const now = new Date('2026-05-10T12:00:00.000Z');
const minus5 = new Date('2026-05-10T11:55:00.000Z'); // 5 min antes → SLA met
const minus15 = new Date('2026-05-10T11:45:00.000Z'); // 15 min antes → SLA breached

function makeTicketWithAgentMsg(createdAt: Date, firstAgentMsgAt: Date | undefined) {
  return {
    id: 'ticket-uuid',
    createdAt,
    ticketMessages: firstAgentMsgAt ? [{ createdAt: firstAgentMsgAt }] : [],
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AnalyticsService', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let service: AnalyticsService;

  beforeEach(() => {
    prisma = makePrismaMock();

    service = new AnalyticsService(prisma as any);
    jest.clearAllMocks();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // SLA computation
  // ──────────────────────────────────────────────────────────────────────────

  describe('computeSla (vía getTicketMetrics)', () => {
    it('calcula SLA met cuando primer mensaje de agente llega dentro de 10 min', async () => {
      const ticket = makeTicketWithAgentMsg(now, new Date(now.getTime() + 5 * 60_000)); // +5 min
      prisma.ticket.count.mockResolvedValue(1 as never);
      prisma.ticket.findMany.mockResolvedValue([ticket] as never);
      prisma.ticket.groupBy.mockResolvedValue([] as never);

      const result = await service.getTicketMetrics({});

      expect(result.sla.met).toBe(1);
      expect(result.sla.breached).toBe(0);
      expect(result.sla.complianceRate).toBe(1);
    });

    it('calcula SLA breached cuando primer mensaje de agente llega después de 10 min', async () => {
      const ticket = makeTicketWithAgentMsg(now, new Date(now.getTime() + 15 * 60_000)); // +15 min
      prisma.ticket.count.mockResolvedValue(1 as never);
      prisma.ticket.findMany.mockResolvedValue([ticket] as never);
      prisma.ticket.groupBy.mockResolvedValue([] as never);

      const result = await service.getTicketMetrics({});

      expect(result.sla.met).toBe(0);
      expect(result.sla.breached).toBe(1);
      expect(result.sla.complianceRate).toBe(0);
    });

    it('ignora tickets sin respuesta de agente en el cálculo SLA', async () => {
      const ticketNoAgent = makeTicketWithAgentMsg(now, undefined);
      prisma.ticket.count.mockResolvedValue(0 as never);
      prisma.ticket.findMany.mockResolvedValue([ticketNoAgent] as never);
      prisma.ticket.groupBy.mockResolvedValue([] as never);

      const result = await service.getTicketMetrics({});

      expect(result.sla.met).toBe(0);
      expect(result.sla.breached).toBe(0);
      expect(result.sla.complianceRate).toBe(0);
    });

    it('calcula tasa de cumplimiento mixta correctamente', async () => {
      const metTicket = makeTicketWithAgentMsg(now, new Date(now.getTime() + 5 * 60_000));
      const breachedTicket = makeTicketWithAgentMsg(
        minus5,
        new Date(minus5.getTime() + 15 * 60_000),
      );
      prisma.ticket.count.mockResolvedValue(2 as never);
      prisma.ticket.findMany.mockResolvedValue([metTicket, breachedTicket] as never);
      prisma.ticket.groupBy.mockResolvedValue([] as never);

      const result = await service.getTicketMetrics({});

      expect(result.sla.met).toBe(1);
      expect(result.sla.breached).toBe(1);
      expect(result.sla.complianceRate).toBe(0.5);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // getTicketMetrics
  // ──────────────────────────────────────────────────────────────────────────

  describe('getTicketMetrics', () => {
    it('retorna estructura completa con kpis, timings, dailyVolume y sla', async () => {
      prisma.ticket.count.mockResolvedValue(5 as never);
      prisma.ticket.findMany.mockResolvedValue([
        makeTicketWithAgentMsg(now, new Date(now.getTime() + 3 * 60_000)),
      ] as never);
      prisma.ticket.groupBy.mockResolvedValue([{ createdAt: now, _count: { id: 2 } }] as never);

      const result = await service.getTicketMetrics({});

      expect(result).toHaveProperty('kpis');
      expect(result).toHaveProperty('timings');
      expect(result).toHaveProperty('dailyVolume');
      expect(result).toHaveProperty('sla');
      expect(result.kpis.openTickets).toBe(5);
    });

    it('retorna de cache cuando existe', async () => {
      prisma.ticket.count.mockResolvedValue(99 as never);
      prisma.ticket.findMany.mockResolvedValue([] as never);
      prisma.ticket.groupBy.mockResolvedValue([] as never);

      const first = await service.getTicketMetrics({});
      expect(first.kpis.openTickets).toBe(99);

      // El segundo request debe servirse de cache — sin consultar Prisma de nuevo
      const callsAfterFirst = prisma.ticket.count.mock.calls.length;
      const second = await service.getTicketMetrics({});

      expect(second.kpis.openTickets).toBe(99);
      expect(prisma.ticket.count.mock.calls.length).toBe(callsAfterFirst);
    });

    it('guarda resultado en cache tras consultar Prisma', async () => {
      prisma.ticket.count.mockResolvedValue(3 as never);
      prisma.ticket.findMany.mockResolvedValue([] as never);
      prisma.ticket.groupBy.mockResolvedValue([] as never);

      await service.getTicketMetrics({});
      const callsAfterFirst = prisma.ticket.count.mock.calls.length;

      await service.getTicketMetrics({});

      expect(prisma.ticket.count.mock.calls.length).toBe(callsAfterFirst);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // getAgentMetrics
  // ──────────────────────────────────────────────────────────────────────────

  describe('getAgentMetrics', () => {
    it('agrupa métricas por agente correctamente', async () => {
      const agentTickets = [
        {
          assignedUserId: 'agent-1',
          createdAt: now,
          closedAt: new Date(now.getTime() + 30 * 60_000),
          assignedUser: { id: 'agent-1', fullName: 'Ana García' },
          ticketMessages: [{ createdAt: new Date(now.getTime() + 4 * 60_000) }],
        },
        {
          assignedUserId: 'agent-1',
          createdAt: minus5,
          closedAt: new Date(minus5.getTime() + 40 * 60_000),
          assignedUser: { id: 'agent-1', fullName: 'Ana García' },
          ticketMessages: [{ createdAt: new Date(minus5.getTime() + 6 * 60_000) }],
        },
      ];

      prisma.ticket.findMany.mockResolvedValue(agentTickets as never);

      const result = await service.getAgentMetrics({});

      expect(result.agents).toHaveLength(1);
      const agent = result.agents[0];
      expect(agent.agentId).toBe('agent-1');
      expect(agent.name).toBe('Ana García');
      expect(agent.ticketsHandled).toBe(2);
      expect(agent.slaCompliance).toBe(1); // ambos < 10 min
    });

    it('retorna lista vacía si no hay tickets asignados', async () => {
      prisma.ticket.findMany.mockResolvedValue([] as never);

      const result = await service.getAgentMetrics({});

      expect(result.agents).toHaveLength(0);
    });

    it('marca SLA como breached cuando respuesta > 10 min', async () => {
      const tickets = [
        {
          assignedUserId: 'agent-2',
          createdAt: now,
          closedAt: null,
          assignedUser: { id: 'agent-2', fullName: 'Carlos' },
          ticketMessages: [{ createdAt: new Date(now.getTime() + 12 * 60_000) }],
        },
      ];

      prisma.ticket.findMany.mockResolvedValue(tickets as never);

      const result = await service.getAgentMetrics({});

      expect(result.agents[0].slaCompliance).toBe(0);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // getDepartmentMetrics
  // ──────────────────────────────────────────────────────────────────────────

  describe('getDepartmentMetrics', () => {
    it('mapea grupos de Prisma a DepartmentDistribution', async () => {
      prisma.ticket.groupBy.mockResolvedValue([
        { departmentSlug: 'obras-publicas', _count: { id: 42 } },
        { departmentSlug: 'salud', _count: { id: 18 } },
      ] as never);

      const result = await service.getDepartmentMetrics({});

      expect(result.departments).toHaveLength(2);
      expect(result.departments[0]).toEqual({ department: 'obras-publicas', count: 42 });
      expect(result.departments[1]).toEqual({ department: 'salud', count: 18 });
    });

    it('retorna lista vacía si no hay tickets por departamento', async () => {
      prisma.ticket.groupBy.mockResolvedValue([] as never);

      const result = await service.getDepartmentMetrics({});

      expect(result.departments).toHaveLength(0);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // getDashboardMetrics
  // ──────────────────────────────────────────────────────────────────────────

  describe('getDashboardMetrics', () => {
    it('retorna estructura con kpis, timings, dailyVolume, sla y flow', async () => {
      prisma.ticket.count.mockResolvedValue(10 as never);
      prisma.ticket.findMany.mockResolvedValue([
        makeTicketWithAgentMsg(now, new Date(now.getTime() + 3 * 60_000)),
      ] as never);
      prisma.ticket.groupBy.mockResolvedValue([{ createdAt: now, _count: { id: 5 } }] as never);
      prisma.conversationMeta.count.mockResolvedValue(7 as never);

      const result = await service.getDashboardMetrics({});

      expect(result).toHaveProperty('kpis');
      expect(result).toHaveProperty('timings');
      expect(result).toHaveProperty('dailyVolume');
      expect(result).toHaveProperty('sla');
      expect(result).toHaveProperty('flow');
      expect(result.flow.botFlow).toBe(7);
    });

    it('retorna de cache cuando existe', async () => {
      prisma.ticket.count.mockResolvedValue(1 as never);
      prisma.ticket.findMany.mockResolvedValue([] as never);
      prisma.ticket.groupBy.mockResolvedValue([] as never);
      prisma.conversationMeta.count.mockResolvedValue(0 as never);

      const first = await service.getDashboardMetrics({});
      const callsAfterFirst = prisma.ticket.count.mock.calls.length;

      const second = await service.getDashboardMetrics({});

      expect(second).toEqual(first);
      expect(prisma.ticket.count.mock.calls.length).toBe(callsAfterFirst);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // getFlowMetrics
  // ──────────────────────────────────────────────────────────────────────────

  describe('getFlowMetrics', () => {
    it('cuenta conversaciones por flowState correctamente', async () => {
      prisma.conversationMeta.count
        .mockResolvedValueOnce(10 as never) // BOT_FLOW
        .mockResolvedValueOnce(4 as never) // HUMAN_FLOW
        .mockResolvedValueOnce(2 as never); // ESCALATED

      const result = await service.getFlowMetrics({});

      expect(result.botFlow).toBe(10);
      expect(result.humanFlow).toBe(4);
      expect(result.escalated).toBe(2);
    });

    it('aplica filtro de department en conversationMeta', async () => {
      prisma.conversationMeta.count.mockResolvedValue(3 as never);

      await service.getFlowMetrics({ department: 'salud' });

      const firstCall = (prisma.conversationMeta.count as jest.Mock).mock.calls[0][0] as Record<
        string,
        unknown
      >;
      expect(firstCall.where).toMatchObject({ departmentSlug: 'salud' });
    });

    it('aplica filtro de agentId via conversation.assignedUserId', async () => {
      prisma.conversationMeta.count.mockResolvedValue(5 as never);

      await service.getFlowMetrics({ agentId: 'agent-xyz' });

      const firstCall = (prisma.conversationMeta.count as jest.Mock).mock.calls[0][0] as Record<
        string,
        unknown
      >;
      expect(firstCall.where).toMatchObject({ conversation: { assignedUserId: 'agent-xyz' } });
    });

    it('aplica filtros de fecha, department y agentId combinados', async () => {
      prisma.conversationMeta.count.mockResolvedValue(2 as never);
      const from = new Date('2026-05-01');
      const to = new Date('2026-05-31');

      await service.getFlowMetrics({ from, to, department: 'obras-publicas', agentId: 'agent-1' });

      const firstCall = (prisma.conversationMeta.count as jest.Mock).mock.calls[0][0] as Record<
        string,
        unknown
      >;
      expect(firstCall.where).toMatchObject({
        createdAt: { gte: from, lte: to },
        departmentSlug: 'obras-publicas',
        conversation: { assignedUserId: 'agent-1' },
      });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Timings
  // ──────────────────────────────────────────────────────────────────────────

  describe('getTimings (vía getTicketMetrics)', () => {
    it('calcula avgResolutionTime correctamente', async () => {
      const t1 = {
        id: 't1',
        createdAt: now,
        closedAt: new Date(now.getTime() + 60 * 60_000), // 60 min
        ticketMessages: [],
      };
      const t2 = {
        id: 't2',
        createdAt: now,
        closedAt: new Date(now.getTime() + 120 * 60_000), // 120 min
        ticketMessages: [],
      };

      prisma.ticket.count.mockResolvedValue(0 as never);
      prisma.ticket.groupBy.mockResolvedValue([] as never);

      // findMany se llama múltiples veces en paralelo (computeSla, getTimings ×2).
      // Usamos implementación que retorna los tickets cerrados cuando el where tiene closedAt,
      // y [] para el resto.
      prisma.ticket.findMany.mockImplementation(((args: Record<string, unknown>) => {
        const where = args?.where as Record<string, unknown> | undefined;
        if (where && 'closedAt' in where) {
          return Promise.resolve([t1, t2]);
        }
        return Promise.resolve([]);
      }) as never);

      const result = await service.getTicketMetrics({});

      expect(result.timings.avgResolutionTime).toBe(90); // (60+120)/2
    });

    it('calcula avgHandleTime como (último mensaje - primer mensaje agente) por ticket', async () => {
      /**
       * Ticket de prueba:
       * - Primer mensaje AGENT a los 2 min desde inicio
       * - Último mensaje (CITIZEN) a los 12 min desde inicio
       * → avgHandleTime = 12 - 2 = 10 min
       */
      const agentMsgAt = new Date(now.getTime() + 2 * 60_000); // +2 min (primer agente)
      const citizenMsgAt = new Date(now.getTime() + 12 * 60_000); // +12 min (último mensaje)

      const ticketWithMsgs = {
        ticketMessages: [
          { createdAt: agentMsgAt, actorType: 'AGENT' },
          { createdAt: citizenMsgAt, actorType: 'CITIZEN' },
        ],
      };

      prisma.ticket.count.mockResolvedValue(0 as never);
      prisma.ticket.groupBy.mockResolvedValue([] as never);
      // La tercer llamada de findMany (handleTickets) recibirá este ticket.
      // Las primeras dos son closedTickets y firstResponse tickets.
      prisma.ticket.findMany.mockImplementation(((args: Record<string, unknown>) => {
        const where = args?.where as Record<string, unknown> | undefined;
        const select = args?.select as Record<string, unknown> | undefined;
        // closedAt tickets: tienen where.closedAt
        if (where && 'closedAt' in where) return Promise.resolve([]);
        // handleTickets: select contiene ticketMessages con actorType en select
        if (select && 'ticketMessages' in select) {
          const tmSelect = select['ticketMessages'] as Record<string, unknown> | undefined;
          const tmInnerSelect = tmSelect?.['select'] as Record<string, unknown> | undefined;
          if (tmInnerSelect && 'actorType' in tmInnerSelect) {
            return Promise.resolve([ticketWithMsgs]);
          }
        }
        return Promise.resolve([]);
      }) as never);

      const result = await service.getTicketMetrics({});

      expect(result.timings.avgHandleTime).toBe(10);
    });

    it('retorna 0 en timings cuando no hay tickets cerrados', async () => {
      prisma.ticket.count.mockResolvedValue(0 as never);
      prisma.ticket.findMany.mockResolvedValue([] as never);
      prisma.ticket.groupBy.mockResolvedValue([] as never);

      const result = await service.getTicketMetrics({});

      expect(result.timings.avgResolutionTime).toBe(0);
      expect(result.timings.avgFirstResponseTime).toBe(0);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Daily volume
  // ──────────────────────────────────────────────────────────────────────────

  describe('getDailyVolume (vía getTicketMetrics)', () => {
    it('agrupa tickets por fecha correctamente', async () => {
      const day1 = new Date('2026-05-01T10:00:00.000Z');
      const day2 = new Date('2026-05-02T10:00:00.000Z');

      prisma.ticket.count.mockResolvedValue(0 as never);
      prisma.ticket.findMany.mockResolvedValue([] as never);
      prisma.ticket.groupBy
        .mockResolvedValueOnce([
          { createdAt: day1, _count: { id: 3 } },
          { createdAt: day2, _count: { id: 2 } },
        ] as never)
        .mockResolvedValueOnce([{ closedAt: day1, _count: { id: 1 } }] as never);

      const result = await service.getTicketMetrics({});

      const day1Entry = result.dailyVolume.find((d) => d.date === '2026-05-01');
      expect(day1Entry).toBeDefined();
      expect(day1Entry?.opened).toBe(3);
      expect(day1Entry?.closed).toBe(1);

      const day2Entry = result.dailyVolume.find((d) => d.date === '2026-05-02');
      expect(day2Entry?.opened).toBe(2);
      expect(day2Entry?.closed).toBe(0);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Filtros
  // ──────────────────────────────────────────────────────────────────────────

  describe('buildTicketWhere (filtros)', () => {
    it('incluye filtro de fecha cuando se pasan from y to', async () => {
      const from = new Date('2026-05-01');
      const to = new Date('2026-05-31');
      prisma.ticket.count.mockResolvedValue(0 as never);
      prisma.ticket.findMany.mockResolvedValue([] as never);
      prisma.ticket.groupBy.mockResolvedValue([] as never);

      await service.getTicketMetrics({ from, to });

      // El primer llamado a count debe incluir filtro createdAt
      const firstCall = (prisma.ticket.count as jest.Mock).mock.calls[0][0] as Record<
        string,
        unknown
      >;
      expect(firstCall.where).toMatchObject({
        createdAt: { gte: from, lte: to },
      });
    });

    it('incluye filtro de departamento cuando se pasa department', async () => {
      prisma.ticket.count.mockResolvedValue(0 as never);
      prisma.ticket.findMany.mockResolvedValue([] as never);
      prisma.ticket.groupBy.mockResolvedValue([] as never);

      await service.getTicketMetrics({ department: 'obras-publicas' });

      const firstCall = (prisma.ticket.count as jest.Mock).mock.calls[0][0] as Record<
        string,
        unknown
      >;
      expect(firstCall.where).toMatchObject({ departmentSlug: 'obras-publicas' });
    });
  });
});
