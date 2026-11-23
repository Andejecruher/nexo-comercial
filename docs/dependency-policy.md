# Política de dependencias (monorepo)

Este documento define cómo agregar, actualizar y reproducir dependencias en **Voz Ciudadana** para evitar drift entre máquina local, contenedores de desarrollo y producción.

## Gestor único: pnpm

- El monorepo usa **pnpm workspaces** (`pnpm-workspace.yaml`).
- La fuente de verdad del árbol de dependencias es **[pnpm-lock.yaml](../pnpm-lock.yaml)** en la raíz del repositorio.
- No se debe commitear ni usar un segundo lockfile en `backend/` (p. ej. `package-lock.json`).

### Alta o baja de dependencias

```bash
# Backend
pnpm --filter voz-ciudadana-api add <paquete>
pnpm --filter voz-ciudadana-api remove <paquete>

# Frontend (ajustar nombre del paquete según frontend/package.json)
pnpm --filter <nombre-paquete-frontend> add <paquete>
```

Siempre commitear **juntos** `package.json` del paquete afectado y `pnpm-lock.yaml`.

### Instalación local

```bash
pnpm install --frozen-lockfile
```

`--frozen-lockfile` falla si el lockfile no coincide con los `package.json`; úsalo en CI y en scripts reproducibles.

## Docker: contexto de build

Las imágenes del backend se construyen con **contexto en la raíz del repo** y Dockerfile en `backend/Dockerfile`:

```bash
docker build -f backend/Dockerfile -t voz-api:local .
```

Esto permite que el Dockerfile ejecute `pnpm install --frozen-lockfile --filter voz-ciudadana-api...` contra el lockfile del monorepo.

## Desarrollo con Compose

- `api` y `worker` comparten volúmenes nombrados para `node_modules` (`backend` + raíz del workspace), de modo que vean el **mismo** árbol de dependencias.
- Un **entrypoint** sincroniza dependencias cuando cambia el hash de `pnpm-lock.yaml` (montado read-only en el contenedor).
- Si algo queda inconsistente: `make docker-reset-dev-volumes` y vuelve a levantar el stack.

## Producción

- Las imágenes se construyen en CI o en pipeline de deploy con el mismo `pnpm install --frozen-lockfile`.
- No instalar dependencias a mano dentro del contenedor en producción; redeploy de imagen nueva.

## Railway / monorepo

- **Root directory** del servicio debe ser la raíz del repositorio (`.`).
- **Dockerfile path**: `backend/Dockerfile`.

Así el build puede leer `pnpm-lock.yaml` y `pnpm-workspace.yaml`.

## Resumen de comandos útiles

| Objetivo                                 | Comando                          |
| ---------------------------------------- | -------------------------------- |
| Instalar en local (reproducible)         | `pnpm install --frozen-lockfile` |
| Reset volúmenes dev (node_modules stale) | `make docker-reset-dev-volumes`  |
| Stack dev con rebuild                    | `make dev-up-first`              |
| Verificar lockfile en CI                 | `pnpm install --frozen-lockfile` |
