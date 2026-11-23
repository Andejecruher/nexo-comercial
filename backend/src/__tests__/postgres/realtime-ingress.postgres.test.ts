import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { randomUUID } from 'crypto';
import { env } from '../../config/env.config';
import { PrismaService } from '../../services/prisma.service';
import { RealtimeNotifier } from '../../services/realtime/realtime-notifier.service';
import { RealtimeOutboxRelay } from '../../services/realtime/realtime-outbox-relay.service';
import { InboundIngestionService } from '../../services/ingress/inbound-ingestion.service';
import { TicketService } from '../../services/tickets/ticket.service';
import { TicketRepository } from '../../repositories/ticket.repository';
import { MessageRepository } from '../../repositories/message.repository';
import { OutboxMessageRepository } from '../../repositories/outbox-message.repository';
import { AIService } from '../../ai/services/ai.service';
import { CitizenRepository } from '../../repositories/citizen.repository';
import { ConversationRepository } from '../../repositories/conversation.repository';
import { InboxProcessorService } from '../../services/events/inbox-processor.service';
import { withRealtimeTransaction } from '../../services/realtime/realtime-transaction';
import { buildMessageCreatedEvent } from '../../services/realtime/message-event.builder';
import type { RealtimeTransport } from '../../services/realtime/realtime-transport.contracts';
import type { ParsedWebhookMessage } from '../../utils/wa-message-parser';
import { PubSub } from '@google-cloud/pubsub';
import { createServer } from 'http';
import type { AddressInfo } from 'net';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { io } from 'socket.io-client';
import { WebsocketGatewayService } from '../../services/realtime/websocket-gateway.service';
import { RealtimeApiSubscriber } from '../../services/realtime/realtime-api-subscriber.service';
import { createPubSubRouter } from '../../routes/pubsub.routes';
import { PubSubRealtimeTransport } from '../../services/realtime/pubsub-realtime-transport.service';

jest.setTimeout(30_000);

describe('realtime ingress, durable publish and AI batching — PostgreSQL', () => {
  const prisma = new PrismaService();
  const publish = jest.fn<RealtimeTransport['publish']>().mockResolvedValue(undefined);
  const transport: RealtimeTransport = { publish, dispose: async () => undefined };
  const notifier = new RealtimeNotifier(transport, true, { prisma });
  const tickets = new TicketService(new TicketRepository(prisma), notifier, prisma);
  const ingress = new InboundIngestionService(prisma, notifier, tickets);
  let phone: string;
  const externalLine = `realtime-${randomUUID()}`;
  let lineId: string;
  beforeAll(async () => {
    lineId = (
      await prisma.communicationLine.create({
        data: { displayName: 'Realtime fixture', externalIdentifier: externalLine },
      })
    ).id;
  });
  const dispatcher = {
    dispatchBatchEvent: jest.fn(async () => undefined),
    dispatchInboxEvent: jest.fn(async () => undefined),
  };
  const batch = new InboxProcessorService(
    prisma,
    {} as never,
    {} as never,
    notifier,
    dispatcher as never,
  );
  const handleBatch = jest.fn<(...args: unknown[]) => Promise<void>>().mockResolvedValue(undefined);
  const runtime = batch as unknown as { buildOrchestrator: () => Promise<unknown> };
  runtime.buildOrchestrator = async () => ({ handleInboundBatch: handleBatch });

  function input(body = 'hola'): ParsedWebhookMessage {
    const wamid = 'test-realtime-' + randomUUID();
    return {
      wamid,
      phone,
      phoneNumberId: externalLine,
      timestamp: '1700000000',
      profileName: 'Ana Test',
      message: { id: wamid, type: 'text', from: phone, timestamp: '1700000000', text: { body } },
    };
  }
  async function waitForBatch(): Promise<void> {
    const deadline = Date.now() + 5000;
    while (!handleBatch.mock.calls.length) {
      if (Date.now() > deadline) throw new Error('AI turn did not start');
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  }

  beforeEach(() => {
    phone = '52199' + String(Date.now()) + String(Math.floor(Math.random() * 1000));
    publish.mockReset().mockResolvedValue(undefined);
    handleBatch.mockReset().mockResolvedValue(undefined);
    env.BATCHING_WINDOW_MS = 5000;
    env.BATCHING_MAX_WAIT_MS = 30000;
  });
  afterAll(async () => {
    await prisma.communicationLine.update({ where: { id: lineId }, data: { isActive: false } });
    await prisma.disconnect();
  });

  it('publishes the visible message and a real ticket before the 5s window or any AI call', async () => {
    const message = input();
    const inbox = await ingress.ingest(message, 'ingress-test');
    await batch.enqueue(message, inbox.id);
    expect(handleBatch).not.toHaveBeenCalled();
    expect(publish).toHaveBeenCalledTimes(3);
    expect(
      publish.mock.calls.every(
        ([event]) => 'correlationId' in event && event.correlationId === 'ingress-test',
      ),
    ).toBe(true);
    const inbound = await prisma.message.findUniqueOrThrow({ where: { id: inbox.messageId! } });
    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: inbound.ticketId! } });
    expect(ticket.conversationId).toBe(inbound.conversationId);
    expect(
      publish.mock.calls.find(([event]) => 'messagePatch' in event && event.messagePatch)?.[0],
    ).toMatchObject({
      messagePatch: { ticketId: ticket.id },
    });
    expect(
      await prisma.notification.count({ where: { conversationId: inbound.conversationId } }),
    ).toBe(2);
    expect(
      (
        await prisma.realtimeOutboxEvent.findMany({
          where: {
            id: {
              in: publish.mock.calls.map(([event]) => ('eventId' in event ? event.eventId : '')),
            },
          },
        })
      ).every((event) => event.status === 'published'),
    ).toBe(true);
  });

  it('deduplicates concurrent webhook retries in one transactionally consistent ingress', async () => {
    const message = input();
    const [a, b] = await Promise.all([ingress.ingest(message, 'a'), ingress.ingest(message, 'b')]);
    expect(a.messageId).toBe(b.messageId);
    expect(await prisma.message.count({ where: { externalMessageId: message.wamid } })).toBe(1);
    expect(publish).toHaveBeenCalledTimes(3);
    const stored = await prisma.message.findUniqueOrThrow({ where: { id: a.messageId! } });
    expect(
      await prisma.ticket.count({
        where: { conversationId: stored.conversationId, status: 'OPEN' },
      }),
    ).toBe(1);
  });

  it('publishes an AI tool reply only after its message, ticket association and WhatsApp outbox commit', async () => {
    const inbound = await ingress.ingest(input(), 'reply-seed');
    const original = await prisma.message.findUniqueOrThrow({ where: { id: inbound.messageId! } });
    const key = 'reply-' + randomUUID();
    const committed: boolean[] = [];
    publish.mockImplementation(async (event) => {
      if ('messagePatch' in event && event.messagePatch?.direction === 'outbound') {
        const association = await prisma.ticketMessage.findUnique({
          where: {
            ticketId_messageId: { ticketId: original.ticketId!, messageId: event.messagePatch.id },
          },
        });
        const outbox = await prisma.outboxEvent.findUnique({ where: { idempotencyKey: key } });
        committed.push(Boolean(association && outbox));
      }
    });
    const reply = await new OutboxMessageRepository(prisma, notifier).createOutboundTextWithOutbox({
      conversationId: original.conversationId,
      phone,
      body: 'Respuesta IA',
      idempotencyKey: key,
      ticketId: original.ticketId!,
      waPayload: {
        messaging_product: 'whatsapp',
        to: phone,
        type: 'text',
        text: { body: 'Respuesta IA' },
      },
    });
    expect(committed).toEqual([true]);
    expect(reply.isReplay).toBe(false);
    expect(
      (
        await prisma.ticketMessage.findUniqueOrThrow({
          where: {
            ticketId_messageId: { ticketId: original.ticketId!, messageId: reply.messageId },
          },
        })
      ).actorType,
    ).toBe('BOT');
  });

  it('keeps an AI reply on its originating ticket when another case opens during generation', async () => {
    const inbound = await ingress.ingest(input('first case'), 'origin');
    const original = await prisma.message.findUniqueOrThrow({ where: { id: inbound.messageId! } });
    await tickets.closeTicket(original.ticketId!);
    const next = await ingress.ingest(input('next case'), 'next-case');
    const successor = await prisma.message.findUniqueOrThrow({ where: { id: next.messageId! } });
    expect(successor.ticketId).not.toBe(original.ticketId);
    const service = new AIService({
      prisma,
      realtimeNotifier: notifier,
      ticketService: tickets,
      outboxProcessor: {} as never,
      messageRepo: new MessageRepository(prisma),
      citizenRepo: new CitizenRepository(prisma),
      conversationRepo: new ConversationRepository(prisma),
    });
    const key = 'origin-reply-' + randomUUID();
    const persist = service as unknown as {
      persistOutboundReply: (
        conversationId: string,
        body: string,
        key: string,
        meta: Record<string, unknown>,
        execution: Record<string, unknown>,
      ) => Promise<void>;
    };
    await persist.persistOutboundReply(
      original.conversationId,
      'reply to first case',
      key,
      { source: 'ai' },
      {
        phone,
        messageId: original.id,
        conversationId: original.conversationId,
        correlationId: 'origin',
      },
    );
    expect(
      (await prisma.message.findUniqueOrThrow({ where: { idempotencyKey: key } })).ticketId,
    ).toBe(original.ticketId);
  });

  it('keeps future pending fragments out of AI history while retaining completed turns and replies', async () => {
    const previous = await ingress.ingest(input('completed turn'), 'previous');
    const pending = await ingress.ingest(input('successor turn'), 'future');
    await prisma.inboxEvent.update({ where: { id: previous.id }, data: { status: 'processed' } });
    const message = await prisma.message.findUniqueOrThrow({ where: { id: previous.messageId! } });
    const reply = await prisma.message.create({
      data: {
        conversationId: message.conversationId,
        body: 'agent reply',
        direction: 'outbound',
      },
    });
    const repository = new MessageRepository(prisma);
    const history = await repository.findRecentForAiContext({
      conversationId: message.conversationId,
      limit: 20,
    });
    expect(history.map((row) => row.id)).toEqual([previous.messageId, reply.id]);
    await prisma.inboxEvent.update({ where: { id: pending.id }, data: { status: 'processed' } });
    expect(
      (
        await repository.findRecentForAiContext({
          conversationId: message.conversationId,
          limit: 20,
        })
      ).map((row) => row.id),
    ).toContain(pending.messageId);
  });

  it('does not publish an event from an aborted transaction', async () => {
    const inbox = await ingress.ingest(input(), 'seed');
    const original = await prisma.message.findUniqueOrThrow({ where: { id: inbox.messageId! } });
    publish.mockClear();
    const externalId = 'rollback-' + randomUUID();
    await expect(
      withRealtimeTransaction(prisma, notifier, async (tx) => {
        const message = await tx.message.create({
          data: {
            conversationId: original.conversationId,
            body: 'rollback',
            direction: 'inbound',
            messageType: 'text',
            externalMessageId: externalId,
          },
        });
        await notifier.notifyCritical(
          tx,
          buildMessageCreatedEvent(
            message,
            original.conversationId,
            'rollback',
            message.createdAt.toISOString(),
          ),
        );
        throw new Error('abort');
      }),
    ).rejects.toThrow('abort');
    expect(publish).not.toHaveBeenCalled();
    expect(await prisma.message.count({ where: { externalMessageId: externalId } })).toBe(0);
  });

  it('recovers committed events after transport failure without Scheduler or Cloud Tasks notifications', async () => {
    publish.mockRejectedValue(new Error('transport unavailable'));
    const inbox = await ingress.ingest(input(), 'recovery');
    const message = await prisma.message.findUniqueOrThrow({ where: { id: inbox.messageId! } });
    const ids = publish.mock.calls.map(([event]) => ('eventId' in event ? event.eventId : ''));
    expect(ids).toContain(message.id);
    await prisma.realtimeOutboxEvent.updateMany({
      where: { id: { in: ids } },
      data: { nextRetryAt: new Date(0) },
    });
    publish.mockResolvedValue(undefined);
    await new RealtimeOutboxRelay(prisma, transport).runCycle();
    expect(
      await prisma.realtimeOutboxEvent.count({ where: { id: { in: ids }, status: 'published' } }),
    ).toBe(3);
  });

  it('caps the DB window at 30s rather than extending it to last arrival plus 5s', async () => {
    const message = input();
    const inbox = await ingress.ingest(message, 'cap');
    await batch.enqueue(message, inbox.id);
    const opened = new Date(Date.now() - 28_000);
    await prisma.batchWindow.update({ where: { phone }, data: { windowOpenedAt: opened } });
    await batch.enqueue(message, inbox.id);
    const window = await prisma.batchWindow.findUniqueOrThrow({ where: { phone } });
    expect(window.batchReadyAt!.getTime()).toBeLessThanOrEqual(opened.getTime() + 30_000);
    expect(window.batchReadyAt!.getTime()).toBeGreaterThan(opened.getTime() + 29_000);
  });

  it('seals an elapsed window before a later arrival when its worker has not started', async () => {
    const first = input('old window');
    const oldInbox = await ingress.ingest(first, 'old');
    await batch.enqueue(first, oldInbox.id);
    const oldWindow = await prisma.batchWindow.findUniqueOrThrow({ where: { phone } });
    await prisma.$executeRaw`UPDATE batch_windows SET batch_ready_at = clock_timestamp() WHERE phone = ${phone}`;
    const second = input('successor');
    const newInbox = await ingress.ingest(second, 'new');
    await batch.enqueue(second, newInbox.id);
    const currentWindow = await prisma.batchWindow.findUniqueOrThrow({ where: { phone } });
    expect(currentWindow.batchGeneration).toBe(oldWindow.batchGeneration + 1);
    expect(
      (await prisma.inboxEvent.findUniqueOrThrow({ where: { id: oldInbox.id } })).batchGeneration,
    ).toBe(oldWindow.batchGeneration);
    expect(
      (await prisma.inboxEvent.findUniqueOrThrow({ where: { id: newInbox.id } })).batchGeneration,
    ).toBe(currentWindow.batchGeneration);
    await expect(batch.processBatch(phone, currentWindow.batchGeneration)).rejects.toThrow(
      'An earlier batch has not finished',
    );
    await batch.processBatch(phone, oldWindow.batchGeneration);
    const fragments = handleBatch.mock.calls[0][1] as ParsedWebhookMessage[];
    expect(fragments.map((fragment) => fragment.wamid)).toEqual([first.wamid]);
  });

  it('prevents a late publisher from finalizing a newer owner claim', async () => {
    const inbox = await ingress.ingest(input(), 'owner');
    const id = inbox.messageId!;
    await prisma.realtimeOutboxEvent.update({
      where: { id },
      data: { status: 'pending', publishedAt: null },
    });
    publish.mockImplementationOnce(async () => {
      await prisma.realtimeOutboxEvent.update({
        where: { id },
        data: { status: 'publishing', lockedBy: 'new-owner', lockedAt: new Date() },
      });
    });
    await new RealtimeOutboxRelay(prisma, transport).processEventById(id);
    expect(await prisma.realtimeOutboxEvent.findUniqueOrThrow({ where: { id } })).toMatchObject({
      status: 'publishing',
      lockedBy: 'new-owner',
      publishedAt: null,
    });
  });

  it('dead letters exhausted fragments and releases the next generation after retiring the failed claim', async () => {
    const first = input('exhausted');
    const inbox = await ingress.ingest(first, 'exhausted');
    await batch.enqueue(first, inbox.id);
    const window = await prisma.batchWindow.findUniqueOrThrow({ where: { phone } });
    await prisma.inboxEvent.update({ where: { id: inbox.id }, data: { retryCount: 5 } });
    await prisma.batchWindow.update({ where: { phone }, data: { batchReadyAt: new Date() } });
    handleBatch.mockRejectedValueOnce(new Error('unavailable'));
    await expect(batch.processBatch(phone, window.batchGeneration)).rejects.toThrow('unavailable');
    expect((await prisma.inboxEvent.findUniqueOrThrow({ where: { id: inbox.id } })).status).toBe(
      'dead_lettered',
    );
    await batch.processBatch(phone, window.batchGeneration);
    const successor = input('next generation');
    const nextInbox = await ingress.ingest(successor, 'next');
    await batch.enqueue(successor, nextInbox.id);
    const nextWindow = await prisma.batchWindow.findUniqueOrThrow({ where: { phone } });
    await prisma.batchWindow.update({ where: { phone }, data: { batchReadyAt: new Date() } });
    await batch.processBatch(phone, nextWindow.batchGeneration);
    expect(
      (await prisma.inboxEvent.findUniqueOrThrow({ where: { id: nextInbox.id } })).status,
    ).toBe('processed');
  });

  it('keeps failed-batch membership stable while new fragments form a successor window', async () => {
    const first = input('uno');
    const second = input('dos');
    for (const message of [first, second]) {
      const inbox = await ingress.ingest(message, 'batch');
      await batch.enqueue(message, inbox.id);
    }
    const window = await prisma.batchWindow.findUniqueOrThrow({ where: { phone } });
    await prisma.batchWindow.update({ where: { phone }, data: { batchReadyAt: new Date() } });
    let fail!: (error: Error) => void;
    handleBatch.mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, reject) => {
          fail = reject;
        }),
    );
    const running = batch.processBatch(phone, window.batchGeneration);
    const failure = expect(running).rejects.toThrow('transient AI error');
    await waitForBatch();
    const third = input('tres');
    const inbox = await ingress.ingest(third, 'successor');
    // A late commit may carry an older transaction timestamp; ownership still stays with its window.
    await prisma.inboxEvent.update({ where: { id: inbox.id }, data: { createdAt: new Date(0) } });
    await batch.enqueue(third, inbox.id);
    fail(new Error('transient AI error'));
    await failure;
    expect((await prisma.inboxEvent.findUniqueOrThrow({ where: { id: inbox.id } })).status).toBe(
      'pending',
    );
    await batch.processBatch(phone, window.batchGeneration);
    const retried = handleBatch.mock.calls[1] as unknown as [string, ParsedWebhookMessage[]];
    expect(retried[1].map((fragment) => fragment.wamid)).toEqual([first.wamid, second.wamid]);
    expect((await prisma.inboxEvent.findUniqueOrThrow({ where: { id: inbox.id } })).status).toBe(
      'pending',
    );
  });

  (process.env.PUBSUB_EMULATOR_HOST ? it : it.skip)(
    'delivers eager ingress through real Pub/Sub, the push handler and two Socket.IO replicas',
    async () => {
      const projectId = 'voz-realtime-test';
      const domainTopic = 'ingress-' + randomUUID();
      const adapterTopic = 'adapter-' + randomUUID();
      const pubsub = new PubSub({ projectId });
      const topic = pubsub.topic(domainTopic, { messageOrdering: true });
      await topic.create();
      const [subscription] = await topic.createSubscription('ingress-test-' + randomUUID());
      const app = express();
      app.use(express.json());
      const a = createServer(app);
      const b = createServer();
      const config = {
        corsOrigin: '*',
        path: '/socket.io',
        pubsubAdapter: {
          enabled: true,
          projectId,
          topicName: adapterTopic,
          subscriptionPrefix: 'ingress-test',
        },
      };
      const gatewayA = await WebsocketGatewayService.create(a, config);
      const gatewayB = await WebsocketGatewayService.create(b, config);
      app.use(
        '/pubsub',
        createPubSubRouter({
          realtimeSubscriber: new RealtimeApiSubscriber(gatewayA),
          gateway: gatewayA,
        }),
      );
      await Promise.all([
        new Promise<void>((resolve) => a.listen(0, '127.0.0.1', resolve)),
        new Promise<void>((resolve) => b.listen(0, '127.0.0.1', resolve)),
      ]);
      // The emulator pull client hands the same HTTP envelope to the actual push handler.
      const deliveries: Promise<unknown>[] = [];
      subscription.on('message', (message) => {
        deliveries.push(
          request(a)
            .post('/pubsub/realtime')
            .send({ message: { data: message.data.toString('base64') } })
            .expect(200)
            .then(() => message.ack()),
        );
      });
      const token = jwt.sign(
        { sub: randomUUID(), email: 'admin@example.test', roles: ['SUPER_ADMIN'], type: 'access' },
        env.JWT_SECRET,
      );
      const socket = io('http://127.0.0.1:' + (b.address() as AddressInfo).port + '/admin', {
        transports: ['websocket'],
        reconnection: false,
        auth: { token },
      });
      try {
        await new Promise<void>((resolve, reject) => {
          socket.once('socket.ready', () => resolve());
          socket.once('connect_error', reject);
        });
        const received = new Promise<{ eventId: string; messagePreview: string }>((resolve) =>
          socket.once('admin.notification', resolve),
        );
        const realTransport = new PubSubRealtimeTransport(pubsub, {
          topicName: domainTopic,
          ensureTopic: false,
        });
        const realNotifier = new RealtimeNotifier(realTransport, true, { prisma });
        const realTickets = new TicketService(new TicketRepository(prisma), realNotifier, prisma);
        const committed = await new InboundIngestionService(
          prisma,
          realNotifier,
          realTickets,
        ).ingest(input('antes de IA'), 'full-ingress');
        const notification = await received;
        expect(notification.eventId).toBe(committed.messageId);
        expect(notification.messagePreview).toBe('antes de IA');
        expect(handleBatch).not.toHaveBeenCalled();
      } finally {
        socket.disconnect();
        gatewayA.dispose();
        gatewayB.dispose();
        await Promise.all(deliveries);
        await subscription.close();
        await subscription.delete();
        await topic.delete();
        await pubsub.close();
        await Promise.all([
          new Promise<void>((resolve) => a.close(() => resolve())),
          new Promise<void>((resolve) => b.close(() => resolve())),
        ]);
      }
    },
    30_000,
  );
});
