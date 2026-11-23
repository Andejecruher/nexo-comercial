# Docker runtime profesional (dev + VPS)

Esta guia define el runtime desacoplado de Voz Ciudadana con tres procesos backend:

- `api`: trafico HTTP + Socket.IO.
- `worker`: procesamiento de colas/reintentos (sin puertos publicos).
- `migrator`: one-shot por release (`prisma migrate deploy`).

## Por que separar API / Worker / Migrator

- **Responsabilidad clara**: la API responde rapido, el Worker procesa jobs asincronos, el Migrator modifica esquema.
- **Escalado independiente**: podes escalar `api` por RPS y `worker` por backlog de inbox/outbox.
- **Aislamiento de fallos**: picos de colas no degradan HTTP/WebSocket.
- **Lifecycle correcto**: migraciones corren una vez por release, no en cada restart de API.

## Flujo del sistema

1. `api` recibe webhook/eventos y persiste en `inbox_events`/`outbox_events`.
2. `worker` procesa esos eventos con `BACKGROUND_EXECUTION_BACKEND=polling` (polling de PostgreSQL) o `cloud_tasks` (Cloud Tasks invoca al worker por HTTP).
3. `api` mantiene realtime admin por Socket.IO (`WS_*`) sin depender del proceso worker.

## Archivos de infraestructura

- `backend/Dockerfile`: una sola imagen reutilizable para `api`, `worker`, `migrator` (build con **contexto en la raiz del repo** y `pnpm install --frozen-lockfile`).
- `frontend/Dockerfile`: multi-stage `dev` (hot reload) y `prod` (Next start + healthcheck), tambien con **contexto en la raiz** y `pnpm install --frozen-lockfile --filter my-project...` (usa el lockfile del monorepo; ver `frontend/Dockerfile.dockerignore`).
- `docker-compose.dev.yml`: stack local completa (`make dev-up` = `up --build`).
- `docker-compose.qa.yml`: stack QA aislado (proyecto/volumenes `*_qa`), production-like.
- `docker-compose.prod.yml`: stack para VPS + Caddy.
- `deploy/Caddyfile`: reverse proxy recomendado para prod.

## Variables de entorno por servicio

### API / Worker (backend)

- Runtime: `NODE_ENV`, `PORT`, `WORKER_HEALTH_PORT`.
- DB/Queue: `DATABASE_URL`, `BACKGROUND_EXECUTION_BACKEND`, `WORKERS_ENABLED`.
- Polling/retries: `INBOX_POLL_INTERVAL_MS`, `OUTBOX_POLL_INTERVAL_MS`, `QUEUE_RETRY_PROMOTION_INTERVAL_MS`.
- HTTP/Realtime: `CORS_ORIGIN`, `WS_ENABLED`, `WS_CORS_ORIGIN`, `WS_PATH`.
- Auth/seguridad: `JWT_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`.
- Rate limiting: `AUTH_RATE_LIMIT_MAX`, `AUTH_RATE_LIMIT_WINDOW_SECONDS`, `AUTH_REFRESH_RATE_LIMIT_MAX`, `AUTH_REFRESH_RATE_LIMIT_WINDOW_SECONDS`.
- Lockout/sesiones: `AUTH_LOCKOUT_MAX_ATTEMPTS`, `AUTH_LOCKOUT_DURATIONS`, `AUTH_MAX_SESSIONS_PER_USER`.
- WhatsApp: `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`.

### Frontend

- `NEXT_PUBLIC_BASE_URL`
- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_WS_URL`
- `NEXT_PUBLIC_WS_PATH`
- `NEXT_PUBLIC_WS_ENABLED`

### Infra (Compose)

- Postgres: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT`.

### Proxy (Caddy)

- `CADDY_DOMAIN`

## Comandos operativos (Makefile)

- Stack completo dev:
  - `make stack-dev-up`
  - `make stack-dev-down`
- Levantar solo infraestructura:
  - `make infra-up`
  - `make infra-down`
- Levantar runtimes por separado:
  - `make api-up`
  - `make worker-up`
  - `make frontend-up`
- Logs por servicio:
  - `make logs SERVICE=api`
  - `make logs-api`, `make logs-worker`, `make logs-frontend`, `make logs-db`
- Migraciones:
  - `make migrate-dev`
  - `make migrate-prod`
- Release por entorno:
  - `make qa-deploy` (QA: build -> migrator -> runtimes sin rebuild)
  - `make prod-deploy` (prod: build -> migrator -> runtimes sin rebuild)
- Smoke docker:
  - `make smoke-docker`

## Politica de migraciones (forward-only)

- En QA/produccion, las migraciones aplicadas son inmutables: no eliminar ni modificar `migration.sql` ya versionadas.
- Para revertir/corregir: crear una nueva migracion correctiva.
- CI valida (PR) que no se eliminen/modifiquen migraciones existentes y que todas apliquen sobre una base vacia.
- Eliminar una migracion solo es valido en desarrollo local y antes de compartirla; luego resetear el volumen dev.

## Deploy VPS paso a paso (Docker + Caddy)

1. Preparar host:
   - Docker Engine + Compose plugin instalados.
   - DNS `A/AAAA` de `CADDY_DOMAIN` apuntando al VPS.
   - abrir puertos `80` y `443`.
2. Copiar repo al VPS y crear `.env` desde `.env.example`.
3. Completar secretos reales: DB, JWT, WhatsApp y `CADDY_DOMAIN`.
4. Levantar release (recomendado `make prod-deploy`: build -> migrator de la misma version -> runtimes sin rebuild):
   - `docker compose -f docker-compose.prod.yml build`
   - `docker compose -f docker-compose.prod.yml run --rm migrator`
   - `docker compose -f docker-compose.prod.yml up -d --no-build api worker frontend caddy`
5. Verificar:
   - `docker compose -f docker-compose.prod.yml ps`
   - `docker compose -f docker-compose.prod.yml logs -f caddy`
   - `curl -fsS https://$CADDY_DOMAIN/health`

## Seguridad minima recomendada VPS

- No exponer puertos de `postgres`, `api`, `worker`, `frontend` al host en prod.
- Exponer solo `80/443` via Caddy.
- Mantener `.env` fuera de git, permisos `600`.
- Rotar `JWT_*` y `WHATSAPP_*` por release sensible.
- Habilitar firewall (ufw/nftables) permitiendo solo SSH + 80/443.

## Rollback basico

1. Mantener tag previo de imagen o commit estable.
2. `git checkout <tag-estable>` en el VPS.
3. Ejecutar:
   - `docker compose -f docker-compose.prod.yml up -d api worker frontend caddy`
4. Si hubo migracion irreversible, aplicar estrategia de DB rollback definida por el equipo.

## Notas de salud operativa

- Health API: `GET /health`.
- Health Worker: `GET /healthz` interno (puerto `WORKER_HEALTH_PORT`, default `8010`).
- Frontend prod incluye `HEALTHCHECK` HTTP al `/`.
