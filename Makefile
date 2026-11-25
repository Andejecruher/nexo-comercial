COMPOSE_DEV := docker compose -f docker-compose.dev.yml
COMPOSE_PROD := docker compose -f docker-compose.prod.yml
COMPOSE_QA := docker compose -f docker-compose.qa.yml

.PHONY: help \
	stack-dev-up stack-dev-down \
	infra-up infra-down \
	api-up worker-up frontend-up \
	logs logs-api logs-worker logs-frontend logs-db \
	migrate-dev migrate-prod \
	smoke-docker \
	smoke validate \
	lint typecheck test \
	dev-up dev-up-fast dev-down dev-logs dev-migrate dev-watch \
	dev-up-first prod-up-first \
	prod-up prod-down prod-logs prod-migrate \
	prod-build prod-deploy \
	qa-up qa-down qa-logs qa-build qa-migrate qa-deploy \
	test-docker test-docker-fast docker-reset-dev-volumes \
	dev-backend-rebuild dev-db-seed dev-db-reset-seed

help: ## Muestra comandos disponibles
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  %-24s %s\n", $$1, $$2}'

stack-dev-up: ## stack dev up/down: levanta stack dev (reconstruye imagenes con cache)
	$(COMPOSE_DEV) up --build -d

stack-dev-down: ## stack dev up/down: baja stack completo de desarrollo
	$(COMPOSE_DEV) down

infra-up: ## Levanta solo infraestructura (postgres)
	$(COMPOSE_DEV) up -d postgres

infra-down: ## Baja solo infraestructura (postgres)
	$(COMPOSE_DEV) stop postgres

api-up: ## Levanta solo API runtime
	$(COMPOSE_DEV) up -d api

worker-up: ## Levanta solo Worker runtime
	$(COMPOSE_DEV) up -d worker

frontend-up: ## Levanta solo Frontend runtime
	$(COMPOSE_DEV) up -d frontend

logs: ## Logs por servicio: make logs SERVICE=api
	@if [ -z "$(SERVICE)" ]; then echo "Uso: make logs SERVICE=<servicio>"; exit 1; fi
	$(COMPOSE_DEV) logs -f --tail=200 $(SERVICE)

logs-api: ## Logs API
	$(COMPOSE_DEV) logs -f --tail=200 api

logs-worker: ## Logs Worker
	$(COMPOSE_DEV) logs -f --tail=200 worker

logs-frontend: ## Logs Frontend
	$(COMPOSE_DEV) logs -f --tail=200 frontend

logs-db: ## Logs Postgres
	$(COMPOSE_DEV) logs -f --tail=200 postgres

migrate-dev: ## Ejecuta prisma migrate deploy (dev)
	$(COMPOSE_DEV) run --rm migrator

migrate-prod: ## Ejecuta prisma migrate deploy (prod)
	$(COMPOSE_PROD) run --rm migrator

lint: ## Ejecuta lint backend + frontend
	pnpm lint

typecheck: ## Ejecuta typecheck backend + frontend
	pnpm typecheck

test: ## Ejecuta tests backend
	pnpm test

smoke-docker: ## Smoke docker: API/Worker/Frontend saludables
	$(COMPOSE_DEV) up -d postgres migrator api worker frontend
	$(COMPOSE_DEV) exec -T api wget -q -O - http://127.0.0.1:8000/ready
	$(COMPOSE_DEV) exec -T worker wget -q -O - http://127.0.0.1:8000/healthz
	@for i in 1 2 3 4 5 6 7 8 9 10 11 12; do \
		$(COMPOSE_DEV) exec -T frontend wget -q -O /dev/null http://127.0.0.1:3000/ && break; \
		echo "[smoke-docker] esperando frontend... ($$i/12)"; \
		sleep 2; \
		if [ $$i -eq 12 ]; then echo "[smoke-docker] frontend no respondio a tiempo"; exit 1; fi; \
	done

smoke: ## Smoke sin build: valida compose (dev/prod/qa) y Caddyfile
	$(COMPOSE_DEV) config -q
	POSTGRES_PASSWORD=smoke DATABASE_URL=postgresql://nexo:smoke@postgres:5432/nexocomercial $(COMPOSE_PROD) config -q
	POSTGRES_PASSWORD=smoke DATABASE_URL=postgresql://nexo:smoke@postgres:5432/nexocomercial_qa $(COMPOSE_QA) config -q
	test -f deploy/Caddyfile

validate: lint typecheck test smoke ## Validaciones completas sin build

# Alias para compatibilidad previa
dev-up: stack-dev-up ## Alias (up --build: incorpora migraciones, lockfile y Dockerfiles)
dev-up-fast: ## Levanta stack dev sin reconstruir imagenes (rapido)
	$(COMPOSE_DEV) up -d
dev-up-first: ## Levanta stack dev con build inicial
	$(COMPOSE_DEV) up --build -d
dev-watch: ## Levanta stack dev y reconstruye ante cambios estructurales (lockfile/Dockerfile/package.json)
	$(COMPOSE_DEV) up --build --watch
dev-down: stack-dev-down ## Alias
dev-logs: ## Alias logs de todo el stack dev
	$(COMPOSE_DEV) logs -f --tail=200
dev-migrate: migrate-dev ## Alias
prod-up: ## Levanta stack prod (incluye Caddy)
	$(COMPOSE_PROD) up -d
prod-up-first: ## Levanta stack prod con build inicial
	$(COMPOSE_PROD) up --build -d
prod-down: ## Baja stack prod
	$(COMPOSE_PROD) down
prod-logs: ## Logs stack prod
	$(COMPOSE_PROD) logs -f --tail=200
prod-migrate: migrate-prod ## Alias

prod-build: ## Release prod: construye todas las imagenes (backend + frontend)
	$(COMPOSE_PROD) build

prod-deploy: prod-build ## Release prod: build -> migrator (misma version) -> runtimes sin rebuild
	$(COMPOSE_PROD) run --rm migrator
	$(COMPOSE_PROD) up -d --no-build api worker frontend caddy

# ── QA (aislado, production-like) ───────────────────────────────────────────
qa-build: ## Construye imagenes del stack QA (backend + frontend)
	$(COMPOSE_QA) build

qa-migrate: ## Ejecuta migrator QA con la imagen recien construida
	$(COMPOSE_QA) run --rm migrator

qa-deploy: qa-build ## Release QA: build -> migrator (misma version) -> runtimes sin rebuild
	$(COMPOSE_QA) run --rm migrator
	$(COMPOSE_QA) up -d --no-build api worker frontend caddy

qa-up: ## Levanta stack QA (build incluido)
	$(COMPOSE_QA) up --build -d

qa-down: ## Baja stack QA
	$(COMPOSE_QA) down

qa-logs: ## Logs stack QA
	$(COMPOSE_QA) logs -f --tail=200

test-docker: ## Ejecuta tests backend en Docker
	$(COMPOSE_DEV) run --rm api pnpm test

test-docker-fast: ## Ejecuta tests backend en Docker sin rebuild manual
	$(COMPOSE_DEV) run --rm api pnpm test

docker-reset-dev-volumes: ## Elimina volumenes del stack dev
	$(COMPOSE_DEV) down -v --remove-orphans

dev-backend-rebuild: ## Rebuild de imagenes backend (api/worker/migrator) tras cambiar Dockerfile o lockfile
	$(COMPOSE_DEV) build api worker migrator

dev-db-seed: ## Ejecuta seeds de desarrollo (base + IA) sin resetear volumenes
	@if [ "$$NODE_ENV" = "production" ]; then \
		echo "[dev-db-seed] ERROR: comando bloqueado en produccion."; \
		exit 1; \
	fi
	$(COMPOSE_DEV) up -d postgres
	$(COMPOSE_DEV) run --rm migrator
	$(COMPOSE_DEV) run --rm api pnpm run prisma:seed:all

dev-db-reset-seed: ## Reset destructivo de DB dev + migraciones + seeds (base + IA)
	@if [ "$$NODE_ENV" = "production" ]; then \
		echo "[dev-db-reset-seed] ERROR: comando bloqueado en produccion."; \
		exit 1; \
	fi
	@printf "Este comando eliminara los volumenes de DB de desarrollo. Escribi 'reset' para continuar: "; \
	read -r confirm; \
	if [ "$$confirm" != "reset" ]; then \
		echo "[dev-db-reset-seed] Cancelado."; \
		exit 1; \
	fi
	$(COMPOSE_DEV) down -v --remove-orphans
	$(COMPOSE_DEV) up -d postgres
	$(COMPOSE_DEV) run --rm migrator
	$(COMPOSE_DEV) run --rm api pnpm run prisma:seed:all
	@echo "[dev-db-reset-seed] OK: DB reiniciada y seeds aplicados."

# ── GCP / Cloud Run ─────────────────────────────────────────────────────────
# Deploy objetivo de la migracion Railway -> GCP. Ver docs/DEPLOYMENT_GCP.md.
# Requisito: gcloud auth + config set project. Ajusta GCP_REGION/AR_REPO/DB_INSTANCE abajo.
GCP_PROJECT  := $(shell gcloud config get-value project 2>/dev/null)
GCP_REGION   := us-central1
AR_REPO      := nexo-comercial
AR_HOST      := $(GCP_REGION)-docker.pkg.dev
DB_INSTANCE  := nexo-comercial
INSTANCE_CN  := $(GCP_PROJECT):$(GCP_REGION):$(DB_INSTANCE)
SVC_API      := nexo-api
SVC_WORKER   := nexo-worker
SVC_FRONTEND := nexo-frontend
JOB_MIGRATOR := nexo-migrator
JOB_SEEDER_CORE := nexo-seeder-core
JOB_SEEDER_DEV  := nexo-seeder-dev
JOB_WIPE     := nexo-db-wipe
SA_RUN       := nexo-comercial-run-sa

GIT_SHA := $(shell git rev-parse --short HEAD 2>/dev/null || echo local)
IMG_API      := $(AR_HOST)/$(GCP_PROJECT)/$(AR_REPO)/nexo-api:sha-$(GIT_SHA)
IMG_WORKER   := $(AR_HOST)/$(GCP_PROJECT)/$(AR_REPO)/nexo-worker:sha-$(GIT_SHA)
IMG_TOOLS    := $(AR_HOST)/$(GCP_PROJECT)/$(AR_REPO)/nexo-tools:sha-$(GIT_SHA)
IMG_FRONTEND := $(AR_HOST)/$(GCP_PROJECT)/$(AR_REPO)/nexo-frontend:sha-$(GIT_SHA)

# ── Config NO-secreta (env vars en Cloud Run). Sobreescribible desde shell: ──
#   export GCP_API_BASE_URL=https://api.tu-dominio.com \
#          GCP_WORKER_SERVICE_URL=https://nexo-worker-xxxx.a.run.app
#   make gcp-deploy-backend
# Los defaults deben coincidir con las GitHub Variables que usa
# docs/deploy/deploy-gcp.yml. BASE_URL y FRONTEND_URL son requiredString
# en env.config.ts: sin ellos el API crashea al boot. CORS_ORIGIN = FRONTEND_URL.
GCP_API_BASE_URL ?= https://api.nexo-comercial.example
GCP_WS_URL       ?= $(GCP_API_BASE_URL)
GCP_FRONTEND_URL ?= https://nexo-comercial.example
GCP_CORS_ORIGIN  ?= $(GCP_FRONTEND_URL)
# OCR (Document AI): DOCUMENT_AI_LOCATION no es secreto; el processor id viaja
# desde Secret Manager (DOCUMENT_AI_PROCESSOR_ID). GOOGLE_CLOUD_PROJECT_ID suele
# ser = GCP_PROJECT.
GCP_DOC_AI_LOC    ?= us
# Cloud Tasks: audiencia OIDC = origen de nexo-worker; la SA la crea
# deploy-infrastructure.sh. Deben coincidir con las GitHub Variables.
GCP_TASKS_QUEUE_NAME            ?= background-tasks
GCP_TASKS_SERVICE_ACCOUNT_EMAIL ?= cloud-tasks-invoker@$(GCP_PROJECT).iam.gserviceaccount.com
GCP_WORKER_SERVICE_URL          ?= https://nexo-worker.example.a.run.app
# SA que firma el OIDC de las push subscriptions de Pub/Sub. Debe coincidir con
# el push-auth-service-account de cada subscription (ver deploy-infrastructure.sh).
GCP_PUBSUB_PUSH_SERVICE_ACCOUNT_EMAIL ?= pubsub-push-invoker@$(GCP_PROJECT).iam.gserviceaccount.com

# Env vars comunes a nexo-api y nexo-worker (solo pares key=value; el flag
# --set-env-vars= lo agrega cada target al concatenar sus overrides).
# Espejo de las secciones `deploy-api` / `deploy-worker` del workflow.
GCP_API_ENV := NODE_ENV=production,BASE_URL=$(GCP_API_BASE_URL),FRONTEND_URL=$(GCP_FRONTEND_URL),CORS_ORIGIN=$(GCP_CORS_ORIGIN),GOOGLE_CLOUD_PROJECT_ID=$(GCP_PROJECT),DOCUMENT_AI_LOCATION=$(GCP_DOC_AI_LOC),ENABLE_XLSX_EXPORT=true,BACKGROUND_EXECUTION_BACKEND=cloud_tasks,GCP_PROJECT_ID=$(GCP_PROJECT),GCP_LOCATION=$(GCP_REGION),TASKS_QUEUE_NAME=$(GCP_TASKS_QUEUE_NAME),WORKER_SERVICE_URL=$(GCP_WORKER_SERVICE_URL),TASKS_SERVICE_ACCOUNT_EMAIL=$(GCP_TASKS_SERVICE_ACCOUNT_EMAIL),MAIL_PROVIDER=mailtrap,MAIL_FROM_NAME=Nexo Comercial,MAIL_PLATFORM_NAME=Nexo Comercial,MAIL_TIME_ZONE=America/Mexico_City,MAIL_SEND_TIMEOUT_MS=10000

# Secretos montados como env en Cloud Run (--set-secrets "VAR=secret:version").
# Lista espejo de docs/deploy/deploy-gcp.yml (deploy-api / deploy-worker).
GCP_SECRETS := \
  --set-secrets="DATABASE_URL=DATABASE_URL:latest" \
  --set-secrets="CLOUDSQL_DB_USER=DB_USER:latest" \
  --set-secrets="CLOUDSQL_DB_PASS=DB_PASS:latest" \
  --set-secrets="CLOUDSQL_DB_NAME=DB_NAME:latest" \
  --set-secrets="CLOUDSQL_INSTANCE_CONNECTION_NAME=INSTANCE_CONNECTION_NAME:latest" \
  --set-secrets="JWT_SECRET=JWT_SECRET:latest" \
  --set-secrets="JWT_REFRESH_SECRET=JWT_REFRESH_SECRET:latest" \
  --set-secrets="ENCRYPTION_KEY=ENCRYPTION_KEY:latest" \
  --set-secrets="WHATSAPP_VERIFY_TOKEN=WHATSAPP_VERIFY_TOKEN:latest" \
  --set-secrets="WHATSAPP_APP_ID=WHATSAPP_APP_ID:latest" \
  --set-secrets="WHATSAPP_APP_SECRET=WHATSAPP_APP_SECRET:latest" \
  --set-secrets="WHATSAPP_ACCESS_TOKEN=WHATSAPP_ACCESS_TOKEN:latest" \
  --set-secrets="WHATSAPP_PHONE_NUMBER_ID=WHATSAPP_PHONE_NUMBER_ID:latest" \
  --set-secrets="WHATSAPP_BUSINESS_ACCOUNT_ID=WHATSAPP_BUSINESS_ACCOUNT_ID:latest" \
  --set-secrets="MAILTRAP_API_TOKEN=MAILTRAP_API_TOKEN:latest" \
  --set-secrets="MAILTRAP_API_URL=MAILTRAP_API_URL:latest" \
  --set-secrets="MAIL_FROM_ADDRESS=MAIL_FROM_ADDRESS:latest" \
  --set-secrets="MAIL_REPLY_TO_ADDRESS=MAIL_REPLY_TO_ADDRESS:latest" \
  --set-secrets="MAIL_SUPPORT_EMAIL=MAIL_SUPPORT_EMAIL:latest" \
  --set-secrets="OPENAI_API_KEY=OPENAI_API_KEY:latest" \
  --set-secrets="NVIDIA_API_KEY=NVIDIA_API_KEY:latest" \
  --set-secrets="ANTHROPIC_API_KEY=ANTHROPIC_API_KEY:latest" \
  --set-secrets="GOOGLE_DRIVE_FOLDER_ID=GOOGLE_DRIVE_FOLDER_ID:latest" \
  --set-secrets="GOOGLE_OAUTH_CLIENT_ID=GOOGLE_OAUTH_CLIENT_ID:latest" \
  --set-secrets="GOOGLE_OAUTH_CLIENT_SECRET=GOOGLE_OAUTH_CLIENT_SECRET:latest" \
  --set-secrets="GOOGLE_DRIVE_REFRESH_TOKEN=GOOGLE_DRIVE_REFRESH_TOKEN:latest" \
  --set-secrets="DOCUMENT_AI_PROCESSOR_ID=DOCUMENT_AI_PROCESSOR_ID:latest"

# Secrets for audited GCP seed jobs (NODE_ENV=staging). Never prisma:seed:all.
GCP_SEED_SECRETS := DATABASE_URL=DATABASE_URL:latest,ENCRYPTION_KEY=ENCRYPTION_KEY:latest,JWT_SECRET=JWT_SECRET:latest,JWT_REFRESH_SECRET=JWT_REFRESH_SECRET:latest,WHATSAPP_VERIFY_TOKEN=WHATSAPP_VERIFY_TOKEN:latest,WHATSAPP_APP_ID=WHATSAPP_APP_ID:latest,WHATSAPP_APP_SECRET=WHATSAPP_APP_SECRET:latest,WHATSAPP_ACCESS_TOKEN=WHATSAPP_ACCESS_TOKEN:latest,WHATSAPP_PHONE_NUMBER_ID=WHATSAPP_PHONE_NUMBER_ID:latest,WHATSAPP_BUSINESS_ACCOUNT_ID=WHATSAPP_BUSINESS_ACCOUNT_ID:latest,SUPERADMIN_EMAIL=SUPERADMIN_EMAIL:latest,SUPERADMIN_PASSWORD=SUPERADMIN_PASSWORD:latest,SUPERADMIN_FULL_NAME=SUPERADMIN_FULL_NAME:latest

.PHONY: gcp-disabled gcp-build gcp-deploy-backend gcp-deploy-frontend \
	gcp-migrate gcp-seed gcp-seed-core gcp-seed-dev \
	gcp-db-reset-seed gcp-deploy-all gcp-logs gcp-status

# Parked until a GCP project exists. The recipes stay as the revive path.
GCP_DEPLOY_ENABLED ?= 0
gcp-disabled:
	@if [ "$(GCP_DEPLOY_ENABLED)" != "1" ]; then \
	  echo "GCP deploy is disabled for nexo-comercial. See docs/DEPLOYMENT_GCP.md"; \
	  exit 1; \
	fi

gcp-build gcp-migrate gcp-seed-core gcp-seed-dev gcp-seed gcp-db-reset-seed gcp-deploy-backend gcp-deploy-frontend gcp-deploy-all gcp-logs gcp-status: gcp-disabled

gcp-build: ## GCP: build + push de imagenes (api, worker, tools, frontend) a Artifact Registry
	docker buildx build -f backend/Dockerfile --target runner -t $(IMG_API) --push .
	docker buildx build -f backend/Dockerfile --target worker -t $(IMG_WORKER) --push .
	docker buildx build -f backend/Dockerfile --target tools  -t $(IMG_TOOLS) --push .
	docker buildx build -f frontend/Dockerfile --target prod \
	  --build-arg NEXT_PUBLIC_API_URL=$(GCP_API_BASE_URL) \
	  --build-arg NEXT_PUBLIC_WS_URL=$(GCP_WS_URL) \
	  -t $(IMG_FRONTEND) --push .
	@echo "[gcp-build] ok: api=$(IMG_API) worker=$(IMG_WORKER) tools=$(IMG_TOOLS) frontend=$(IMG_FRONTEND)"

gcp-migrate: ## GCP: ejecuta el Cloud Run Job de migraciones (prisma migrate deploy, never reset)
	gcloud run jobs deploy $(JOB_MIGRATOR) \
	  --image=$(IMG_TOOLS) \
	  --region=$(GCP_REGION) \
	  --tasks=1 \
	  --max-retries=0 \
	  --task-timeout=10m \
	  --command="/usr/local/bin/nexo-prod-migrate.sh" \
	  --args="" \
	  --set-env-vars="NODE_ENV=production" \
	  --set-cloudsql-instances=$(INSTANCE_CN) \
	  --set-secrets="DATABASE_URL=DATABASE_URL:latest,CLOUDSQL_DB_USER=DB_USER:latest,CLOUDSQL_DB_PASS=DB_PASS:latest,CLOUDSQL_DB_NAME=DB_NAME:latest,CLOUDSQL_INSTANCE_CONNECTION_NAME=INSTANCE_CONNECTION_NAME:latest" \
	  --service-account=$(SA_RUN)@$(GCP_PROJECT).iam.gserviceaccount.com
	gcloud run jobs execute $(JOB_MIGRATOR) --region $(GCP_REGION) --wait
	@echo "[gcp-migrate] migraciones aplicadas (o job ejecutado)"

# --command=pnpm replaces nexo-tools ENTRYPOINT (nexo-prod-migrate.sh). Without it
# the job would migrate or refuse seed args. See docs/DEPLOYMENT_GCP.md sec 11.
gcp-seed-core: ## GCP: seed core (roles, permissions, neighborhoods, departments)
	gcloud run jobs deploy $(JOB_SEEDER_CORE) \
	  --image=$(IMG_TOOLS) \
	  --region=$(GCP_REGION) \
	  --command=pnpm \
	  --args=run,prisma:seed:core \
	  --tasks=1 --parallelism=1 --max-retries=0 --task-timeout=30m \
	  --set-env-vars="NODE_ENV=staging,BASE_URL=$(GCP_API_BASE_URL)" \
	  --set-secrets="$(GCP_SEED_SECRETS)" \
	  --set-cloudsql-instances=$(INSTANCE_CN) \
	  --service-account=$(SA_RUN)@$(GCP_PROJECT).iam.gserviceaccount.com
	gcloud run jobs execute $(JOB_SEEDER_CORE) --region $(GCP_REGION) --wait

gcp-seed-dev: ## GCP: seed dev (superadmin + AI). Requires gcp-seed-core first
	gcloud run jobs deploy $(JOB_SEEDER_DEV) \
	  --image=$(IMG_TOOLS) \
	  --region=$(GCP_REGION) \
	  --command=pnpm \
	  --args=run,prisma:seed:dev \
	  --tasks=1 --parallelism=1 --max-retries=0 --task-timeout=30m \
	  --set-env-vars="NODE_ENV=staging,BASE_URL=$(GCP_API_BASE_URL)" \
	  --set-secrets="$(GCP_SEED_SECRETS)" \
	  --set-cloudsql-instances=$(INSTANCE_CN) \
	  --service-account=$(SA_RUN)@$(GCP_PROJECT).iam.gserviceaccount.com
	gcloud run jobs execute $(JOB_SEEDER_DEV) --region $(GCP_REGION) --wait

gcp-seed: gcp-seed-core gcp-seed-dev ## GCP: core then dev (never seed:all, never reset)

# Requiere roles/cloudsql.editor (o admin) sobre la instancia y actAs sobre la
# SA de runtime. El wipe usa un job de Cloud Run
# (nexo-db-wipe, imagen nexo-tools del HEAD local) que ejecuta
# `DROP SCHEMA public CASCADE; CREATE SCHEMA public;` via `prisma db execute`.
# A diferencia de `gcloud sql databases delete`, DROP SCHEMA no exige exclusividad
# y no falla por conexiones activas de nexo-api/nexo-worker: solo espera a que
# terminen las transacciones en curso. Luego redeployea y ejecuta gcp-migrate +
# gcp-seed con la imagen del HEAD local, de modo que los jobs no queden anclados
# a una imagen vieja (p.ej. una que aun exigia REDIS_URL).
gcp-db-reset-seed: ## GCP: reset destructivo de DB (wipe schema + migrator + seeds core/dev)
	@if [ "$$NODE_ENV" = "production" ]; then \
		echo "[gcp-db-reset-seed] ERROR: comando bloqueado en produccion."; \
		exit 1; \
	fi
	@printf "Esto borrara TODA la data de la instancia %s. Escribi 'reset' para continuar: " "$(DB_INSTANCE)"; \
	read -r confirm; \
	if [ "$$confirm" != "reset" ]; then \
		echo "[gcp-db-reset-seed] Cancelado."; \
		exit 1; \
	fi
	@echo "[gcp-db-reset-seed] Desplegando job de wipe $(JOB_WIPE)..."; \
	gcloud run jobs deploy $(JOB_WIPE) \
	  --image="$(IMG_TOOLS)" \
	  --region="$(GCP_REGION)" \
	  --command=/bin/sh \
	  --args=-c,"echo 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;' | pnpm exec prisma db execute --schema=./prisma/schema.prisma --stdin" \
	  --tasks=1 --max-retries=0 --task-timeout=10m \
	  --set-env-vars="NODE_ENV=production" \
	  --set-cloudsql-instances="$(INSTANCE_CN)" \
	  --set-secrets="DATABASE_URL=DATABASE_URL:latest" \
	  --service-account="$(SA_RUN)@$(GCP_PROJECT).iam.gserviceaccount.com"; \
	echo "[gcp-db-reset-seed] Ejecutando wipe de schema..."; \
	gcloud run jobs execute $(JOB_WIPE) --region="$(GCP_REGION)" --wait || exit 1; \
	echo "[gcp-db-reset-seed] Migraciones (redeploy + execute nexo-migrator)..."; \
	$(MAKE) gcp-migrate || exit 1; \
	echo "[gcp-db-reset-seed] Seeds core -> dev (redeploy + execute)..."; \
	$(MAKE) gcp-seed || exit 1
	@echo "[gcp-db-reset-seed] OK: DB reiniciada y seeds aplicados."

gcp-deploy-backend: ## GCP: despliega nexo-api + nexo-worker a Cloud Run
	gcloud run deploy $(SVC_API) \
	  --image=$(IMG_API) --region=$(GCP_REGION) --allow-unauthenticated \
	  --service-account=$(SA_RUN)@$(GCP_PROJECT).iam.gserviceaccount.com \
	  --port=8080 --min-instances=1 --max-instances=5 \
	  --clear-vpc-connector \
	  --concurrency=80 --timeout=3600 \
	  --cpu=1 --memory=1Gi --cpu-boost --cpu-throttling \
	  --set-env-vars="$(GCP_API_ENV),WORKERS_ENABLED=false,WS_ENABLED=true,REALTIME_DURABLE_ENABLED=true,PUBSUB_PUSH_AUDIENCE=$(GCP_API_BASE_URL),PUBSUB_PUSH_SERVICE_ACCOUNT_EMAIL=$(GCP_PUBSUB_PUSH_SERVICE_ACCOUNT_EMAIL),PRISMA_CONNECTION_LIMIT=5" \
	  --add-cloudsql-instances=$(INSTANCE_CN) \
	  $(GCP_SECRETS)
	gcloud run deploy $(SVC_WORKER) \
	  --image=$(IMG_WORKER) --region=$(GCP_REGION) --no-allow-unauthenticated \
	  --ingress=all \
	  --service-account=$(SA_RUN)@$(GCP_PROJECT).iam.gserviceaccount.com \
	  --port=8080 --min-instances=0 --max-instances=5 \
	  --clear-vpc-connector \
	  --concurrency=50 --timeout=300 \
	  --cpu=1 --memory=1Gi --no-cpu-boost --cpu-throttling \
	  --command="" --args="" \
	  --set-env-vars="$(GCP_API_ENV),WORKERS_ENABLED=true,WS_ENABLED=false,REALTIME_DURABLE_ENABLED=true,PRISMA_CONNECTION_LIMIT=2,WORKER_HEALTH_PORT=8080" \
	  --add-cloudsql-instances=$(INSTANCE_CN) \
	  $(GCP_SECRETS)
	@echo "[gcp-deploy-backend] api + worker desplegados"

gcp-deploy-frontend: ## GCP: despliega nexo-frontend a Cloud Run
	gcloud run deploy $(SVC_FRONTEND) \
	  --image=$(IMG_FRONTEND) --region=$(GCP_REGION) --allow-unauthenticated \
	  --service-account=$(SA_RUN)@$(GCP_PROJECT).iam.gserviceaccount.com \
	  --port=8080 --min-instances=0 --max-instances=10 \
	  --clear-vpc-connector \
	  --concurrency=80 --timeout=300 \
	  --cpu=1 --memory=512Mi --cpu-boost --cpu-throttling \
	  --set-env-vars="NODE_ENV=production,NEXT_PUBLIC_API_URL=$(GCP_API_BASE_URL),NEXT_PUBLIC_WS_URL=$(GCP_WS_URL)"
	@echo "[gcp-deploy-frontend] frontend desplegado"

gcp-deploy-all: gcp-build gcp-migrate gcp-deploy-backend gcp-deploy-frontend ## GCP: build -> migrar -> desplegar todo

gcp-logs: ## GCP: logs de Cloud Run por servicio: make gcp-logs SVC=nexo-api
	@if [ -z "$(SVC)" ]; then echo "Uso: make gcp-logs SVC=<servicio>"; exit 1; fi
	gcloud run services logs read $(SVC) --region $(GCP_REGION) --limit=200

gcp-status: ## GCP: lista servicios Cloud Run
	gcloud run services list --region $(GCP_REGION) --format="table(name,status.url)"
