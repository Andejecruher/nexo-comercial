#!/usr/bin/env sh
# Sincroniza node_modules del workspace cuando cambia pnpm-lock.yaml (dev en Docker).
# Requiere montar la raíz del repo: pnpm-lock.yaml, pnpm-workspace.yaml, package.json,
# frontend/package.json, y volúmenes nombrados en /workspace/node_modules y /workspace/backend/node_modules.

set -eu

WORKSPACE="/workspace"
BACKEND="${WORKSPACE}/backend"
LOCK="${WORKSPACE}/pnpm-lock.yaml"
STATE_DIR="${BACKEND}/node_modules"
STATE_FILE="${STATE_DIR}/.pnpm-dev-sync-hash"

if [ ! -f "$LOCK" ]; then
  echo "[docker-dev-entrypoint] ERROR: no se encuentra ${LOCK}. Montá pnpm-lock.yaml en el contenedor."
  exit 1
fi

mkdir -p "$STATE_DIR"

# sha256sum viene con BusyBox en node:alpine
hash="$(sha256sum "$LOCK" | awk '{print $1}')"

if [ ! -f "$STATE_FILE" ] || [ "$(cat "$STATE_FILE")" != "$hash" ]; then
  echo "[docker-dev-entrypoint] Lockfile distinto o volumen fresco; ejecutando pnpm install..."
  cd "$WORKSPACE"
  pnpm install --frozen-lockfile --filter voz-ciudadana-api...
  echo "$hash" > "$STATE_FILE"
  echo "[docker-dev-entrypoint] Dependencias sincronizadas."
fi

# Tras pnpm install el cwd queda en WORKSPACE; los scripts viven en backend/package.json.
cd "$BACKEND"

# Regenera el Prisma Client en cada arranque. Es barato (~450ms) e idempotente,
# y asegura que el client en node_modules refleje el schema.prisma actual sin
# depender de un reinicio manual tras editar la schema. ts-node-dev ignora
# node_modules, así que sin esto el api correría con un client desactualizado.
echo "[docker-dev-entrypoint] Generando Prisma Client..."
pnpm prisma generate --schema=./prisma/schema.prisma

exec "$@"
