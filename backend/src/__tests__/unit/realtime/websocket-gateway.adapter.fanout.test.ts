import { createServer, type Server as HttpServer } from 'http';
import type { AddressInfo } from 'net';
import { PubSub } from '@google-cloud/pubsub';
import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { io as createClient, type Socket as ClientSocket } from 'socket.io-client';

// Igual que websocket-gateway.service.test.ts: el namespace /admin valida el
// token con verifyAccessToken; para el INT basta un token fake.
jest.mock('../../../utils/token.util', () => ({
  verifyAccessToken: jest.fn(() => ({
    sub: '550e8400-e29b-41d4-a716-446655440010',
    email: 'admin@example.test',
    roles: ['admin'],
    type: 'access',
  })),
}));

import { WebsocketGatewayService } from '../../../services/realtime/websocket-gateway.service';
import {
  CriticalEventType,
  RealtimeDurableEvent,
  SocketEventName,
} from '../../../services/realtime/realtime-event.contracts';

/**
 * Integración real del fan-out multi-instancia de `@socket.io/gcp-pubsub-adapter`.
 *
 * Protege el upgrade de `@google-cloud/pubsub` v4→v6: el wiring real es
 * `WebsocketGatewayService.create` → `buildSocketIoAdapter` → `createAdapter`
 * (websocket-gateway.service.ts:488, cast `as never` de tipos v4). Dos procesos
 * Socket.IO comparten el mismo topic del emulador de Pub/Sub; un emit hecho por
 * la instancia A debe llegar al socket conectado en la instancia B.
 *
 * Gate: `PUBSUB_EMULATOR_HOST` (localhost:8680, ya activo por defecto con
 * `docker compose -f docker-compose.dev.yml up`). Sin el emulador el
 * suite hace skip — jamás toca GCP real.
 */
jest.setTimeout(30_000);

const describeIfEmulator = process.env.PUBSUB_EMULATOR_HOST ? describe : describe.skip;

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT ?? 'voz-ciudadana-emulator-test';
const runId = Date.now();
const TOPIC_NAME = `socketio-adapter-fanout-${runId}`;
const SUBSCRIPTION_PREFIX = `socket.io.fanout.${runId}`;
const CONVERSATION_ID = '550e8400-e29b-41d4-a716-446655440001';
const SOCKET_PATH = '/socket.io';
const TOKEN = 'integration-test-token';

function buildDurableEvent(
  socketEventName: SocketEventName,
  conversationId: string,
): RealtimeDurableEvent {
  return {
    eventId: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
    correlationId: 'corr-fanout-int',
    schemaVersion: 1,
    eventType: CriticalEventType.MessageCreated,
    socketEventName,
    occurredAt: new Date().toISOString(),
    source: 'integration.test',
    conversationId,
  };
}

function onceStrict<T>(socket: ClientSocket, event: string, timeoutMs = 15_000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for socket event "${event}"`));
    }, timeoutMs);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

async function connectAdmin(port: number): Promise<ClientSocket> {
  const socket = createClient(`http://127.0.0.1:${port}/admin`, {
    path: SOCKET_PATH,
    transports: ['websocket'],
    reconnection: false,
    timeout: 10_000,
    auth: { token: TOKEN },
  });
  try {
    await onceStrict(socket, 'socket.ready');
  } catch (error) {
    socket.disconnect();
    throw error;
  }
  return socket;
}

describeIfEmulator(
  'Socket.IO GCP Pub/Sub adapter fan-out (integration against emulator)',
  () => {
    let serverA: HttpServer;
    let serverB: HttpServer;
    let gatewayA: WebsocketGatewayService;
    let gatewayB: WebsocketGatewayService;
    let clientA: ClientSocket;
    let clientB: ClientSocket;

    const gatewayConfig = {
      corsOrigin: '*',
      path: SOCKET_PATH,
      pubsubAdapter: {
        enabled: true as const,
        projectId: PROJECT_ID,
        topicName: TOPIC_NAME,
        subscriptionPrefix: SUBSCRIPTION_PREFIX,
      },
    };

    beforeAll(async () => {
      serverA = createServer();
      serverB = createServer();

      await new Promise<void>((resolve) => serverA.listen(0, '127.0.0.1', resolve));
      await new Promise<void>((resolve) => serverB.listen(0, '127.0.0.1', resolve));

      gatewayA = await WebsocketGatewayService.create(serverA, gatewayConfig);
      gatewayB = await WebsocketGatewayService.create(serverB, gatewayConfig);

      clientA = await connectAdmin((serverA.address() as AddressInfo).port);
      clientB = await connectAdmin((serverB.address() as AddressInfo).port);

      clientA.emit('conversation.subscribe', CONVERSATION_ID);
      clientB.emit('conversation.subscribe', CONVERSATION_ID);
      await new Promise<void>((resolve) => setTimeout(resolve, 250));
    }, 30_000);

    afterAll(async () => {
      clientA?.disconnect();
      clientB?.disconnect();
      gatewayA?.dispose();
      gatewayB?.dispose();

      await Promise.all([
        new Promise<void>((resolve) => serverA?.close(() => resolve())),
        new Promise<void>((resolve) => serverB?.close(() => resolve())),
      ]);
      serverA?.closeAllConnections?.();
      serverB?.closeAllConnections?.();

      try {
        const topic = new PubSub({ projectId: PROJECT_ID }).topic(TOPIC_NAME);
        await topic.delete();
      } catch {
        // Best-effort cleanup sobre el emulador; topics huérfanos solo en dev.
      }
    }, 30_000);

    it('delivers a room emit from instance A to a socket subscribed on instance B', async () => {
      const event = buildDurableEvent(SocketEventName.ConversationMessageNew, CONVERSATION_ID);

      const onA = onceStrict<RealtimeDurableEvent>(clientA, SocketEventName.ConversationMessageNew);
      const onB = onceStrict<RealtimeDurableEvent>(clientB, SocketEventName.ConversationMessageNew);

      gatewayA.emitRealtimeEvent(event);

      const [fromA, fromB] = await Promise.all([onA, onB]);
      expect(fromA.eventId).toBe(event.eventId);
      expect(fromB.eventId).toBe(event.eventId);
    });

    it('delivers a namespace broadcast from instance A to a socket on instance B', async () => {
      const event = buildDurableEvent(SocketEventName.ConversationUpdated, CONVERSATION_ID);

      const onB = onceStrict<RealtimeDurableEvent>(clientB, SocketEventName.ConversationUpdated);

      gatewayA.emitRealtimeEvent(event);

      const fromB = await onB;
      expect(fromB.eventId).toBe(event.eventId);
    });
  },
);