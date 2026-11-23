# Feature: integración WIP de alertas de notificaciones con el catch-up

## Objetivo

Validar la integración del WIP del usuario (alertas: `useRealtimeSounds`,
`sound-player`, bell, modal, chat components) con el catch-up del centro de
notificaciones (commit `fb84f55`), corregir lo que no cierre con tests, y
commitear el conjunto validado como una unidad de trabajo.

## Problema

El WIP cambia la capa de sonidos para escuchar el evento crudo
`admin.notification` (vía router). El catch-up del manager inyecta notificaciones
al store SIN pasar por el router — el contrato "catch-up no dispara sonidos"
se cumple hoy solo como efecto de la implementación, sin test que lo fije.
Además existe una carrera de dedupe: la entrada live usa id
`${conversationId}-${Date.now()}` y la del catch-up usa `row.id` (uuid de la DB),
por lo que el dedupe por `knownIds` nunca matchea entre fuentes.

## Alcance autorizado (allowed edit surfaces)

- `frontend/lib/realtime/realtime-manager.ts`
- `frontend/lib/realtime/__tests__/realtime-manager.test.ts`
- `backend/src/services/orchestrator/message-orchestrator.service.ts` (solo strip de console.log de debug)
- `frontend/components/admin/chat-list.tsx` (solo strip de console.log de debug)
- `frontend/components/domain/messaging/MessageBubble.tsx` (solo strip de console.log de debug)

Fuera de alcance en esta feature: cambios de comportamiento en
`chat-window.tsx` (remoción de TicketHistoryPanel — pendiente confirmación del
usuario), bell, modal, `useRealtimeSounds.ts`, `sound-player.ts`.

## Tareas

- [x] T1 Revisión del WIP vs catch-up (rutas: inline + codegraph). Evidencia abajo.
- [x] T2 Strip de console.log de debug (orchestrator, chat-list, MessageBubble).
      Nota: chat-list.tsx quedó byte-idéntico a HEAD (todo su WIP era el effect
      de debug) — desaparece de `git status`, es esperado.
- [x] T3 Dedupe por identidad natural live↔catch-up en RealtimeManager.
      RED→GREEN observado (test de carrera falló con 2 entradas/2 toasts antes
      del fix). Guard en handler live antes de TODOS los consumidores; en el
      loop del catch-up junto al fast-path por id; watermark avanza siempre.
- [x] T4 Tests de regresión (4): delta sin dispatch al router; seed sin
      toasts/dispatch; carrera live-durante-fetch (RED→GREEN); redelivery
      duplicado (RED→GREEN). Mock de apiClient.get extendido + limpieza del
      watermark en beforeEach.
- [x] T5 Verificación: frontend typecheck/lint limpios + 473/473 (469 base + 4
      nuevos, re-ejecutados por el orquestador); backend typecheck/lint limpios
      + 14/14 (notification-projector|realtime-api-subscriber). Assess del
      diff: risk=medium (RDD off → self-verification + spot check del padre,
      aplicados).
- [x] T6 Commit work-unit: `5d06b0d` feat(notifications): align realtime alerts
      with the notification catch-up — 12 archivos, 417+/91−, hook lint-staged
      convergente (lo commiteado = lo verificado). Remoción del TicketHistoryPanel
      confirmada INTENCIONAL por el usuario (redundante); el archivo
      `ticket-history-panel.tsx` queda sin borrar (decisión del usuario, queda
      como código muerto referenciable). Excluidos del commit:
      `.atl/skill-registry.md`, `next-env.d.ts`, `tsconfig.tsbuildinfo`.

## Criterios de aceptación

1. El seed del catch-up (primera vez) no dispara toasts, sonidos ni notificaciones
   de escritorio; el delta dispara toasts pero tampoco sonidos (capa de sonidos
   = solo eventos live del router).
2. Un evento live `admin.notification` que aterriza durante la ventana del fetch
   del catch-up produce UNA sola entrada en el store y UN solo toast.
3. Un redelivery duplicado de `admin.notification` (at-least-once de Pub/Sub,
   sin cobertura del LRU de eventId que solo cubre CONVERSATION_EVENTS) no
   duplica entrada/toast/dispatch.
4. 469+ tests frontend verdes, typecheck y lint limpios en ambos lados.

## Hallazgos de la revisión (T1)

- **Cierra**: catch-up nunca pasa por el router → sin sonidos/alertas de
  escritorio (seed y delta). El watermark avanza con cada evento live y cada
  fila del catch-up; el backend filtra `occurredAt > since` (gt estricto) → sin
  re-fetch del borde. Sin doble sonido live: el hook ya no escucha
  `NUEVO_TICKET`; `ticket.created` + `admin.notification` del mismo mensaje = 1
  sonido (test del WIP lo cubre). El modal/preferencias son solo estado de
  preferencias (`useSoundPreferencesStore`), no consumen datos de notificaciones.
- **No cierra**: dedupe id-mismatch live↔catch-up (carrera + redelivery sin
  cobertura); console.log de debug en 3 archivos; `catchUpNotifications` sin
  tests de cobertura (el mock actual de `@/lib/api-client` solo provee
  `tryRefreshToken`, el catch-up falla silencioso en los tests existentes).
- **Diseño del fix**: clave de identidad natural
  `${type}|${conversationId}|${Date.parse(occurredAt)}` (instante, no string, para
  tolerar `.000Z` vs `Z`). Guard de equivalencia leyendo el store vigente en
  ambos paths (live handler y loop del catch-up) — cubre ambas direcciones de la
  carrera y el redelivery. En el handler live, el guard salta TODO (add, toast,
  dispatch al router, derivación semántica). Riesgo residual documentado: dos
  eventos distintos del mismo tipo+conversación en el mismo milisegundo colisionan
  (irrelevante en la práctica: orderingKey serializa por conversación).
- **A confirmar con el usuario**: chat-window.tsx del WIP remueve el
  TicketHistoryPanel por completo (sin otras referencias → código muerto).
  ¿Intencional? ¿Se borra el componente también?

## Verificación

- Frontend: `cd frontend && pnpm typecheck && pnpm lint && pnpm test`
- Backend: `cd backend && pnpm typecheck && pnpm lint && pnpm test "notification-projector|realtime-api-subscriber"`

## Estado / próximo paso

**Feature COMPLETA** (T1–T6). Commit `5d06b0d` en main local (4º commit local
sin push, precede: 3577a90, fb84f55, a6d148b). Verificación final: frontend
473/473 + typecheck/lint limpios; backend 14/14 + typecheck/lint limpios.

Pendientes opcionales (§9 del doc de arquitectura, prioridad media):
test de integración del fan-out del `@socket.io/gcp-pubsub-adapter`, export de
RealtimeMetrics a Cloud Monitoring, smoke test de flags de arranque
(WS_ENABLED && !REALTIME_DURABLE_ENABLED ⇒ INBOX_POLLING_ENABLED en la API).
