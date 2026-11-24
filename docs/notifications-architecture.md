# Arquitectura de Notificaciones en Tiempo Real — Nexo Comercial

> Documento de referencia generado a partir del análisis del código fuente real (oct 2026).
> Objetivo: que cualquier desarrollador pueda explicar, depurar y extender el flujo de
> notificaciones en tiempo real sin depender de IA.
>
> **Actualización (estandarización de entornos):** `docker-compose.dev.yml` ahora corre
> en **modo durable por defecto** contra un **emulador local de Pub/Sub** (servicios
> `pubsub-emulator`, `pubsub-init` y `realtime-relay`), replicando la ruta de producción
> sin tocar GCP. Las secciones que describen el "modo dev legacy" quedan como referencia
> del camino opt-in `REALTIME_DURABLE_ENABLED=false`. El `docker-compose.yml` de raíz fue
> eliminado: los entrypoints soportados son `make` y `-f docker-compose.{dev,qa,prod}.yml`.

---

## 0. Resumen ejecutivo (léelo primero)

Este sistema **no usa Redis ni BullMQ**. La "cola" es **PostgreSQL puro** (tablas
`inbox_events`, `outbox_events`, `realtime_outbox_events`) y el transporte en
producción es **Google Pub/Sub** + **Cloud Tasks** (ver `docs/auditoria-redis.md` para
el histórico de esa decisión: Redis fue eliminado del stack).

El sistema tiene **dos modos de operación** para el realtime, controlados por una sola
bandera (`REALTIME_DURABLE_ENABLED`). Entender esto es la clave de TODO el flujo:

| Modo                           | Bandera          | Ruta del evento                                                               | Dónde se usa                                                                        |
| ------------------------------ | ---------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **Legacy (in-process)**        | `false`          | `EventEmitter` interno (`event-bus.service.ts`) en el mismo proceso de la API | opt-in en dev (`REALTIME_DURABLE_ENABLED=false`)                                    |
| **Durable (outbox + Pub/Sub)** | `true` (default) | Outbox transaccional en Postgres → Pub/Sub → push HTTP → gateway              | `docker-compose.dev.yml` (default, emulador), `docker-compose.qa.yml`, `docker-compose.prod.yml`, Cloud Run |

El servidor WebSocket **vive únicamente en la API** (`socket.io` v4, namespace
`/admin`). El worker **nunca habla con sockets**: publica eventos a Pub/Sub (modo
durable) o simplemente no participa del realtime (modo dev).

En producción, el problema de "¿a qué instancia de Cloud Run está conectado mi
cliente?" ya está resuelto con el patrón correcto:
**Pub/Sub push → 1 instancia de la API →** `@socket.io/gcp-pubsub-adapter` **hace fan-out
del** `emit` **a todas las réplicas**.

Las brechas principales encontradas (detalle en §6):

1. ~~El entorno `dev` ejecuta una ruta de código (`eventBus`) que **no es la de
   producción**~~ **Resuelto**: `docker-compose.dev.yml` ahora corre durable por defecto
   contra el emulador local, así que dev ejercita la misma ruta que producción. El modo
   legacy `eventBus` queda como opt-in explícito (`REALTIME_DURABLE_ENABLED=false`).
2. El **centro de notificaciones** (`admin.notification`) no se persiste: si el cliente
  está offline o refresca, esas notificaciones se pierden.
3. ~~Healthcheck del worker roto~~ **Corregido tras verificación**: el healthcheck a
   `:8000/healthz` es correcto — el worker de dev escucha en `PORT` (8000) porque
   `backend/.env` define `PORT=8000` y `worker.ts:117` da precedencia a `PORT` sobre
   `WORKER_HEALTH_PORT` (8010, que es config muerta en dev y confunde el diagnóstico).
4. ~~**Contaminación dev→prod verificada en GCP**~~ **Mitigado**: el default de dev ahora
   apunta a `PUBSUB_EMULATOR_HOST` (contenedor `pubsub-emulator`), por lo que dev ya no
   publica contra los topics reales de `<GCP_PROJECT_ID>`. El riesgo reaparece solo si
   alguien fuerza `PUBSUB_EMULATOR_HOST=""` en dev; no lo hagas (ver §6 #11).

---

## 1. Diagrama del flujo LOCAL (end-to-end, modo dev)

> **Default actual:** `docker-compose.dev.yml` corre durable (emulador de Pub/Sub). Esta
> sección describe el **modo legacy opt-in** (`REALTIME_DURABLE_ENABLED=false`), útil para
> depurar el camino in-process. Para el camino durable local, ver §8.

Configuración legacy de `docker-compose.dev.yml` (override `REALTIME_DURABLE_ENABLED=false`):

```yaml
api:    WS_ENABLED=true   REALTIME_DURABLE_ENABLED=false  INBOX_POLLING=true   OUTBOX_POLLING=false
worker: WS_ENABLED=false  REALTIME_DURABLE_ENABLED=false  INBOX_POLLING=false  OUTBOX_POLLING=true
```

**Por qué está repartido así** (comentarios del propio compose): el "orquestador" (la
lógica de negocio que reacciona a mensajes) vive dentro de `InboxProcessorService`. En
dev, ese polling corre **en la API** para que el puente legacy `eventBus → WebSocket gateway` funcione sin Pub/Sub. El worker se queda con el outbox de WhatsApp y
exports, para no competir por el claim del inbox.

```text
┌──────────────┐  webhook POST   ┌───────────────────────── API (contenedor) ─────────────────────────┐
│  Meta /      │ ──────────────► │ WebhookController → dedupe por wamid (tabla webhook_event_log)      │
│  WhatsApp    │                 │        │                                                              │
│  Cloud API   │                 │        ▼  INSERT (Postgres)                                          │
└──────────────┘                 │ InboxEvent (status=pending)  ◄── COLA 1: "inbox_events"               │
                                 │        │                                                            │
      Postgres ◄──────────────────┤        ▼  polling cada 2s (INBOX_POLLING_ENABLED=true, en la API)   │
      (contenedor)               │ InboxProcessorService (claim atómico FOR UPDATE SKIP LOCKED)         │
                                 │        │                                                            │
                                 │        ▼                                                            │
                                 │ MessageOrchestratorService (FSM conversación + IA)                   │
                                 │        │                                                            │
                                 │        ├──► INSERT OutboxEvent  ──► COLA 2: "outbox_events"           │
                                 │        │    (respuestas WhatsApp; las procesa el WORKER vía polling) │
                                 │        │                                                            │
                                 │        ▼  REALTIME (modo legacy)                                    │
                                 │ eventBus.emit('message.created' | 'conversation.updated' |           │
                                 │               'conversation.handover' | 'conversation.typing')       │
                                 │        │   (EventEmitter IN-PROCESS — solo llega porque el            │
                                 │        │    orquestador y el gateway viven en el MISMO proceso)       │
                                 │        ▼                                                            │
                                 │ WebsocketGatewayService (socket.io, namespace /admin)                │
                                 │   io.of('/admin').to('conversation:<id>').emit('conversation.       │
                                 │   message.new', payload) + 'admin.notification' a todo el namespace  │
                                 └────────┬───────────────────────────────────────────────────────────┘
                                          │ WebSocket (socket.io, path /socket.io)
                                          ▼
                                 ┌──────────────── Frontend (Next.js) ─────────────────┐
                                 │ RealtimeManager (frontend/lib/realtime/…)            │
                                 │  ├─ dedupe LRU de eventId (máx 500)                   │
                                 │  ├─ EventRouter → hooks (useConversationThread, …)    │
                                 │  ├─ useNotificationStore (toasts + campana, EN MEMORIA)│
                                 │  └─ usePresenceStore / useConnectionStore            │
                                 └──────────────────────────────────────────────────────┘

  WORKER (contenedor): NO toca sockets. Solo hace polling de outbox_events
  (envía a WhatsApp) y exports. En dev NO publica nada de realtime.
```

### Respuestas explícitas al cuestionario (modo local)

| Pregunta                          | Respuesta concreta con evidencia                                                                                                                                                                                                                                                                                                                  |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ¿Quién emite el evento?           | En dev, **la API**: el orquestador corre dentro del proceso de la API (`INBOX_POLLING_ENABLED=true` en el servicio `api`). El worker no emite eventos realtime en dev.                                                                                                                                                                            |
| ¿Cómo se encola?                  | **PostgreSQL**: `inbox_events` (inbound WhatsApp, dedupe por wamid), `outbox_events` (outbound WhatsApp, `idempotencyKey` único), `realtime_outbox_events` (solo modo durable). **No hay Redis ni BullMQ.**                                                                                                                                       |
| ¿Quién procesa la cola?           | Dev: la **API** procesa inbox (polling 2s con claim atómico `FOR UPDATE SKIP LOCKED`); el **worker** procesa outbox (1s), OCR y exports.                                                                                                                                                                                                          |
| ¿Cómo se transporta al WebSocket? | Dev: **EventEmitter in-process** (`backend/src/services/events/event-bus.service.ts`), activado por `legacyCriticalEventBusBridgeEnabled = !REALTIME_DURABLE_ENABLED` (server.ts:167). El worker notifica **pasando por Postgres**, nunca directo al socket.                                                                                      |
| ¿Cómo se entrega al frontend?     | **socket.io v4** (`socket.io` 4.8.x / `socket.io-client` 4.8.x), namespace `/admin`, path `/socket.io`, transports `['websocket','polling']`.                                                                                                                                                                                                     |
| ¿Auth del socket?                 | **JWT access token en el handshake**: el cliente manda `auth: { token }` vía callback dinámico (realtime-manager.ts:100); `socketAuthMiddleware` (websocket-gateway.service.ts:72) verifica con `verifyAccessToken`, exige `type === 'access'`, y guarda `{userId, email, roles}` en `socket.data.user`. Sin cookies: token Bearer por handshake. |

### Salas (rooms)

- `userRoom(userId)` — se une automáticamente al conectar (1 socket por usuario admin).
- `conversationRoom(conversationId)` — el cliente pide `conversation.subscribe` y el
servidor valida con `canSubscribeToConversation(prisma, userId, conversationId)`
(autorización contra la DB, no solo "confía en el JWT").
- Presencia: el gateway mantiene un `Map<userId, count>` en memoria del proceso, emite
`presence.update` a todo el namespace `/admin` y un heartbeat periódico
(`startPresenceHeartbeat`).

---

## 2. Diagrama del flujo PRODUCCIÓN (GCP, modo durable)

Configuración que fija `docs/deploy/deploy-gcp.yml` (línea 369 para la API):

```text
NODE_ENV=production, BACKGROUND_EXECUTION_BACKEND=cloud_tasks, WORKERS_ENABLED=false (API)
WS_ENABLED=true, REALTIME_DURABLE_ENABLED=true, SOCKETIO_PUBSUB_ADAPTER_ENABLED=true,
SOCKETIO_PUBSUB_TOPIC=socketio-adapter, PUBSUB_PUSH_AUDIENCE=<api url>,
PUBSUB_PUSH_SERVICE_ACCOUNT_EMAIL=<oidc>, PRISMA_CONNECTION_LIMIT=5
```

```text
 Meta webhook ──► Cloud Run API ──► INSERT inbox_events ──► Cloud Tasks (dispatch)
                                                          │
                                                          ▼
                                              Cloud Run WORKER  POST /tasks/process-inbox
                                                          │
                                       MessageOrchestratorService (FSM + IA)
                                                          │
              ┌───────────────────────────────────────────┴──────────────────────┐
              ▼ (misma transacción Prisma)                                        ▼
 INSERT realtime_outbox_events (pending)                              INSERT outbox_events
   RealtimeNotifier.notifyCritical(tx, event)  ◄── OUTBOX TRANSACCIONAL:           (respuestas WhatsApp
   el evento SIEMPRE queda en la DB junto con el cambio de dominio.                 → /tasks/process-outbox)
              │
              ▼  Cloud Task POST /tasks/notifications  (o polling interno)
 RealtimeOutboxRelay.runCycle()  — claim con FOR UPDATE SKIP LOCKED,
   reintentos con backoff, dead-letter tras MAX_RETRIES, gauges de backlog
              │
              ▼  publish
 Pub/Sub topic "realtime-events"  (orderingKey = conversationId → orden por conversación)
              │
              ▼  push subscription (verifica OIDC contra PUBSUB_PUSH_*)
 Cloud Run API: POST /pubsub/realtime ──► RealtimeApiSubscriber.handleEvent
              │   (dedupe LRU de eventId, TTL 60s — cubre redelivery de Pub/Sub)
              ▼
 WebsocketGatewayService.emitRealtimeEvent()
              │
              ├──► io.of('/admin').to('conversation:<id>').emit(...)   ─┐
              │                                                          │ @socket.io/gcp-pubsub-adapter
              └──► io.of('/admin').emit('admin.notification', ...)     │ fan-out a TODAS las réplicas
                                                                         ▼
                                              sockets conectados a CUALQUIER instancia de Cloud Run
```

Flujos auxiliares en producción:

- **Typing (efímero)**: no pasa por outbox. `MessageOrchestratorService` llama
`RealtimeNotifier.notifyEphemeral` → publica directo al topic `realtime-events`
(contract `RealtimeEphemeralEvent`). Pérdida tolerada por diseño.
- **AI streaming**: topic separado `ai-stream` (`AIStreamPubSubPublisher`), push a
`POST /pubsub/ai-stream` → `gateway.emitAiStreamChunk/Done` → room
`conversation:<id>`. Orden por `orderingKey = conversationId`.
- **El eventBus de typing SIEMPRE se bindea** (bindEventUsa
`eventBus.on('conversation.typing')` sin flag): en prod el orquestador corre en el
worker, donde no hay gateway, así que ese emit cae en el vacío y solo llega la vía
Pub/Sub. En dev ocurre al revés (solo llega la vía eventBus, porque
`notifyEphemeral` sin transport es no-op). Un solo mecanismo activo por entorno, sin
duplicar entrega.

### Respuestas explícitas al cuestionario (modo producción)

| Pregunta               | Respuesta                                                                                                                                      |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| ¿Quién emite?          | El **worker** (orquestador dentro de `InboxProcessorService`, invocado por Cloud Tasks). Escribe en la misma transacción de dominio.           |
| ¿Cómo se encola?       | `realtime_outbox_events` (Postgres, transaccional) + Cloud Tasks como dispatcher (`/tasks/notifications` también existe para procesar por id). |
| ¿Quién procesa?        | `RealtimeOutboxRelay` (worker) — claim atómico, `stalePublishingTimeout` 300s, dead-letter con `lastError` auditable.                          |
| ¿Transporte al WS?     | **Pub/Sub → push HTTP → 1 instancia API → adapter de socket.io → fan-out a todas las réplicas.**                                               |
| ¿Cloud Run soporta WS? | Sí (concurrently con HTTP en el mismo puerto 8080). No se necesita session affinity para el fan-out: el adapter replica los `emit`.            |
| ¿Sticky sessions?      | No. Socket.io se conecta a cualquier instancia; los emits de room cruzan réplicas por Pub/Sub.                                                 |
| ¿Auth de sockets?      | Igual que local (JWT handshake) + verificación OIDC de las push subscriptions (`createPubSubPushAuthMiddleware`).                              |

---

## 3. Inventario de archivos y responsabilidades

### Backend — bootstrap y configuración

| Archivo                            | Responsabilidad                                                                                                                                                                                                                                                                                  | Dependencias clave                                                              |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `backend/src/server.ts`            | Entry point de la **API**. Crea el HTTP server, monta Express, crea el **gateway WS** (línea 163, solo si `WS_ENABLED`), crea el **RealtimeApiSubscriber** (durable), monta `/pubsub/`* con middleware OIDC, shutdown limpio.                                                                    | express, socket.io (vía gateway), Prisma, `@google-cloud/pubsub`                |
| `backend/src/worker.ts`            | Entry point del **worker**. Instancia inbox/outbox processors, OCR, exports, `RealtimeNotifier` + `PubSubRealtimeTransport` (solo durable) y el **relay** del outbox realtime. Expone la app de health/tasks.                                                                                    | Prisma, `@google-cloud/pubsub`, `@google-cloud/tasks` (dispatcher)              |
| `backend/src/worker-app.ts`        | Express del worker: `/healthz`, `/ready` y **rutas de Cloud Tasks** `/tasks/process-inbox`, `/tasks/process-outbox`, `/tasks/process-ocr`, `/tasks/notifications`, `/tasks/export`, `/tasks/reconcile`. Semántica de reintentos: 2xx mata la tarea (aunque sea error permanente), 5xx reintenta. | express, zod                                                                    |
| `backend/src/config/env.config.ts` | Schema Zod de TODAS las variables. Bands: `REALTIME_DURABLE_ENABLED` (default **true**), `SOCKETIO_PUBSUB_ADAPTER_ENABLED` (default false), `BACKGROUND_EXECUTION_BACKEND` (`polling`                                                                                                            | `cloud_tasks`), `INBOX/OUTBOX_POLLING_ENABLED`, WS_*, JWT secrets (requeridos). | zod, dotenv |

### Backend — realtime (el corazón)

| Archivo                                                                                                  | Responsabilidad                                                                                                                                                                                                          |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `backend/src/services/realtime/websocket-gateway.service.ts`                                             | **El servidor WebSocket**. Namespace `/admin`, middleware de auth JWT, rooms, presencia, `emitRealtimeEvent` (durable/efímero), puente legacy eventBus, factory `create()` que arma el adapter Pub/Sub de socket.io.     |
| `backend/src/services/realtime/realtime-notifier.service.ts`                                             | **El productor**. `notifyCritical(tx, event)` inserta en `realtime_outbox_events` DENTRO de la transacción de dominio (garantía at-least-once). `notifyEphemeral` publica directo a Pub/Sub.                             |
| `backend/src/services/realtime/realtime-outbox-relay.service.ts`                                         | **El consumidor de la cola realtime** (en el worker). Claim `FOR UPDATE SKIP LOCKED`, reintentos con backoff fijo (`QUEUE_CONFIG`), dead-letter, métricas de backlog. También procesa por id vía `/tasks/notifications`. |
| `backend/src/services/realtime/pubsub-realtime-transport.service.ts`                                     | Publica eventos al topic `realtime-events` con `orderingKey=conversationId`. Implementa `RealtimeTransport`.                                                                                                             |
| `backend/src/services/realtime/realtime-api-subscriber.service.ts`                                       | Lado API: recibe eventos de `/pubsub/realtime`, dedup LRU (TTL 60s), delega al gateway.                                                                                                                                  |
| `backend/src/services/realtime/realtime-event.contracts.ts`                                              | **Contratos Zod** de eventos durable/efímero (`RealtimeDurableEventSchema`: eventId, correlationId, schemaVersion, socketEventName, patches…). Fuente de verdad del schema del evento.                                   |
| `backend/src/services/realtime/realtime-runtime.factory.ts`                                              | Decide qué runtime se arma según flags (subscriber en API, relay en worker). Centraliza los guards arrancables en tests.                                                                                                 |
| `backend/src/services/realtime/ai-stream-pubsub.service.ts`                                              | Publisher del streaming de IA al topic `ai-stream`.                                                                                                                                                                      |
| `backend/src/services/realtime/socket-subscribe-auth.ts`                                                 | `canSubscribeToConversation` — autorización DB para unirse a un room.                                                                                                                                                    |
| `backend/src/services/realtime/pubsub.util.ts`                                                           | Cliente Pub/Sub compartido, `ensureTopicOnce`, `publishJsonMessage`.                                                                                                                                                     |
| `backend/src/routes/pubsub.routes.ts`                                                                    | Endpoints push: `POST /pubsub/realtime` y `POST /pubsub/ai-stream`. Decodifica el envelope base64 de Pub/Sub, valida con Zod.                                                                                            |
| `backend/src/middlewares/pubsub-push-auth.middleware.ts`                                                 | Verificación OIDC de las push (audiencia + service account). En producción es requerido.                                                                                                                                 |
| `backend/src/services/events/event-bus.service.ts`                                                       | EventEmitter tipado — **solo ruta legacy dev**.                                                                                                                                                                          |
| `backend/src/services/events/inbox-processor.service.ts`                                                 | Cola inbound: dedupe wamid, claims con lease de 5 min, batching opcional, invoca orquestador.                                                                                                                            |
| `backend/src/services/events/outbox-processor.service.ts`                                                | Cola outbound WhatsApp: `idempotencyKey` único, envía vía `WhatsAppProvider`.                                                                                                                                            |
| `backend/src/services/tasks/cloud-tasks-dispatcher.service.ts` + `background-task-reconciler.service.ts` | En `cloud_tasks` mode: despacha tareas a la cola y **re-despacha pendientes al arrancar la API** (reconciliación de arranque).                                                                                           |
| `backend/src/services/realtime/realtime-observability.service.ts`                                        | Métricas (`RealtimeMetrics`) + logs estructurados de frontera (`logRealtimeBoundary` — busca `relay.publish`, `subscriber.receive`, `gateway.emit`, `outbox.write`).                                                     |

### Frontend

| Archivo                                                                                                                         | Responsabilidad                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `frontend/lib/shared/realtime/realtime-manager.ts`                                                                                     | **El cliente WS**. `io(WS_URL + '/admin')`, autoConnect off, reconnection Infinity, auth callback dinámico (token fresco en cada reconexión), dedupe LRU de eventIds, resubscribe de rooms, toasts, eventos de ventana (online/visibility/token refrescado). |
| `frontend/lib/shared/realtime/types.ts`                                                                                                | Guards de payload (`isDurableEventPayload`, etc.).                                                                                                                                                                                                           |
| `frontend/lib/shared/realtime/event-router.ts` + `realtime-user-events.ts`                                                             | Dispatch a consumidores + eventos semánticos derivados (`NUEVO_TICKET`, …).                                                                                                                                                                                  |
| `frontend/store/shared/use-connection-store.ts` / `use-subscription-store.ts` / `use-notification-store.ts` / `use-presence-store.ts` | Estado zustand: conexión, rooms activos, notificaciones (EN MEMORIA), presencia.                                                                                                                                                                             |
| `frontend/hooks/conversaciones/useConversationThread.ts` (+ hermanos)                                                                          | Patrón **"replay-vía-REST"**: al transicionar de desconectado→conectado, re-ejecuta los fetch de conversación/mensajes (líneas 92-101).                                                                                                                      |
| `frontend/lib/shared/realtime/sound-player.ts`, `hooks/useRealtimeSounds.ts`                                                           | Sonidos + notificaciones de escritorio.                                                                                                                                                                                                                      |

### Infraestructura / configuración

| Archivo                                        | Qué define                                                                                                                                        |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docker-compose.dev.yml`                       | Dev: API con WS + recepción de push, worker con inbox+outbox, `realtime-relay`, Postgres, frontend y **emulador de Pub/Sub** (`pubsub-emulator` + `pubsub-init`). Durable ON por defecto. Worker escucha en `PORT` (8000; ver §6 #3). |
| `.qa.yml` / `.prod.yml`                        | Mismos servicios con `REALTIME_DURABLE_ENABLED=true` contra Pub/Sub real. |
| `docs/deploy/deploy-gcp.yml`             | Deploy real a Cloud Run (API pública con WS + adapter ON; worker privado con `/tasks/*`), Cloud SQL, migrator como Cloud Run Job.                 |
| `.env` / `backend/.env` / `frontend/.env`      | Ver tabla de §4. Frontend usa `NEXT_PUBLIC_WS_URL` (el deploy lo setea al mismo origin de la API).                                                |

---

## 4. Comparativa Local vs Producción

| Dimensión                      | Local (docker-compose.dev.yml)                                                                       | Producción (Cloud Run, deploy-gcp.yml)                                                                               | Riesgo / Brecha                                                                                              |
| ------------------------------ | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Cola de eventos                | Tablas Postgres + polling (2s/1s) en API y worker                                                    | Mismas tablas + **Cloud Tasks** como dispatcher (`BACKGROUND_EXECUTION_BACKEND=cloud_tasks`)                         | Bajo: mismo código, distinta configuración. El reconciler cubre tareas perdidas al arrancar.                 |
| Transporte realtime→WS         | **Pub/Sub emulador** + push a `/pubsub/realtime` (durable por defecto); eventBus in-process solo con `REALTIME_DURABLE_ENABLED=false` | **Pub/Sub** topic `realtime-events` + push OIDC a `/pubsub/realtime`                                                 | ✅ REDUCIDO: dev ejercita la misma ruta de código por defecto (falta OIDC real, cubierto por el bypass fuera de prod). |
| WebSocket                      | socket.io en la API + `@socket.io/gcp-pubsub-adapter` contra el emulador                              | socket.io + `@socket.io/gcp-pubsub-adapter` fan-out multi-réplica                                                    | ✅ REDUCIDO: el adapter se ejercita en dev (aunque con 1 instancia el fan-out no se estresa).                |
| Escalado horizontal            | N/A (1 instancia por servicio)                                                                       | Cualquier réplica recibe el push y el emit llega a todas                                                             | Cubierto por diseño (ver §5).                                                                                |
| Auth de sockets                | JWT access en handshake                                                                              | Ídem + OIDC en push de Pub/Sub                                                                                       | OK. Nota: `CORS_ORIGIN` default `*`; prod lo fija al dominio del frontend.                                   |
| Persistencia de notificaciones | `realtime_outbox_events` persistido (durable por defecto); `admin.notification` sigue viviendo solo en memoria del navegador | Outbox transaccional persistido + dead-letter; pero el **centro de notificaciones del cliente sigue siendo memoria** | ⚠️ ALTO: no hay "catch-up" del centro de notificaciones al reconectar (solo de conversaciones vía REST).      |
| Fallos / reintentos            | Polling reintenta indefinidamente (claim por status)                                                 | Cloud Tasks reintentos + dead-letter; relay con backoff y dead-letter en tabla                                       | OK, bien resuelto.                                                                                           |
| Observabilidad                 | `logRealtimeBoundary` (JSON en logs de compose)                                                      | Mismos logs → Cloud Logging; `RealtimeMetrics` (counters/histograms/gauges)                                          | ⚠️ MEDIO: verificar que los custom metrics se exporten a Cloud Monitoring (pendiente de revisión, ver §11).   |
| Variables env                  | `REALTIME_DURABLE_ENABLED=true`, adapter ON, `PUBSUB_EMULATOR_HOST` seteado, polling ON (worker) | `REALTIME_DURABLE_ENABLED=true`, adapter ON, cloud_tasks ON, `PUBSUB_PUSH_*` requeridos                              | Reducida: dev replica la ruta durable; resta la diferencia de dispatcher (polling vs Cloud Tasks) y OIDC.  |
| IA streaming                   | Topic `ai-stream` en el emulador                                                                     | Topic `ai-stream` + push `/pubsub/ai-stream`                                                                         | ✅ REDUCIDO: la experiencia de streaming ya es reproducible en dev.                                          |

Variables de entorno clave del realtime (fuente: `env.config.ts`):

```text
WS_ENABLED, WS_PATH, WS_CORS_ORIGIN
SOCKETIO_PUBSUB_ADAPTER_ENABLED, SOCKETIO_PUBSUB_TOPIC, SOCKETIO_PUBSUB_SUBSCRIPTION_PREFIX
REALTIME_DURABLE_ENABLED
BACKGROUND_EXECUTION_BACKEND (polling | cloud_tasks)
INBOX_POLLING_ENABLED, OUTBOX_POLLING_ENABLED, INBOX_POLL_INTERVAL_MS, OUTBOX_POLL_INTERVAL_MS
PUBSUB_PUSH_AUDIENCE, PUBSUB_PUSH_SERVICE_ACCOUNT_EMAIL
GCP_PROJECT_ID, GCP_LOCATION, TASKS_QUEUE_NAME, WORKER_SERVICE_URL, TASKS_SERVICE_ACCOUNT_EMAIL
NEXT_PUBLIC_WS_ENABLED, NEXT_PUBLIC_WS_URL, NEXT_PUBLIC_WS_PATH (frontend)
```

---

## 5. El punto crítico: múltiples instancias en Cloud Run

**Problema**: N instancias de la API, cada una con sus sockets. Un evento llega por
push a UNA instancia. Si el `emit` fuera local, solo los clientes conectados a esa
instancia lo recibirían.

**Solución ya implementada** (la correcta para socket.io en GCP):

```text
                        ┌── réplica 1: sockets A, B ──┐
Pub/Sub push ──► réplica 2 (recibe el emit)            │ @socket.io/gcp-pubsub-adapter
                        └── réplica 3: sockets C ──────┘
                             topic "socketio-adapter": el adapter replica la operación
                             de room/emit a TODAS las réplicas suscritas.
```

- El adapter se activa con `SOCKETIO_PUBSUB_ADAPTER_ENABLED=true` (solo prod).
- Cada réplica crea su subscription con prefijo `socket.io` y recibe las emisiones de
las demás. `waitForAdapterInit` (gateway) bloquea el arranque hasta inicializar.
- El push de eventos de negocio (`/pubsub/realtime`) va a una réplica cualquiera, y el
adapter se encarga del fan-out. **No importa a qué instancia está conectado el
cliente.**
- Orden: el topic `realtime-events` publica con `orderingKey = conversationId`, así
que los mensajes de una misma conversación llegan en orden. El ordering debe estar
habilitado en el topic/subscription (verificar en GCP, §11).

**Riesgos residuales de este diseño**:

1. **Presencia**: el `Map<userId, count>` es por instancia. Funciona (los emits hacen
  fan-out), pero "quién está online" es la unión de N mapas y la detección de
   `offline` depende de que la instancia origen vea el `disconnect`.
2. `admin.notification`: se emite a todo el namespace `/admin` (broadcast a TODOS
  los admins conectados), no a un room de usuario. Si en el futuro hay miles de
   admins, este broadcast escala mal y filtra metadatos a todos.
3. **Efímeros** (typing) no tienen outbox: si todas las réplicas están reiniciándose
  justo en ese instante, se pierde. Aceptable.

---

## 6. Antipatrones y riesgos actuales

| #   | Hallazgo                                                                                                                                                                                                                                                      | Severidad         | Impacto                                                                                  | Mitigación recomendada                                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | ~~**Divergencia de rutas dev/prod**~~ **Resuelto por default**: `docker-compose.dev.yml` ahora corre `REALTIME_DURABLE_ENABLED=true` contra el emulador de Pub/Sub, así que la ruta crítica de producción **sí** se ejecuta en desarrollo. El camino legacy queda como opt-in.                                                                   | **Alta → Resuelto**          | Bugs de schema/claim/ordering ya se pueden reproducir en local.                     | Se mantiene: no volver a `REALTIME_DURABLE_ENABLED=false` salvo para depurar el puente in-process. |
| 2   | **Centro de notificaciones no persistido**: `admin.notification` se guarda solo en `useNotificationStore` (memoria). Offline o F5 = notificaciones perdidas; no hay `GET /notifications?since=`.                                                              | **Alta**          | Usuario pierde avisos de mensajes/handover; auditoría imposible.                         | Persistir notificaciones en Postgres (o derivar de `realtime_outbox_events`) + endpoint de catch-up llamado al reconectar.                                                                |
| 3   | **Trampa de puerto en el worker (falso positivo del análisis inicial)**: `worker.ts:117` usa `PORT` si está definido; `backend/.env` define `PORT=8000`, así que el worker de dev escucha en 8000 y el healthcheck a `:8000/healthz` es **correcto**. `WORKER_HEALTH_PORT` (8010) solo aplicaría si `PORT` no existiera. | Baja (documental) | Confusión al diagnosticar; quien "corrija" el healthcheck a 8010 lo rompe de verdad.      | Documentar la precedencia `PORT > WORKER_HEALTH_PORT` en `backend/.env.example`. No tocar el compose.                                                                                      |
| 4   | **Dualidad de emisión typing**: `message-orchestrator.service.ts` llama `notifyEphemeral` (Pub/Sub) Y `eventBus.emit('conversation.typing')` (in-process). Es correcta pero frágil: si el orquestador migra de proceso, la vía eventBus queda muda sin error. | Media             | Confusión al depurar; riesgo de doble-entrega si ambos caminos activan a la vez.         | Comentar el contrato; idealmente derivar la vía de un solo punto (`RealtimeNotifier.notifyEphemeral` con fallback).                                                                       |
| 5   | **Pin del adapter**: `@socket.io/gcp-pubsub-adapter` tipa contra `@google-cloud/pubsub` v4 y el proyecto usa v6 (cast `as never` en `buildSocketIoAdapter`).                                                                                                  | Media             | Rotura silenciosa ante upgrades de pubsub.                                               | Test de integración del fan-out + issue/upgrade del adapter; lockear versión.                                                                                                             |
| 6   | **Acoplamiento orquestador↔gateway en dev**: el puente legacy exige que inbox polling y WS vivan en el mismo proceso (por eso la API hace inbox en dev). Invertir las flags rompe el realtime sin ningún error visible.                                       | Media             | Configuración con foot-guns; ya documentado en comentarios, pero nada lo valida.         | Test de smoke de arranque que afirme: "si `WS_ENABLED && !REALTIME_DURABLE_ENABLED`, entonces `INBOX_POLLING_ENABLED` debe ser true en la API".                                           |
| 7   | **Idempotencia**: sólida en general (wamid, idempotencyKey, claims condicionales, dedupe LRU en subscriber y cliente), pero el dedupe del cliente (LRU 500) **se limpia en cada reconexión** y el de la API (TTL 60s) es por-instancia.                       | Baja              | Redelivery de Pub/Sub tras reconexión puede duplicar en UI; el refetch REST lo disimula. | Correcto en la práctica por el replay-vía-REST; documentarlo.                                                                                                                             |
| 8   | **Race conditions**: claims con `FOR UPDATE SKIP LOCKED` + `updateMany` condicional + lease FSM de 5 min + stale-publishing de 300s.                                                                                                                          | — (bien resuelto) | —                                                                                        | Nada urgente. Es el patrón correcto.                                                                                                                                                      |
| 9   | `FRONTEND_URL` **default** `http://localhost:5173` pero el frontend corre en 3000.                                                                                                                                                                            | Baja              | Links de email rotos en dev si no se setea.                                              | Ajustar default o documentar.                                                                                                                                                             |
| 10  | **Broadcast de presencia + notificaciones a namespace completo** (`namespace.emit`) crece O(usuarios × réplicas).                                                                                                                                             | Baja              | Ruido de red con mucha concurrencia.                                                     | Rooms por departamento/rol cuando escale.                                                                                                                                                 |
| 11  | **Contaminación dev→prod por Pub/Sub (verificado con gcloud)**: `realtime-events-push` y `ai-stream-push` apuntan a `https://api.nexo-comercial.example/pubsub/*`. Un dev con `REALTIME_DURABLE_ENABLED=true` y ADC del proyecto prod publica eventos que terminan emitidos en sockets de producción. | **Alta** (operacional) | Notificaciones con datos de dev visibles para admins reales.                         | **Mitigado por default**: `docker-compose.dev.yml` ahora usa el emulador de Pub/Sub (`PUBSUB_EMULATOR_HOST`, servicio `pubsub-emulator`) sin profile. Abrir el camino a GCP real solo si se fuerza `PUBSUB_EMULATOR_HOST=""` — no lo hagas. Ver §8. |

### Respuestas rápidas a las preguntas de fallas

- **¿Si cae el worker?** Dev: se pausan outbox de WhatsApp, OCR y exports; el realtime
sigue funcionando (inbox está en la API). Prod: Cloud Tasks retiene y reintenta las
tareas; el reconciler las re-despacha cuando algo arranca. Los eventos durable ya
commiteados esperan en la tabla.
- **¿Si cae una instancia de la API con sockets?** Los clientes reconectan (a cualquier
instancia), re-suscriben rooms y refrescan datos vía REST. Pub/Sub push reintenta
contra otra réplica hasta recibir 2xx. Se pierden solo efímeros de esa ventana.
- **¿El frontend reconecta?** Sí: `reconnectionAttempts: Infinity` + listeners de
`online`/`visibilitychange`/`vc:token-refreshed` + refresh de token ante
`connect_error` de auth.
- **¿Pide notificaciones perdidas?** Conversaciones sí (refetch REST al reconectar).
Centro de notificaciones NO (hallazgo #2).

---

## 7. Arquitectura recomendada para producción

**La arquitectura "ideal" pedida ya existe en el 90%.** No hace falta rediseñar; hace
falta **asegurarla y cerrar brechas**. Estado objetivo:

```text
┌────────────────────────── GCP ─────────────────────────────────────────────┐
│                                                                             │
│  Cloud Tasks (cola de trabajos diferidos/reintentables)                     │
│     └─► Cloud Run worker (privado, IAM/OIDC): /tasks/process-inbox,         │
│         /tasks/process-outbox, /tasks/process-ocr, /tasks/notifications     │
│                          │                                                  │
│                          ▼ mismo tx Prisma                                  │
│  Cloud SQL Postgres: inbox_events, outbox_events, realtime_outbox_events    │
│                          │ (relay: claim → publish)                        │
│                          ▼                                                  │
│  Pub/Sub topics: "realtime-events" (ordering por conversación),             │
│                  "ai-stream", "socketio-adapter"                             │
│                          │ push (OIDC)            │ (adapter fan-out)       │
│                          ▼                       ▼                         │
│  Cloud Run API (público, N réplicas): POST /pubsub/realtime → gateway        │
│     socket.io /admin + @socket.io/gcp-pubsub-adapter → todas las réplicas   │
│                          │                                                  │
│                          ▼                                                  │
│  Frontend (Cloud Run/CDN): RealtimeManager → replay-vía-REST al reconectar  │
└─────────────────────────────────────────────────────────────────────────────┘
```

Componentes y rol:

| Componente GCP              | Rol                                                               |
| --------------------------- | ----------------------------------------------------------------- |
| Cloud Run (API)             | HTTP + WebSocket + receptor de push Pub/Sub (OIDC)                |
| Cloud Run (worker, privado) | Procesamiento de colas invocado por Cloud Tasks                   |
| Cloud Tasks                 | Diferido + reintentos + dead-letter de trabajos                   |
| Pub/Sub `realtime-events`   | Fan-out de eventos durable (ordering por conversationId)          |
| Pub/Sub `socketio-adapter`  | Réplica de emits/rooms de socket.io entre instancias              |
| Pub/Sub `ai-stream`         | Streaming de IA a dashboards                                      |
| Cloud SQL Postgres          | Colas transaccionales + persistencia + auditoría                  |
| Memorystore (Redis)         | **No se necesita** con este diseño; la paridad local no lo exige. |

Diferencias mínimas con local (filosofía del repo: **mismo código, distinta config**):

| Se mantiene igual                                                                 | Cambia solo por env vars                                                                                                                       |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Gateway socket.io, contratos Zod, RealtimeNotifier, relay, subscriber, cliente WS | `REALTIME_DURABLE_ENABLED`, `BACKGROUND_EXECUTION_BACKEND`, `SOCKETIO_PUBSUB_ADAPTER_ENABLED`, `PUBSUB_PUSH_*`, `INBOX/OUTBOX_POLLING_ENABLED` |

Para cerrar (agregados al checklist §8): persistencia del centro de notificaciones,
catch-up al reconectar, entorno de paridad durable local (Pub/Sub emulator o ADC),
tests de fan-out del adapter.

---

## 8. Plan de comprensión paso a paso (para ti)

### Workflow diario para retomar el desarrollo

```bash
# 1. Loop diario (durable + emulador, cero GCP, hot-reload):
docker compose -f docker-compose.dev.yml up -d

# 2. Si necesitás el camino legacy in-process (depurar el puente eventBus):
REALTIME_DURABLE_ENABLED=false docker compose -f docker-compose.dev.yml up -d

# 3. Volver al default durable:
docker compose -f docker-compose.dev.yml up -d
```

Reglas:

- **dev durable = default**: corre la MISMA ruta de código que Cloud Run, contra el
  emulador local de Pub/Sub (`pubsub-emulator`), sin dependencia de GCP.
- **dev legacy = opt-in** (`REALTIME_DURABLE_ENABLED=false`): útil solo para depurar el
  puente in-process; no es el camino de producción.
- Nunca apuntes `PUBSUB_EMULATOR_HOST` a vacío con durable activo sin querer: publicaría
  contra los topics reales de GCP (contaminación dev→prod, hallazgo §6 #11).
- Las colas son tablas: `psql` es tu inspector de colas
  (`SELECT status, count(*) FROM realtime_outbox_events GROUP BY 1`).
- Tras cambiar el schema Prisma: `pnpm prisma migrate dev` + `pnpm prisma generate`
  en el contenedor **y** en el host (los `node_modules` son independientes).
- **Instancia limpia (después de limpiar Docker / borrar el volumen)**: el migrator
  recrea el schema al levantar, pero el seed es manual y en dos pasos:
  `docker compose -f docker-compose.dev.yml exec api pnpm prisma:seed` (roles,
  departamentos) **y después** `pnpm prisma:seed:dev` (superadmin — requiere los
  roles del paso anterior). Sin ambos, el login devuelve 401.

### Orden de lectura sugerido

1. `backend/src/config/env.config.ts` — mapa de flags. Lee las bandas `REALTIME_*`, `BACKGROUND_*`, `SOCKETIO_*` con sus comentarios.
2. `docker-compose.dev.yml` — quién corre qué en dev y por qué (los comentarios lo explican).
3. `backend/src/server.ts` — dónde nace el gateway y el subscriber (líneas 129–199).
4. `backend/src/services/realtime/websocket-gateway.service.ts` — el corazón: auth (línea 72), rooms (161–214), emisiones (281–411), factory + adapter (435–515).
5. `backend/src/services/realtime/realtime-event.contracts.ts` — la forma exacta de un evento durable.
6. `backend/src/services/realtime/realtime-notifier.service.ts` (productor) → `realtime-outbox-relay.service.ts` (consumidor) → `pubsub-realtime-transport.service.ts` (transporte) → `realtime-api-subscriber.service.ts` (receptor API).
7. `backend/src/routes/pubsub.routes.ts` + `middlewares/pubsub-push-auth.middleware.ts` — la frontera HTTP con Pub/Sub.
8. `backend/src/worker.ts` + `worker-app.ts` — el otro proceso.
9. `backend/src/services/events/inbox-processor.service.ts` y `outbox-processor.service.ts` — las colas Postgres.
10. Frontend: `frontend/lib/shared/realtime/realtime-manager.ts` → stores → `frontend/hooks/conversaciones/useConversationThread.ts` (patrón replay-vía-REST).
11. `docs/deploy/deploy-gcp.yml` — qué config corre realmente en prod.

### Comandos de inspección en vivo

```bash
# Estado general
docker compose -f docker-compose.dev.yml ps
docker compose -f docker-compose.dev.yml stats

# Traza el flujo realtime (los logs de frontera son JSON con campos fijos)
docker compose -f docker-compose.dev.yml logs -f api | grep -E "gateway.emit|outbox.write|subscriber.receive"
docker compose -f docker-compose.dev.yml logs -f worker | grep -E "relay.publish|outbox.enqueued|inbox.enqueued"

# Estado de las "colas" en Postgres
docker compose -f docker-compose.dev.yml exec postgres \
  psql -U nexo -d nexocomercial -c \
  "SELECT status, count(*) FROM realtime_outbox_events GROUP BY status;"

# Explorar dentro de un contenedor
docker compose -f docker-compose.dev.yml exec api sh
docker compose -f docker-compose.dev.yml logs api --since 5m | tail -50
```

### Simular un evento y verlo recorrer todo (dev)

1. Abre el admin en el navegador con DevTools → Network → WS → selecciona el frame de `socket.io` (pestaña Messages): ahí ves handshake, `socket.ready`, rooms y cada evento entrante.
2. **Camino de negocio completo**: manda un mensaje saliente desde la UI admin → `MessageService` → `eventBus` → `conversation.message.new` en el frame WS.
3. **Camino inbound**: si tenés sandbox de Meta, envía un WhatsApp de prueba al número configurado → webhook → inbox → orquestador → socket.
4. **Inyectar directo un evento durable** (solo con `REALTIME_DURABLE_ENABLED=true`): inserta una fila en `realtime_outbox_events` con un payload que cumpla `RealtimeDurableEventSchema` y mira `relay.claim → publish` en logs del worker y `subscriber.receive → gateway.emit` en la API.

   > ⚠️ **ANTES de activar durable en dev**: sin aislamiento, el relay publica al
   > topic REAL del proyecto ADC (`<GCP_PROJECT_ID>`), cuyas push subscriptions
   > apuntan a la API de producción (hallazgo §6 #11). Usá el ejercicio de paridad
   > aislado de abajo (emulator + curl), ya soportado por el compose.
5. **Probar el push a mano**:

```bash
# Envelope de Pub/Sub push (data = base64 del JSON)
PAYLOAD=$(echo '{"message":{"data":"'"$(echo -n '{...evento durable valido...}' | base64)"'"}}' )
curl -X POST http://localhost:8000/pubsub/realtime -H 'Content-Type: application/json' -d "$PAYLOAD"
```

### Ejercicio de paridad durable (dev, aislado — elegido: emulator + curl)

Ya **no es un modo aparte**: `docker-compose.dev.yml` default corre contra el servicio
`pubsub-emulator` (siempre activo, sin `--profile`) con `PUBSUB_EMULATOR_HOST` y
`GOOGLE_CLOUD_PROJECT` seteados en `api` y `worker`, más `pubsub-init` (crea los topics
`realtime-events`/`ai-stream` y la push subscription `realtime-events-push`) y
`realtime-relay`. Cero contacto con GCP real.

```bash
# 1. Levantar dev (durable + emulator por defecto, cero contacto con GCP real):
docker compose -f docker-compose.dev.yml up -d
```

> ⚠️ **Gotcha del emulator**: contra GCP real el cliente resuelve el proyecto por ADC;
> contra el emulator NO hay ADC y el proyecto debe ir explícito en `GOOGLE_CLOUD_PROJECT`.
> Sin él, el publish revienta con "cannot connect to Cloud Services without a project
> ID" — y esa promesa escapa al catch del relay → `unhandledRejection` → el worker
> muere (`process.exit(1)`). La fila queda `publishing` hasta que el stale-lock de
> 300s la libere y otro ciclo la recupere (demostración involuntaria de at-least-once).
>
> ⚠️ **Gotcha del push en dev**: `backend/.env` puede traer los `PUBSUB_PUSH_*` de
> producción (audience de `api.nexo-comercial.example`), lo que activa la verificación
> OIDC también en dev y rechaza el curl con 401. El compose dev los pisa a vacío
> (verificación omitida fuera de production, middleware línea 57). Ese mismo 401 que
> estorba en dev es lo que en prod impide que cualquiera inyecte eventos falsos.

# 2. Confirmar modo durable en la API:
docker compose -f docker-compose.dev.yml logs api | grep Realtime

# 3. Ver el relay en acción (worker): reclama filas del outbox y publica al emulator:
docker compose -f docker-compose.dev.yml logs -f worker | grep -E "relay.claim|relay.publish"

# 4. Insertar un evento durable de prueba con psql (payload = RealtimeDurableEventSchema)
#    y verlo pasar relay.claim → relay.publish en los logs del worker.

# 5. Simular la pierna de push (lo que en prod hace la push subscription):
PAYLOAD=$(echo '{"message":{"data":"'"$(echo -n '<evento durable JSON>' | base64)"'"}}')
curl -X POST http://localhost:8000/pubsub/realtime -H 'Content-Type: application/json' -d "$PAYLOAD"

# 6. Confirmar en la API: subscriber.receive → subscriber.emit → gateway.emit, y en
#    DevTools → Network → WS el evento llegando al socket del admin.
```

Qué valida este ejercicio: la MISMA ruta de código de producción (outbox transaccional
→ relay → publish → push → subscriber → gateway → rooms). Qué NO valida: la mecánica
propia de GCP (OIDC del push, reintentos de entrega, ordering real del topic, adapter
multi-réplica).

### Breakpoints / console.log estratégicos (temporales)

| Punto                                           | Qué vas a ver                                   |
| ----------------------------------------------- | ----------------------------------------------- |
| `WebsocketGatewayService.emitRealtimeEvent`     | Todo lo que llega al gateway y a qué room va.   |
| `RealtimeApiSubscriber.handleEvent`             | Frontera push→socket (y el dedupe actuando).    |
| `RealtimeNotifier.notifyCritical`               | La escritura outbox DENTRO de la tx de dominio. |
| `RealtimeOutboxRelay.claimBatch` / `processRow` | El claim atómico y el publish.                  |
| `InboxProcessorService.processEventById`        | Entrada del orquestador.                        |
| `RealtimeManager.bindSocketEvents` (frontend)   | Todo lo que recibe el cliente.                  |

### Herramientas

- **Chrome DevTools → Network → WS**: imprescindible; filtra por `socket.io`.
- **Postman/curl**: para webhooks y push de Pub/Sub simulados.
- `websocat`: cliente WS por consola (útil para probar auth con un token manual).
- **psql**: las tablas SON la cola; el estado de un evento es consultable con SQL.

---

## 9. Checklist de continuidad (priorizado por impacto vs esfuerzo)

```markdown
### Alta prioridad (alto impacto, bajo esfuerzo)
- [ ] Documentar la precedencia de puertos del worker (PORT > WORKER_HEALTH_PORT, worker.ts:117) en backend/.env.example y docs/CLOUD_TASKS_WORKER.md
- [x] Correr el ejercicio de paridad durable de §8 — HECHO: ahora es el default de `docker-compose.dev.yml` (`REALTIME_DURABLE_ENABLED=true` + `pubsub-emulator` siempre activo, sin profile)
- [ ] Guardar este documento como referencia viva (docs/notifications-architecture.md) y enlazarlo desde ARQUITECTURA.md
- [ ] Documentar los topics/subscriptions de Pub/Sub requeridos (realtime-events, ai-stream, socketio-adapter) y sus flags (enable_message_ordering) en docs/DEPLOYMENT_GCP.md
- [ ] Documentar el set de variables de realtime en .env.example de backend (REALTIME_*, SOCKETIO_*, PUBSUB_PUSH_*)

### Media prioridad (alto impacto, esfuerzo medio)
- [x] Persistir notificaciones del centro de notificaciones — HECHO: tabla `notifications` (proyección idempotente por eventId en el subscriber), `GET /api/v1/admin/notifications?since=` y catch-up en `RealtimeManager` al reconectar (seed sin toasts la primera vez, delta con toasts)
- [x] Agregar test de integración del fan-out del adapter (@socket.io/gcp-pubsub-adapter) para proteger el upgrade de @google-cloud/pubsub v6 — HECHO: `websocket-gateway.adapter.fanout.test.ts` con dos instancias reales contra el emulador (PUBSUB_EMULATOR_HOST); skippea sin emulador
- [x] Verificar exportación de RealtimeMetrics a Cloud Monitoring (realtime-observability.service.ts) — VERIFICADO: no exporta directo; resuelto con log-based metrics (métricas emitidas a nivel info → Cloud Logging + log-based metrics en GCP)
- [x] Test de smoke de arranque: WS_ENABLED && !REALTIME_DURABLE_ENABLED ⇒ INBOX_POLLING_ENABLED en API (evitar puente legacy mudo) — HECHO: `realtimeStartupHazards` en realtime-runtime.factory.ts con warn al arranque en server.ts
- [ ] Tests E2E de reconexión: dedupe + resubscribe + refetch REST (los hooks ya tienen tests de reconnect: extenderlos)

### Baja prioridad (pulido)
- [ ] Ajustar FRONTEND_URL default (5173 → 3000) o documentar
- [ ] Evaluar rooms por departamento/rol para admin.notification en vez de broadcast al namespace
- [ ] Revisar auditoria-redis.md y enlazar la decisión (Redis eliminado) desde este doc
```

---

## 10. Archivos que conviene pegar/compartir en una segunda iteración

Para profundizar (yo ya leí los listados como fuente de este análisis; esto es lo que
queda por ver para cerrar los pendientes):

1. `backend/src/services/realtime/realtime-observability.service.ts` — confirmar si las
  métricas se exportan a Cloud Monitoring o solo loguean.
2. `backend/src/services/tasks/cloud-tasks-dispatcher.service.ts` — ver la política de
  dispatch (queue config, OIDC target) para documentar la cola.
3. `backend/prisma/schema.prisma` (secciones `InboxEvent`, `OutboxEvent`,
  `RealtimeOutboxEvent`) — ya vista a nivel campos; falta revisar índices del claim.
4. Configuración real de los topics/subscriptions de Pub/Sub en GCP (gcloud describe)
  para verificar `enable_message_ordering`.
5. `frontend/lib/shared/realtime/types.ts` y `realtime-user-events.ts` — mapa completo de
  eventos que consume la UI.
6. `backend/src/services/message.service.ts` — productor de eventos cuando el admin
  envía mensajes (el otro origen de eventos, además del webhook).

---

*Generado a partir de: docker-compose.{dev,qa,prod}.yml, backend/src/{server,worker,worker-app}.ts,
backend/src/config/env.config.ts, backend/src/services/realtime/*, backend/src/services/events/*,
backend/src/routes/pubsub.routes.ts, frontend/lib/realtime/*, frontend/hooks/conversaciones/useConversationThread.ts,
docs/deploy/deploy-gcp.yml, backend/prisma/schema.prisma.*
