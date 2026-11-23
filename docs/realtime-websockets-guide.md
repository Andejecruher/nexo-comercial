# WebSockets en tiempo real — Dev local y GCP

> **Guía de referencia para el equipo.** Cubre fundamentos del protocolo, comportamiento en el entorno de desarrollo local, arquitectura en GCP (Cloud Run + Pub/Sub) y el flujo aplicado al sistema de notificaciones de Nexo Comercial.
>
> **Stack real del proyecto:** Node.js + Express + **Socket.IO** en el backend (`backend/src/services/realtime/websocket-gateway.service.ts`), Next.js + `socket.io-client` en el frontend (`frontend/lib/realtime/realtime-manager.ts`), y **`@socket.io/gcp-pubsub-adapter`** como broker entre instancias de Cloud Run (no Redis).

---

## Índice

1. [Fundamentos de WebSockets](#1-fundamentos-de-websockets)
2. [Funcionamiento en entorno de desarrollo (dev)](#2-funcionamiento-en-entorno-de-desarrollo-dev)
3. [Arquitectura y funcionamiento en GCP](#3-arquitectura-y-funcionamiento-en-gcp)
4. [Flujo aplicado al sistema de notificaciones](#4-flujo-aplicado-al-sistema-de-notificaciones)
5. [Cheat sheet — Dev vs GCP](#5-cheat-sheet--dev-vs-gcp)

---

## 1. Fundamentos de WebSockets

### 1.1 ¿Qué es un WebSocket?

WebSocket es un protocolo de comunicación full-duplex sobre una **única conexión TCP persistente**, estandarizado en [RFC 6455](https://www.rfc-editor.org/rfc/rfc6455). A diferencia de HTTP, donde cada mensaje requiere una petición nueva con request/response, una vez establecido el WebSocket el servidor y el cliente pueden enviarse mensajes en cualquier momento sin volver a negociar la conexión.

### 1.2 Ciclo de vida de una conexión

```text
Cliente                                Servidor
  |                                      |
  |  HTTP GET /socket.io/?... + Upgrade   |
  |  Headers: Connection: Upgrade,        |
  |           Upgrade: websocket,         |
  |           Sec-WebSocket-Key: <rand>   |
  | ────────────────────────────────────> |
  |                                       |  Verifica origen, auth, etc.
  |  HTTP 101 Switching Protocols        |
  |  Sec-WebSocket-Accept: <hash>        |
  | <──────────────────────────────────── |
  |                                       |
  |  ====== Conexión TCP persistente ======|
  |                                       |
  |  Frame WS (text/binary) ─────────────> |
  |  <─────────────────── Frame WS        |
  |  Frame WS (ping) ──────────────────>  |  keep-alive
  |  <─────────────────── Frame WS (pong) |
  |                                       |
  |  Close frame (code 1000/1001/...) ──> |  desconexión
  |  <─────────────────── Close frame     |
```

**Eventos clave (terminología Socket.IO, que es lo que usa el proyecto):**

| Evento          | Quién lo emite      | Significado                                                                  |
| --------------- | ------------------- | ---------------------------------------------------------------------------- |
| `connect`       | Socket.IO (cliente) | Handshake completado, conexión lista para enviar/recibir.                    |
| `message`       | Ambos               | Frame de datos entrante. En Socket.IO se reemplaza por eventos nominados.    |
| `disconnect`    | Ambos               | Cierre intencional o pérdida de TCP. Se dispara el flujo de reconexión.      |
| `connect_error` | Cliente             | Falló el handshake (auth, CORS, red). No reconecta si es error de auth puro. |
| `reconnect`     | Cliente             | Reconexión exitosa tras `disconnect`.                                        |

### 1.3 Diferencias frente a HTTP tradicional (para notificaciones)

| Aspecto              | Polling HTTP        | Long-Polling          | **WebSockets**          | Server-Sent Events (SSE) |
| -------------------- | ------------------- | --------------------- | ----------------------- | ------------------------ |
| Dirección            | Request/response    | Request/hold/response | **Full-duplex**         | Solo servidor → cliente  |
| Overhead por mensaje | Alto (headers HTTP) | Medio                 | **Bajo** (frame 2-10 B) | Medio                    |
| Latencia percibida   | Alta (sondeo)       | Media                 | **Baja (ms)**           | Baja                     |
| Persistencia TCP     | Nueva por request   | Nueva por long-poll   | **Única, persistente**  | Única, persistente       |
| Escalado horizontal  | Trivial             | Trivial               | **Requiere broker**     | Requiere broker          |
| Ideal para notif.    | No                  | Como fallback         | **Sí**                  | Sí (solo push)           |

> **Por qué WebSockets para notificaciones:** la campana y los toasts del admin necesitan llegar **inmediatamente** después del evento (mensaje recibido, handover). Con polling a 2 s el usuario percibiría hasta 2 s de retardo artificial; con WebSocket el retardo es el de la red + procesamiento (~10-50 ms en LAN, ~100-200 ms en Internet).

### 1.4 Socket.IO sobre WebSocket puro

El proyecto usa **Socket.IO**, no `ws` crudo. Socket.IO añade sobre WebSocket:

- **Namespaces** (`/admin`) para segmentar permisos y lógica.
- **Rooms** (`conversation:{id}`, `user:{id}`) para broadcast dirigido.
- **Reconexión automática** con backoff en el cliente.
- **Adapter** para sincronizar `emit` entre instancias (en este caso, vía Pub/Sub).
- **Fallback a HTTP long-polling** si WebSocket falla (útil detrás de proxies restrictivos).

> **Nota:** Socket.IO **no** es lo mismo que WebSocket puro. Su handshake empieza con un `GET` HTTP con `EIO=4&transport=polling` antes de promover a `websocket`. Por eso el `path` configurable (`/socket.io`) y el CORS importan.

---

## 2. Funcionamiento en entorno de desarrollo (dev)

### 2.1 Cómo se levanta localmente en este proyecto

El backend expone Socket.IO **en el mismo puerto HTTP** que Express (`PORT=8000`), no en un puerto aparte. Lo levanta `WebsocketGatewayService.create()` desde `backend/src/server.ts`.

**Variables relevantes (`backend/.env`):**

```env
WS_ENABLED=true
WS_CORS_ORIGIN=              # vacío = usar CORS_ORIGIN
WS_PATH=/socket.io
CORS_ORIGIN=*
PORT=8000
REALTIME_DURABLE_ENABLED=true    # default en docker-compose.dev.yml (durable + emulador); override a false para legacy
```

**Variables del frontend (`frontend/.env`):**

```env
NEXT_PUBLIC_WS_URL=http://localhost:8000
NEXT_PUBLIC_WS_PATH=/socket.io
NEXT_PUBLIC_WS_ENABLED=true
```

Levantar dev (desde la raíz del repo):

```bash
make dev   # o: docker compose -f docker-compose.dev.yml up -d postgres api worker frontend
```

En dev **sí se activa el adapter Pub/Sub** (`REALTIME_DURABLE_ENABLED=true` y `SOCKETIO_PUBSUB_ADAPTER_ENABLED=true` por defecto), hablando contra el emulador local. Esto ejercita la misma ruta que produccion (outbox -> Pub/Sub -> push -> gateway + fan-out). Con una sola instancia el fan-out es innecesario, pero el camino queda validado; el default legacy in-process se recupera con `REALTIME_DURABLE_ENABLED=false`.

### 2.2 Servidor mínimo de referencia (Node.js + Socket.IO)

Si quieres reproducir el patrón fuera del proyecto (spike, PoC):

```ts
import { createServer } from 'http';
import { Server } from 'socket.io';

const httpServer = createServer();
const io = new Server(httpServer, {
  path: '/socket.io',
  cors: { origin: 'http://localhost:3000', credentials: true },
});

io.on('connection', (socket) => {
  console.log('connected', socket.id);
  socket.on('conversation.subscribe', (conversationId: string) => {
    socket.join(`conversation:${conversationId}`);
  });
  socket.on('disconnect', (reason) => console.log('disconnected', reason));
});

httpServer.listen(8000, () => console.log('WS en :8000'));
```

> Para smoke tests puede usarse `wscat -c ws://localhost:8000/socket.io/?EIO=4&transport=websocket` o el cliente de Postman (ya existe colección en `postman/`).

### 2.3 Retos comunes en dev

| Reto                                 | Síntoma                                                    | Solución aplicada en el proyecto                                                                                                                                                                                                |
| ------------------------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Hot-reload que mata conexiones**   | Cada save desconecta a todos los sockets                   | El dev server reinicia el proceso; el cliente reconecta solo (`reconnection: true`). No compartir estado de sockets entre hot-reloads.                                                                                          |
| **Múltiples pestañas del navegador** | Una pestaña recibe, la otra no; o doble notif.             | Cada pestaña abre su propio socket con su `socket.id`. El backend cuenta conexiones por usuario (`connectedUsers`) y emite `presence` solo en la transición 0→1. La deduplicación por `eventId` en el cliente evita duplicados. |
| **CORS**                             | `connect_error: No 'Access-Control-Allow-Origin'`          | `WS_CORS_ORIGIN`/`CORS_ORIGIN` deben listar el origen del frontend (`http://localhost:3000` o `5173`). En dev `*` es aceptable; en prod, lista explícita.                                                                       |
| **Puertos ocupados**                 | `EADDRINUSE :8000`                                         | Cambiar `PORT` o `API_PUBLIC_PORT` en `.env`.                                                                                                                                                                                   |
| **Auth caduca durante la sesión**    | `connect_error: Invalid auth token` en bucle               | El cliente usa `auth: (cb) => cb({ token: ... })` (callback dinámico) para refrescar el token antes de cada reconexión.                                                                                                         |
| **Token en handshake**               | `Missing auth token`                                       | El backend acepta token en `handshake.auth.token`, header `Authorization: Bearer` o `?token=` (este último solo para casos especiales).                                                                                         |
| **WebSocket detrás de proxy en dev** | `wss://` falla, `ws://` funciona                           | En dev local normalmente no hay TLS. Si se prueba detrás de Caddy/nginx, propagar `X-Forwarded-*`.                                                                                                                              |
| **State recovery tras reconnect**    | El usuario "pierde" notif. emitidas durante la desconexión | Los eventos **durables** se rehidratan desde la API REST al reconectar (no hay connection-state recovery en el adapter Pub/Sub). Los efímeros se pierden por diseño.                                                            |

### 2.4 Inspección y depuración en dev

- **Logs del gateway:** el backend emite logs estructurados con `logRealtimeBoundary` en cada `emit`. Filtra por `WebsocketGatewayService`.
- **Logs del cliente:** `frontend/lib/realtime/realtime-manager.ts` hace `console.info/warn/error` JSON con `component: 'RealtimeManager'`.
- **Chrome DevTools → Network → WS:** filtra por `socket.io`, abre el frame y mira los paquetes EIO (handshake, `40` connect, `42` event, `2` ping, `3` pong).
- **Socket.IO admin UI:** en dev puede montarse `@socket.io/admin-ui` temporalmente para ver rooms y sockets conectados.

---

## 3. Arquitectura y funcionamiento en GCP

### 3.1 Servicios GCP involucrados

| Servicio GCP                                                     | Rol en el realtime                                                                | ¿Por qué este y no otro?                                                              |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **Cloud Run** (`nexo-api`)                                        | Termina la conexión WebSocket del cliente y mantiene las rooms Socket.IO locales. | Soporta WebSockets con request-driven; escala a cero; cobro por tiempo de CPU activo. |
| **Pub/Sub** (`realtime-events`, `ai-stream`, `socketio-adapter`) | Broker de fan-out entre instancias de Cloud Run.                                  | Mensajería administrada, sin ops; el adapter oficial de Socket.IO la usa nativamente. |
| **Cloud Load Balancing** (el integrado en Cloud Run)             | Termina TLS y enruta al servicio.                                                 | Ya incluido en Cloud Run; no requiere un LB separado para el caso base.               |
| **Cloud SQL**                                                    | Fuente de verdad de eventos durables (outbox pattern).                            | Persistencia transaccional con Prisma.                                                |
| **Cloud Tasks** (`nexo-worker`)                                   | Origen de muchos eventos durables (mensajes, handovers).                          | Desacopla latencia de webhook del envío al cliente.                                   |

**Alternativas consideradas y por qué no se usan:**

- **Firebase Realtime Database / Firestore listeners:** útiles para apps móviles B2C sin backend propio. Aquí ya hay un backend Express con RBAC y un outbox en Postgres; añadir Firebase duplicaría la fuente de verdad.
- **App Engine:** soporta WebSockets pero con menos control sobre concurrencia y cold-start que Cloud Run.
- **Compute Engine:** máxima flexibilidad pero ops permanente; no encaja con el modelo scale-to-zero del proyecto.
- **API Gateway:** no termina WebSockets; solo HTTP/REST. No aplica.
- **Memorystore (Redis) + `@socket.io/redis-adapter`:** era la opción clásica para fan-out multi-instancia. **El proyecto la reemplazó por Pub/Sub** en septiembre de 2026 para eliminar el Serverless VPC Access Connector y reducir costos. Ver `docs/DEPLOYMENT_GCP.md` y `docs/auditoria-redis.md`.

### 3.2 El reto del escalado horizontal: ¿cómo se sincronizan los clientes?

Cloud Run escala la API a **N réplicas** según el tráfico. Un cliente conectado a la réplica #1 no comparte memoria con un cliente conectado a la réplica #3. Si el worker publica un evento y solo la réplica #1 lo recibe por push HTTP, los sockets de la réplica #3 nunca se enteran.

**Solución aplicada: `@socket.io/gcp-pubsub-adapter`**

```text
                ┌─────────────────────────────────────────────────────┐
                │                  Pub/Sub topic                        │
                │                  `socketio-adapter`                     │
                │   (un mensaje por cada emit() que hace cualquier réplica)│
                └───────▲────────────────────▲─────────────────────┬────┘
                        │ subscribe         │ subscribe          │ subscribe
                        │                   │                    │
                  ┌─────┴─────┐       ┌──────┴────┐       ┌──────┴────┐
  Cliente A ────► │ Réplica 1 │ ─emit()┤ Réplica 2 │       │ Réplica N │ ◄──── Cliente B
  Cliente C ────► │ (nexo-api) │       │ (nexo-api) │       │ (nexo-api) │ ◄──── Cliente D
                  └───────────┘       └───────────┘       └───────────┘
                        │                   │                    │
                        └──► emite a sus sockets locales (rooms locales)
```

- Cada réplica de Cloud Run crea su propia **subscription** al topic `socketio-adapter` con un prefijo (`subscriptionPrefix`).
- Cuando **cualquier** réplica ejecuta `io.of('/admin').to(room).emit(...)`, el adapter publica un mensaje en el topic.
- Todas las demás réplicas reciben el mensaje y **re-emiten** a sus sockets locales que estén en la room.
- Resultado: un `emit` en una réplica alcanza los sockets de **todas** las réplicas.

> **Importante:** el adapter **no ofrece connection-state recovery**. Si un cliente se desconecta y reconecta, puede caer en otra réplica y no recuperará automáticamente las rooms a las que estaba suscrito. El frontend lo compensa con `resubscribeAll()` al reconectar (ver sección 4.4).

**Flujo dual de Pub/Sub en el proyecto (no confundir):**

| Topic Pub Sub      | Quién publica            | Quién consume             | Propósito                                          |
| ------------------ | ------------------------ | ------------------------- | -------------------------------------------------- |
| `realtime-events`  | `nexo-worker` (outbox)    | `nexo-api` (push HTTP)     | Entrega durable de eventos de negocio al gateway.  |
| `ai-stream`        | `nexo-worker` (streaming) | `nexo-api` (push HTTP)     | Chunks de streaming de IA (efímeros, best-effort). |
| `socketio-adapter` | Cualquier réplica de API | Todas las réplicas de API | Fan-out de `emit()` entre instancias Socket.IO.    |

### 3.3 Timeouts y persistencia de conexiones en Cloud Run

Cloud Run impone límites que **condicionan** el diseño del realtime:

| Límite de Cloud Run            | Valor / comportamiento                        | Impacto en WebSockets                                                                                                                                                                                        |
| ------------------------------ | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Timeout de request**         | Configurable hasta **60 min** (default 5 min) | La conexión WebSocket cuenta como un único request. En `nexo-api` se configura en **60 s** para HTTP normal, pero las conexiones WS establecidas **renuevan** el timeout mientras haya actividad (ping/pong). |
| **Concurrencia por instancia** | Default 80, configurable hasta 1000           | Cada socket abierto consume 1 conexión. Ajustar `--concurrency` según pico de admins conectados.                                                                                                             |
| **Scale-to-zero**              | Tras el último request, la instancia se apaga | Si no hay tráfico HTTP/WS, las conexiones se cortan. El cliente debe reconectar.                                                                                                                             |
| **Cold-start**                 | 1-5 s típicamente                             | La primera conexión tras idle puede tardar más; el cliente debe tolerarlo con backoff.                                                                                                                       |
| **HTTP/2 y WebSockets**        | Soportados nativamente                        | No se necesita configuración especial; el path `/socket.io` pasa directo.                                                                                                                                    |
| **Sticky sessions**            | **No soportadas** en Cloud Run                | Un cliente reconectado puede caer en otra réplica. Por eso **no se guarda estado en la instancia**; las rooms se reconstruyen desde el cliente.                                                              |

**Prácticas para convivir con estos límites:**

1. **Ping/pong de Socket.IO:** mantener los heartbeats por defecto (`pingInterval`/`pingTimeout`) para que Cloud Run vea actividad y no cierre la conexión por idle.
2. **`reconnection: true` + `reconnectionAttempts: Infinity`** en el cliente: ya configurado en `realtime-manager.ts`.
3. **No depender de estado en memoria:** cualquier estado que el cliente necesite (rooms suscritas, última notificación vista) debe poder reconstruirse vía REST. El backend no guarda estado por socket más allá del contador de presencia.
4. **`PRISMA_CONNECTION_LIMIT=5`** + **`--max-instances=5`** en la API (Cloud Run): el consumo hacia Cloud SQL es `max-instances × connection_limit`, así que ambas palancas se mueven juntas. Subirlas sin escalar antes el tier de Cloud SQL agota los slots. Ver la regla de oro en [docs/CLOUD_SQL_CONNECTION.md](../CLOUD_SQL_CONNECTION.md) §3.

### 3.4 Topología completa en GCP

```text
Internet (navegador admin)
   │ wss://nexo-api-xxxx.run.app/socket.io/?EIO=4&transport=websocket
   ▼
┌──────────────────────────────────────────────────────────┐
│ Cloud Run: nexo-api (N réplicas, scale 0..10)              │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Express + Socket.IO (/admin)                        │  │
│  │  - socketAuthMiddleware (verifica JWT access)        │  │
│  │  - rooms: conversation:{id}, user:{id}              │  │
│  │  - WebsocketGatewayService.emitRealtimeEvent()      │  │
│  │  - @socket.io/gcp-pubsub-adapter  ◄──► Pub/Sub       │  │
│  └────────────────────────────────────────────────────┘  │
│           ▲ push HTTP (realtime-events)  ▲ push (ai-stream)│
└───────────┼────────────────────────────────┼─────────────┘
            │                                │
            │ Pub/Sub                         │
            ▼                                ▼
   ┌──────────────────┐            ┌────────────────────┐
   │ realtime-events │            │ ai-stream           │
   │  (durable,       │            │  (efímero,          │
   │   ordering on)   │            │   best-effort)      │
   └────────▲─────────┘            └─────────▲──────────┘
            │ publish                         │ publish
            │                                  │
   ┌────────┴──────────────────────────────────┴─────────┐
   │ Cloud Run: nexo-worker (privado, 0..20)               │
   │  - Cloud Tasks handler                                │
   │  - Outbox poller → publica durables en realtime-events│
   │  - AI streaming → publica chunks en ai-stream         │
   │  - Cloud SQL (Prisma)                                 │
   └───────────────────────────────────────────────────────┘
```

---

## 4. Flujo aplicado al sistema de notificaciones

### 4.1 Diagrama lógico del ciclo de vida de una notificación

```text
(1) Disparo en el backend
    ┌─────────────────────────────────────────────────────────────┐
    │ nexo-worker procesa un evento de negocio:                    │
    │   - WhatsApp webhook recibido                              │
    │   - Handover de conversación                              │
    │   - Chunk de streaming IA                                 │
    │                                                            │
    │  durable:  DB write (outbox) ──► Pub/Sub realtime-events  │
    │  efímero:  ─────────────────► Pub/Sub ai-stream            │
    └─────────────────────────────────────────────────────────────┘
                              │
                              ▼
(2) Recepción en la API + fan-out
    ┌─────────────────────────────────────────────────────────────┐
    │ nexo-api recibe push HTTP de Pub/Sub:                       │
    │   - POST /pubsub/realtime (durable)                        │
    │   - POST /pubsub/ai-stream (efímero)                        │
    │                                                            │
    │ WebsocketGatewayService.emitRealtimeEvent(event):         │
    │   - valida contrato (RealtimeDurableEvent | EphemeralEvent) │
    │   - métricas (latencia gateway_emit_latency_ms)            │
    │   - io.of('/admin').to(room).emit(socketEventName, event)  │
    │     │                                                      │
    │     └─► @socket.io/gcp-pubsub-adapter publica en           │
    │         socketio-adapter → las demás réplicas re-emiten    │
    └─────────────────────────────────────────────────────────────┘
                              │
                              ▼
(3) Recepción y renderizado en el cliente
    ┌─────────────────────────────────────────────────────────────┐
    │ Navegador admin (RealtimeManager):                          │
    │   - socket.on('admin.notification', payload) →              │
    │       useNotificationStore.addNotification(entry)           │
    │       enqueueNotificationToast(entry) → toast de Sonner    │
    │   - socket.on('conversation.message.new', payload) →       │
    │       EventRouter.dispatch → actualiza hilo abierto        │
    │   - dedup por eventId (LRU 500) → evita duplicados         │
    └─────────────────────────────────────────────────────────────┘
```

### 4.2 Eventos durables vs efímeros

| Aspecto             | Durable (`realtime-events`)                                               | Efímero (`ai-stream`)                           |
| ------------------- | ------------------------------------------------------------------------- | ----------------------------------------------- |
| Garantía de entrega | **Al menos una** (outbox + Pub/Sub ordering)                              | Best-effort, se puede perder                    |
| Origen              | Worker, tras escribir en DB                                               | Worker, durante streaming IA                    |
| Contrato            | `RealtimeDurableEvent` con `eventId`, `correlationId`                     | `AIStreamChunkPubSubEvent` / `Done`             |
| Deduplicación       | Backend (ordering key) + frontend (LRU de `eventId`)                      | No aplica                                       |
| Ejemplos            | `conversation.message.new`, `conversation.handover`, `admin.notification` | `conversation.ai.chunk`, `conversation.ai.done` |

### 4.3 Routing Socket.IO en el gateway

El método `emitDurableEvent` del gateway decide la room destino según el tipo de evento:

| `socketEventName`                 | Destino Socket.IO                                            | Efecto UI                       |
| --------------------------------- | ------------------------------------------------------------ | ------------------------------- |
| `conversation.message.new`        | `to(conversation:{id})` + `admin.notification` si es inbound | Hilo + campana                  |
| `conversation.handover`           | broadcast namespace + `to(user:{assignee})`                  | Campana + resaltado al asignado |
| `conversation.updated`            | broadcast namespace + `to(user:{assignee})`                  | Metadata conversación           |
| `admin.notification`              | broadcast namespace `/admin`                                 | Campana + toast                 |
| `conversation.typing` (efímero)   | `to(conversation:{id})`                                      | Indicador "escribiendo…"        |
| `conversation.ai.chunk` (efímero) | `to(conversation:{id})`                                      | Render streaming IA             |
| `presence.update` (efímero)       | broadcast namespace                                          | Punto verde/rojo de usuarios    |

### 4.4 Reconexión automática y manejo de pérdida de red en el cliente

El `RealtimeManager` (`frontend/lib/realtime/realtime-manager.ts`) implementa varias capas de resiliencia:

1. **Reconexión con backoff exponencial** (Socket.IO nativo):
   ```ts
   reconnection: true,
   reconnectionAttempts: Infinity,
   reconnectionDelay: 1500,
   timeout: 10000,
   ```

2. **Token dinámico en cada reconexión:** el callback `auth` se evalúa antes de cada intento, así el access token refreshado se envía automáticamente:
   ```ts
   auth: (cb) => cb({ token: authStorage.getAccessToken() ?? '' }),
   ```

3. **Reconexión proactiva ante auth error:** si `connect_error` es un error de auth, se llama a `tryRefreshToken()` para que el siguiente intento use un token válido.

4. **Reconexión ante eventos del navegador:**
   - `window online` (vuelve la red)
   - `visibilitychange` (la pestaña vuelve a ser visible)
   - `vc:token-refreshed` (evento custom tras refresh de token)

5. **Re-suscripción a rooms tras reconectar:** `resubscribeAll()` reenvía `conversation.subscribe` para cada room activa, porque el nuevo socket puede caer en otra réplica sin las rooms previas.

6. **Deduplicación LRU de `eventId`:** tras una reconexión, Pub/Sub puede redeliver el mismo evento durable. El cliente mantiene un set de los últimos 500 `eventId` vistos y descarta duplicados.

7. **Rehidratación por REST:** para eventos durables que ocurrieron mientras el cliente estuvo offline, el flujo recomendado al reconectar es consultar la API REST (ej. `/notifications?since=...`) para reconstruir el estado. El adapter Pub/Sub no ofrece connection-state recovery.

---

## 5. Cheat sheet — Dev vs GCP

### 5.1 Tabla rápida de decisiones

| Tema                           | Dev local                                            | GCP (Cloud Run + Pub/Sub)                                                    |
| ------------------------------ | ---------------------------------------------------- | ---------------------------------------------------------------------------- |
| **Broker entre instancias**    | Emulador de Pub/Sub local (durable); adapter ON por defecto | `@socket.io/gcp-pubsub-adapter` sobre topic `socketio-adapter`               |
| **Origen de eventos**          | Worker publica en `realtime-events` / `ai-stream` (emulador) | Worker publica en `realtime-events` / `ai-stream`                            |
| **CORS**                       | `*` o lista explícita de orígenes locales            | Lista explícita de dominios de frontend (sin `*`)                            |
| **TLS**                        | No (http://)                                         | Sí (https://, terminado en Cloud Run)                                        |
| **Auth en handshake**          | JWT access en `auth.token` o header                  | Igual; el cliente refresca token antes de reconectar                         |
| **Timeout de conexión**        | Sin límite práctico                                  | 60 s configurado; mantener ping/pong activo                                  |
| **Scale-to-zero**              | No aplica                                            | Sí; el cliente debe reconectar tras cold-start                               |
| **State recovery**             | Reiniciar proceso = reconectar                       | Reconectar; rehidratar estado por REST; re-suscribir rooms                   |
| **Deduplicación**              | Opcional                                             | Obligatoria (LRU de `eventId` en cliente)                                    |
| **Logs**                       | `console.*` en terminal                              | Cloud Logging; filtrar por `WebsocketGatewayService`                         |
| **Variables clave (backend)**  | `WS_ENABLED`, `WS_PATH`, `CORS_ORIGIN`               | + `pubsubAdapter.enabled`, `GCP_PROJECT_ID`, `REALTIME_DURABLE_ENABLED=true` |
| **Variables clave (frontend)** | `NEXT_PUBLIC_WS_URL=http://localhost:8000`           | `NEXT_PUBLIC_WS_URL=https://nexo-api-xxxx.run.app`                            |

### 5.2 Checklist al escribir código que involucre WebSockets

**Backend (cualquier entorno):**

- [ ] ¿El evento es **durable** (debe persistir) o **efímero** (best-effort)? Definir el contrato en `realtime-event.contracts.ts`.
- [ ] Si es durable, ¿se escribe en DB **antes** de publicar en Pub/Sub (outbox)? Evita entregar eventos que se perdieron en DB.
- [ ] ¿El `socketEventName` está tipado en `SocketEventName`? No usar strings sueltos.
- [ ] ¿La room destino es la mínima necesaria? `to(conversation:{id})` > broadcast a `/admin` (menos ruido, menos carga).
- [ ] ¿Se validó el contrato del payload antes del `emit`? Usar los type guards (`isRealtimeDurableEvent`, `isAdminNotificationPayload`).
- [ ] ¿Se registró métrica (`gateway_emit`, `gateway_emit_latency_ms`)?
- [ ] ¿El `emit` no depende de estado en memoria de la instancia? Recordar que en GCP se ejecuta en N réplicas.

**Cliente (cualquier entorno):**

- [ ] ¿Se usa `auth: (cb) => cb({ token })` (callback dinámico) en vez de `auth: { token }` (estático)? El estático no se refresca.
- [ ] ¿`reconnection: true` y `reconnectionAttempts: Infinity`?
- [ ] ¿Se re-suscriben las rooms tras `connect`/`reconnect`? (`resubscribeAll()`).
- [ ] ¿Se deduplican eventos durables por `eventId`?
- [ ] ¿Se maneja `connect_error` distinguiendo auth vs red? Auth → refresh; red → dejar que reconecte solo.
- [ ] ¿La UI no asume que el WebSocket es la única fuente de verdad? Rehidratar por REST al montar/reconectar.
- [ ] ¿No se bloquea la UI esperando el WebSocket? Los datos iniciales vienen por REST; el WS es para updates.

**Solo GCP:**

- [ ] ¿El adapter Pub/Sub está habilitado (`pubsubAdapter.enabled=true`) y apunta al topic `socketio-adapter`?
- [ ] ¿El `subscriptionPrefix` es único por servicio? Evita que dos servicios compartan subscription.
- [ ] ¿El topic `socketio-adapter` existe? El factory lo crea si no existe, pero en prod conviene pre-crealo con IaC.
- [ ] ¿`CORS_ORIGIN` lista explícitamente los dominios del frontend (sin `*`)?
- [ ] ¿`PRISMA_CONNECTION_LIMIT=5` y `--max-instances=5` en la API? (Cloud SQL no aguanta pool grande × N réplicas: ver `docs/CLOUD_SQL_CONNECTION.md` §3).
- [ ] ¿El servicio `nexo-api` es público y `nexo-worker` privado?
- [ ] ¿Los timeouts de Cloud Run (3600 s API, 300 s worker) son suficientes para los flujos más largos?
- [ ] ¿Se monitorea la métrica `gateway_emit_latency_ms`? Si crece, el Pub/Sub o el adapter están saturados.

### 5.3 Anti-patrones a evitar

| Anti-patrón                                             | Por qué falla                                                            | Cómo corregirlo                                                       |
| ------------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| Guardar estado de sesión **solo en memoria** del socket | En GCP el cliente reconecta en otra réplica y pierde el estado.          | Persistir en DB/Redis o reconstruir por REST al reconectar.           |
| Usar `auth: { token }` estático en el cliente           | El token caduca y las reconexiones fallan en bucle.                      | Usar `auth: (cb) => cb({ token })` callback dinámico.                 |
| Hacer broadcast a `/admin` para todo                    | Satura a todos los admins con eventos que no les interesan.              | Usar `to(conversation:{id})` o `to(user:{id})` cuando sea posible.    |
| Confiar en que un evento durable llega una sola vez     | Pub/Sub es at-least-once; el cliente puede recibir duplicados.           | Deduplicar por `eventId` con LRU acotado.                             |
| Mantener conexiones abiertas sin ping/pong              | Cloud Run cierra por idle; el cliente lo ve como `disconnect` aleatorio. | Dejar los defaults de Socket.IO (`pingInterval`/`pingTimeout`).       |
| Publicar eventos durables **antes** de escribir en DB   | Si la escritura falla, el cliente recibe un evento fantasma.             | Outbox: escribir en DB y publicar en la misma transacción (o poller). |
| Usar `*` en CORS de producción                          | Riesgo de seguridad; cualquier origen puede conectar.                    | Lista explícita de dominios del frontend.                             |
| Asumir sticky sessions en Cloud Run                     | No existen; el balanceador puede enrutar a cualquier réplica.            | Diseñar stateless; las rooms se reconstruyen desde el cliente.        |

### 5.4 Comandos rápidos

```bash
# Dev local
make dev
docker compose -f docker-compose.dev.yml logs -f api | grep -i realtime

# Verificar tópicos Pub/Sub en GCP
gcloud pubsub topics list --project=<GCP_PROJECT_ID> | grep -E 'realtime|socketio|ai-stream'
gcloud pubsub subscriptions list --project=<GCP_PROJECT_ID>

# Verificar configuración de Cloud Run (nexo-api)
gcloud run services describe nexo-api --region=us-central1 \
  --format='value(status.url, metadata.annotations["run.googleapis.com/timeout"])'

# Logs de realtime en GCP (últimos 30 min)
gcloud logging read 'resource.type="cloud_run_revision" AND \
  resource.label.service="nexo-api" AND jsonPayload.component="WebsocketGatewayService" \
  AND timestamp>="2026-09-26T00:00:00Z"' --limit=50 --format=json
```

---

## Referencias internas

- `docs/notification-system.md` — referencia técnica completa del sistema de notificaciones.
- `docs/DEPLOYMENT_GCP.md` — SOP de infraestructura y despliegue en GCP.
- `docs/auditoria-redis.md` — por qué se migró de Redis a Pub/Sub adapter.
- `docs/realtime-durable-operations.md` — detalles del outbox durable.
- `backend/src/services/realtime/websocket-gateway.service.ts` — gateway Socket.IO.
- `backend/src/services/realtime/realtime-event.contracts.ts` — contratos durable/efímero.
- `frontend/lib/realtime/realtime-manager.ts` — manager del cliente.
- `frontend/lib/realtime/types.ts` — type guards de payloads.

---

> **TL;DR para el equipo:** WebSockets = TCP persistente full-duplex. En dev, una sola instancia Socket.IO en el puerto 8000 con `reconnection` en el cliente basta. En GCP, Cloud Run escala a N réplicas y se necesita `@socket.io/gcp-pubsub-adapter` (topic `socketio-adapter`) para que un `emit` en una réplica alcance los sockets de las demás. Los eventos **durables** van por `realtime-events` (outbox + dedup por `eventId`); los **efímeros** por `ai-stream` (best-effort). El cliente nunca asume sticky sessions ni estado en memoria: reconecta, re-suscribe rooms, deduplica y rehidrata por REST.


