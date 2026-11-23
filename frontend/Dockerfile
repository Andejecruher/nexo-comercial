# Build desde la raíz del monorepo:
#   docker build -f frontend/Dockerfile --target prod .
#
# Requiere: package.json, pnpm-lock.yaml, pnpm-workspace.yaml, frontend/package.json, backend/package.json

FROM node:20-alpine AS base

WORKDIR /workspace

ENV NEXT_TELEMETRY_DISABLED=1

RUN apk add --no-cache wget

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable && corepack prepare pnpm@10 --activate

# ── Dependencias workspace (frontend + lockfile monorepo) ──────────────────
FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY frontend/package.json ./frontend/
COPY backend/package.json ./backend/

RUN pnpm install --frozen-lockfile --filter my-project...

# ── Desarrollo: hot reload con sync de dependencias al cambiar lockfile ─────
FROM deps AS dev

ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV CHOKIDAR_USEPOLLING=1
ENV WATCHPACK_POLLING=true

# Fuera de /workspace/frontend: el bind-mount ./frontend:/workspace/frontend oculta el tree del host
# y el script en el repo suele venir sin +x → "permission denied" al ejecutar el ENTRYPOINT.
COPY frontend/scripts/docker-dev-entrypoint.sh /usr/local/bin/voz-frontend-dev-entrypoint.sh
RUN chmod +x /usr/local/bin/voz-frontend-dev-entrypoint.sh

WORKDIR /workspace/frontend

EXPOSE 3000

ENTRYPOINT ["/usr/local/bin/voz-frontend-dev-entrypoint.sh"]
CMD ["pnpm", "exec", "next", "dev", "--hostname", "0.0.0.0", "--port", "3000"]

# ── Build Next.js ──────────────────────────────────────────────────────────
FROM deps AS builder

COPY frontend ./frontend

WORKDIR /workspace/frontend

ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ARG NEXT_PUBLIC_WS_URL=http://localhost:8000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL

RUN pnpm run build

# ── Paquete de producción (layout portable en pnpm 10) ─────────────────────
FROM builder AS deploy-stage

WORKDIR /workspace

RUN pnpm deploy --filter=my-project --prod --legacy /out

# Copiar artefactos de build que `pnpm deploy` no incluye (solo copia manifiestos + deps).
RUN cp -R /workspace/frontend/.next /out/.next \
    && cp -R /workspace/frontend/public /out/public \
    && cp /workspace/frontend/next.config.mjs /out/next.config.mjs

# ── Runtime producción (Next start) ────────────────────────────────────────
# Compatible con Cloud Run: respeta $PORT en runtime con `sh -c` (Cloud Run
# inyecta PORT=8080; compose deja ENV PORT=3000). Mismo CMD para ambos entornos.
FROM node:20-alpine AS prod

WORKDIR /app

# tini: init para señales SIGTERM limpias (graceful shutdown ante escalar-a-cero
# y reemplazo de revisiones en Cloud Run).
RUN apk add --no-cache wget tini \
    && chown -R node:node /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

COPY --from=deploy-stage --chown=node:node /out/ ./

# Non-root: Cloud Run soporta USER y reduce superficie de ataque.
USER node

EXPOSE 3000

# Cloud Run ignora el HEALTHCHECK del Dockerfile (probea sobre $PORT); sirve al
# stack compose (prod/qa). ${PORT} se resuelve en runtime.
HEALTHCHECK --interval=30s --timeout=5s --retries=5 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT:-3000}/" || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
# shell form para expandir $PORT en runtime (Cloud Run inyecta 8080; compose 3000).
CMD ["sh", "-c", "node_modules/.bin/next start -H 0.0.0.0 -p ${PORT:-3000}"]
