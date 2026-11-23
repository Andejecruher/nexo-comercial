import { config } from 'dotenv';
import { z } from 'zod';

config();

const requiredString = (name: string) =>
  z
    .string({ message: `${name} is required` })
    .trim()
    .min(1, `${name} cannot be empty`);

const optionalString = z.preprocess(
  (value) => (typeof value === 'string' && value.trim().length === 0 ? undefined : value),
  z.string().trim().optional(),
);

const envBoolean = (defaultValue: boolean) =>
  z.preprocess((value) => {
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value !== 'string') return value;

    const normalized = value.trim().toLowerCase();
    if (normalized.length === 0) return undefined;
    if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
    return value;
  }, z.boolean().default(defaultValue));

export const envSchema = z.object({
  // ── Runtime / HTTP ─────────────────────────────────────────────────────────
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8000),
  WORKER_HEALTH_PORT: z.coerce.number().int().min(1).max(65535).default(8010),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(15000),
  BASE_URL: requiredString('BASE_URL'),
  CORS_ORIGIN: z.preprocess(
    (value) => (typeof value === 'string' && value.trim().length === 0 ? undefined : value),
    z.string().trim().default('*'),
  ),

  // ── WebSocket ──────────────────────────────────────────────────────────────
  WS_ENABLED: envBoolean(true),
  WS_CORS_ORIGIN: z.preprocess(
    (value) => (typeof value === 'string' && value.trim().length === 0 ? undefined : value),
    z.string().trim().optional(),
  ),
  WS_PATH: z.preprocess(
    (value) => (typeof value === 'string' && value.trim().length === 0 ? undefined : value),
    z.string().trim().default('/socket.io'),
  ),
  /**
   * Enables the official Socket.IO GCP Pub/Sub adapter so emits reach sockets
   * connected to other Cloud Run instances. Off by default for local/dev.
   */
  SOCKETIO_PUBSUB_ADAPTER_ENABLED: envBoolean(false),
  SOCKETIO_PUBSUB_TOPIC: z.preprocess(
    (value) => (typeof value === 'string' && value.trim().length === 0 ? undefined : value),
    z.string().trim().default('socketio-adapter'),
  ),
  SOCKETIO_PUBSUB_SUBSCRIPTION_PREFIX: z.preprocess(
    (value) => (typeof value === 'string' && value.trim().length === 0 ? undefined : value),
    z.string().trim().default('socket.io'),
  ),

  // ── Persistencia / Infraestructura ────────────────────────────────────────
  DATABASE_URL: requiredString('DATABASE_URL'),
  /**
   * Prisma pool size (`connection_limit` on the Cloud SQL socket URL).
   * Omit to default: 8 when WORKERS_ENABLED, otherwise 1.
   */
  PRISMA_CONNECTION_LIMIT: z.preprocess(
    (value) =>
      value === undefined || value === null || (typeof value === 'string' && value.trim() === '')
        ? undefined
        : value,
    z.coerce.number().int().min(1).max(40).optional(),
  ),

  // ── Workers / Queue polling ───────────────────────────────────────────────
  BACKGROUND_EXECUTION_BACKEND: z.enum(['polling', 'cloud_tasks']).default('polling'),
  /**
   * Permite levantar una instancia API sin workers y otra dedicada a workers.
   * Default seguro para produccion: enabled.
   */
  WORKERS_ENABLED: envBoolean(true),
  /** Disables autonomous loops while leaving request-driven task handlers available. */
  DISABLE_INTERNAL_POLLING: envBoolean(false),
  INBOX_POLL_INTERVAL_MS: z.coerce.number().int().min(1).default(2000),
  OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().min(1).default(1000),
  QUEUE_RETRY_PROMOTION_INTERVAL_MS: z.coerce.number().int().min(1).default(5000),

  // Required by API and worker runtimes only in cloud_tasks mode.
  GCP_PROJECT_ID: optionalString,
  GCP_LOCATION: optionalString,
  TASKS_QUEUE_NAME: optionalString,
  TASKS_AI_QUEUE_NAME: optionalString,
  TASKS_DELIVERY_QUEUE_NAME: optionalString,
  TASKS_DOCUMENT_QUEUE_NAME: optionalString,
  WORKER_SERVICE_URL: optionalString,
  TASKS_SERVICE_ACCOUNT_EMAIL: optionalString,
  TASKS_RECONCILE_MAX_PER_TYPE: z.coerce.number().int().min(101).max(5000).default(250),

  // ── INE OCR / Google providers ─────────────────────────────────────────────
  INE_OCR_ENABLED: envBoolean(false),
  INE_UPLOAD_MAX_BYTES: z.coerce.number().int().min(1).max(10485760).default(10485760),
  INE_UPLOAD_ALLOWED_MIME_TYPES: z
    .string()
    .trim()
    .default('image/jpeg,image/png,application/pdf')
    .refine(
      (value) =>
        value
          .split(',')
          .map((item) => item.trim())
          .sort()
          .join(',') === 'application/pdf,image/jpeg,image/png',
      'INE_UPLOAD_ALLOWED_MIME_TYPES must contain exactly image/jpeg,image/png,application/pdf',
    ),
  GOOGLE_CLOUD_PROJECT_ID: optionalString,
  DOCUMENT_AI_LOCATION: optionalString,
  DOCUMENT_AI_PROCESSOR_ID: optionalString,
  GOOGLE_DRIVE_FOLDER_ID: optionalString,
  GOOGLE_OAUTH_CLIENT_ID: optionalString,
  GOOGLE_OAUTH_CLIENT_SECRET: optionalString,
  GOOGLE_DRIVE_REFRESH_TOKEN: optionalString,
  INE_OCR_JOB_POLL_INTERVAL_MS: z.coerce.number().int().min(250).default(2000),
  INE_OCR_JOB_BATCH_SIZE: z.coerce.number().int().min(1).max(50).default(5),
  INE_OCR_JOB_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
  ENABLE_XLSX_EXPORT: envBoolean(false),
  EXPORT_JOB_TTL_MS: z.coerce.number().int().min(60_000).default(86_400_000),
  EXPORT_JOB_POLL_INTERVAL_MS: z.coerce.number().int().min(250).default(2000),
  EXPORT_RECONCILE_INTERVAL_MS: z.coerce.number().int().min(60_000).default(3_600_000),
  EXPORT_BATCH_SIZE: z.coerce.number().int().min(100).max(10_000).default(1_000),
  EXPORT_STREAM_HIGH_WATER_MARK: z.coerce.number().int().min(8_192).default(262_144),
  EXPORT_WATCHDOG_TIMEOUT_MS: z.coerce.number().int().min(60_000).default(900_000),
  EXPORT_FOLDER_CACHE_TTL_MS: z.coerce.number().int().min(60_000).default(3_600_000),
  EXPORT_DOWNLOAD_TOKEN_TTL_MS: z.coerce.number().int().min(60_000).default(600_000),

  // ── Conciliación de atención (attendance_mode ↔ agente asignado) ────────────
  ATTENDANCE_RECONCILE_INTERVAL_MS: z.coerce.number().int().min(60_000).default(3_600_000),

  // ── Realtime durable outbox rollout ─────────────────────────────────────────
  /**
   * Enables the durable realtime path for critical events (Outbox + relay).
   * Defaults to true for safe progressive rollout; set to false to revert to the
   * legacy EventBus path without dropping pending outbox events.
   */
  REALTIME_DURABLE_ENABLED: envBoolean(true),
  REALTIME_IMMEDIATE_PUBLISH_ENABLED: envBoolean(true),
  INBOUND_EAGER_INGESTION_ENABLED: envBoolean(true),
  REALTIME_RELAY_INTERVAL_MS: z.coerce.number().int().min(50).default(250),

  // ── Polling loops split (dev only) ──────────────────────────────────────────
  /**
   * Permite separar qué loops de polling corre cada proceso cuando
   * BACKGROUND_EXECUTION_BACKEND=polling (dev local). En producción
   * (cloud_tasks) NO tienen efecto: ahí el procesamiento es request-driven
   * vía Cloud Tasks y estos loops no se arrancan.
   *
   * Por defecto ambos siguen a WORKERS_ENABLED (comportamiento histórico).
   *
   * Dev local recomendado (docker-compose.dev.yml):
   *   api:    INBOX_POLLING_ENABLED=true   OUTBOX_POLLING_ENABLED=false
   *   worker: INBOX_POLLING_ENABLED=false  OUTBOX_POLLING_ENABLED=true
   *
   * Así el orquestador (que vive dentro de InboxProcessorService) corre en el
   * mismo proceso que el WebSocket gateway, y el puente legacy eventBus → socket
   * funciona sin necesidad de Pub/Sub. El worker se queda con outbox + INE OCR
   * + exports. Sin doble polling gracias al claim atómico por status.
   */
  INBOX_POLLING_ENABLED: envBoolean(true),
  OUTBOX_POLLING_ENABLED: envBoolean(true),

  // ── Inbound message batching ────────────────────────────────────────────────
  /**
   * Ventana de debounce durable para mensajes inbound del mismo teléfono.
   * 0 = comportamiento inmediato actual (sin batching).
   * Valor positivo = agrupar mensajes en la ventana y despachar un único turno IA.
   */
  BATCHING_WINDOW_MS: z.coerce.number().int().min(0).default(0),
  /**
   * Tiempo máximo de vida de una ventana de batching desde su apertura.
   * Puede ser menor que BATCHING_WINDOW_MS; en ese caso actúa como cap.
   */
  BATCHING_MAX_WAIT_MS: z.coerce.number().int().min(1).default(30_000),
  /**
   * OIDC identity attached by Google Pub/Sub to push requests to `/pubsub/*`.
   * The audience is the API origin (defaults to BASE_URL); the service account
   * email is the one configured on the push subscription. When unset outside
   * production the in-process verification is skipped; in production both are
   * required or the API fails to start.
   */
  PUBSUB_PUSH_AUDIENCE: optionalString,
  PUBSUB_PUSH_SERVICE_ACCOUNT_EMAIL: optionalString,

  // ── AI / LLM providers ────────────────────────────────────────────────────
  NVIDIA_API_KEY: optionalString,
  /** Función alojada de Parakeet RNNT multilingüe para español en NVIDIA Riva. */
  NVIDIA_RIVA_FUNCTION_ID: optionalString.pipe(
    z.string().uuid().default('71203149-d3b7-4460-8231-1be2543a1fca'),
  ),
  NVIDIA_RIVA_LANGUAGE_CODE: optionalString.pipe(
    z
      .string()
      .regex(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/)
      .default('es-US'),
  ),
  /** Presupuesto total de descarga, conversión y satélites multimodales por turno. */
  NVIDIA_MULTIMODAL_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(60_000).default(30_000),
  /** Presupuesto total de una transcripción Riva, incluida la conversión PCM. */
  NVIDIA_RIVA_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(60_000).default(20_000),
  /** Reintentos adicionales, únicamente para estados gRPC transitorios. */
  NVIDIA_RIVA_MAX_RETRIES: z.coerce.number().int().min(0).max(2).default(1),
  /** Espera entre reintentos Riva; no extiende el presupuesto total de ASR. */
  NVIDIA_RIVA_RETRY_DELAY_MS: z.coerce.number().int().min(0).max(2_000).default(100),

  // ── Multimodal test layer (independent pipelines, no agent flow) ───────────
  /** Presupuesto total del pipeline de prueba de audio (conversión + STT). */
  MULTIMODAL_TEST_AUDIO_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(300_000)
    .default(120_000),
  /** Presupuesto total del pipeline de prueba de documentos (texto nativo + OCR). */
  MULTIMODAL_TEST_DOCUMENT_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(300_000)
    .default(120_000),
  /** Presupuesto total del pipeline de prueba de imágenes (OCR + análisis visual). */
  MULTIMODAL_TEST_IMAGE_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(300_000).default(60_000),
  /** Presupuesto total del pipeline de prueba de video (audio + STT + frames). */
  MULTIMODAL_TEST_VIDEO_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(600_000)
    .default(300_000),
  /** Reintentos por proveedor dentro de un pipeline de prueba. */
  MULTIMODAL_TEST_MAX_RETRIES: z.coerce.number().int().min(0).max(2).default(1),
  /** Espera entre reintentos de proveedores en pipelines de prueba. */
  MULTIMODAL_TEST_RETRY_DELAY_MS: z.coerce.number().int().min(0).max(5_000).default(100),
  /** Tamaño máximo de archivo aceptado por los endpoints internos de prueba. */
  MULTIMODAL_TEST_MAX_FILE_MB: z.coerce.number().int().min(1).max(100).default(25),
  /** Habilita los endpoints internos de prueba multimodal (requieren JWT + rol). */
  MULTIMODAL_TEST_ENABLED: envBoolean(true),

  OPENAI_API_KEY: optionalString,
  OPENAI_BASE_URL: optionalString,
  /**
   * Requerida solo si algún AiAgent usa provider `anthropic`. Se declara opcional
   * en el schema para no romper el arranque de entornos que no lo usan, pero al
   * incluirse aquí garantizamos validación (trim + no vacía) coherente con las
   * demás llaves de proveedor y evitamos el `process.env.*` directo silencioso.
   */
  ANTHROPIC_API_KEY: optionalString,
  AI_TIMEOUT_MS: z.coerce.number().int().min(1).default(30_000),
  AI_DUPLICATE_TOOL_LOOP_THRESHOLD: z.coerce.number().int().min(2).default(3),

  // ── Seguridad / Auth base ─────────────────────────────────────────────────
  ENCRYPTION_KEY: requiredString('ENCRYPTION_KEY'),
  /**
   * HMAC key for searchable privacy-preserving indexes (voter key, CURP, phone).
   * Defaults to a deterministic derivation from ENCRYPTION_KEY so existing
   * environments keep working, but it should be rotated independently if needed.
   */
  HMAC_INDEX_KEY: optionalString,
  JWT_SECRET: requiredString('JWT_SECRET'),
  JWT_REFRESH_SECRET: requiredString('JWT_REFRESH_SECRET'),
  JWT_ACCESS_EXPIRES_IN: z.string().trim().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().trim().default('7d'),

  // ── Multi-sesión (refresh token por dispositivo) ─────────────────────────
  /**
   * Número máximo de sesiones simultáneas por usuario (dispositivos).
   * Al superar el límite se invalida la sesión más antigua.
   * Default: 5.
   */
  AUTH_MAX_SESSIONS_PER_USER: z.coerce.number().int().min(1).default(5),

  // ── Protección de autenticación (rate-limit + lockout) ───────────────────
  /**
   * Cantidad máxima de requests a /auth/login por IP en la ventana configurada.
   * Default: 10 intentos cada 15 minutos.
   */
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(10),
  AUTH_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(1).default(900), // 15 min

  /**
   * Rate limit para /auth/refresh por IP.
   * Más agresivo que login para detectar refresh flooding.
   * Default: 60 intentos cada 5 minutos.
   */
  AUTH_REFRESH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(60),
  AUTH_REFRESH_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(1).default(300), // 5 min

  /**
   * Lockout progresivo por identidad (email normalizado).
   * Máximo de intentos fallidos antes del primer lockout.
   */
  AUTH_LOCKOUT_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(5),
  /**
   * Duración de lockouts progresivos en segundos, separados por coma.
   * Nivel 1: 60s, Nivel 2: 300s, Nivel 3: 900s, Nivel 4+: 3600s
   */
  AUTH_LOCKOUT_DURATIONS: z.string().trim().default('60,300,900,3600'),

  // ── Endpoints públicos (rate-limits y calendario) ────────────────────────
  /** POST /api/v1/public/registro-ciudadano por IP */
  PUBLIC_REGISTRO_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(10),
  PUBLIC_REGISTRO_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(1).default(900),

  /** GET /api/v1/public/barrios por IP */
  PUBLIC_BARRIOS_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(60),
  PUBLIC_BARRIOS_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(1).default(60),

  /** POST /api/v1/public/newsletter/subscribe (y rutas hermanas newsletter) por IP */
  PUBLIC_NEWSLETTER_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(20),
  PUBLIC_NEWSLETTER_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(1).default(900),

  /** POST /api/v1/auth/forgot-password y /reset-password por IP */
  PASSWORD_RESET_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(10),
  PASSWORD_RESET_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(1).default(900),

  /** Zona IANA para semana calendario de eventos públicos (lunes–domingo) */
  PUBLIC_EVENTS_TZ: z.string().trim().min(1).default('America/Mexico_City'),

  /** GET /api/v1/public/eventos/semana por IP */
  PUBLIC_EVENTOS_SEMANA_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(120),
  PUBLIC_EVENTOS_SEMANA_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(1).default(60),

  /** POST /api/v1/public/eventos/:eventId/asistencia por IP */
  PUBLIC_EVENTOS_ASISTENCIA_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(15),
  PUBLIC_EVENTOS_ASISTENCIA_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(1).default(900),

  // ── Newsletter público ────────────────────────────────────────────────────
  /**
   * Si es true, nuevas altas quedan en `pending` hasta POST /public/newsletter/confirm/:token.
   * Requiere integración de correo para enviar el enlace (no incluida en esta API).
   */
  NEWSLETTER_DOUBLE_OPT_IN: envBoolean(false),

  /** Horas de validez del token de confirmación (double opt-in). */
  NEWSLETTER_CONFIRM_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(72),

  // ── Correo transaccional / Mailtrap ───────────────────────────────────────
  MAIL_PROVIDER: z.enum(['mailtrap', 'fake']).default('mailtrap'),
  MAILTRAP_API_TOKEN: optionalString,
  MAILTRAP_API_URL: optionalString,
  MAIL_FROM_ADDRESS: optionalString,
  MAIL_FROM_NAME: z.string().trim().default('Nexo Comercial'),
  MAIL_REPLY_TO_ADDRESS: optionalString,
  MAIL_SUPPORT_EMAIL: optionalString,
  MAIL_PLATFORM_NAME: z.string().trim().default('Nexo Comercial'),
  /**
   * Fallback HTTP del logo cuando el cliente bloquea el adjunto inline (cid:brand-logo).
   * Si se omite, se deriva de FRONTEND_URL.
   */
  MAIL_LOGO_URL: optionalString,
  MAIL_TIME_ZONE: z.string().trim().default('America/Mexico_City'),
  MAIL_SEND_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30000).default(10000),
  ENABLE_EMAIL_TEST_ENDPOINTS: envBoolean(false),
  EMAIL_TEST_ALLOWED_RECIPIENTS: optionalString,
  EMAIL_TEST_ALLOWED_DOMAINS: optionalString,
  EMAIL_TEST_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(100).default(5),
  EMAIL_TEST_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(60).max(86400).default(600),
  FRONTEND_URL: z.string().trim().url().default('http://localhost:5173'),
  INVITATION_EXPIRATION_MINUTES: z.coerce.number().int().min(15).max(10080).default(1440),
  INVITATION_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().min(0).default(300),
  PASSWORD_RESET_EXPIRATION_MINUTES: z.coerce.number().int().min(5).max(1440).default(60),
  PASSWORD_RESET_COOLDOWN_SECONDS: z.coerce.number().int().min(0).default(60),

  // ── Bootstrap de sistema ──────────────────────────────────────────────────
  SUPERADMIN_EMAIL: z.string().email().optional(),
  SUPERADMIN_PASSWORD: z.string().min(8).optional(),
  SUPERADMIN_FULL_NAME: z.string().trim().optional(),

  // ── WhatsApp API (módulo AI) ──────────────────────────────────────────────
  WHATSAPP_VERIFY_TOKEN: requiredString('WHATSAPP_VERIFY_TOKEN'),
  WHATSAPP_APP_ID: requiredString('WHATSAPP_APP_ID'),
  WHATSAPP_APP_SECRET: requiredString('WHATSAPP_APP_SECRET'),
  WHATSAPP_ACCESS_TOKEN: requiredString('WHATSAPP_ACCESS_TOKEN'),
  WHATSAPP_PHONE_NUMBER_ID: requiredString('WHATSAPP_PHONE_NUMBER_ID'),
  WHATSAPP_BUSINESS_ACCOUNT_ID: requiredString('WHATSAPP_BUSINESS_ACCOUNT_ID'),
  WHATSAPP_SECRET_CACHE_TTL_MS: z.coerce.number().int().min(1000).default(60_000),
  APP_VERSION: z.string().trim().default('1.0.0'),
});

const cloudTasksEnvSchema = z.object({
  GCP_PROJECT_ID: requiredString('GCP_PROJECT_ID'),
  GCP_LOCATION: requiredString('GCP_LOCATION'),
  TASKS_QUEUE_NAME: requiredString('TASKS_QUEUE_NAME'),
  WORKER_SERVICE_URL: requiredString('WORKER_SERVICE_URL')
    .url('WORKER_SERVICE_URL must be a valid URL')
    .refine((value) => {
      const workerUrl = new URL(value);
      return workerUrl.pathname === '/' && !workerUrl.search && !workerUrl.hash;
    }, 'WORKER_SERVICE_URL must be the Cloud Run service origin without a route'),
  TASKS_SERVICE_ACCOUNT_EMAIL: requiredString('TASKS_SERVICE_ACCOUNT_EMAIL'),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  const issues = parsedEnv.error.issues
    .map((issue) => {
      const key = issue.path.join('.') || 'ENV';
      return `- ${key}: ${issue.message}`;
    })
    .join('\n');

  throw new Error(`Invalid environment configuration:\n${issues}`);
}

if (parsedEnv.data.BACKGROUND_EXECUTION_BACKEND === 'cloud_tasks') {
  const parsedCloudTasksEnv = cloudTasksEnvSchema.safeParse(parsedEnv.data);
  if (!parsedCloudTasksEnv.success) {
    const issues = parsedCloudTasksEnv.error.issues
      .map((issue) => `- ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid Cloud Tasks environment configuration:\n${issues}`);
  }
}

export const env = parsedEnv.data;
export type AppEnv = z.infer<typeof envSchema>;
