import { CampaignMessageService } from '../../services/campaigns/campaign-message.service';
import { TicketRepository } from '../../repositories/ticket.repository';
import { afterAll, afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { MessageType, PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { MessageRepository } from '../../repositories/message.repository';
import { MessageService } from '../../services/message.service';
import { inboundContent } from '../../services/message-content';
import { InboundIngestionService } from '../../services/ingress/inbound-ingestion.service';
import { RealtimeNotifier } from '../../services/realtime/realtime-notifier.service';
import { TicketService } from '../../services/tickets/ticket.service';
import type { PrismaService } from '../../services/prisma.service';
import { TemplateManagementService } from '../../services/templates/template-management.service';

const prisma = new PrismaClient();
const db = prisma as PrismaService;
const repo = new MessageRepository(db);
const citizenIds: string[] = [];
const inboxIds: string[] = [];
const userIds: string[] = [];
const lineIds: string[] = [];
const campaignIds: string[] = [];
beforeAll(async () => {
  await prisma.$connect();
});
afterEach(async () => {
  jest.restoreAllMocks();
  await prisma.inboxEvent.deleteMany({ where: { wamid: { in: inboxIds.splice(0) } } });
  const conversations = await prisma.conversation.findMany({
    where: { citizenId: { in: citizenIds } },
    select: { id: true },
  });
  await prisma.outboxEvent.deleteMany({
    where: { conversationId: { in: conversations.map((c) => c.id) } },
  });
  await prisma.citizen.deleteMany({ where: { id: { in: citizenIds.splice(0) } } });
  await prisma.campaignRecipient.deleteMany({ where: { campaignId: { in: campaignIds } } });
  await prisma.campaign.deleteMany({ where: { id: { in: campaignIds.splice(0) } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds.splice(0) } } });
  await prisma.communicationLine.deleteMany({ where: { id: { in: lineIds.splice(0) } } });
});
afterAll(async () => {
  await prisma.$disconnect();
});
async function conversation() {
  const citizen = await prisma.citizen.create({
    data: { phone: `52${Date.now()}${Math.floor(Math.random() * 100)}` },
  });
  citizenIds.push(citizen.id);
  return prisma.conversation.create({ data: { citizenId: citizen.id } });
}

describe('Message history: real PostgreSQL', () => {
  it('returns latest 20, then older pages without duplicates even with tied timestamps and a new insert', async () => {
    const conv = await conversation();
    const date = new Date('2026-10-01T10:00:00Z');
    for (let i = 0; i < 45; i++)
      await prisma.message.create({
        data: {
          conversationId: conv.id,
          direction: 'outbound',
          body: String(i),
          messageType: Object.values(MessageType)[i % Object.values(MessageType).length],
          createdAt: date,
        },
      });
    const all = await prisma.message.findMany({
      where: { conversationId: conv.id },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const first = await repo.listByConversation({ conversationId: conv.id, limit: 20 });
    expect(first.items.map((m) => m.id)).toEqual(all.slice(-20).map((m) => m.id));
    expect(first.hasNextPage).toBe(true);
    await prisma.message.create({
      data: { conversationId: conv.id, direction: 'outbound', body: 'new' },
    });
    const second = await repo.listByConversation({
      conversationId: conv.id,
      limit: 20,
      cursor: first.items[0].id,
    });
    const third = await repo.listByConversation({
      conversationId: conv.id,
      limit: 20,
      cursor: second.items[0].id,
    });
    expect([...third.items, ...second.items, ...first.items].map((m) => m.id)).toEqual(
      all.map((m) => m.id),
    );
    expect(third.hasNextPage).toBe(false);
    const another = await conversation();
    await expect(
      repo.listByConversation({ conversationId: another.id, limit: 20, cursor: first.items[0].id }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('recovers legacy media from inbox payload and includes attachmentId-only relationships', async () => {
    const conv = await conversation();
    const wamid = `wamid.${randomUUID()}`;
    inboxIds.push(wamid);
    await prisma.inboxEvent.create({
      data: {
        wamid,
        phone: '521234567890',
        idempotencyKey: wamid,
        payload: {
          message: {
            id: wamid,
            type: 'sticker',
            timestamp: '1790000000',
            sticker: { id: '12345', mime_type: 'image/webp', animated: true },
          },
        },
      },
    });
    const attachment = await prisma.attachment.create({
      data: {
        storageKey: '67890',
        mimeType: 'application/pdf',
        fileSizeBytes: 12n,
        originalFilename: 'evidence.pdf',
      },
    });
    try {
      await prisma.message.create({
        data: {
          conversationId: conv.id,
          direction: 'inbound',
          body: '',
          messageType: 'text',
          externalMessageId: wamid,
          attachmentId: attachment.id,
          meta: { type: 'sticker' },
        },
      });
      const page = await repo.listByConversation({ conversationId: conv.id, limit: 20 });
      expect(page.items[0].meta).toMatchObject({
        media: {
          id: '12345',
          animated: true,
          mimeType: 'image/webp',
        },
      });
      expect(page.items[0].attachmentsViaMessageId[0]).toMatchObject({
        originalFilename: 'evidence.pdf',
        storageKey: '67890',
      });
    } finally {
      await prisma.attachment.delete({ where: { id: attachment.id } });
    }
  });

  it('uses event time across inbound media, never outbound or processing time, and rejects expired free sends', async () => {
    const conv = await conversation();
    const stale = Math.floor((Date.now() - 25 * 3600000) / 1000);
    await prisma.message.create({
      data: {
        conversationId: conv.id,
        direction: 'inbound',
        body: '',
        messageType: 'image',
        meta: { eventTimestamp: stale, type: 'image' },
      },
    });
    await prisma.message.create({
      data: { conversationId: conv.id, direction: 'outbound', body: 'recent' },
    });
    expect((await repo.customerWindow(conv.id)).isOpen).toBe(false);
    const service = new MessageService(repo, { enqueue: jest.fn() } as never, undefined, db);
    await expect(
      service.sendMessage({
        conversationId: conv.id,
        body: 'no',
        messageType: 'text',
        senderId: randomUUID(),
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'WHATSAPP_WINDOW_CLOSED' });
    await prisma.message.create({
      data: {
        conversationId: conv.id,
        direction: 'inbound',
        body: '',
        messageType: 'audio',
        meta: inboundContent({
          id: 'wamid.audio',
          from: '52',
          timestamp: String(Math.floor(Date.now() / 1000) - 60),
          type: 'audio',
          audio: { id: '123' },
        }) as object,
      },
    });
    // Late processing of an older event must not shrink or reopen the window.
    await prisma.message.create({
      data: {
        conversationId: conv.id,
        direction: 'inbound',
        body: '',
        messageType: 'document',
        meta: { eventTimestamp: stale },
      },
    });
    const window = await repo.customerWindow(conv.id);
    expect(window.isOpen).toBe(true);
    expect((await repo.customerWindow(conv.id, new Date(window.expiresAt!))).isOpen).toBe(false);
  });

  it('persists duplicate multimedia webhooks once, with media and a ticket', async () => {
    const wamid = `wamid.${randomUUID()}`;
    inboxIds.push(wamid);
    const phone = `529${Date.now()}`;
    const receiver = await prisma.communicationLine.create({
      data: { displayName: 'Media fixture', externalIdentifier: randomUUID() },
    });
    lineIds.push(receiver.id);
    const input = {
      wamid,
      phone,
      timestamp: String(Math.floor(Date.now() / 1000)),
      phoneNumberId: receiver.externalIdentifier,
      message: {
        id: wamid,
        from: phone,
        timestamp: String(Math.floor(Date.now() / 1000)),
        type: 'sticker' as const,
        sticker: { id: '123', mime_type: 'image/webp', animated: true },
      },
    };
    const service = new InboundIngestionService(
      db,
      new RealtimeNotifier(undefined, false),
      new TicketService(new TicketRepository(db)),
    );
    const first = await service.ingest(input, randomUUID());
    const message = await prisma.message.findUniqueOrThrow({
      where: { id: first.messageId! },
      include: { conversation: true },
    });
    citizenIds.push(message.conversation.citizenId);
    await service.ingest(input, randomUUID());
    expect(await prisma.message.count({ where: { externalMessageId: wamid } })).toBe(1);
    expect(message.messageType).toBe('sticker');
    expect(message.ticketId).toBeTruthy();
    expect(message.meta).toMatchObject({ media: { id: '123', animated: true } });
  });

  it('atomically persists template snapshot and outbox, and replays concurrent retries', async () => {
    const conv = await conversation();
    const user = await prisma.user.create({
      data: {
        email: `${randomUUID()}@example.test`,
        hashedPassword: 'test-only',
        fullName: 'Test',
      },
    });
    userIds.push(user.id);
    const line = await prisma.communicationLine.create({
      data: { displayName: 'Test', channel: 'whatsapp', externalIdentifier: randomUUID() },
    });
    lineIds.push(line.id);
    const template = {
      id: '1234',
      name: 'hello',
      language: 'es_MX',
      status: 'APPROVED',
      category: 'UTILITY',
      components: [
        { type: 'BODY', text: 'Hola {{1}}' },
        { type: 'FOOTER', text: 'Gracias' },
        { type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: 'Confirmar' }] },
      ],
    };
    // Provider boundary is stubbed: DB, transactions, repository and ticket service are real.
    jest.spyOn(TemplateManagementService.prototype, 'assertOwnership').mockResolvedValue(template);
    const service = new MessageService(
      repo,
      { enqueue: jest.fn<() => Promise<void>>().mockResolvedValue(undefined) } as never,
      undefined,
      db,
      undefined,
      new TicketService(new TicketRepository(db)),
    );
    const input = {
      conversationId: conv.id,
      senderId: user.id,
      lineId: line.id,
      templateId: '1234',
      idempotencyKey: randomUUID(),
      values: { 'body.1': 'Ana' },
    };
    const result = await Promise.all([service.sendTemplate(input), service.sendTemplate(input)]);
    expect(result[0].message.id).toBe(result[1].message.id);
    expect(
      await prisma.outboxEvent.count({ where: { idempotencyKey: input.idempotencyKey } }),
    ).toBe(1);
    expect(result[0].message.meta).toMatchObject({
      templateSnapshot: {
        name: 'hello',
        values: { 'body.1': 'Ana' },
        components: template.components,
      },
    });
    expect(result[0].message.body).toBe('Hola Ana');
    expect((await repo.customerWindow(conv.id)).isOpen).toBe(false);
  });
  it('projects accepted campaigns with their immutable snapshot and delivery state exactly once', async () => {
    const conv = await conversation();
    const user = await prisma.user.create({
      data: {
        email: `${randomUUID()}@example.test`,
        hashedPassword: 'test',
        fullName: 'Campaign test',
      },
    });
    userIds.push(user.id);
    const line = await prisma.communicationLine.create({
      data: { displayName: 'Campaign test', channel: 'whatsapp', externalIdentifier: randomUUID() },
    });
    lineIds.push(line.id);
    const campaign = await prisma.campaign.create({
      data: {
        name: 'Test',
        purpose: 'Test',
        lineId: line.id,
        phoneNumberId: '123',
        templateId: '123',
        templateSnapshot: {
          name: 'original',
          language: 'es_MX',
          components: [{ type: 'BODY', text: 'Hola {{1}}' }],
        },
        mappings: {},
        source: 'citizen',
        total: 1,
        createdBy: user.id,
        idempotencyKey: randomUUID(),
        requestHash: 'hash',
        consentConfirmedAt: new Date(),
      },
    });
    campaignIds.push(campaign.id);
    const recipient = await prisma.campaignRecipient.create({
      data: {
        campaignId: campaign.id,
        citizenId: conv.citizenId,
        phone: '525500000000',
        variables: { 'body.1': 'Ana' },
        messageId: `wamid.${randomUUID()}`,
        dispatchState: 'accepted',
        acceptedAt: new Date('2026-10-01T10:00:00Z'),
        readAt: new Date(),
      },
    });
    const service = new CampaignMessageService(db);
    await service.sync(recipient.id);
    await service.sync(recipient.id);
    const projected = await prisma.conversation.findFirstOrThrow({
      where: { citizenId: conv.citizenId, communicationLineId: line.id },
    });
    const messages = await repo.listByConversation({ conversationId: projected.id, limit: 20 });
    expect(messages.items).toHaveLength(1);
    expect(messages.items[0].body).toBe('Hola Ana');
    expect(messages.items[0].createdAt.toISOString()).toBe('2026-10-01T10:00:00.000Z');
    expect(messages.items[0].meta).toMatchObject({
      templateSnapshot: { name: 'original', values: { 'body.1': 'Ana' } },
    });
    expect(messages.items[0].statuses.map((s) => s.status)).toEqual(['read']);
  });
});
