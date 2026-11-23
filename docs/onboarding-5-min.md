# Onboarding en 5 minutos

Objetivo: levantar backend + frontend localmente y verificar que el proyecto esta operativo.

## 1) Requisitos

- Node.js 20+
- pnpm 10+
- Docker + Docker Compose

## 2) Instalar dependencias

```bash
pnpm install
```

## 3) Crear archivos .env desde ejemplos

```bash
cp .env.example .env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Variables minimas de backend:

```dotenv
NODE_ENV=development
PORT=8000
CORS_ORIGIN=*

DATABASE_URL=postgresql://voz:secret@postgres:5432/vozcuidadana

JWT_SECRET=change-me
JWT_REFRESH_SECRET=change-me-too

WHATSAPP_VERIFY_TOKEN=change-me
WHATSAPP_APP_ID=change-me
WHATSAPP_APP_SECRET=change-me
WHATSAPP_ACCESS_TOKEN=change-me
WHATSAPP_PHONE_NUMBER_ID=change-me
WHATSAPP_BUSINESS_ACCOUNT_ID=change-me
```

## 4) Levantar infraestructura completa (migrator + api + worker + frontend)

Primera vez:

```bash
make dev-up-first
```

Siguientes veces:

```bash
make dev-up
```

### Reset de DB de desarrollo + seeds

Usar cuando necesites reiniciar la base local desde cero.

```bash
make dev-db-reset-seed
```

Este comando es destructivo: elimina volumenes de Postgres en dev, reaplica migraciones y ejecuta seeds base + IA.

### Reaplicar solo seeds (sin reset)

```bash
make dev-db-seed
```

## 5) Verificaciones rapidas

- API health: <http://localhost:8000/health>
- Swagger UI: <http://localhost:8000/docs>
- OpenAPI JSON: <http://localhost:8000/api-docs.json>
- Frontend: <http://localhost:3000>

## 6) Checks de calidad antes de commitear

```bash
pnpm lint
pnpm typecheck
pnpm test
make smoke
make validate
```

## Problemas comunes

### Falla de tests por node_modules stale en Docker

```bash
make docker-reset-dev-volumes
make test-docker
```

### Falla de formato en frontend por next-env.d.ts

next-env.d.ts esta excluido en frontend/.prettierignore para evitar ruido en CI/pre-commit.
