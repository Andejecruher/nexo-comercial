#!/usr/bin/env bash
# Emergency release path for an already-merged origin/main revision.
# It intentionally updates only images: Cloud Run runtime configuration, secrets,
# IAM, queues, and infrastructure stay owned by deploy-gcp.yml.

set -Eeuo pipefail

if [ "${GCP_DEPLOY_ENABLED:-0}" != "1" ]; then
  echo "GCP deploy is disabled for nexo-comercial. See docs/DEPLOYMENT_GCP.md" >&2
  exit 1
fi

readonly REGION="${GCP_REGION:-us-central1}"
readonly AR_REPO="${AR_REPO:-nexo-comercial}"
readonly API_SERVICE="nexo-api"
readonly WORKER_SERVICE="nexo-worker"
readonly RELAY_SERVICE="nexo-realtime-relay"
readonly FRONTEND_SERVICE="nexo-frontend"
readonly MIGRATOR_JOB="nexo-migrator"
readonly SCHEDULER_JOB="background-tasks-reconcile"

usage() {
  cat <<'EOF'
Usage: scripts/deploy-gcp-local.sh --confirm-sha <current-short-sha>

Emergency release fallback when GitHub Actions cannot run. The script:
  1. Requires a clean checkout exactly at origin/main.
  2. Runs the repository's local validation suite.
  3. Builds and pushes the API, worker, tools, and frontend images.
  4. Runs forward-only Prisma migrations.
  5. Updates Cloud Run images in worker -> relay -> API -> frontend order.
  6. Resumes existing Cloud Tasks queues and Scheduler only after worker readiness.
  7. Verifies API, worker, relay, frontend, and active revisions.

It preserves existing Cloud Run configuration and Secret Manager bindings. Do not
use it for infrastructure, IAM, secret, queue-definition, or runtime-variable
changes; use the canonical GitHub workflow once Actions is available.
EOF
}

die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"
}

on_error() {
  local exit_code=$?
  printf 'ERROR: deployment stopped at line %s (exit %s). No rollback was attempted.\n' \
    "$1" "$exit_code" >&2
  exit "$exit_code"
}
trap 'on_error $LINENO' ERR

confirm_sha=""
while (($#)); do
  case "$1" in
    --confirm-sha)
      (($# >= 2)) || die '--confirm-sha requires a value'
      confirm_sha="$2"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      die "Unknown argument: $1"
      ;;
  esac
done

for command in docker gcloud git make python3 curl; do
  require_command "$command"
done

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

git diff --quiet || die 'Tracked unstaged changes are present; deploy only a committed revision.'
git diff --cached --quiet || die 'Tracked staged changes are present; deploy only a committed revision.'
[[ -z "$(git ls-files --others --exclude-standard)" ]] || die 'Untracked files are present; deploy only a clean checkout.'

git_sha="$(git rev-parse --short HEAD)"
[[ -n "$confirm_sha" ]] || die 'Pass --confirm-sha with the short SHA printed by git rev-parse --short HEAD.'
[[ "$confirm_sha" == "$git_sha" ]] || die "Confirmation SHA $confirm_sha does not match current revision $git_sha."
git diff --quiet HEAD origin/main || die 'HEAD must exactly match origin/main for an emergency production release.'

project_id="$(gcloud config get-value project 2>/dev/null)"
[[ -n "$project_id" && "$project_id" != "(unset)" ]] || die 'Set the active GCP project with gcloud config set project.'
active_account="$(gcloud auth list --filter=status:ACTIVE --format='value(account)' | head -n 1)"
[[ -n "$active_account" ]] || die 'Authenticate gcloud before deploying.'

for service in "$API_SERVICE" "$WORKER_SERVICE" "$RELAY_SERVICE" "$FRONTEND_SERVICE"; do
  gcloud run services describe "$service" --region="$REGION" --project="$project_id" >/dev/null
done
gcloud run jobs describe "$MIGRATOR_JOB" --region="$REGION" --project="$project_id" >/dev/null

run_env_value() {
  local service="$1"
  local name="$2"
  gcloud run services describe "$service" --region="$REGION" --project="$project_id" --format=json \
    | python3 -c '
import json
import sys

name = sys.argv[1]
container = json.load(sys.stdin)["spec"]["template"]["spec"]["containers"][0]
print(next((item["value"] for item in container.get("env", []) if item["name"] == name and "value" in item), ""))
' "$name"
}

api_base_url="${GCP_API_BASE_URL:-$(run_env_value "$API_SERVICE" BASE_URL)}"
[[ -n "$api_base_url" ]] || die 'Set GCP_API_BASE_URL or configure BASE_URL on nexo-api before building the frontend.'

image_root="${REGION}-docker.pkg.dev/${project_id}/${AR_REPO}"
api_image="${image_root}/nexo-api:sha-${git_sha}"
worker_image="${image_root}/nexo-worker:sha-${git_sha}"
tools_image="${image_root}/nexo-tools:sha-${git_sha}"
frontend_image="${image_root}/nexo-frontend:sha-${git_sha}"

printf 'Releasing revision %s to project %s as %s\n' "$git_sha" "$project_id" "$active_account"
printf 'Running local validation...\n'
pnpm --dir backend run prisma:generate
make validate

printf 'Configuring Artifact Registry Docker authentication...\n'
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet

printf 'Building and publishing images...\n'
docker buildx build -f backend/Dockerfile --target runner -t "$api_image" --push .
docker buildx build -f backend/Dockerfile --target worker -t "$worker_image" --push .
docker buildx build -f backend/Dockerfile --target tools -t "$tools_image" --push .
docker buildx build -f frontend/Dockerfile --target prod \
  --build-arg "NEXT_PUBLIC_API_URL=${api_base_url}" \
  --build-arg "NEXT_PUBLIC_WS_URL=${api_base_url}" \
  -t "$frontend_image" --push .

printf 'Running forward-only Prisma migrations...\n'
gcloud run jobs update "$MIGRATOR_JOB" \
  --image="$tools_image" \
  --region="$REGION" \
  --project="$project_id"
gcloud run jobs execute "$MIGRATOR_JOB" --region="$REGION" --project="$project_id" --wait

service_url() {
  gcloud run services describe "$1" --region="$REGION" --project="$project_id" --format='value(status.url)'
}

require_ready() {
  local service="$1"
  local url="$2"
  local token
  token="$(gcloud auth print-identity-token --audiences="$url")"
  curl --fail-with-body --silent --show-error --connect-timeout 10 --max-time 20 \
    -H "Authorization: Bearer $token" "$url/ready" >/dev/null
  printf '%s is ready\n' "$service"
}

printf 'Deploying worker...\n'
gcloud run services update "$WORKER_SERVICE" --image="$worker_image" --region="$REGION" --project="$project_id"
worker_url="$(service_url "$WORKER_SERVICE")"
require_ready "$WORKER_SERVICE" "$worker_url"

queue_base="$(run_env_value "$API_SERVICE" TASKS_QUEUE_NAME)"
[[ -n "$queue_base" ]] || die 'TASKS_QUEUE_NAME is not configured on nexo-api.'
for queue in "$queue_base" "$queue_base-ai" "$queue_base-delivery" "$queue_base-documents"; do
  state="$(gcloud tasks queues describe "$queue" --location="$REGION" --project="$project_id" --format='value(state)')"
  if [[ "$state" != 'RUNNING' ]]; then
    gcloud tasks queues resume "$queue" --location="$REGION" --project="$project_id"
  fi
done
scheduler_state="$(gcloud scheduler jobs describe "$SCHEDULER_JOB" --location="$REGION" --project="$project_id" --format='value(state)')"
if [[ "$scheduler_state" != 'ENABLED' ]]; then
  gcloud scheduler jobs resume "$SCHEDULER_JOB" --location="$REGION" --project="$project_id"
fi

printf 'Deploying realtime relay and API...\n'
gcloud run services update "$RELAY_SERVICE" --image="$worker_image" --region="$REGION" --project="$project_id"
relay_url="$(service_url "$RELAY_SERVICE")"
require_ready "$RELAY_SERVICE" "$relay_url"
gcloud run services update "$API_SERVICE" --image="$api_image" --region="$REGION" --project="$project_id"
api_url="$(service_url "$API_SERVICE")"
curl --fail-with-body --silent --show-error --connect-timeout 10 --max-time 20 "$api_url/ready" >/dev/null

printf 'Deploying frontend...\n'
gcloud run services update "$FRONTEND_SERVICE" --image="$frontend_image" --region="$REGION" --project="$project_id"
frontend_url="$(service_url "$FRONTEND_SERVICE")"
curl --fail-with-body --silent --show-error --connect-timeout 10 --max-time 20 "$frontend_url/" >/dev/null

for service in "$WORKER_SERVICE" "$RELAY_SERVICE" "$API_SERVICE" "$FRONTEND_SERVICE"; do
  revision="$(gcloud run services describe "$service" --region="$REGION" --project="$project_id" --format='value(status.latestReadyRevisionName)')"
  printf '%s -> %s\n' "$service" "$revision"
done

printf 'Emergency release complete: %s\n' "$git_sha"
