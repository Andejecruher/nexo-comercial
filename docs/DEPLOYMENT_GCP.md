# SOP de infraestructura y despliegue en GCP

## Construcción vigente

Esta es la construcción que ya funciona. Nexo Comercial no cambia el diseño: conserva el mismo flujo, las mismas imágenes, el mismo orden de despliegue y las mismas variables. Lo único que cambia son los nombres, para que el contrato sea de este proyecto y no de Voz Ciudadana.

GitHub no ejecuta nada de esto. El archivo [`docs/deploy/deploy-gcp.yml`](deploy/deploy-gcp.yml) está fuera de `.github/workflows` y su bloque `on:` está comentado. Los jobs quedan escritos completos. `make gcp-*`, `scripts/deploy-gcp-local.sh` y `deploy-infrastructure.sh` no llaman a GCP.

| Pieza                         | Nombre en Nexo Comercial |
| ----------------------------- | ------------------------ |
| API Cloud Run                 | `nexo-api`               |
| Worker Cloud Run              | `nexo-worker`            |
| Relay realtime                | `nexo-realtime-relay`    |
| Frontend Cloud Run            | `nexo-frontend`          |
| Job de migraciones            | `nexo-migrator`          |
| Imagen de herramientas        | `nexo-tools`             |
| Artifact Registry y Cloud SQL | `nexo-comercial`         |
| Base PostgreSQL               | `nexocomercial`          |

El flujo, en el mismo orden del pipeline que ya está en producción:

1. `detect` mira qué superficies cambiaron.
2. `quality` y `backend-ci` corren como workflows reutilizables, sin un build Docker duplicado, y `ci-gate` los espera.
3. `build` publica en paralelo `nexo-api` y `nexo-worker` desde `backend/Dockerfile` (`runner` y `worker`), `nexo-tools` para el migrador, y `nexo-frontend`.
4. `migrate` ejecuta el job `nexo-migrator` con `prisma migrate deploy`. Si falla, el backend no se despliega.
5. `deploy` sube primero worker y relay, después la API, y el frontend al final.
6. `verify` revisa salud, Cloud Tasks, Scheduler, Pub/Sub y los flags de costo de cada servicio.

El presupuesto de conexiones no se toca: API máximo 5 instancias con pool 5, worker máximo 5 con pool 2, relay máximo 2 con pool 2. El detalle sigue en [CLOUD_SQL_CONNECTION.md](CLOUD_SQL_CONNECTION.md).

`<GCP_PROJECT_ID>` es un placeholder. Esta guía no apunta a un proyecto existente.

Para volver a desplegar, más adelante: crear el proyecto GCP, descomentar el bloque `on:` y copiar `docs/deploy/deploy-gcp.yml` a `.github/workflows/deploy-gcp.yml`. Hasta ese momento el archivo es la documentación de la construcción, no un despliegue.



> Actualización realtime (2026-10-13): el workflow preparado en esta revisión cambia API a min 1/timeout 3600 s, incorpora un relay privado min 1 con CPU permanente y pool 2, y separa colas IA/entrega/documentos. Antes de ejecutar los comandos históricos de esta guía, consultar [implementación y rollout realtime](analysis/realtime-implementation.md), que detalla migración, orden, flags, coste y rollback. Estos cambios aún requieren despliegue y medición en el proyecto.


Playbook reproducible para crear un entorno nuevo de Nexo Comercial en Google Cloud Platform. Cubre la infraestructura activa, identidades, secretos, compilación, migraciones, seeds, despliegue, verificación, rollback y diagnóstico del monorepo (`backend` Express + Prisma y `frontend` Next.js).

> **Alcance y fuente de verdad.** Este documento reconcilia el repositorio con una lectura de producción realizada el 15 de agosto de 2026, la activación request-driven verificada el 19 de agosto de 2026 y la auditoría de costos de Cloud Run/Cloud SQL y la remoción del Serverless VPC Access Connector `voz-connector` con Memorystore for Redis de septiembre de 2026 en el proyecto de referencia `<GCP_PROJECT_ID>`, región `us-central1`. Los comandos usan placeholders y no contienen credenciales ni datos personales. La ruta canónica de entregas repetibles es [`docs/deploy/deploy-gcp.yml`](deploy/deploy-gcp.yml); el `Makefile` es auxiliar. La política vigente de scale-to-zero y CPU está en [Optimización de costos y buenas prácticas de despliegue](#optimización-de-costos-y-buenas-prácticas-de-despliegue).

## Resultado esperado

Al terminar existirán:

| Recurso                 | Nombre de plantilla                                       | Acceso              | Función                                                            |
| ----------------------- | --------------------------------------------------------- | ------------------- | ------------------------------------------------------------------ |
| Artifact Registry       | `nexo-comercial`                                          | Privado             | Imágenes `nexo-api`, `nexo-worker`, `nexo-tools`, `nexo-frontend`  |
| Cloud SQL PostgreSQL 16 | `nexo-comercial`                                          | Cloud SQL connector | Base `nexocomercial`; migraciones Prisma                           |
| Pub/Sub                 | Topics `realtime-events`, `ai-stream`, `socketio-adapter` | Push + adapter      | Realtime durable, streaming IA y fan-out Socket.IO multi-instancia |
| Cloud Run service       | `nexo-api`                                                | Público             | HTTP, WebSocket y webhook; JWT/RBAC en Express                     |
| Cloud Run service       | `nexo-worker`                                             | Privado             | Handlers HTTP de Cloud Tasks; polling solo para bootstrap/rollback |
| Cloud Run service       | `nexo-frontend`                                           | Público             | Next.js                                                            |
| Cloud Run job           | `nexo-migrator`                                           | Operacional         | `prisma migrate deploy`                                            |
| Cloud Run jobs          | `nexo-seeder-core`, `nexo-seeder-dev`                     | Operacional         | Bootstrap auditado, solo cuando corresponda                        |
| Service accounts        | runtime y CI/CD                                           | IAM mínimo          | Ejecución separada de despliegue                                   |
| WIF                     | pool y provider GitHub                                    | OIDC                | CI/CD sin llave JSON                                               |

El realtime ya no pasa por Redis: el worker publica en Pub/Sub (topics `realtime-events` para eventos durables y `ai-stream` para streaming IA, ambos con ordering habilitado) y la API recibe los eventos por push subscriptions HTTP y los entrega por Socket.IO. El adaptador oficial `@socket.io/gcp-pubsub-adapter` usa un topic dedicado `socketio-adapter` (distinto de `realtime-events`) para que un `emit` en una réplica de Cloud Run alcance los sockets locales de las demás. El adapter no ofrece connection-state recovery: el cliente reconecta y recupera estado por REST.

### Topología

```text
GitHub Actions --OIDC/WIF--> SA de despliegue
       |                         |
       | buildx                  +--> Cloud Run / Jobs
       v
Artifact Registry
       |
       +--> nexo-api ------------+--> Cloud SQL (socket /cloudsql/...)
       |       |                +<--- Pub/Sub push (realtime-events, ai-stream)
       |       |                +<--- Pub/Sub adapter (socketio-adapter, per-instance subscriptions)
       |       +--> Document AI (ADC de la SA runtime)
       |       +--> Google Drive (OAuth runtime)
       |
       +--> nexo-worker <---OIDC--- Cloud Tasks / Cloud Scheduler
       |       +-----------> Cloud SQL + proveedores
       |       +-----------> Publica en Pub/Sub (realtime-events, ai-stream)
       |
       +--> nexo-frontend -------> nexo-api (URL congelada durante next build)

Internet --> nexo-frontend (público)
Internet --> nexo-api (público; Express JWT/RBAC es la frontera de aplicación)
Internet -X-> nexo-worker (privado)
```

## Ruta rápida

Use esta secuencia para un entorno nuevo. Las secciones posteriores contienen los comandos completos y criterios de aceptación.

1. Definir y validar [placeholders](#1-preparar-el-entorno-operativo).
2. Habilitar APIs y crear [IAM/WIF](#3-crear-identidades-iam-y-wif).
3. Crear Artifact Registry y [Cloud SQL](#5-crear-cloud-sql).
4. Crear todos los nombres y versiones de [Secret Manager](#6-crear-secretos).
5. Configurar los tres secrets y seis variables activos de GitHub.
6. Construir y publicar `runner`, `tools` y `frontend` con tags `sha-*`.
7. Desplegar y ejecutar `nexo-migrator`; detenerse si falla.
8. En un bootstrap vacío, ejecutar `nexo-seeder-core` y luego `nexo-seeder-dev`, ambos con `NODE_ENV=staging`.
9. Para la primera activación request-driven, seguir [Primer despliegue del worker con Cloud Tasks y Cloud Scheduler](#primer-despliegue-del-worker-con-cloud-tasks-y-cloud-scheduler). Nunca desplegar el worker con `--source`.
10. Hacer públicos solo API y frontend; mantener privado el worker.
11. Verificar salud, IAM, flags de costo (min 0, CPU throttling, timeouts), pools, imágenes y logs.

### Gate de finalización

- [ ] `nexo-migrator` terminó con `EXECUTION_SUCCEEDED`.
- [ ] API `/ready`, worker `/ready` (autenticado) y frontend `/` responden.
- [ ] API y frontend tienen `allUsers -> roles/run.invoker`; worker no.
- [ ] Worker privado usa `BACKGROUND_EXECUTION_BACKEND=cloud_tasks`, 1 CPU, 1 GiB, min 0, max 5, `--cpu-throttling` y timeout 300 s.
- [ ] API usa max 5, `--cpu-throttling` (ver *Contrato que CI/CD no debe revertir*).
- [ ] Queue `background-tasks` está `RUNNING` y Scheduler `background-tasks-reconcile` está `ENABLED`.
- [ ] API usa `PRISMA_CONNECTION_LIMIT=5`, worker `2` y relay `2` (regla de oro: [docs/CLOUD_SQL_CONNECTION.md](./CLOUD_SQL_CONNECTION.md) §3).
- [ ] Las imágenes activas provienen de `REGION-docker.pkg.dev/PROJECT_ID/nexo-comercial`, no de `cloud-run-source-deploy`.
- [ ] `DOCUMENT_AI_PROCESSOR_ID` es una referencia de Secret Manager.
- [ ] No se imprimió ni consultó ningún valor secreto durante la verificación.

## Primer despliegue del worker con Cloud Tasks y Cloud Scheduler

Esta sección es el gate obligatorio para migrar por primera vez el worker existente desde polling continuo al procesamiento request-driven. La preparación debe ocurrir **antes** del deploy, pero la queue y Scheduler deben permanecer pausados hasta que la nueva revisión de `nexo-worker` esté sana. El contrato de handlers, reintentos e idempotencia se detalla en el [runbook de Cloud Tasks](CLOUD_TASKS_WORKER.md).

### 1. Fijar proyecto, región, servicios e identidades

Use el ID real y accesible del proyecto, no un alias corto ni un nombre de configuración local. `nexo-api` y `nexo-worker` deben existir en `us-central1`; si el worker todavía no existe, despliegue primero el [worker polling de bootstrap](#worker-polling-de-bootstrap-o-rollback) con min 1.

```bash
export PROJECT_ID="<gcp-project-id-real>"
export REGION="us-central1"
export API_SERVICE_NAME="nexo-api"
export WORKER_SERVICE_NAME="nexo-worker"
export GITHUB_REPO="Andejecruher/nexo-comercial"

export API_RUNTIME_SERVICE_ACCOUNT="nexo-comercial-run-sa@${PROJECT_ID}.iam.gserviceaccount.com"
export WORKER_RUNTIME_SERVICE_ACCOUNT="${API_RUNTIME_SERVICE_ACCOUNT}"
export TASKS_SERVICE_ACCOUNT_NAME="cloud-tasks-invoker"
export TASKS_SERVICE_ACCOUNT_EMAIL="${TASKS_SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
export CICD_SERVICE_ACCOUNT_EMAIL="nexo-comercial-cicd-sa@${PROJECT_ID}.iam.gserviceaccount.com"

export TASKS_QUEUE_NAME="background-tasks"
export SCHEDULER_JOB_NAME="background-tasks-reconcile"

gcloud projects describe "$PROJECT_ID" \
  --format='table(projectId,projectNumber,lifecycleState)'
gcloud run services describe "$API_SERVICE_NAME" \
  --region="$REGION" --project="$PROJECT_ID" --format='value(metadata.name)'
gcloud run services describe "$WORKER_SERVICE_NAME" \
  --region="$REGION" --project="$PROJECT_ID" --format='value(metadata.name)'
```

**Identidades:** API y worker usan la SA runtime; en este entorno comparten `nexo-comercial-run-sa`. Cloud Tasks y Scheduler presentan OIDC como `cloud-tasks-invoker`. GitHub Actions se autentica como `nexo-comercial-cicd-sa`. No intercambie estas responsabilidades ni use una llave JSON.

### 2. Aplicar IAM antes del primer workflow

`deploy-infrastructure.sh` crea la SA invoker si falta y aplica los bindings de runtime, invocación y service agents. Los siguientes comandos variables muestran el estado IAM requerido y son idempotentes para un operador bootstrap con permisos suficientes:

```bash
gcloud services enable \
  cloudtasks.googleapis.com \
  cloudscheduler.googleapis.com \
  --project="$PROJECT_ID"

gcloud iam service-accounts describe "$TASKS_SERVICE_ACCOUNT_EMAIL" \
  --project="$PROJECT_ID" >/dev/null 2>&1 || \
  gcloud iam service-accounts create "$TASKS_SERVICE_ACCOUNT_NAME" \
    --display-name="Cloud Tasks worker invoker" \
    --project="$PROJECT_ID"

for runtime_sa in "$API_RUNTIME_SERVICE_ACCOUNT" "$WORKER_RUNTIME_SERVICE_ACCOUNT"; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${runtime_sa}" \
    --role="roles/cloudtasks.enqueuer" \
    --condition=None

  gcloud iam service-accounts add-iam-policy-binding "$TASKS_SERVICE_ACCOUNT_EMAIL" \
    --member="serviceAccount:${runtime_sa}" \
    --role="roles/iam.serviceAccountUser" \
    --project="$PROJECT_ID"
done

gcloud run services add-iam-policy-binding "$WORKER_SERVICE_NAME" \
  --region="$REGION" \
  --project="$PROJECT_ID" \
  --member="serviceAccount:${TASKS_SERVICE_ACCOUNT_EMAIL}" \
  --role="roles/run.invoker"

export PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
export CLOUD_TASKS_SERVICE_AGENT="service-${PROJECT_NUMBER}@gcp-sa-cloudtasks.iam.gserviceaccount.com"
export CLOUD_SCHEDULER_SERVICE_AGENT="service-${PROJECT_NUMBER}@gcp-sa-cloudscheduler.iam.gserviceaccount.com"

gcloud beta services identity create \
  --service=cloudtasks.googleapis.com --project="$PROJECT_ID"
gcloud beta services identity create \
  --service=cloudscheduler.googleapis.com --project="$PROJECT_ID"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${CLOUD_TASKS_SERVICE_AGENT}" \
  --role="roles/cloudtasks.serviceAgent" \
  --condition=None
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${CLOUD_SCHEDULER_SERVICE_AGENT}" \
  --role="roles/cloudscheduler.serviceAgent" \
  --condition=None
```

La identidad que ejecuta `deploy-infrastructure.sh` también necesita `iam.serviceAccounts.actAs` sobre `TASKS_SERVICE_ACCOUNT_EMAIL` para crear o actualizar Scheduler con esa identidad OIDC. Concédalo sobre la SA invoker, no a nivel proyecto:

```bash
export BOOTSTRAP_PRINCIPAL="<user:operator@example.com-or-serviceAccount:bootstrap-sa@example.iam.gserviceaccount.com>"

gcloud iam service-accounts add-iam-policy-binding "$TASKS_SERVICE_ACCOUNT_EMAIL" \
  --member="$BOOTSTRAP_PRINCIPAL" \
  --role="roles/iam.serviceAccountUser" \
  --project="$PROJECT_ID"
```

La SA CI/CD requiere además estos tres roles porque [el workflow](deploy/deploy-gcp.yml) describe y reanuda la queue y Scheduler, y verifica los topics y push subscriptions de Pub/Sub. **Son prerrequisitos de primer deploy:** su ausencia ya causó fallos reales (activación después de desplegar el worker, y verificación de Pub/Sub reportada como "topic missing" cuando en realidad faltaba `pubsub.viewer`).

```bash
for role in roles/cloudtasks.queueAdmin roles/cloudscheduler.admin roles/pubsub.viewer; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${CICD_SERVICE_ACCOUNT_EMAIL}" \
    --role="$role" \
    --condition=None
done
```

`roles/pubsub.viewer` a nivel proyecto habilita `pubsub.topics.get` y
`pubsub.subscriptions.get`; también puede concederlo por topic y por subscription
si prefiere un scope mínimo. `deploy-infrastructure.sh` lo aplica cuando recibe
`CICD_SERVICE_ACCOUNT_EMAIL`.

### 2.b Pub/Sub durable realtime (topics y push subscriptions)

`deploy-infrastructure.sh` habilita además `pubsub.googleapis.com`, crea la SA
`pubsub-push-invoker`, los topics `realtime-events` y `ai-stream` y las push
subscriptions `realtime-events-push`/`ai-stream-push`. Las subscriptions
entregan a los endpoints públicos `/pubsub/realtime` y `/pubsub/ai-stream` con
un token OIDC (`--push-auth-service-account`) y ordenamiento por conversación
(`--enable-message-ordering`); el API verifica ese token contra
`PUBSUB_PUSH_AUDIENCE` y `PUBSUB_PUSH_SERVICE_ACCOUNT_EMAIL`.

El audience del token debe ser el origen canónico del API. Pase `API_BASE_URL`
al script con el mismo valor que `GCP_API_BASE_URL`; si lo omite, el script usa
la URL `run.app` de `nexo-api`, que también sirve siempre que el API reciba
`PUBSUB_PUSH_AUDIENCE` con ese mismo origen. La salida imprime
`PUBSUB_PUSH_SERVICE_ACCOUNT_EMAIL` y `PUBSUB_PUSH_AUDIENCE`.

```bash
API_BASE_URL="$GCP_API_BASE_URL" \
PROJECT_ID="$PROJECT_ID" \
API_RUNTIME_SERVICE_ACCOUNT="$API_RUNTIME_SERVICE_ACCOUNT" \
CICD_SERVICE_ACCOUNT_EMAIL="$CICD_SERVICE_ACCOUNT_EMAIL" \
./deploy-infrastructure.sh
```

El rol `roles/pubsub.publisher` se concede por topic a las SA runtime (API y
worker) y el service agent de Pub/Sub recibe `iam.serviceAccountTokenCreator`
sobre la SA de push para poder mintear el token OIDC. La SA de CI/CD recibe
`roles/pubsub.viewer` (cuando se pasa `CICD_SERVICE_ACCOUNT_EMAIL`) para que el
paso de verificación del workflow pueda describir topics y subscriptions.

### 3. Preparar sin activar

Ejecute el script en su modo default `prepare-only` **antes** de enviar el código. No defina `ACTIVATE_CLOUD_TASKS=true` en esta fase.

```bash
PROJECT_ID="$PROJECT_ID" \
API_RUNTIME_SERVICE_ACCOUNT="$API_RUNTIME_SERVICE_ACCOUNT" \
WORKER_RUNTIME_SERVICE_ACCOUNT="$WORKER_RUNTIME_SERVICE_ACCOUNT" \
GCP_LOCATION="$REGION" \
TASKS_QUEUE_NAME="$TASKS_QUEUE_NAME" \
WORKER_SERVICE_NAME="$WORKER_SERVICE_NAME" \
TASKS_SERVICE_ACCOUNT_NAME="$TASKS_SERVICE_ACCOUNT_NAME" \
CICD_SERVICE_ACCOUNT_EMAIL="$CICD_SERVICE_ACCOUNT_EMAIL" \
./deploy-infrastructure.sh
```

Antes de continuar, confirme los tres seguros: queue `PAUSED`, Scheduler `PAUSED` y el worker polling legado todavía con min 1.

```bash
gcloud tasks queues describe "$TASKS_QUEUE_NAME" \
  --location="$REGION" --project="$PROJECT_ID" \
  --format='value(state)'
gcloud scheduler jobs describe "$SCHEDULER_JOB_NAME" \
  --location="$REGION" --project="$PROJECT_ID" \
  --format='value(state)'
gcloud run services describe "$WORKER_SERVICE_NAME" \
  --region="$REGION" --project="$PROJECT_ID" \
  --format='yaml(spec.template.metadata.annotations,spec.template.spec.containers[0].env)'
```

No continúe si los estados no son `PAUSED`, `PAUSED` y `autoscaling.knative.dev/minScale: '1'` con `BACKGROUND_EXECUTION_BACKEND=polling` o sin esa variable, cuyo default es polling.

### 4. Configurar GitHub y desplegar

Tome `TASKS_QUEUE_NAME`, `WORKER_SERVICE_URL`, `TASKS_SERVICE_ACCOUNT_EMAIL` y `PUBSUB_PUSH_SERVICE_ACCOUNT_EMAIL` de la salida del script y configure las variables adicionales del repositorio:

```bash
export WORKER_SERVICE_URL="$(gcloud run services describe "$WORKER_SERVICE_NAME" \
  --region="$REGION" --project="$PROJECT_ID" --format='value(status.url)')"

gh variable set GCP_TASKS_QUEUE_NAME \
  --repo="$GITHUB_REPO" --body="$TASKS_QUEUE_NAME"
gh variable set GCP_WORKER_SERVICE_URL \
  --repo="$GITHUB_REPO" --body="$WORKER_SERVICE_URL"
gh variable set GCP_TASKS_SERVICE_ACCOUNT_EMAIL \
  --repo="$GITHUB_REPO" --body="$TASKS_SERVICE_ACCOUNT_EMAIL"
gh variable set GCP_PUBSUB_PUSH_SERVICE_ACCOUNT_EMAIL \
  --repo="$GITHUB_REPO" --body="$PUBSUB_PUSH_SERVICE_ACCOUNT_EMAIL"
```

Después haga push a `main` o ejecute `workflow_dispatch`. El workflow canónico:

1. Construye las imágenes y aplica `prisma migrate deploy`, incluidas las columnas de lease durables.
2. Despliega `nexo-api` y `nexo-worker` con `BACKGROUND_EXECUTION_BACKEND=cloud_tasks`.
3. Mantiene `WORKERS_ENABLED=false` en API y `true` en worker.
4. Configura el worker con min 0, max 20, `--cpu-throttling` y timeout 300 s.
5. Solo después de que el deploy del worker termina correctamente, reanuda la queue y Scheduler.

La alternativa manual se permite únicamente después de comprobar que la nueva revisión del worker está Ready, usa `cloud_tasks` y expone los endpoints `/tasks/*`:

```bash
ACTIVATE_CLOUD_TASKS=true \
PROJECT_ID="$PROJECT_ID" \
API_RUNTIME_SERVICE_ACCOUNT="$API_RUNTIME_SERVICE_ACCOUNT" \
WORKER_RUNTIME_SERVICE_ACCOUNT="$WORKER_RUNTIME_SERVICE_ACCOUNT" \
GCP_LOCATION="$REGION" \
TASKS_QUEUE_NAME="$TASKS_QUEUE_NAME" \
WORKER_SERVICE_NAME="$WORKER_SERVICE_NAME" \
TASKS_SERVICE_ACCOUNT_NAME="$TASKS_SERVICE_ACCOUNT_NAME" \
CICD_SERVICE_ACCOUNT_EMAIL="$CICD_SERVICE_ACCOUNT_EMAIL" \
./deploy-infrastructure.sh
```

### 5. Verificar activación y procesamiento

```bash
gh run list --workflow=deploy-gcp.yml --limit=5

gcloud tasks queues describe "$TASKS_QUEUE_NAME" \
  --location="$REGION" --project="$PROJECT_ID" \
  --format='yaml(name,state,rateLimits,retryConfig)'
gcloud scheduler jobs describe "$SCHEDULER_JOB_NAME" \
  --location="$REGION" --project="$PROJECT_ID" \
  --format='yaml(name,state,schedule,httpTarget.uri,httpTarget.oidcToken.serviceAccountEmail)'
gcloud run services describe "$WORKER_SERVICE_NAME" \
  --region="$REGION" --project="$PROJECT_ID" \
  --format='yaml(status.latestReadyRevisionName,spec.template.metadata.annotations,spec.template.spec.containers[0].env)'
gcloud run services describe "$API_SERVICE_NAME" \
  --region="$REGION" --project="$PROJECT_ID" \
  --format='yaml(status.latestReadyRevisionName,spec.template.spec.containers[0].env)'

gcloud scheduler jobs run "$SCHEDULER_JOB_NAME" \
  --location="$REGION" --project="$PROJECT_ID"
gcloud logging read \
  'resource.type="cloud_run_revision" AND resource.labels.service_name="nexo-worker" AND httpRequest.requestUrl:"/tasks/reconcile" AND httpRequest.status=200' \
  --project="$PROJECT_ID" --freshness=30m --limit=20

gcloud tasks list --queue="$TASKS_QUEUE_NAME" \
  --location="$REGION" --project="$PROJECT_ID" \
  --format='table(name,scheduleTime,dispatchCount,responseCount)'

gcloud pubsub topics list \
  --project="$PROJECT_ID" \
  --format='table(name)'
gcloud pubsub subscriptions describe realtime-events-push \
  --project="$PROJECT_ID" \
  --format='yaml(pushConfig.pushEndpoint,pushConfig.oidcToken,enableMessageOrdering)'
gcloud pubsub subscriptions describe ai-stream-push \
  --project="$PROJECT_ID" \
  --format='yaml(pushConfig.pushEndpoint,pushConfig.oidcToken,enableMessageOrdering)'
```

El push autenticado se puede comprobar de punta a punta publicando un evento de
prueba y confirmando que Pub/Sub obtiene 2xx del API (si el OIDC no coincide, el
API responde 401). Los logs de la push subscription registran los reintentos.

Checklist de aceptación:

- [ ] El workflow de build, migración y deploy terminó sin pasos fallidos.
- [ ] Queue en `RUNNING` y Scheduler en `ENABLED`.
- [ ] Topics `realtime-events` y `ai-stream` existen con sus push subscriptions en `enableMessageOrdering: true`.
- [ ] Cada push subscription usa `pushAuthServiceAccount` = SA `pubsub-push-invoker` y `audience` = origen canónico del API.
- [ ] La SA de deploy (CI/CD) tiene `roles/cloudtasks.queueAdmin`, `roles/cloudscheduler.admin` y `roles/pubsub.viewer` (prerrequisitos del paso verify).
- [ ] Un `POST` sin token a `/pubsub/realtime` responde `401` (el middleware OIDC exige identidad).
- [ ] Worker Ready con `autoscaling.knative.dev/minScale: '0'`, max 20 y `run.googleapis.com/cpu-throttling: 'true'`.
- [ ] API y worker usan `BACKGROUND_EXECUTION_BACKEND=cloud_tasks`; API conserva `WORKERS_ENABLED=false`.
- [ ] API y worker tienen `ENABLE_XLSX_EXPORT=true`; un POST autenticado a `/exports/promoted` responde 202 y crea una Cloud Task a `/tasks/export`.
- [ ] La ejecución manual de Scheduler produjo `POST /tasks/reconcile` con HTTP 200 en logs del worker.
- [ ] La queue se drena; no quedan tareas pendientes una vez procesada la carga esperada.

### 6. Rollback seguro a polling

Pause primero las dos fuentes request-driven. Solo entonces restaure polling con capacidad mínima disponible:

```bash
gcloud tasks queues pause "$TASKS_QUEUE_NAME" \
  --location="$REGION" --project="$PROJECT_ID"
gcloud scheduler jobs pause "$SCHEDULER_JOB_NAME" \
  --location="$REGION" --project="$PROJECT_ID"

gcloud run services update "$WORKER_SERVICE_NAME" \
  --region="$REGION" --project="$PROJECT_ID" \
  --update-env-vars="BACKGROUND_EXECUTION_BACKEND=polling,WORKERS_ENABLED=true" \
  --min-instances=1 \
  --no-cpu-throttling

gcloud run services update "$API_SERVICE_NAME" \
  --region="$REGION" --project="$PROJECT_ID" \
  --update-env-vars="WORKERS_ENABLED=false"
```

Espere a que la revisión polling del worker esté Ready antes de dar por recuperado el procesamiento. No elimine las filas durables de inbox/outbox/OCR/realtime ni revierta o borre la migración: polling reutiliza ese estado para continuar el trabajo pendiente.

El export XLSX en `polling` persiste el job y el worker lo polea (igual que OCR). Cloud Tasks solo despierta `/tasks/export` en producción. Para apagar el feature sin rollback de workers:

```bash
gcloud run services update "$API_SERVICE_NAME" \
  --region="$REGION" --project="$PROJECT_ID" \
  --update-env-vars="ENABLE_XLSX_EXPORT=false"
gcloud run services update "$WORKER_SERVICE_NAME" \
  --region="$REGION" --project="$PROJECT_ID" \
  --update-env-vars="ENABLE_XLSX_EXPORT=false"
```

### Errores comunes

- No use un alias corto, inaccesible o inferido para el proyecto. Verifique el `PROJECT_ID` real con `gcloud projects describe` antes de crear IAM o recursos.
- Cloud Tasks no puede invocar `localhost`; `GCP_WORKER_SERVICE_URL` debe ser la URL HTTPS privada `run.app` de `nexo-worker`.
- Cloud Tasks considera exitosos solo los `2xx`; cualquier respuesta no `2xx`, incluidos `4xx`, se reintenta según la política de la queue.
- La escritura en PostgreSQL y la creación de Cloud Tasks no son atómicas. Scheduler y `/tasks/reconcile` son obligatorios para cerrar esos gaps.
- No reduzca el worker polling legado a min 0 antes de desplegar y validar los endpoints `/tasks/*`; hacerlo deja el trabajo durable sin consumidor.
- No active queue o Scheduler durante `prepare-only`. El workflow o la activación manual posterior son los únicos gates de activación.

## Estado de referencia y drift

La siguiente tabla evita confundir infraestructura activa con intención histórica.

En el snapshot histórico de referencia anterior a Cloud Tasks, la revisión activa del worker era `nexo-worker-00020-kv2`: Ready, 100 % del tráfico, 1 CPU, 1 GiB, min 1, max 5 y `run.googleapis.com/cpu-throttling=false`. Ese estado polling se conserva como bootstrap/rollback; el objetivo actual es request-driven con min 0.

| Área                       | Producción de referencia                                                                                             | Repositorio                                              | Acción para reproducir                                                            |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Cloud Run                  | API, worker y frontend Ready                                                                                         | Workflow despliega los tres                              | Reproducir                                                                        |
| Worker CPU                 | Snapshot polling: `cpu-throttling=false`, min 1, max 5                                                               | Workflow `cloud_tasks`: min 0, max 5, `--cpu-throttling` | Nunca omitir `--cpu-throttling` en request-driven: `gcloud` puede heredar `false` |
| Worker timeout/concurrency | Snapshot polling: 600 s y 50                                                                                         | Workflow: 300 s y 50                                     | Declararlos en cada deploy; 300 s alinea Scheduler `--attempt-deadline=300s`      |
| API scale/timeout          | Histórico min 1 / 300 s (instancia fija)                                                                             | Workflow: min 1, max 5                                   | El min 1 sostiene las conexiones WebSocket; el techo de conexiones lo fija max 5  |
| Cloud SQL                  | HA, backups y PITR; bootstrap `db-custom-2-7680`; tier productivo `db-g1-small`; IP pública; deletion protection off | Socket obligatorio; sin VPC connector                    | El tier `db-g1-small` acota el presupuesto de conexiones: ver la regla de oro     |
| GitHub `GCP_DOC_AI_PROC`   | Existe como variable heredada                                                                                        | El workflow ya no la consume                             | No crear; usar Secret Manager                                                     |

## Optimización de costos y buenas prácticas de despliegue

Tras la auditoría de septiembre de 2026, producción deja de pagar instancias fijas y CPU idle. El workflow canónico debe **declarar** estos flags en cada `gcloud run deploy`. Omitirlos no es seguro: `gcloud` reutiliza la revisión anterior y puede reintroducir `--min-instances=1` o `--no-cpu-throttling`. `nexo-worker` opera con `--min-instances=0` (escalado a cero: sin instancia ni memoria en reposo) y `--cpu-throttling` (CPU facturada solo durante requests); `nexo-api` conserva `--min-instances=1` porque necesita una réplica caliente para las sesiones WebSocket, y por eso su pool Prisma (5 conexiones) está siempre activo y cuenta contra el presupuesto de Cloud SQL. Como `gcloud run deploy` **hereda** la configuración de la revisión anterior, cada deploy declara también `--clear-vpc-connector`; sin un limpiado explícito, un servicio que quedó desplegado con el conector borrado recién en producción fracasa al crear la revisión con *"VPC connector ... does not exist, or Cloud Run does not have permission to use it"*.

### Topología sin red privada: sin VPC Access Connector ni Memorystore

Con la migración Redis-free, el Serverless VPC Access Connector `voz-connector` y Memorystore for Redis **se removieron de la topología para ahorrar costos**: el conector facturaba una instancia mínima fija bajo cargo por hora y solo cubría el egress privado hacia Redis, que ya no existe. Por lo tanto:

- Ningún servicio Cloud Run declara `--vpc-connector` ni `--vpc-egress`; todo el egress vuelve a la ruta pública por defecto.
- Cada deploy incluye `--clear-vpc-connector`: evita que la revisión anterior, heredada por `gcloud run deploy`, siga apuntando al conector borrado y rompa la creación de la revisión nueva.
- En un entorno nuevo no se habilita `vpcaccess.googleapis.com` ni se crea el conector, sus rangos o una instancia Memorystore.
- No existe `VPC_CONN` en el workflow ni en el inventario de configuración.

El enrutamiento hacia la base de datos se mantiene **intacto y seguro** y no depende de la VPC: `nexo-api` y `nexo-worker` entran a Cloud SQL exclusivamente por el **Cloud SQL Auth Proxy embebido** (`--add-cloudsql-instances` monta el socket `/cloudsql/$INSTANCE_CONNECTION_NAME`). La instancia conserva IP pública pero sin redes autorizadas, así que el socket es el único camino de entrada; el conector no formaba parte de ese camino.

### Quick path

1. Despliegue solo con [`docs/deploy/deploy-gcp.yml`](deploy/deploy-gcp.yml) o copie sus flags al comando manual.
2. Confirme `minScale=0` y `cpu-throttling=true` en API, worker y frontend.
3. No ejecute la [guarda de CPU para polling](#guarda-de-cpu-para-polling) sobre un worker `cloud_tasks`.

### Contrato que CI/CD no debe revertir

| Servicio               | min | max | timeout | CPU durante request   | Prohibido en `cloud_tasks`                     | Por qué                                                                             |
| ---------------------- | --- | --- | ------- | --------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------- |
| `nexo-api`             | 1   | 5   | 3600 s  | `--cpu-throttling`    | `--max-instances>5`                            | min 1 sostiene las conexiones WebSocket; max 5 acota el pool de Prisma (5 × 5 conn) |
| `nexo-worker`          | 0   | 5   | 300 s   | `--cpu-throttling`    | `--no-cpu-throttling`, `--max-instances>5`     | CPU always-on facturaba al 100 %; max 5 × pool 2 = 10 conexiones                    |
| `nexo-realtime-relay`  | 1   | 2   | 300 s   | `--no-cpu-throttling` | `--cpu-throttling`                             | Recuperación realtime: CPU fuera de requests; pool 2 × 2 = 4 conexiones             |
| `nexo-frontend`        | 0   | 10  | 300 s   | `--cpu-throttling`    | `--min-instances>=1`                           | Scale-to-zero fuera de tráfico; sin conexión a la base                              |
| `nexo-comercial` (SQL) | —   | —   | —       | —                     | Subir `max-instances`/pool sin escalar el tier | Regla de oro: ver [CLOUD_SQL_CONNECTION.md](./CLOUD_SQL_CONNECTION.md) §3.2         |

`--cpu-boost` (startup) no sustituye `--cpu-throttling`. `--cpu-boost` solo acelera el arranque; `--no-cpu-throttling` asigna CPU **fuera** de requests y genera cargo continuo mientras la instancia exista.

El timeout del worker bajó de 600 s (polling) a 300 s para cortar handlers colgados y coincidir con `--attempt-deadline=300s` de Scheduler. La API usa 3600 s para no cortar conexiones WebSocket largas. El modo polling de bootstrap/rollback del worker sigue usando min 1, `--no-cpu-throttling` y 600 s; no mezcle esos flags con `BACKGROUND_EXECUTION_BACKEND=cloud_tasks`.

### Checklist post-deploy

```bash
for svc in nexo-api nexo-worker nexo-frontend; do
  echo "== $svc =="
  gcloud run services describe "$svc" \
    --region="$REGION" --project="$PROJECT_ID" \
    --format='yaml(spec.template.metadata.annotations["autoscaling.knative.dev/minScale"],spec.template.metadata.annotations["autoscaling.knative.dev/maxScale"],spec.template.metadata.annotations["run.googleapis.com/cpu-throttling"],spec.template.spec.timeoutSeconds)'
done
```

- [ ] API, worker y frontend: `minScale` 0 (o ausente, equivalente a 0); la API puede declarar 1 para sostener WebSocket.
- [ ] `run.googleapis.com/cpu-throttling: 'true'` (salvo el relay, que corre con `false`).
- [ ] Timeouts 3600 / 300 / 300 s respectivamente.
- [ ] Worker max 5. API max 5. Relay max 2. Frontend max 10.
- [ ] `PRISMA_CONNECTION_LIMIT` explícito en cada revisión de API/worker/relay (5 / 2 / 2).

### Cloud SQL

La instancia `nexo-comercial` se creó como `db-custom-2-7680` HA para réplica del snapshot y luego se redimensionó al tier productivo actual **`db-g1-small`** (1 vCPU compartida, 1.7 GB), elegido para acotar el consumo de conexiones tras la saturación del pool de Prisma. Ese tier **no es un contrato**: `max_connections` depende de la memoria, así que ajústelo según CPU/memoria observadas y el presupuesto de la regla de oro. No use un `gcloud sql instances create` de este SOP para “restaurar” un tier mayor que el productivo.

> ⚠️ GCP no incluye `db-f1-micro` ni `db-g1-small` en el SLA de Cloud SQL y los describe como tiers de desarrollo/pruebas. `db-g1-small` es un puente razonable para dejar de caer; el objetivo productivo es un tier de núcleo dedicado. Ver [CLOUD_SQL_CONNECTION.md](./CLOUD_SQL_CONNECTION.md) §3.3.

Independientemente del tier, el routing es **siempre** por el Cloud SQL Auth Proxy embebido: los servicios usan `--add-cloudsql-instances` y el socket `/cloudsql/$INSTANCE_CONNECTION_NAME`; los Jobs usan `--set-cloudsql-instances`. No existe ruta por VPC: el conector fue removido y la instancia, con IP pública sin redes autorizadas, solo se alcanza por el socket.

## 1. Preparar el entorno operativo

### Prerrequisitos

- Cuenta de facturación asociada al proyecto GCP.
- Permisos bootstrap para habilitar APIs, crear IAM, redes, SQL, secretos y repositorios.
- `gcloud` autenticado, Docker con buildx, Git, `gh`, `curl`, `jq` y `openssl`.
- Repositorio clonado y checkout del commit que se desplegará.
- Permiso `documentai.processors.create` para crear el processor OCR, o un processor existente aprobado.
- Aplicación Meta/WhatsApp, proveedor de correo, proveedores LLM y OAuth de Google Drive preparados.
- Dominio propio solo si el cliente lo exige; no es parte del estado GCP actual.

### Plantilla de shell

Reemplace todos los valores `<...>` antes de continuar. No pegue valores secretos en esta plantilla.

```bash
export PROJECT_ID="<gcp-project-id>"
export PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
export REGION="us-central1"
export AR_REPO="nexo-comercial"
export DB_INSTANCE="nexo-comercial"
export DB_NAME="nexocomercial"
export DB_USER="voz"
export INSTANCE_CONNECTION_NAME="${PROJECT_ID}:${REGION}:${DB_INSTANCE}"
export RUNTIME_SA="nexo-comercial-run-sa"
export DEPLOY_SA="nexo-comercial-cicd-sa"
export RUNTIME_SA_EMAIL="${RUNTIME_SA}@${PROJECT_ID}.iam.gserviceaccount.com"
export DEPLOY_SA_EMAIL="${DEPLOY_SA}@${PROJECT_ID}.iam.gserviceaccount.com"
export WIF_POOL="github-pool"
export WIF_PROVIDER_ID="github-provider"
export GITHUB_REPO="<owner/repository>"
export DOCUMENT_AI_LOCATION="<us-or-eu>"
export GIT_SHA="$(git rev-parse --short HEAD)"
export IMAGE_ROOT="${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}"
```

Validación sin mutaciones:

```bash
test -n "$PROJECT_ID"
test -n "$GITHUB_REPO"
gcloud projects describe "$PROJECT_ID" --format='table(projectId,projectNumber,lifecycleState)'
gcloud auth list --filter=status:ACTIVE --format='value(account)'
git status --short
```

**Resultado esperado:** proyecto `ACTIVE`, una cuenta autenticada y un SHA de Git no vacío.

## 2. Habilitar APIs

```bash
gcloud services enable \
  artifactregistry.googleapis.com \
  compute.googleapis.com \
  documentai.googleapis.com \
  iam.googleapis.com \
  iamcredentials.googleapis.com \
  run.googleapis.com \
  secretmanager.googleapis.com \
  sqladmin.googleapis.com \
  --project="$PROJECT_ID"
```

`cloudbuild.googleapis.com`, `dns.googleapis.com` y `drive.googleapis.com` están habilitadas en la referencia, pero no son necesarias para el flujo principal: GitHub buildx construye las imágenes, no hay Cloud DNS y Drive se consume mediante su API/OAuth. Habilítelas solo si el entorno realmente las usará.

Verificación:

```bash
gcloud services list --enabled --project="$PROJECT_ID" --format='value(config.name)'
```

### Crear el processor OCR de Document AI

Si el cliente ya tiene un processor `OCR_PROCESSOR` aprobado en la ubicación elegida, no cree otro y exporte únicamente su ID:

```bash
export DOCUMENT_AI_PROCESSOR_ID="<existing-processor-id>"
```

Para un entorno nuevo, cree uno mediante la API oficial. La respuesta completa no contiene credenciales, pero el ID se trata como configuración sensible y se guardará en Secret Manager:

```bash
export PROCESSOR_NAME="$(curl --fail --silent --show-error \
  --request POST \
  --header "Authorization: Bearer $(gcloud auth print-access-token)" \
  --header "x-goog-user-project: ${PROJECT_ID}" \
  --header "Content-Type: application/json; charset=utf-8" \
  --data '{"displayName":"Nexo Comercial OCR","type":"OCR_PROCESSOR"}' \
  "https://${DOCUMENT_AI_LOCATION}-documentai.googleapis.com/v1/projects/${PROJECT_ID}/locations/${DOCUMENT_AI_LOCATION}/processors" \
  | jq --raw-output '.name')"

test -n "$PROCESSOR_NAME"
test "$PROCESSOR_NAME" != "null"
export DOCUMENT_AI_PROCESSOR_ID="${PROCESSOR_NAME##*/}"
unset PROCESSOR_NAME
```

**Resultado esperado:** el processor queda `ENABLED` y el nombre devuelto termina en `/processors/<id>`. No imprima `DOCUMENT_AI_PROCESSOR_ID`; la sección 6 crea su versión de Secret Manager.

### Preparar OAuth de Google Drive

Document AI usa ADC de la SA runtime. Google Drive es distinto y requiere OAuth de usuario en runtime:

1. Si Drive está activo, habilite `drive.googleapis.com`.
2. Configure Google Auth Platform y su pantalla de consentimiento para el cliente.
3. Cree un OAuth Client de tipo Web application.
4. Registre exactamente `http://localhost:8000/oauth2callback` como redirect URI.
5. En una estación segura, coloque temporalmente `GOOGLE_OAUTH_CLIENT_ID` y `GOOGLE_OAUTH_CLIENT_SECRET` en `backend/.env`, archivo ignorado por Git.
6. Ejecute el helper local y complete el consentimiento con la cuenta propietaria de la carpeta.

```bash
gcloud services enable drive.googleapis.com --project="$PROJECT_ID"
pnpm --dir backend run generate:drive-token
```

El helper solicita scope `https://www.googleapis.com/auth/drive.file` y muestra el refresh token una sola vez en la terminal. Guárdelo inmediatamente como `GOOGLE_DRIVE_REFRESH_TOKEN`, cierre la terminal segura y retire las credenciales del archivo local. El código ejecutable escucha en puerto 8000; el comentario superior del script que menciona puerto 3000 está desactualizado.

## 3. Crear identidades IAM y WIF

### Separación de responsabilidades

| Identidad          | Puede                                                               | No debe                                            |
| ------------------ | ------------------------------------------------------------------- | -------------------------------------------------- |
| SA runtime         | Leer secretos asignados, conectar Cloud SQL, llamar Document AI     | Crear recursos, publicar imágenes, administrar IAM |
| SA deploy          | Publicar imágenes, desplegar Cloud Run/Jobs, actuar como SA runtime | Ejecutar la aplicación ni conservar una llave JSON |
| Operador bootstrap | Crear infraestructura e IAM                                         | Usarse como identidad runtime                      |

### Crear service accounts

```bash
gcloud iam service-accounts create "$RUNTIME_SA" \
  --display-name="Nexo Comercial runtime" \
  --project="$PROJECT_ID"

gcloud iam service-accounts create "$DEPLOY_SA" \
  --display-name="Nexo Comercial GitHub deploy" \
  --project="$PROJECT_ID"
```

### Permisos runtime

```bash
for role in roles/cloudsql.client roles/documentai.apiUser; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${RUNTIME_SA_EMAIL}" \
    --role="$role" \
    --condition=None
done
```

Los accesos a secretos se asignan por secreto en la sección 6. La referencia también tiene `roles/artifactregistry.reader` y `roles/secretmanager.secretAccessor` a nivel proyecto; funcionan, pero son más amplios que lo necesario. Cloud Run obtiene la imagen mediante su service agent, no mediante el proceso de aplicación.

### Permisos de despliegue

```bash
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${DEPLOY_SA_EMAIL}" \
  --role="roles/run.admin" \
  --condition=None

gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA_EMAIL" \
  --member="serviceAccount:${DEPLOY_SA_EMAIL}" \
  --role="roles/iam.serviceAccountUser" \
  --project="$PROJECT_ID"

# El smoke del worker privado genera un ID token de corta duración.
gcloud iam service-accounts add-iam-policy-binding "$DEPLOY_SA_EMAIL" \
  --member="serviceAccount:${DEPLOY_SA_EMAIL}" \
  --role="roles/iam.serviceAccountTokenCreator" \
  --project="$PROJECT_ID"
```

`roles/storage.admin` y `roles/cloudbuild.builds.editor` otorgados a la SA deploy en la referencia son heredados y no son requeridos por el workflow actual. `roles/run.admin` ya incluye la invocación usada por el smoke del worker; no agregue otro binding `roles/run.invoker` sin una necesidad comprobada.

### Crear Workload Identity Federation

```bash
gcloud iam workload-identity-pools create "$WIF_POOL" \
  --location="global" \
  --display-name="GitHub Actions" \
  --project="$PROJECT_ID"

gcloud iam workload-identity-pools providers create-oidc "$WIF_PROVIDER_ID" \
  --location="global" \
  --workload-identity-pool="$WIF_POOL" \
  --display-name="GitHub repository" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition="attribute.repository == '${GITHUB_REPO}'" \
  --project="$PROJECT_ID"

export WIF_PROVIDER="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${WIF_POOL}/providers/${WIF_PROVIDER_ID}"
export WIF_PRINCIPAL="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${WIF_POOL}/attribute.repository/${GITHUB_REPO}"

gcloud iam service-accounts add-iam-policy-binding "$DEPLOY_SA_EMAIL" \
  --member="$WIF_PRINCIPAL" \
  --role="roles/iam.workloadIdentityUser" \
  --project="$PROJECT_ID"
```

Verificación:

```bash
gcloud iam workload-identity-pools providers describe "$WIF_PROVIDER_ID" \
  --location=global \
  --workload-identity-pool="$WIF_POOL" \
  --project="$PROJECT_ID" \
  --format='yaml(name,state,attributeMapping,attributeCondition,oidc.issuerUri)'

gcloud iam service-accounts get-iam-policy "$DEPLOY_SA_EMAIL" \
  --project="$PROJECT_ID"
```

**Resultado esperado:** provider `ACTIVE`, condición limitada exactamente a `owner/repository` y binding `roles/iam.workloadIdentityUser` sobre la SA deploy.

## 4. Crear Artifact Registry

```bash
gcloud artifacts repositories create "$AR_REPO" \
  --repository-format=docker \
  --location="$REGION" \
  --description="Imágenes Docker de Nexo Comercial" \
  --project="$PROJECT_ID"

gcloud artifacts repositories add-iam-policy-binding "$AR_REPO" \
  --location="$REGION" \
  --member="serviceAccount:${DEPLOY_SA_EMAIL}" \
  --role="roles/artifactregistry.writer" \
  --project="$PROJECT_ID"

gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet
```

No cree `cloud-run-source-deploy`. Ese repositorio aparece automáticamente al usar `gcloud run deploy --source` y no pertenece al diseño.

## 5. Crear Cloud SQL

### Instancia, base y usuario

El `--tier` fija **cuántas conexiones** puede aceptar la instancia (`max_connections` crece con la memoria). Elíjalo junto con la regla de oro de [CLOUD_SQL_CONNECTION.md](./CLOUD_SQL_CONNECTION.md) §3.2: `Σ(max-instances × connection_limit)` de todos los servicios debe quedar holgadamente por debajo del techo, y `db-f1-micro`/`db-g1-small` son tiers de desarrollo/pruebas sin SLA.

```bash
gcloud sql instances create "$DB_INSTANCE" \
  --database-version=POSTGRES_16 \
  --edition=ENTERPRISE \
  --tier=db-g1-small \
  --region="$REGION" \
  --availability-type=REGIONAL \
  --storage-type=SSD \
  --storage-size=10 \
  --storage-auto-increase \
  --assign-ip \
  --ssl-mode=ALLOW_UNENCRYPTED_AND_ENCRYPTED \
  --backup-start-time=06:00 \
  --enable-point-in-time-recovery \
  --retained-backups-count=7 \
  --retained-transaction-log-days=7 \
  --no-enable-connection-pooling \
  --no-deletion-protection \
  --project="$PROJECT_ID"

# Verifica el techo real: no lo deduzcas del nombre del tier.
gcloud sql instances describe "$DB_INSTANCE" \
  --format='value(settings.tier)' --project="$PROJECT_ID"

gcloud sql databases create "$DB_NAME" \
  --instance="$DB_INSTANCE" \
  --project="$PROJECT_ID"

read -rsp "Contraseña nueva para ${DB_USER}: " DB_PASS
printf '\n'
test -n "$DB_PASS"

gcloud sql users create "$DB_USER" \
  --instance="$DB_INSTANCE" \
  --password="$DB_PASS" \
  --project="$PROJECT_ID"
```

Use una contraseña URL-safe, por ejemplo hexadecimal. Si contiene caracteres reservados, codifíquela como componente URI antes de construir `DATABASE_URL`.

Use el tier mínimo de núcleo compartido (`db-g1-small`) solo como puente de bajo costo tras una saturación, y **valide el presupuesto de conexiones** antes de subir instancias o pools. Si el entorno de referencia cambió de tier, copie el valor real (`gcloud sql instances describe`), no un valor fijo de este SOP. El cargo de Cloud SQL es fijo mientras la instancia exista; el right-size es independiente del scale-to-zero de Cloud Run.

La referencia conserva IP pública, pero no redes autorizadas; la aplicación entra exclusivamente mediante Cloud SQL connector. `--no-deletion-protection` replica el estado actual y es un riesgo operativo explícito. Habilitar deletion protection después del bootstrap es un endurecimiento recomendado, pero deja de ser una réplica exacta del snapshot.

### URL de socket obligatoria

```bash
export DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@localhost/${DB_NAME}?host=/cloudsql/${INSTANCE_CONNECTION_NAME}&connection_limit=1"
```

La forma `@localhost/` es obligatoria para Prisma CLI. `postgresql://user:pass@/db?...` contiene host vacío y Prisma la rechaza aunque exista el query param `host=/cloudsql/...`.

Cloud Run monta el socket con:

- Servicios: `--add-cloudsql-instances="$INSTANCE_CONNECTION_NAME"`.
- Jobs: `--set-cloudsql-instances="$INSTANCE_CONNECTION_NAME"`.

No intercambie los flags.

### Pools y PgBouncer

[`backend/src/database/datasource-url.ts`](../backend/src/database/datasource-url.ts) reconstruye la URL desde `CLOUDSQL_*`:

| Proceso                | Default de código | Valor productivo     | Motivo                                           |
| ---------------------- | ----------------- | -------------------- | ------------------------------------------------ |
| API                    | `10`              | `connection_limit=5` | Acotar conexiones por instancia serverless       |
| Worker                 | `8`               | `connection_limit=2` | Pollers concurrentes de inbox, outbox y OCR      |
| Realtime relay         | `8`               | `connection_limit=2` | Un solo propósito (relay recuperado)             |
| Migrator / seeds (CLI) | —                 | `connection_limit=1` | Job de una sola tarea, vía Secret `DATABASE_URL` |

`PRISMA_CONNECTION_LIMIT` sobrescribe esos defaults. `CLOUDSQL_USE_PGBOUNCER=true` solo añade `pgbouncer=true` a la URL de Prisma; no crea ni enruta hacia un PgBouncer. Producción no tiene esa variable ni un pool de Cloud SQL configurado. Manténgala ausente hasta que exista un pooler real, su endpoint esté conectado y se hayan validado transacciones y prepared statements.

> **Regla de oro:** no aumentar `--max-instances` ni `PRISMA_CONNECTION_LIMIT` sin haber escalado antes la memoria/tier de Cloud SQL. El presupuesto, el cálculo por servicio y el techo de la instancia están en [CLOUD_SQL_CONNECTION.md](./CLOUD_SQL_CONNECTION.md) §3.

Verificación:

```bash
gcloud sql instances describe "$DB_INSTANCE" --project="$PROJECT_ID" \
  --format='yaml(name,state,region,databaseVersion,settings.tier,settings.availabilityType,settings.backupConfiguration,settings.connectionPoolConfig)'

gcloud sql databases list --instance="$DB_INSTANCE" --project="$PROJECT_ID"
gcloud sql users list --instance="$DB_INSTANCE" --project="$PROJECT_ID" --format='table(name,type)'
```

## 6. Crear secretos

### Política

- Secret Manager: credenciales, tokens, IDs operativos sensibles y valores que el workflow referencia como secreto.
- Cloud Run env directa: flags y configuración no sensible.
- GitHub secrets: solo autenticación del pipeline a GCP.
- GitHub variables: URLs públicas y ubicación no sensible de Document AI.
- Nunca usar `NEXT_PUBLIC_*` para secretos: se incorporan al JavaScript del navegador.
- Cada secret referenciado debe existir y tener al menos una versión no vacía. Un nombre sin versión causa fallo de deploy.

### Crear contenedores de secretos

```bash
SECRET_NAMES=(
  DATABASE_URL DB_USER DB_PASS DB_NAME INSTANCE_CONNECTION_NAME
  JWT_SECRET JWT_REFRESH_SECRET ENCRYPTION_KEY
  WHATSAPP_VERIFY_TOKEN WHATSAPP_APP_ID WHATSAPP_APP_SECRET
  WHATSAPP_ACCESS_TOKEN WHATSAPP_PHONE_NUMBER_ID WHATSAPP_BUSINESS_ACCOUNT_ID
  MAILTRAP_API_TOKEN MAILTRAP_API_URL MAIL_FROM_ADDRESS
  MAIL_REPLY_TO_ADDRESS MAIL_SUPPORT_EMAIL
  OPENAI_API_KEY NVIDIA_API_KEY ANTHROPIC_API_KEY
  GOOGLE_DRIVE_FOLDER_ID GOOGLE_OAUTH_CLIENT_ID
  GOOGLE_OAUTH_CLIENT_SECRET GOOGLE_DRIVE_REFRESH_TOKEN
  DOCUMENT_AI_PROCESSOR_ID
  SUPERADMIN_EMAIL SUPERADMIN_PASSWORD SUPERADMIN_FULL_NAME
)

for secret in "${SECRET_NAMES[@]}"; do
  gcloud secrets describe "$secret" --project="$PROJECT_ID" >/dev/null 2>&1 || \
    gcloud secrets create "$secret" \
      --replication-policy=automatic \
      --project="$PROJECT_ID"
done
```

### Agregar valores generados y de infraestructura

```bash
printf '%s' "$DATABASE_URL" | gcloud secrets versions add DATABASE_URL --data-file=- --project="$PROJECT_ID"
printf '%s' "$DB_USER" | gcloud secrets versions add DB_USER --data-file=- --project="$PROJECT_ID"
printf '%s' "$DB_PASS" | gcloud secrets versions add DB_PASS --data-file=- --project="$PROJECT_ID"
printf '%s' "$DB_NAME" | gcloud secrets versions add DB_NAME --data-file=- --project="$PROJECT_ID"
printf '%s' "$INSTANCE_CONNECTION_NAME" | gcloud secrets versions add INSTANCE_CONNECTION_NAME --data-file=- --project="$PROJECT_ID"
test -n "$DOCUMENT_AI_PROCESSOR_ID"
printf '%s' "$DOCUMENT_AI_PROCESSOR_ID" | gcloud secrets versions add DOCUMENT_AI_PROCESSOR_ID --data-file=- --project="$PROJECT_ID"

openssl rand -base64 48 | tr -d '\n' | gcloud secrets versions add JWT_SECRET --data-file=- --project="$PROJECT_ID"
openssl rand -base64 48 | tr -d '\n' | gcloud secrets versions add JWT_REFRESH_SECRET --data-file=- --project="$PROJECT_ID"
openssl rand -hex 32 | tr -d '\n' | gcloud secrets versions add ENCRYPTION_KEY --data-file=- --project="$PROJECT_ID"

unset DB_PASS DATABASE_URL
```

### Agregar valores externos sin mostrarlos

La siguiente función pide cada valor de forma oculta y rechaza entradas vacías:

```bash
put_secret() {
  local name="$1"
  local value
  read -rsp "Valor para ${name}: " value
  printf '\n'
  if [ -z "$value" ]; then
    printf 'ERROR: %s no puede quedar vacío.\n' "$name" >&2
    return 1
  fi
  printf '%s' "$value" | gcloud secrets versions add "$name" \
    --data-file=- \
    --project="$PROJECT_ID"
  unset value
}
```

Ejecute una vez por secret externo:

```bash
for secret in \
  WHATSAPP_VERIFY_TOKEN WHATSAPP_APP_ID WHATSAPP_APP_SECRET \
  WHATSAPP_ACCESS_TOKEN WHATSAPP_PHONE_NUMBER_ID WHATSAPP_BUSINESS_ACCOUNT_ID \
  MAILTRAP_API_TOKEN MAILTRAP_API_URL MAIL_FROM_ADDRESS \
  MAIL_REPLY_TO_ADDRESS MAIL_SUPPORT_EMAIL \
  OPENAI_API_KEY NVIDIA_API_KEY ANTHROPIC_API_KEY \
  GOOGLE_DRIVE_FOLDER_ID GOOGLE_OAUTH_CLIENT_ID \
  GOOGLE_OAUTH_CLIENT_SECRET GOOGLE_DRIVE_REFRESH_TOKEN \
  SUPERADMIN_EMAIL SUPERADMIN_PASSWORD SUPERADMIN_FULL_NAME; do
  put_secret "$secret"
done
```

Aunque algunas variables son opcionales para el código, el workflow actual referencia todos estos secrets. Por tanto, todos deben tener versión o el deploy fallará. Si un proveedor no se usará, retire deliberadamente su referencia del workflow en otro cambio; no cree secretos vacíos.

`WHATSAPP_VERIFY_TOKEN` es un token aleatorio elegido por el operador y debe coincidir con la configuración del webhook de Meta. Document AI usa ADC de la SA runtime: no cree `GOOGLE_APPLICATION_CREDENTIALS` ni una llave JSON. Drive sí requiere OAuth en runtime.

### Otorgar acceso por secreto

```bash
for secret in "${SECRET_NAMES[@]}"; do
  gcloud secrets add-iam-policy-binding "$secret" \
    --member="serviceAccount:${RUNTIME_SA_EMAIL}" \
    --role="roles/secretmanager.secretAccessor" \
    --project="$PROJECT_ID"

  gcloud secrets add-iam-policy-binding "$secret" \
    --member="serviceAccount:${DEPLOY_SA_EMAIL}" \
    --role="roles/secretmanager.secretAccessor" \
    --project="$PROJECT_ID"
done
```

El acceso de la SA deploy se mantiene por compatibilidad con la validación de referencias del despliegue. Revíselo si la organización aplica un rol custom más estrecho.

Verificación sin leer valores:

```bash
gcloud secrets list --project="$PROJECT_ID" --format='table(name)'

for secret in "${SECRET_NAMES[@]}"; do
  enabled_version="$(gcloud secrets versions list "$secret" \
    --project="$PROJECT_ID" \
    --filter='state=ENABLED' \
    --limit=1 \
    --format='value(name)')"
  test -n "$enabled_version" || exit 1
done
```

## 7. Configurar GitHub Actions

### Secrets del repositorio

| Nombre           | Contenido                                    |
| ---------------- | -------------------------------------------- |
| `GCP_PROJECT_ID` | `PROJECT_ID`                                 |
| `WIF_PROVIDER`   | Nombre completo `projects/.../providers/...` |
| `GH_SA_CICD`     | Email de la SA deploy                        |

```bash
gh secret set GCP_PROJECT_ID --repo="$GITHUB_REPO" --body="$PROJECT_ID"
gh secret set WIF_PROVIDER --repo="$GITHUB_REPO" --body="$WIF_PROVIDER"
gh secret set GH_SA_CICD --repo="$GITHUB_REPO" --body="$DEPLOY_SA_EMAIL"
```

### Variables del repositorio

| Nombre                                  | Contenido                                       |
| --------------------------------------- | ----------------------------------------------- |
| `GCP_API_BASE_URL`                      | URL pública canónica de API                     |
| `GCP_FRONTEND_URL`                      | URL pública canónica de frontend                |
| `GCP_DOC_AI_LOC`                        | Ubicación del processor, por ejemplo `us`       |
| `GCP_TASKS_QUEUE_NAME`                  | Queue preparada, normalmente `background-tasks` |
| `GCP_WORKER_SERVICE_URL`                | URL HTTPS `run.app` privada de `nexo-worker`    |
| `GCP_TASKS_SERVICE_ACCOUNT_EMAIL`       | Email de la SA OIDC `cloud-tasks-invoker`       |
| `GCP_PUBSUB_PUSH_SERVICE_ACCOUNT_EMAIL` | Email de la SA OIDC `pubsub-push-invoker`       |

No cree `GCP_DOC_AI_PROC`. `DOCUMENT_AI_PROCESSOR_ID` se obtiene de Secret Manager.

```bash
gh variable set GCP_API_BASE_URL --repo="$GITHUB_REPO" --body="<https://api.example>"
gh variable set GCP_FRONTEND_URL --repo="$GITHUB_REPO" --body="<https://app.example>"
gh variable set GCP_DOC_AI_LOC --repo="$GITHUB_REPO" --body="<document-ai-location>"
gh variable set GCP_TASKS_QUEUE_NAME --repo="$GITHUB_REPO" --body="$TASKS_QUEUE_NAME"
gh variable set GCP_WORKER_SERVICE_URL --repo="$GITHUB_REPO" --body="$WORKER_SERVICE_URL"
gh variable set GCP_TASKS_SERVICE_ACCOUNT_EMAIL --repo="$GITHUB_REPO" --body="$TASKS_SERVICE_ACCOUNT_EMAIL"
gh variable set GCP_PUBSUB_PUSH_SERVICE_ACCOUNT_EMAIL --repo="$GITHUB_REPO" --body="$PUBSUB_PUSH_SERVICE_ACCOUNT_EMAIL"
```

Para usar URLs `run.app` en el primer despliegue, siga [Bootstrap de URLs](#bootstrap-de-urls-runapp) antes de fijar las variables definitivas.

## 8. Construir imágenes

Los contextos Docker siempre son la raíz del monorepo. No use `backend/` o `frontend/` como contextos.

| Imagen                       | Dockerfile/target              | Uso                                    |
| ---------------------------- | ------------------------------ | -------------------------------------- |
| `nexo-api:sha-$GIT_SHA`      | `backend/Dockerfile`, `runner` | API                                    |
| `nexo-worker:sha-$GIT_SHA`   | `backend/Dockerfile`, `worker` | Worker (`tini -- node dist/worker.js`) |
| `nexo-tools:sha-$GIT_SHA`    | `backend/Dockerfile`, `tools`  | Migraciones y seeds                    |
| `nexo-frontend:sha-$GIT_SHA` | `frontend/Dockerfile`, `prod`  | Next.js                                |

### Backend y tools

```bash
docker buildx build \
  --file backend/Dockerfile \
  --target runner \
  --tag "${IMAGE_ROOT}/nexo-api:sha-${GIT_SHA}" \
  --push \
  .

docker buildx build \
  --file backend/Dockerfile \
  --target worker \
  --tag "${IMAGE_ROOT}/nexo-worker:sha-${GIT_SHA}" \
  --push \
  .

docker buildx build \
  --file backend/Dockerfile \
  --target tools \
  --tag "${IMAGE_ROOT}/nexo-tools:sha-${GIT_SHA}" \
  --push \
  .
```

### Frontend y frontera build/runtime

```bash
export API_URL="<https://canonical-api-url>"

docker buildx build \
  --file frontend/Dockerfile \
  --target prod \
  --build-arg "NEXT_PUBLIC_API_URL=${API_URL}" \
  --build-arg "NEXT_PUBLIC_WS_URL=${API_URL}" \
  --tag "${IMAGE_ROOT}/nexo-frontend:sha-${GIT_SHA}" \
  --push \
  .
```

`NEXT_PUBLIC_API_URL` y `NEXT_PUBLIC_WS_URL` quedan congeladas durante `next build`. Definirlas solo en Cloud Run runtime no reescribe el bundle del navegador. Todo cambio de URL exige reconstruir y redesplegar el frontend.

El ejemplo del frontend también contiene `NEXT_PUBLIC_BASE_URL`, `NEXT_PUBLIC_WS_PATH` y `NEXT_PUBLIC_WS_ENABLED`, pero el Dockerfile actual no expone build args para ellas. El código usa defaults. No asuma que una env runtime las cambia en el navegador; cablearlas requiere un cambio de código separado.

## 9. Migrar la base

Despliegue el Job con la imagen `tools` del mismo SHA que los runtimes:

```bash
gcloud run jobs deploy nexo-migrator \
  --image="${IMAGE_ROOT}/nexo-tools:sha-${GIT_SHA}" \
  --region="$REGION" \
  --tasks=1 \
  --max-retries=0 \
  --task-timeout=10m \
  --set-env-vars="NODE_ENV=production" \
  --set-cloudsql-instances="$INSTANCE_CONNECTION_NAME" \
  --set-secrets="DATABASE_URL=DATABASE_URL:latest,CLOUDSQL_DB_USER=DB_USER:latest,CLOUDSQL_DB_PASS=DB_PASS:latest,CLOUDSQL_DB_NAME=DB_NAME:latest,CLOUDSQL_INSTANCE_CONNECTION_NAME=INSTANCE_CONNECTION_NAME:latest" \
  --service-account="$RUNTIME_SA_EMAIL" \
  --project="$PROJECT_ID"

gcloud run jobs execute nexo-migrator \
  --region="$REGION" \
  --project="$PROJECT_ID" \
  --wait
```

**Resultado esperado:** `EXECUTION_SUCCEEDED`. Si falla, no despliegue runtimes. `prisma migrate deploy` es forward-only; nunca edite migraciones ya publicadas ni intente rollback automático.

## 10. Bootstrap de seeds

Los seeds **no** forman parte de `docs/deploy/deploy-gcp.yml`. Cada release solo aplica `prisma migrate deploy` (forward-only). Corra seeders solo en una base vacía o bajo una solicitud operativa auditada (por ejemplo, repoblar catálogo tras pérdida de datos).

La imagen `nexo-tools` usa `ENTRYPOINT /usr/local/bin/nexo-prod-migrate.sh`, que **solo** ejecuta `migrate:deploy` y rechaza `reset` / `seed`. Los jobs de seed **deben** sustituir ese entrypoint con `--command=pnpm`. Si omite `--command`, el job migrará (o fallará) y **no** sembrará.

### Qué siembra cada scope (código actual)

| Job                | Script                      | Contenido                                                    |
| ------------------ | --------------------------- | ------------------------------------------------------------ |
| `nexo-seeder-core` | `pnpm run prisma:seed:core` | Colonias, roles, permisos, `role_permissions`, departamentos |
| `nexo-seeder-dev`  | `pnpm run prisma:seed:dev`  | Superadmin + módulo IA (agente, topics, tools, línea)        |

`prisma:seed:all` también corre fixtures de test: **prohibido** en GCP.

### Reglas no negociables

- Orden: `core`, después `dev`. No ejecute `dev` si `core` falló.
- `NODE_ENV=staging`. Con `production` el orquestador (`backend/prisma/seed/index.ts`) aborta.
- `--command=pnpm` y `--args=run,prisma:seed:core` / `prisma:seed:dev` en cada `jobs deploy`.
- Imagen `nexo-tools:sha-…` **igual** a la de `nexo-migrator` (mismo SHA que el release aplicado).
- `SUPERADMIN_*` desde Secret Manager. El upsert del superadmin **no** rota `hashedPassword` si el usuario ya existe.
- Los seeds no recrean datos de negocio (promovidos, conversaciones, tickets).

### 1. Tomar el SHA de la imagen ya desplegada

Espere a que el workflow Deploy GCP haya construido y empujado `nexo-tools` (job migrator en verde). Luego:

```bash
export PROJECT_ID="$(gcloud config get-value project)"
export REGION=us-central1
export IMAGE_ROOT="${REGION}-docker.pkg.dev/${PROJECT_ID}/nexo-comercial"
export INSTANCE_CONNECTION_NAME="${PROJECT_ID}:${REGION}:nexo-comercial"
export RUNTIME_SA_EMAIL="nexo-comercial-run-sa@${PROJECT_ID}.iam.gserviceaccount.com"
export API_URL="https://api.nexo-comercial.example"

TOOLS_IMAGE="$(gcloud run jobs describe nexo-migrator \
  --region="$REGION" --project="$PROJECT_ID" \
  --format='value(spec.template.spec.template.spec.containers[0].image)')"
echo "Usar: $TOOLS_IMAGE"
```

No apunte a un SHA local de `git rev-parse` si ese tag aún no está en Artifact Registry.

### 2. Desplegar (o actualizar) los Jobs

`--command=pnpm` sustituye el ENTRYPOINT del migrador. `--args` son argumentos de `pnpm`, no del script `nexo-prod-migrate.sh`.

```bash
export SEED_SECRETS="DATABASE_URL=DATABASE_URL:latest,ENCRYPTION_KEY=ENCRYPTION_KEY:latest,JWT_SECRET=JWT_SECRET:latest,JWT_REFRESH_SECRET=JWT_REFRESH_SECRET:latest,WHATSAPP_VERIFY_TOKEN=WHATSAPP_VERIFY_TOKEN:latest,WHATSAPP_APP_ID=WHATSAPP_APP_ID:latest,WHATSAPP_APP_SECRET=WHATSAPP_APP_SECRET:latest,WHATSAPP_ACCESS_TOKEN=WHATSAPP_ACCESS_TOKEN:latest,WHATSAPP_PHONE_NUMBER_ID=WHATSAPP_PHONE_NUMBER_ID:latest,WHATSAPP_BUSINESS_ACCOUNT_ID=WHATSAPP_BUSINESS_ACCOUNT_ID:latest,SUPERADMIN_EMAIL=SUPERADMIN_EMAIL:latest,SUPERADMIN_PASSWORD=SUPERADMIN_PASSWORD:latest,SUPERADMIN_FULL_NAME=SUPERADMIN_FULL_NAME:latest"

gcloud run jobs deploy nexo-seeder-core \
  --image="$TOOLS_IMAGE" \
  --region="$REGION" \
  --command=pnpm \
  --args=run,prisma:seed:core \
  --tasks=1 \
  --parallelism=1 \
  --max-retries=0 \
  --task-timeout=30m \
  --set-env-vars="NODE_ENV=staging,BASE_URL=${API_URL}" \
  --set-secrets="$SEED_SECRETS" \
  --set-cloudsql-instances="$INSTANCE_CONNECTION_NAME" \
  --service-account="$RUNTIME_SA_EMAIL" \
  --project="$PROJECT_ID"

gcloud run jobs deploy nexo-seeder-dev \
  --image="$TOOLS_IMAGE" \
  --region="$REGION" \
  --command=pnpm \
  --args=run,prisma:seed:dev \
  --tasks=1 \
  --parallelism=1 \
  --max-retries=0 \
  --task-timeout=30m \
  --set-env-vars="NODE_ENV=staging,BASE_URL=${API_URL}" \
  --set-secrets="$SEED_SECRETS" \
  --set-cloudsql-instances="$INSTANCE_CONNECTION_NAME" \
  --service-account="$RUNTIME_SA_EMAIL" \
  --project="$PROJECT_ID"
```

Atajo con el `Makefile` (misma imagen que `IMG_TOOLS` / `GIT_SHA` local; exporte `GCP_API_BASE_URL` canónico):

```bash
export GCP_API_BASE_URL=https://api.nexo-comercial.example
make gcp-seed
```

### 3. Ejecutar en orden

```bash
gcloud run jobs execute nexo-seeder-core --region="$REGION" --project="$PROJECT_ID" --wait
gcloud run jobs execute nexo-seeder-dev --region="$REGION" --project="$PROJECT_ID" --wait
```

Si los jobs ya apuntan a la imagen correcta y a `pnpm run prisma:seed:*`, puede omitir el `deploy` y solo `execute`.

### 4. Comprobar

```bash
gcloud logging read \
  'resource.type="cloud_run_job" AND resource.labels.job_name="nexo-seeder-core"' \
  --project="$PROJECT_ID" --limit=30 --format='value(textPayload)'
```

Salida esperada de `core`: `Seed complete`, roles, permisos, colonias, departamentos. De `dev`: `Superadmin ready` y `AI module seed completed`.

### Local / Compose (no GCP)

Con `backend/.env` y Postgres local. Nunca contra `DATABASE_URL` de Cloud SQL desde la laptop.

```bash
pnpm --dir backend prisma:seed:core
NODE_ENV=staging pnpm --dir backend prisma:seed:dev   # requiere SUPERADMIN_PASSWORD
```

## 11. Desplegar Cloud Run

### Referencias comunes

```bash
export API_URL="<https://canonical-api-url>"
export FRONTEND_URL="<https://canonical-frontend-url>"
export DOCUMENT_AI_LOCATION="<document-ai-location>"

export BACKEND_SECRETS="DATABASE_URL=DATABASE_URL:latest,CLOUDSQL_DB_USER=DB_USER:latest,CLOUDSQL_DB_PASS=DB_PASS:latest,CLOUDSQL_DB_NAME=DB_NAME:latest,CLOUDSQL_INSTANCE_CONNECTION_NAME=INSTANCE_CONNECTION_NAME:latest,JWT_SECRET=JWT_SECRET:latest,JWT_REFRESH_SECRET=JWT_REFRESH_SECRET:latest,ENCRYPTION_KEY=ENCRYPTION_KEY:latest,WHATSAPP_VERIFY_TOKEN=WHATSAPP_VERIFY_TOKEN:latest,WHATSAPP_APP_ID=WHATSAPP_APP_ID:latest,WHATSAPP_APP_SECRET=WHATSAPP_APP_SECRET:latest,WHATSAPP_ACCESS_TOKEN=WHATSAPP_ACCESS_TOKEN:latest,WHATSAPP_PHONE_NUMBER_ID=WHATSAPP_PHONE_NUMBER_ID:latest,WHATSAPP_BUSINESS_ACCOUNT_ID=WHATSAPP_BUSINESS_ACCOUNT_ID:latest,MAILTRAP_API_TOKEN=MAILTRAP_API_TOKEN:latest,MAILTRAP_API_URL=MAILTRAP_API_URL:latest,MAIL_FROM_ADDRESS=MAIL_FROM_ADDRESS:latest,MAIL_REPLY_TO_ADDRESS=MAIL_REPLY_TO_ADDRESS:latest,MAIL_SUPPORT_EMAIL=MAIL_SUPPORT_EMAIL:latest,OPENAI_API_KEY=OPENAI_API_KEY:latest,NVIDIA_API_KEY=NVIDIA_API_KEY:latest,ANTHROPIC_API_KEY=ANTHROPIC_API_KEY:latest,GOOGLE_DRIVE_FOLDER_ID=GOOGLE_DRIVE_FOLDER_ID:latest,GOOGLE_OAUTH_CLIENT_ID=GOOGLE_OAUTH_CLIENT_ID:latest,GOOGLE_OAUTH_CLIENT_SECRET=GOOGLE_OAUTH_CLIENT_SECRET:latest,GOOGLE_DRIVE_REFRESH_TOKEN=GOOGLE_DRIVE_REFRESH_TOKEN:latest,DOCUMENT_AI_PROCESSOR_ID=DOCUMENT_AI_PROCESSOR_ID:latest"

export COMMON_ENV="NODE_ENV=production,BASE_URL=${API_URL},FRONTEND_URL=${FRONTEND_URL},CORS_ORIGIN=${FRONTEND_URL},GOOGLE_CLOUD_PROJECT_ID=${PROJECT_ID},DOCUMENT_AI_LOCATION=${DOCUMENT_AI_LOCATION},INE_OCR_ENABLED=true,ENABLE_XLSX_EXPORT=true,REALTIME_DURABLE_ENABLED=true,MAIL_PROVIDER=mailtrap,MAIL_FROM_NAME=Nexo Comercial,MAIL_PLATFORM_NAME=Nexo Comercial,MAIL_TIME_ZONE=America/Mexico_City,MAIL_SEND_TIMEOUT_MS=10000"
```

### API

```bash
gcloud run deploy nexo-api \
  --image="${IMAGE_ROOT}/nexo-api:sha-${GIT_SHA}" \
  --region="$REGION" \
  --allow-unauthenticated \
  --service-account="$RUNTIME_SA_EMAIL" \
  --port=8080 \
  --min-instances=1 \
  --max-instances=5 \
  --concurrency=80 \
  --timeout=3600 \
  --clear-vpc-connector \
  --cpu=1 \
  --memory=1Gi \
  --cpu-boost \
  --cpu-throttling \
  --set-env-vars="${COMMON_ENV},WORKERS_ENABLED=false,WS_ENABLED=true,PRISMA_CONNECTION_LIMIT=5" \
  --set-secrets="$BACKEND_SECRETS" \
  --add-cloudsql-instances="$INSTANCE_CONNECTION_NAME" \
  --project="$PROJECT_ID"
```

La API debe ser invocable sin autenticación IAM para el navegador y el webhook de WhatsApp. Esto no elimina la autenticación: Express JWT y RBAC siguen protegiendo las rutas privadas. El `--min-instances=1` mantiene una réplica caliente para las sesiones WebSocket (y con ella su pool de 5 conexiones siempre activo); `--timeout=3600` evita cortar esas sesiones. `--max-instances=5` y `PRISMA_CONNECTION_LIMIT=5` acotan el consumo a 25 conexiones en el peor caso.

### Worker request-driven (producción)

Este es el comando alineado con el workflow. Requiere `BACKGROUND_EXECUTION_BACKEND=cloud_tasks` y los flags de costo de la sección anterior.

```bash
gcloud run deploy nexo-worker \
  --image="${IMAGE_ROOT}/nexo-worker:sha-${GIT_SHA}" \
  --region="$REGION" \
  --no-allow-unauthenticated \
  --ingress=all \
  --service-account="$RUNTIME_SA_EMAIL" \
  --port=8080 \
  --min-instances=0 \
  --max-instances=5 \
  --concurrency=50 \
  --timeout=300 \
  --clear-vpc-connector \
  --cpu=1 \
  --memory=1Gi \
  --no-cpu-boost \
  --cpu-throttling \
  --command="" \
  --args="" \
  --set-env-vars="${COMMON_ENV},WORKERS_ENABLED=true,BACKGROUND_EXECUTION_BACKEND=cloud_tasks,WS_ENABLED=false,PRISMA_CONNECTION_LIMIT=2,WORKER_HEALTH_PORT=8080" \
  --set-secrets="$BACKEND_SECRETS" \
  --add-cloudsql-instances="$INSTANCE_CONNECTION_NAME" \
  --project="$PROJECT_ID"
```

`--cpu-throttling` es obligatorio aquí: el worker solo trabaja durante requests de Cloud Tasks/Scheduler. Omitir el flag puede heredar `cpu-throttling=false` de una revisión polling.

Con `--max-instances=5` y `PRISMA_CONNECTION_LIMIT=2`, el worker aporta 10 conexiones al peor caso. Subir cualquiera de los dos exige escalar antes el tier de Cloud SQL ([regla de oro](./CLOUD_SQL_CONNECTION.md) §3.2).

### Realtime relay

Servicio de recuperación que sirve el worker image con `node dist/realtime-relay.js`. También abre el socket de Cloud SQL, así que entra en el presupuesto:

```bash
gcloud run deploy nexo-realtime-relay \
  --image="${IMAGE_ROOT}/nexo-worker:sha-${GIT_SHA}" \
  --region="$REGION" \
  --no-allow-unauthenticated \
  --ingress=all \
  --service-account="$RUNTIME_SA_EMAIL" \
  --port=8080 \
  --min-instances=1 \
  --max-instances=2 \
  --concurrency=1 \
  --timeout=300 \
  --clear-vpc-connector \
  --cpu=1 \
  --memory=1Gi \
  --cpu-boost \
  --no-cpu-throttling \
  --command=node \
  --args=dist/realtime-relay.js \
  --set-env-vars="${COMMON_ENV},WORKERS_ENABLED=true,BACKGROUND_EXECUTION_BACKEND=cloud_tasks,WS_ENABLED=false,PRISMA_CONNECTION_LIMIT=2,WORKER_HEALTH_PORT=8080" \
  --set-secrets="$BACKEND_SECRETS" \
  --add-cloudsql-instances="$INSTANCE_CONNECTION_NAME" \
  --project="$PROJECT_ID"
```

`--no-cpu-throttling` es intencional: el relay necesita CPU fuera de requests. Aporta 4 conexiones (2 × 2) al presupuesto.

### Worker polling de bootstrap o rollback

Use este despliegue siempre activo solo para crear el servicio antes de la primera preparación de Cloud Tasks o para rollback. El estado productivo request-driven se despliega mediante el [procedimiento de primer despliegue](#primer-despliegue-del-worker-con-cloud-tasks-y-cloud-scheduler) y el workflow canónico.

```bash
gcloud run deploy nexo-worker \
  --image="${IMAGE_ROOT}/nexo-worker:sha-${GIT_SHA}" \
  --region="$REGION" \
  --no-allow-unauthenticated \
  --ingress=all \
  --service-account="$RUNTIME_SA_EMAIL" \
  --port=8080 \
  --min-instances=1 \
  --max-instances=5 \
  --concurrency=50 \
  --timeout=600 \
  --cpu=1 \
  --memory=1Gi \
  --no-cpu-boost \
  --no-cpu-throttling \
  --command="" \
  --args="" \
  --set-env-vars="${COMMON_ENV},WORKERS_ENABLED=true,WS_ENABLED=false,PRISMA_CONNECTION_LIMIT=2,WORKER_HEALTH_PORT=8080" \
  --set-secrets="$BACKEND_SECRETS" \
  --add-cloudsql-instances="$INSTANCE_CONNECTION_NAME" \
  --project="$PROJECT_ID"
```

`--no-cpu-throttling` mantiene CPU disponible fuera de requests, requisito para pollers background. `--no-cpu-boost` solo controla CPU adicional durante startup y no sustituye esa opción.

Nunca use:

```bash
# PROHIBIDO para nexo-worker
gcloud run deploy nexo-worker --source=...
```

Los builds automáticos bajo `cloud-run-source-deploy` produjeron revisiones donde `--command=node` falló con `node` fuera de `PATH` (ese flag sustituye el ENTRYPOINT `tini`). Use exclusivamente la imagen `worker` de Artifact Registry y restaure defaults con `--command="" --args=""`.

### Frontend

```bash
gcloud run deploy nexo-frontend \
  --image="${IMAGE_ROOT}/nexo-frontend:sha-${GIT_SHA}" \
  --region="$REGION" \
  --allow-unauthenticated \
  --service-account="$RUNTIME_SA_EMAIL" \
  --port=8080 \
  --min-instances=0 \
  --max-instances=10 \
  --concurrency=80 \
  --timeout=300 \
  --clear-vpc-connector \
  --cpu=1 \
  --memory=512Mi \
  --cpu-boost \
  --cpu-throttling \
  --set-env-vars="NODE_ENV=production,NEXT_PUBLIC_API_URL=${API_URL},NEXT_PUBLIC_WS_URL=${API_URL}" \
  --project="$PROJECT_ID"
```

Las env runtime mantienen consistente el proceso server-side; no cambian el bundle ya construido.

### Guarda de CPU para polling

Cuando el worker opera en polling, mantenga CPU disponible fuera de requests:

```bash
gcloud run services update nexo-worker \
  --region="$REGION" \
  --no-cpu-throttling \
  --min-instances=1 \
  --max-instances=5 \
  --cpu=1 \
  --memory=1Gi \
  --project="$PROJECT_ID"
```

Luego confirme la anotación; no dé por hecho que `--no-cpu-boost` la preservó. **No ejecute esta guarda después de un deploy `cloud_tasks`:** cambiaría min 0 a min 1 y anularía scale-to-zero.

### Bootstrap de URLs run.app

Si no existe dominio canónico ni servicios previos:

1. Migre la base y construya backend/tools.
2. Despliegue API inicialmente privada con `BASE_URL=https://bootstrap.invalid`, `FRONTEND_URL=https://bootstrap.invalid` y el resto de su configuración.
3. Obtenga `API_URL` con el comando siguiente.
4. Construya y despliegue frontend con ese `API_URL`; obtenga `FRONTEND_URL`.
5. Configure las variables GitHub.
6. Redespliegue API con URLs finales y `--allow-unauthenticated`.
7. Despliegue el worker polling inicial con min 1 y publique frontend.
8. Prepare y active Cloud Tasks siguiendo el [gate de primer despliegue](#primer-despliegue-del-worker-con-cloud-tasks-y-cloud-scheduler).

```bash
export API_URL="$(gcloud run services describe nexo-api --region="$REGION" --project="$PROJECT_ID" --format='value(status.url)')"
export FRONTEND_URL="$(gcloud run services describe nexo-frontend --region="$REGION" --project="$PROJECT_ID" --format='value(status.url)')"
test -n "$API_URL"
test -n "$FRONTEND_URL"
```

## 12. DNS, dominios y proxies

### Estado actual

- No hay zonas Cloud DNS.
- No hay Cloud Run domain mappings.
- No hay forwarding rules, backend services, URL maps ni serverless NEGs.
- Producción usa URLs `run.app` directas.
- `deploy/Caddyfile` pertenece al stack `docker-compose.prod.yml`/QA de VPS u on-premise.
- `frontend/proxy.ts` es lógica de routing de Next.js, no un reverse proxy de red.

Por tanto, una réplica exacta termina con `run.app`. No afirme que Caddy, Firebase Hosting o un external Application Load Balancer están activos.

### Si el cliente exige dominio propio

Trátelo como una extensión aprobada y elija una única estrategia: domain mapping soportado en la región o external Application Load Balancer con serverless NEG. Después:

- Publicar DNS y esperar validación/TLS.
- Fijar `GCP_API_BASE_URL` y `GCP_FRONTEND_URL` a los dominios canónicos.
- Reconstruir el frontend con las nuevas URLs build-time.
- Redesplegar API con `BASE_URL`, `FRONTEND_URL` y `CORS_ORIGIN` actualizados.
- Actualizar webhook de WhatsApp y OAuth redirect URIs.
- Repetir smoke tests y revisar CORS/WebSocket.

No coloque Caddy delante de Cloud Run como parte de este playbook. Para el stack alternativo Compose, `deploy/Caddyfile` enruta `/api/*`, `/health`, docs y `/socket.io*` a `api:8000`, y el resto a `frontend:3000`.

## 13. Inventario completo de configuración

Leyenda: **SM** = Secret Manager; **GH var/secret** = GitHub Actions; **env** = env directa Cloud Run; **build arg** = valor congelado al compilar.

### Pipeline e infraestructura

| Variable                                | Fase          | Almacenamiento | Requerida                  | Plantilla/nota                                         |
| --------------------------------------- | ------------- | -------------- | -------------------------- | ------------------------------------------------------ |
| `GCP_PROJECT_ID`                        | CI            | GH secret      | Sí                         | `<gcp-project-id>`                                     |
| `WIF_PROVIDER`                          | CI            | GH secret      | Sí                         | `projects/<number>/locations/global/.../providers/...` |
| `GH_SA_CICD`                            | CI            | GH secret      | Sí                         | `<deploy-sa>@<project>.iam.gserviceaccount.com`        |
| `GCP_API_BASE_URL`                      | Build/runtime | GH var         | Sí                         | URL canónica API                                       |
| `GCP_FRONTEND_URL`                      | Runtime       | GH var         | Sí                         | URL canónica frontend                                  |
| `GCP_DOC_AI_LOC`                        | Runtime       | GH var         | Si OCR activo              | `us` u otra ubicación del processor                    |
| `GCP_TASKS_QUEUE_NAME`                  | Runtime       | GH var         | Sí                         | `background-tasks`                                     |
| `GCP_WORKER_SERVICE_URL`                | Runtime       | GH var         | Sí                         | URL HTTPS privada de `nexo-worker`                     |
| `GCP_TASKS_SERVICE_ACCOUNT_EMAIL`       | Runtime       | GH var         | Sí                         | SA OIDC `cloud-tasks-invoker`                          |
| `GCP_PUBSUB_PUSH_SERVICE_ACCOUNT_EMAIL` | Runtime       | GH var         | Sí                         | SA OIDC `pubsub-push-invoker`                          |
| `GCP_WS_URL`                            | Build         | Make/env local | Default `GCP_API_BASE_URL` | Solo targets Make; workflow usa API URL                |
| `GCP_CORS_ORIGIN`                       | Runtime       | Make/env local | Default frontend URL       | Solo targets Make                                      |
| `GCP_DOC_AI_PROC`                       | Runtime       | Make/env local | Obsoleta                   | No usar; processor en SM                               |
| `GCP_REGION`                            | CI            | Workflow/env   | Sí                         | `us-central1`                                          |
| `AR_REPO`                               | CI            | Workflow/env   | Sí                         | `nexo-comercial`                                       |
| `DB_INSTANCE`                           | CI            | Workflow/env   | Sí                         | `nexo-comercial`                                       |
| `SA_RUN`                                | CI            | Workflow/env   | Sí                         | `nexo-comercial-run-sa`                                |
| `CLOUDSDK_CORE_DISABLE_PROMPTS`         | CI            | Workflow env   | `1`                        | Evita prompts interactivos                             |

### Backend: runtime y transporte

| Variable                            | Scope                     | Almacenamiento | Req./default                  | Nota                                     |
| ----------------------------------- | ------------------------- | -------------- | ----------------------------- | ---------------------------------------- |
| `NODE_ENV`                          | API/worker/migrator/seeds | env            | `development`; prod explícito | Seeds usan `staging`                     |
| `LOG_LEVEL`                         | API/worker                | env            | `info`                        | `debug`, `info`, `warn`, `error`         |
| `PORT`                              | API/frontend              | Cloud Run      | Inyectada, 8080               | No fijar manualmente en app              |
| `WORKER_HEALTH_PORT`                | worker                    | env            | 8010; prod 8080               | Debe coincidir con `$PORT`               |
| `SHUTDOWN_TIMEOUT_MS`               | API/worker                | env            | 15000                         | 1000-60000                               |
| `BASE_URL`                          | API/worker/seeds          | env            | Obligatoria                   | URL API canónica                         |
| `CORS_ORIGIN`                       | API/worker                | env            | `*`; prod frontend            | No dejar `*` en prod                     |
| `WS_ENABLED`                        | API/worker                | env            | `true`; API true/worker false | WebSocket solo API                       |
| `WS_CORS_ORIGIN`                    | API                       | env            | Opcional                      | Si falta, revisar fallback de aplicación |
| `WS_PATH`                           | API/frontend              | env/build      | `/socket.io`                  | Debe coincidir con cliente               |
| `WORKERS_ENABLED`                   | API/worker                | env            | `true`; API false/worker true | Separa procesos                          |
| `BACKGROUND_EXECUTION_BACKEND`      | API/worker                | env            | Prod `cloud_tasks`            | `polling` solo bootstrap/rollback        |
| `REALTIME_DURABLE_ENABLED`          | API/worker                | env            | `true`                        | Kill switch de outbox durable            |
| `PUBSUB_PUSH_AUDIENCE`              | API                       | GH var -> env  | Prod                          | Origen canónico; igual al audience OIDC  |
| `PUBSUB_PUSH_SERVICE_ACCOUNT_EMAIL` | API                       | GH var -> env  | Prod                          | SA OIDC de la push subscription          |

### Base de datos y colas

| Variable                            | Scope               | Almacenamiento                | Req./default             | Nota                              |
| ----------------------------------- | ------------------- | ----------------------------- | ------------------------ | --------------------------------- |
| `DATABASE_URL`                      | API/worker/jobs     | SM                            | Obligatoria              | Socket con `@localhost`           |
| `CLOUDSQL_DB_USER`                  | API/worker/migrator | SM `DB_USER`                  | Prod                     | Componente de URL runtime         |
| `CLOUDSQL_DB_PASS`                  | API/worker/migrator | SM `DB_PASS`                  | Prod                     | Secreto                           |
| `CLOUDSQL_DB_NAME`                  | API/worker/migrator | SM `DB_NAME`                  | Prod                     | Nombre de base                    |
| `CLOUDSQL_INSTANCE_CONNECTION_NAME` | API/worker/migrator | SM `INSTANCE_CONNECTION_NAME` | Prod                     | `project:region:instance`         |
| `CLOUDSQL_USE_PGBOUNCER`            | API/worker          | env                           | Ausente/false            | No habilita un pooler por sí sola |
| `PRISMA_CONNECTION_LIMIT`           | API/worker/relay    | env                           | API 5, worker 2, relay 2 | Rango 1-40; ver regla de oro      |
| `GCP_PROJECT_ID`                    | API/worker          | env                           | Cloud Tasks              | ID real del proyecto              |
| `GCP_LOCATION`                      | API/worker          | env                           | `us-central1`            | Región de queue y worker          |
| `TASKS_QUEUE_NAME`                  | API/worker          | GH var -> env                 | Cloud Tasks              | `background-tasks`                |
| `WORKER_SERVICE_URL`                | API/worker          | GH var -> env                 | Cloud Tasks              | URL HTTPS, nunca `localhost`      |
| `TASKS_SERVICE_ACCOUNT_EMAIL`       | API/worker          | GH var -> env                 | Cloud Tasks              | Identidad OIDC invoker            |
| `INBOX_POLL_INTERVAL_MS`            | worker              | env                           | 2000                     | Milisegundos                      |
| `OUTBOX_POLL_INTERVAL_MS`           | worker              | env                           | 1000                     | Milisegundos                      |
| `QUEUE_RETRY_PROMOTION_INTERVAL_MS` | worker              | env                           | 5000                     | Milisegundos                      |

### Auth, seguridad y rate limits

| Variable                                 | Scope            | Almacenamiento | Req./default      |
| ---------------------------------------- | ---------------- | -------------- | ----------------- |
| `ENCRYPTION_KEY`                         | API/worker/seeds | SM             | Obligatoria       |
| `JWT_SECRET`                             | API/worker/seeds | SM             | Obligatoria       |
| `JWT_REFRESH_SECRET`                     | API/worker/seeds | SM             | Obligatoria       |
| `JWT_ACCESS_EXPIRES_IN`                  | API              | env            | `15m`             |
| `JWT_REFRESH_EXPIRES_IN`                 | API              | env            | `7d`              |
| `AUTH_MAX_SESSIONS_PER_USER`             | API              | env            | 5                 |
| `AUTH_RATE_LIMIT_MAX`                    | API              | env            | 10                |
| `AUTH_RATE_LIMIT_WINDOW_SECONDS`         | API              | env            | 900               |
| `AUTH_REFRESH_RATE_LIMIT_MAX`            | API              | env            | 60                |
| `AUTH_REFRESH_RATE_LIMIT_WINDOW_SECONDS` | API              | env            | 300               |
| `AUTH_LOCKOUT_MAX_ATTEMPTS`              | API              | env            | 5                 |
| `AUTH_LOCKOUT_DURATIONS`                 | API              | env            | `60,300,900,3600` |
| `WHATSAPP_SECRET_CACHE_TTL_MS`           | API/worker       | env            | 60000             |

### WhatsApp, IA, OCR y Drive

| Variable                           | Scope            | Almacenamiento | Req./default                                  | Nota                         |
| ---------------------------------- | ---------------- | -------------- | --------------------------------------------- | ---------------------------- |
| `WHATSAPP_VERIFY_TOKEN`            | API/worker/seeds | SM             | Obligatoria                                   | Token acordado con webhook   |
| `WHATSAPP_APP_ID`                  | API/worker/seeds | SM             | Obligatoria                                   | No público                   |
| `WHATSAPP_APP_SECRET`              | API/worker/seeds | SM             | Obligatoria                                   | Secreto                      |
| `WHATSAPP_ACCESS_TOKEN`            | API/worker/seeds | SM             | Obligatoria                                   | Secreto                      |
| `WHATSAPP_PHONE_NUMBER_ID`         | API/worker/seeds | SM             | Obligatoria                                   | ID operativo                 |
| `WHATSAPP_BUSINESS_ACCOUNT_ID`     | API/worker/seeds | SM             | Obligatoria                                   | ID operativo                 |
| `OPENAI_API_KEY`                   | API/worker       | SM             | Opcional en código; referenciada por workflow | No frontend                  |
| `OPENAI_BASE_URL`                  | API/worker       | env            | Opcional                                      | Endpoint compatible          |
| `NVIDIA_API_KEY`                   | API/worker       | SM             | Opcional en código; referenciada por workflow | No frontend                  |
| `ANTHROPIC_API_KEY`                | API/worker       | SM             | Opcional en código; referenciada por workflow | No frontend                  |
| `AI_TIMEOUT_MS`                    | API/worker       | env            | 30000                                         | Milisegundos                 |
| `AI_DUPLICATE_TOOL_LOOP_THRESHOLD` | API/worker       | env            | 3                                             | Mínimo 2                     |
| `INE_OCR_ENABLED`                  | API/worker       | env            | `false`; prod true                            | Exige configuración Google   |
| `INE_UPLOAD_MAX_BYTES`             | API              | env            | 10485760                                      | Máximo 10 MiB                |
| `INE_UPLOAD_ALLOWED_MIME_TYPES`    | API              | env            | JPEG, PNG, PDF                                | Lista exacta validada        |
| `GOOGLE_CLOUD_PROJECT_ID`          | API/worker       | env            | Si OCR activo                                 | Normalmente `PROJECT_ID`     |
| `DOCUMENT_AI_LOCATION`             | API/worker       | GH var -> env  | Si OCR activo                                 | Debe coincidir con processor |
| `DOCUMENT_AI_PROCESSOR_ID`         | API/worker       | SM             | Si OCR activo                                 | No GH variable               |
| `GOOGLE_DRIVE_FOLDER_ID`           | API/worker       | SM             | Si Drive activo                               | Runtime                      |
| `GOOGLE_OAUTH_CLIENT_ID`           | API/worker       | SM             | Si Drive activo                               | Runtime                      |
| `GOOGLE_OAUTH_CLIENT_SECRET`       | API/worker       | SM             | Si Drive activo                               | Runtime                      |
| `GOOGLE_DRIVE_REFRESH_TOKEN`       | API/worker       | SM             | Si Drive activo                               | Runtime                      |
| `INE_OCR_JOB_POLL_INTERVAL_MS`     | worker           | env            | 2000                                          | Mínimo 250                   |
| `INE_OCR_JOB_BATCH_SIZE`           | worker           | env            | 5                                             | 1-50                         |
| `INE_OCR_JOB_MAX_ATTEMPTS`         | worker           | env            | 3                                             | 1-10                         |

### Export XLSX

Kill switch y tunables. Solo `ENABLE_XLSX_EXPORT` se fija en Cloud Run; el resto usa el default de `env.config.ts`. Producción usa `cloud_tasks` y Drive; local `polling` polea jobs `queued`.

| Variable                        | Scope      | Almacenamiento | Req./default         | Nota                                                              |
| ------------------------------- | ---------- | -------------- | -------------------- | ----------------------------------------------------------------- |
| `ENABLE_XLSX_EXPORT`            | API/worker | env            | `false`; prod `true` | Kill switch. `false` → 503 y oculta el botón admin                |
| `EXPORT_JOB_TTL_MS`             | API/worker | env            | 86400000             | TTL del job y del archivo en Drive                                |
| `EXPORT_JOB_POLL_INTERVAL_MS`   | worker     | env            | 2000                 | Solo `polling`. No corre en `cloud_tasks`                         |
| `EXPORT_RECONCILE_INTERVAL_MS`  | worker     | env            | 3600000              | GC de jobs expirados                                              |
| `EXPORT_BATCH_SIZE`             | worker     | env            | 1000                 | Cursor por página (100–10000)                                     |
| `EXPORT_STREAM_HIGH_WATER_MARK` | worker     | env            | 262144               | Buffer del `PassThrough`                                          |
| `EXPORT_WATCHDOG_TIMEOUT_MS`    | worker     | env            | 900000               | Jobs `processing` colgados. Timeout Cloud Run del worker es 300 s |
| `EXPORT_FOLDER_CACHE_TTL_MS`    | worker     | env            | 3600000              | Cache in-memory de `exports/<module>`                             |
| `EXPORT_DOWNLOAD_TOKEN_TTL_MS`  | API        | env            | 600000               | Token one-shot; se recorta al `expiresAt` del job                 |

### Correo, invitaciones y newsletter

| Variable                               | Scope      | Almacenamiento | Req./default                                            |
| -------------------------------------- | ---------- | -------------- | ------------------------------------------------------- |
| `MAIL_PROVIDER`                        | API/worker | env            | `mailtrap`; también `fake`                              |
| `MAILTRAP_API_TOKEN`                   | API/worker | SM             | Referenciada por workflow                               |
| `MAILTRAP_API_URL`                     | API/worker | SM             | Referenciada por workflow                               |
| `MAIL_FROM_ADDRESS`                    | API/worker | SM             | Referenciada por workflow                               |
| `MAIL_FROM_NAME`                       | API/worker | env            | `Nexo Comercial`                                        |
| `MAIL_REPLY_TO_ADDRESS`                | API/worker | SM             | Referenciada por workflow                               |
| `MAIL_SUPPORT_EMAIL`                   | API/worker | SM             | Referenciada por workflow                               |
| `MAIL_PLATFORM_NAME`                   | API/worker | env            | `Nexo Comercial`                                        |
| `MAIL_TIME_ZONE`                       | API/worker | env            | `America/Mexico_City`                                   |
| `MAIL_SEND_TIMEOUT_MS`                 | API/worker | env            | 10000                                                   |
| `ENABLE_EMAIL_TEST_ENDPOINTS`          | API        | env            | `false`                                                 |
| `EMAIL_TEST_ALLOWED_RECIPIENTS`        | API        | env            | Opcional                                                |
| `EMAIL_TEST_ALLOWED_DOMAINS`           | API        | env            | Opcional                                                |
| `EMAIL_TEST_RATE_LIMIT_MAX`            | API        | env            | 5                                                       |
| `EMAIL_TEST_RATE_LIMIT_WINDOW_SECONDS` | API        | env            | 600                                                     |
| `FRONTEND_URL`                         | API/worker | env            | `http://localhost:5173`; prod obligatoria por operación |
| `INVITATION_EXPIRATION_MINUTES`        | API        | env            | 1440                                                    |
| `INVITATION_RESEND_COOLDOWN_SECONDS`   | API        | env            | 300                                                     |
| `NEWSLETTER_DOUBLE_OPT_IN`             | API        | env            | `false`                                                 |
| `NEWSLETTER_CONFIRM_TTL_HOURS`         | API        | env            | 72                                                      |

### Endpoints públicos

| Variable                                              | Default               |
| ----------------------------------------------------- | --------------------- |
| `PUBLIC_REGISTRO_RATE_LIMIT_MAX`                      | 10                    |
| `PUBLIC_REGISTRO_RATE_LIMIT_WINDOW_SECONDS`           | 900                   |
| `PUBLIC_BARRIOS_RATE_LIMIT_MAX`                       | 60                    |
| `PUBLIC_BARRIOS_RATE_LIMIT_WINDOW_SECONDS`            | 60                    |
| `PUBLIC_NEWSLETTER_RATE_LIMIT_MAX`                    | 20                    |
| `PUBLIC_NEWSLETTER_RATE_LIMIT_WINDOW_SECONDS`         | 900                   |
| `PUBLIC_EVENTS_TZ`                                    | `America/Mexico_City` |
| `PUBLIC_EVENTOS_SEMANA_RATE_LIMIT_MAX`                | 120                   |
| `PUBLIC_EVENTOS_SEMANA_RATE_LIMIT_WINDOW_SECONDS`     | 60                    |
| `PUBLIC_EVENTOS_ASISTENCIA_RATE_LIMIT_MAX`            | 15                    |
| `PUBLIC_EVENTOS_ASISTENCIA_RATE_LIMIT_WINDOW_SECONDS` | 900                   |

### Seeds y frontend

| Variable                  | Fase/scope                   | Almacenamiento         | Req./default                          |
| ------------------------- | ---------------------------- | ---------------------- | ------------------------------------- |
| `SUPERADMIN_EMAIL`        | seed dev                     | SM                     | Opcional en código; requerido por SOP |
| `SUPERADMIN_PASSWORD`     | seed dev                     | SM                     | Obligatorio para seed                 |
| `SUPERADMIN_FULL_NAME`    | seed dev                     | SM                     | Opcional en código; requerido por SOP |
| `NEXT_PUBLIC_API_URL`     | frontend build + runtime SSR | Build arg y env        | Build requerido; default local        |
| `NEXT_PUBLIC_WS_URL`      | frontend build + runtime SSR | Build arg y env        | Build requerido; fallback API URL     |
| `NEXT_PUBLIC_BASE_URL`    | frontend build               | No cableado por Docker | Fallback en código                    |
| `NEXT_PUBLIC_WS_PATH`     | frontend build               | No cableado por Docker | `/socket.io`                          |
| `NEXT_PUBLIC_WS_ENABLED`  | frontend build               | No cableado por Docker | true salvo valor `false`              |
| `HOSTNAME`                | frontend runtime             | Dockerfile             | `0.0.0.0`                             |
| `NEXT_TELEMETRY_DISABLED` | frontend build/runtime       | Dockerfile             | `1`                                   |

### Stack Compose alternativo

Estas variables provienen de `.env.example`, `docker-compose.prod.yml` y Caddy. No se inyectan en la arquitectura GCP gestionada.

| Variable            | Scope                       | Req./default    | Nota                                         |
| ------------------- | --------------------------- | --------------- | -------------------------------------------- |
| `POSTGRES_USER`     | PostgreSQL Compose          | `voz`           | Sustituido por `DB_USER`/Cloud SQL en GCP    |
| `POSTGRES_PASSWORD` | PostgreSQL Compose          | Obligatoria     | No reutilizar automáticamente en GCP         |
| `POSTGRES_DB`       | PostgreSQL Compose          | `nexocomercial` | QA sugiere `nexocomercial_qa`                |
| `DATABASE_URL`      | API/worker/migrator Compose | Obligatoria     | Host interno `postgres`, no socket Cloud SQL |
| `CADDY_DOMAIN`      | Caddy Compose               | Sin default     | Dominio TLS del VPS/on-premise               |
| `QA_HTTP_PORT`      | Caddy QA                    | 8080            | Puerto host alternativo                      |
| `QA_HTTPS_PORT`     | Caddy QA                    | 8443            | Puerto host alternativo                      |

[`backend/.env.example`](../backend/.env.example) no incluye `BASE_URL` aunque el schema la exige; el workflow sí la define. Trate al schema y al workflow como autoridad para GCP.

## 14. Scripts y drift

| Fuente                       | Uso permitido                       | Limitaciones actuales                                                                                                                                                                                                                            |
| ---------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `docs/deploy/deploy-gcp.yml` | Release regular canónico            | No automatiza seeds; requiere infraestructura preparada, tres variables Cloud Tasks y roles admin de queue/Scheduler en CI/CD. En GitHub Free privado también es el gate CI del release, porque no hay branch protection que exija checks de PR. |
| `backend/Dockerfile`         | `runner` y `tools`                  | Correcto; `tools` incluye fuentes/tsconfig para seeds                                                                                                                                                                                            |
| `frontend/Dockerfile`        | Build `prod`                        | Solo cablea build args API/WS                                                                                                                                                                                                                    |
| `Makefile` targets `gcp-*`   | Diagnóstico o bootstrap supervisado | `gcp-migrate` / `gcp-seed` anclan command; alinee `gcp-deploy-*` con los flags de costo del workflow                                                                                                                                             |
| `generate-token-drive.ts`    | Generar refresh token localmente    | Usa callback 8000; su comentario superior que indica 3000 está desactualizado                                                                                                                                                                    |
| `docker-compose.prod.yml`    | VPS/on-prem alternativo             | No describe GCP; incluye PostgreSQL y Caddy locales                                                                                                                                                                                              |
| `deploy/Caddyfile`           | Reverse proxy Compose               | No activo en GCP                                                                                                                                                                                                                                 |
| `infra/**`                   | N/A                                 | No existe en el repositorio                                                                                                                                                                                                                      |

No ejecute `make gcp-deploy-all` para afirmar paridad productiva si los secrets o env del Makefile difieren del workflow. Los flags de costo de `gcp-deploy-*` deben coincidir con el workflow. El workflow publica `runner` como `nexo-api` y el stage `worker` (mismo filesystem, CMD `dist/worker.js`) como `nexo-worker`.

### Despliegue manual de contingencia (sin minutos de GitHub Actions)

[`scripts/deploy-gcp-local.sh`](../scripts/deploy-gcp-local.sh) es el único camino manual aprobado para publicar una revisión ya integrada a `origin/main`. Conserva la configuración ya activa de Cloud Run y Secret Manager; actualiza exclusivamente las imágenes, ejecuta migraciones forward-only y verifica salud antes de continuar.

Requisitos: `gcloud`, Docker Buildx, `git`, `make`, `python3` y `curl`; el proyecto activo de `gcloud` debe ser el entorno objetivo y la cuenta debe tener permisos de Artifact Registry, Cloud Run, Cloud Tasks, Cloud Scheduler y Cloud Run Jobs. El checkout debe estar limpio y coincidir exactamente con `origin/main`.

```bash
git fetch origin main
git switch --detach origin/main
git rev-parse --short HEAD
scripts/deploy-gcp-local.sh --confirm-sha <sha-impreso>
```

El script siempre ejecuta `pnpm --dir backend run prisma:generate` y `make validate`; no tiene modo para omitir checks. También rechaza cambios locales, SHAs no publicados en `origin/main` y una confirmación SHA distinta. Su orden es `worker` (salud) → reanudar queues/Scheduler → `realtime-relay` (salud) → API (salud) → frontend (salud).

No use este camino para cambiar secretos, IAM, infraestructura, definición de queues, flags de escalado o variables de runtime: `gcloud run services update --image` preserva deliberadamente esos valores para no borrar configuración al operar bajo emergencia. Cuando GitHub Actions vuelva a estar disponible, use el workflow canónico para esos cambios de configuración.

## 15. Verificación posterior al despliegue

El release regular ejecuta un job bloqueante `Verify production` después de los despliegues. Para
cambios backend comprueba API `/ready`, worker privado `/ready`, Queue `RUNNING`, Scheduler
`ENABLED` y los flags de costo (min 0, max, timeout, `cpu-throttling=true`); para cambios frontend
comprueba `/` y los mismos flags de costo. Los comandos siguientes siguen siendo útiles para
diagnóstico manual, revisión de IAM y drift que no forman parte del smoke automatizado.

### Estado y salud

```bash
gcloud run services list --region="$REGION" --project="$PROJECT_ID" \
  --format='table(name,status.url,status.latestReadyRevisionName)'

export API_URL="$(gcloud run services describe nexo-api --region="$REGION" --project="$PROJECT_ID" --format='value(status.url)')"
export WORKER_URL="$(gcloud run services describe nexo-worker --region="$REGION" --project="$PROJECT_ID" --format='value(status.url)')"
export FRONTEND_URL="$(gcloud run services describe nexo-frontend --region="$REGION" --project="$PROJECT_ID" --format='value(status.url)')"

curl --fail --silent --show-error "${API_URL}/ready"
curl --fail --silent --show-error "${FRONTEND_URL}/" >/dev/null
curl --fail --silent --show-error \
  -H "Authorization: Bearer $(gcloud auth print-identity-token \
    --audiences="${WORKER_URL%/}" \
    --include-email \
    --impersonate-service-account="$RUNTIME_SA_EMAIL")" \
  "${WORKER_URL%/}/ready"
```

**Use `/ready`, no `/healthz`, contra la URL `run.app`.** Google Frontend intercepta la ruta literal `/healthz` y devuelve su propia página HTML 404; la petición nunca llega al contenedor y no aparece en los logs de Cloud Run. Ambas rutas comparten el mismo handler de liveness en `createWorkerApp`, así que `/ready` verifica exactamente lo mismo. `/healthz` sigue siendo válido en Compose y en los healthchecks internos por puerto, que no pasan por Google Frontend.

Cómo distinguir la causa cuando el smoke falla:

| Respuesta                                           | Causa                                    |
| --------------------------------------------------- | ---------------------------------------- |
| HTML de Google con logo, ~1568 bytes, en `/healthz` | Intercepción del edge; use `/ready`      |
| `403` en cualquier ruta                             | Token ausente, inválido o sin invocación |
| HTML corto de Express (~150 bytes) con `Cannot GET` | La ruta no existe en la revisión activa  |

El smoke privado del worker requiere que la identidad operadora pueda invocar el servicio (`roles/run.admin` o `roles/run.invoker`). El token OIDC debe llevar audience = origin `run.app` **y** el claim `email` de la service account (`id_token_include_email` / `--include-email`). `print-identity-token --audiences` exige una service account (`--impersonate-service-account`); ADC de WIF o de usuario no basta.

### IAM público/privado

```bash
for service in nexo-api nexo-worker nexo-frontend; do
  gcloud run services get-iam-policy "$service" \
    --region="$REGION" --project="$PROJECT_ID" \
    --format='table(bindings.role,bindings.members)'
done
```

**Esperado:** `allUsers` solo en API y frontend.

### Drift crítico

```bash
gcloud run services describe nexo-worker \
  --region="$REGION" --project="$PROJECT_ID" \
  --format='yaml(status.latestReadyRevisionName,spec.template.metadata.annotations,spec.template.spec.containerConcurrency,spec.template.spec.timeoutSeconds,spec.template.spec.containers[0].image,spec.template.spec.containers[0].resources,spec.template.spec.containers[0].env)'

gcloud run services describe nexo-api \
  --region="$REGION" --project="$PROJECT_ID" \
  --format='yaml(spec.template.metadata.annotations,spec.template.spec.containers[0].env)'

gcloud run services describe nexo-frontend \
  --region="$REGION" --project="$PROJECT_ID" \
  --format='yaml(spec.template.metadata.annotations,spec.template.spec.containers[0].image,spec.template.spec.containers[0].env)'

gcloud run jobs list --region="$REGION" --project="$PROJECT_ID" \
  --format='table(metadata.name,status.conditions[0].status,status.latestCreatedExecution.completionStatus)'
```

Confirme manualmente:

- Worker request-driven: min 0, max 5, timeout 300 s, `cpu-throttling=true`, `BACKGROUND_EXECUTION_BACKEND=cloud_tasks`, imagen `nexo-comercial/nexo-worker` y pool 2.
- API: min 1, max 5, timeout 3600 s, `cpu-throttling=true`, `WORKERS_ENABLED=false`, `BACKGROUND_EXECUTION_BACKEND=cloud_tasks`, pool 5 y Cloud SQL (peor caso api+worker+relay = 39 conexiones; ver [CLOUD_SQL_CONNECTION.md](./CLOUD_SQL_CONNECTION.md) §3).
- Cloud Tasks/Scheduler: queue `RUNNING`, Scheduler `ENABLED`, invoker OIDC correcto y reconciliación HTTP 200.
- Frontend: bundle construido con URL API correcta.
- Ningún servicio tiene `CLOUDSQL_USE_PGBOUNCER=true` sin pooler real.
- Jobs usan `set-cloudsql-instances` y el migrator solo secretos DB.

### Logs

```bash
gcloud run services logs read nexo-api --region="$REGION" --project="$PROJECT_ID" --limit=200
gcloud run services logs read nexo-worker --region="$REGION" --project="$PROJECT_ID" --limit=200

gcloud logging read \
  'resource.type="cloud_run_revision" AND resource.labels.service_name="nexo-worker" AND (textPayload:"Transaction already closed" OR jsonPayload.message:"Transaction already closed")' \
  --project="$PROJECT_ID" --freshness=1h --limit=100

gcloud logging read \
  'resource.type="cloud_run_revision" AND resource.labels.service_name="nexo-worker" AND textPayload:"error finding executable \"node\""' \
  --project="$PROJECT_ID" --freshness=24h --limit=100
```

## 16. Rollback y recuperación

### Cloud Tasks a polling

No empiece el rollback cambiando tráfico o escalado. Pause primero la queue y Scheduler, restaure el worker con `BACKGROUND_EXECUTION_BACKEND=polling`, `WORKERS_ENABLED=true`, min 1 y CPU no throttled, y confirme `WORKERS_ENABLED=false` en API. Use los comandos y el criterio de recuperación de [Rollback seguro a polling](#5-rollback-seguro-a-polling). No elimine filas durables ni revierta la migración.

### Runtime

Liste revisiones y enrute el 100 % a una revisión sana:

```bash
gcloud run revisions list --service=nexo-api --region="$REGION" --project="$PROJECT_ID"

gcloud run services update-traffic nexo-api \
  --to-revisions="<known-good-revision>=100" \
  --region="$REGION" \
  --project="$PROJECT_ID"
```

Repita para frontend o worker si corresponde. En un worker polling, confirme imagen Docker correcta, min 1 y `cpu-throttling=false`; en `cloud_tasks`, confirme min 0 y endpoints request-driven antes de reactivar dispatch.

### Base de datos

- Prisma migrations son forward-only.
- Preferir una migración correctiva compatible hacia adelante.
- Para desastre, restaurar backup/PITR a una instancia nueva, validar y cambiar referencias de forma controlada.
- No apuntar una revisión antigua a un schema incompatible.

### Secretos

Si una rotación falla, vuelva a fijar una versión conocida con `--update-secrets` y redespliegue. El workflow usa `:latest`, por lo que el rollback debe quedar documentado y la versión defectuosa debe deshabilitarse solo después de confirmar recuperación. Nunca lea el valor para compararlo en consola.

## 17. Solución de problemas

| Síntoma                                       | Causa probable                         | Comprobación                           | Corrección                                            |
| --------------------------------------------- | -------------------------------------- | -------------------------------------- | ----------------------------------------------------- |
| Prisma rechaza `DATABASE_URL`                 | Host vacío `@/`                        | Revisar forma, sin imprimir password   | Usar `@localhost/...?...host=/cloudsql/...`           |
| Job no ve Cloud SQL                           | Flag de servicio usado en Job          | Describir anotaciones del Job          | Usar `--set-cloudsql-instances`                       |
| Servicio no ve Cloud SQL                      | Falta integración                      | Describir anotaciones del servicio     | Usar `--add-cloudsql-instances`                       |
| Deploy falla con secret inexistente           | Secret sin versión o nombre incorrecto | `secrets versions list`                | Agregar versión no vacía                              |
| Frontend llama localhost/URL vieja            | `NEXT_PUBLIC_*` solo runtime           | Inspeccionar build args/SHA            | Reconstruir frontend                                  |
| Worker: `node` no encontrado bajo `/cnb`      | Imagen buildpack de `--source`         | Revisar URI de imagen                  | Desplegar `runner` desde AR                           |
| Transacciones polling vencen/`ClientRead`     | CPU throttling fuera de requests       | Revisar modo, anotación y logs         | En polling, `--no-cpu-throttling`; validar bajo carga |
| Worker `cloud_tasks` sano pero no procesa     | Queue/Scheduler pausados, OIDC o URL   | Revisar estados, IAM y logs `/tasks/*` | Reanudar solo tras corregir IAM/URL y validar worker  |
| Smoke del worker: HTML 404 de Google          | GFE intercepta `/healthz` en `run.app` | La petición no aparece en logs de Run  | Probar `/ready`; no abrir el servicio a `allUsers`    |
| Activación CI falla al describir o reanudar   | SA CI/CD sin permisos admin            | Revisar logs del workflow y policy     | Otorgar `queueAdmin` y `cloudscheduler.admin`         |
| OCR reporta configuración faltante            | ID/location/project ausente            | Revisar nombres/referencias            | Processor ID en SM; location/project en env           |
| Document AI devuelve 403                      | IAM ADC insuficiente                   | Revisar SA activa y policy             | `roles/documentai.apiUser` a runtime SA               |
| Drive devuelve OAuth error                    | Refresh token/client inválidos         | Revisar nombres y logs sin valores     | Rotar los tres secretos OAuth                         |
| Seed bloqueado                                | `NODE_ENV=production`                  | Describir Job                          | Usar `staging` solo para seed auditado                |
| Seed `all` insertó fixtures                   | Scope incorrecto                       | Revisar ejecución/logs                 | Restaurar/corregir; usar core luego dev               |
| Cambiar `SUPERADMIN_PASSWORD` no cambia login | Upsert no actualiza hash               | Revisar código/auditoría               | Usar flujo explícito de rotación, no repetir seed     |
| WebSocket/CORS falla                          | URLs/path/origin desalineados          | Revisar build y env API                | Rebuild frontend y alinear CORS/WS                    |
| PgBouncer no tiene efecto                     | Solo se activó query flag              | Revisar infraestructura                | Desactivar flag o provisionar pooler real             |

## 18. Seguridad, ownership y operación

| Área                    | Owner sugerido              | Control                                                    |
| ----------------------- | --------------------------- | ---------------------------------------------------------- |
| Proyecto, IAM, WIF      | Plataforma/Cloud            | Revisión trimestral y al cambiar repo/branch               |
| Secret Manager          | Seguridad + owner funcional | Rotación, versiones y acceso por secret                    |
| Cloud SQL               | DBA/Plataforma              | Backups, PITR, capacidad, conexiones y deletion protection |
| Pub/Sub                 | Plataforma + Backend        | Topics `realtime-events` y `ai-stream`; push subscriptions |
| Cloud Run               | Plataforma + Backend        | Recursos, IAM, drift y salud                               |
| URLs frontend           | Frontend + Plataforma       | Rebuild obligatorio ante cambios                           |
| WhatsApp/Mail/LLM/Drive | Owner de integración        | Cuotas, credenciales y pruebas funcionales                 |
| Migraciones/seeds       | Backend/DBA                 | Aprobación, logs y evidencia de ejecución                  |

Reglas:

- No crear llaves JSON de service accounts para GitHub ni Document AI.
- No registrar valores secretos en tickets, logs, comandos de verificación o documentación.
- Mantener API pública a nivel Cloud Run solo porque navegador y WhatsApp no presentan IAM; JWT/RBAC permanece obligatorio.
- Mantener worker privado y min 0 con `--cpu-throttling` en `cloud_tasks`; usar min 1 y CPU no throttled solo en polling.
- No restaurar `--min-instances=1` en `nexo-api` ni omitir `--cpu-throttling` / `--timeout` en los deploys request-driven.
- Conservar tags inmutables `sha-*`; no usar `latest` para releases auditables.
- Revisar cuotas de Cloud SQL, Cloud Run y Document AI antes de cargas masivas.
- Habilitar alertas sobre errores 5xx, reinicios, latencia, conexiones SQL y ejecuciones fallidas de Jobs.

## Checklist de entrega

- [ ] Placeholders reemplazados y proyecto validado.
- [ ] APIs requeridas habilitadas.
- [ ] SA runtime y deploy separadas.
- [ ] WIF limitado al repositorio correcto, sin JSON key.
- [ ] Artifact Registry creado; no se usa `cloud-run-source-deploy`.
- [ ] Cloud SQL PostgreSQL 16 HA, backup y PITR verificados.
- [ ] `DATABASE_URL` usa socket y `@localhost`.
- [ ] Todos los secrets referenciados tienen versión; valores nunca expuestos.
- [ ] GitHub tiene exactamente tres secrets y siete variables activas del workflow.
- [ ] Imágenes publicadas con el mismo SHA.
- [ ] Migrator exitoso antes del deploy.
- [ ] En bootstrap, seed core y luego dev con `--command=pnpm` sobre `nexo-tools` del mismo SHA que `nexo-migrator`; nunca `all`; `NODE_ENV=staging`.
- [ ] API pública y worker privado.
- [ ] Worker `cloud_tasks` con 1 CPU/1 GiB, min 0/max 5, timeout 300 s, `--cpu-throttling` y pool 2; queue/Scheduler activos.
- [ ] API min 1/max 5, timeout 3600 s, `--cpu-throttling` y pool 5; PgBouncer ausente salvo habilitación real aprobada.
- [ ] Frontend reconstruido con URLs canónicas.
- [ ] Smoke, IAM, logs, drift y rollback verificados.
- [ ] DNS/proxy documentado como `run.app` o extensión explícita, nunca asumido.
