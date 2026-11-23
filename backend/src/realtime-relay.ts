import express from 'express';
import { env } from './config/env.config';
import { PrismaService } from './services/prisma.service';
import { RealtimeOutboxRelay } from './services/realtime/realtime-outbox-relay.service';
import { PubSubRealtimeTransport } from './services/realtime/pubsub-realtime-transport.service';
import { createRealtimeMetrics } from './services/realtime/realtime-observability.service';
import { createStructuredLogger } from './utils/structured-logger';

/** Dedicated recovery runtime: deploy with min instances >=1 and CPU always allocated. */
async function start(): Promise<void> {
  const prisma = new PrismaService();
  await prisma.connect();
  const transport = new PubSubRealtimeTransport();
  const relay = new RealtimeOutboxRelay(prisma, transport, {
    metrics: createRealtimeMetrics('worker'),
  });
  const log = createStructuredLogger('RealtimeRecovery');
  let inFlight: Promise<void> | undefined;
  let stopping = false;
  const tick = () => {
    if (stopping || inFlight) return;
    inFlight = relay
      .runCycle()
      .catch((error: unknown) =>
        log('error', 'relay.cycle_failed', undefined, { error: String(error) }),
      )
      .finally(() => {
        inFlight = undefined;
      });
  };
  const timer = setInterval(tick, env.REALTIME_RELAY_INTERVAL_MS);
  tick();
  const app = express();
  app.get('/ready', (_req, res) => res.json({ status: 'ok', role: 'realtime-relay' }));
  const server = app.listen(env.PORT);
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    clearInterval(timer);
    const deadline = setTimeout(() => process.exit(1), env.SHUTDOWN_TIMEOUT_MS);
    server.close(() => {
      void Promise.resolve(inFlight)
        .then(() => transport.dispose())
        .then(() => prisma.disconnect())
        .then(() => {
          clearTimeout(deadline);
          process.exit(0);
        });
    });
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

void start().catch((error: unknown) => {
  console.error('[RealtimeRecovery] startup failed', error);
  process.exit(1);
});
