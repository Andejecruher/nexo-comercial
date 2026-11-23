# Infraestructura de contenedores (dev/prod)

Este documento define la infraestructura Docker del monorepo sin romper compatibilidad de APIs.

## Objetivos

- Separar responsabilidades en backend: `api`, `worker`, `migrator`.
- Dockerizar frontend para desarrollo y produccion.
- Mantener `docker-compose` por entorno:
  - `docker-compose.dev.yml` (stack local, paridad durable con emulador de Pub/Sub)
  - `docker-compose.qa.yml` (aislado, production-like, con Caddy)
  - `docker-compose.prod.yml` (con Caddy)
- No existe `docker-compose.yml` en la raiz: `docker compose up` sin `-f` ya no es un entrypoint soportado. Usar los targets de `make` o `-f docker-compose.dev.yml`.

## Contexto de build Docker (backend y frontend)

- Las imagenes de `api`, `worker` y `migrator` se construyen con **contexto en la raiz del monorepo** (`context: .`) y `dockerfile: backend/Dockerfile`.
- El `frontend` tambien se construye con **contexto en la raiz** (`dockerfile: frontend/Dockerfile`), instalando con `pnpm install --frozen-lockfile --filter my-project...` sobre el mismo [pnpm-lock.yaml](../pnpm-lock.yaml) del monorepo (antes usaba `npm install` sin lockfile). Para que el build del frontend NO herede las exclusiones del `.dockerignore` raiz (pensado para backend), existe [`frontend/Dockerfile.dockerignore`](../frontend/Dockerfile.dockerignore) que BuildKit aplica solo a ese build.
- Las dependencias del backend se instalan con `pnpm install --frozen-lockfile --filter nexo-comercial-api...`.
- En desarrollo, los servicios (incluido `migrator` y `frontend`) montan `pnpm-lock.yaml` / `package.json` de la raiz (read-only) y comparten volúmenes nombrados para `node_modules`, con entrypoint que sincroniza cuando cambia el lockfile. El `migrator` monta `backend/`, por lo que siempre ve las migraciones actuales (agregadas o eliminadas) sin depender de una copia baked-in. Detalle: [dependency-policy.md](dependency-policy.md).

## Actualizacion por entorno

- **Desarrollo**: `make dev-up` = `up --build`. Incorpora cambios de codigo (hot reload via bind mount), dependencias (lockfile), Dockerfiles y migraciones. `make dev-watch` reconstruye ante cambios estructurales. Reset de datos: `make docker-reset-dev-volumes`.
- **QA / Produccion**: sin bind mounts ni instalacion dinamica. Cada release construye imagenes, corre el `migrator` de esa misma version y levanta runtimes con `--no-build` (`make qa-deploy` / `make prod-deploy`). Migraciones forward-only e inmutables.

## Servicios

### Desarrollo (`docker-compose.dev.yml`)

- `postgres` (5432)
- `migrator` (one-shot, `prisma migrate deploy`)
- `api` (8000, sin workers; expone WebSocket y recibe el push de Pub/Sub)
- `worker` (corre inbox + outbox + relay)
- `realtime-relay` (runtime de recuperacion de la outbox realtime; espeja prod)
- `pubsub-emulator` (8680, emulador local de GCP Pub/Sub)
- `pubsub-init` (one-shot, crea topics + push subscription en el emulador)
- `frontend` (3000, Next.js dev)

El stack dev corre en **modo durable** (`REALTIME_DURABLE_ENABLED=true`) contra el
emulador de Pub/Sub, replicando la ruta de produccion (outbox -> Pub/Sub -> push ->
gateway) sin tocar GCP real. Override `REALTIME_DURABLE_ENABLED=false` para volver al
camino legacy in-process.

### QA (`docker-compose.qa.yml`)

- Mismos servicios que produccion (`postgres`, `migrator`, `api`, `worker`, `realtime-relay`, `frontend`, `caddy`).
- Proyecto `nexo-comercial-qa` y volumenes `*_qa` (aislado de prod).
- Variables via `.env.qa` / `backend/.env.qa` / `frontend/.env.qa`.
- Caddy en puertos host `QA_HTTP_PORT`/`QA_HTTPS_PORT` (default `8080`/`8443`).

### Produccion (`docker-compose.prod.yml`)

- `postgres`
- `migrator`
- `api`
- `worker`
- `realtime-relay` (recuperacion de la outbox realtime)
- `frontend` (Next.js start)
- `caddy` (80/443)
- `POSTGRES_PASSWORD` y `DATABASE_URL` son obligatorias (sin defaults inseguros); `NODE_ENV=production` explicito.

## Enrutamiento en produccion (Caddy)

Archivo: `deploy/Caddyfile`

- `@api` enruta a `api:8000`:
  - `/api/*`
  - `/health`
  - `/docs*`
  - `/api-docs*`
  - `/api-docs.json`
  - `/socket.io/*`
- Todo lo demas va a `frontend:3000`.

## Variables de entorno

Ver ejemplos:

- `.env.example`
- `backend/.env.example`
- `frontend/.env.example`

## Flujo de arranque

1. `postgres` pasa healthcheck.
2. `migrator` ejecuta `prisma migrate deploy`.
3. Arrancan `api` y `worker`.
4. Arranca `frontend`.
5. En prod, `caddy` publica 80/443 y enruta.

## Operacion

### Desarrollo

```bash
make dev-up-first
make dev-logs
make dev-down
```

### QA

```bash
make qa-deploy
make qa-logs
make qa-down
```

### Produccion (VPS)

```bash
make prod-deploy
make prod-logs
make prod-migrate
make prod-down
```

## Validaciones sin build

```bash
make lint
make typecheck
make test
make smoke
make validate
```

`make smoke` valida sintaxis de compose dev/prod/qa y presencia de `deploy/Caddyfile` sin ejecutar builds.
