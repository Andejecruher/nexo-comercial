# RBAC Permission Catalog — Voz Ciudadana

> **Source of truth:** `backend/prisma/seed/core/permissions.seed.ts`
> **Role matrix:** `backend/prisma/seed/core/role-permissions.seed.ts`
>
> This document is generated from the seed catalog. If the seed changes,
> this document must be updated to match. The seed is the single source
> of truth — frontend and backend guards resolve against the slugs it
> defines.

## Overview

| Metric | Value |
|--------|-------|
| Permission groups | 3 |
| Modules | 20 |
| Permissions | 76 |
| Roles | 5 |
| Role-permission assignments | 169 |

**Slug convention:** `{module}.{action}` (e.g. `tickets.view`, `users.create`).

**Actions:** `view`, `create`, `update`, `delete`, `export`, `manage`, `assign`, `deactivate`.

**Groups** (organizational only — not persisted in the database):

| Group | Label | Modules |
|-------|-------|---------|
| `whatsapp` | Gestion de WhatsApp | 7 |
| `campana` | Gestion de Campana | 3 |
| `configuracion` | Configuracion de Plataforma | 10 |

---

## 1. Permission Catalog (by group)

### 1.1 Gestion de WhatsApp (`whatsapp`)

| Module | Slug | Name | Description |
|--------|------|------|-------------|
| `indicadores_atencion` | `indicadores_atencion.view` | Ver indicadores de atencion | Listar y consultar registros del modulo indicadores de atencion. |
| `indicadores_atencion` | `indicadores_atencion.export` | Exportar indicadores de atencion | Exportar registros del modulo indicadores de atencion. |
| `conversaciones` | `conversaciones.view` | Ver conversaciones | Listar y consultar registros del modulo conversaciones. |
| `conversaciones` | `conversaciones.create` | Crear conversaciones | Crear registros del modulo conversaciones. |
| `conversaciones` | `conversaciones.update` | Actualizar conversaciones | Editar registros del modulo conversaciones. |
| `conversaciones` | `conversaciones.delete` | Eliminar conversaciones | Eliminar o desactivar registros del modulo conversaciones. |
| `tickets` | `tickets.view` | Ver tickets | Listar y consultar registros del modulo tickets. |
| `tickets` | `tickets.create` | Crear tickets | Crear registros del modulo tickets. |
| `tickets` | `tickets.update` | Actualizar tickets | Editar registros del modulo tickets. |
| `tickets` | `tickets.delete` | Eliminar tickets | Eliminar o desactivar registros del modulo tickets. |
| `ciudadanos` | `ciudadanos.view` | Ver ciudadanos | Listar y consultar registros del modulo ciudadanos. |
| `ciudadanos` | `ciudadanos.create` | Crear ciudadanos | Crear registros del modulo ciudadanos. |
| `ciudadanos` | `ciudadanos.update` | Actualizar ciudadanos | Editar registros del modulo ciudadanos. |
| `ciudadanos` | `ciudadanos.delete` | Eliminar ciudadanos | Eliminar o desactivar registros del modulo ciudadanos. |
| `campanas_whatsapp` | `campanas_whatsapp.view` | Ver campanas de WhatsApp | Listar y consultar registros del modulo campanas de WhatsApp. |
| `campanas_whatsapp` | `campanas_whatsapp.create` | Crear campanas de WhatsApp | Crear registros del modulo campanas de WhatsApp. |
| `campanas_whatsapp` | `campanas_whatsapp.update` | Actualizar campanas de WhatsApp | Editar registros del modulo campanas de WhatsApp. |
| `campanas_whatsapp` | `campanas_whatsapp.delete` | Eliminar campanas de WhatsApp | Eliminar o desactivar registros del modulo campanas de WhatsApp. |
| `mensajes_masivos` | `mensajes_masivos.view` | Ver mensajes masivos | Listar y consultar registros del modulo mensajes masivos. |
| `mensajes_masivos` | `mensajes_masivos.create` | Crear mensajes masivos | Crear registros del modulo mensajes masivos. |
| `mensajes_masivos` | `mensajes_masivos.update` | Actualizar mensajes masivos | Editar registros del modulo mensajes masivos. |
| `mensajes_masivos` | `mensajes_masivos.delete` | Eliminar mensajes masivos | Eliminar o desactivar registros del modulo mensajes masivos. |
| `plantillas` | `plantillas.view` | Ver plantillas | Listar y consultar registros del modulo plantillas. |
| `plantillas` | `plantillas.create` | Crear plantillas | Crear registros del modulo plantillas. |
| `plantillas` | `plantillas.update` | Actualizar plantillas | Editar registros del modulo plantillas. |
| `plantillas` | `plantillas.delete` | Eliminar plantillas | Eliminar o desactivar registros del modulo plantillas. |

**Subtotal: 26 permissions across 7 modules.**

### 1.2 Gestion de Campana (`campana`)

| Module | Slug | Name | Description |
|--------|------|------|-------------|
| `indicadores_precampana` | `indicadores_precampana.view` | Ver indicadores de precampana | Listar y consultar registros del modulo indicadores de precampana. |
| `indicadores_precampana` | `indicadores_precampana.export` | Exportar indicadores de precampana | Exportar registros del modulo indicadores de precampana. |
| `indicadores_precampana` | `indicadores_precampana.create` | Crear indicadores de precampana | Crear registros del modulo indicadores de precampana. |
| `indicadores_precampana` | `indicadores_precampana.update` | Actualizar indicadores de precampana | Editar registros del modulo indicadores de precampana. |
| `promovidos` | `promovidos.view` | Ver promovidos | Listar y consultar registros del modulo promovidos. |
| `promovidos` | `promovidos.create` | Crear promovidos | Crear registros del modulo promovidos. |
| `promovidos` | `promovidos.update` | Actualizar promovidos | Editar registros del modulo promovidos. |
| `promovidos` | `promovidos.delete` | Eliminar promovidos | Eliminar o desactivar registros del modulo promovidos. |
| `eventos` | `eventos.view` | Ver eventos | Listar y consultar registros del modulo eventos. |
| `eventos` | `eventos.create` | Crear eventos | Crear registros del modulo eventos. |
| `eventos` | `eventos.update` | Actualizar eventos | Editar registros del modulo eventos. |
| `eventos` | `eventos.delete` | Eliminar eventos | Eliminar o desactivar registros del modulo eventos. |

**Subtotal: 12 permissions across 3 modules.**

> **Note on `indicadores_precampana`:** The `create` and `update` actions
> are scoped to goal management (create/update/deactivate goals in the
 precampana analytics dashboard). They are assigned only to `SUPER_ADMIN`
> and `COORDINADOR`. `CAPTURISTA` and `LIDER` receive only `view` + `export`.

### 1.3 Configuracion de Plataforma (`configuracion`)

| Module | Slug | Name | Description |
|--------|------|------|-------------|
| `configuracion` | `configuracion.view` | Ver configuracion | Listar y consultar registros del modulo configuracion. |
| `configuracion` | `configuracion.update` | Actualizar configuracion | Editar registros del modulo configuracion. |
| `users` | `users.view` | Ver usuarios | Listar y consultar registros del modulo usuarios. |
| `users` | `users.create` | Crear usuarios | Crear registros del modulo usuarios. |
| `users` | `users.update` | Actualizar usuarios | Editar registros del modulo usuarios. |
| `users` | `users.delete` | Eliminar usuarios | Eliminar o desactivar registros del modulo usuarios. |
| `departamentos` | `departamentos.view` | Ver departamentos | Listar y consultar registros del modulo departamentos. |
| `departamentos` | `departamentos.create` | Crear departamentos | Crear registros del modulo departamentos. |
| `departamentos` | `departamentos.update` | Actualizar departamentos | Editar registros del modulo departamentos. |
| `departamentos` | `departamentos.delete` | Eliminar departamentos | Eliminar o desactivar registros del modulo departamentos. |
| `barrios` | `barrios.view` | Ver barrios | Listar y consultar registros del modulo barrios. |
| `barrios` | `barrios.create` | Crear barrios | Crear registros del modulo barrios. |
| `barrios` | `barrios.update` | Actualizar barrios | Editar registros del modulo barrios. |
| `barrios` | `barrios.delete` | Eliminar barrios | Eliminar o desactivar registros del modulo barrios. |
| `etiquetas` | `etiquetas.view` | Ver etiquetas | Listar y consultar registros del modulo etiquetas. |
| `etiquetas` | `etiquetas.create` | Crear etiquetas | Crear registros del modulo etiquetas. |
| `etiquetas` | `etiquetas.update` | Actualizar etiquetas | Editar registros del modulo etiquetas. |
| `etiquetas` | `etiquetas.delete` | Eliminar etiquetas | Eliminar o desactivar registros del modulo etiquetas. |
| `catalogo_electoral` | `catalogo_electoral.view` | Ver catalogo electoral | Listar y consultar registros del modulo catalogo electoral. |
| `catalogo_electoral` | `catalogo_electoral.create` | Crear catalogo electoral | Crear registros del modulo catalogo electoral. |
| `catalogo_electoral` | `catalogo_electoral.update` | Actualizar catalogo electoral | Editar registros del modulo catalogo electoral. |
| `catalogo_electoral` | `catalogo_electoral.delete` | Eliminar catalogo electoral | Eliminar o desactivar registros del modulo catalogo electoral. |
| `ai` | `ai.view` | Ver canales e IA | Listar y consultar registros del modulo canales e IA. |
| `ai` | `ai.create` | Crear canales e IA | Crear registros del modulo canales e IA. |
| `ai` | `ai.update` | Actualizar canales e IA | Editar registros del modulo canales e IA. |
| `ai` | `ai.delete` | Eliminar canales e IA | Eliminar o desactivar registros del modulo canales e IA. |
| `analytics` | `analytics.view` | Ver analitica transversal | Listar y consultar registros del modulo analitica transversal. |
| `roles` | `roles.view` | Ver roles | Listar y consultar registros del modulo roles. |
| `roles` | `roles.create` | Crear roles | Crear registros del modulo roles. |
| `roles` | `roles.update` | Actualizar roles | Editar registros del modulo roles. |
| `roles` | `roles.delete` | Eliminar roles | Eliminar o desactivar registros del modulo roles. |
| `roles` | `roles.assign` | Asignar roles | Asignar o remover roles a usuarios. |
| `permissions` | `permissions.view` | Ver permisos | Listar y consultar registros del modulo permisos. |
| `permissions` | `permissions.create` | Crear permisos | Crear registros del modulo permisos. |
| `permissions` | `permissions.update` | Actualizar permisos | Editar registros del modulo permisos. |
| `permissions` | `permissions.delete` | Eliminar permisos | Eliminar o desactivar registros del modulo permisos. |
| `permissions` | `permissions.manage` | Administrar permisos | Administrar asignaciones de permisos a roles. |
| `permissions` | `permissions.deactivate` | Activar o desactivar permisos | Activar o desactivar permisos. |

**Subtotal: 38 permissions across 10 modules.**

---

## 2. Role-Permission Matrix

### 2.1 Role definitions

| Role name | Slug | Description | Permission count |
|-----------|------|-------------|-----------------|
| `SUPER_ADMIN` | `super-admin` | Acceso total al sistema. Gestion de usuarios, roles y configuracion. | 76 |
| `COORDINADOR` | `coordinador` | Coordina operadores y gestiona WhatsApp, campana y configuracion operativa del territorio. | 55 |
| `CAPTURISTA` | `capturista` | Captura y gestiona datos de precampana: promovidos y eventos. | 10 |
| `OPERADOR_CHAT` | `operador-chat` | Atiende conversaciones de ciudadanos y gestiona WhatsApp. | 26 |
| `LIDER` | `lider` | Consulta los indicadores de precampana de su zona. | 2 |

### 2.2 Matrix (permission per role)

Legend: **Y** = assigned, **-** = not assigned.

| Slug | SUPER_ADMIN | COORDINADOR | CAPTURISTA | OPERADOR_CHAT | LIDER |
|------|:-----------:|:-----------:|:----------:|:-------------:|:----:|
| `indicadores_atencion.view` | Y | Y | - | Y | - |
| `indicadores_atencion.export` | Y | Y | - | Y | - |
| `conversaciones.view` | Y | Y | - | Y | - |
| `conversaciones.create` | Y | Y | - | Y | - |
| `conversaciones.update` | Y | Y | - | Y | - |
| `conversaciones.delete` | Y | Y | - | Y | - |
| `tickets.view` | Y | Y | - | Y | - |
| `tickets.create` | Y | Y | - | Y | - |
| `tickets.update` | Y | Y | - | Y | - |
| `tickets.delete` | Y | Y | - | Y | - |
| `ciudadanos.view` | Y | Y | - | Y | - |
| `ciudadanos.create` | Y | Y | - | Y | - |
| `ciudadanos.update` | Y | Y | - | Y | - |
| `ciudadanos.delete` | Y | Y | - | Y | - |
| `campanas_whatsapp.view` | Y | Y | - | Y | - |
| `campanas_whatsapp.create` | Y | Y | - | Y | - |
| `campanas_whatsapp.update` | Y | Y | - | Y | - |
| `campanas_whatsapp.delete` | Y | Y | - | Y | - |
| `mensajes_masivos.view` | Y | Y | - | Y | - |
| `mensajes_masivos.create` | Y | Y | - | Y | - |
| `mensajes_masivos.update` | Y | Y | - | Y | - |
| `mensajes_masivos.delete` | Y | Y | - | Y | - |
| `plantillas.view` | Y | Y | - | Y | - |
| `plantillas.create` | Y | Y | - | Y | - |
| `plantillas.update` | Y | Y | - | Y | - |
| `plantillas.delete` | Y | Y | - | Y | - |
| `indicadores_precampana.view` | Y | Y | Y | - | Y |
| `indicadores_precampana.export` | Y | Y | Y | - | Y |
| `indicadores_precampana.create` | Y | Y | - | - | - |
| `indicadores_precampana.update` | Y | Y | - | - | - |
| `promovidos.view` | Y | Y | Y | - | - |
| `promovidos.create` | Y | Y | Y | - | - |
| `promovidos.update` | Y | Y | Y | - | - |
| `promovidos.delete` | Y | Y | Y | - | - |
| `eventos.view` | Y | Y | Y | - | - |
| `eventos.create` | Y | Y | Y | - | - |
| `eventos.update` | Y | Y | Y | - | - |
| `eventos.delete` | Y | Y | Y | - | - |
| `configuracion.view` | Y | - | - | - | - |
| `configuracion.update` | Y | - | - | - | - |
| `users.view` | Y | - | - | - | - |
| `users.create` | Y | - | - | - | - |
| `users.update` | Y | - | - | - | - |
| `users.delete` | Y | - | - | - | - |
| `departamentos.view` | Y | Y | - | - | - |
| `departamentos.create` | Y | Y | - | - | - |
| `departamentos.update` | Y | Y | - | - | - |
| `departamentos.delete` | Y | Y | - | - | - |
| `barrios.view` | Y | Y | - | - | - |
| `barrios.create` | Y | Y | - | - | - |
| `barrios.update` | Y | Y | - | - | - |
| `barrios.delete` | Y | Y | - | - | - |
| `etiquetas.view` | Y | Y | - | - | - |
| `etiquetas.create` | Y | Y | - | - | - |
| `etiquetas.update` | Y | Y | - | - | - |
| `etiquetas.delete` | Y | Y | - | - | - |
| `catalogo_electoral.view` | Y | Y | - | - | - |
| `catalogo_electoral.create` | Y | Y | - | - | - |
| `catalogo_electoral.update` | Y | Y | - | - | - |
| `catalogo_electoral.delete` | Y | Y | - | - | - |
| `ai.view` | Y | - | - | - | - |
| `ai.create` | Y | - | - | - | - |
| `ai.update` | Y | - | - | - | - |
| `ai.delete` | Y | - | - | - | - |
| `analytics.view` | Y | Y | - | - | - |
| `roles.view` | Y | - | - | - | - |
| `roles.create` | Y | - | - | - | - |
| `roles.update` | Y | - | - | - | - |
| `roles.delete` | Y | - | - | - | - |
| `permissions.view` | Y | - | - | - | - |
| `permissions.create` | Y | - | - | - | - |
| `permissions.update` | Y | - | - | - | - |
| `permissions.delete` | Y | - | - | - | - |

### 2.3 Matrix construction logic

The matrix is built programmatically in `role-permissions.seed.ts`:

| Role | Logic |
|------|-------|
| `SUPER_ADMIN` | All 73 permissions (`PERMISSIONS.map(p => p.slug)`) |
| `COORDINADOR` | All `whatsapp` group + all `campana` group + `departamentos.*` + `barrios.*` + `etiquetas.*` + `catalogo_electoral.*` + `analytics.view` |
| `CAPTURISTA` | `indicadores_precampana.{view,export}` (read-only) + all `promovidos.*` + all `eventos.*` |
| `OPERADOR_CHAT` | All `whatsapp` group |
| `LIDER` | `indicadores_precampana.{view,export}` (read-only) |

> `CAPTURISTA` and `LIDER` use `slugsForModuleActions('indicadores_precampana', ['view', 'export'])`
> to exclude `create`/`update` (goal management), which are reserved for
> `SUPER_ADMIN` and `COORDINADOR`.

---

## 3. Backend Route Guards

The backend uses two guard mechanisms:

- **`requirePermissions(prisma, slugs, mode)`** — checks the user's
  permission slugs (queried from the database via
  `AuthorizationService.getUserPermissionSlugs`). `mode: 'all'` requires
  all slugs; `mode: 'any'` requires at least one.
- **`requireRole([...roles])`** — checks `req.user.roles` directly. Used
  for routes without a matching permission module.

### 3.1 Permission-based routes

| Router file | Route | Guard | Required slug(s) |
|------------|-------|-------|------------------|
| `conversations.routes.ts` | `GET /` | `requireAnyPermission` | `conversaciones.view` OR `tickets.view` |
| | `GET /:id` | `requireAnyPermission` | `conversaciones.view` OR `tickets.view` |
| | `GET /:id/messages` | `requireAnyPermission` | `conversaciones.view` OR `tickets.view` |
| | `POST /:id/messages` | `requirePermissions` (all) | `conversaciones.update` |
| | `POST /:id/assign` | `requirePermissions` (all) | `conversaciones.update` |
| | `POST /:id/transfer` | `requirePermissions` (all) | `conversaciones.update` |
| | `POST /:id/handover` | `requirePermissions` (all) | `conversaciones.update` |
| | `POST /:id/close` | `requirePermissions` (all) | `conversaciones.update` |
| | `POST /:id/reopen` | `requirePermissions` (all) | `conversaciones.update` |
| `messages.routes.ts` | `POST /text` | `requirePermissions` (all) | `conversaciones.update` |
| | `POST /:id/attachments` | `requirePermissions` (all) | `conversaciones.update` |
| `handover.routes.ts` | `POST /take` | `requirePermissions` (all) | `conversaciones.update` |
| | `POST /release` | `requirePermissions` (all) | `conversaciones.update` |
| | `POST /escalate` | `requirePermissions` (all) | `conversaciones.update` |
| `citizens.routes.ts` | `GET /` | `requirePermissions` (all) | `ciudadanos.view` |
| | `GET /:id` | `requirePermissions` (all) | `ciudadanos.view` |
| | `GET /:id/profile` | `requirePermissions` (all) | `ciudadanos.view` |
| | `POST /` | `requirePermissions` (all) | `ciudadanos.create` |
| | `PATCH /:id` | `requirePermissions` (all) | `ciudadanos.update` |
| | `DELETE /:id` | `requirePermissions` (all) | `ciudadanos.delete` |
| | `POST /:id/tags/:tagId` | `requirePermissions` (all) | `ciudadanos.update` |
| | `DELETE /:id/tags/:tagId` | `requirePermissions` (all) | `ciudadanos.update` |
| | `POST /tags/bulk` | `requirePermissions` (all) | `ciudadanos.update` |
| `neighborhoods.routes.ts` | `GET /neighborhoods` | `requirePermissions` (all) | `barrios.view` |
| | `POST /neighborhoods` | `requirePermissions` (all) | `barrios.create` |
| | `PATCH /neighborhoods/:id` | `requirePermissions` (all) | `barrios.update` |
| | `DELETE /neighborhoods/:id` | `requirePermissions` (all) | `barrios.delete` |
| `tags.routes.ts` | `GET /tags` | `requirePermissions` (all) | `etiquetas.view` |
| | `POST /tags` | `requirePermissions` (all) | `etiquetas.create` |
| | `PATCH /tags/:id` | `requirePermissions` (all) | `etiquetas.update` |
| | `DELETE /tags/:id` | `requirePermissions` (all) | `etiquetas.delete` |
| `departments.routes.ts` | `GET /departments` | `requirePermissions` (all) | `departamentos.view` |
| | `GET /departments/:slug/availability` | `requirePermissions` (all) | `departamentos.view` |
| | `POST /departments` | `requirePermissions` (all) | `departamentos.create` |
| | `PATCH /departments/:id` | `requirePermissions` (all) | `departamentos.update` |
| | `DELETE /departments/:id` | `requirePermissions` (all) | `departamentos.delete` |
| `events.routes.ts` | `GET /events` | `requirePermissions` (all) | `eventos.view` |
| | `GET /events/:id` | `requirePermissions` (all) | `eventos.view` |
| | `GET /events/:id/registrations` | `requirePermissions` (all) | `eventos.view` |
| | `GET /events/:id/attendees` | `requirePermissions` (all) | `eventos.view` |
| | `POST /events` | `requirePermissions` (all) | `eventos.create` |
| | `PATCH /events/:id` | `requirePermissions` (all) | `eventos.update` |
| | `POST /events/:id/invite` | `requirePermissions` (all) | `eventos.update` |
| | `POST /events/:id/registrations` | `requirePermissions` (all) | `eventos.update` |
| | `PATCH /events/:id/registrations/:rid/confirm` | `requirePermissions` (all) | `eventos.update` |
| | `POST /events/:id/registrations/:rid/checkin` | `requirePermissions` (all) | `eventos.update` |
| `analytics.routes.ts` | `GET /dashboard` | `requirePermissions` (all) | `analytics.view` |
| | `GET /tickets` | `requirePermissions` (all) | `analytics.view` |
| | `GET /agents` | `requirePermissions` (all) | `analytics.view` |
| | `GET /departments` | `requirePermissions` (all) | `analytics.view` |
| `precampana-analytics.routes.ts` | `GET /precampana/dashboard` | `requirePermissions` (all) | `indicadores_precampana.view` |
| | `GET /precampana/goals` | `requirePermissions` (all) | `indicadores_precampana.view` |
| | `POST /precampana/goals` | `requirePermissions` (all) | `indicadores_precampana.create` |
| | `PATCH /precampana/goals/:id` | `requirePermissions` (all) | `indicadores_precampana.update` |
| | `PATCH /precampana/goals/:id/deactivate` | `requirePermissions` (all) | `indicadores_precampana.update` |
| `admin-ai.routes.ts` | `router.use` (all routes) | `requirePermissions` (all) | `ai.view` AND `ai.create` |
| `ine-ocr.routes.ts` | `GET /promovidos` | `requirePermissions` (all) | `promovidos.view` |
| | `GET /promovidos/check-voter-key` | `requirePermissions` (all) | `promovidos.view` |
| | `POST /promovidos` | `requirePermissions` (all) | `promovidos.create` |
| | `GET /promovidos/:id` | `requirePermissions` (all) | `promovidos.view` |
| | `PATCH /promovidos/:id` | `requirePermissions` (all) | `promovidos.update` |
| | `GET /catalog/states` | `requirePermissions` (all) | `catalogo_electoral.view` |
| | `GET /catalog/districts` | `requirePermissions` (all) | `catalogo_electoral.view` |
| | `GET /catalog/sections` | `requirePermissions` (all) | `catalogo_electoral.view` |
| | `GET /catalog/leaders` | `requirePermissions` (all) | `catalogo_electoral.view` |
| | `POST /catalog/states` | `requirePermissions` (all) | `catalogo_electoral.create` |
| | `PATCH /catalog/states/:id` | `requirePermissions` (all) | `catalogo_electoral.update` |
| | `DELETE /catalog/states/:id` | `requirePermissions` (all) | `catalogo_electoral.delete` |
| | `POST /catalog/districts` | `requirePermissions` (all) | `catalogo_electoral.create` |
| | `PATCH /catalog/districts/:id` | `requirePermissions` (all) | `catalogo_electoral.update` |
| | `DELETE /catalog/districts/:id` | `requirePermissions` (all) | `catalogo_electoral.delete` |
| | `POST /catalog/sections` | `requirePermissions` (all) | `catalogo_electoral.create` |
| | `PATCH /catalog/sections/:id` | `requirePermissions` (all) | `catalogo_electoral.update` |
| | `DELETE /catalog/sections/:id` | `requirePermissions` (all) | `catalogo_electoral.delete` |
| | `POST /catalog/leaders` | `requirePermissions` (all) | `catalogo_electoral.create` |
| | `PATCH /catalog/leaders/:id` | `requirePermissions` (all) | `catalogo_electoral.update` |
| | `DELETE /catalog/leaders/:id` | `requirePermissions` (all) | `catalogo_electoral.delete` |
| `roles-permissions.routes.ts` | `GET /permissions` | `requirePermissions` | `permissions.view` |
| | `GET /permissions/assignable` | `requirePermissions` | `permissions.view` |
| | `GET /permissions/:id` | `requirePermissions` | `permissions.view` |
| | `GET /permissions/:id/roles` | `requirePermissions` | `permissions.view` |
| | `POST /permissions` | `requirePermissions` | `permissions.create` |
| | `PATCH /permissions/:id` | `requirePermissions` | `permissions.update` |
| | `PATCH /permissions/:id/status` | `requirePermissions` | `permissions.deactivate` |
| | `GET /roles` | `requirePermissions` | `roles.view` |
| | `GET /roles/:id` | `requirePermissions` | `roles.view` |
| | `POST /roles` | `requirePermissions` | `roles.create` |
| | `PATCH /roles/:id` | `requirePermissions` | `roles.update` |
| | `DELETE /roles/:id` | `requirePermissions` | `roles.delete` |
| | `PUT /roles/:id/permissions` | `requirePermissions` | `permissions.manage` |
| | `POST /roles/:id/permissions/:pid` | `requirePermissions` | `permissions.manage` |
| | `DELETE /roles/:id/permissions/:pid` | `requirePermissions` | `permissions.manage` |
| `users.routes.ts` | `GET /users` | `requirePermissions` | `users.view` |
| | `GET /users/:id` | `requirePermissions` | `users.view` |
| | `POST /users` | `requirePermissions` | `users.create` |
| | `POST /users/:id/invitations/resend` | `requirePermissions` | `users.create` |
| | `PATCH /users/:id` | `requirePermissions` | `users.update` |
| | `DELETE /users/:id` | `requirePermissions` | `users.delete` |
| | `DELETE /users/:id/delete` | `requirePermissions` | `users.delete` |
| | `POST /users/:id/roles/:roleId` | `requirePermissions` | `roles.assign` |
| | `DELETE /users/:id/roles/:roleId` | `requirePermissions` | `roles.assign` |
| | `GET /config` | `requirePermissions` | `permissions.manage` |

### 3.2 Role-based routes (no permission module)

These routes use `requireRole` because they have no matching slug in the
seed catalog. The decision to keep them role-based was approved per route.

| Router file | Route | Guard | Required role(s) |
|------------|-------|-------|------------------|
| `system.routes.ts` | `GET /audit-logs` | `requireRole` | `SUPER_ADMIN` |
| | `GET /inbox-events` | `requireRole` | `SUPER_ADMIN` |
| | `GET /outbox-events` | `requireRole` | `SUPER_ADMIN` |
| | `POST /outbox-events/:id/retry` | `requireRole` | `SUPER_ADMIN` |
| | `POST /inbox-events/:id/reprocess` | `requireRole` | `SUPER_ADMIN` |
| `ine-ocr.routes.ts` | `POST /uploads` | `requireRole` | `SUPER_ADMIN` OR `COORDINADOR` |
| | `GET /uploads/:id` | `requireRole` | `SUPER_ADMIN` OR `COORDINADOR` |
| | `PATCH /uploads/:id/review` | `requireRole` | `SUPER_ADMIN` OR `COORDINADOR` |
| | `POST /uploads/:id/confirm` | `requireRole` | `SUPER_ADMIN` OR `COORDINADOR` |
| | `POST /uploads/:id/retry` | `requireRole` | `SUPER_ADMIN` OR `COORDINADOR` |
| | `POST /uploads/:id/section-candidates` | `requireRole` | `SUPER_ADMIN` OR `COORDINADOR` |
| | `POST /neighborhood-match` | `requireRole` | `SUPER_ADMIN` OR `COORDINADOR` |
| | `GET /uploads/:id/candidates` | `requireRole` | `SUPER_ADMIN` OR `COORDINADOR` |

### 3.3 Legacy permission slugs (in route code, NOT in seed catalog)

> **Warning:** These slugs are referenced by route guards but are NOT
> defined in `MODULE_PERMISSIONS` and are NOT seeded into the database.
> Only `SUPER_ADMIN` (which has all permissions) can pass these guards
### 3.3 Previously legacy — now seeded

The following slugs were previously used in guards but not seeded.
They have been added to the catalog (see `permissions.seed.ts`):
`permissions.deactivate`, `permissions.manage`, `roles.assign`.

| Slug | Module | Action | Used in | Impact |
|------|--------|--------|---------|--------|
| `permissions.deactivate` | `permissions` | `deactivate` | `roles-permissions.routes.ts` — `PATCH /permissions/:id/status` | Only SUPER_ADMIN can activate/deactivate permissions |
| `permissions.manage` | `permissions` | `manage` | `roles-permissions.routes.ts` — replace/add/remove role permissions; `users.routes.ts` — `GET /config` | Only SUPER_ADMIN can manage role-permission assignments |
| `roles.assign` | `roles` | `assign` | `users.routes.ts` — assign/remove role from user | Only SUPER_ADMIN can assign roles to users |

---

## 4. Frontend Guards

The frontend resolves permissions from the server. After login,
`/auth/login` and `/auth/me` return `permissions: string[]` and
`permissionsByModule: Record<string, string[]>` on the user object.
The `usePermissions` hook reads these from `authStorage` and passes them
to `createGuards(roles, permissions)`.

There is NO hardcoded permission matrix on the frontend. All checks
resolve against the server-provided `permissions` array.

### 4.1 Guard factory (`auth-guards.ts`)

| Guard method | Permission slug checked |
|-------------|------------------------|
| `canView()` | `indicadores_atencion.view` |
| `canViewInbox()` | `conversaciones.view` |
| `canViewCitizens()` | `ciudadanos.view` |
| `canViewEvents()` | `eventos.view` |
| `canManageUsers()` | `users.view` |
| `canManageSettings()` | `configuracion.view` |
| `canAssignRoles()` | `roles.view` |
| `canViewRoles()` | `roles.view` |
| `canCreateRoles()` | `roles.create` |
| `canUpdateRoles()` | `roles.update` |
| `canDeleteRoles()` | `roles.delete` |
| `canViewPermissions()` | `permissions.view` |
| `canManagePermissions()` | `permissions.view` |
| `canCreatePermissions()` | `permissions.create` |
| `canUpdatePermissions()` | `permissions.update` |
| `canDeactivatePermissions()` | `permissions.update` |
| `isSuperAdmin()` | *(role check)* `roles.includes('SUPER_ADMIN')` |
| `check(permission)` | Generic — any slug string |

### 4.2 Sidebar visibility (`sidebar.tsx` NAV_ITEMS)

Each sidebar item gates visibility via `requiredPermissions`. The
`canShowChild` / `canShowItem` logic calls `can(slug)` for each entry.

| Sidebar item | Route | Required permission(s) |
|-------------|-------|----------------------|
| **Gestion de WhatsApp** | | *(group — no own permission)* |
| Indicadores de Atencion | `/admin/indicadores/atencion` | `indicadores_atencion.view` |
| Bandeja de entrada | `/admin/conversaciones` | `conversaciones.view` |
| Tickets | `/admin/tickets` | `tickets.view` |
| Ciudadanos | `/admin/ciudadanos` | `ciudadanos.view` |
| Crear Campana | `/admin/campanas` | `campanas_whatsapp.view` |
| Mensajes Masivos | `/admin/mensajes-masivos` | `mensajes_masivos.view` |
| Plantillas | `/admin/plantillas` | `plantillas.view` |
| **Gestion de Campana** | | *(group — no own permission)* |
| Indicadores de precampana | `/admin/indicadores/precampana` | `indicadores_precampana.view` |
| Promovidos y simpatizantes | `/admin/promovidos` | `promovidos.view` |
| Jornadas y Eventos | `/admin/eventos` | `eventos.view` |
| **Configuracion de Plataforma** | | *(group — no own permission)* |
| Configuracion | `/admin/configuracion` | `configuracion.view` |
| Equipo | `/admin/equipo` | `users.view` |
| Departamentos | `/admin/departamentos` | `departamentos.view` |
| Territorio | `/admin/barrios` | `barrios.view` |
| Etiquetas | `/admin/etiquetas` | `etiquetas.view` |
| Catalogo electoral | `/admin/catalogo-electoral` | `catalogo_electoral.view` |
| Canales e IA | `/admin/ai` | `ai.view` |
| Roles | `/admin/accesos/roles` | `roles.view` AND `permissions.view` |
| Permisos | `/admin/accesos/permissions` | `permissions.view` |

### 4.3 Role-label maps (display only)

| File | Role → Display label |
|------|---------------------|
| `UserDropdown.tsx` | `SUPER_ADMIN` → "Super Admin", `COORDINADOR` → "Coordinador", `CAPTURISTA` → "Capturista", `OPERADOR_CHAT` → "Operador Chat", `LIDER` → "Lider" |
| `settings-view.tsx` | Same mapping |
| `team-utils.ts` | `isProtectedPanelUser`: `slug === 'super-admin'` OR `name === 'SUPER_ADMIN'` |

---

## 5. Architecture Notes

### 5.1 Permission flow (end to end)

```
Seed (permissions.seed.ts)
  ↓ upsert by slug
Database (permissions table)
  ↓ seed role-permission matrix
Database (role_permissions table)
  ↓ login() / me()
AuthorizationService.getAuthenticatedUserProfile(userId)
  ↓ queries user → roles → rolePermissions → permissions
AuthenticatedUser { permissions: string[], permissionsByModule }
  ↓ /auth/login response
Frontend authStorage (localStorage)
  ↓ usePermissions() hook
createGuards(roles, permissions)
  ↓ can(slug) → hasPermission(permissions, slug)
UI gating (sidebar, PermissionGate, guards)
```

### 5.2 Backend guard middleware

```typescript
// Permission-based (queries DB per request)
requirePermissions(prisma, ['tickets.view'], 'all')
requireAnyPermission(prisma, ['conversaciones.view', 'tickets.view'])

// Role-based (checks req.user.roles — no DB query)
requireRole(['SUPER_ADMIN'])
```

`requirePermissions` creates an `AuthorizationService` per request and
calls `getUserPermissionSlugs(req.user.id)`, which queries the database.
This is an intentional trade-off: accurate permissions at the cost of one
DB query per guarded request.

### 5.3 Adding a new permission

1. Add the module or action to `MODULE_PERMISSIONS` in
   `permissions.seed.ts`.
2. If the module belongs to a group, the role matrix updates
   automatically for roles that use `slugsForGroup`.
3. If a role needs only specific actions, use `slugsForModuleActions`
   in `role-permissions.seed.ts`.
4. Run `pnpm run prisma:seed:core` to upsert the new permission.
5. Add the slug to the relevant backend route guard.
6. Add the slug to the relevant frontend sidebar item or guard method.

### 5.4 Files of interest

| File | Role |
|------|------|
| `backend/prisma/seed/core/permissions.seed.ts` | Catalog source of truth |
| `backend/prisma/seed/core/role-permissions.seed.ts` | Role-permission matrix |
| `backend/src/types/auth.types.ts` | `PANEL_ROLES` (role names) |
| `backend/src/middlewares/permission.middleware.ts` | `requirePermissions` middleware |
| `backend/src/services/authorization.service.ts` | `getAuthenticatedUserProfile` |
| `backend/src/services/auth.service.ts` | `login()` / `me()` return permissions |
| `frontend/lib/auth-guards.ts` | Guard factory (server-driven) |
| `frontend/lib/auth-storage.ts` | `UserRole` type, `StoredUser.permissions` |
| `frontend/hooks/usePermissions.ts` | Hook exposing `can()`, `guards`, `roles` |
| `frontend/components/admin/sidebar.tsx` | `NAV_ITEMS` with `requiredPermissions` |
