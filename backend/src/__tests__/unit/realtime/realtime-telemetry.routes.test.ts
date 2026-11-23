/**
 * Tests del endpoint de telemetría del frontend (fe.received / fe.applied).
 */
import express from 'express';
import request from 'supertest';
import { createRealtimeTelemetryRouter } from '../../../routes/realtime-telemetry.routes';

jest.mock('../../../middlewares/jwt.middleware', () => ({
  jwtMiddleware: (req: { user?: object }, _res: unknown, next: () => void) => {
    req.user = { id: 'user-1', email: 'agent@voz.gob.ar', fullName: 'Agent', roles: ['admin'] };
    next();
  },
}));

const makeMetrics = () => ({
  incrementCounter: jest.fn(),
  setGauge: jest.fn(),
  observeHistogram: jest.fn(),
});

function makeApp(metrics: ReturnType<typeof makeMetrics> = makeMetrics()): {
  app: express.Express;
  metrics: ReturnType<typeof makeMetrics>;
} {
  const app = express();
  app.use(express.json());
  app.use('/realtime', createRealtimeTelemetryRouter({ metrics }));
  return { app, metrics };
}

const VALID_EVENT = {
  eventType: 'ticket.closed',
  status: 'received',
  conversationId: '22222222-2222-4222-8222-222222222222',
  eventId: '11111111-1111-4111-8111-111111111111',
  socketEventName: 'conversation.updated',
};

describe('POST /realtime/telemetry', () => {
  it('acepta un evento de ciclo de vida y registra fe_realtime_event', async () => {
    const { app, metrics } = makeApp();

    const res = await request(app).post('/realtime/telemetry').send(VALID_EVENT);

    expect(res.status).toBe(204);
    expect(metrics.incrementCounter).toHaveBeenCalledWith('fe_realtime_event', {
      eventType: 'ticket.closed',
      status: 'received',
      socketEventName: 'conversation.updated',
    });
  });

  it('admite status applied sin socketEventName', async () => {
    const { app, metrics } = makeApp();

    const res = await request(app).post('/realtime/telemetry').send({
      eventType: 'ticket.closed',
      status: 'applied',
      conversationId: VALID_EVENT.conversationId,
      eventId: VALID_EVENT.eventId,
    });

    expect(res.status).toBe(204);
    expect(metrics.incrementCounter).toHaveBeenCalledWith('fe_realtime_event', {
      eventType: 'ticket.closed',
      status: 'applied',
    });
  });

  it('rechaza eventType no soportado', async () => {
    const { app } = makeApp();

    const res = await request(app)
      .post('/realtime/telemetry')
      .send({
        ...VALID_EVENT,
        eventType: 'unknown.event',
      });

    expect(res.status).toBe(400);
  });

  it('rechaza status no soportado', async () => {
    const { app } = makeApp();

    const res = await request(app)
      .post('/realtime/telemetry')
      .send({
        ...VALID_EVENT,
        status: 'clicked',
      });

    expect(res.status).toBe(400);
  });

  it('rechaza payloads demasiado grandes', async () => {
    const { app } = makeApp();

    const res = await request(app)
      .post('/realtime/telemetry')
      .send({ ...VALID_EVENT, pad: 'x'.repeat(4096) });

    expect(res.status).toBe(413);
  });
});
