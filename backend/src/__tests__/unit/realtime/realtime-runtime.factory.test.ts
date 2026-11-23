import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { RealtimeApiSubscriber } from '../../../services/realtime/realtime-api-subscriber.service';
import { RealtimeOutboxRelay } from '../../../services/realtime/realtime-outbox-relay.service';
import { PubSubRealtimeTransport } from '../../../services/realtime/pubsub-realtime-transport.service';
import {
  createApiRealtimeSubscriber,
  createWorkerRealtimeRelay,
  realtimeStartupHazards,
} from '../../../services/realtime/realtime-runtime.factory';
import type { WebsocketGatewayService } from '../../../services/realtime/websocket-gateway.service';

describe('Realtime runtime factories — startup flag behavior', () => {
  const publishMock = jest.fn();
  const disposeMock = jest.fn();
  const gatewayMock = {
    emitRealtimeEvent: jest.fn(),
  } as unknown as WebsocketGatewayService;

  function createTransport(): PubSubRealtimeTransport {
    return {
      publish: publishMock,
      dispose: disposeMock,
    } as unknown as PubSubRealtimeTransport;
  }

  const prismaMock: any = {
    $queryRaw: jest.fn(),
    realtimeOutboxEvent: {
      updateMany: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.useFakeTimers();
    publishMock.mockReset();
    disposeMock.mockReset();
    gatewayMock.emitRealtimeEvent = jest.fn();
    prismaMock.$queryRaw.mockReset();
    prismaMock.realtimeOutboxEvent.updateMany.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('createApiRealtimeSubscriber', () => {
    it('creates a subscriber when durable and WS are enabled and the gateway is present', () => {
      const subscriber = createApiRealtimeSubscriber({
        realtimeDurableEnabled: true,
        wsEnabled: true,
        gateway: gatewayMock,
      });

      expect(subscriber).toBeInstanceOf(RealtimeApiSubscriber);
    });

    it.each([
      { realtimeDurableEnabled: false, wsEnabled: true, gateway: gatewayMock, reason: 'durable disabled' },
      { realtimeDurableEnabled: true, wsEnabled: false, gateway: gatewayMock, reason: 'WS disabled' },
      { realtimeDurableEnabled: true, wsEnabled: true, gateway: undefined, reason: 'missing gateway' },
    ])('returns undefined when $reason', ({ realtimeDurableEnabled, wsEnabled, gateway, reason }) => {
      const subscriber = createApiRealtimeSubscriber({
        realtimeDurableEnabled,
        wsEnabled,
        gateway,
      });

      expect(subscriber).toBeUndefined();
    });
  });

  describe('createWorkerRealtimeRelay', () => {
    it('creates a relay and start/stop helpers when durable and workers are enabled', () => {
      const factory = createWorkerRealtimeRelay({
        realtimeDurableEnabled: true,
        workersEnabled: true,
        transport: createTransport(),
        prisma: prismaMock,
        pollIntervalMs: 250,
      });

      expect(factory).toBeDefined();
      expect(factory!.relay).toBeInstanceOf(RealtimeOutboxRelay);

      const interval = factory!.start();
      expect(interval).toBeDefined();

      factory!.stop(interval);
      expect(() => jest.advanceTimersByTime(250)).not.toThrow();
    });

    it('starts a polling interval that triggers the relay cycle', async () => {
      const runCycle = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const factory = createWorkerRealtimeRelay({
        realtimeDurableEnabled: true,
        workersEnabled: true,
        transport: createTransport(),
        prisma: prismaMock,
        pollIntervalMs: 100,
      });

      const interval = factory!.start(runCycle);
      jest.advanceTimersByTime(100);

      expect(runCycle).toHaveBeenCalledTimes(1);

      factory!.stop(interval);
    });

    it('does not stack relay cycles while one is still running', async () => {
      let release!: () => void;
      const runCycle = jest.fn<() => Promise<void>>().mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            release = resolve;
          }),
      );
      const factory = createWorkerRealtimeRelay({
        realtimeDurableEnabled: true,
        workersEnabled: true,
        transport: createTransport(),
        prisma: prismaMock,
        pollIntervalMs: 100,
      });

      const interval = factory!.start(runCycle);
      jest.advanceTimersByTime(100);
      jest.advanceTimersByTime(200);
      expect(runCycle).toHaveBeenCalledTimes(1);

      release();
      await jest.advanceTimersByTimeAsync(100);
      expect(runCycle).toHaveBeenCalledTimes(2);

      factory!.stop(interval);
    });

    it.each([
      { realtimeDurableEnabled: false, workersEnabled: true, reason: 'durable disabled' },
      { realtimeDurableEnabled: true, workersEnabled: false, reason: 'workers disabled' },
      { realtimeDurableEnabled: true, workersEnabled: true, reason: 'missing transport' },
    ])('returns undefined when $reason', ({ realtimeDurableEnabled, workersEnabled, reason }) => {
      const factory = createWorkerRealtimeRelay({
        realtimeDurableEnabled,
        workersEnabled,
        transport: reason === 'missing transport' ? undefined : createTransport(),
        prisma: prismaMock,
        pollIntervalMs: 100,
      });

      expect(factory).toBeUndefined();
    });
  });

  describe('realtimeStartupHazards', () => {
    it('flags the legacy mute combo on the API: WS on, durable off, inbox polling off', () => {
      const hazards = realtimeStartupHazards({
        role: 'api',
        wsEnabled: true,
        realtimeDurableEnabled: false,
        inboxPollingEnabled: false,
      });

      expect(hazards).toHaveLength(1);
      expect(hazards[0].code).toBe('legacy_eventbus_bridge_mute');
      expect(hazards[0].message).toContain('INBOX_POLLING_ENABLED');
    });

    it.each([
      { wsEnabled: true, realtimeDurableEnabled: false, inboxPollingEnabled: true },
      { wsEnabled: true, realtimeDurableEnabled: true, inboxPollingEnabled: false },
      { wsEnabled: true, realtimeDurableEnabled: true, inboxPollingEnabled: true },
      { wsEnabled: false, realtimeDurableEnabled: false, inboxPollingEnabled: false },
      { wsEnabled: false, realtimeDurableEnabled: false, inboxPollingEnabled: true },
      { wsEnabled: false, realtimeDurableEnabled: true, inboxPollingEnabled: false },
      { wsEnabled: false, realtimeDurableEnabled: true, inboxPollingEnabled: true },
    ])(
      'does not flag %j on the API',
      ({ wsEnabled, realtimeDurableEnabled, inboxPollingEnabled }) => {
        const hazards = realtimeStartupHazards({
          role: 'api',
          wsEnabled,
          realtimeDurableEnabled,
          inboxPollingEnabled,
        });

        expect(hazards).toEqual([]);
      },
    );

    it('never flags the rule on the worker (it has no gateway to mute)', () => {
      const hazards = realtimeStartupHazards({
        role: 'worker',
        wsEnabled: true,
        realtimeDurableEnabled: false,
        inboxPollingEnabled: false,
      });

      expect(hazards).toEqual([]);
    });
  });
});
