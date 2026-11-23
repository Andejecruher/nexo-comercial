import { DeliveryStatusService } from '../services/whatsapp/delivery-status.service';
import { MessageMediaService } from '../services/media/message-media.service';
import { createCampaignsRouter } from './campaigns.routes';
import {
  InboundIngestionService,
  eagerIngestionEnabled,
} from '../services/ingress/inbound-ingestion.service';
/**
 * Centraliza el registro de rutas de la API.
 * Mantiene el server.ts enfocado en la inicialización.
 */
import { Router, type Express, type Request, type Response } from 'express';

import { env } from '../config/env.config';
import { AnalyticsController } from '../controllers/analytics.controller';
import { ConversationsController } from '../controllers/conversations.controller';
import { HandoverController } from '../controllers/handover.controller';
import { MessagesController } from '../controllers/messages.controller';
import { PrecampanaAnalyticsController } from '../controllers/precampana-analytics.controller';
import { TicketsController } from '../controllers/tickets.controller';
import { WebhookController } from '../controllers/webhook.controller';
import {
  AnalyticsRepository,
  AttendanceRepository,
  AuditRepository,
  CitizenRepository,
  DepartmentRepository,
  EventRepository,
  NeighborhoodRepository,
  NewsletterRepository,
  SystemRepository,
  TagRepository,
  UserRepository,
} from '../repositories';
import { CoordinatorRepository } from '../repositories/coordinator.repository';
import { StructureRepository } from '../repositories/structure.repository';
import { AuthorizationRepository } from '../repositories/authorization.repository';
import { ConversationRepository } from '../repositories/conversation.repository';
import { MessageRepository } from '../repositories/message.repository';
import { PrecampanaAnalyticsRepository } from '../repositories/precampana-analytics.repository';
import { TicketRepository } from '../repositories/ticket.repository';
import { AnalyticsService } from '../services/analytics/analytics.service';
import { PrecampanaAnalyticsService } from '../services/analytics/precampana-analytics.service';
import { AttendanceService } from '../services/attendance.service';
import { AuditService } from '../services/audit.service';
import { AuthService } from '../services/auth.service';
import { AuthorizationService } from '../services/authorization.service';
import { CitizensService } from '../services/citizens.service';
import { CoordinatorService } from '../services/coordinator.service';
import { StructureService } from '../services/structure.service';
import { ConversationsService } from '../services/conversations.service';
import { DepartmentsService } from '../services/departments.service';
import { EmailDiagnosticsService } from '../services/email-diagnostics.service';
import { EmailService } from '../services/email/email.service';
import { FakeEmailProvider } from '../services/email/fake-email.provider';
import { MailtrapEmailProvider } from '../services/email/mailtrap-email.provider';
import { EventService } from '../services/event.service';
import { InboxProcessorService } from '../services/events/inbox-processor.service';
import { OutboxProcessorService } from '../services/events/outbox-processor.service';
import { IneOcrService } from '../services/ine/ine-ocr.service';
import { LockoutService } from '../services/lockout.service';
import { MessageService } from '../services/message.service';
import { NeighborhoodsService } from '../services/neighborhoods.service';
import { NewsletterService } from '../services/newsletter.service';
import { PostgresRateLimiter } from '../services/postgres-rate-limiter.service';
import { ConversationStateMachine } from '../services/orchestrator/conversation-state-machine';
import { PasswordResetService } from '../services/password-reset.service';
import { PrismaService } from '../services/prisma.service';
import { PublicEventosService } from '../services/public-eventos.service';
import { RealtimeNotifier } from '../services/realtime/realtime-notifier.service';
import { createRealtimeMetrics } from '../services/realtime/realtime-observability.service';
import { PubSubRealtimeTransport } from '../services/realtime/pubsub-realtime-transport.service';
import { RolesPermissionsService } from '../services/roles-permissions.service';
import { ScopeService } from '../services/scope.service';
import { SystemService } from '../services/system.service';
import { TagsService } from '../services/tags.service';
import {
  BackgroundTaskDispatcher,
  createBackgroundTaskDispatcher,
} from '../services/tasks/cloud-tasks-dispatcher.service';
import { TicketService } from '../services/tickets/ticket.service';
import { UserService } from '../services/user.service';
import { WebhookParserService } from '../services/whatsapp/webhook-parser.service';
import { WhatsAppLineConfigResolver } from '../services/whatsapp/whatsapp-line-config.resolver';
import { WhatsAppProvider } from '../services/whatsapp/whatsapp.provider';
import { createAdminAiRouter } from './admin-ai.routes';
import { createAiAgentsRouter } from './ai-agents.routes';
import { createAnalyticsRouter } from './analytics.routes';
import { createAuthRouter } from './auth.routes';
import { createCitizensRouter } from './citizens.routes';
import { createConversationsRouter } from './conversations.routes';
import { createCoordinatorRouter } from './coordinator.routes';
import { createStructureRouter } from './structure.routes';
import { createDepartmentsRouter } from './departments.routes';
import { createEmailDiagnosticsRouter } from './email-diagnostics.routes';
import { createEventsRouter } from './events.routes';
import { createExportsRouter } from './exports.routes';
import { createHandoverRouter } from './handover.routes';
import { createIneOcrRouter } from './ine-ocr.routes';
import { createMultimodalTestRouter } from './multimodal-test.routes';
import { createMultimodalTestOrchestrator } from '../services/multimodal-test/multimodal-test.factory';
import { createMessagesRouter } from './messages.routes';
import { createNeighborhoodsRouter } from './neighborhoods.routes';
import { createNotificationsRouter } from './notifications.routes';
import { createPrecampanaAnalyticsRouter } from './precampana-analytics.routes';
import { createPublicRouter } from './public.routes';
import { createRealtimeTelemetryRouter } from './realtime-telemetry.routes';
import { createRolesPermissionsRouter } from './roles-permissions.routes';
import { createSystemRouter } from './system.routes';
import { createTagsRouter } from './tags.routes';
import { createTicketsRouter } from './tickets.routes';
import { createUsersRouter, createUserProfileRouter } from './users.routes';
import { createTemplatesRouter } from './templates.routes';
import { createWebhookRouter } from './webhook.routes';

type RouteDependencies = {
  prisma: PrismaService;
  realtimeTransport?: PubSubRealtimeTransport;
};

export function registerRoutes(
  app: Express,
  deps: RouteDependencies,
): { taskDispatcher?: BackgroundTaskDispatcher } {
  const apiRouter = Router();
  const taskDispatcher = createBackgroundTaskDispatcher();

  // ── Servicios base ─────────────────────────────────────────────────────────
  const rateLimiter = new PostgresRateLimiter(deps.prisma);
  const whatsappLineConfigResolver = new WhatsAppLineConfigResolver(deps.prisma);
  const whatsappProvider = new WhatsAppProvider(rateLimiter, whatsappLineConfigResolver);
  const lockoutService = new LockoutService(deps.prisma);
  const auditRepository = new AuditRepository(deps.prisma);
  const auditService = new AuditService(auditRepository);
  const userRepository = new UserRepository(deps.prisma);
  const coordinatorRepository = new CoordinatorRepository(deps.prisma);
  const structureRepository = new StructureRepository(deps.prisma);
  const attendanceRepository = new AttendanceRepository(deps.prisma);
  const analyticsRepository = new AnalyticsRepository(deps.prisma);
  const citizenRepository = new CitizenRepository(deps.prisma);
  const departmentRepository = new DepartmentRepository(deps.prisma);
  const eventRepository = new EventRepository(deps.prisma);
  const neighborhoodRepository = new NeighborhoodRepository(deps.prisma);
  const newsletterRepository = new NewsletterRepository(deps.prisma);
  const systemRepository = new SystemRepository(deps.prisma);
  const tagRepository = new TagRepository(deps.prisma);
  const authorizationRepository = new AuthorizationRepository(deps.prisma);
  const authorizationService = new AuthorizationService(deps.prisma);
  const scopeService = new ScopeService(deps.prisma);
  const rolesPermissionsService = new RolesPermissionsService(authorizationRepository);
  const emailProvider =
    env.MAIL_PROVIDER === 'fake' ? new FakeEmailProvider() : new MailtrapEmailProvider();
  const emailService = new EmailService(emailProvider);
  const emailDiagnosticsService = new EmailDiagnosticsService(emailService, rateLimiter);
  const userService = new UserService(userRepository, emailService);
  const coordinatorService = new CoordinatorService(
    deps.prisma,
    coordinatorRepository,
    userRepository,
    authorizationService,
    emailService,
  );
  const structureService = new StructureService(structureRepository);
  const passwordResetService = new PasswordResetService(userRepository, emailService);
  const authService = new AuthService(
    userRepository,
    deps.prisma,
    lockoutService,
    authorizationService,
    userService,
    passwordResetService,
    scopeService,
  );
  const neighborhoodsService = new NeighborhoodsService(neighborhoodRepository);
  const tagsService = new TagsService(tagRepository);
  const systemService = new SystemService(systemRepository, taskDispatcher);
  const citizensService = new CitizensService(citizenRepository);
  const ineOcrService = IneOcrService.createDefault(
    deps.prisma,
    taskDispatcher,
    userRepository,
    emailService,
  );
  const newsletterService = new NewsletterService(newsletterRepository, emailService);
  const departmentsService = new DepartmentsService(departmentRepository);
  const attendanceService = new AttendanceService(attendanceRepository);
  const publicEventosService = new PublicEventosService(
    eventRepository,
    citizenRepository,
    citizensService,
    attendanceService,
  );

  // ── Messaging Core ─────────────────────────────────────────────────────────
  const webhookParser = new WebhookParserService();
  const messageRepo = new MessageRepository(deps.prisma);
  const conversationRepo = new ConversationRepository(deps.prisma);
  const stateMachine = new ConversationStateMachine(conversationRepo);
  const realtimeMetrics = createRealtimeMetrics('api');
  const realtimeNotifier = new RealtimeNotifier(
    deps.realtimeTransport,
    env.REALTIME_DURABLE_ENABLED,
    {
      metrics: realtimeMetrics,
      prisma: deps.prisma,
      immediate: env.REALTIME_IMMEDIATE_PUBLISH_ENABLED,
    },
  );

  // outboxProcessor se crea antes de inboxProcessor para inyectarlo como dep
  const outboxProcessor = new OutboxProcessorService(
    deps.prisma,
    whatsappProvider,
    taskDispatcher,
    { pollIntervalMs: env.OUTBOX_POLL_INTERVAL_MS, realtimeNotifier },
  );

  const inboxProcessor = new InboxProcessorService(
    deps.prisma,
    whatsappProvider,
    outboxProcessor,
    realtimeNotifier,
    taskDispatcher,
    undefined,
    undefined,
    { pollIntervalMs: env.INBOX_POLL_INTERVAL_MS },
  );

  console.log('[Workers] Configuracion efectiva', {
    enabled: env.WORKERS_ENABLED,
    backgroundExecutionBackend: env.BACKGROUND_EXECUTION_BACKEND,
    inboxPollIntervalMs: env.INBOX_POLL_INTERVAL_MS,
    outboxPollIntervalMs: env.OUTBOX_POLL_INTERVAL_MS,
  });

  if (env.WORKERS_ENABLED && env.BACKGROUND_EXECUTION_BACKEND === 'polling') {
    if (env.INBOX_POLLING_ENABLED) inboxProcessor.start();
    if (env.OUTBOX_POLLING_ENABLED) outboxProcessor.start();
    new MessageMediaService(deps.prisma, whatsappProvider, realtimeNotifier).start();
    new DeliveryStatusService(deps.prisma, messageRepo, realtimeNotifier).start();
  } else if (env.BACKGROUND_EXECUTION_BACKEND === 'cloud_tasks') {
    console.log('[Workers] Request-driven Cloud Tasks mode; polling loops disabled');
  } else {
    console.log('[Workers] Workers deshabilitados por WORKERS_ENABLED=false');
  }

  const eventService = new EventService(eventRepository, outboxProcessor);

  // ── Realtime durable wiring (API process) ──────────────────────────────────
  // ── TicketService (construido antes que MessageService para adjuntar tickets) ─
  const ticketRepository = new TicketRepository(deps.prisma);
  const ticketService = new TicketService(ticketRepository, realtimeNotifier, deps.prisma);

  // ── MessageService ─────────────────────────────────────────────────────────
  const messageService = new MessageService(
    messageRepo,
    outboxProcessor,
    realtimeNotifier,
    deps.prisma,
    whatsappProvider,
    ticketService,
  );

  // ── Controllers ────────────────────────────────────────────────────────────
  const webhookController = new WebhookController(
    deps.prisma,
    inboxProcessor,
    webhookParser,
    messageRepo,
    whatsappProvider,
    realtimeNotifier,
    eagerIngestionEnabled()
      ? new InboundIngestionService(deps.prisma, realtimeNotifier, ticketService)
      : undefined,
  );
  const messagesController = new MessagesController(outboxProcessor, messageService);
  const handoverController = new HandoverController(stateMachine, conversationRepo);

  const conversationsService = new ConversationsService(
    conversationRepo,
    stateMachine,
    realtimeNotifier,
    deps.prisma,
    ticketService,
    messageRepo,
    departmentRepository,
  );
  const conversationsController = new ConversationsController(
    conversationsService,
    auditService,
    messageService,
  );
  const ticketsController = new TicketsController(ticketService, messageRepo);

  // ── Rutas ──────────────────────────────────────────────────────────────────

  apiRouter.use('/campaigns', createCampaignsRouter(deps.prisma));
  apiRouter.use('/templates', createTemplatesRouter(deps.prisma));
  apiRouter.use('/webhook', createWebhookRouter(webhookController, deps.prisma));
  apiRouter.use(
    '/public',
    createPublicRouter(
      citizensService,
      neighborhoodsService,
      rateLimiter,
      newsletterService,
      publicEventosService,
    ),
  );
  apiRouter.use(
    '/auth',
    createAuthRouter(authService, auditService, lockoutService, deps.prisma, rateLimiter),
  );
  apiRouter.use('/users', createUserProfileRouter(userService, auditService));
  apiRouter.use('/admin', createUsersRouter(userService, auditService, deps.prisma));
  apiRouter.use('/admin', createNotificationsRouter(deps.prisma));
  apiRouter.use(
    '/coordinators',
    createCoordinatorRouter(coordinatorService, auditService, deps.prisma),
  );
  apiRouter.use('/structures', createStructureRouter(structureService, auditService, deps.prisma));
  apiRouter.use(
    '/admin',
    createRolesPermissionsRouter(deps.prisma, rolesPermissionsService, auditService),
  );
  apiRouter.use('/admin/ai', createAdminAiRouter(deps.prisma));
  apiRouter.use('/ai-agents', createAiAgentsRouter(deps.prisma));
  apiRouter.use(
    '/admin',
    createNeighborhoodsRouter(neighborhoodsService, auditService, deps.prisma),
  );
  apiRouter.use('/admin', createTagsRouter(tagsService, auditService, deps.prisma));
  apiRouter.use(
    '/citizens',
    createCitizensRouter(citizensService, auditService, deps.prisma, ticketService),
  );
  apiRouter.use(
    '/ine-ocr',
    createIneOcrRouter(ineOcrService, deps.prisma, auditService, scopeService),
  );
  const multimodalTestOrchestrator = createMultimodalTestOrchestrator();
  apiRouter.use('/internal', createMultimodalTestRouter(multimodalTestOrchestrator));
  apiRouter.use('/admin', createDepartmentsRouter(departmentsService, auditService, deps.prisma));
  apiRouter.use(
    '/admin',
    createEventsRouter(eventService, attendanceService, auditService, deps.prisma),
  );
  apiRouter.use(
    '/admin/email-test',
    createEmailDiagnosticsRouter(emailDiagnosticsService, deps.prisma),
  );
  apiRouter.use('/messages', createMessagesRouter(messagesController, deps.prisma));
  apiRouter.use('/handover', createHandoverRouter(handoverController, deps.prisma));
  apiRouter.use(
    '/conversations',
    createConversationsRouter(conversationsController, deps.prisma, ticketsController),
  );
  apiRouter.use('/tickets', createTicketsRouter(ticketsController, deps.prisma));
  apiRouter.use('/realtime', createRealtimeTelemetryRouter({ metrics: realtimeMetrics }));
  apiRouter.use('/system', createSystemRouter(systemService));
  apiRouter.use('/exports', createExportsRouter(deps.prisma, scopeService, taskDispatcher));

  // ── Analytics ───────────────────────────────────────────────────────────────
  const analyticsService = new AnalyticsService(analyticsRepository);
  const analyticsController = new AnalyticsController(analyticsService);
  apiRouter.use('/analytics', createAnalyticsRouter(analyticsController, deps.prisma));

  // ── Analytics de Precampaña (Promovidos) ─────────────────────────────────────
  const precampanaAnalyticsRepository = new PrecampanaAnalyticsRepository(deps.prisma);
  const precampanaAnalyticsService = new PrecampanaAnalyticsService(precampanaAnalyticsRepository);
  const precampanaAnalyticsController = new PrecampanaAnalyticsController(
    precampanaAnalyticsService,
  );
  apiRouter.use(
    '/analytics',
    createPrecampanaAnalyticsRouter(precampanaAnalyticsController, deps.prisma),
  );

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', ts: new Date().toISOString() });
  });

  /**
   * Readiness probe: validates live connectivity to PostgreSQL.
   * Used by load balancers and Docker healthchecks before serving traffic.
   * Returns 503 if the database is unreachable.
   */
  app.get('/ready', (_req: Request, res: Response): void => {
    void (async () => {
      const checks: Record<string, 'ok' | 'error'> = {};

      try {
        await deps.prisma.$queryRaw`SELECT 1`;
        checks.postgres = 'ok';
      } catch {
        checks.postgres = 'error';
      }

      const healthy = Object.values(checks).every((v) => v === 'ok');
      res.status(healthy ? 200 : 503).json({
        status: healthy ? 'ok' : 'degraded',
        checks,
        ts: new Date().toISOString(),
      });
    })();
  });

  app.get('/', (_req: Request, res: Response) => {
    res.json({ message: 'Bienvenido a la API de Nexo Comercial', version: env.APP_VERSION });
  });

  app.use('/api/v1', apiRouter);

  return { taskDispatcher };
}
