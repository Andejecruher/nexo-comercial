# Auditoría de Integración Redis — Voz Ciudadana

**Alcance:** Servicios `voz-api` (`backend/src/server.ts`) y `voz-worker` (`backend/src/worker.ts` / `backend/src/worker-app.ts`).
**Fecha de auditoría:** 16 de septiembre de 2026.
**Revisor:** Arquitecto de Software Senior (Node.js / Redis / GCP).

---

## 1. Arquitectura de Conexión

### 1.1 Cliente / librería utilizada

El proyecto estandariza **`ioredis` v5.3.2** como único cliente Redis (declarado en `backend/package.json`, línea 58). No se utiliza `node-redis` ni `redis` en paralelo. La dependencia secundaria `@socket.io/redis-adapter` v8.3.0 (línea 48) internamente también opera sobre `ioredis`.

### 1.2 Inicialización de la conexión

La conexión se centraliza en `RedisService` (`backend/src/services/redis.service.ts`):

```ts
import Redis from 'ioredis';
import { env } from '../config/env.config';
import { createLogRateLimiter, createStructuredLogger } from '../utils/structured-logger';

const log = createStructuredLogger('RedisService');

export class RedisService {
  readonly client: Redis;
  private readonly shouldLogError = createLogRateLimiter();

  constructor() {
    this.client = new Redis(env.REDIS_URL);

    this.client.on('connect', () => log('info', 'redis.connected'));
    this.client.on('error', (err) => {
      if (this.shouldLogError('connection')) {
        log('error', 'redis.connection_error', undefined, { error: err.message });
      }
    });
  }
```

Observaciones del constructor:

- Se instancia un único `Redis` por proceso pasando `env.REDIS_URL` como string de conexión. No se descompone en `host`/`port`/`db`/`password` ni se pasan opciones (`new Redis(url)` sin segundo argumento).
- Se registran listeners para `connect` y `error`. El handler de error usa `createLogRateLimiter()` para evitar log-flooding ante flapping.
- Existen **conexiones adicionales derivadas** que abren su propio socket contra el mismo `REDIS_URL`:
  - `RealtimeRedisTransport` (`realtime-redis-transport.service.ts:21`) llama a `redis.client.duplicate()` para un cliente dedicado a Pub/Sub (`SUBSCRIBE`).
  - `AIStreamPubSubSubscriber` (`ai-stream-pubsub.service.ts:62`) crea **un `new Redis(redisUrl)` nuevo** (no `duplicate()`) para el canal `ai:stream:conversation`.
  - `WebsocketGatewayService.create` (`websocket-gateway.service.ts:325`) crea dos clientes más (`pubClient` + `subClient = pubClient.duplicate()`) para el adapter de Socket.IO.

En `voz-api` (`server.ts:33`) se instancia un único `RedisService` global; en `voz-worker` (`worker.ts:24`) se crea una instancia propia. Cada proceso termina con **entre 1 y 5 sockets Redis abiertos** (cliente principal + duplicados para Pub/Sub + adapter Socket.IO).

### 1.3 Estrategia de reintentos, manejo de errores y pool

| Mecanismo                           | Estado actual                                                                                                                                                                               |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `retryStrategy` (ioredis)           | **No configurado.** Se acepta el default de ioredis: `Math.min(times * 50, 2000)` ms entre reconexiones, sin techo de intentos.                                                             |
| `maxRetriesPerRequest`              | **No configurado.** Default ioredis = `null` → los comandos en vuelo se encolan indefinidamente cuando Redis cae, lo que puede colgar el webhook handler de Meta (que requiere 200 en <5s). |
| `enableOfflineQueue`                | Default (`true`): los comandos emitidos antes de la primera conexión se encolan en memoria.                                                                                                 |
| `connectTimeout` / `commandTimeout` | No configurados.                                                                                                                                                                            |
| Pool de conexiones                  | **No existe.** ioredis maneja un único socket por cliente; no hay `generic-pool` ni similar.                                                                                                |
| `client.on('error')`                | Implementado con rate-limiter de logs (líneas 23-29).                                                                                                                                       |
| `client.on('reconnecting')`         | **No escuchado** — no hay observabilidad explícita de reconexiones.                                                                                                                         |
| `disconnect()` limpio               | Sí, vía `client.quit()` (línea 33), invocado en los shutdown handlers de `server.ts` y `worker.ts`.                                                                                         |

**Conclusión 1.3:** La inicialización es funcional pero **frágil para producción**. No hay `retryStrategy` explícito, no hay `maxRetriesPerRequest` acotado, y no se instrumenta `reconnecting` ni `end`. En un escenario de pérdida de Memorystore esto puede derivar en peticiones Express colgadas hasta el timeout de Meta.

---

## 2. Entornos: Desarrollo Local vs Producción (GCP)

### 2.1 Diferenciación por entorno

**No hay bifurcación de código por `NODE_ENV`.** La inicialización es idéntica en local y en Cloud Run: `new Redis(env.REDIS_URL)`. La diferenciación vive **exclusivamente en el valor de `REDIS_URL`**:

| Entorno                                      | Origen de `REDIS_URL`             | Valor típico                                                                                          |
| -------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Local / Docker Compose                       | `backend/.env.example` (línea 11) | `redis://redis:6379` (servicio `redis` en la red de compose)                                          |
| Compose prod (`docker-compose.prod.yml:42`)  | `backend/.env` + override         | `redis://redis:6379` (servicio interno `redis:7-alpine`)                                              |
| GCP Cloud Run (`deploy-gcp.yml:366`, `:411`) | Secret Manager `REDIS_URL:latest` | `redis://<ip-privada-memorystore>:6379` (VPC connector `voz-connector`, egress `private-ranges-only`) |

La creación del recurso en GCP está documentada en `docs/DEPLOYMENT_GCP.md` (líneas 658-671):

```bash
gcloud redis instances create "$REDIS_INSTANCE" \
  --size=1 --tier=BASIC \
  --network="$VPC_NETWORK" --connect-mode=direct-peering \
  --redis-version=redis_7_0 \
  --persistence-mode=disabled \
  --transit-encryption-mode=disabled
```

**Hallazgo de seguridad:** `--transit-encryption-mode=disabled` y `--persistence-mode=disabled`. El tráfico entre Cloud Run y Memorystore viaja **sin TLS** por la VPC, y un fallo de la instancia BASIC pierde todo el estado en RAM (FSM, colas, sesiones, locks).

### 2.2 Variables de entorno requeridas

`REDIS_URL` está declarada como **obligatoria** en el schema Zod (`backend/src/config/env.config.ts:57`):

```ts
// ── Persistencia / Infraestructura ────────────────────────────────────────
DATABASE_URL: requiredString('DATABASE_URL'),
REDIS_URL: requiredString('REDIS_URL'),
```

Si falta o está vacía, `envSchema.safeParse` falla y el proceso aborta en bootstrap con `Invalid environment configuration: - REDIS_URL: REDIS_URL is required`. En el workflow de GCP se monta desde Secret Manager (`deploy-gcp.yml:366` y `:411`); en Compose se fuerza con `${REDIS_URL:?REDIS_URL requerido en produccion}` (`docker-compose.prod.yml:78`, `:108`).

No existen variables auxiliares como `REDIS_HOST`, `REDIS_PORT`, `REDIS_DB`, `REDIS_PASSWORD` ni `REDIS_TLS`: todo va embebido en la URL.

---

## 3. Integración con WhatsApp

### 3.1 Flujo lógico del webhook inbound

El flujo completo (con la participación de Redis en cada paso) es:

1. **Meta → Express** (`POST /webhook`). Middlewares encadenados: `metaSignature` (HMAC) → `idempotency` → `WebhookController.receiveWebhookMessage` (`webhook.controller.ts:62`).
2. **Idempotencia por `wamid`** (`idempotency.middleware.ts:30-78`):
   - Recolecta todos los `wamid` del payload.
   - `Promise.all(wamids.map(id => redis.get(REDIS_KEYS.WAMID_DEDUPE(id))))`.
   - Si **todos** ya existen → responde `200 already_processed` (corta el replay).
   - Para los nuevos, ejecuta `redis.set(WAMID_DEDUPE(id), 'processing', 86_400s)`.
   - **Fail-open:** si Redis falla, deja pasar al controller (no pierde mensajes).
3. **Persistencia durable en Postgres** (`webhook.controller.ts:107`): `prisma.inboxEvent.upsert({ where: { wamid } })`. Garantiza durabilidad antes del 200.
4. **Encolado** (`webhook.controller.ts:118` → `inboxProcessor.enqueue`):
   - Si `BACKGROUND_EXECUTION_BACKEND=cloud_tasks` → dispatch a Cloud Tasks (no toca Redis queue).
   - Si `QUEUE_BACKEND` ∈ `{hybrid, redis}` → `RedisQueueService.enqueueInbox` (`redis-queue.service.ts:28`): `LPUSH queue:inbox <json>`.
5. **Respuesta 200 a Meta** (`webhook.controller.ts:97`) en <5s.
6. **Worker consume** (`inbox-processor.service.ts:209`): `dequeueInboxBatch` → `RPOP queue:inbox` (batch de hasta `INBOX_BATCH_SIZE=10`). En `hybrid` también reclama de Postgres (`claimDbBatch`).
7. **Claim atómico en DB** (`inbox-processor.service.ts:349`): `inboxEvent.updateMany` con `status='processing'`, `lockedBy=worker-${pid}`. Lease 5 min (`QUEUE_LEASE_MS`).
8. **Orquestador** (`message-orchestrator.service.ts:79`): `handleInboundMessage` → `findOrCreate` ciudadano/conversación → lee `flowState` desde el contexto de conversación.
9. **FSM Router V2** (`fsm-router-v2.ts:106`):
   - **Deduplicación por `messageId`** (línea 110): `SET fsm:dedup:{convId}:{msgId} 1 EX 300 NX`. Si ya existe → `decision: duplicate`.
   - **Lock distribuido** (línea 130): `SET fsm:lock:{convId} <token> EX <ttl> NX`, donde `ttl = max(30, ceil(aiTimeoutMs/1000)+30)`.
   - **Read-through cache** (`fsm-router-v2.ts:411`): lee `fsm:meta:{convId}` (TTL 60s); si miss, lee de Postgres y cachea.
   - **Typing indicator** (línea 540): `SET fsm:typing:{phone} 1 EX 25 NX` para no enviar typing duplicado.
   - Invoca IA con `AbortController` y timeout (`invokeAiWithTimeout`).
   - `finally`: libera lock (`releaseLock` compara token antes de `DEL`) y borra `fsm:typing:{phone}`.
10. **Confirmación de dedupe** (`inbox-processor.service.ts:283`): tras éxito, `redis.set(WAMID_DEDUPE(wamid), 'processed', 86_400)`. Best-effort: si Redis falla, solo loguea `warn`.
11. **Outbound** (respuesta del bot): el orquestador/IA emiten mensajes que caen al **Outbox** (Postgres) + `RedisQueueService.enqueueOutbox` (`LPUSH queue:outbox`). El `OutboxProcessorService` los consume y llama a `WhatsAppProvider.send`.
12. **Rate limit outbound** (`whatsapp.provider.ts:62`): antes de cada envío, `redis.incr(rate:out:{phone}, 1s)`. Si excede `OUTBOUND_RATE_PER_SECOND=10` → throw.

### 3.2 Tipos de datos almacenados en Redis

| Categoría                                | Llaves                                                                            | Tipo de dato                                            | TTL                                                        |
| ---------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------- |
| **Deduplicación de webhooks Meta**       | `msg:dedupe:{wamid}`                                                              | String (`processing` / `processed`)                     | 86_400 s (24 h)                                            |
| **Deduplicación FSM por mensaje**        | `fsm:dedup:{convId}:{msgId}`                                                      | String `1`                                              | 300 s                                                      |
| **Lock de conversación FSM**             | `fsm:lock:{convId}`                                                               | String (token UUID)                                     | `max(30, aiTimeoutMs/1000+30)` s                           |
| **Cache de meta de conversación**        | `fsm:meta:{convId}`                                                               | String JSON `{flowState, version}`                      | 60 s                                                       |
| **Typing indicator dedupe**              | `fsm:typing:{phone}`                                                              | String `1`                                              | 25 s                                                       |
| **Lock de conversación (queue service)** | `conv:lock:{convId}`                                                              | String (ownerId)                                        | 300 s                                                      |
| **Estado de conversación (orquestador)** | `conv:state:{convId}`                                                             | (definido en constantes, no se escribe en código leído) | —                                                          |
| **Cola inbox**                           | `queue:inbox`                                                                     | List (LPUSH/RPOP)                                       | Sin TTL                                                    |
| **Cola outbox**                          | `queue:outbox`                                                                    | List                                                    | Sin TTL                                                    |
| **Retry sorted set inbox**               | `queue:inbox:retry`                                                               | Sorted Set (score=timestamp)                            | **Sin TTL**                                                |
| **Retry sorted set outbox**              | `queue:outbox:retry`                                                              | Sorted Set                                              | **Sin TTL**                                                |
| **DLQ inbox**                            | `queue:inbox:dlq`                                                                 | List                                                    | **Sin TTL**                                                |
| **DLQ outbox**                           | `queue:outbox:dlq`                                                                | List                                                    | **Sin TTL**                                                |
| **Rate limit outbound**                  | `rate:out:{phone}`                                                                | Counter (INCR)                                          | 1 s                                                        |
| **Rate limit login por IP**              | `rl:login:ip:{ip}`                                                                | Counter                                                 | `AUTH_RATE_LIMIT_WINDOW_SECONDS` (900 s)                   |
| **Rate limit refresh por IP**            | `rl:refresh:ip:{ip}`                                                              | Counter                                                 | 300 s                                                      |
| **Rate limit endpoints públicos**        | `rl:public:*:{ip}`, `rl:auth:password-reset:{ip}`                                 | Counter                                                 | configurable (60–900 s)                                    |
| **Lockout por email**                    | `lo:fails:{email}`, `lo:lock:{email}`, `lo:level:{email}`                         | String/Counter                                          | duración progresiva (60–3600 s); `lo:level` sin TTL propio |
| **Sesiones auth**                        | `auth:session:{userId}:{deviceId}:{jti}` (String), `auth:sessions:{userId}` (Set) | String + Set                                            | TTL = refresh expiry; el Set renueva con `sadd`            |
| **Idempotencia genérica webhook**        | `wh:idem:{key}`                                                                   | String                                                  | `IDEMPOTENCY_TTL_SECONDS` (600 s)                          |
| **Idempotencia mensajes dashboard**      | `msg:idem:{key}`                                                                  | String                                                  | 24 h                                                       |
| **Contador complejidad orquestador**     | `orchestrator:complexity:{convId}`                                                | Counter (INCR)                                          | 900 s                                                      |
| **Pub/Sub realtime durable**             | Canal `realtime:events:v1`                                                        | Pub/Sub                                                 | n/a                                                        |
| **Pub/Sub AI stream**                    | Canal `ai:stream:conversation`                                                    | Pub/Sub                                                 | n/a                                                        |
| **Socket.IO adapter**                    | Internos de `@socket.io/redis-adapter`                                            | Pub/Sub                                                 | n/a                                                        |

### 3.3 Ejemplos de estructuras de llaves

Definidos centralizadamente en `backend/src/config/messaging.constants.ts:6`:

```ts
export const REDIS_KEYS = {
  WAMID_DEDUPE: (wamid: string) => `msg:dedupe:${wamid}`,
  CONVERSATION_LOCK: (conversationId: string) => `conv:lock:${conversationId}`,
  WEBHOOK_IDEMPOTENCY: (key: string) => `wh:idem:${key}`,
  INBOX_QUEUE: 'queue:inbox',
  INBOX_DLQ: 'queue:inbox:dlq',
  OUTBOX_QUEUE: 'queue:outbox',
  OUTBOX_DLQ: 'queue:outbox:dlq',
  RATE_LIMIT_OUTBOUND: (phone: string) => `rate:out:${phone}`,
  BOT_SESSION: (phone: string) => `bot:session:${phone}`,
  CONV_STATE: (conversationId: string) => `conv:state:${conversationId}`,
  MSG_IDEMPOTENCY: (key: string) => `msg:idem:${key}`,
} as const;
```

Llaves adicionales del FSM (`fsm-router-v2.ts:36-40`):

```ts
const lockKey = (id: string): string => `fsm:lock:${id}`;
const metaCacheKey = (id: string): string => `fsm:meta:${id}`;
const dedupKey = (convId: string, msgId: string): string => `fsm:dedup:${convId}:${msgId}`;
const typingKey = (phone: string): string => `fsm:typing:${phone}`;
```

Llaves de autenticación (`auth.service.ts:60-67`):

```ts
const sessionKey = (userId: string, deviceId: string, jti: string): string =>
  `auth:session:${userId}:${deviceId}:${jti}`;
const sessionsSetKey = (userId: string): string => `auth:sessions:${userId}`;
```

Llaves de lockout (`lockout.service.ts:38-43`):

```ts
const keys = {
  ipRateLimit: (ip: string) => `rl:login:ip:${ip}`,
  ipRefreshRateLimit: (ip: string) => `rl:refresh:ip:${ip}`,
  lockoutFails: (email: string) => `lo:fails:${email}`,
  lockoutActive: (email: string) => `lo:lock:${email}`,
  lockoutLevel: (email: string) => `lo:level:${email}`,
} as const;
```

**Ejemplos concretos de llaves en producción:**

- `msg:dedupe:wamid.HBgLMTQ1Nz...` → valor `"processed"`, TTL 24h
- `fsm:dedup:conv-uuid-1234:wamid.HBgLMTQ1Nz...` → valor `"1"`, TTL 300s
- `fsm:lock:conv-uuid-1234` → valor `"a3f1b2c4-..."` (token UUID), TTL ~60s
- `fsm:meta:conv-uuid-1234` → valor `{"flowState":"BOT_FLOW","version":3}`, TTL 60s
- `rate:out:+5215512345678` → contador entero, TTL 1s
- `auth:session:user-uuid:device-abc:jti-xyz` → SHA-256 del refresh token, TTL = refresh expiry (7d default)
- `auth:sessions:user-uuid` → Set con claves de sesión activas, TTL renovado a refresh expiry
- `queue:inbox` → List con payloads JSON `{id, payload, retryCount, enqueuedAt, correlationId}`

---

## 4. Gestión de Memoria y Ciclo de Vida

### 4.1 Establecimiento explícito de TTL (EX)

**Sí, en la mayoría de operaciones críticas.** El helper `RedisService.set` (`redis.service.ts:44-50`) bifurca según se provea TTL:

```ts
async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
  if (ttlSeconds) {
    await this.client.setex(key, ttlSeconds, value);
  } else {
    await this.client.set(key, value);
  }
}
```

El helper `incr` (`redis.service.ts:58-66`) aplica `EXPIRE` solo en la primera escritura (cuando el contador pasa de 0 a 1), evitando resetear el TTL en cada incremento:

```ts
async incr(key: string, ttlSeconds?: number): Promise<number> {
  const value = await this.client.incr(key);
  if (value === 1 && ttlSeconds) {
    await this.client.expire(key, ttlSeconds);
  }
  return value;
}
```

El helper `sadd` (`redis.service.ts:96-107`) asegura que el TTL del Set sea **al menos** `ttlSeconds`, extendiéndolo si el TTL actual es menor o si no tenía expiración (`-1`):

```ts
async sadd(key: string, member: string, ttlSeconds?: number): Promise<void> {
  await this.client.sadd(key, member);
  if (ttlSeconds) {
    const currentTtl = await this.client.ttl(key);
    if (currentTtl === -1 || currentTtl < ttlSeconds) {
      await this.client.expire(key, ttlSeconds);
    }
  }
}
```

**Ejemplos de uso con TTL explícito:**

| Lugar                                                           | Código                                                                  | TTL                 |
| --------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------- |
| Idempotency middleware (`idempotency.middleware.ts:67`)         | `redis.set(WAMID_DEDUPE(id), 'processing', WAMID_DEDUPE_TTL_SECONDS)`   | 86_400 s            |
| Inbox processor (`inbox-processor.service.ts:283`)              | `redis.set(WAMID_DEDUPE(wamid), 'processed', 86_400)`                   | 24 h                |
| FSM dedup (`fsm-router-v2.ts:464`)                              | `client.set(key, '1', 'EX', DEDUP_TTL_SECONDS, 'NX')`                   | 300 s               |
| FSM lock (`fsm-router-v2.ts:476`)                               | `client.set(key, token, 'EX', computedLockTtl, 'NX')`                   | 30–60 s             |
| FSM meta cache (`fsm-router-v2.ts:158`)                         | `redis.set(metaCacheKey, JSON.stringify(meta), META_CACHE_TTL_SECONDS)` | 60 s                |
| FSM typing (`fsm-router-v2.ts:546`)                             | `client.set(key, '1', 'EX', TYPING_TTL_SECONDS, 'NX')`                  | 25 s                |
| Conversation lock (`redis-queue.service.ts:148`)                | `client.set(key, ownerId, 'EX', CONVERSATION_LOCK_TTL_SECONDS, 'NX')`   | 300 s               |
| Rate limit outbound (`whatsapp.provider.ts:62`)                 | `redis.incr(key, 1)`                                                    | 1 s                 |
| Rate limit login (`lockout.service.ts:62`)                      | `redis.incr(key, AUTH_RATE_LIMIT_WINDOW_SECONDS)`                       | 900 s               |
| Rate limit públicos (`public-ip-rate-limit.middleware.ts:78`)   | `redis.incr(key, windowSeconds)`                                        | configurable        |
| Lockout activo (`lockout.service.ts:157`)                       | `redis.set(lockoutActive, '1', duration)`                               | 60–3600 s           |
| Sesiones auth (`auth.service.ts:443`)                           | `redis.set(key, hashToken(refreshToken), ttl)`                          | refresh expiry (7d) |
| Sesiones auth set (`auth.service.ts:458`)                       | `redis.sadd(setKey, key, ttl)`                                          | refresh expiry      |
| Complejidad orquestador (`message-orchestrator.service.ts:562`) | `redis.incr(key, COMPLEXITY_COUNTER_TTL_SECONDS)`                       | 900 s               |

### 4.2 Limpieza de datos residuales

**Mixto.** Hay limpieza explícita en algunos flujos, pero **no en las colas**:

- **Limpieza explícita vía `del`/`srem`:**
  - FSM libera lock al finalizar (`fsm-router-v2.ts:485-489`) con verificación de token.
  - FSM borra `fsm:typing:{phone}` en `finally` (`fsm-router-v2.ts:559`).
  - FSM invalida cache meta tras transiciones (`invalidateMetaCache`).
  - AuthService elimina sesión y miembro del Set en logout/rotación (`auth.service.ts:365-366`, `:453-454`).
  - `LockoutService.clearFailures` borra los tres contadores en login exitoso (`lockout.service.ts:182-187`).
  - Orquestador resetea contador de complejidad (`message-orchestrator.service.ts:567`).

- **Sin TTL ni limpieza (dependen de evicción del servidor):**
  - `queue:inbox`, `queue:outbox` (Lists): sin TTL — se vacían con consumo normal, pero si el worker cae, los items quedan indefinidamente.
  - `queue:inbox:retry`, `queue:outbox:retry` (Sorted Sets): **sin TTL**. Si `promoteRetryItems` deja de ejecutarse, los items maduros y no-maduros persisten para siempre.
  - `queue:inbox:dlq`, `queue:outbox:dlq` (Lists): **sin TTL**. Los items muertos se acumulan sin límite.
  - `lo:level:{email}`: el propio comentario en `lockout.service.ts:22` dice "sin TTL propio (se limpia en login OK)". Si el usuario nunca vuelve a loguearse exitosamente, la clave persiste.

- **No se configuran políticas de evicción del servidor Redis:**
  - Compose prod (`docker-compose.prod.yml:46`): `redis-server --appendonly yes` — sin `maxmemory`, sin `maxmemory-policy`. Default Redis: sin límite de memoria.
  - Memorystore GCP (`DEPLOYMENT_GCP.md:658`): `--size=1 --tier=BASIC --persistence-mode=disabled`. Sin `maxmemory-policy` configurado (Memorystore default: `noeviction`, que hace que Redis rechace writes cuando llega al tope).

**Conclusión 4.2:** La limpieza depende casi por completo de los TTL explícitos del código. Las colas, los retry sorted sets y las DLQ son **fugas de memoria potenciales** porque no tienen TTL y no hay política de evicción configurada.

---

## 5. Hallazgos y Riesgos Potenciales

### 5.1 Riesgos críticos (bloqueantes para escalar en GCP)

**R1. Falta de `maxRetriesPerRequest` y `retryStrategy` explícitos en ioredis.**
`RedisService` construye `new Redis(env.REDIS_URL)` sin opciones (`redis.service.ts:20`). Con el default de ioredis, una caída de Memorystore deja las peticiones Express encoladas esperando reconexión. El webhook de Meta exige 200 en <5s; si Redis está degradado, los webhooks timeoutean, Meta reintenta, y se duplican los eventos (paradójicamente, justo lo que la dedupe intenta evitar). **Recomendación:** pasar `{ maxRetriesPerRequest: 3, retryStrategy: times => Math.min(times*100, 2000), enableOfflineQueue: false }` en el cliente usado por el webhook path, o separar un cliente "comando" de un cliente "queue".

**R2. DLQ y retry sorted sets sin TTL ni purga.**
`queue:inbox:dlq`, `queue:outbox:dlq`, `queue:inbox:retry`, `queue:outbox:retry` (`redis-queue.service.ts:18-19`, `:87-88`) se crean con `LPUSH`/`ZADD` y nunca reciben `EXPIRE`. En una instancia BASIC de Memorystore (1 GB, sin persistencia), un pico de fallos sostenido puede llenar la memoria. Como Memorystore defaultea a `noeviction`, Redis empezará a rechazar writes (`OOM command not allowed`) y **todo el sistema de mensajería se detiene**. **Recomendación:** (a) `EXPIRE` en cada item de DLQ con TTL largo (ej. 7 días) y (b) un job periódico que purgue DLQ por edad.

**R3. Memorystore BASIC sin persistencia ni TLS.**
`DEPLOYMENT_GCP.md:665-666` crea la instancia con `--persistence-mode=disabled --transit-encryption-mode=disabled`. Implicaciones:
- Un reinicio/mantenimiento de Memorystore pierde **todo el estado**: locks FSM activos, colas inbox/outbox no consumidas, sesiones auth, contadores de rate limit. El sistema se reinicia desde cero, con posibles dobles-procesamientos (mitigados por la dedupe en Postgres, pero con costo).
- El tráfico Cloud Run ↔ Memorystore viaja sin cifrar por la VPC. Aceptable dentro de una VPC privada, pero revisar requisitos de compliance.
- **Recomendación:** evaluar `--tier=STANDARD_HA` para producción y `--transit-encryption-mode=server-authentication` si hay requisitos de compliance.

**R4. `RedisService.keys()` usa SCAN sin techo.**
`redis.service.ts:78-89` implementa `keys(pattern)` con `SCAN ... COUNT 100` iterativo. Aunque SCAN es O(N) no bloqueante, en bases grandes con prefijos amplios puede retornar miles de claves y consumirlas en memoria. El propio comentario advierte ("USAR CON PRECAUCIÓN"). **Recomendación:** auditar callers de `keys()`; preferir `SMEMBERS` sobre Sets indexados o mantener un Set índice de claves activas por dominio.

### 5.2 Riesgos altos (impacto operativo/costo)

**R5. Múltiples conexiones Redis por proceso sin gestión centralizada.**
Cada proceso abre: 1 cliente `RedisService` + 1 duplicado en `RealtimeRedisTransport` + 1 `new Redis` en `AIStreamPubSubSubscriber` + 2 en `WebsocketGatewayService.create` (pub + sub adapter). En `voz-api` con WS habilitado son **hasta 5 sockets**. Cloud Run escala `voz-api` hasta `max-instances=10` (`deploy-gcp.yml:362`) y `voz-worker` hasta 20 (`deploy-gcp.yml:409`): potencialmente **150 conexiones** contra Memorystore. Memorystore BASIC soporta hasta ~16k conexiones, pero el costo de connection-setup y el riesgo de agotamiento en picos existe. **Recomendación:** centralizar la creación de clientes en `RedisService` (factory de duplicados) y reusar conexiones; desactivar WS en instancias que no lo necesiten (ya hecho en worker: `WS_ENABLED=false`).

**R6. Fail-open en idempotencia puede permitir dobles-procesamientos.**
`idempotency.middleware.ts:79-82` deja pasar el request si Redis falla. Es razonable para no perder mensajes, pero combinado con R1 (Redis caído) puede generar una oleada de dobles-procesamientos que después saturan el retry de Postgres. **Recomendación:** métricas/alarma explícitas en el path fail-open; considerar fail-closed en entornos críticos.

**R7. Race condition en `releaseConversationLock` y `releaseLock` del FSM.**
Ambos leen-then-delete sin Lua/script:

```ts
const current = await this.redis.get(key);
if (current === token) {
  await this.redis.del(key);
}
```

Entre `GET` y `DEL` el lock pudo expirar y ser readquirido por otro worker, y el `DEL` lo borraría. Probabilidad baja (TTL ≥ 30s), pero es un patrón conocido. **Recomendación:** usar un script Lua `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) end` (ioredis soporta `eval`).

**R8. `incr` + `expire` no atómico en `RedisService.incr`.**
`redis.service.ts:59-62` hace `INCR` seguido de `EXPIRE` solo si `value === 1`. Si el proceso muere entre `INCR` y `EXPIRE`, la clave queda sin TTL (perpetua). Probabilidad baja pero real en shutdowns abruptos. **Recomendación:** usar un pipeline o `SET key 0 EX ttl NX` + `INCR`.

**R9. Costo de Memorystore BASIC 1 GB siempre encendido.**
Memorystore no soporta scale-to-zero. Con `--size=1 --tier=BASIC` hay costo fijo 24/7. Si el tráfico es bajo, evaluar Redis alternativo (ej. Redis interno en una VM Cloud Run job, o Upstash/Redis compatible con scale-to-zero) — aunque esto rompería la VPC-only actual. Documentar el tradeoff.

### 5.3 Riesgos medios (calidad/datos)

**R10. `lo:level:{email}` sin TTL puede crecer indefinidamente.**
El comentario en `lockout.service.ts:22` reconoce que solo se limpia en login OK. Usuarios que intentan y abandonan dejan la clave para siempre. **Recomendación:** TTL largo (ej. 30 días) en `recordFailure`.

**R11. Cache de `CommunicationLine` es in-memory, no Redis.**
`communication-line-cache.service.ts` usa un `Map` local con TTL por timestamp, no Redis. En despliegues multi-instancia (Cloud Run con N replicas), cada instancia mantiene su cache y la invalidación vía Pub/Sub (`attachRedisInvalidation`) es opcional y no se invoca en el código leído. **Recomendación:** confirmar que `attachRedisInvalidation` se llama en el bootstrap, o mover el cache a Redis para coherencia.

**R12. `fsm:meta:{convId}` con TTL 60s puede servir estado stale.**
Si el worker transiciona el FSM, invalida el cache (`invalidateMetaCache`), pero una réplica que leyó el cache 59s antes y está procesando otro mensaje del mismo ciudadano puede decidir con `flowState` viejo. El lock distribuido (`fsm:lock`) mitiga la concurrencia, pero no el caso de dos mensajes rápidos secuenciales. **Recomendación:** reducir TTL a 10-15s o invalidar en cada transición de otros workers vía Pub/Sub.

**R13. Sin observabilidad de reconexiones.**
No se escucha `client.on('reconnecting')` ni `client.on('end')`. En GCP, un flap de Memorystore puede pasar desapercibido hasta que los webhooks empiecen a fallar. **Recomendación:** añadir listeners y emitir métricas a Cloud Monitoring.

### 5.4 Riesgos bajos (mejoras de calidad)

**R14. `BOT_SESSION` y `CONV_STATE` declarados pero no usados.**
`messaging.constants.ts:15-16` define `BOT_SESSION` y `CONV_STATE` pero no se encontraron escrituras/lecturas en el código. Posible código muerto o migración incompleta a FSM V2. **Recomendación:** eliminar o documentar.

**R15. `setCommunicationLineCache` no expone invalidación por `id`+`ext` simultáneamente.**
`communication-line-cache.service.ts:128-138` setea la cache por `lineId` y `externalIdentifier` pero `invalidateCommunicationLineCacheById` solo borra `line:{id}` e `id:{id}`, no `ext:{ext}`. Inconsistencia menor.

**R16. Hardcoded `60_000` en `inbox-processor.service.ts:283`.**
El TTL de confirmación de dedupe usa `86_400` literal en vez de `QUEUE_CONFIG.WAMID_DEDUPE_TTL_SECONDS`. Inconsistencia con el middleware que sí usa la constante. **Recomendación:** reemplazar por la constante.

---

## 6. Resumen Ejecutivo

| Dimensión         | Estado                                            | Acción prioritaria           |
| ----------------- | ------------------------------------------------- | ---------------------------- |
| Cliente           | ✅ `ioredis` 5.3.2 estandarizado                   | —                            |
| Inicialización    | ⚠️ Sin `retryStrategy`/`maxRetriesPerRequest`      | **R1** — configurar opciones |
| Entornos          | ✅ Diferenciación solo por `REDIS_URL`             | Aceptar, documentar          |
| Webhook flow      | ✅ Defensa en profundidad (Redis + Postgres + FSM) | —                            |
| TTL explícito     | ✅ En la mayoría de claves críticas                | —                            |
| DLQ/Retry sin TTL | ❌ Fuga de memoria potencial                       | **R2** — añadir `EXPIRE`     |
| Memorystore       | ⚠️ BASIC, sin persistencia ni TLS                  | **R3** — evaluar STANDARD_HA |
| Conexiones        | ⚠️ Hasta 5 sockets/proceso, 150 en pico            | **R5** — centralizar         |
| Locks             | ⚠️ GET-then-DEL no atómico                         | **R7** — script Lua          |
| Observabilidad    | ❌ Sin métricas de reconexión                      | **R13** — listeners          |

**Prioridad de remediación:** R1, R2, R3 son las que pueden causar incidentes de producción o costos no anticipados en GCP. R5-R8 son mejoras operativas recomendadas antes de escalar más allá de 10 instancias. R10-R16 son mejoras de calidad a programar en backlog.

---

**Fin del reporte.** El documento cubre las cinco secciones solicitadas (Arquitectura de Conexión, Entornos, Integración WhatsApp, Gestión de Memoria y Hallazgos) más un resumen ejecutivo. Las referencias a archivos y líneas permiten trazabilidad directa al código auditado.
