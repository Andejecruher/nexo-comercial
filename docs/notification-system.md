# Sistema de Notificaciones — Referencia Técnica

> **Audiencia:** desarrolladores que quieran agregar nuevos tipos de notificación, modificar el comportamiento existente o depurar eventos que no llegan al frontend.

---

## Índice

1. [Visión general](#1-visión-general)
2. [Tres canales de notificación distintos](#2-tres-canales-de-notificación-distintos)
3. [Arquitectura: cómo viaja un evento](#3-arquitectura-cómo-viaja-un-evento)
4. [Clasificación de eventos: críticos vs efímeros](#4-clasificación-de-eventos-críticos-vs-efímeros)
5. [Contratos de datos](#5-contratos-de-datos)
6. [Pipeline backend paso a paso](#6-pipeline-backend-paso-a-paso)
7. [Pipeline frontend paso a paso](#7-pipeline-frontend-paso-a-paso)
8. [Tabla de eventos actuales](#8-tabla-de-eventos-actuales)
9. [Quién produce cada evento y desde dónde](#9-quién-produce-cada-evento-y-desde-dónde)
10. [Routing de Socket.IO en el gateway](#10-routing-de-socketio-en-el-gateway)
11. [Guardianes del frontend: por qué un evento puede descartarse](#11-guardianes-del-frontend-por-qué-un-evento-puede-descartarse)
12. [Cómo agregar un nuevo tipo de notificación](#12-cómo-agregar-un-nuevo-tipo-de-notificación)
13. [Cómo consumir un evento en un nuevo hook o componente](#13-cómo-consumir-un-evento-en-un-nuevo-hook-o-componente)
14. [Variables de entorno relevantes](#14-variables-de-entorno-relevantes)
15. [Debugging checklist](#15-debugging-checklist)

---

## 1. Visión general

El sistema de notificaciones tiene **dos capas lógicas** y **un canal físico**:

| Capa                      | Qué hace                                         | Ejemplo visible                        |
| ------------------------- | ------------------------------------------------ | -------------------------------------- |
| **Campana / toast**       | Avisa que ocurrió algo en cualquier conversación | "Nuevo mensaje recibido" en el header  |
| **Estado en tiempo real** | Actualiza datos en la UI sin recargar la página  | Mensaje que aparece en el hilo abierto |

Ambas capas usan el mismo canal físico: **WebSocket sobre Socket.IO** con el namespace `/admin`.

El canal tiene garantías diferentes según el tipo de evento:

- **Críticos (durable):** escritura atómica en DB → relay → topic Pub/Sub `realtime-events` → socket. Al menos una entrega.
- **Efímeros:** publicación directa al topic Pub/Sub `ai-stream` → socket. Best-effort, se pueden perder.

---

## 2. Tres canales de notificación distintos

Es importante distinguir estos tres mecanismos porque tienen comportamientos y alcances diferentes:

| Canal                      | Socket event               | Alcance en Socket.IO             | ¿Activa campana?         | ¿Actualiza UI?                 |
| -------------------------- | -------------------------- | -------------------------------- | ------------------------ | ------------------------------ |
| `admin.notification`       | `admin.notification`       | Broadcast a **todos** los admins | **Sí** (campana + toast) | No                             |
| `conversation.message.new` | `conversation.message.new` | Solo sala `conversation:{id}`    | No                       | **Sí** (hilo de mensajes)      |
| `conversation.updated`     | `conversation.updated`     | Broadcast a **todos** los admins | No                       | **Sí** (metadata conversación) |

La campana y los toasts **no** dependen de `conversation.message.new`. Dependen exclusivamente de `admin.notification`.

---

## 3. Arquitectura: cómo viaja un evento

```text
┌──────────────────────── Worker Process ─────────────────────────┐
│                                                                   │
│  Servicio de dominio                                              │
│  (MessageOrchestrator, ConversationsService, MessageService)      │
│       │                                                           │
│       ▼ RealtimeNotifier.notifyCritical(tx, event)               │
│  ┌─────────────────────────┐                                      │
│  │ realtime_outbox_events  │  ← escritura dentro de la misma     │
│  │ status = 'pending'      │    transacción que el dato de negocio│
│  └──────────┬──────────────┘                                      │
│             │                                                      │
│       ▼ RealtimeOutboxRelay.runCycle()  (poll OUTBOX_POLL_MS)    │
│         FOR UPDATE SKIP LOCKED → status = 'publishing'           │
│         PubSubRealtimeTransport.publish(event)                    │
│         status = 'published'                                      │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
                         │
              Pub/Sub topic realtime-events
              (message ordering por conversationId)
                         │
              push subscription HTTP
              (POST /pubsub/realtime)
                         │
┌──────────────────────── API Process ────────────────────────────┐
│                                                                   │
│  RealtimeApiSubscriber.handleEvent(event)                         │
│       ├─ dedup: LRU in-process TTL 60s por eventId                │
│       └─ gateway.emitRealtimeEvent(event)                         │
│                                                                   │
│  WebsocketGatewayService.emitDurableEvent(event)                 │
│       │                                                           │
│       ├─ conversation.message.new  → room conversation:{id}      │
│       │  + si inbound → emitAdminNotification('message.received') │
│       │                                                           │
│       ├─ conversation.handover     → namespace (todos)            │
│       │  + emitAdminNotification('conversation.handover')         │
│       │                                                           │
│       └─ conversation.updated      → namespace (todos)            │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
                         │
                    Socket.IO /admin
                         │
┌──────────────────────── Frontend ───────────────────────────────┐
│                                                                   │
│  RealtimeManager.bindSocketEvents()                               │
│       │                                                           │
│       ├─ admin.notification                                       │
│       │      → useNotificationStore.addNotification()            │
│       │      → toast(entry)                                       │
│       │                                                           │
│       └─ CONVERSATION_EVENTS                                      │
│              → shouldDropInvalidDurablePayload?  (drop)          │
│              → trackDurableEventId?              (dedup)         │
│              → EventRouter.dispatch(event, payload)              │
│                     │                                             │
│                     ├─ useConversationThread  (hilo)             │
│                     ├─ useTicketDetail        (ticket)           │
│                     └─ useConversations       (inbox)            │
└──────────────────────────────────────────────────────────────────┘
```

> **Eventos efímeros** (`conversation.typing`, AI stream): omiten todo el pipeline de outbox y van directamente desde el servicio → `RealtimeNotifier.notifyEphemeral()` (typing) o `AIStreamPubSubPublisher` (chunks/done) → topic Pub/Sub `ai-stream` (ordering por `conversationId`) → push subscription → gateway → socket.

---

## 4. Clasificación de eventos: críticos vs efímeros

### Críticos (durable outbox)

Definidos en `backend/src/services/realtime/realtime-event.contracts.ts`:

```typescript
export const CriticalEventType = {
  MessageCreated: 'message.created',
  MessageUpdated: 'message.updated',
  ConversationUpdated: 'conversation.updated',
  ConversationHandover: 'conversation.handover',
  TicketClosed: 'ticket.closed',
  TicketReopened: 'ticket.reopened',
  TicketAssigned: 'ticket.assigned',
  AdminNotification: 'admin.notification',
};
```

Deben escribirse con `RealtimeNotifier.notifyCritical(tx, event)` **dentro de la misma transacción de Prisma** que el dato de negocio. Si la transacción hace rollback, el evento nunca se emite.

### Efímeros (topic Pub/Sub `ai-stream`)

```typescript
export const EphemeralEventType = {
  ConversationTyping: 'conversation.typing',
  AiStreamChunk: 'conversation.ai.chunk',
  AiStreamDone: 'conversation.ai.done',
  PresenceUpdate: 'presence.update',
};
```

Se emiten con `RealtimeNotifier.notifyEphemeral(event)`. No tienen garantía de entrega; son ignorables si se pierden (UI se recupera sola).

---

## 5. Contratos de datos

### Evento durable (`RealtimeDurableEvent`)

```typescript
{
  eventId:       string;   // UUID — idempotency key
  correlationId: string;   // traceability (mismo mensaje/acción)
  schemaVersion: 1;
  eventType:     CriticalEventType;
  socketEventName: SocketEventName;
  occurredAt:    string;   // ISO 8601 con sufijo Z o +HH:MM  (obligatorio)
  source:        string;   // nombre del servicio que lo emite
  conversationId: string;  // UUID

  // Patches opcionales (solo uno aplica por evento)
  messagePatch?:      { id, conversationId, body, direction?, messageType?, externalMessageId?, createdAt }
  conversationPatch?: { id, status?, assignedDept?, assignedUserId?, flowState?, updatedAt? }
  ticketPatch?:       { id, status?, priority?, assignedUserId?, departmentSlug?, updatedAt? }
  notificationPatch?: { type, title?, body?, conversationId?, ticketId? }
}
```

### Payload `admin.notification` (no durable)

```typescript
{
  type: 'message.received' | 'conversation.handover';
  conversationId: string;
  occurredAt: string;
}
```

Este payload es más simple porque no necesita `eventId` ni deduplicación: la campana es idempotente por naturaleza.

---

## 6. Pipeline backend paso a paso

### 6.1 Producir un evento crítico (en un servicio de dominio)

```typescript
// Dentro de una transacción de Prisma:
await this.realtimeNotifier!.notifyCritical(
  tx,                              // el cliente de transacción
  {
    eventId:        message.id,    // UUID único — usado para idempotencia
    correlationId,
    schemaVersion:  1,
    eventType:      CriticalEventType.MessageCreated,
    socketEventName: SocketEventName.ConversationMessageNew,
    occurredAt:     message.createdAt.toISOString(),
    source:         'message-orchestrator.service',
    conversationId: params.conversationId,
    messagePatch:   { ... },
  },
);
```

`notifyCritical` solo escribe en `realtime_outbox_events`. No publica nada al topic aún.

### 6.2 Relay (Worker): leer outbox y publicar

`RealtimeOutboxRelay.runCycle()` se ejecuta cada `OUTBOX_POLL_INTERVAL_MS` ms (default 2000):

1. `FOR UPDATE SKIP LOCKED` — reclama un batch de filas `pending`/`failed`
2. Marca cada fila como `publishing`
3. `PubSubRealtimeTransport.publish(event)` → topic Pub/Sub `realtime-events` (ordering por `conversationId`)
4. Marca como `published`

Estados posibles de una fila: `pending → publishing → published` (o `failed` con retries exponenciales, y `dead_letter` tras `maxRetries`).

### 6.3 API: push subscription, dedup y gateway

La API recibe la push subscription HTTP (`POST /pubsub/realtime`) y `RealtimeApiSubscriber.handleEvent()` entrega el evento al gateway:

1. Valida que el mensaje sea un `RealtimeDurableEvent` o `RealtimeEphemeralEvent`
2. Para críticos: dedup LRU en proceso con TTL 60s por `eventId` — evita reemisiones duplicadas
3. `gateway.emitRealtimeEvent(event)`

### 6.4 Gateway: routing al socket correcto

```typescript
emitDurableEvent(event):
  conversation.message.new  → room conversation:{id}  (solo quien abrió esa conversación)
                              + admin.notification si messagePatch.direction === 'inbound'
  conversation.handover     → namespace /admin (todos) + admin.notification
  conversation.updated      → namespace /admin (todos)
  admin.notification        → namespace /admin (todos)
  default                   → namespace /admin (todos)
```

---

## 7. Pipeline frontend paso a paso

### 7.1 Conexión y autenticación

`RealtimeManager.connect()` crea un socket hacia `/admin` con el access token en `auth.token`. El backend valida el JWT en `socketAuthMiddleware`.

### 7.2 Dos handlers independientes

**Handler 1 — `admin.notification`** (campana/toast):

```typescript
this.socket.on('admin.notification', (payload: unknown) => {
  if (!isAdminNotificationPayload(payload)) return;
  useNotificationStore.getState().addNotification(entry);
  this.enqueueNotificationToast(entry);
});
```

No pasa por `EventRouter`. Va directo al store y al sistema de toasts.

**Handler 2 — `CONVERSATION_EVENTS`** (actualización de UI):

```typescript
for (const event of CONVERSATION_EVENTS) {
  this.socket.on(event, (payload: unknown) => {
    if (this.shouldDropInvalidDurablePayload(payload)) return; // guarda 1
    if (this.trackDurableEventId(payload)) return; // guarda 2 (dedup)
    this.router.dispatch(event, payload);
  });
}
```

`CONVERSATION_EVENTS` incluye: `conversation.message.new`, `conversation.updated`, `conversation.handover`, `conversation.typing`, `conversation.ai.chunk`, `conversation.ai.done`.

### 7.3 EventRouter — fan-out a consumidores

`EventRouter` distribuye cada evento a los `EventConsumer` registrados. Un consumidor puede filtrar por `conversationId`:

```typescript
manager.router.register({
  id: 'thread-conv-123',
  conversationId: 'conv-123',   // opcional — si se omite, recibe todos
  events: ['conversation.message.new', 'conversation.updated'],
  handler: (event, payload) => { ... },
});
```

### 7.4 Parche optimista con fallback REST

`useConversationThread` y `useTicketDetail` intentan aplicar `tryApplyRealtimePatch()` para actualizar el estado local sin hacer fetch:

- Si el parche aplica → `setMessages()` / `setConversation()` inmediato
- Si el parche falla → `refreshThread()` (REST refetch como fallback)

`useConversations` (inbox) usa una estrategia diferente: en vez de parchear la lista, hace un refetch completo debounced a 300ms.

---

## 8. Tabla de eventos actuales

| `socketEventName`          | `eventType`             | Origen                                                          | Routing socket           | Activa campana               |
| -------------------------- | ----------------------- | --------------------------------------------------------------- | ------------------------ | ---------------------------- |
| `conversation.message.new` | `message.created`       | `MessageOrchestratorService` (inbound)                          | Sala `conversation:{id}` | Sí, si `direction=inbound`   |
| `conversation.message.new` | `message.created`       | `MessageService` (outbound)                                     | Sala `conversation:{id}` | No (`direction=outbound`)    |
| `conversation.updated`     | `conversation.updated`  | `ConversationsService.assign/close/reopen/transfer`             | Namespace (todos)        | No                           |
| `conversation.updated`     | `conversation.updated`  | `MessageOrchestratorService` (acompañante de message.created)   | Namespace (todos)        | No                           |
| `conversation.updated`     | `conversation.updated`  | `MessageService` (acompañante de message.created outbound)      | Namespace (todos)        | No                           |
| `conversation.handover`    | `conversation.handover` | `ConversationsService.assign` (solo cuando cambia a HUMAN_FLOW) | Namespace (todos)        | Sí (`conversation.handover`) |
| `admin.notification`       | `admin.notification`    | Gateway (derivado de message.new inbound / handover)            | Namespace (todos)        | N/A (es la campana misma)    |
| `conversation.typing`      | `conversation.typing`   | Ephemeral                                                       | Sala `conversation:{id}` | No                           |
| `conversation.ai.chunk`    | `conversation.ai.chunk` | Ephemeral (AI stream pub/sub)                                   | Sala `conversation:{id}` | No                           |
| `conversation.ai.done`     | `conversation.ai.done`  | Ephemeral (AI stream pub/sub)                                   | Sala `conversation:{id}` | No                           |

---

## 9. Quién produce cada evento y desde dónde

### `message.created` + `conversation.updated` (par inbound)

**Archivo:** `backend/src/services/orchestrator/message-orchestrator.service.ts` → `persistInboundMessageWithOutbox()`

```typescript
// Una sola transacción atómica:
await notifyCritical(tx, buildMessageCreatedEvent(...));      // conversation.message.new
await notifyCritical(tx, buildConversationUpdatedEvent(...)); // conversation.updated
```

### `message.created` + `conversation.updated` (par outbound)

**Archivo:** `backend/src/services/message.service.ts` → `persistMessageWithOutbox()`

Mismo patrón de doble escritura en transacción.

### `conversation.updated` (acciones de gestión)

**Archivo:** `backend/src/services/conversations.service.ts`

- `assign()` → handover o updated según si cambia a HUMAN_FLOW
- `close()` → updated
- `reopen()` → updated
- `transfer()` → updated

### `conversation.handover`

**Archivo:** `backend/src/services/conversations.service.ts` → `assignDurable()`, también `ConversationStateMachine` en legacy.

### `admin.notification` (campana)

**NO es un evento producido directamente** por los servicios de dominio en modo durable. Es una consecuencia que el gateway emite en tiempo real al recibir ciertos eventos:

- `conversation.message.new` con `messagePatch.direction === 'inbound'` → emite `admin.notification` tipo `message.received`
- `conversation.handover` → emite `admin.notification` tipo `conversation.handover`

**Archivo:** `backend/src/services/realtime/websocket-gateway.service.ts` → `emitDurableEvent()`

---

## 10. Routing de Socket.IO en el gateway

```text
Namespace /admin (todos los admins autenticados)
│
├── Salas automáticas
│     user:{userId}   ← al conectar
│
├── Salas de conversación (manuales)
│     conversation:{conversationId}
│     ← socket emite 'conversation.subscribe' cuando abre un hilo
│     ← socket emite 'conversation.unsubscribe' al cerrar
│
└── Tabla de routing por evento:
      Evento                    Destino
      ──────────────────────────────────────────────────────────
      conversation.message.new  to('conversation:{id}')
      admin.notification        namespace.emit (todos)
      conversation.updated      namespace.emit (todos)
      conversation.handover     namespace.emit (todos)
      conversation.typing       to('conversation:{id}')
      conversation.ai.chunk     to('conversation:{id}')
      conversation.ai.done      to('conversation:{id}')
```

**Implicación práctica:** un admin que no tenga ninguna conversación abierta **recibirá** `conversation.updated` y `admin.notification`, pero **no** `conversation.message.new` (salvo que esté suscrito a esa sala).

---

## 11. Guardianes del frontend: por qué un evento puede descartarse

El `RealtimeManager` aplica dos filtros antes de despachar `CONVERSATION_EVENTS`:

### Guarda 1 — `shouldDropInvalidDurablePayload`

Si el payload parece un sobre durable (tiene `eventId`, `correlationId`, `schemaVersion`, `socketEventName`, `occurredAt`, `source`, `conversationId`) pero **falla la validación Zod**, se descarta **silenciosamente sin fallback REST**.

Causas comunes de fallo:

- `eventId` o `conversationId` no son UUID válidos
- `occurredAt` no tiene sufijo `Z` o `+HH:MM` (falla `z.string().datetime()`)
- `schemaVersion` != `1`
- `eventType` o `socketEventName` no están en los enums registrados
- `messagePatch.id` no es UUID

### Guarda 2 — `trackDurableEventId`

LRU de los últimos 500 `eventId` vistos. Si el mismo `eventId` llega dos veces (reentrega de relay), el segundo se descarta. El set se limpia en cada reconexión.

### En `tryApplyRealtimePatch`

Si el parche no puede aplicarse (conversación no cargada, `conversationId` no coincide, estado no soportado), retorna `applied: false` y el hook hace fallback a `refreshThread()`. Casos que causan fallo silencioso:

- `conversationPatch.status` = `in_progress` o `resolved` — no soportados aún, usa REST
- `messagePatch` ausente en un evento `conversation.message.new`
- `conversationId` del payload != `conversationId` del hook

---

## 12. Cómo agregar un nuevo tipo de notificación

### Escenario A — Notificación de campana para un nuevo evento de negocio

**Ejemplo:** "Ticket asignado" debe mostrar una notificación en la campana.

### Paso 1 — Backend: decidir si es crítico o efímero

`ticket.assigned` ya existe en `CriticalEventType`. Agregar la producción en el servicio:

```typescript
// En TicketService o ConversationsService (dentro de una transacción)
await this.realtimeNotifier.notifyCritical(tx, {
  eventId: randomUUID(),
  correlationId,
  schemaVersion: 1,
  eventType: CriticalEventType.TicketAssigned,
  socketEventName: SocketEventName.AdminNotification, // ← usar admin.notification
  occurredAt: new Date().toISOString(),
  source: 'ticket.service',
  conversationId,
  notificationPatch: {
    type: 'ticket.assigned',
    title: 'Ticket asignado',
    body: `Ticket #${ticketId} asignado a ${agentName}`,
    ticketId,
    conversationId,
  },
});
```

Si `socketEventName` es `admin.notification`, el gateway ya lo enruta a todos por defecto (ver `case SocketEventName.AdminNotification:` en `emitDurableEvent`). **No es necesario tocar el gateway.**

**Paso 2 — Frontend: extender el tipo `AdminNotificationPayload`**

En `frontend/lib/shared/realtime/types.ts`:

```typescript
export interface AdminNotificationPayload {
  type: 'message.received' | 'conversation.handover' | 'ticket.assigned'; // ← añadir
  conversationId: string;
  occurredAt: string;
  // campos opcionales si los necesitas:
  ticketId?: string;
}
```

Actualizar el schema Zod `adminNotificationPayloadSchema` en el mismo archivo.

### Paso 3 — Frontend: mostrar en la campana

En `frontend/components/shared/notifications-bell.tsx`, agregar el `type` nuevo al mapeo de `toDisplayNotification`.

---

### Escenario B — Nuevo evento que actualiza datos en tiempo real (sin campana)

**Ejemplo:** cuando se reasigna un departamento, actualizar la columna "Departamento" en el hilo sin recargar.

**Paso 1 — Backend:** producir un `conversation.updated` con `conversationPatch.assignedDept`:

```typescript
await notifyCritical(tx, {
  eventId: randomUUID(),
  correlationId,
  schemaVersion: 1,
  eventType: CriticalEventType.ConversationUpdated,
  socketEventName: SocketEventName.ConversationUpdated,
  occurredAt: new Date().toISOString(),
  source: 'assignment.service',
  conversationId,
  conversationPatch: {
    id: conversationId,
    assignedDept: newDepartmentSlug,
    updatedAt: new Date().toISOString(),
  },
});
```

**Paso 2 — Frontend:** `useConversationThread` ya consume `conversation.updated` y aplica `applyConversationPatch`. Asegurarse de que `ConversationDetailDto` incluya el campo `assignedDept` y que `applyConversationPatch` en `patch-helpers.ts` lo copie correctamente (ya lo hace).

---

### Escenario C — Nuevo evento efímero (best-effort, sin persistencia)

**Ejemplo:** indicador de "agente viendo la conversación" (presence).

```typescript
// En un controller o handler WS:
await realtimeNotifier.notifyEphemeral({
  eventType: EphemeralEventType.PresenceUpdate,
  socketEventName: SocketEventName.ConversationTyping, // reusar sala
  payload: {
    conversationId,
    userId,
    action: 'viewing',
  },
});
```

Frontend: registrar un consumer en el hook apropiado para `conversation.typing` o crear un nuevo socket event name si es necesario (requiere actualizar `CONVERSATION_EVENTS` en `realtime-manager.ts` y el switch en `emitEphemeralEvent` en el gateway).

---

## 13. Cómo consumir un evento en un nuevo hook o componente

### Patrón estándar (con filtro por conversación)

```typescript
import { useRealtimeManager } from '@/components/shared/providers/realtime-provider';
import { useEffect } from 'react';

export function useMyFeature(conversationId: string) {
  const manager = useRealtimeManager();

  useEffect(() => {
    if (!manager) return;

    const handler = (event: string, payload: unknown) => {
      // payload ya pasó los guardas de validación y dedup
      console.log(event, payload);
    };

    manager.router.register({
      id: `my-feature-${conversationId}`,
      conversationId, // filtra solo esta conversación
      events: ['conversation.updated'],
      handler,
    });

    return () => {
      manager.router.unregister(`my-feature-${conversationId}`);
    };
  }, [manager, conversationId]);
}
```

### Patrón sin filtro de conversación (recibe todos)

```typescript
manager.router.register({
  id: 'global-listener',
  // conversationId omitido → recibe eventos de todas las conversaciones
  events: ['conversation.updated', 'conversation.message.new'],
  handler: (_event, _payload) => {
    doSomething();
  },
});
```

Usado en `useConversations` (inbox) para refrescar la lista cuando cualquier conversación cambia.

### Suscribirse a la sala de una conversación

Para recibir `conversation.message.new` (room-scoped), además de registrar el consumer, hay que unirse a la sala:

```typescript
manager.subscribe(conversationId); // emite 'conversation.subscribe' al servidor

return () => {
  manager.router.unregister(consumerId);
  manager.unsubscribe(conversationId); // emite 'conversation.unsubscribe'
};
```

`useConversationThread` y `useTicketDetail` ya hacen esto automáticamente.

---

## 14. Variables de entorno relevantes

| Variable                   | Dónde                  | Descripción                                                          |
| -------------------------- | ---------------------- | -------------------------------------------------------------------- |
| `REALTIME_DURABLE_ENABLED` | Backend (API + Worker) | `true` activa todo el pipeline durable outbox/relay. Default `true`. |
| `WORKERS_ENABLED`          | Backend                | `true` en el proceso worker para que corra el relay. `false` en API. |
| `WS_ENABLED`               | Backend                | `true` en el proceso API para exponer Socket.IO. `false` en worker.  |
| `OUTBOX_POLL_INTERVAL_MS`  | Backend Worker         | Frecuencia del ciclo de relay (ms).                                  |
| `NEXT_PUBLIC_WS_ENABLED`   | Frontend               | `false` para deshabilitar WebSocket en el cliente.                   |
| `NEXT_PUBLIC_WS_URL`       | Frontend               | URL del servidor API (donde vive Socket.IO).                         |
| `NEXT_PUBLIC_WS_PATH`      | Frontend               | Path de Socket.IO. Default `/socket.io`.                             |

---

## 15. Debugging checklist

### "La campana no suena"

1. ¿Llega `admin.notification` al WebSocket? → Abrir DevTools > Network > WS, buscar frame `admin.notification`.
2. ¿`REALTIME_DURABLE_ENABLED=true`? → Gateway solo emite `admin.notification` desde `emitDurableEvent`, no desde el bridge legacy.
3. ¿El relay está corriendo? → Logs del worker: buscar `relay.published`.
4. ¿El evento tiene `messagePatch.direction === 'inbound'`? → Solo mensajes inbound activan la campana.

### "`conversation.message.new` no aparece en el hilo"

1. ¿El socket está en la sala correcta? → `conversation.subscribe` debe haberse emitido. Verificar en `useSubscriptionStore.getState().getActiveRooms()`.
2. ¿El evento llegó al socket? → Logs de consola: `{"status":"received","eventName":"conversation.message.new"}`.
3. ¿El evento fue descartado por el guardián? → Buscar `{"status":"dropped_invalid_payload"}` o `{"status":"deduped"}`.
4. ¿`tryApplyRealtimePatch` devolvió `applied: false`? → Buscar `{"status":"fallback_refetch"}` en consola del browser.

### "El evento llega al socket pero no actualiza la UI"

1. ¿`conversationId` del payload coincide con el de la ruta? → `tryApplyRealtimePatch` lo verifica.
2. ¿`messagePatch.id` es UUID válido? → Si no, el evento se descarta en el guardián 1.
3. ¿`occurredAt` tiene sufijo `Z`? → `z.string().datetime()` requiere zona horaria explícita.
4. ¿`conversationPatch.status` es `'in_progress'` o `'resolved'`? → No soportados en `applyConversationPatch`, cae a REST refetch.

### Verificar en base de datos

```sql
-- Ver últimos eventos del outbox
SELECT id, event_type, socket_event_name, status, attempts, created_at
FROM realtime_outbox_events
ORDER BY created_at DESC
LIMIT 20;

-- Eventos que no se publicaron
SELECT * FROM realtime_outbox_events
WHERE status IN ('pending', 'failed', 'dead_letter')
ORDER BY created_at DESC;
```

### Logs del backend (structured JSON)

Buscar por `component`:

- `RealtimeNotifier` → `outbox.write` (escritura en DB)
- `RealtimeOutboxRelay` → `relay.publish` (publicación al topic Pub/Sub)
- `RealtimeApiSubscriber` → `subscriber.receive`, `subscriber.dedupe`, `subscriber.emit`
- `WebsocketGatewayService` → `gateway.emit`
