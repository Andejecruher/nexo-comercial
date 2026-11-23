# Backend docs

Este directorio centraliza la documentacion tecnica del backend.

## Estructura del backend

```text
backend/
  docs/
  prisma/
    migrations/
    schema.prisma
    seed/
  src/
    config/
    controllers/
    database/
    middlewares/
    routes/
    services/
    utils/
    server.ts
  Dockerfile
  package.json
  tsconfig.json
```

### Que hay en cada carpeta

- docs/
  Documentacion del backend y convenciones internas.
- prisma/
  Schema y migraciones de Prisma, mas seeds para datos iniciales.
- src/
  Codigo fuente de la API.
- src/config/
  Configuracion de entorno y tipos de config.
- src/controllers/
  Controladores HTTP. Orquestan la request/response y llaman a servicios.
- src/database/
  Entradas de acceso a la base de datos (Prisma client, helpers).
- src/middlewares/
  Middlewares de Express (auth, firma, validaciones comunes).
- src/routes/
  Definicion de rutas y wiring de dependencias. Aqui se registran modulos.
- src/services/
  Logica de negocio y servicios de infraestructura.
- src/utils/
  Helpers puros (crypto, parsing, formateos simples).

## Como construir un modulo nuevo

### 1) Servicio (logica de negocio)

- Crear un servicio en src/services/.
- Debe recibir dependencias por constructor (por ejemplo Prisma).
- No debe conocer Express ni Request/Response.

### 2) Controller (capa HTTP)

- Crear controller en src/controllers/.
- Validar inputs de manera basica y delegar al servicio.
- Retornar respuestas HTTP con status y payload consistentes.
- Anotar endpoints con JSDoc OpenAPI para que Swagger los documente.

### 3) Routes (exponer endpoints)

- Crear un archivo en src/routes/ con un createXRouter(...).
- Montar el router en src/routes/index.ts dentro de registerRoutes.
- En index.ts se hace el wiring: instanciar servicios y controllers necesarios.

### 4) Middlewares (si aplica)

- Si un endpoint requiere autenticacion o firma, agregar middleware en src/middlewares/.
- Componerlo en el router del modulo.

### 5) Documentacion

- Agregar una seccion nueva en docs/README.md si el modulo lo amerita.
- Mantener la descripcion de carpetas y convenciones actualizada.

## Convenciones de inyeccion

- La inicializacion de infraestructura (Prisma) se hace en src/server.ts.
- El wiring de servicios y controllers ocurre en src/routes/index.ts.
- Las dependencias se inyectan por constructor para facilitar testing.

## Swagger / OpenAPI

- Se generan specs desde anotaciones JSDoc en controllers y routes.
- Revisar /docs para validar que los endpoints aparezcan correctamente.

## Modulo AI

- Guia tecnica del modulo AI: `backend/src/ai/README.md`.

## Dependencias y Docker

- Lockfile del monorepo: `pnpm-lock.yaml` en la raiz (no uses `package-lock.json` en `backend/`).
- Imagen Docker: construir siempre con contexto en la raiz del repo, por ejemplo `docker build -f backend/Dockerfile --target runner .`.
- Politica detallada: `docs/dependency-policy.md`.

## Migraciones y seeds (convencion)

Convencion actual del proyecto:

- El flujo principal corre en contenedor con el servicio `migrator` (`prisma migrate deploy`).
- API y worker esperan que `migrator` finalice correctamente.

Comandos recomendados:

```bash
# Migraciones (dev/prod)
make migrate-dev
make migrate-prod

# Seed general (core default, safe without credentials)
docker compose -f docker-compose.dev.yml run --rm migrator pnpm run prisma:seed

# Seed AI / dev (requires SUPERADMIN_PASSWORD)
docker compose -f docker-compose.dev.yml run --rm migrator pnpm run prisma:seed:ai
```

Alternativa local (sin Docker):

```bash
pnpm --dir backend prisma:migrate
pnpm --dir backend prisma:migrate:prod
pnpm --dir backend prisma:seed        # core only
pnpm --dir backend prisma:seed:ai     # dev/AI only (requires SUPERADMIN_PASSWORD)
```

Referencias cruzadas:

- Guia AI: `backend/src/ai/README.md`
- README raiz (operacion general del monorepo): `README.md`
