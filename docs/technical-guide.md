# Guia tecnica del proyecto

Esta guia describe arquitectura, convenciones y flujos tecnicos del monorepo.

## Vista general

- Monorepo con pnpm workspaces.
- Backend en Express + TypeScript + Prisma + PostgreSQL.
- Frontend en Next.js App Router + React.
- Orquestacion local con Docker Compose profiles (dev, test, prod).

## Estructura de paquetes

- backend: API, workers de eventos, Prisma, tests.
- frontend: app web publica + admin, SEO, UI y experiencia de usuario.

## Dependencias y lockfile

- Gestion unica con **pnpm** en la raiz; el lockfile canonico es `pnpm-lock.yaml`.
- Para altas/bajas de paquetes del backend: `pnpm --filter voz-ciudadana-api add|remove <pkg>` y commit de `pnpm-lock.yaml`.
- Instalacion reproducible: `pnpm install --frozen-lockfile`.
- Docker backend: ver [dependency-policy.md](dependency-policy.md) y [infrastructure-containers.md](infrastructure-containers.md).

## Backend: arquitectura por capas

- src/config: carga y validacion de entorno con zod.
- src/routes: registro de rutas y composicion de dependencias.
- src/controllers: adaptadores HTTP.
- src/services: reglas de negocio e integraciones.
- src/middlewares: auth, firma Meta, idempotencia, errores.
- src/database: acceso compartido a Prisma.
- `src/__tests__/`: unit + integration.

Principio operativo: server.ts inicializa infraestructura y routes/index.ts resuelve wiring de modulos.

## Frontend: arquitectura por capas

- app: rutas y layouts con App Router.
- components: libreria de componentes y bloques de dominio.
- hooks: logica reutilizable de presentacion.
- lib: utilidades cross-cutting (incluye metadata/SEO).
- public: assets estaticos.

## Flujos de ejecucion

### Desarrollo diario

```bash
make dev-up
pnpm --dir frontend dev
```

### Calidad

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm --dir frontend check
```

### Prisma

```bash
pnpm --dir backend prisma:generate
pnpm --dir backend prisma:migrate
pnpm --dir backend prisma:seed        # core only (safe default)
pnpm --dir backend prisma:seed:all    # core + dev + test (requires SUPERADMIN_PASSWORD)
pnpm --dir backend prisma:migrate:prod
```

Comandos operativos de desarrollo para DB:

```bash
make dev-db-seed
make dev-db-reset-seed
```

## Entorno y configuracion

Backend:

- Variables criticas: `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `WHATSAPP_*`.
- Realtime admin:
  - `WS_ENABLED` (default `true`)
  - `WS_CORS_ORIGIN` (default hereda `CORS_ORIGIN`)
  - `WS_PATH` (default `/socket.io`)
- Workers y polling (opcionales):
  - `WORKERS_ENABLED` (default `true`)
  - `BACKGROUND_EXECUTION_BACKEND` (default `polling`; valores: `polling | cloud_tasks`)
  - `INBOX_POLL_INTERVAL_MS` (default `2000`)
  - `OUTBOX_POLL_INTERVAL_MS` (default `1000`)
  - `QUEUE_RETRY_PROMOTION_INTERVAL_MS` (default `5000`)
- Horarios de departamentos: la disponibilidad operativa usa una zona horaria centralizada `America/Mexico_City` mientras no exista configuración por municipio/tenant. Los intervalos usan inicio inclusivo y fin exclusivo; los horarios que cruzan medianoche deben dividirse entre dos días.
- Puerto por defecto: 8000.
- API base: /api/v1.

Despliegue sugerido para separar API y workers:

- API instance: `WORKERS_ENABLED=false` (solo atiende HTTP y persiste eventos).
- Worker instance: `WORKERS_ENABLED=true` + `BACKGROUND_EXECUTION_BACKEND=polling` (hace polling de `inbox_events`/`outbox_events` en PostgreSQL) o `cloud_tasks` en produccion (Cloud Tasks invoca al worker por HTTP).
- Ambas instancias comparten `DATABASE_URL` (PostgreSQL).

Frontend:

- Variables opcionales:
  - `NEXT_PUBLIC_BASE_URL`
  - `NEXT_PUBLIC_API_URL`
  - `NEXT_PUBLIC_WS_URL` (default usa `NEXT_PUBLIC_API_URL`)
  - `NEXT_PUBLIC_WS_PATH` (default `/socket.io`)
  - `NEXT_PUBLIC_WS_ENABLED` (default `true`)

Operacion en Railway/Vercel:

- Railway sirve HTTP + Socket.IO en el mismo servicio backend.
- Vercel consume API HTTP y socket contra el dominio Railway.
- Si hay dominios cruzados, fijar `WS_CORS_ORIGIN` al dominio frontend para mantener CORS estricto.
- El frontend mantiene polling como fallback cuando el socket esta desconectado.

## Seguridad y control

- helmet + cors para hardening HTTP.
- auth middleware para rutas protegidas.
- RBAC con roles SUPERADMIN y COORDINADOR en modulos administrativos.
- Verificacion de firma Meta + idempotencia en webhook.
- Rate limiting y lockout progresivo en auth.

## Eventos y mensajeria

- InboxProcessorService procesa eventos entrantes desde webhook.
- OutboxProcessorService despacha eventos salientes.
- MessageService centraliza envio outbound + adjuntos.
- Estado conversacional modelado con ConversationStateMachine.

## Documentacion complementaria

- backend/docs/README.md
- backend/docs/database-schema.md
- backend/docs/whatsapp-messaging-flow.md
- docs/backend-modules-map.md
- postman/voz-ciudadana.postman_collection.json
