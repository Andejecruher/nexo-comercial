# Arquitectura de Conexión a Cloud SQL — Voz Ciudadana

**Tipo de documento:** Contexto base inmutable para agentes de IA (Gemini y similares).
**Propósito:** Explicar, sin re-escanear el código, cómo `voz-api`, `voz-worker` y los Jobs de migración/seeds se conectan a PostgreSQL (Cloud SQL), cómo se construye `DATABASE_URL`, cómo se resuelven las credenciales y cuál es el presupuesto de conexiones.

**Fuentes analizadas (snapshot):**

| Archivo | Rol |
| --- | --- |
| `backend/prisma/schema.prisma` | Datasource y modelos |
| `backend/src/config/env.config.ts` | Validación Zod de variables |
| `backend/src/database/datasource-url.ts` | **Constructor de la URL de conexión** |
| `backend/src/database/prisma-client-options.ts` | Opciones del cliente Prisma |
| `backend/src/database/prisma.ts` | Singleton del cliente |
| `.github/workflows/deploy-gcp.yml` | Deploy GCP (referencia canónica) |
| `.github/workflows/backend-ci.yml` / `quality.yml` | CI (Postgres ephemeral) |
| `docker-compose.dev.yml` / `.prod` / `.qa` | Topología local / Compose |
| `Makefile` | Deploy GCP manual (via stale, alineado con el workflow) |
| `docs/DEPLOYMENT_GCP.md` | SOP de infraestructura (SAs, Secret Manager, IAM) |
| `deploy-infrastructure.sh` | Cloud Tasks / Pub/Sub / Scheduler (no SQL) |
| `.dockerignore` | Exclusión de `.env*` del build context |

**Versionado:** Prisma `5.22.0` (CLI y cliente, pinned en el workspace; `backend-ci.yml` verifica que exista un solo specifier).

---

## 1. Estrategia de Cadena de Conexión

### 1.1 Cómo se construye y gestiona `DATABASE_URL`

Hay **dos caminos** para llegar a la URL, y son mutuamente excluyentes según el entorno:

1. **`DATABASE_URL` directa** — usada por Prisma en `schema.prisma` (`url = env("DATABASE_URL")`) y por la app cuando no existen las variables `CLOUDSQL_*`.
2. **URL reconstruida por la app en runtime** — `resolveDatasourceUrl()` (`backend/src/database/datasource-url.ts:31`) ignora `DATABASE_URL` y construye una URL de socket cuando `CLOUDSQL_INSTANCE_CONNECTION_NAME`, `CLOUDSQL_DB_USER`, `CLOUDSQL_DB_PASS` y `CLOUDSQL_DB_NAME` están todas presentes:

```ts
// backend/src/database/datasource-url.ts:41
`postgresql://${user}:${pass}@localhost/${name}?host=/cloudsql/${instance}&connection_limit=${limit}${pgbouncer}`
```

Reglas del resolver:

- Si faltan las cuatro `CLOUDSQL_*` → `return env.DATABASE_URL` (caso local/Compose/CI).
- `connection_limit` se resuelve con `prismaConnectionLimit()` (`datasource-url.ts:16`):
  `PRISMA_CONNECTION_LIMIT` explícito **gana**; si no, `10` para la API y `8` para el worker con `WORKERS_ENABLED=true` (`datasource-url.ts:4-7`).
- `CLOUDSQL_USE_PGBOUNCER=true` solo añade `&pgbouncer=true` a la URL; **no** crea ni enruta a un pooler real (no está activo en producción).
- Las `CLOUDSQL_*` se leen por `process.env` directamente y **no** pasan por el schema Zod (`env.config.ts`); `DATABASE_URL` sí es validada como obligatoria por Zod (`env.config.ts:56`).
- `prismaClientOptions()` (`prisma-client-options.ts:6`) inyecta esa URL como `datasources.db.url` en el `PrismaClient` singleton (`prisma.ts:17`) y en `PrismaService`.

### 1.2 Topología local (Docker Compose) vs producción (GCP)

| | **Local / Compose** | **Producción GCP (Cloud Run)** |
| --- | --- | --- |
| Motor | `postgres:16-alpine` (contenedor) | Cloud SQL PostgreSQL 16 gestionado |
| Host | `postgres` (nombre de servicio en la red de compose) o `localhost` en CI | `localhost` (socket del sidecar de Cloud SQL) |
| Puerto | `5432` | socket Unix, sin puerto TCP |
| Forma de la URL | `postgresql://voz:secret@postgres:5432/vozcuidadana` | vía `CLOUDSQL_*` (socket): `postgresql://<user>:<pass>@localhost/<db>?host=/cloudsql/<PROJECT>:us-central1:voz-ciudadana&connection_limit=N` |
| Origen de credenciales | `.env` / `backend/.env` (opcionales) o defaults del compose | Secret Manager (`DB_USER`, `DB_PASS`, `DB_NAME`, `INSTANCE_CONNECTION_NAME`, `DATABASE_URL`) |
| Quién resuelve la URL | `resolveDatasourceUrl()` cae a `env.DATABASE_URL` | `resolveDatasourceUrl()` reconstruye desde `CLOUDSQL_*` |
| Migraciones | servicio `migrator` (`prisma migrate deploy`) | Cloud Run Job `voz-migrator` (`voz-prod-migrate.sh`) con `DATABASE_URL` directamente (Prisma CLI lee `env("DATABASE_URL")` del schema) |
| Límite de pool | sin `PRISMA_CONNECTION_LIMIT` → default de código (api 10, worker 8) | explícito: API `5`, worker `2`, relay `2` (§3.1) |

**Detalle clave:** el Secret `DATABASE_URL` de GCP guarda la forma `@localhost/` con `connection_limit=1`, obligatoria para la CLI de Prisma (`docs/DEPLOYMENT_GCP.md:749-755`). En los containers de la aplicación `DATABASE_URL` se monta **pero queda sin efecto** para Prisma Client (lo reemplaza `resolveDatasourceUrl`); sigue siendo la fuente de verdad para el migrador/seeds, que usan la CLI.

Los archivos `.env` quedan fuera del build de imágenes (`.dockerignore:20-22` excluye `**/.env*` salvo `.env.example`). Compose los carga opcionalmente (`required: false` en `env_file`); los defaults del stack son `voz`/`secret`/`vozcuidadana`.

---

## 2. Redes y Seguridad en GCP

### 2.1 Mecanismo exacto Cloud Run → Cloud SQL

**Se usa el Cloud SQL Auth Proxy embebido (sockets Unix), NO IP privada a través del VPC Connector.**

- Servicios Cloud Run: `--add-cloudsql-instances="$INST_CN"` (`deploy-gcp.yml`, pasos *Deploy voz-api* y *Deploy voz-worker*). Cloud Run inyecta un sidecar que expone el socket Unix en `/cloudsql/<PROJECT>:us-central1:voz-ciudadana`, y la URL reconstruida apunta ahí (`host=/cloudsql/...`).
- Jobs: `--set-cloudsql-instances="$INST_CN"` (`deploy-gcp.yml`, paso *Create/update migrator job*; `Makefile:294`). No se intercambian los flags (`docs/DEPLOYMENT_GCP.md:757-760`).
- `gcloud` build `INST_CN = ${GCP_PROJECT_ID}:${GCP_REGION}:${DB_INSTANCE}` (workflow `env: GCP_REGION=us-central1, DB_INSTANCE=voz-ciudadana`). No existe VPC connector: el egress no SQL sale por la ruta pública por defecto de Cloud Run.

**VPC Connector y Memorystore:** el Serverless VPC Access Connector (`voz-connector`) y Memorystore for Redis **fueron removidos de la topología**; no hay `--vpc-connector` ni `--vpc-egress` en ningún deploy. Como `gcloud run deploy` **hereda la configuración de la revisión anterior**, cada deploy declara además `--clear-vpc-connector` para evacuar cualquier referencia residual al conector borrado en servicios desplegados mientras la topología aún era privada (fallaría con *"VPC connector ... does not exist"* al crear la revisión). La instancia Cloud SQL conserva IP pública pero **sin redes autorizadas** (`--assign-ip`, `--ssl-mode=ALLOW_UNENCRYPTED_AND_ENCRYPTED`); el único camino de entrada de la app es el socket del Cloud SQL Auth Proxy embebido. El frontend (`voz-frontend`) no tiene `--add-cloudsql-instances`: **nunca toca la base**.

**Resumen del camino de datos:**
`Prisma Client → TCP localhost → socket /cloudsql/<conn> → sidecar (Auth Proxy) → Cloud SQL (IP pública, TLS)`. El tráfico dentro del sandbox de Cloud Run es local; el sidecar termina la conexión segura hacia la instancia.

### 2.2 Resolución de credenciales (Secret Manager)

| Momento | Mecanismo |
| --- | --- |
| **Deploy (GitHub Actions)** | Autenticación con WIF: `google-github-actions/auth@v3` + `workload_identity_provider` + `service_account=$GH_SA_CICD` (`deploy-gcp.yml`, paso *auth*). `gcloud run deploy --set-secrets="VAR=SECRET_NAME:latest"` crea **referencias a secretos**; Cloud Run las materializa al crear la revisión. Los valores reales nunca viven en GitHub. |
| **Runtime** | El container recibe las variables como env: `DATABASE_URL, CLOUDSQL_DB_USER, CLOUDSQL_DB_PASS, CLOUDSQL_DB_NAME, CLOUDSQL_INSTANCE_CONNECTION_NAME` + JWT/WhatsApp/IA/etc. (`deploy-gcp.yml`, pasos *Deploy voz-api* y *Deploy voz-worker*). `resolveDatasourceUrl()` ensambla la URL de socket con esos valores en el arranque. |
| **Migrador / seeds** | Jobs con `--set-secrets="DATABASE_URL=DATABASE_URL:latest,..."` y `--set-cloudsql-instances` (`deploy-gcp.yml`, paso *Create/update migrator job*; `Makefile:294-295`). La CLI de Prisma consume `DATABASE_URL` (socket URL). |

El accesso a cada secreto es por binding granular: `roles/secretmanager.secretAccessor` otorgado a la **SA runtime** y a la **SA deploy** por secreto (`docs/DEPLOYMENT_GCP.md:880-896`). Los secretos DB: `DATABASE_URL, DB_USER, DB_PASS, DB_NAME, INSTANCE_CONNECTION_NAME` (`DEPLOYMENT_GCP.md:800-826`).

**Implicación operativa:** como el runtime reconstruye la URL desde `DB_USER`/`DB_PASS`, rotar `DB_PASS` en Secret Manager actualiza los servicios en el próximo deploy **sin** reescribir `DATABASE_URL`; pero el **migrador/cli lee `DATABASE_URL` directamente**, por lo que rotaciones deben mantener `DB_PASS` y `DATABASE_URL` coherentes simultáneamente.

---

## 3. Arquitectura de Conexiones, Escalado e Infraestructura

### 3.1 Configuración vigente por servicio

El pool de Prisma es **por proceso**, es decir por instancia de Cloud Run. `concurrency` y `timeout` **no** multiplican conexiones: un contenedor con `concurrency=80` y `connection_limit=5` abre como máximo 5 conexiones y las multiplexa entre requests. Lo que sí multiplica es el **número de instancias**.

| Servicio | `PRISMA_CONNECTION_LIMIT` | `max-instances` | Peor caso | Fuente de verdad |
| --- | --- | --- | --- | --- |
| `voz-api` | **5** | **5** | 25 | `deploy-gcp.yml` env `DB_CONNECTION_LIMIT` / `DB_MAX_INSTANCES` |
| `voz-worker` | **2** | **5** | 10 | `deploy-gcp.yml` env `DB_WORKER_CONNECTION_LIMIT` / `DB_MAX_INSTANCES` |
| `voz-realtime-relay` | **2** | **2** | 4 | `deploy-gcp.yml` env `DB_RELAY_CONNECTION_LIMIT` / `DB_RELAY_MAX_INSTANCES` |
| `voz-migrator` / seeds (Jobs) | — (`connection_limit=1` del Secret) | 1 task | 1 | `deploy-gcp.yml`, paso *Create/update migrator job* |
| `voz-frontend` | — | 10 | 0 | Sin `--add-cloudsql-instances`: nunca toca la base |
| **Total peor caso** | | | **40** | |

Reglas del pool:

- `PRISMA_CONNECTION_LIMIT` explícito **gana**; si se omite, el código cae a `10` (API) u `8` (worker con `WORKERS_ENABLED=true`) (`datasource-url.ts:4-7`). **Por eso el workflow siempre lo declara**: un deploy que lo pierda resucita el default y con él el problema original.
- Rango validado por Zod: `PRISMA_CONNECTION_LIMIT` ∈ [1, 40] (`env.config.ts:74`). Un valor fuera de rango aborta el arranque.
- El valor solo se aplica cuando las cuatro `CLOUDSQL_*` están presentes (ver §1.1); en local/Compose se usa `DATABASE_URL` tal cual.
- `--concurrency` no protege al pool: 80 requests concurrentes sobre `connection_limit=5` son 75 requests esperando una conexión libre. Si la latencia importa, la palanca es subir el pool **y** el tier de la base a la vez.

### 3.2 Regla de oro

> **No aumentar `--max-instances` ni `PRISMA_CONNECTION_LIMIT` sin haber escalado antes la memoria/tier de Cloud SQL.**

El presupuesto se calcula sobre **todos** los clientes, no solo sobre la API:

```text
conexiones_peor_caso = Σ_todos_los_clientes ( max_instances_i × connection_limit_i )
                     + conexiones_de_jobs        (1 por job migrator/seeds)
                     + reserva_superusuario      (3 por defecto en PostgreSQL)

objetivo: conexiones_peor_caso ≤ 60 % del max_connections medido de la instancia
          (el 40 % restante cubre Cloud SQL Studio, psql del operador, el solapamiento
           de revisiones durante el rollout y picos administrativos)
```

`max_connections` **no** es una constante de GCP: depende del tier (*más memoria → más conexiones*) y de la instancia. Consúltalo siempre, no lo deduzcas del nombre del tier:

```bash
gcloud sql instances describe "$DB_INSTANCE" \
  --format='value(settings.tier, settings.tier)' --project="$PROJECT_ID"

# Techo real (contra la base):
#   SELECT * FROM pg_settings WHERE name = 'max_connections';
```

**Rollout = doble presupuesto transitorio.** Un `gcloud run deploy` crea una revisión nueva mientras la anterior sigue sirviendo tráfico. Durante esa ventana conviven ambas, así que el pico transitorio es ≈ `2 × conexiones_peor_caso`. Es el momento más frágil del ciclo y la razón por la que el objetivo es 60 % y no 90 %.

### 3.3 Matemática frente a la capacidad real

Peor caso con la configuración de §3.1:

```text
voz-api     =  5 × 5 =  25
voz-worker  =  5 × 2 =  10
voz-relay   =  2 × 2 =   4
migrator    =            1
────────────────────────────
C_total     =           40    (+3 reservados para superusuario = 43)
```

Esta cifra reemplaza al cálculo histórico (170 conexiones con `api 1×10` + `worker 8×20`), que **subestimaba** el consumo real al ignorar que el worker pesaba 8×20.

Con un tier `db-g1-small` (1 vCPU compartida, 1.7 GB) el techo ronda las **50-60 conexiones**: 43 dejan **~7-17 conexiones de aire** en régimen estable —una mejora real sobre las 58 anteriores—, pero la cifra sigue por encima del objetivo del 60 % (§3.2) y el solapamiento de revisiones durante un rollout puede acercar el pico al doble del pool de la API (min 1 ⇒ +10 conexiones). El riesgo bajó, no desapareció: el destino productivo sigue siendo un tier de núcleo dedicado y `db-g1-small` es el puente. Si vuelve a apretar, mueve **una** palanca:

1. **Subir el tier** de Cloud SQL, que es la palanca que realmente mueve el techo.
2. **Bajar `max-instances`** de los servicios backend (menos réplicas = menos pools).

> ⚠️ GCP documenta que `db-f1-micro` y `db-g1-small` **no están cubiertos por el SLA de Cloud SQL** y están pensados para desarrollo/pruebas: *"don't use them for production instances"* ([Cloud SQL instance settings](https://cloud.google.com/sql/docs/postgres/instance-settings)). `db-g1-small` es un puente válido para dejar de caer, pero el objetivo productivo es un tier de núcleo dedicado (`db-custom-1-3840` ≈ 100 conexiones, `db-custom-2-7680` cientos, según memoria).

> Nota sobre el límite de Cloud Run: el *built-in Cloud SQL connection* limita a **100 conexiones por instancia de contenedor**. Ese tope no nos protege — el dolor llega mucho antes, en el `max_connections` del tier.

### 3.4 Variables de entorno de la base de datos

| Variable | Dónde vive | Qué controla | Valor vigente |
| --- | --- | --- | --- |
| `DATABASE_URL` | Secret Manager (`DATABASE_URL`) | Fuente de Prisma **CLI** (migrator/seeds) y fallback local cuando faltan las `CLOUDSQL_*`. Forma obligatoria `...@localhost/<db>?host=/cloudsql/<conn>&connection_limit=1`. | `connection_limit=1` |
| `CLOUDSQL_DB_USER`, `CLOUDSQL_DB_PASS`, `CLOUDSQL_DB_NAME`, `CLOUDSQL_INSTANCE_CONNECTION_NAME` | Secret Manager (`DB_USER`, `DB_PASS`, `DB_NAME`, `INSTANCE_CONNECTION_NAME`) | Componentes con los que `resolveDatasourceUrl()` reconstruye la URL en runtime. Su presencia **activa** el camino del socket e invalida el `connection_limit` del Secret. | prod |
| `PRISMA_CONNECTION_LIMIT` | env directo en Cloud Run (no es secreto) | Tamaño del pool de Prisma de ese contenedor. Rango 1-40. | API `5`, worker `2`, relay `2` |
| `CLOUDSQL_USE_PGBOUNCER` | env directo | Solo añade `&pgbouncer=true` a la URL. **No** crea ni enruta a un pooler; no hay Managed Connection Pooling habilitado. | ausente |

Regla práctica: `DATABASE_URL` la consume el CLI de Prisma (1 conexión, jobs); `PRISMA_CONNECTION_LIMIT` lo consume cada contenedor de la aplicación. Son **dos presupuestos distintos**; no los mezcles al sumar.

### 3.5 Migraciones sin consumir el pool de los contenedores

`prisma migrate deploy` corre en un **Cloud Run Job independiente** (`voz-migrator`), nunca dentro de `voz-api`/`voz-worker`:

- `--tasks=1 --max-retries=0` → una sola conexión, sin paralelismo.
- Usa el Secret `DATABASE_URL` (`connection_limit=1`), no las `CLOUDSQL_*`.
- El job se ejecuta **antes** de desplegar worker y API (el workflow declara `migrate` como dependencia de ambos) y con `--wait`: si falla, el deploy no avanza.
- Prisma toma un advisory lock; un `ALTER TABLE` puede bloquear escrituras. Programa releases y migraciones grandes fuera del pico de mensajería: el margen de §3.3 es lo que evita el `FATAL: remaining connection slots are reserved...` durante la ventana de DDL.
- **Nunca** ejecutes `migrate deploy` ni seeds desde un contenedor de aplicación: cada réplica abriría su propia conexión administrativa fuera del presupuesto.

---

## 4. Requisitos de Infraestructura (IAM)

Identidades que **participan en la conexión a Cloud SQL** y su IAM. Los roles se otorgan a nivel proyecto o recurso según `docs/DEPLOYMENT_GCP.md` sección 3 y 6.

| Identidad | Se usa en | Roles requeridos para la conexión/servicio | Fuente |
| --- | --- | --- | --- |
| **`voz-ciudadana-run-sa@<PROJECT>.iam.gserviceaccount.com`** (SA runtime) | `voz-api`, `voz-worker`, Job `voz-migrator`, Jobs seed | `roles/cloudsql.client` (necesario para conectar vía socket del Auth Proxy), `roles/secretmanager.secretAccessor` (por secreto DB y resto), además de `roles/documentai.apiUser`, `roles/cloudtasks.enqueuer`, `roles/pubsub.publisher` | `deploy-gcp.yml` env `SA_RUN`; `DEPLOYMENT_GCP.md:587-595, 880-896` |
| **`voz-ciudadana-cicd-sa@<PROJECT>.iam.gserviceaccount.com`** (SA deploy, vía WIF) | GitHub Actions (despliega servicios/jobs) | `roles/run.admin`, `roles/artifactregistry.writer`, `roles/iam.serviceAccountUser` (sobre la SA runtime, para `--service-account`), `roles/iam.serviceAccountTokenCreator` (self, smoke worker), `roles/secretmanager.secretAccessor` (valida referencias en deploy), `roles/pubsub.viewer` | `DEPLOYMENT_GCP.md:587-595, 880-896`; deploy-gcp.yml secrets `WIF_PROVIDER`, `GH_SA_CICD` |

Identidades que **no** intervienen en Cloud SQL (solo invocación de servicios/pub-sub): `cloud-tasks-invoker` (OIDC → `voz-worker`), `pubsub-push-invoker` (push a `/pubsub/*`), service agents de Cloud Tasks/Scheduler/Pub/Sub (creados en `deploy-infrastructure.sh:119-184`). El actual owner del proyecto asigna un único runtime SA compartido (`deploy-infrastructure.sh:8` por defecto, `API_RUNTIME_SERVICE_ACCOUNT == WORKER_RUNTIME_SERVICE_ACCOUNT`).

---

## Anexo A. Diagrama resumido

```text
                    ┌────────────────────────── GCP us-central1 ──────────────────────────┐
GitHub Actions ─WIF─► voz-ciudadana-cicd-sa          Secret Manager
   │ deploy         │  (run.admin + SAUsr)           DATABASE_URL / DB_USER / DB_PASS /
   │                │                                DB_NAME / INSTANCE_CONNECTION_NAME
   ▼                │                                        │ (secretAccessor: runtime SA)
Artifact Registry   │                                        ▼
   voz-api / voz-worker / voz-tools ─────────────────► Cloud Run  (revisión materializa secrets)
                                             │             │
                                             │  --add-cloudsql-instances  (socket)
                                             │             ▼
                                             │   /cloudsql/<PROJECT>:us-central1:voz-ciudadana
│             │  Cloud SQL Auth Proxy embebido
                                              │             ▼
                                              │   Cloud SQL PostgreSQL 16 (IP pública, sin authorized networks)
```

## Anexo B. Referencias rápidas en código

- Constructor de URL: `backend/src/database/datasource-url.ts:31-45`
- Resolución del límite de pool: `backend/src/database/datasource-url.ts:16-23`
- Inyección de URL al cliente: `backend/src/database/prisma-client-options.ts:10`
- Validación de env: `backend/src/config/env.config.ts:56,61-67`
- Datasource del schema: `backend/prisma/schema.prisma:5-8`
- Deploy api/worker/job: `.github/workflows/deploy-gcp.yml` (pasos *Deploy voz-api*, *Deploy voz-worker*, *Deploy voz-realtime-relay*, *Create/update migrator job*)
- SOP de infra IAM/SQL/secrets: `docs/DEPLOYMENT_GCP.md` secciones 3, 5, 6, 11