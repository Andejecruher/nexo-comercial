#!/usr/bin/env sh
# Sincroniza node_modules del workspace cuando cambia pnpm-lock.yaml (dev en Docker).
# Requiere montar la raíz del repo: pnpm-lock.yaml, pnpm-workspace.yaml, package.json,
# backend/package.json, y volúmenes nombrados en /workspace/node_modules y /workspace/frontend/node_modules.

set -eu

WORKSPACE="/workspace"
FRONTEND="${WORKSPACE}/frontend"
LOCK="${WORKSPACE}/pnpm-lock.yaml"
STATE_DIR="${FRONTEND}/node_modules"
STATE_FILE="${STATE_DIR}/.pnpm-dev-sync-hash"

if [ ! -f "$LOCK" ]; then
  echo "[frontend-dev-entrypoint] ERROR: no se encuentra ${LOCK}. Montá pnpm-lock.yaml en el contenedor."
  exit 1
fi

mkdir -p "$STATE_DIR"

# sha256sum viene con BusyBox en node:alpine
hash="$(sha256sum "$LOCK" | awk '{print $1}')"

if [ ! -f "$STATE_FILE" ] || [ "$(cat "$STATE_FILE")" != "$hash" ]; then
  echo "[frontend-dev-entrypoint] Lockfile distinto o volumen fresco; ejecutando pnpm install..."
  cd "$WORKSPACE"
  pnpm install --frozen-lockfile --filter my-project...
  echo "$hash" > "$STATE_FILE"
  echo "[frontend-dev-entrypoint] Dependencias sincronizadas."
fi

# Tras pnpm install el cwd queda en WORKSPACE; los scripts viven en frontend/package.json.
cd "$FRONTEND"

exec "$@"
