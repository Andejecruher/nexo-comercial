# Feature: realtime hardening — checklist §9 de notifications-architecture.md

## Objetivo

Cerrar los tres secundarios de "Media prioridad" del §9 de
`docs/notifications-architecture.md`:

1. Test de integración del fan-out del `@socket.io/gcp-pubsub-adapter`
   (proteger el upgrade de `@google-cloud/pubsub` v6).
2. Verificar la exportación de RealtimeMetrics a Cloud Monitoring.
3. Test de smoke de arranque: `WS_ENABLED && !REALTIME_DURABLE_ENABLED` ⇒
   `INBOX_POLLING_ENABLED` en la API (evitar puente legacy mudo).

## Problema

- El test `websocket-gateway.adapter.fanout.test.ts` existente es un **fake**:
  un `EventEmitter` local que no toca el adapter real ni Pub/Sub. No protege
  nada del upgrade de `@google-cloud/pubsub` v4→v6 (tipos pinneados a v4 con
  cast `as never` en `buildSocketIoAdapter`, websocket-gateway.service.ts:512).
- RealtimeMetrics verificado: NO exporta a Cloud Monitoring. `createRealtimeMetrics`
  (realtime-observability.service.ts:38) solo emite logs estructurados a nivel
  **debug** (`metrics.counter|gauge|histogram`), y `isLogLevelEnabled('debug')`
  con `LOG_LEVEL` default `info` los descarta. Hoy no hay observabilidad de
  métricas realtime en prod (solo los logs `gateway.emit`/boundary en info).
- El puente legacy (`legacyCriticalEventBusBridgeEnabled: !REALTIME_DURABLE_ENABLED`,
  server.ts:168) queda mudo si el orquestador no corre en el proceso API: el
  orquestador vive dentro de `InboxProcessorService`, que solo arranca sí
  `INBOX_POLLING_ENABLED` (routes/index.ts:216). La combinación
  `WS_ENABLED && !REALTIME_DURABLE_ENABLED && !INBOX_POLLING_ENABLED` → socket
  escucha eventBus que nadie produce. Nada valida la bandera al arrancar.

## Alcance autorizado (allowed edit surfaces)

- `backend/src/services/realtime/realtime-runtime.factory.ts` (función pura
  `realtimeStartupHazards` + types).
- `backend/src/__tests__/unit/realtime/realtime-runtime.factory.test.ts` (describe
  nuevo, tabla de verdad).
- `backend/src/server.ts` (log warn de hazards al arranque, solo API).
- `backend/src/__tests__/unit/realtime/websocket-gateway.adapter.fanout.test.ts`
  (reescritura: INT real gated por `PUBSUB_EMULATOR_HOST`).
- `backend/src/services/realtime/realtime-observability.service.ts` +
  `realtime-observability.service.test.ts` (log-based metrics, T2).
- `backend/package.json` (+ devDep `socket.io-client@^4.8` para el client del INT).

Fuera de alcance: `websocket-gateway.service.ts` (el cast `as never` se respeta,
se documenta), cambios de comportamiento de flags, `realtime-observability.service.ts`
(hasta decisión de T2).

## Tareas

- [x] T1 (INT fan-out): reescribir `websocket-gateway.adapter.fanout.test.ts`.
      Dos servidores HTTP + dos `WebsocketGatewayService.create` con
      `pubsubAdapter.enabled: true` (mismo topic/subscriptionPrefix),
      dos socket.io-clients en `/admin`, ambos suscritos a la misma
      conversación; `gatewayA.emitRealtimeEvent(durable_event)` llega al
      cliente de B (fan-out cross-instancia) y broadcast namespace también.
      Gating: `describe.skipIf(!process.env.PUBSUB_EMULATOR_HOST)` — sin
      emulador salta (nunca toca GCP real); con emulador (localhost:8680)
      corre real. Cleanup: disconnect clients, dispose gateways, close
      servers, best-effort delete del topic/subscriptions.
      EVIDENCIA: `PUBSUB_EMULATOR_HOST=localhost:8680 pnpm jest …adapter.fanout`
      → 2/2 verde en ~2.1s (adapter real + pubsub v6 contra el emulador).
      Sin la env: suite skipea (1 skipped en la corrida completa).
- [x] T2 (métricas): VERIFICADO + RESUELTO vía **log-based metrics** (decisión
      del usuario). `createRealtimeMetrics` ahora emite `metrics.counter|gauge|
      histogram` a nivel **info** (antes debug, descartado con LOG_LEVEL
      default info) — aterrizan en Cloud Logging siempre y desde GCP se crean
      log-based metrics. Sin dependencia nueva ni flag. Test actualizado a
      console.log + `LOG_LEVEL=info`; caso nuevo de silencio a `LOG_LEVEL=warn`.
      Archivos: `realtime-observability.service.ts:38` (3 emits debug→info +
      doc), `realtime-observability.service.test.ts` (8 casos, 8/8 verde).
- [x] T3 (flags smoke): función pura `realtimeStartupHazards(deps)` en
      `realtime-runtime.factory.ts`. Regla API:
      `wsEnabled && !realtimeDurableEnabled && !inboxPollingEnabled` →
      hazard `legacy_eventbus_bridge_mute`. Otras combinaciones sin hazard.
      Tests de tabla de verdad (describe `realtimeStartupHazards`: 9 casos,
      incluye worker inmune a la regla). Wiring: `server.ts` loguea `warn`
      cada hazard al arranque vía `logRealtimeBoundary` (sin throw — no
      romper rollbacks). EVIDENCIA: factory test 19/19 verde; typecheck y
      lint limpios.

## Criterios de aceptación

1. [x] `pnpm test` sin emulador: `websocket-gateway.adapter.fanout` skippea
      limpio y el resto queda verde (136 suites, 1371 passed, 0 fallos).
2. [x] `PUBSUB_EMULATOR_HOST=localhost:8680 pnpm jest …adapter.fanout` pasa:
      2/2, probando 2 instancias reales del adapter contra el emulador.
3. [x] `realtimeStartupHazards` devuelve exactamente el hazard esperado solo
      en la combinación de la regla (tabla de verdad en el test).
4. [x] Backend typecheck/lint limpios; suite completa verde con emulador:
      137 suites / 1374 tests, 0 fallos. Nota:
      `typecheck:test` falla en 2 tests pre-existentes fuera del diff
      (`notification-projector.service.test.ts`,
      `realtime-api-subscriber.service.test.ts`) — no introducidos acá.
5. [x] Métricas realtime observables: `metrics.*` a nivel info con
      `LOG_LEVEL=info` (default) y silenciosas a warn o superior.

## Notas de la sesión

- Emulador corriendo en `localhost:8680` (contenedor
  `voz-ciudadana-dev-pubsub-emulator-1`), publicado puerto 8680 host.
- El INT usa `jest.mock('../../../utils/token.util')` (verifyAccessToken fake)
  como el service test, para que los clients pasen el `socketAuthMiddleware`
  del namespace `/admin`.
- socket.io server v4.8.3 ⇒ devDep `socket.io-client@^4.8` (mismo protocolo
  Engine.IO).