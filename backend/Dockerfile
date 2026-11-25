# Build desde la raíz del monorepo:
#   docker build -f backend/Dockerfile -t nexo-comercial-api:local .
#
# Requiere: package.json, pnpm-lock.yaml, pnpm-workspace.yaml, backend/package.json, frontend/package.json

FROM node:20-alpine AS base

WORKDIR /workspace

RUN apk add --no-cache ffmpeg openssl wget

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable && corepack prepare pnpm@10 --activate

# ── Dependencias workspace (backend + lockfile monorepo) ───────────────────
FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

# El schema se copia ANTES de `pnpm install` porque el `postinstall` del backend
# ejecuta `prisma generate` y necesita encontrar `backend/prisma/schema.prisma`.
# Sin esto, Railway/CI fallan en builds limpios con
# "Could not find Prisma Schema".
COPY backend/prisma ./backend/prisma

RUN pnpm install --frozen-lockfile --filter nexo-comercial-api...

# ── Desarrollo: fuentes + Prisma client (sin entrypoint; migrator / tests) ─
FROM deps AS dev-shell

COPY backend/src ./backend/src
COPY backend/tsconfig.json ./backend/
COPY backend/tsconfig.test.json ./backend/
COPY backend/jest.config.js ./backend/
COPY backend/jest.postgres.config.js ./backend/

WORKDIR /workspace/backend

RUN pnpm exec prisma generate --schema=./prisma/schema.prisma

# ── Desarrollo: api/worker con sync de dependencias al cambiar lockfile ─────
FROM dev-shell AS dev-runtime

# Fuera de /workspace/backend: el bind-mount ./backend:/workspace/backend oculta el tree del host
# y el script en el repo suele venir sin +x → "permission denied" al ejecutar el ENTRYPOINT.
COPY backend/scripts/docker-dev-entrypoint.sh /usr/local/bin/nexo-docker-dev-entrypoint.sh
RUN chmod +x /usr/local/bin/nexo-docker-dev-entrypoint.sh

WORKDIR /workspace/backend

EXPOSE 8000
EXPOSE 8010

ENTRYPOINT ["/usr/local/bin/nexo-docker-dev-entrypoint.sh"]
CMD ["pnpm", "run", "dev:api"]

# ── Tests en imagen ─────────────────────────────────────────────────────────
FROM dev-shell AS test

WORKDIR /workspace/backend

CMD ["pnpm", "test", "--", "--runInBand"]

# ── Build TypeScript ───────────────────────────────────────────────────────
FROM deps AS builder

COPY backend/src ./backend/src
COPY backend/tsconfig.json ./backend/
COPY backend/scripts ./backend/scripts

WORKDIR /workspace/backend

RUN pnpm exec prisma generate --schema=./prisma/schema.prisma && pnpm run build

# ── Paquete de producción (legacy deploy = layout portable en pnpm 10) ─────
FROM builder AS deploy-stage

WORKDIR /workspace

RUN pnpm deploy --filter=nexo-comercial-api --prod --legacy /out

# Generar el cliente Prisma usando la CLI del backend (garantiza la versión
# correcta independientemente de lo que esté instalado en la raíz del workspace)
RUN cp -R /workspace/backend/prisma /out/prisma \
    && cd /out && /workspace/backend/node_modules/.bin/prisma generate --schema=./prisma/schema.prisma

# ── Migrator: Prisma CLI en devDependencies del workspace ───────────────────
FROM deps AS tools

WORKDIR /workspace/backend

# Prisma migrations only need the schema copied by `deps`, but TypeScript
# seeders extend backend/tsconfig.json and the dev/AI scope imports utilities
# from backend/src (encryption + typed environment config).
COPY backend/tsconfig.json ./tsconfig.json
COPY backend/src ./src
COPY backend/scripts/prod-migrate.sh /usr/local/bin/nexo-prod-migrate.sh
RUN chmod +x /usr/local/bin/nexo-prod-migrate.sh

# ENTRYPOINT ignores leftover Cloud Run Job --args from a previous revision.
# Production deploys must never reset, force-push, or seed this database.
ENTRYPOINT ["/usr/local/bin/nexo-prod-migrate.sh"]
CMD []

# ── Runtime API/Worker (producción) ─────────────────────────────────────────
# Compatible con Cloud Run: escucha en $PORT (env.config PORT lo lee de process.env;
# Cloud Run inyecta PORT=8080). El stage `worker` usa el mismo filesystem y
# arranca dist/worker.js; el proceso escucha PORT cuando Cloud Run lo inyecta.
FROM node:20-alpine AS runner

WORKDIR /app

# tini: init para señales SIGTERM limpias (graceful shutdown ante escalar-a-cero
# y reemplazo de revisiones en Cloud Run).
RUN apk add --no-cache ffmpeg openssl wget tini \
    && mkdir -p /app/storage/whatsapp \
    && chown -R node:node /app

ENV NODE_ENV=production

COPY --from=deploy-stage --chown=node:node /out/ ./

# Non-root: Cloud Run soporta USER y reduce superficie de ataque.
USER node

EXPOSE 8000
EXPOSE 8010

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/server.js"]

# Same layers as runner; only the default process changes so Cloud Run/Compose
# do not depend on a --command override to avoid serving the API on nexo-worker.
FROM runner AS worker
CMD ["node", "dist/worker.js"]
