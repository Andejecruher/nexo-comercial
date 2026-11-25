# Request-driven background processing

> Esta es la construcción de Cloud Tasks que ya funciona, con el worker `nexo-worker`. Queda documentada y no se ejecuta. `deploy-infrastructure.sh` no llama a GCP. `<GCP_PROJECT_ID>` es un placeholder.



Production can run `nexo-worker` with zero minimum instances by setting
`BACKGROUND_EXECUTION_BACKEND=cloud_tasks`. Local and rollback deployments keep
the default `polling` mode and the existing PostgreSQL polling loops.

## Deployment sequence

1. Prepare infrastructure while the current polling worker remains available
   with at least one instance. Run `deploy-infrastructure.sh` with explicit
   `PROJECT_ID` and `API_RUNTIME_SERVICE_ACCOUNT` values. The caller must have
   `iam.serviceAccounts.actAs` on the task invoker account so it can configure
   the Scheduler job:

   ```bash
   PROJECT_ID=<GCP_PROJECT_ID> \
   API_RUNTIME_SERVICE_ACCOUNT=nexo-comercial-run-sa@<GCP_PROJECT_ID>.iam.gserviceaccount.com \
   ./deploy-infrastructure.sh
   ```

   Prepare-only mode is the default. It creates or updates the APIs, queue,
   service account, IAM, and Scheduler job, then leaves the queue and Scheduler
   paused. It does not change the existing worker's minimum instances.
2. Set the repository workflow variables `GCP_TASKS_QUEUE_NAME`,
   `GCP_WORKER_SERVICE_URL`, and `GCP_TASKS_SERVICE_ACCOUNT_EMAIL` from the
   script output.
3. Build the images and apply Prisma migrations, including the inbox/outbox
   lease columns, while the polling worker remains available.
4. Deploy the API and `nexo-worker` with
   `BACKGROUND_EXECUTION_BACKEND=cloud_tasks`. The worker deployment sets
   `--min-instances=0`.
5. After the worker deployment succeeds, the GCP workflow resumes the
   `background-tasks` queue and `background-tasks-reconcile` Scheduler job. If
   the workflow is not used, run the exact activation command printed by the
   preparation step. Its manual form is:

   ```bash
   ACTIVATE_CLOUD_TASKS=true \
   PROJECT_ID=<GCP_PROJECT_ID> \
   API_RUNTIME_SERVICE_ACCOUNT=nexo-comercial-run-sa@<GCP_PROJECT_ID>.iam.gserviceaccount.com \
   ./deploy-infrastructure.sh
   ```

   Activation is explicit: it sets the worker minimum instances to zero and
   resumes the queue and Scheduler. The script accepts only `true` or `false`
   for `ACTIVATE_CLOUD_TASKS`.
6. Confirm task dispatch and handler success, then remove the old polling
   revision after its in-flight work drains.

## Safe rollback

1. Pause the `background-tasks` queue.
2. Pause the `background-tasks-reconcile` Scheduler job.
3. Restore `BACKGROUND_EXECUTION_BACKEND=polling` and `WORKERS_ENABLED=true` on
   the polling worker, and set its minimum instances to `1` before relying on
   the polling path.

Pause both dispatch sources first so Cloud Tasks and polling workers do not
process the same durable work during the transition.

## Delivery contract

| Handler                 | Durable identifier         | Terminal duplicate behavior                 |
| ----------------------- | -------------------------- | ------------------------------------------- |
| `/tasks/process-ocr`    | OCR job UUID               | `200 noop` after completion/final failure   |
| `/tasks/process-inbox`  | inbox event UUID           | `200 noop` after processing/dead-letter     |
| `/tasks/process-outbox` | outbox event UUID          | `200 noop` after send/dead-letter           |
| `/tasks/notifications`  | realtime outbox event UUID | `200 noop` after publish/dead-letter        |
| `/tasks/export`         | Export job UUID            | `200 noop` after `ready`/`failed`/`expired` |
| `/tasks/reconcile`      | none                       | Re-dispatches eligible durable work         |

Bodies contain only `{ "id": "<uuid>" }`. Private Cloud Run ingress and the
invoker service account's OIDC token are the authentication boundary; task
headers are not trusted as proof of identity.

Task names are always provider-generated. Repeated producer, manual retry, and
reconciliation calls can create duplicate Cloud Tasks; conditional durable
status claims ensure only one request performs work and the others return a
`200 noop`. This avoids Cloud Tasks task-name retention suppressing a later
independent retry.

Cloud Tasks considers only `2xx` successful. It retries malformed or unknown
task requests that return `4xx`, as well as retryable processing failures that
return `5xx`, according to the queue policy.

## Atomicity limitation

PostgreSQL writes and Cloud Tasks task creation cannot share a transaction.
Inbox and WhatsApp outbox producers can safely surface dispatch failures because
their durable idempotency keys make the caller retry safe. OCR dispatch happens
after the upload transaction and outside Drive compensation; failures are logged
without converting a committed upload into a client-visible failure. Realtime
producers only persist `RealtimeOutboxEvent` inside their domain transaction;
they do not attempt pre-commit task dispatch.

Cloud Scheduler calls `/tasks/reconcile` every five minutes with the same OIDC
invoker identity. This wakes a zero-instance worker and closes isolated
database/Cloud Tasks dual-write gaps, including durable realtime events. The
endpoint returns `5xx` if any task dispatch fails so Scheduler applies its retry
policy. `/tasks/reconcile` does not re-dispatch queued `ExportJob` rows. In
`polling`, the worker loop claims those rows. In `cloud_tasks`, a failed
`dispatchExportJob` after persist leaves the job `queued` until a later
producer retry.

Reconciliation reads each work type in ordered 50-record cursor pages. One
invocation processes at most `TASKS_RECONCILE_MAX_PER_TYPE` records per type
(default 250, maximum 5000), keeping the Cloud Run request bounded. When the cap
is reached, eligible records remain durable for subsequent five-minute
Scheduler runs. Terminal rows and retries whose due time has not arrived are
excluded, so completed, invalid, or deferred prefix rows do not consume the cap.
API and worker startup reconciliation remains as an additional recovery path.

No generic task table is introduced. Durable status claims remain the source of
idempotency. A crash after an external WhatsApp send but before the `sent` status
commit remains an unavoidable at-least-once delivery edge in the existing
outbox design.
