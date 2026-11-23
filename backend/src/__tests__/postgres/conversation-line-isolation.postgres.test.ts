import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { ConversationRepository } from '../../repositories/conversation.repository';
import { MessageRepository } from '../../repositories/message.repository';
import { InboundIngestionService } from '../../services/ingress/inbound-ingestion.service';
import { RealtimeNotifier } from '../../services/realtime/realtime-notifier.service';
import { TicketService } from '../../services/tickets/ticket.service';
import { AgentRegistry } from '../../ai/registry/agent.registry';
import { MessageService } from '../../services/message.service';
import type { ParsedWebhookMessage } from '../../utils/wa-message-parser';

describe('WhatsApp line isolation — real PostgreSQL', () => {
  const prisma = new PrismaClient();
  const db = prisma as never;
  const repo = new ConversationRepository(db);
  const messages = new MessageRepository(db);
  const notifier = new RealtimeNotifier(undefined, true);
  const ingestion = new InboundIngestionService(db, notifier, new TicketService(db));
  const phone = `521${Date.now()}`;
  const createdPhones = [phone];
  const lineIds: string[] = [];
  const agentIds: string[] = [];
  let a: { id: string; externalIdentifier: string };
  let b: typeof a;

  beforeAll(async () => {
    for (const label of ['A', 'B']) {
      const agent = await prisma.aiAgent.create({
        data: {
          slug: `isolation-${randomUUID()}`,
          name: label,
          provider: 'openai',
          model: `model-${label}`,
        },
      });
      agentIds.push(agent.id);
      const line = await prisma.communicationLine.create({
        data: {
          displayName: label,
          externalIdentifier: randomUUID(),
          agentId: agent.id,
          aiEnabled: true,
        },
      });
      lineIds.push(line.id);
      if (label === 'A') a = line;
      else b = line;
    }
  });
  afterAll(async () => {
    const citizens = await prisma.citizen.findMany({ where: { phone: { in: createdPhones } } });
    const conversations = await prisma.conversation.findMany({
      where: { citizenId: { in: citizens.map((c) => c.id) } },
    });
    await prisma.realtimeOutboxEvent.deleteMany({
      where: {
        OR: conversations.map((c) => ({ payload: { path: ['conversationId'], equals: c.id } })),
      },
    });
    await prisma.inboxEvent.deleteMany({ where: { phone: { in: createdPhones } } });
    await prisma.citizen.deleteMany({ where: { id: { in: citizens.map((c) => c.id) } } });
    await prisma.communicationLine.deleteMany({ where: { id: { in: lineIds } } });
    await prisma.aiAgent.deleteMany({ where: { id: { in: agentIds } } });
    await prisma.$disconnect();
  });
  function input(line: typeof a, text: string, contact = phone): ParsedWebhookMessage {
    const id = randomUUID();
    return {
      wamid: id,
      phone: contact,
      timestamp: String(Math.floor(Date.now() / 1000)),
      phoneNumberId: line.externalIdentifier,
      profileName: 'Audit',
      message: {
        id,
        type: 'text',
        from: contact,
        timestamp: String(Math.floor(Date.now() / 1000)),
        text: { body: text },
      },
    };
  }
  async function ingest(line: typeof a, text: string, contact = phone) {
    const event = await ingestion.ingest(input(line, text, contact), randomUUID());
    return prisma.message.findUniqueOrThrow({ where: { id: event.messageId! } });
  }

  it('A → B → A preserves both inboxes, messages, ticket ownership and realtime line IDs', async () => {
    const first = await ingest(a, 'only A');
    const second = await ingest(b, 'only B');
    const third = await ingest(a, 'back to A');
    expect(first.conversationId).not.toBe(second.conversationId);
    expect(third.conversationId).toBe(first.conversationId);
    for (const [line, id, count] of [
      [a, first.conversationId, 2],
      [b, second.conversationId, 1],
    ] as const) {
      const context = await repo.getConversationContext(id);
      expect(context?.meta?.communicationLineId).toBe(line.id);
      expect(context?.communicationLineId).toBe(line.id);
      expect(await prisma.message.count({ where: { conversationId: id } })).toBe(count);
      const list = await repo.listWithContext({ communicationLineId: line.id, limit: 20 });
      expect(list.items.map((c) => c.id)).toContain(id);
      expect(list.items.map((c) => c.id)).not.toContain(
        line.id === a.id ? second.conversationId : first.conversationId,
      );
      const events = await prisma.realtimeOutboxEvent.findMany({
        where: { payload: { path: ['conversationId'], equals: id } },
      });
      expect(events.length).toBeGreaterThan(0);
      for (const event of events)
        expect(event.payload).toEqual(expect.objectContaining({ communicationLineId: line.id }));
      expect(await prisma.ticket.count({ where: { conversationId: id, status: 'OPEN' } })).toBe(1);
    }
    await expect(repo.bindCommunicationLine(first.conversationId, b.id)).rejects.toThrow();
    await expect(
      prisma.conversationMeta.update({
        where: { conversationId: first.conversationId },
        data: { communicationLineId: b.id },
      }),
    ).rejects.toThrow();
  });

  it('duplicate and simultaneous webhooks preserve exactly one message per wamid and one conversation per line', async () => {
    const contact = `521${Date.now()}99`;
    createdPhones.push(contact);
    const one = input(a, 'concurrent A', contact);
    const two = input(b, 'concurrent B', contact);
    await Promise.all([one, two, one, two].map((event) => ingestion.ingest(event, randomUUID())));
    const citizen = await prisma.citizen.findUniqueOrThrow({ where: { phone: contact } });
    const rows = await prisma.conversation.findMany({
      where: { citizenId: citizen.id },
      include: { messages: true },
    });
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((c) => c.communicationLineId))).toEqual(new Set([a.id, b.id]));
    expect(rows.map((c) => c.messages.length)).toEqual([1, 1]);
    const [left, right] = await Promise.all([
      repo.findOrCreateCanonical(citizen.id, { communicationLineId: a.id }),
      repo.findOrCreateCanonical(citizen.id, { communicationLineId: a.id }),
    ]);
    expect(left.id).toBe(right.id);
  });

  it('preserves an indexed line scope when recovering a missing meta row', async () => {
    const citizen = await prisma.citizen.create({ data: { phone: `521${Date.now()}77` } });
    createdPhones.push(citizen.phone!);
    const conversation = await prisma.conversation.create({
      data: {
        citizenId: citizen.id,
        communicationLineId: a.id,
        status: 'open',
        isCanonical: true,
      },
    });

    await expect(repo.bindCommunicationLine(conversation.id, b.id)).rejects.toThrow(
      'La conversación pertenece a otra línea',
    );
    await expect(
      prisma.conversationMeta.findUnique({ where: { conversationId: conversation.id } }),
    ).resolves.toBeNull();

    await expect(
      repo.findOrCreateCanonical(citizen.id, { communicationLineId: a.id }),
    ).resolves.toMatchObject({ id: conversation.id, created: false });

    const context = await repo.getConversationContext(conversation.id);
    expect(context?.communicationLineId).toBe(a.id);
    expect(context?.meta?.communicationLineId).toBe(a.id);
  });

  it('rejects ambiguous line-less resolution and preserves multimedia metadata on each line', async () => {
    const citizen = await prisma.citizen.findUniqueOrThrow({ where: { phone } });
    await expect(repo.findOrCreateCanonical(citizen.id)).rejects.toThrow('Selecciona la línea');
    for (const line of [a, b]) {
      const event = input(line, '');
      event.message = {
        id: event.wamid,
        type: 'audio',
        from: phone,
        timestamp: event.timestamp,
        audio: { id: randomUUID(), mime_type: 'audio/ogg' },
      };
      const stored = await ingestion.ingest(event, randomUUID());
      const message = await prisma.message.findUniqueOrThrow({ where: { id: stored.messageId! } });
      expect(message.messageType).toBe('audio');
      expect(message.meta).toEqual(
        expect.objectContaining({
          lineId: line.id,
          media: expect.objectContaining({ phoneNumberId: line.externalIdentifier }),
        }),
      );
      expect(
        (await repo.getConversationContext(message.conversationId))?.meta?.communicationLineId,
      ).toBe(line.id);
    }
  });

  it('same-line first-create race resolves one winner while different lines create independent rows', async () => {
    const citizen = await prisma.citizen.create({ data: { phone: `521${Date.now()}88` } });
    createdPhones.push(citizen.phone!);
    const [one, two, other] = await Promise.all([
      repo.findOrCreateCanonical(citizen.id, { communicationLineId: a.id }),
      repo.findOrCreateCanonical(citizen.id, { communicationLineId: a.id }),
      repo.findOrCreateCanonical(citizen.id, { communicationLineId: b.id }),
    ]);
    expect(one.id).toBe(two.id);
    expect(other.id).not.toBe(one.id);
    await prisma.conversation.update({ where: { id: one.id }, data: { status: 'closed' } });
    await prisma.conversationMeta.update({
      where: { conversationId: one.id },
      data: { flowState: 'CLOSED' },
    });
    expect((await repo.findOrCreateCanonical(citizen.id, { communicationLineId: a.id })).id).toBe(
      one.id,
    );
    expect((await repo.getConversationContext(other.id))?.meta?.flowState).toBe('BOT_FLOW');
  });

  it('resolves distinct agents and reads AI history only from the requested conversation', async () => {
    await prisma.inboxEvent.updateMany({ where: { phone }, data: { status: 'processed' } });
    // A contact number may also be a configured business line. The explicit
    // receiver must still select B, regardless of a phone lookup matching A.
    await prisma.communicationLine.update({
      where: { id: a.id },
      data: { phoneNumber: phone, isDefault: true },
    });
    const registry = new AgentRegistry(db);
    expect(
      await registry.resolveLineAgent({
        channel: 'whatsapp',
        externalIdentifier: 'unknown',
        phoneNumber: phone,
      }),
    ).toBeUndefined();
    for (const [line, label] of [
      [a, 'A'],
      [b, 'B'],
    ] as const) {
      const agent = await registry.resolveLineAgent({
        channel: 'whatsapp',
        externalIdentifier: line.externalIdentifier,
        phoneNumber: phone,
      });
      expect(agent?.agent.name).toBe(label);
      expect(agent?.agent.model).toBe(`model-${label}`);
      const citizen = await prisma.citizen.findUniqueOrThrow({ where: { phone } });
      const conversation = await repo.findOrCreateCanonical(citizen.id, {
        communicationLineId: line.id,
      });
      const history = await messages.findRecentForAiContext({
        conversationId: conversation.id,
        limit: 20,
      });
      expect(history.length).toBeGreaterThan(0);
      const owned = await prisma.message.findMany({
        where: { conversationId: conversation.id },
        select: { id: true },
      });
      expect(history.every((m) => owned.some((row) => row.id === m.id))).toBe(true);
      expect(history.some((m) => m.body === `only ${label === 'A' ? 'B' : 'A'}`)).toBe(false);
    }
  });

  it('outgoing replies use their conversation line and retain independent histories', async () => {
    const user = await prisma.user.create({
      data: { email: `${randomUUID()}@audit.test`, fullName: 'Audit', hashedPassword: 'test' },
    });
    try {
      const enqueue = jest.fn(async (..._args: unknown[]) => undefined);
      const service = new MessageService(messages, { enqueue } as never, undefined, db);
      const citizen = await prisma.citizen.findUniqueOrThrow({ where: { phone } });
      for (const line of [a, b]) {
        const conversation = await repo.findOrCreateCanonical(citizen.id, {
          communicationLineId: line.id,
        });
        const sent = await service.sendMessage({
          conversationId: conversation.id,
          body: `reply ${line.id}`,
          messageType: 'text',
          senderId: user.id,
          idempotencyKey: randomUUID(),
        });
        expect(sent.message.conversationId).toBe(conversation.id);
        expect(enqueue).toHaveBeenLastCalledWith(
          phone,
          expect.anything(),
          expect.any(String),
          conversation.id,
          { lineId: line.id },
        );
      }
    } finally {
      await prisma.user.delete({ where: { id: user.id } });
    }
  });
});
