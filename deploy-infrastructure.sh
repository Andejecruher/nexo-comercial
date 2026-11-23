#!/usr/bin/env bash
set -euo pipefail

# Required inputs. The API runtime identity is explicit because guessing it can
# grant enqueue/token permissions to the wrong principal.
PROJECT_ID="${PROJECT_ID:?Set PROJECT_ID}"
API_RUNTIME_SERVICE_ACCOUNT="${API_RUNTIME_SERVICE_ACCOUNT:?Set API_RUNTIME_SERVICE_ACCOUNT (email)}"
WORKER_RUNTIME_SERVICE_ACCOUNT="${WORKER_RUNTIME_SERVICE_ACCOUNT:-${API_RUNTIME_SERVICE_ACCOUNT}}"
ACTIVATE_CLOUD_TASKS="${ACTIVATE_CLOUD_TASKS:-false}"

case "${ACTIVATE_CLOUD_TASKS}" in
  true)
    DEPLOYMENT_MODE="activate"
    ;;
  false)
    DEPLOYMENT_MODE="prepare-only"
    ;;
  *)
    echo "ACTIVATE_CLOUD_TASKS must be exactly true or false" >&2
    exit 1
    ;;
esac

GCP_LOCATION="${GCP_LOCATION:-us-central1}"
TASKS_QUEUE_NAME="${TASKS_QUEUE_NAME:-background-tasks}"
WORKER_SERVICE_NAME="${WORKER_SERVICE_NAME:-voz-worker}"
TASKS_SERVICE_ACCOUNT_NAME="${TASKS_SERVICE_ACCOUNT_NAME:-cloud-tasks-invoker}"
MAX_DISPATCHES_PER_SECOND="${MAX_DISPATCHES_PER_SECOND:-20}"
MAX_CONCURRENT_DISPATCHES="${MAX_CONCURRENT_DISPATCHES:-10}"
MAX_ATTEMPTS="${MAX_ATTEMPTS:-8}"
MIN_BACKOFF="${MIN_BACKOFF:-10s}"
MAX_BACKOFF="${MAX_BACKOFF:-600s}"
MAX_DOUBLINGS="${MAX_DOUBLINGS:-5}"
MAX_RETRY_DURATION="${MAX_RETRY_DURATION:-3600s}"
SCHEDULER_JOB_NAME="${SCHEDULER_JOB_NAME:-background-tasks-reconcile}"
SCHEDULER_SCHEDULE="${SCHEDULER_SCHEDULE:-*/5 * * * *}"
SCHEDULER_TIME_ZONE="${SCHEDULER_TIME_ZONE:-Etc/UTC}"
SCHEDULER_MAX_RETRY_ATTEMPTS="${SCHEDULER_MAX_RETRY_ATTEMPTS:-5}"
SCHEDULER_MAX_RETRY_DURATION="${SCHEDULER_MAX_RETRY_DURATION:-600s}"
SCHEDULER_MIN_BACKOFF="${SCHEDULER_MIN_BACKOFF:-30s}"
SCHEDULER_MAX_BACKOFF="${SCHEDULER_MAX_BACKOFF:-300s}"
SCHEDULER_MAX_DOUBLINGS="${SCHEDULER_MAX_DOUBLINGS:-3}"
PUBSUB_REALTIME_TOPIC="${PUBSUB_REALTIME_TOPIC:-realtime-events}"
PUBSUB_AI_STREAM_TOPIC="${PUBSUB_AI_STREAM_TOPIC:-ai-stream}"
PUBSUB_SOCKETIO_ADAPTER_TOPIC="${PUBSUB_SOCKETIO_ADAPTER_TOPIC:-socketio-adapter}"
PUBSUB_REALTIME_SUBSCRIPTION="${PUBSUB_REALTIME_SUBSCRIPTION:-realtime-events-push}"
PUBSUB_AI_STREAM_SUBSCRIPTION="${PUBSUB_AI_STREAM_SUBSCRIPTION:-ai-stream-push}"
PUBSUB_PUSH_SERVICE_ACCOUNT_NAME="${PUBSUB_PUSH_SERVICE_ACCOUNT_NAME:-pubsub-push-invoker}"
PUBSUB_PUSH_ACK_DEADLINE="${PUBSUB_PUSH_ACK_DEADLINE:-60}"
# API service whose /pubsub/* routes receive the push deliveries. API_BASE_URL
# (custom domain) overrides the Cloud Run origin and must match the audience
# configured through PUBSUB_PUSH_AUDIENCE on the API runtime.
API_SERVICE_NAME="${API_SERVICE_NAME:-voz-api}"
API_BASE_URL="${API_BASE_URL:-}"
# Optional GitHub Actions deploy identity. When provided, it receives
# roles/pubsub.viewer so the production verify step can describe the topics and
# push subscriptions created below (pubsub.topics.get / subscriptions.get).
CICD_SERVICE_ACCOUNT_EMAIL="${CICD_SERVICE_ACCOUNT_EMAIL:-}"

INVOKER_EMAIL="${TASKS_SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
PUBSUB_PUSH_EMAIL="${PUBSUB_PUSH_SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud services enable \
  cloudtasks.googleapis.com \
  cloudscheduler.googleapis.com \
  pubsub.googleapis.com \
  --project="${PROJECT_ID}"
gcloud beta services identity create \
  --service=cloudtasks.googleapis.com \
  --project="${PROJECT_ID}"
gcloud beta services identity create \
  --service=cloudscheduler.googleapis.com \
  --project="${PROJECT_ID}"
gcloud beta services identity create \
  --service=pubsub.googleapis.com \
  --project="${PROJECT_ID}"

TASK_QUEUE_BASE="$TASKS_QUEUE_NAME"
for TASKS_QUEUE_NAME in "$TASK_QUEUE_BASE" "$TASK_QUEUE_BASE-ai" "$TASK_QUEUE_BASE-delivery" "$TASK_QUEUE_BASE-documents"; do
if gcloud tasks queues describe "${TASKS_QUEUE_NAME}" \
  --location="${GCP_LOCATION}" \
  --project="${PROJECT_ID}" >/dev/null 2>&1; then
  QUEUE_COMMAND=update
  if [[ "${ACTIVATE_CLOUD_TASKS}" == "false" ]]; then
    QUEUE_STATE="$(gcloud tasks queues describe "${TASKS_QUEUE_NAME}" \
      --location="${GCP_LOCATION}" \
      --project="${PROJECT_ID}" \
      --format='value(state)')"
    if [[ "${QUEUE_STATE}" != "PAUSED" ]]; then
      gcloud tasks queues pause "${TASKS_QUEUE_NAME}" \
        --location="${GCP_LOCATION}" \
        --project="${PROJECT_ID}"
    fi
  fi
else
  QUEUE_COMMAND=create
fi

gcloud tasks queues "${QUEUE_COMMAND}" "${TASKS_QUEUE_NAME}" \
  --location="${GCP_LOCATION}" \
  --project="${PROJECT_ID}" \
  --max-dispatches-per-second="${MAX_DISPATCHES_PER_SECOND}" \
  --max-concurrent-dispatches="${MAX_CONCURRENT_DISPATCHES}" \
  --max-attempts="${MAX_ATTEMPTS}" \
  --min-backoff="${MIN_BACKOFF}" \
  --max-backoff="${MAX_BACKOFF}" \
  --max-doublings="${MAX_DOUBLINGS}" \
  --max-retry-duration="${MAX_RETRY_DURATION}"

if [[ "${ACTIVATE_CLOUD_TASKS}" == "false" ]]; then
  QUEUE_STATE="$(gcloud tasks queues describe "${TASKS_QUEUE_NAME}" \
    --location="${GCP_LOCATION}" \
    --project="${PROJECT_ID}" \
    --format='value(state)')"
  if [[ "${QUEUE_STATE}" != "PAUSED" ]]; then
    gcloud tasks queues pause "${TASKS_QUEUE_NAME}" \
      --location="${GCP_LOCATION}" \
      --project="${PROJECT_ID}"
  fi
fi

done
TASKS_QUEUE_NAME="$TASK_QUEUE_BASE"

if ! gcloud iam service-accounts describe "${INVOKER_EMAIL}" \
  --project="${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud iam service-accounts create "${TASKS_SERVICE_ACCOUNT_NAME}" \
    --display-name="Cloud Tasks worker invoker" \
    --project="${PROJECT_ID}"
fi

if ! gcloud iam service-accounts describe "${PUBSUB_PUSH_EMAIL}" \
  --project="${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud iam service-accounts create "${PUBSUB_PUSH_SERVICE_ACCOUNT_NAME}" \
    --display-name="Pub/Sub push OIDC invoker" \
    --project="${PROJECT_ID}"
fi

gcloud run services add-iam-policy-binding "${WORKER_SERVICE_NAME}" \
  --region="${GCP_LOCATION}" \
  --project="${PROJECT_ID}" \
  --member="serviceAccount:${INVOKER_EMAIL}" \
  --role="roles/run.invoker"

gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${API_RUNTIME_SERVICE_ACCOUNT}" \
  --role="roles/cloudtasks.enqueuer"

if [[ "${WORKER_RUNTIME_SERVICE_ACCOUNT}" != "${API_RUNTIME_SERVICE_ACCOUNT}" ]]; then
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:${WORKER_RUNTIME_SERVICE_ACCOUNT}" \
    --role="roles/cloudtasks.enqueuer"
fi

gcloud iam service-accounts add-iam-policy-binding "${INVOKER_EMAIL}" \
  --project="${PROJECT_ID}" \
  --member="serviceAccount:${API_RUNTIME_SERVICE_ACCOUNT}" \
  --role="roles/iam.serviceAccountUser"

if [[ "${WORKER_RUNTIME_SERVICE_ACCOUNT}" != "${API_RUNTIME_SERVICE_ACCOUNT}" ]]; then
  gcloud iam service-accounts add-iam-policy-binding "${INVOKER_EMAIL}" \
    --project="${PROJECT_ID}" \
    --member="serviceAccount:${WORKER_RUNTIME_SERVICE_ACCOUNT}" \
    --role="roles/iam.serviceAccountUser"
fi

PROJECT_NUMBER="$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')"
if [[ -z "${PROJECT_NUMBER}" ]]; then
  echo "Unable to resolve project number for ${PROJECT_ID}" >&2
  exit 1
fi
CLOUD_TASKS_SERVICE_AGENT="service-${PROJECT_NUMBER}@gcp-sa-cloudtasks.iam.gserviceaccount.com"
CLOUD_SCHEDULER_SERVICE_AGENT="service-${PROJECT_NUMBER}@gcp-sa-cloudscheduler.iam.gserviceaccount.com"

# This role contains the token-minting permissions Cloud Tasks needs for OIDC.
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${CLOUD_TASKS_SERVICE_AGENT}" \
  --role="roles/cloudtasks.serviceAgent"

gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${CLOUD_SCHEDULER_SERVICE_AGENT}" \
  --role="roles/cloudscheduler.serviceAgent"

# Pub/Sub mints the OIDC token for push deliveries as the push service account;
# its service agent needs token-creator on that identity.
PUBSUB_SERVICE_AGENT="service-${PROJECT_NUMBER}@gcp-sa-pubsub.iam.gserviceaccount.com"
gcloud iam service-accounts add-iam-policy-binding "${PUBSUB_PUSH_EMAIL}" \
  --member="serviceAccount:${PUBSUB_SERVICE_AGENT}" \
  --role="roles/iam.serviceAccountTokenCreator" \
  --project="${PROJECT_ID}"

WORKER_SERVICE_URL="$(gcloud run services describe "${WORKER_SERVICE_NAME}" \
  --region="${GCP_LOCATION}" \
  --project="${PROJECT_ID}" \
  --format='value(status.url)')"

# ── Realtime Pub/Sub topics and push subscriptions ───────────────────────────
# The API publishes to these topics and the push subscriptions deliver to the
# publicly reachable /pubsub/* routes, where OIDC verification checks the token
# audience and the push service account identity.
if [[ -z "${API_BASE_URL}" ]]; then
  API_BASE_URL="$(gcloud run services describe "${API_SERVICE_NAME}" \
    --region="${GCP_LOCATION}" \
    --project="${PROJECT_ID}" \
    --format='value(status.url)')"
fi
API_BASE_URL="${API_BASE_URL%/}"
if [[ -z "${API_BASE_URL}" ]]; then
  echo "Unable to resolve API base URL for ${API_SERVICE_NAME}; set API_BASE_URL" >&2
  exit 1
fi

# Ordering is a subscription property (--enable-message-ordering); topics are
# created plainly. The publisher still attaches the per-conversation ordering
# key, which is only honored when the subscription has ordering enabled.
ensure_topic() {
  local topic="$1"
  if ! gcloud pubsub topics describe "${topic}" \
    --project="${PROJECT_ID}" >/dev/null 2>&1; then
    gcloud pubsub topics create "${topic}" --project="${PROJECT_ID}"
  fi
}

ensure_push_subscription() {
  local subscription="$1"
  local topic="$2"
  local endpoint="$3"
  if gcloud pubsub subscriptions describe "${subscription}" \
    --project="${PROJECT_ID}" >/dev/null 2>&1; then
    gcloud pubsub subscriptions update "${subscription}" \
      --push-endpoint="${endpoint}" \
      --push-auth-service-account="${PUBSUB_PUSH_EMAIL}" \
      --push-auth-token-audience="${API_BASE_URL}" \
      --enable-message-ordering \
      --ack-deadline="${PUBSUB_PUSH_ACK_DEADLINE}" \
      --project="${PROJECT_ID}"
  else
    gcloud pubsub subscriptions create "${subscription}" \
      --topic="${topic}" \
      --push-endpoint="${endpoint}" \
      --push-auth-service-account="${PUBSUB_PUSH_EMAIL}" \
      --push-auth-token-audience="${API_BASE_URL}" \
      --enable-message-ordering \
      --ack-deadline="${PUBSUB_PUSH_ACK_DEADLINE}" \
      --project="${PROJECT_ID}"
  fi
}

ensure_topic "${PUBSUB_REALTIME_TOPIC}"
ensure_topic "${PUBSUB_AI_STREAM_TOPIC}"
ensure_topic "${PUBSUB_SOCKETIO_ADAPTER_TOPIC}"
ensure_push_subscription \
  "${PUBSUB_REALTIME_SUBSCRIPTION}" \
  "${PUBSUB_REALTIME_TOPIC}" \
  "${API_BASE_URL}/pubsub/realtime"
ensure_push_subscription \
  "${PUBSUB_AI_STREAM_SUBSCRIPTION}" \
  "${PUBSUB_AI_STREAM_TOPIC}" \
  "${API_BASE_URL}/pubsub/ai-stream"

# The API and worker runtimes must be able to publish to durable/stream topics.
for topic in "${PUBSUB_REALTIME_TOPIC}" "${PUBSUB_AI_STREAM_TOPIC}"; do
  gcloud pubsub topics add-iam-policy-binding "${topic}" \
    --member="serviceAccount:${API_RUNTIME_SERVICE_ACCOUNT}" \
    --role="roles/pubsub.publisher" \
    --project="${PROJECT_ID}"
  if [[ "${WORKER_RUNTIME_SERVICE_ACCOUNT}" != "${API_RUNTIME_SERVICE_ACCOUNT}" ]]; then
    gcloud pubsub topics add-iam-policy-binding "${topic}" \
      --member="serviceAccount:${WORKER_RUNTIME_SERVICE_ACCOUNT}" \
      --role="roles/pubsub.publisher" \
      --project="${PROJECT_ID}"
  fi
done

# Socket.IO adapter: each API instance creates an ephemeral subscription and
# publishes cluster packets. The worker never enables WS, so only the API SA
# needs adapter permissions.
gcloud pubsub topics add-iam-policy-binding "${PUBSUB_SOCKETIO_ADAPTER_TOPIC}" \
  --member="serviceAccount:${API_RUNTIME_SERVICE_ACCOUNT}" \
  --role="roles/pubsub.publisher" \
  --project="${PROJECT_ID}"

SOCKETIO_ADAPTER_ROLE_ID="socketioPubsubAdapter"
SOCKETIO_ADAPTER_PERMISSIONS="pubsub.subscriptions.create,pubsub.subscriptions.delete,pubsub.subscriptions.consume,pubsub.subscriptions.get,pubsub.topics.publish,pubsub.topics.attachSubscription,pubsub.topics.get"
if ! gcloud iam roles describe "${SOCKETIO_ADAPTER_ROLE_ID}" \
  --project="${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud iam roles create "${SOCKETIO_ADAPTER_ROLE_ID}" \
    --project="${PROJECT_ID}" \
    --title="Socket.IO Pub/Sub adapter" \
    --permissions="${SOCKETIO_ADAPTER_PERMISSIONS}"
else
  gcloud iam roles update "${SOCKETIO_ADAPTER_ROLE_ID}" \
    --project="${PROJECT_ID}" \
    --permissions="${SOCKETIO_ADAPTER_PERMISSIONS}"
fi
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${API_RUNTIME_SERVICE_ACCOUNT}" \
  --role="projects/${PROJECT_ID}/roles/${SOCKETIO_ADAPTER_ROLE_ID}"

# The deploy identity (GitHub Actions) describes topics and subscriptions during
# the production verify step; without pubsub.viewer that check fails as "topic
# missing" because the gcloud error is masked.
if [[ -n "${CICD_SERVICE_ACCOUNT_EMAIL}" ]]; then
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:${CICD_SERVICE_ACCOUNT_EMAIL}" \
    --role="roles/pubsub.viewer"
fi

if gcloud scheduler jobs describe "${SCHEDULER_JOB_NAME}" \
  --location="${GCP_LOCATION}" \
  --project="${PROJECT_ID}" >/dev/null 2>&1; then
  SCHEDULER_COMMAND=update
  if [[ "${ACTIVATE_CLOUD_TASKS}" == "false" ]]; then
    SCHEDULER_STATE="$(gcloud scheduler jobs describe "${SCHEDULER_JOB_NAME}" \
      --location="${GCP_LOCATION}" \
      --project="${PROJECT_ID}" \
      --format='value(state)')"
    if [[ "${SCHEDULER_STATE}" != "PAUSED" ]]; then
      gcloud scheduler jobs pause "${SCHEDULER_JOB_NAME}" \
        --location="${GCP_LOCATION}" \
        --project="${PROJECT_ID}"
    fi
  fi
else
  SCHEDULER_COMMAND=create
fi

# The principal running this script must have iam.serviceAccounts.actAs on the
# invoker account. Runtime token minting is handled by the Scheduler service agent.
gcloud scheduler jobs "${SCHEDULER_COMMAND}" http "${SCHEDULER_JOB_NAME}" \
  --location="${GCP_LOCATION}" \
  --project="${PROJECT_ID}" \
  --schedule="${SCHEDULER_SCHEDULE}" \
  --time-zone="${SCHEDULER_TIME_ZONE}" \
  --uri="${WORKER_SERVICE_URL}/tasks/reconcile" \
  --http-method=POST \
  --oidc-service-account-email="${INVOKER_EMAIL}" \
  --oidc-token-audience="${WORKER_SERVICE_URL}" \
  --attempt-deadline=300s \
  --max-retry-attempts="${SCHEDULER_MAX_RETRY_ATTEMPTS}" \
  --max-retry-duration="${SCHEDULER_MAX_RETRY_DURATION}" \
  --min-backoff="${SCHEDULER_MIN_BACKOFF}" \
  --max-backoff="${SCHEDULER_MAX_BACKOFF}" \
  --max-doublings="${SCHEDULER_MAX_DOUBLINGS}"

if [[ "${ACTIVATE_CLOUD_TASKS}" == "true" ]]; then
  gcloud run services update "${WORKER_SERVICE_NAME}" \
    --region="${GCP_LOCATION}" \
    --project="${PROJECT_ID}" \
    --min-instances=0

  for TASKS_QUEUE_NAME in "$TASK_QUEUE_BASE" "$TASK_QUEUE_BASE-ai" "$TASK_QUEUE_BASE-delivery" "$TASK_QUEUE_BASE-documents"; do
  QUEUE_STATE="$(gcloud tasks queues describe "${TASKS_QUEUE_NAME}" \
    --location="${GCP_LOCATION}" \
    --project="${PROJECT_ID}" \
    --format='value(state)')"
  if [[ "${QUEUE_STATE}" != "RUNNING" ]]; then
    gcloud tasks queues resume "${TASKS_QUEUE_NAME}" \
      --location="${GCP_LOCATION}" \
      --project="${PROJECT_ID}"
  fi

  done
  TASKS_QUEUE_NAME="$TASK_QUEUE_BASE"

  SCHEDULER_STATE="$(gcloud scheduler jobs describe "${SCHEDULER_JOB_NAME}" \
    --location="${GCP_LOCATION}" \
    --project="${PROJECT_ID}" \
    --format='value(state)')"
  if [[ "${SCHEDULER_STATE}" != "ENABLED" ]]; then
    gcloud scheduler jobs resume "${SCHEDULER_JOB_NAME}" \
      --location="${GCP_LOCATION}" \
      --project="${PROJECT_ID}"
  fi
else
  SCHEDULER_STATE="$(gcloud scheduler jobs describe "${SCHEDULER_JOB_NAME}" \
    --location="${GCP_LOCATION}" \
    --project="${PROJECT_ID}" \
    --format='value(state)')"
  if [[ "${SCHEDULER_STATE}" != "PAUSED" ]]; then
    gcloud scheduler jobs pause "${SCHEDULER_JOB_NAME}" \
      --location="${GCP_LOCATION}" \
      --project="${PROJECT_ID}"
  fi
fi

cat <<OUTPUT
Cloud Tasks infrastructure is configured.
MODE=${DEPLOYMENT_MODE}
GCP_PROJECT_ID=${PROJECT_ID}
GCP_LOCATION=${GCP_LOCATION}
TASKS_QUEUE_NAME=${TASKS_QUEUE_NAME}
WORKER_SERVICE_URL=${WORKER_SERVICE_URL}
TASKS_SERVICE_ACCOUNT_EMAIL=${INVOKER_EMAIL}
BACKGROUND_EXECUTION_BACKEND=cloud_tasks
SCHEDULER_JOB_NAME=${SCHEDULER_JOB_NAME}
PUBSUB_REALTIME_TOPIC=${PUBSUB_REALTIME_TOPIC}
PUBSUB_AI_STREAM_TOPIC=${PUBSUB_AI_STREAM_TOPIC}
PUBSUB_REALTIME_SUBSCRIPTION=${PUBSUB_REALTIME_SUBSCRIPTION}
PUBSUB_AI_STREAM_SUBSCRIPTION=${PUBSUB_AI_STREAM_SUBSCRIPTION}
PUBSUB_PUSH_SERVICE_ACCOUNT_EMAIL=${PUBSUB_PUSH_EMAIL}
PUBSUB_PUSH_AUDIENCE=${API_BASE_URL}
OUTPUT

if [[ "${ACTIVATE_CLOUD_TASKS}" == "false" ]]; then
  ACTIVATION_VARIABLES=(
    PROJECT_ID API_RUNTIME_SERVICE_ACCOUNT WORKER_RUNTIME_SERVICE_ACCOUNT
    GCP_LOCATION TASKS_QUEUE_NAME WORKER_SERVICE_NAME TASKS_SERVICE_ACCOUNT_NAME
    MAX_DISPATCHES_PER_SECOND MAX_CONCURRENT_DISPATCHES MAX_ATTEMPTS MIN_BACKOFF
    MAX_BACKOFF MAX_DOUBLINGS MAX_RETRY_DURATION SCHEDULER_JOB_NAME
    SCHEDULER_SCHEDULE SCHEDULER_TIME_ZONE SCHEDULER_MAX_RETRY_ATTEMPTS
    SCHEDULER_MAX_RETRY_DURATION SCHEDULER_MIN_BACKOFF SCHEDULER_MAX_BACKOFF
    SCHEDULER_MAX_DOUBLINGS PUBSUB_REALTIME_TOPIC PUBSUB_AI_STREAM_TOPIC
    PUBSUB_REALTIME_SUBSCRIPTION PUBSUB_AI_STREAM_SUBSCRIPTION
    PUBSUB_PUSH_SERVICE_ACCOUNT_NAME API_SERVICE_NAME API_BASE_URL
    CICD_SERVICE_ACCOUNT_EMAIL
  )
  echo "Queue and Scheduler are paused; worker minimum instances were not changed."
  echo "After the cloud_tasks worker deployment succeeds, activate with:"
  printf 'ACTIVATE_CLOUD_TASKS=true '
  for VARIABLE_NAME in "${ACTIVATION_VARIABLES[@]}"; do
    printf '%s=%q ' "${VARIABLE_NAME}" "${!VARIABLE_NAME}"
  done
  printf './deploy-infrastructure.sh\n'
else
  echo "Queue and Scheduler are active; worker minimum instances are set to 0."
fi
