import { startExclusiveInterval } from '../../utils/exclusive-interval';
import { prismaLogFields } from '../../utils/prisma-errors';
import { createStructuredLogger } from '../../utils/structured-logger';
import { RealtimeApiSubscriber, NotificationProjectorLike } from './realtime-api-subscriber.service';
import { RealtimeMetrics } from './realtime-observability.service';
import { RealtimeOutboxPrismaClient, RealtimeOutboxRelay } from './realtime-outbox-relay.service';
import { PubSubRealtimeTransport } from './pubsub-realtime-transport.service';
import type { WebsocketGatewayService } from './websocket-gateway.service';

const log = createStructuredLogger('RealtimeRuntime');

export type ApiRealtimeSubscriberDeps = {
  realtimeDurableEnabled: boolean;
  wsEnabled: boolean;
  gateway?: WebsocketGatewayService;
  metrics?: RealtimeMetrics;
  projector?: NotificationProjectorLike;
};

/**
 * Factory for the API-side durable-realtime subscriber.
 *
 * Centralizes the startup guard so it can be unit-tested without spinning up
 * the full Express/Socket.IO server. Events arrive via the Pub/Sub push route
 * (`POST /pubsub/realtime`); returns `undefined` when any required flag or
 * dependency is missing.
 */
export function createApiRealtimeSubscriber(
  deps: ApiRealtimeSubscriberDeps,
): RealtimeApiSubscriber | undefined {
  if (!deps.realtimeDurableEnabled || !deps.wsEnabled || !deps.gateway) {
    return undefined;
  }

  return new RealtimeApiSubscriber(deps.gateway, true, deps.metrics, deps.projector);
}

export type WorkerRealtimeRelayDeps = {
  realtimeDurableEnabled: boolean;
  workersEnabled: boolean;
  transport?: PubSubRealtimeTransport;
  prisma: RealtimeOutboxPrismaClient;
  pollIntervalMs: number;
  instanceId?: string;
  metrics?: RealtimeMetrics;
};

export type WorkerRealtimeRelayResult = {
  relay: RealtimeOutboxRelay;
  /**
   * Starts the relay polling interval. The optional `runCycle` override is
   * exposed only to keep tests deterministic and fast.
   */
  start: (runCycle?: () => Promise<void>) => NodeJS.Timeout;
  /** Stops the relay polling interval. */
  stop: (interval: NodeJS.Timeout) => void;
};

/**
 * Factory for the worker-side durable-realtime relay.
 *
 * Encapsulates the flag combination that enables the outbox relay cycle so it
 * can be unit-tested without booting the full worker runtime.
 */
export function createWorkerRealtimeRelay(
  deps: WorkerRealtimeRelayDeps,
): WorkerRealtimeRelayResult | undefined {
  if (!deps.realtimeDurableEnabled || !deps.workersEnabled || !deps.transport) {
    return undefined;
  }

  const relay = new RealtimeOutboxRelay(deps.prisma, deps.transport, {
    instanceId: deps.instanceId,
    metrics: deps.metrics,
  });

  return {
    relay,
    start: (runCycle = () => relay.runCycle()) =>
      startExclusiveInterval(runCycle, deps.pollIntervalMs, (err: unknown) => {
        log('error', 'realtime.relay_cycle_failed', undefined, prismaLogFields(err));
      }),
    stop: (interval) => clearInterval(interval),
  };
}

export type RealtimeStartupFlags = {
  /** Proceso donde arranca el runtime (`api` tiene el gateway; `worker` no). */
  role: 'api' | 'worker';
  wsEnabled: boolean;
  realtimeDurableEnabled: boolean;
  inboxPollingEnabled: boolean;
};

export type RealtimeStartupHazard = {
  code: 'legacy_eventbus_bridge_mute';
  message: string;
};

/**
 * Detecta combinaciones de flags de arranque que dejan el realtime mudo.
 *
 * Regla (API): con WS activo y el durable apagado, el gateway bindea el puente
 * legacy eventBus→socket (server.ts). El orquestador que produce esos eventos
 * vive dentro de `InboxProcessorService`, que solo arranca si
 * `INBOX_POLLING_ENABLED`. Si falta, el puente escucha un bus que nadie emite.
 * El worker no tiene gateway, por lo que la regla no aplica.
 */
export function realtimeStartupHazards(flags: RealtimeStartupFlags): RealtimeStartupHazard[] {
  if (
    flags.role === 'api' &&
    flags.wsEnabled &&
    !flags.realtimeDurableEnabled &&
    !flags.inboxPollingEnabled
  ) {
    return [
      {
        code: 'legacy_eventbus_bridge_mute',
        message:
          'WS_ENABLED=true con REALTIME_DURABLE_ENABLED=false e INBOX_POLLING_ENABLED=false: ' +
          'el puente legacy eventBus→socket queda mudo (el orquestador corre dentro de ' +
          'InboxProcessorService). Activá INBOX_POLLING_ENABLED o REALTIME_DURABLE_ENABLED.',
      },
    ];
  }

  return [];
}