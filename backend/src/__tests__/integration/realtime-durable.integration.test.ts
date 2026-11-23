import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { RealtimeOutboxStatus } from '@prisma/client';
import {
  CriticalEventType,
  RealtimeDurableEvent,
  SocketEventName,
} from '../../services/realtime/realtime-event.contracts';
import { RealtimeNotifier } from '../../services/realtime/realtime-notifier.service';
import { RealtimeOutboxRelay } from '../../services/realtime/realtime-outbox-relay.service';
import { RealtimeApiSubscriber } from '../../services/realtime/realtime-api-subscriber.service';
import { PubSubRealtimeTransport } from '../../services/realtime/pubsub-realtime-transport.service';
import type { PubSubClientLike } from '../../services/realtime/pubsub.util';

function buildDurableEvent(eventId?: string): RealtimeDurableEvent {
  return {
    eventId: eventId ?? '550e8400-e29b-41d4-a716-446655440000',
    correlationId: 'corr-integration',
    schemaVersion: 1,
    eventType: CriticalEventType.MessageCreated,
    socketEventName: SocketEventName.ConversationMessageNew,
    occurredAt: new Date().toISOString(),
    source: 'integration.test',
    conversationId: '550e8400-e29b-41d4-a716-446655440001',
    messagePatch: {
      id: '550e8400-e29b-41d4-a716-446655440002',
      conversationId: '550e8400-e29b-41d4-a716-446655440001',
      body: 'Hello',
      direction: 'inbound',
      createdAt: new Date().toISOString(),
    },
  };
}

describe('Realtime durable integration — outbox → Pub/Sub push → subscriber', () => {
  let publishMessages: Array<Buffer>;
  let pushDelivered: Array<unknown>;
  let gatewayEmitted: Array<{ eventName: string; payload: unknown }>;
  let outboxRows: Array<{
    id: string;
    payload: unknown;
    status: RealtimeOutboxStatus;
    attempts: number;
    nextRetryAt: Date | null;
    lastError: string | null;
  }>;

  function createPubSubClient(): { client: PubSubClientLike; publishMessage: jest.MockedFunction<typeof publishTyped> } {
    function publishTyped(opts: { data: Buffer }): Promise<string> {
      publishMessages.push(opts.data);
      return Promise.resolve('message-1');
    }
    const publishMessage = jest.fn(publishTyped);
    const topicCreate = jest.fn(async () => undefined);
    const topic = jest.fn(() => ({
      publishMessage,
      create: topicCreate,
    })) as unknown as PubSubClientLike['topic'];
    return { client: { topic } as PubSubClientLike, publishMessage };
  }

  function createPrismaClient(): {
    $queryRaw: jest.Mock;
    realtimeOutboxEvent: {
      updateMany: jest.Mock;
      create: jest.Mock;
    };
  } {
    const client = {
      $queryRaw: jest.fn(async () => {
        return outboxRows
          .filter((r) => r.status === RealtimeOutboxStatus.pending)
          .map((r) => ({ id: r.id, payload: r.payload, attempts: r.attempts }));
      }),
      realtimeOutboxEvent: {
        updateMany: jest.fn(
          async (args: { where: { id: { in: string[] } }; data: Record<string, unknown> }) => {
            for (const id of args.where.id.in) {
              const row = outboxRows.find((r) => r.id === id);
              if (row) {
                Object.assign(row, args.data);
              }
            }
            return { count: args.where.id.in.length };
          },
        ) as jest.Mock,
        create: jest.fn(async (args: { data: Record<string, unknown> }) => {
          outboxRows.push({
            id: args.data.id as string,
            payload: args.data.payload,
            status: args.data.status as RealtimeOutboxStatus,
            attempts: args.data.attempts as number,
            nextRetryAt: null,
            lastError: null,
          });
          return args.data;
        }) as jest.Mock,
      },
    };
    return client;
  }

  function createGatewayMock(): {
    emitRealtimeEvent: jest.Mock;
  } {
    return {
      emitRealtimeEvent: jest.fn((event: { socketEventName: string }) => {
        gatewayEmitted.push({ eventName: event.socketEventName, payload: event });
      }),
    } as unknown as { emitRealtimeEvent: jest.Mock };
  }

  function buildSubscriber(gateway: ReturnType<typeof createGatewayMock>) {
    const subscriber = new RealtimeApiSubscriber(
      gateway as unknown as import('../../services/realtime/websocket-gateway.service').WebsocketGatewayService,
      true,
    );
    return subscriber;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    publishMessages = [];
    pushDelivered = [];
    gatewayEmitted = [];
    outboxRows = [];
  });

  it('embedded mode: notifier -> outbox -> relay -> Pub/Sub push -> subscriber -> gateway', async () => {
    const { client } = createPubSubClient();
    const transport = new PubSubRealtimeTransport(client);
    const notifier = new RealtimeNotifier(transport, true);
    const prisma = createPrismaClient();
    const relay = new RealtimeOutboxRelay(
      prisma as unknown as import('../../services/realtime/realtime-outbox-relay.service').RealtimeOutboxPrismaClient,
      transport,
      {
        instanceId: 'integration-test',
      },
    );
    const gateway = createGatewayMock();
    const subscriber = buildSubscriber(gateway);

    // Simulates the push subscription: every published message is decoded
    // (base64 data) and routed to the subscriber, like the pubsub route.
    const pushRoute = async (data: Buffer): Promise<void> => {
      const decoded = JSON.parse(data.toString()) as unknown;
      pushDelivered.push(decoded);
      await subscriber.handleEvent(decoded as never);
    };

    const event = buildDurableEvent();

    // Producer writes to outbox in a transaction
    await notifier.notifyCritical(
      prisma as unknown as Parameters<RealtimeNotifier['notifyCritical']>[0],
      event,
    );

    expect(outboxRows).toHaveLength(1);
    expect(outboxRows[0].status).toBe(RealtimeOutboxStatus.pending);

    // Relay picks up the pending row and publishes it
    await relay.runCycle();

    expect(outboxRows[0].status).toBe(RealtimeOutboxStatus.published);
    expect(publishMessages).toHaveLength(1);

    // Subscriber receives the pushed message and emits through gateway
    await pushRoute(publishMessages[0]);

    expect(pushDelivered).toHaveLength(1);
    expect(gatewayEmitted).toHaveLength(1);
    expect(gatewayEmitted[0].eventName).toBe(SocketEventName.ConversationMessageNew);
  });

  it('deduplicates repeated delivery in the subscriber', async () => {
    const { client } = createPubSubClient();
    const transport = new PubSubRealtimeTransport(client);
    const notifier = new RealtimeNotifier(transport, true);
    const prisma = createPrismaClient();
    const relay = new RealtimeOutboxRelay(
      prisma as unknown as import('../../services/realtime/realtime-outbox-relay.service').RealtimeOutboxPrismaClient,
      transport,
      {
        instanceId: 'integration-test',
      },
    );
    const gateway = createGatewayMock();
    const subscriber = buildSubscriber(gateway);

    const event = buildDurableEvent();
    await notifier.notifyCritical(
      prisma as unknown as Parameters<RealtimeNotifier['notifyCritical']>[0],
      event,
    );
    await relay.runCycle();

    const parsed = JSON.parse(publishMessages[0].toString()) as unknown;
    await subscriber.handleEvent(parsed as never);
    await subscriber.handleEvent(parsed as never);

    expect(gatewayEmitted).toHaveLength(1);
  });

  it('rollback: a failed transaction removes the outbox row', async () => {
    const { client } = createPubSubClient();
    const transport = new PubSubRealtimeTransport(client);
    const notifier = new RealtimeNotifier(transport, true);
    const prisma = createPrismaClient();

    prisma.realtimeOutboxEvent.create.mockImplementation(async () => {
      throw new Error('DB deadlock');
    });

    const event = buildDurableEvent();

    await expect(
      notifier.notifyCritical(
        prisma as unknown as Parameters<RealtimeNotifier['notifyCritical']>[0],
        event,
      ),
    ).rejects.toThrow('DB deadlock');

    expect(outboxRows).toHaveLength(0);
  });
});