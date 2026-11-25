# Nexo Comercial

Plataforma de atención, canales y operación comercial, con canal principal por WhatsApp y panel web en Next.js. El deploy a GCP está apagado; el playbook vive en [docs/DEPLOYMENT_GCP.md](docs/DEPLOYMENT_GCP.md).

## Estado actual

- Monorepo con pnpm workspaces: backend y frontend.
- Backend productivo con Express, Prisma, PostgreSQL y workers para eventos inbox/outbox.
- Frontend activo en Next.js App Router (sitio publico + seccion admin).

## Documentacion por audiencia

- Onboarding en 5 minutos: [docs/onboarding-5-min.md](docs/onboarding-5-min.md)
- Guia tecnica completa: [docs/technical-guide.md](docs/technical-guide.md)
- Infra Docker dev/prod: [docs/infrastructure-containers.md](docs/infrastructure-containers.md)
- Conexiones, escalado e infraestructura (Cloud SQL + Cloud Run): [docs/CLOUD_SQL_CONNECTION.md](docs/CLOUD_SQL_CONNECTION.md)
- Runtime Docker + VPS (API/Worker/Migrator): [docs/docker-runtime-vps.md](docs/docker-runtime-vps.md)
- Mapa detallado de modulos backend: [docs/backend-modules-map.md](docs/backend-modules-map.md)
- Durable realtime operations: [docs/realtime-durable-operations.md](docs/realtime-durable-operations.md)

## Estructura del repositorio

```text
nexo-comercial/
├── backend/
│   ├── docs/                  # Documentacion tecnica del backend
│   ├── prisma/                # schema.prisma, migraciones y seed
│   ├── src/
│   │   ├── config/            # Configuracion y validacion de variables
│   │   ├── controllers/       # Adaptadores HTTP (req/res)
│   │   ├── database/          # Prisma client singleton y acceso DB
│   │   ├── middlewares/       # Auth, errores, firma Meta, idempotencia
│   │   ├── routes/            # Registro de rutas y wiring de dependencias
│   │   ├── services/          # Logica de negocio e integraciones
│   │   ├── __tests__/         # Unit + integration tests
│   │   └── server.ts          # Bootstrap Express
│   ├── Dockerfile
│   └── package.json
├── frontend/
│   ├── app/                   # App Router (public + admin)
│   ├── components/            # UI reusable y modulos de dominio
│   ├── hooks/                 # Hooks de presentacion
│   ├── lib/                   # Utilidades y metadata/SEO
│   ├── public/                # Assets estaticos
│   ├── styles/                # Estilos globales
│   └── package.json
├── postman/                   # Colecciones para pruebas manuales API
├── deploy/Caddyfile           # Reverse proxy y TLS para produccion
├── docker-compose.dev.yml     # Stack local (API + Worker + Migrator + Frontend + Pub/Sub emulator)
├── docker-compose.qa.yml      # Stack QA (production-like, con Caddy)
├── docker-compose.prod.yml    # Stack produccion con Caddy
├── Makefile                   # Comandos operativos (dev/prod/validaciones)
├── .env.example               # Variables para compose y despliegue
├── pnpm-workspace.yaml        # Definicion de workspaces
└── railway.json               # Config de despliegue backend en Railway
```

## Arquitectura por capas

### Backend (Express)

| Capa        | Ubicacion                  | Responsabilidad                                    |
| ----------- | -------------------------- | -------------------------------------------------- |
| Config      | backend/src/config         | Carga y validacion de variables de entorno         |
| Routes      | backend/src/routes         | Registro de endpoints y middlewares por modulo     |
| Controllers | backend/src/controllers    | Adaptacion HTTP y delegacion a servicios           |
| Services    | backend/src/services       | Casos de uso, reglas de negocio, Prisma/PostgreSQL |
| Middlewares | backend/src/middlewares    | Cross-cutting: auth, seguridad, errores, firma     |
| Database    | backend/src/database       | Acceso centralizado al PrismaClient                |
| Tests       | backend/src/\_\_tests\_\_/ | Cobertura unitaria e integracion                   |

### Frontend (Next.js)

| Capa       | Ubicacion           | Responsabilidad                              |
| ---------- | ------------------- | -------------------------------------------- |
| App Router | frontend/app        | Rutas y layouts del sitio publico/admin      |
| Components | frontend/components | Componentes reutilizables (UI + negocio)     |
| Hooks      | frontend/hooks      | Comportamiento reutilizable para vistas      |
| Lib        | frontend/lib        | Helpers, metadata SEO, utilidades de dominio |
| Assets     | frontend/public     | Imagenes, manifest y recursos estaticos      |

## Stack tecnologico

### Backend

- Node.js 20+
- Express 4
- TypeScript strict
- Prisma ORM + PostgreSQL
- Swagger UI + OpenAPI
- JWT + middlewares de seguridad (helmet/cors)
- Jest + Supertest

### Frontend

- Next.js 16 (App Router)
- React 19
- TypeScript
- Tailwind CSS 4
- Radix UI + utilidades de interfaz

### DevOps y calidad

- Docker Compose separado por entorno (dev/prod) + Caddy en produccion
- Husky + lint-staged (pre-commit a nivel repositorio)
- ESLint + Prettier
- Makefile para comandos operativos del equipo

## Arquitectura de conexiones, escalado e infraestructura

Cada instancia de Cloud Run abre su **propio** pool de Prisma, del tamaño de `PRISMA_CONNECTION_LIMIT`. Como Cloud Run autoescala, el consumo real hacia Cloud SQL es `max-instances × PRISMA_CONNECTION_LIMIT` **por servicio**, y la suma de api + worker + relay debe caber con margen dentro de la capacidad de la instancia.

Configuracion vigente de la construccion documentada en [docs/DEPLOYMENT_GCP.md](docs/DEPLOYMENT_GCP.md). No hay despliegue activo. La fuente de los numeros es el `env` de [docs/deploy/deploy-gcp.yml](docs/deploy/deploy-gcp.yml), variables `DB_*`:

| Servicio              | `--max-instances` | `PRISMA_CONNECTION_LIMIT` | Peor caso |
| --------------------- | ----------------- | ------------------------- | --------- |
| `nexo-api`            | 5                 | 5                         | 25        |
| `nexo-worker`         | 5                 | 2                         | 10        |
| `nexo-realtime-relay` | 2                 | 2                         | 4         |
| **Total**             |                   |                           | **39**    |

Se suman la conexion del job `nexo-migrator` (1) y la reserva de superusuario de PostgreSQL (~3), para un peor caso efectivo de **40**.

> **Regla de oro:** no aumentar `--max-instances` ni `PRISMA_CONNECTION_LIMIT` sin haber escalado antes la memoria/tier de Cloud SQL.

Variables relevantes:

- **`DATABASE_URL`** (Secret Manager): la consume el CLI de Prisma (migrator y seeds) y es el fallback local. En Cloud Run el runtime la reemplaza por la URL de socket que arma desde las cuatro `CLOUDSQL_*`.
- **`PRISMA_CONNECTION_LIMIT`** (env directo, no es secreto): tamano del pool por contenedor; rango `1-40`. El workflow lo fija en cada deploy (API `5`, worker `2`, relay `2`) para que `gcloud` no revierta al default interno (10 en la API, 8 en el worker) y reabra el problema de saturacion.

Detalle completo — formula del presupuesto, techo real de la instancia, migraciones sin consumir el pool y guardas de verificacion en CI: [docs/CLOUD_SQL_CONNECTION.md](docs/CLOUD_SQL_CONNECTION.md).

## Async XLSX exports

Set `ENABLE_XLSX_EXPORT=true` to enable filtered XLSX exports for promoted citizens,
leaders, coordinators, and citizens. The API stores a job for 24 hours, dispatches it
to the worker, streams the workbook to a private Google Drive `exports/<module>`
folder, and serves an authenticated streaming download.

- `EXPORT_JOB_TTL_MS` defaults to `86400000` (24 hours).
- `EXPORT_JOB_POLL_INTERVAL_MS` defaults to `2000` (local polling worker).
- `EXPORT_RECONCILE_INTERVAL_MS` defaults to `3600000` (one hour).
- `EXPORT_BATCH_SIZE` defaults to `1000` rows; `EXPORT_STREAM_HIGH_WATER_MARK`
  defaults to `262144` bytes.
- `EXPORT_WATCHDOG_TIMEOUT_MS` defaults to `900000` (15 minutes).

The worker reconciliation loop removes expired Drive files and their jobs. Roll back
by setting `ENABLE_XLSX_EXPORT=false`; this returns `503` before job creation and
hides the admin button. The `export_jobs` migration is independent of source tables
and can be reverted without changing promoted, leader, coordinator, or citizen data.

Production enables the feature with `ENABLE_XLSX_EXPORT=true` on `nexo-api` and
`nexo-worker` (see `docs/DEPLOYMENT_GCP.md`). In `cloud_tasks` the API enqueues
`POST /tasks/export`. In local `polling` the worker loop claims `queued` jobs
the same way OCR/inbox do; Compose already runs `nexo-worker` with
`WORKERS_ENABLED=true`.

For a bounded large-export smoke test, mock 20,000 cursor-ordered rows in
`XlsxExportWriter`, consume its `PassThrough` output, and assert the resulting
workbook count without buffering it in the test process.

## Requisitos

- Node.js 20 o superior
- pnpm 10 o superior
- Docker y Docker Compose

## Inicio rapido

### 1) Instalar dependencias del monorepo

```bash
pnpm install
```

Politica de lockfile, pnpm y Docker (obligatorio para contribuciones que toquen dependencias): [docs/dependency-policy.md](docs/dependency-policy.md).

### 2) Configurar variables de entorno

Copia los ejemplos y ajusta valores:

```bash
cp .env.example .env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Variables minimas de backend:

```dotenv
NODE_ENV=development
PORT=8000
CORS_ORIGIN=*
WS_ENABLED=true
WS_CORS_ORIGIN=
WS_PATH=/socket.io

DATABASE_URL=postgresql://nexo:secret@postgres:5432/nexocomercial

# Pool de Prisma por contenedor. En Cloud Run el workflow lo fija (5 api/worker,
# 2 relay); nunca lo subas sin escalar antes el tier de Cloud SQL.
PRISMA_CONNECTION_LIMIT=5

# Workers/queues (opcionales, con defaults seguros)
WORKERS_ENABLED=true
BACKGROUND_EXECUTION_BACKEND=polling
INBOX_POLL_INTERVAL_MS=2000
OUTBOX_POLL_INTERVAL_MS=1000
QUEUE_RETRY_PROMOTION_INTERVAL_MS=5000

JWT_SECRET=change-me
JWT_REFRESH_SECRET=change-me-too

WHATSAPP_VERIFY_TOKEN=change-me
WHATSAPP_APP_ID=change-me
WHATSAPP_APP_SECRET=change-me
WHATSAPP_ACCESS_TOKEN=change-me
WHATSAPP_PHONE_NUMBER_ID=change-me
WHATSAPP_BUSINESS_ACCOUNT_ID=change-me
```

Para frontend, opcionalmente puedes definir:

```dotenv
NEXT_PUBLIC_BASE_URL=https://tu-dominio.com
NEXT_PUBLIC_API_URL=https://tu-backend.railway.app
NEXT_PUBLIC_WS_URL=https://tu-backend.railway.app
NEXT_PUBLIC_WS_PATH=/socket.io
NEXT_PUBLIC_WS_ENABLED=true
```

### Credenciales Google

Document AI usa ADC y las integraciones de Google Drive usan OAuth 2.0. Consulta las variables requeridas en [`backend/.env.example`](backend/.env.example); no guardes credenciales en archivos versionados.

### 3) Levantar stack de desarrollo completo con Docker

```bash
make stack-dev-up
```

Para apagar:

```bash
make stack-dev-down
```

Incluye: postgres + migrator + api + worker + frontend.

En desarrollo, `make dev-up` (alias de `make stack-dev-up`) ejecuta `up --build`, por lo que incorpora automaticamente:

- cambios en `pnpm-lock.yaml`, `package.json` y Dockerfiles (reconstruye capas afectadas con cache),
- migraciones agregadas o eliminadas: el servicio `migrator` monta `backend/` (bind mount) y siempre ve el arbol actual, sin quedar atado a una copia vieja dentro de la imagen.

Variantes utiles:

- `make dev-up-fast`: levanta sin reconstruir (mas rapido cuando no cambio nada estructural).
- `make dev-watch`: reconstruye/reinicia ante cambios en `pnpm-lock.yaml`, `package.json` o Dockerfiles mientras el stack esta activo (Compose Watch).
- `make dev-migrate`: reaplica migraciones (`migrate deploy`) con el arbol actual.

> Diferencia clave: reconstruir una imagen elimina una migracion del contenedor, pero NO deshace una migracion ya aplicada en Postgres. Para que una migracion eliminada desaparezca de una base de desarrollo, reinicia el volumen: `make docker-reset-dev-volumes` (o `make dev-db-reset-seed`, destructivo). Esto solo es valido en desarrollo y antes de compartir la migracion; en QA/produccion las migraciones son forward-only (ver seccion de migraciones).

Si `node_modules` dentro de Docker queda inconsistente: `make docker-reset-dev-volumes` y volve a levantar el stack.

Build manual de imagen backend desde la raiz del repo:

```bash
docker build -f backend/Dockerfile --target runner .
```

## Scripts utiles

### Raiz del repo

```bash
make lint
make typecheck
make test
make smoke-docker

pnpm lint
pnpm typecheck
pnpm test
```

### Backend (scripts)

```bash
pnpm --dir backend dev
pnpm --dir backend test
pnpm --dir backend lint
pnpm --dir backend format:check
pnpm --dir backend prisma:generate
pnpm --dir backend prisma:migrate
pnpm --dir backend prisma:migrate:prod
pnpm --dir backend prisma:seed
```

### Database seeds

The Prisma seed orchestrator lives at `backend/prisma/seed/index.ts`. Individual domain seeders are under `backend/prisma/seed/core/`, `backend/prisma/seed/dev/`, and `backend/prisma/seed/test/`.

> **Do not run the generic seed command with `NODE_ENV=production`.** `index.ts` throws. En GCP use los Cloud Run Jobs `nexo-seeder-core` y `nexo-seeder-dev` con `NODE_ENV=staging` y `--command=pnpm` (la imagen `nexo-tools` entra por defecto al migrador forward-only). Procedimiento: [docs/DEPLOYMENT_GCP.md](docs/DEPLOYMENT_GCP.md) sección 11.

The default command (`pnpm run prisma:seed` and `prisma db seed`) runs **core** seeds only, so it is safe to run in fresh environments without extra credentials:

```bash
pnpm --dir backend prisma:seed        # core only (roles, departments, neighborhoods)
pnpm --dir backend prisma:seed:core   # core only (explicit)
```

Dev seeds require `SUPERADMIN_PASSWORD` and are run explicitly:

```bash
pnpm --dir backend prisma:seed:dev    # dev only (superadmin + AI module)
pnpm --dir backend prisma:seed:ai     # alias for dev-only AI seed
```

`all` runs core + dev + test path. It also requires `SUPERADMIN_PASSWORD`:

```bash
pnpm --dir backend prisma:seed:all    # core + dev + test fixtures
pnpm --dir backend prisma:seed:test   # test fixtures only
```

Docker Compose execution:

> The `migrator` service applies migrations (`migrate deploy`) but does **not** run seed automatically.

```bash
# Dev core seed (safe default)
docker compose -f docker-compose.dev.yml run --rm migrator
docker compose -f docker-compose.dev.yml run --rm migrator pnpm run prisma:seed

# Dev seed with superadmin + AI module (requires SUPERADMIN_PASSWORD)
docker compose -f docker-compose.dev.yml run --rm migrator pnpm run prisma:seed:dev
```

Before running any seed that creates the superadmin, define in `backend/.env`:

- `SUPERADMIN_EMAIL`
- `SUPERADMIN_PASSWORD` (required — the seeder throws if missing)
- `SUPERADMIN_FULL_NAME`

`SUPERADMIN_PASSWORD` has no development default; it must be provided explicitly.

### Frontend (scripts)

```bash
pnpm --dir frontend dev
pnpm --dir frontend lint
pnpm --dir frontend typecheck
pnpm --dir frontend format:check
pnpm --dir frontend check
```

## API y docs

- Healthcheck: GET /health
- API base: /api/v1
- Swagger UI: <http://localhost:8000/docs>
- OpenAPI JSON: <http://localhost:8000/api-docs.json>

Modulos principales expuestos en /api/v1:

- /webhook
- /auth
- /admin (usuarios, catalogos, eventos)
- /citizens
- /conversations
- /messages
- /handover
- /system

## Mapa de modulos backend (resumen)

| Modulo               | Base URL                    | Router                                     | Controller              | Servicios principales                                                         |
| -------------------- | --------------------------- | ------------------------------------------ | ----------------------- | ----------------------------------------------------------------------------- |
| Webhook WhatsApp     | /api/v1/webhook             | backend/src/routes/webhook.routes.ts       | WebhookController       | InboxProcessorService, WebhookParserService, MessageRepository, PrismaService |
| Auth panel           | /api/v1/auth                | backend/src/routes/auth.routes.ts          | AuthController          | AuthService, LockoutService, AuditService                                     |
| Admin usuarios       | /api/v1/admin/users         | backend/src/routes/users.routes.ts         | UsersController         | UserService, AuditService                                                     |
| Admin neighborhoods  | /api/v1/admin/neighborhoods | backend/src/routes/neighborhoods.routes.ts | NeighborhoodsController | NeighborhoodsService, AuditService                                            |
| Admin tags           | /api/v1/admin/tags          | backend/src/routes/tags.routes.ts          | TagsController          | TagsService, AuditService                                                     |
| Admin departments    | /api/v1/admin/departments   | backend/src/routes/departments.routes.ts   | DepartmentsController   | DepartmentsService, AuditService                                              |
| Admin events         | /api/v1/admin/events        | backend/src/routes/events.routes.ts        | EventsController        | EventService, AttendanceService, AuditService                                 |
| Citizens             | /api/v1/citizens            | backend/src/routes/citizens.routes.ts      | CitizensController      | CitizensService, AuditService                                                 |
| Conversations        | /api/v1/conversations       | backend/src/routes/conversations.routes.ts | ConversationsController | ConversationsService, MessageService, AuditService                            |
| Messages             | /api/v1/messages            | backend/src/routes/messages.routes.ts      | MessagesController      | MessageService, OutboxProcessorService                                        |
| Handover             | /api/v1/handover            | backend/src/routes/handover.routes.ts      | HandoverController      | ConversationStateMachine, ConversationRepository                              |
| System observability | /api/v1/system              | backend/src/routes/system.routes.ts        | SystemController        | SystemService                                                                 |

Tabla ampliada con endpoints por modulo: [docs/backend-modules-map.md](docs/backend-modules-map.md)

## Docker Compose por entorno

```bash
# Desarrollo
docker compose -f docker-compose.dev.yml up -d

# Produccion (con Caddy)
docker compose -f docker-compose.prod.yml up -d
```

## Tests en Docker

```bash
make test-docker
make test-docker-fast
```

Si hay problemas por volumenes stale en node_modules:

```bash
make docker-reset-dev-volumes
```

En desarrollo, `api` y `worker` comparten volúmenes nombrados para `node_modules` del workspace pnpm; un entrypoint reinstala dependencias cuando cambia el hash de `pnpm-lock.yaml` (montado read-only). Ver [docs/dependency-policy.md](docs/dependency-policy.md).

## Deploy (backend en Railway)

El repositorio incluye railway.json para desplegar backend desde monorepo. El **Dockerfile del backend** espera contexto de build en la **raiz del repositorio** (para leer `pnpm-lock.yaml`). En Railway, configura el servicio con **Root Directory** = `.` (raiz) y **Dockerfile Path** = `backend/Dockerfile`.

### Configuracion obligatoria del servicio en Railway

| Campo            | Valor                |
| ---------------- | -------------------- |
| Builder          | `Dockerfile`         |
| Root Directory   | `.` (raiz del repo)  |
| Dockerfile Path  | `backend/Dockerfile` |
| Watch Paths      | `backend/**`         |
| Healthcheck Path | `/health`            |

Si Railway detecta Nixpacks o cambia el Root Directory a `backend/`, el build rompera porque el Dockerfile asume que el contexto es la raiz del monorepo (necesita `pnpm-lock.yaml`, `pnpm-workspace.yaml` y los `package.json` de ambos workspaces).

### Troubleshooting de errores comunes en deploy

#### `Could not find Prisma Schema` durante `pnpm install`

Causa: el stage `deps` del Dockerfile copia el schema antes de `pnpm install` para que el `postinstall` del backend (`prisma generate`) lo encuentre. Si Railway corre con un contexto diferente (por ejemplo Root Directory `backend/`), el `COPY backend/prisma` no resolvera y el postinstall fallara.

Verificacion:

- Confirmar que el servicio en Railway usa **Root Directory** `.` (raiz del repo).
- Reproducir local: `docker build --no-cache -f backend/Dockerfile --target deps .` desde la raiz.
- Si necesita schema en otra ruta, ajustar `prisma.schema` en `backend/package.json` y los `--schema` de los scripts.

#### Drift de versiones Prisma entre CLI y client

Sintoma: errores tipo `Prisma client was generated for a different version` o engines no encontrados.

Verificacion: `prisma` (devDependency) y `@prisma/client` deben tener la **misma version exacta**. Estan fijadas a `5.22.0` en `backend/package.json`. CI valida que el lockfile contenga un solo specifier para cada uno.

#### Build pasa local con cache pero falla en Railway

Posible regresion oculta por la cache de Docker. Reproducir local con `docker build --no-cache -f backend/Dockerfile --target runner .`. CI ejecuta nightly un job `docker-cold-build` que valida exactamente este escenario.

Variables recomendadas en Railway:

- DATABASE_URL
- WHATSAPP_VERIFY_TOKEN
- WHATSAPP_APP_ID
- WHATSAPP_APP_SECRET
- WHATSAPP_ACCESS_TOKEN
- WHATSAPP_PHONE_NUMBER_ID
- WHATSAPP_BUSINESS_ACCOUNT_ID
- WORKERS_ENABLED (default true)
- BACKGROUND_EXECUTION_BACKEND (default `polling`; valores: `polling | cloud_tasks`)
- INBOX_POLL_INTERVAL_MS (default 2000)
- OUTBOX_POLL_INTERVAL_MS (default 1000)
- QUEUE_RETRY_PROMOTION_INTERVAL_MS (default 5000)
- WS_ENABLED (default true)
- WS_CORS_ORIGIN (default hereda CORS_ORIGIN)
- WS_PATH (default /socket.io)
- PORT=8000
- NODE_ENV=production

Healthcheck sugerido: /health

Operacion realtime (Railway + Vercel):

- Backend en Railway: exponer WebSocket en la misma URL HTTP del servicio.
- Frontend en Vercel: apuntar `NEXT_PUBLIC_WS_URL` al dominio backend de Railway.
- Si frontend y backend viven en dominios distintos, definir `WS_CORS_ORIGIN` con el dominio exacto del frontend (evitar `*` en produccion).
- Fallback: si el socket no conecta, el frontend mantiene polling automaticamente.

Topologia recomendada (PostgreSQL + Pub/Sub + Cloud Tasks):

- Instancia API (HTTP): `WORKERS_ENABLED=false`; publica eventos realtime a Pub/Sub.
- Instancia Worker dedicada: `WORKERS_ENABLED=true`.
- Local: `BACKGROUND_EXECUTION_BACKEND=polling` (el worker hace polling de `inbox_events`/`outbox_events` en PostgreSQL).
- Produccion: `BACKGROUND_EXECUTION_BACKEND=cloud_tasks` (Cloud Tasks invoca al worker por HTTP).
- Realtime: Google Cloud Pub/Sub (topics `realtime-events` y `ai-stream`, con ordering) entrega por push subscription a la API y Socket.IO distribuye a los clientes.
- Ambas instancias comparten `DATABASE_URL` (PostgreSQL); no hay cache ni colas externas obligatorias.
- Si no defines variables nuevas, el backend arranca con defaults y workers habilitados.

## Deploy VPS (Docker + Caddy)

```bash
cp .env.example .env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# Editar .env con CADDY_DOMAIN y secretos reales

make migrate-prod
make prod-up
```

Comandos operativos:

```bash
make prod-logs
make prod-migrate
make prod-down
```

Release reproducible recomendado (build -> migrator de la misma version -> runtimes sin rebuild):

```bash
make prod-deploy
```

`prod-deploy` construye todas las imagenes, corre el `migrator` con la imagen recien construida y luego levanta `api/worker/frontend/caddy` con `--no-build`, evitando que un migrator obsoleto aplique migraciones viejas.

En produccion/QA, `POSTGRES_PASSWORD` y `DATABASE_URL` son obligatorias: los compose fallan de inmediato si faltan (sin defaults inseguros).

## QA (aislado, production-like)

QA usa `docker-compose.qa.yml`: mismos targets inmutables que produccion (`tools`, `runner`, `prod`), pero con proyecto (`nexo-comercial-qa`) y volumenes propios (`*_qa`), de modo que puede convivir con produccion sin compartir datos. No hay bind mounts ni instalacion dinamica.

```bash
cp .env.example .env.qa
cp backend/.env.example backend/.env.qa
cp frontend/.env.example frontend/.env.qa
# Editar los .env.qa con secretos de QA (POSTGRES_PASSWORD, DATABASE_URL, CADDY_DOMAIN)

make qa-deploy     # build -> migrator (misma version) -> runtimes sin rebuild
make qa-logs
make qa-down
```

Caddy de QA expone puertos host configurables (`QA_HTTP_PORT`/`QA_HTTPS_PORT`, default `8080`/`8443`) para no colisionar con produccion en el mismo host.

## Politica de migraciones (forward-only en QA/produccion)

- Una migracion aplicada en QA o produccion es inmutable: no se elimina ni se modifica su `migration.sql`.
- Para revertir o corregir, crea una nueva migracion correctiva.
- CI rechaza en PRs cualquier eliminacion o modificacion de una `migration.sql` ya versionada, y valida que todas las migraciones apliquen sobre una base vacia.
- Eliminar una migracion solo es valido en desarrollo local y antes de compartirla; luego reinicia el volumen dev para limpiar la base (`make docker-reset-dev-volumes`).

## Documentacion relacionada

- docs/onboarding-5-min.md
- docs/technical-guide.md
- docs/docker-runtime-vps.md
- docs/backend-modules-map.md
- backend/docs/README.md
- backend/docs/database-schema.md
- backend/docs/whatsapp-messaging-flow.md
- backend/src/ai/README.md
- postman/nexo-comercial.postman_collection.json

## Análisis de Configuraciones

La primera fase y el backlog de Configuraciones están documentados en [`docs/analysis/configuraciones-nexo-comercial.md`](docs/analysis/configuraciones-nexo-comercial.md).
