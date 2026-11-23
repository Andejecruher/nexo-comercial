/**
 * Ciclo de recontacto contra PostgreSQL real.
 *
 * El hueco que los unit mocks no cubren: los índices parciales reales
 * (`uq_conversations_active_per_citizen_channel` y
 * `uq_conversations_canonical_per_citizen`) son los que convertían el
 * recontacto post-cierre en un P2002 determinístico, y las
 * `updateMany` guardadas de `reactivateCycle` sólo son verificables
 * contra las filas reales.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from '@jest/globals';
import { ConversationFlowState, PrismaClient, TicketStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { ConversationRepository } from '../../repositories/conversation.repository';
import { ConversationStateMachine } from '../../services/orchestrator/conversation-state-machine';
import { TicketService } from '../../services/tickets/ticket.service';

describe('conversation-cycle — real PostgreSQL', () => {
  let prisma: PrismaClient;
  let repo: ConversationRepository;
  let stateMachine: ConversationStateMachine;
  let ticketService: TicketService;
  const createdCitizenIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    repo = new ConversationRepository(prisma as never);
    stateMachine = new ConversationStateMachine(repo);
    ticketService = new TicketService(prisma as never);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  afterEach(async () => {
    for (const citizenId of createdCitizenIds.splice(0)) {
      await prisma.citizen.deleteMany({ where: { id: citizenId } });
    }
  });

  async function createCitizen(): Promise<string> {
    const citizen = await prisma.citizen.create({
      data: { phone: `+54911${randomUUID().slice(0, 8)}` },
    });
    createdCitizenIds.push(citizen.id);
    return citizen.id;
  }

  function makeFolio(): string {
    return randomUUID().replace(/-/g, '').slice(0, 32);
  }

  async function setFlowState(conversationId: string, flowState: ConversationFlowState): Promise<void> {
    await prisma.conversationMeta.update({
      where: { conversationId },
      data: { flowState, version: { increment: 1 } },
    });
  }

  it('el índice único parcial impide una segunda fila canónica por ciudadano', async () => {
    const citizenId = await createCitizen();
    const first = await prisma.conversation.create({ data: { citizenId } });
    await prisma.conversation.update({
      where: { id: first.id },
      data: { status: 'closed' },
    });

    await expect(prisma.conversation.create({ data: { citizenId } })).rejects.toMatchObject({
      code: 'P2002',
    });

    // Con la primera demovida, la segunda puede ser la canónica.
    await prisma.conversation.update({
      where: { id: first.id },
      data: { isCanonical: false },
    });
    await expect(prisma.conversation.create({ data: { citizenId } })).resolves.toBeDefined();
  });

  it('reutiliza la conversación viva sin reactivar ni crear', async () => {
    const citizenId = await createCitizen();
    const created = await repo.findOrCreateCanonical(citizenId);
    expect(created.created).toBe(true);
    expect(created.reactivated).toBe(false);

    const again = await repo.findOrCreateCanonical(citizenId);
    expect(again.id).toBe(created.id);
    expect(again.status).toBe('open');
    expect(again.created).toBe(false);
    expect(again.reactivated).toBe(false);
  });

  it('reactiva la canónica cerrada: misma fila, BOT_FLOW y ticket viejo cerrado', async () => {
    const citizenId = await createCitizen();
    const conversation = await prisma.conversation.create({ data: { citizenId } });
    await prisma.conversationMeta.create({ data: { conversationId: conversation.id } });
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { status: 'closed' },
    });
    await setFlowState(conversation.id, 'CLOSED');
    const staleTicket = await prisma.ticket.create({
      data: { conversationId: conversation.id, citizenId, folio: makeFolio() },
    });

    const result = await repo.findOrCreateCanonical(citizenId);

    expect(result.id).toBe(conversation.id);
    expect(result.created).toBe(false);
    expect(result.reactivated).toBe(true);
    expect(result.status).toBe('open');

    const fresh = await prisma.conversation.findUniqueOrThrow({
      where: { id: conversation.id },
      include: { meta: true },
    });
    expect(fresh.status).toBe('open');
    expect(fresh.meta?.flowState).toBe('BOT_FLOW');

    const stale = await prisma.ticket.findUniqueOrThrow({ where: { id: staleTicket.id } });
    expect(stale.status).toBe(TicketStatus.CLOSED);
    expect(stale.closeReason).toBe('cycle_restart');

    const rows = await prisma.conversation.count({ where: { citizenId } });
    expect(rows).toBe(1);
  });

  it('el estado bug (status open + FSM CLOSED) se cura y siempre nace ticket nuevo', async () => {
    const citizenId = await createCitizen();
    const conversation = await prisma.conversation.create({ data: { citizenId } });
    await prisma.conversationMeta.create({ data: { conversationId: conversation.id } });
    await setFlowState(conversation.id, 'CLOSED');
    const staleTicket = await prisma.ticket.create({
      data: { conversationId: conversation.id, citizenId, folio: makeFolio() },
    });

    const result = await repo.findOrCreateCanonical(citizenId);

    expect(result.id).toBe(conversation.id);
    expect(result.reactivated).toBe(true);
    expect(result.status).toBe('open');

    const freshMeta = await prisma.conversationMeta.findUniqueOrThrow({
      where: { conversationId: conversation.id },
    });
    expect(freshMeta.flowState).toBe('BOT_FLOW');
    expect(freshMeta.version).toBeGreaterThan(0);

    const stale = await prisma.ticket.findUniqueOrThrow({ where: { id: staleTicket.id } });
    expect(stale.status).toBe(TicketStatus.CLOSED);

    const ticket = await ticketService.getOrCreateActiveTicket(conversation.id, citizenId);
    expect(ticket.created).toBe(true);
    expect(ticket.ticket.id).not.toBe(staleTicket.id);

    const rows = await prisma.conversation.count({ where: { citizenId } });
    expect(rows).toBe(1);
  });

  it('el listado devuelve una sola fila por ciudadano aunque exista una legacy', async () => {
    const citizenId = await createCitizen();
    const legacy = await prisma.conversation.create({ data: { citizenId } });
    await prisma.conversationMeta.create({ data: { conversationId: legacy.id } });
    await prisma.conversation.update({
      where: { id: legacy.id },
      data: { status: 'closed', isCanonical: false },
    });
    const canonical = await prisma.conversation.create({ data: { citizenId } });
    await prisma.conversationMeta.create({ data: { conversationId: canonical.id } });

    const total = await prisma.conversation.count({ where: { citizenId } });
    expect(total).toBe(2);

    const list = await repo.listWithContext({ limit: 10, citizenId });
    expect(list.items).toHaveLength(1);
    expect(list.items[0]?.id).toBe(canonical.id);
  });

  it('la reactivación concurrente es idempotente: una sola vez reporta el ciclo', async () => {
    const citizenId = await createCitizen();
    const conversation = await prisma.conversation.create({ data: { citizenId } });
    await prisma.conversationMeta.create({ data: { conversationId: conversation.id } });
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { status: 'closed' },
    });
    await setFlowState(conversation.id, 'CLOSED');

    const [a, b] = await Promise.all([
      repo.findOrCreateCanonical(citizenId),
      repo.findOrCreateCanonical(citizenId),
    ]);

    expect(a.id).toBe(conversation.id);
    expect(b.id).toBe(conversation.id);
    expect([a.reactivated, b.reactivated].filter(Boolean)).toHaveLength(1);

    const fresh = await prisma.conversation.findUniqueOrThrow({
      where: { id: conversation.id },
      include: { meta: true },
    });
    expect(fresh.status).toBe('open');
    expect(fresh.meta?.flowState).toBe('BOT_FLOW');

    const rows = await prisma.conversation.count({ where: { citizenId } });
    expect(rows).toBe(1);
  });

  it('la state machine cierra status y tickets al llegar a CLOSED', async () => {
    const citizenId = await createCitizen();
    const conversation = await prisma.conversation.create({ data: { citizenId } });
    await prisma.conversationMeta.create({ data: { conversationId: conversation.id } });
    const ticket = await prisma.ticket.create({
      data: { conversationId: conversation.id, citizenId, folio: makeFolio() },
    });

    await stateMachine.transition(conversation.id, 'CLOSED', 0, { suppressEventBus: true });

    const fresh = await prisma.conversation.findUniqueOrThrow({
      where: { id: conversation.id },
      include: { meta: true },
    });
    expect(fresh.status).toBe('closed');
    expect(fresh.meta?.flowState).toBe('CLOSED');

    const closedTicket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(closedTicket.status).toBe(TicketStatus.CLOSED);
    expect(closedTicket.closeReason).toBe('conversation_closed');
  });
});
