/**
 * Entry point de la aplicación Express — Voz Ciudadana API.
 *
 * Responsabilidades:
 * - Cargar variables de entorno (dotenv)
 * - Instanciar servicios de infraestructura (Prisma)
 * - Montar middlewares globales (JSON con rawBody, cors, helmet, swagger)
 * - Registrar rutas (webhook, healthcheck)
 * - Escuchar en el puerto configurado
 * - Manejar señales del proceso (SIGTERM, SIGINT) para shutdown limpio
 *
 * Supuestos:
 * - cors y helmet se agregan como dependencias en package.json
 * - jsonwebtoken se agrega para el jwt.middleware
 * - Los imports del backend usan rutas relativas para evitar dependencia de baseUrl/paths
 */
import cors from 'cors';
import express, { Request, Response } from 'express';
import helmet from 'helmet';
import { createServer } from 'http';
import type { Socket } from 'net';
import swaggerUi from 'swagger-ui-express';

import { env } from './config/env.config';
import { createSwaggerSpec } from './config/swagger.config';
import { errorHandler } from './middlewares/errorHandler';
import { createPubSubPushAuthMiddleware } from './middlewares/pubsub-push-auth.middleware';

// Servicios de infraestructura
import { PrismaService } from './services/prisma.service';
import { PubSubRealtimeTransport } from './services/realtime/pubsub-realtime-transport.service';
import { createPubSubClient } from './services/realtime/pubsub.util';
import { createRealtimeMetrics, logRealtimeBoundary } from './services/realtime/realtime-observability.service';
import {
  createApiRealtimeSubscriber,
  realtimeStartupHazards,
} from './services/realtime/realtime-runtime.factory';
import { NotificationProjector } from './services/notifications/notification-projector.service';
import { canSubscribeToConversation } from './services/realtime/socket-subscribe-auth';
import { WebsocketGatewayService } from './services/realtime/websocket-gateway.service';
import { reconcilePendingBackgroundTasks } from './services/tasks/background-task-reconciler.service';

// Rutas
import { logLlmSdkReadiness } from './ai/health/llm-sdk.readiness';
import { registerRoutes } from './routes';
import { createPubSubRouter } from './routes/pubsub.routes';

// ── Instancias de infraestructura ────────────────────────────────────────────
const prisma = new PrismaService();
const port = env.PORT;

// ── Aplicación Express ────────────────────────────────────────────────────────
const app = express();

/**
 * helmet: establece headers de seguridad HTTP seguros por defecto.
 * Protege contra clickjacking, sniffing, XSS y otros ataques comunes.
 *
 * NOTA: Swagger UI (swagger-ui-express 5.x) requiere scripts/estilos inline y
 * carga assets desde CDN (unpkg.com). La CSP por defecto de helmet 7 los bloquea.
 * Se deshabilita contentSecurityPolicy únicamente para las rutas de docs.
 * El resto de la app mantiene la CSP estricta de helmet.
 */
app.use(
  /^\/(api-docs|docs)(\/|$)/,
  helmet({
    contentSecurityPolicy: false,
  }),
);
app.use(/^(?!\/(api-docs|docs))/, helmet());

/**
 * cors: permite peticiones cross-origin.
 * En producción, restringir origin al dominio del frontend.
 * Supuesto: En desarrollo se permite todo; en prod configurar via CORS_ORIGIN env.
 */
app.use(
  cors({
    origin: env.CORS_ORIGIN,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Hub-Signature-256',
      'X-Device-Id',
      'Idempotency-Key',
    ],
  }),
);

/**
 * express.json con opción `verify` para capturar el rawBody.
 * Meta firma los payloads del webhook con HMAC-SHA256 sobre el body crudo —
 * necesitamos el Buffer original ANTES del parsing para validar la firma.
 * El rawBody se inyecta en req para uso del metaSignature.middleware.ts
 */
// Larger JSON only for bounded CSV campaign imports.
app.use('/api/v1/campaigns', express.json({ limit: '8mb' }));
app.use(
  express.json({
    verify: (req: Request & { rawBody?: Buffer }, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

// ── Swagger / OpenAPI ─────────────────────────────────────────────────────────
// La spec es un objeto OpenAPIV3.Document; swagger-ui-express acepta JsonObject.
const swaggerSpec = createSwaggerSpec({
  port,
  base_url: env.BASE_URL,
}) as unknown as swaggerUi.JsonObject;

const swaggerUiOptions: swaggerUi.SwaggerUiOptions = {
  // Habilitar "Try it out" por defecto en todos los endpoints
  swaggerOptions: {
    tryItOutEnabled: true,
    persistAuthorization: true,
    displayRequestDuration: true,
    filter: true,
    docExpansion: 'list',
  },
  // Customizar el título de la UI
  customSiteTitle: 'Voz Ciudadana API — Docs',
};

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, swaggerUiOptions));
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, swaggerUiOptions)); // alias de compatibilidad
app.get('/api-docs.json', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// ── Rutas ─────────────────────────────────────────────────────────────────────
const pubsubClient = createPubSubClient({
  projectId: env.GCP_PROJECT_ID || undefined,
});
const realtimeTransport = env.REALTIME_DURABLE_ENABLED
  ? new PubSubRealtimeTransport(pubsubClient)
  : undefined;
const routeRuntime = registerRoutes(app, { prisma, realtimeTransport });

// ── Manejo global de errores ──────────────────────────────────────────────────
// errorHandler normaliza AppError, ValidationError y errores genéricos al
// formato { success: false, error, code? } definido en utils/api-response.ts
app.use(errorHandler);

// ── Arranque ──────────────────────────────────────────────────────────────────
async function start(): Promise<void> {
  await prisma.connect();

  const reconciliation = await reconcilePendingBackgroundTasks(prisma, routeRuntime.taskDispatcher);
  if (reconciliation.attempted) {
    console.log('[CloudTasks] Startup reconciliation', reconciliation);
  }

  await logLlmSdkReadiness();

  const httpServer = createServer(app);
  const sockets = new Set<Socket>();

  httpServer.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => {
      sockets.delete(socket);
    });
  });

  const websocketGateway = env.WS_ENABLED
    ? await WebsocketGatewayService.create(httpServer, {
        corsOrigin: env.WS_CORS_ORIGIN || env.CORS_ORIGIN,
        path: env.WS_PATH,
        legacyCriticalEventBusBridgeEnabled: !env.REALTIME_DURABLE_ENABLED,
        authorizeSubscribe: (user: { userId: string }, conversationId: string) =>
          canSubscribeToConversation(prisma, user.userId, conversationId),
        metrics: createRealtimeMetrics('api'),
        pubsubAdapter: {
          enabled: env.SOCKETIO_PUBSUB_ADAPTER_ENABLED,
          projectId: env.GCP_PROJECT_ID || env.GOOGLE_CLOUD_PROJECT_ID,
          topicName: env.SOCKETIO_PUBSUB_TOPIC,
          subscriptionPrefix: env.SOCKETIO_PUBSUB_SUBSCRIPTION_PREFIX,
        },
      })
    : undefined;

  const realtimeSubscriber = createApiRealtimeSubscriber({
    realtimeDurableEnabled: env.REALTIME_DURABLE_ENABLED,
    wsEnabled: env.WS_ENABLED,
    gateway: websocketGateway,
    metrics: createRealtimeMetrics('api'),
    projector: new NotificationProjector(prisma),
  });

  // Pub/Sub push subscriptions deliver realtime and AI-stream events to one
  // API instance; `@socket.io/gcp-pubsub-adapter` then fans Socket.IO emits
  // to sockets connected on every Cloud Run replica.
  app.use(
    '/pubsub',
    createPubSubPushAuthMiddleware(),
    createPubSubRouter({
      realtimeSubscriber,
      gateway: websocketGateway,
    }),
  );

  await realtimeSubscriber?.start();

  for (const hazard of realtimeStartupHazards({
    role: 'api',
    wsEnabled: env.WS_ENABLED,
    realtimeDurableEnabled: env.REALTIME_DURABLE_ENABLED,
    inboxPollingEnabled: env.INBOX_POLLING_ENABLED,
  })) {
    logRealtimeBoundary('warn', 'RealtimeRuntime', 'startup.hazard', {
      code: hazard.code,
      message: hazard.message,
    });
  }

  if (env.REALTIME_DURABLE_ENABLED) {
    console.log('[Realtime] Durable realtime path activo');
  }

  httpServer.listen(port, () => {
    console.log(`🚀 Voz Ciudadana API corriendo en ${env.BASE_URL}:${port}`);
    console.log(`📚 Documentación en ${env.BASE_URL}:${port}/api-docs`);
    console.log(`📄 OpenAPI JSON en ${env.BASE_URL}:${port}/api-docs.json`);
    if (env.WS_ENABLED) {
      console.log(`🔌 WebSocket admin habilitado en ${env.WS_PATH} (namespace /admin)`);
    }
    if (env.NODE_ENV === 'test') {
      console.log('Mode test enabled');
      console.log(JSON.stringify(env, null, 2));
    }
  });

  // Shutdown limpio al recibir señales del sistema operativo.
  // En desarrollo, ts-node-dev envía SIGTERM al proceso hijo para hot reload;
  // por eso el cierre debe ser idempotente, observable y tener timeout.
  let isShuttingDown = false;
  const shutdown = (signal: NodeJS.Signals): void => {
    if (isShuttingDown) {
      console.warn(`[Shutdown] Señal ${signal} ignorada; cierre ya en progreso.`);
      return;
    }
    isShuttingDown = true;

    console.log(`\n[Shutdown] Señal ${signal} recibida. Cerrando servidor...`);

    const forceExit = setTimeout(() => {
      console.error('[Shutdown] Timeout esperando cierre; destruyendo conexiones activas.');
      for (const socket of sockets) {
        socket.destroy();
      }
      process.exit(1);
    }, env.SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();

    Promise.resolve()
      .then(() => {
        console.log('[Shutdown] Cerrando WebSocket gateway...');
        websocketGateway?.dispose();
      })
      .then(
        () =>
          new Promise<void>((resolve, reject) => {
            console.log('[Shutdown] Cerrando servidor HTTP...');
            httpServer.close((error) => {
              if (error) reject(error);
              else resolve();
            });
          }),
      )
      .then(() => realtimeSubscriber?.dispose())
      .then(() => prisma.disconnect())
      .then(() => {
        clearTimeout(forceExit);
        console.log('[Shutdown] Servidor cerrado limpiamente.');
        process.exit(0);
      })
      .catch((err: unknown) => {
        clearTimeout(forceExit);
        console.error('[Shutdown] Error durante el cierre:', err);
        process.exit(1);
      });
  };

  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
}

// Global process error handlers — must be registered before start() so that
// any async initialization failures are also captured and logged before exit.
process.on('unhandledRejection', (reason: unknown) => {
  console.error(
    JSON.stringify({
      level: 'fatal',
      event: 'unhandledRejection',
      reason: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    }),
  );
  process.exit(1);
});

process.on('uncaughtException', (err: Error) => {
  console.error(
    JSON.stringify({
      level: 'fatal',
      event: 'uncaughtException',
      message: err.message,
      stack: err.stack,
    }),
  );
  process.exit(1);
});

start().catch((err: unknown) => {
  console.error('[Bootstrap] Error fatal al iniciar:', err);
  process.exit(1);
});
