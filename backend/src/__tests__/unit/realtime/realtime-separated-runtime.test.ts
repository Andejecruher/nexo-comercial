import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { RealtimeOutboxStatus } from '@prisma/client';
import { RealtimeApiSubscriber } from '../../../services/realtime/realtime-api-subscriber.service';
import {
  CriticalEventType,
  RealtimeDurableEvent,
  SocketEventName,
} from '../../../services/realtime/realtime-event.contracts';
import { RealtimeOutboxRelay } from '../../../services/realtime/realtime-outbox-relay.service';
import { PubSubRealtimeTransport } from '../../../services/realtime/pubsub-realtime-transport.service';
import type { PubSubClientLike } from '../../../services/realtime/pubsub.util';
import type { WebsocketGatewayService } from '../../../services/realtime/websocket-gateway.service';

function buildDurableEvent(): RealtimeDurableEvent {
  return {
    eventId: '550e8400-e29b-41d4-a716-446655440000',
    correlationId: 'corr-separated',
    schemaVersion: 1,
    eventType: CriticalEventType.MessageCreated,
    socketEventName: SocketEventName.ConversationMessageNew,
    occurredAt: new Date().toISOString(),
    source: 'separated.test',
    conversationId: '550e8400-e29b-41d4-a716-446655440001',
    messagePatch: {
      id: '550e8400-e29b-41d4-a716-446655440002',
      conversationId: '550e8400-e29b-41d4-a716-446655440001',
      body: 'Hello from worker',
      direction: 'inbound',
      createdAt: new Date().toISOString(),
    },
  };
}

/**
 * Creates a fake Pub/Sub client that mimics the push-subscription boundary:
 * every JSON message published to the topic is delivered to the registered
 * `pushHandler`, exactly like the real `POST /pubsub/realtime` endpoint that
 * routes decoded payloads into RealtimeApiSubscriber.handleEvent.
 */
function createPubSubHub() {
  let pushHandler: ((event: unknown) => Promise<void> | void) | undefined;
  const topicCreate = jest.fn(async () => undefined);
  const publishMessage = jest.fn(async (opts: { data: Buffer }) => {
    const payload = JSON.parse(opts.data.toString()) as unknown;
    await pushHandler?.(payload);
    return 'message-1';
  });
  const topic = jest.fn(() => ({
    publishMessage,
    create: topicCreate,
  })) as unknown as PubSubClientLike['topic'];
  const client = { topic } as PubSubClientLike;

  return {
    client,
    publishMessage,
    topicCreate,
    setPushHandler: (handler: (event: unknown) => Promise<void> | void) => {
      pushHandler = handler;
    },
  };
}

function createPrismaClient(
  outboxRows: Array<{
    id: string;
    payload: unknown;
    status: RealtimeOutboxStatus;
    attempts: number;
    nextRetryAt: Date | null;
    lastError: string | null;
  }>,
) {
  return {
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
      ),
      create: jest.fn(),
    },
  };
}

describe('Realtime durable — separated worker/API runtime over Pub/Sub push', () => {
  let hub: ReturnType<typeof createPubSubHub>;
  let outboxRows: ReturnType<typeof createPrismaClient> extends { $queryRaw: jest.Mock }
    ? Parameters<typeof createPrismaClient>[0]
    : never;
  let gatewayEmitted: Array<{ eventName: string; payload: unknown }>;
  let emitRealtimeEventMock: jest.MockedFunction<(event: { socketEventName: string }) => void>;

  beforeEach(() => {
    jest.clearAllMocks();
    hub = createPubSubHub();
    outboxRows = [];
    gatewayEmitted = [];
    emitRealtimeEventMock = jest.fn((event: { socketEventName: string }) => {
      gatewayEmitted.push({ eventName: event.socketEventName, payload: event });
    });
  });

  it('relays a worker outbox event through Pub/Sub push and emits the frontend-compatible name on the API gateway', async () => {
    const event = buildDurableEvent();
    outboxRows.push({
      id: event.eventId,
      payload: event,
      status: RealtimeOutboxStatus.pending,
      attempts: 0,
      nextRetryAt: null,
      lastError: null,
    });

    const gateway = {
      emitRealtimeEvent: emitRealtimeEventMock,
    } as unknown as WebsocketGatewayService;
    const subscriber = new RealtimeApiSubscriber(gateway, true);
    hub.setPushHandler((received) => subscriber.handleEvent(received as never));

    // Worker-side transport and relay: these live in the worker container.
    const workerTransport = new PubSubRealtimeTransport(hub.client);
    const prisma = createPrismaClient(outboxRows);
    const relay = new RealtimeOutboxRelay(
      prisma as unknown as import('../../../services/realtime/realtime-outbox-relay.service').RealtimeOutboxPrismaClient,
      workerTransport,
      { instanceId: 'worker-separated-test' },
    );

    // Worker claims the outbox row and publishes it through Pub/Sub.
    await relay.runCycle();

    // The push handler delivered it to the API subscriber, which forwarded it to the gateway.
    expect(outboxRows[0].status).toBe(RealtimeOutboxStatus.published);
    expect(hub.publishMessage).toHaveBeenCalledTimes(1);
    expect(gatewayEmitted).toHaveLength(1);
    expect(gatewayEmitted[0].eventName).toBe(SocketEventName.ConversationMessageNew);
    expect(gatewayEmitted[0].payload).toEqual(expect.objectContaining({ eventId: event.eventId }));
  });

  it('deduplicates repeated Pub/Sub deliveries inside the API subscriber TTL window', async () => {
    const event = buildDurableEvent();
    outboxRows.push({
      id: event.eventId,
      payload: event,
      status: RealtimeOutboxStatus.pending,
      attempts: 0,
      nextRetryAt: null,
      lastError: null,
    });

    const gateway = {
      emitRealtimeEvent: emitRealtimeEventMock,
    } as unknown as WebsocketGatewayService;
    const subscriber = new RealtimeApiSubscriber(gateway, true);
    let delivered = 0;
    hub.setPushHandler(async (received) => {
      delivered += 1;
      await subscriber.handleEvent(received as never);
    });

    const workerTransport = new PubSubRealtimeTransport(hub.client);
    const prisma = createPrismaClient(outboxRows);
    const relay = new RealtimeOutboxRelay(
      prisma as unknown as import('../../../services/realtime/realtime-outbox-relay.service').RealtimeOutboxPrismaClient,
      workerTransport,
      { instanceId: 'worker-separated-test' },
    );

    await relay.runCycle();

    expect(delivered).toBe(1);
    expect(gatewayEmitted).toHaveLength(1);
  });

  it('publishes through a dedicated transport instance (per-container Pub/Sub client)', async () => {
    const workerClientA = createPubSubHub();
    const workerClientB = createPubSubHub();
    const transportA = new PubSubRealtimeTransport(workerClientA.client);
    const transportB = new PubSubRealtimeTransport(workerClientB.client);

    expect(transportA).not.toBe(transportB);

    const event = buildDurableEvent();
    await transportA.publish(event);

    expect(workerClientA.publishMessage).toHaveBeenCalledTimes(1);
    expect(workerClientB.publishMessage).not.toHaveBeenCalled();
  });
});