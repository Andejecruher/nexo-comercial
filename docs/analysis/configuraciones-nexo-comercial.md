# Análisis de Configuraciones — Voz Ciudadana

> Fecha del análisis: 2026-07-09
> Alcance: repositorio actual (backend Express/Prisma, frontend Next.js App Router, worker, Prisma schema y migraciones).
> Metodología: lectura directa de código, rutas, schema, seeds, middlewares, tests y `.env.example`. Cada afirmación se etiqueta con `[CONFIRMADO]`, `[PARCIAL]`, `[INFERIDO]`, `[NO ENCONTRADO]` o `[RIESGO]`.
> Documento no propone plan de integración: solo diagnóstica.
>
> **Actualización de acceso:** para el inventario vigente de usuarios, roles, rutas y riesgos consulte [`../CURRENT_ACCESS_MODEL.md`](../CURRENT_ACCESS_MODEL.md). Las rutas operativas recibieron RBAC durante la misma rama auditada.
>
> **Nota de vigencia (Redis-free):** el backend ya no usa Redis. Las menciones a sesiones/colas/cache en Redis reflejan el estado al 2026-07-09; hoy se resuelven con PostgreSQL (Prisma), Google Pub/Sub y caches in-process. Se conserva por trazabilidad.

---

## 1. Resumen ejecutivo

- **[CONFIRMADO]** Ya existe una vista `Configuraciones` en `/admin/settings` protegida por el permiso frontend `manage:settings`. En su primera versión agrupa: listado real de usuarios del panel (solo lectura), y accesos a catálogos ya administrables (`/admin/barrios`, `/admin/etiquetas`, `/admin/departamentos`) y al panel avanzado de IA (`/admin/ai`). Evidencia: `frontend/components/configuracion/settings-view.tsx`, `frontend/app/(admin)/admin/settings/page.tsx`, `frontend/components/shared/sidebar.tsx:38-48`.
- **[CONFIRMADO]** Los catálogos linkeados (barrios, etiquetas, departamentos, agentes/tools/topics/prompts/lines de IA) son CRUD completos ya cableados contra el backend, con RBAC por rol.
- **[CONFIRMADO]** No existe una capa central `SystemConfig` en Prisma; toda la configuración operativa vive en tres capas separadas y no unificadas:
  1. Variables de entorno validadas por Zod (`backend/src/config/env.config.ts`).
  2. Constantes de código (`config/messaging.constants.ts`, `config/meta.config.ts`, `config/conversation-states.ts`, `ai/orchestrator/orchestrator.ts`, `ai/fsm/fsm-guards.ts`, `services/analytics/analytics.service.ts`, entre otros).
  3. Datos persistidos editables desde el panel (catálogos y tablas IA).
- **[PARCIAL]** El permiso `manage:settings` existe **solo en frontend** (`frontend/lib/shared/auth-guards.ts:22`); el backend usa exclusivamente roles (`SUPERADMIN | COORDINADOR | OPERADOR_CHAT | ANALISTA`) vía `requireRole`/`checkRole`. No hay endpoint que valide `manage:settings` como permiso propio.
- **[RIESGO]** Hay contenido ciudadano y políticas de negocio hardcodeados que hoy no pueden editarse sin redeploy: catálogo `MUNICIPAL_INFO` de la tool IA, `SLA_FIRST_RESPONSE_MINUTES`, mensajes de fallback del orquestador, `REGISTERING_FLOW_PROMPT_INSTRUCTION`.
- **Conclusión** (detallada en §12): el proyecto está **`LISTO CON PRERREQUISITOS`** para planificar una siguiente iteración de Configuraciones. Existen bases sólidas (RBAC backend, RCUD de catálogos, AuditLog, admin IA, `PermissionGate`) pero faltan piezas específicas (permisos backend, `SystemConfig`, UI para preferencias/newsletter/audit) antes de expandir la sección.

---

## 2. Módulos y arquitectura relevante

Fuentes: `docs/backend-modules-map.md`, `docs/ARQUITECTURA.md`, `backend/src/routes/index.ts`, `backend/prisma/schema.prisma`, `frontend/components/shared/sidebar.tsx`.

| Módulo                           | Certeza      | Rol                                                                   | Elementos con potencial de configuración                                                           |
| -------------------------------- | ------------ | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Auth panel + RBAC                | [CONFIRMADO] | Login, refresh, sesiones Redis, lockout progresivo, roles             | Políticas numéricas (`AUTH_*`), TTL de tokens, sesiones máximas, catálogo de roles (`PANEL_ROLES`) |
| Usuarios de panel                | [CONFIRMADO] | CRUD backend + asignación de roles                                    | Alta y asignación de roles hoy sin UI real                                                         |
| Catálogos territoriales          | [CONFIRMADO] | `Neighborhood` con `zone` libre                                       | Sin jerarquía municipal/zona; catálogo plano                                                       |
| Departamentos                    | [CONFIRMADO] | Routing + `serviceHours` y `serviceSchedule` JSON + `keywords[]`      | Editor visual de horario, mantenimiento de keywords, gestión de área "general"                     |
| Etiquetas                        | [CONFIRMADO] | CRUD                                                                  | Uso operativo por IA (`tagCitizen`)                                                                |
| Conversaciones/Mensajes/Handover | [CONFIRMADO] | FSM v2, orquestador, WhatsApp outbound                                | FSM y transiciones son invariantes de dominio                                                      |
| Tickets                          | [PARCIAL]    | Modelo Prisma + `TicketService` internos; no hay endpoint REST propio | Razones de cierre son enum de tool en DB (`ai_tools`) más el string libre en `Ticket.closeReason`  |
| Eventos ciudadanos               | [CONFIRMADO] | CRUD, invitación, check-in                                            | Tipos/estatus son enums en Prisma                                                                  |
| Newsletter público               | [CONFIRMADO] | Suscripción, double opt-in opcional                                   | Sin UI admin para lista, sin envío de email real                                                   |
| Notificaciones/Realtime          | [CONFIRMADO] | Socket.IO admin + outbox durable                                      | Sin preferencias por usuario; `/admin/notificaciones` usa data mock                                |
| IA / WhatsApp                    | [CONFIRMADO] | Agentes, topics, prompts, tools, líneas con secretos cifrados         | Ya administrable en `/admin/ai`; contenido `MUNICIPAL_INFO` y guardrails de output hardcodeados    |
| Analítica / KPIs                 | [CONFIRMADO] | Dashboard, cache Redis 300s                                           | `SLA_FIRST_RESPONSE_MINUTES = 10` hardcodeado                                                      |
| Auditoría                        | [CONFIRMADO] | `AuditLog` append-only + endpoints `/system/audit-logs`               | Sin vista en panel                                                                                 |
| Operación técnica                | [CONFIRMADO] | Colas hybrid/Redis/Postgres, realtime durable, worker                 | Feature flags de infraestructura por env                                                           |

Notas relevantes de RBAC efectivo en backend:

- Rutas administrativas usan `requireRole([...])` (`backend/src/middlewares/rbac.ts`). Ver `users.routes.ts`, `neighborhoods.routes.ts`, `tags.routes.ts`, `departments.routes.ts`, `events.routes.ts`, `system.routes.ts`.
- `admin-ai.routes.ts` usa `authMiddleware` + `requireRole(['SUPERADMIN'])`.
- `conversations.routes.ts`, `messages.routes.ts`, `handover.routes.ts` y `analytics.routes.ts` aplican `requireRole` además de JWT. La matriz vigente está en `docs/reference/roles-permissions-matrix.md`.
- La administración efectiva de usuarios está en `createUsersRouter`, montado bajo `/api/v1/admin` desde `routes/index.ts`.

---

## 3. Configuraciones existentes

### 3.1 Persistidas en base de datos (ya administrables desde el panel)

| Configuración                     | Ubicación                                                                       | Estado                                                                                                                                                    | Consumidores                                                                     | Problema                                                                   | ¿Debe ir en Configuraciones?                |
| --------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------- |
| Barrios                           | Prisma `Neighborhood`; UI `/admin/barrios`; API `/api/v1/admin/neighborhoods`   | CRUD funcional                                                                                                                                            | AI (`validate-neighborhood`), CRM ciudadanos, registro público                   | Sin jerarquía; `zone` texto libre; sin gestión de alias                    | Ya está                                     |
| Etiquetas                         | Prisma `Tag`; UI `/admin/etiquetas`; API `/api/v1/admin/tags`                   | CRUD funcional                                                                                                                                            | AI (`tagCitizen`), CRM                                                           | `name` con `citext` único, ok                                              | Ya está                                     |
| Departamentos                     | Prisma `Department`; UI `/admin/departamentos`; API `/api/v1/admin/departments` | CRUD funcional                                                                                                                                            | Routing FSM (`assign-department-v2`), `getMunicipalInfo`, tickets/conversaciones | `serviceSchedule` es JSON sin editor visual; `keywords` requieren tocar UI | Ya está; falta editor de horario y keywords |
| Agentes IA                        | Prisma `AiAgent`; UI `/admin/ai/agents`; API `/api/v1/admin/ai/agents`          | CRUD funcional (SUPERADMIN)                                                                                                                               | Orquestador IA, líneas                                                           | `model` string libre sin allowlist                                         | Ya está                                     |
| Tools IA                          | Prisma `AiTool`; UI `/admin/ai/tools`                                           | CRUD funcional                                                                                                                                            | Runner interno/externo                                                           | `externalAuthEnvKey` acopla DB con env                                     | Ya está                                     |
| Topics IA + keywords              | Prisma `AiTopic`, `AiTopicTool`                                                 | CRUD funcional                                                                                                                                            | `topic.registry` (routing por keywords)                                          | Sin previsualización de matching                                           | Ya está                                     |
| Prompts IA versionados            | Prisma `AiPrompt`                                                               | CRUD + activación                                                                                                                                         | Orquestador                                                                      | Semilla en TS y DB pueden divergir                                         | Ya está                                     |
| Líneas de comunicación (WhatsApp) | Prisma `CommunicationLine`; UI `/admin/ai/lines`                                | CRUD funcional; secretos cifrados con AES-256-GCM en escritura y seed                                                                                     | `WhatsAppLineConfigResolver`, cache                                              | Cache TTL 60s sin invalidación manual                                      | Ya está                                     |
| Suscriptores newsletter           | Prisma `NewsletterSubscriber`                                                   | Sin UI admin                                                                                                                                              | `public-newsletter.controller`                                                   | Admin no puede ver/exportar                                                | Sí, brecha                                  |
| Auditoría                         | Prisma `AuditLog`; API `/api/v1/system/audit-logs`                              | Sin UI admin                                                                                                                                              | Todos los servicios sensibles                                                    | Existe endpoint pero no vista                                              | Sí, brecha                                  |
| Usuarios y roles                  | Prisma `User`, `Role`, `UserRole`                                               | Listado en `SettingsView`; alta y asignación deshabilitadas en frontend aunque backend expone `POST /admin/users` y `POST /admin/users/:id/roles/:roleId` | Auth, RBAC                                                                       | Frontend deshabilita botón; falta UI segura                                | Sí, brecha priorizable                      |

### 3.2 Vista actual de Configuraciones

Evidencia clave:

```18:43:frontend/components/configuracion/settings-view.tsx
const SETTINGS_LINKS = [
  {
    href: '/admin/barrios',
    title: 'Territorio y barrios',
    ...
  },
  {
    href: '/admin/etiquetas',
    title: 'Etiquetas',
    ...
  },
  {
    href: '/admin/departamentos',
    title: 'Departamentos',
    ...
  },
  {
    href: '/admin/ai',
    title: 'Canales e IA avanzada',
    ...
  },
];
```

```117:121:frontend/components/configuracion/settings-view.tsx
            <Button type="button" variant="outline" size="sm" disabled>
              Alta y roles no disponibles
            </Button>
```

Protección de la ruta:

```4:23:frontend/app/(admin)/admin/settings/page.tsx
export default function AdminSettingsPage() {
  return (
    <PermissionGate
      permission="manage:settings"
      fallback={...}
    >
      ...
      <SettingsView />
```

Permisos frontend:

```27:40:frontend/lib/shared/auth-guards.ts
const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  SUPERADMIN: [..., 'manage:users', 'manage:settings', 'assign:roles'],
  COORDINADOR: [..., 'manage:settings'],
  OPERADOR_CHAT: ['view:inbox', 'view:citizens'],
  ANALISTA: ['view:dashboard', 'view:citizens', 'view:events'],
};
```

`SUPERADMIN` y `COORDINADOR` acceden a `/admin/settings`, pero cualquier `COORDINADOR` verá los enlaces a Barrios/Etiquetas/Departamentos y al presionar acciones de escritura recibirá 403 del backend (las escrituras son `SUPERADMIN` only) **[RIESGO]** de fricción UX.

---

## 4. Configuraciones hardcodeadas o dispersas

| Configuración detectada                                                                             | Ubicación                                                                                                                                        | Estado actual                      | Consumidores                          | Problema                                                                        | ¿Debe ir en Configuraciones?   |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------ |
| Catálogo `MUNICIPAL_INFO` (horarios, servicios, contacto, requisitos, FAQ)                          | `backend/src/ai/tools/get-municipal-info.tool.ts:103-169`                                                                                        | Constante TS                       | IA responde al ciudadano              | Contenido municipal editable por comunicación, no dev                           | Sí, alta prioridad             |
| Mensajes fallback del orquestador (`GUARDED_FALLBACK_RESPONSE`, `OUTPUT_BLOCKED_FALLBACK_RESPONSE`) | `backend/src/ai/orchestrator/orchestrator.ts:62-66`                                                                                              | Constante TS                       | Respuestas al ciudadano en errores IA | Redacción no editable por admin                                                 | Sí                             |
| Instrucción de flow `REGISTERING`                                                                   | `backend/src/ai/fsm/fsm-guards.ts:119-120`                                                                                                       | Constante TS                       | Inyectada al system prompt            | Se sale del sistema de prompts de DB                                            | Sí, mover a `AiPrompt`         |
| Guardrails de output (regex bloqueadas)                                                             | `backend/src/ai/security/output-guardrail.ts:11-36`                                                                                              | Constantes TS                      | Guardan salida IA                     | Política de contenido no editable                                               | Sí (con validación segura)     |
| SLA de primera respuesta                                                                            | `backend/src/services/analytics/analytics.service.ts:32` (`SLA_FIRST_RESPONSE_MINUTES = 10`)                                                     | Constante                          | Dashboard de indicadores              | Política municipal, decisión de coordinación                                    | Sí                             |
| TTL de cache analytics                                                                              | `analytics.service.ts:33`                                                                                                                        | Constante                          | Redis                                 | Técnico                                                                         | No                             |
| Límites del orquestador (`maxIterations 20`, `maxToolCalls 10`, `duplicateToolLoopThreshold 3`)     | `backend/src/ai/orchestrator/orchestrator.ts:56-60` y también `backend/src/ai/fsm/fsm-guards.ts:111-117` (duplicado)                             | Doble fuente de verdad             | Orquestador IA                        | `orchestrator.ts` no lee `AI_DUPLICATE_TOOL_LOOP_THRESHOLD`; `fsm-guards.ts` sí | Unificar (candidato panel IA)  |
| Zona horaria del municipio                                                                          | `env.config.ts:139` (`PUBLIC_EVENTS_TZ`), `get-municipal-info.tool.ts:182` y `assign-department-v2.tool.ts:87` (default `'America/Mexico_City'`) | Triple fuente                      | Eventos, IA                           | Divergencia silenciosa si se cambia una sola                                    | Unificar (config técnica)      |
| Cotas de tools externas                                                                             | `backend/src/ai/security/tool-policy.ts:12` (`Math.min(tool.timeoutMs, 15_000)`)                                                                 | Hardcoded                          | ExternalToolRunner                    | Cap invisible desde UI                                                          | No editable, pero visible      |
| Salt bcrypt                                                                                         | `backend/src/utils/password.util.ts:6` (`SALT_ROUNDS = 12`)                                                                                      | Hardcoded                          | AuthService                           | Debe subirse con hardware                                                       | Config técnica                 |
| Colas y retries                                                                                     | `backend/src/config/messaging.constants.ts:41-66` (`QUEUE_CONFIG`)                                                                               | Constantes                         | Procesadores inbox/outbox, WhatsApp   | Ajuste requiere redeploy                                                        | Config técnica                 |
| API version Meta                                                                                    | `backend/src/config/meta.config.ts:5` (`META_API_VERSION = 'v20.0'`)                                                                             | Constante                          | WhatsAppProvider                      | Depende de deprecaciones Meta                                                   | Config técnica                 |
| Bounding box Cintalapa                                                                              | `messaging.constants.ts:72-76`                                                                                                                   | Constante                          | Validación IA                         | Invariante geográfico municipal                                                 | No editable (invariante)       |
| Presencia online admin                                                                              | `frontend/components/shared/admin-layout.tsx:30-42`                                                                                               | Estado local UI                    | Solo cosmético                        | No persiste ni notifica                                                         | No (o backlog UX)              |
| Notificaciones vista `/admin/notificaciones`                                                        | `frontend/components/notificaciones/notifications-view.tsx` + `lib/mock-notifications.ts`                                                                 | Datos mock                         | Vista admin                           | Falso positivo funcional                                                        | Debería marcarse o rediseñarse |
| `Ticket.closeReason` valores                                                                        | Prisma `String?` libre + enum en JSON Schema de la tool `close-conversation` (`backend/src/ai/tools/close-conversation.tool.ts:17`)              | Divergencia entre DB y contrato IA | Cierre de tickets                     | Puede aceptarse cualquier string fuera del enum                                 | Candidato a catálogo           |

Variables de entorno con connotación de negocio (más candidatas a exponer con supervisión):

- `NEWSLETTER_DOUBLE_OPT_IN`, `NEWSLETTER_CONFIRM_TTL_HOURS` (`env.config.ts:154, 157`).
- Políticas de auth: `AUTH_MAX_SESSIONS_PER_USER`, `AUTH_LOCKOUT_MAX_ATTEMPTS`, `AUTH_LOCKOUT_DURATIONS`, `JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`.
- `AI_TIMEOUT_MS`, `AI_DUPLICATE_TOOL_LOOP_THRESHOLD`.
- Rate limits públicos (`PUBLIC_*_RATE_LIMIT_*`) — sensibles a picos de tráfico municipal.

Anomalías detectadas:

- **[CONFIRMADO]** `ANTHROPIC_API_KEY` está declarado como opcional en el schema Zod; los entornos sin provider Anthropic pueden arrancar sin esa llave.
- **[CONFIRMADO]** `frontend/lib/shared/conversation-fsm.ts` mantiene una tabla de transiciones que diverge de `backend/src/config/conversation-states.ts` (por ejemplo, permite regresos a `BOT_FLOW` que backend no acepta). El backend es autoridad; el frontend puede mostrar acciones no permitidas.
- **[CONFIRMADO]** El seed cifra `whatsappAppSecret` y `whatsappAccessToken` antes de persistirlos.

---

## 5. Necesidades detectadas

Cada necesidad se apoya en evidencia y describe qué problema real resolvería.

1. **[CONFIRMADO]** Backend con permiso `manage:settings` real (o mapeo a roles) para que la protección deje de ser sólo frontend. Hoy `/admin/config` es un stub estático que devuelve JSON hardcodeado (`backend/src/routes/users.routes.ts:31-44`) y `PermissionGate` es aplicado sólo en cliente.
2. **[CONFIRMADO]** Alta y asignación segura de usuarios y roles vía UI. El backend ya expone `POST /admin/users`, `PATCH /admin/users/:id`, `POST /admin/users/:id/roles/:roleId`, `DELETE /admin/users/:id/roles/:roleId` con `requireRole(['SUPERADMIN'])`. El frontend deshabilita el botón.
3. **[CONFIRMADO]** Editor visual de `serviceSchedule` y `keywords[]` de departamentos. El schema y validación existen (`schema.prisma:531-546`, `services/departments.service.ts`), pero la UI actual maneja `serviceHours` como texto y no facilita el JSON estructurado consumido por `assign-department-v2.tool.ts` para decidir si el departamento está abierto.
4. **[CONFIRMADO]** Gestión de contenido del asistente (catálogo `MUNICIPAL_INFO`, mensajes fallback, instrucción `REGISTERING`). Sin un modelo propio, comunicación depende de despliegues.
5. **[CONFIRMADO]** Vista de auditoría (`/system/audit-logs` ya existe) y de operación de colas (`/system/inbox-events`, `/system/outbox-events`, `retry`, `reprocess`). Falta UI para SUPERADMIN.
6. **[CONFIRMADO]** SLA de primera respuesta editable desde el panel (política municipal) y visible en la sección de Indicadores.
7. **[PARCIAL]** Preferencias de notificación por usuario admin. Hoy la campana usa Zustand en memoria y la vista `/admin/notificaciones` es mock; el modelo no existe en Prisma.
8. **[PARCIAL]** Administración de razones de cierre de ticket como catálogo (hoy string libre + enum en JSON Schema de tool).
9. **[PARCIAL]** Rotación/visualización de estado de secretos por línea (fecha última actualización, botón de invalidar cache) sin exponer el valor. Backend ya cifra al escribir; falta cerrar el ciclo operativo.
10. **[PARCIAL]** Gestión y export de suscriptores del newsletter (existen datos pero no vista).
11. **[INFERIDO]** Publicación de límites y feature flags técnicos como consulta (solo lectura) para SUPERADMIN, sin edición desde panel, para diagnosticar sin acceder al servidor.

---

## 6. Propuesta de la sección Configuraciones

Estructura sustentada exclusivamente en hallazgos de §3–§5:

```text
Configuraciones
├── General
│   ├── Datos del municipio (solo lectura al inicio: zona horaria, bounding box)
│   └── Sistema (solo lectura: feature flags técnicos, versión, health)
├── Equipo y accesos
│   ├── Usuarios del panel (listado real ya implementado)
│   ├── Alta de usuarios y asignación de roles (brecha #2)
│   └── Roles disponibles (catálogo, solo lectura sobre PANEL_ROLES)
├── Territorio y catálogos
│   ├── Barrios (ya existe)
│   ├── Etiquetas (ya existe)
│   └── Departamentos (ya existe + editor de horario y keywords, brecha #3)
├── Atención
│   ├── SLA de primera respuesta (brecha #6)
│   └── Razones de cierre de ticket (brecha #8)
├── Canales e IA
│   ├── Agentes, tools, topics, prompts, líneas (ya existe en /admin/ai)
│   ├── Contenido del asistente (MUNICIPAL_INFO, fallbacks) (brecha #4)
│   └── Estado de credenciales por línea + invalidar cache (brecha #9)
├── Comunicaciones
│   └── Newsletter: suscriptores y política double opt-in (brecha #10)
├── Notificaciones
│   └── Preferencias por usuario admin (brecha #7)
└── Auditoría y operación
    ├── Registro de auditoría (brecha #5)
    └── Eventos inbox/outbox y reintentos (brecha #5)
```

Por sección:

- **General**: propósito → transparencia técnica; roles → SUPERADMIN; módulos afectados → observabilidad.
- **Equipo y accesos**: propósito → gestión de personas y RBAC; roles → SUPERADMIN (escritura), COORDINADOR (lectura); módulos → Auth, RBAC, AuditLog.
- **Territorio y catálogos**: propósito → mantener datos operativos de dominio; roles → SUPERADMIN (escritura), COORDINADOR (lectura); módulos → CRM, IA, Public.
- **Atención**: propósito → parámetros de gestión social (SLA, cierres); roles → SUPERADMIN; módulos → Analytics, Tickets.
- **Canales e IA**: propósito → editar comportamiento del asistente y credenciales por línea; roles → SUPERADMIN; módulos → IA, WhatsApp, Realtime.
- **Comunicaciones**: propósito → visibilidad y decisión sobre newsletter; roles → SUPERADMIN; módulos → Newsletter público.
- **Notificaciones**: propósito → adaptar señales por usuario; roles → cada usuario para su preferencia, SUPERADMIN para defaults; módulos → Realtime, Frontend admin.
- **Auditoría y operación**: propósito → observar acciones sensibles y cola de eventos; roles → SUPERADMIN; módulos → AuditLog, InboxEvent, OutboxEvent, RealtimeOutboxEvent.

---

## 7. Roles y alcances

Basado en `backend/src/types/auth.types.ts` y comportamiento efectivo del backend.

| Sección                        | SUPERADMIN                                     | COORDINADOR    | OPERADOR_CHAT  | ANALISTA       | Alcance        |
| ------------------------------ | ---------------------------------------------- | -------------- | -------------- | -------------- | -------------- |
| General                        | Lectura                                        | Lectura        | Ninguno        | Ninguno        | Global         |
| Equipo y accesos               | Lectura + escritura                            | Lectura        | Ninguno        | Ninguno        | Global         |
| Territorio y catálogos         | Escritura                                      | Lectura        | Ninguno        | Ninguno        | Organizacional |
| Atención (SLA, razones cierre) | Escritura                                      | Lectura        | Ninguno        | Ninguno        | Global         |
| Canales e IA                   | Escritura                                      | Ninguno        | Ninguno        | Ninguno        | Por módulo IA  |
| Comunicaciones (newsletter)    | Escritura                                      | Lectura        | Ninguno        | Ninguno        | Global         |
| Notificaciones                 | Su preferencia (todos) + defaults (SUPERADMIN) | Su preferencia | Su preferencia | Su preferencia | Por usuario    |
| Auditoría y operación          | Lectura + acciones (retry/reprocess)           | Ninguno        | Ninguno        | Ninguno        | Técnica        |

Notas:

- **[RIESGO]** COORDINADOR puede alcanzar catálogos por navegación pero todas las escrituras responden 403 (`requireRole(['SUPERADMIN'])`). Alineación UI/BE pendiente.
- **[RIESGO]** El backend usa roles, no permisos. `manage:settings` no tiene par backend; cualquier extensión debe elegir entre (a) mapear permisos → roles en middleware, (b) introducir permisos persistidos.

---

## 8. Elementos que no deben ser configurables

| Elemento                                                                                                                                                     | Ubicación                                                                            | Por qué no editable                                                                                             | Alternativa recomendada                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `ENCRYPTION_KEY`                                                                                                                                             | `env.config.ts:84`, `utils/crypto.ts`                                                | Rota implica pérdida irreversible de tokens cifrados en `CommunicationLine` (no hay re-encripción implementada) | Solo env; rotación con job dedicado si algún día se necesita     |
| `JWT_SECRET` / `JWT_REFRESH_SECRET`                                                                                                                          | `env.config.ts:85-86`                                                                | Cambiar invalida todas las sesiones activas                                                                     | Solo env                                                         |
| `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_ACCESS_TOKEN` (globales)                                                                           | `env.config.ts:165-170`                                                              | Ruptura inmediata del webhook Meta o del outbound                                                               | Solo env; gestión per-línea vía `CommunicationLine` (write-only) |
| `DATABASE_URL`, `REDIS_URL`                                                                                                                                  | `env.config.ts:54-55`                                                                | Infraestructura                                                                                                 | Solo env                                                         |
| `PANEL_ROLES`                                                                                                                                                | `backend/src/types/auth.types.ts:12`                                                 | Es tupla `as const` referenciada por tipos y por `requireRole` en múltiples rutas                               | Nuevos roles requieren cambio coordinado de código, seed y RBAC  |
| Enums de dominio (`ConversationFlowState`, `TicketStatus/Priority/Source`, `EventStatus/Type`, `RegistrationStatus`, `AttendanceStatus`, `AIProvider`, etc.) | `schema.prisma`                                                                      | Invariantes de dominio; alterarlos requiere migración                                                           | Solo migración Prisma con tests                                  |
| `VALID_TRANSITIONS` FSM                                                                                                                                      | `backend/src/config/conversation-states.ts`, `backend/src/ai/fsm/fsm-transitions.ts` | Transiciones acopladas a `ConversationMeta.version` y a tools                                                   | Cambios controlados en código                                    |
| `SocketEventName`, `CriticalEventType`, `EphemeralEventType`, `REALTIME_SCHEMA_VERSION`                                                                      | `backend/src/services/realtime/realtime-event.contracts.ts`                          | Contratos frontend/backend; `classifyEvent()` lanza en tipos desconocidos                                       | Nunca en panel                                                   |
| `QUEUE_CONFIG` (retries, TTLs, batch, rate)                                                                                                                  | `backend/src/config/messaging.constants.ts:41-66`                                    | Coexistencia con estado ya en Redis/Postgres puede corromper colas si se cambia mid-flight                      | Config técnica versionada por deploy                             |
| `PRIVATE_HOSTS` (anti-SSRF)                                                                                                                                  | `backend/src/ai/security/http-safety.ts:3-9`                                         | Protección contra endpoints internos                                                                            | Solo código                                                      |
| `CINTALAPA_BOUNDS`                                                                                                                                           | `messaging.constants.ts:72-76`                                                       | Invariante geográfico del municipio                                                                             | Solo código                                                      |
| Identificadores internos (`slug` de departamentos ya referenciados en tickets, conversaciones, asignaciones)                                                 | Prisma                                                                               | No hay FK a `departments.slug`; renombrar deja registros huérfanos                                              | Deshabilitar renombrado de slug, permitir cambiar `name`         |
| Contratos de API (endpoints, shapes)                                                                                                                         | Rutas y schemas Zod                                                                  | Ruptura para consumidores públicos y frontend                                                                   | Cambios semver, no runtime                                       |

---

## 9. Impacto técnico y dependencias

| Grupo de configuración                                                                   | Impacto técnico                                                                                  | Dependencias                                                  | Riesgo                                          | Prioridad         |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- | ----------------------------------------------- | ----------------- |
| Backend `manage:settings` real                                                           | Middleware nuevo o mapping roles↔permisos; alinear frontend                                      | RBAC (`rbac.ts`, `role.middleware.ts`), tests de auth         | Bajo (no rompe datos)                           | Alta              |
| Alta y asignación de usuarios/roles en UI                                                | Formularios + validación + confirmaciones; AuditLog ya cubre                                     | `users.controller`, `auth.service`, `AuditLog`                | Medio (permisos)                                | Alta              |
| Departamentos: editor de `serviceSchedule` y `keywords`                                  | UI compleja + validación coincidente con `service-schedule`                                      | `assign-department-v2.tool`, `get-municipal-info.tool`        | Medio (routing IA depende)                      | Alta              |
| Contenido asistente (`MUNICIPAL_INFO`, fallbacks, `REGISTERING_FLOW_PROMPT_INSTRUCTION`) | Nueva tabla o reutilizar `AiPrompt`; refactor de tools que lo leen                               | `orchestrator.ts`, `get-municipal-info.tool`, `fsm-guards.ts` | Medio (afecta respuestas al ciudadano)          | Alta              |
| SLA y razones de cierre                                                                  | Nueva persistencia + lectura en Analytics/Tickets                                                | `AnalyticsService`, cierre de tickets (tools y controllers)   | Bajo/Medio                                      | Media             |
| Vista de auditoría y operación de colas                                                  | Solo UI sobre endpoints existentes (`/system/*`)                                                 | `SystemController`                                            | Bajo                                            | Media             |
| Newsletter (lista + política)                                                            | UI + posiblemente export CSV; considerar privacidad                                              | `newsletter.service`, `NewsletterSubscriber`                  | Bajo                                            | Media             |
| Preferencias de notificación por usuario                                                 | Nuevo modelo Prisma + filtros en gateway; migrar mock a real                                     | `websocket-gateway.service`, campana                          | Medio (cambia contrato de notificaciones)       | Media             |
| Estado de credenciales por línea                                                         | UI de "última rotación" e invalidar cache; sin exponer valores                                   | `communication-line-cache.service`, admin AI                  | Alto si se expone lectura                       | Media             |
| `SystemConfig` genérico                                                                  | Nueva tabla + cache Redis + hot reload; refactor de servicios que hoy leen `env` en construcción | `LockoutService`, `AIOrchestrator`, `AnalyticsService`        | Alto (invariantes ocultas de "leído al inicio") | Media (posterior) |

Orden lógico sugerido de integración (solo secuenciación, no plan de trabajo):

1. Cierre de permisos backend (`manage:settings` real) y alineación UI/BE de escrituras.
2. Alta de usuarios y asignación de roles con AuditLog.
3. Editor de horario y keywords de departamentos.
4. Contenido del asistente en DB reutilizando `AiPrompt` cuando aplique.
5. SLA y razones de cierre.
6. Vista de auditoría y operación de colas.
7. Newsletter y preferencias de notificación.
8. Estado/rotación de credenciales por línea.
9. Modelo `SystemConfig` con cache invalidable, sólo tras estabilizar lo anterior.

---

## 10. Riesgos y brechas

- **[CONFIRMADO]** `whatsappAppSecret` y `whatsappAccessToken` se cifran tanto en el controller como en `backend/prisma/seed/dev/ai-module.seed.ts`.
- **[RIESGO — Alto]** Slugs de departamento sin FK; renombrar rompe históricos de tickets/asignaciones/conversaciones. Bloquear rename es más barato que introducir FK.
- **[CONFIRMADO]** `conversations.routes.ts`, `messages.routes.ts`, `handover.routes.ts` y `analytics.routes.ts` exigen JWT más `requireRole`; los scopes vigentes están documentados en `docs/reference/protected-endpoints.md`.
- **[RIESGO — Alto]** Divergencia FSM frontend/backend (`frontend/lib/shared/conversation-fsm.ts` vs `backend/src/config/conversation-states.ts`). UI puede sugerir acciones que el backend rechazará.
- **[CONFIRMADO]** `ANTHROPIC_API_KEY` está declarada como opcional en el schema Zod para no bloquear entornos que no usan ese provider.
- **[RIESGO — Medio]** Doble definición de límites del orquestador (`orchestrator.ts` vs `fsm-guards.ts`); un env cambia solo un path.
- **[RIESGO — Medio]** Cache de `CommunicationLine` con TTL 60s y sin invalidación manual desde panel; rotaciones de credenciales quedan opacas por hasta 60 s.
- **[RIESGO — Medio]** `/admin/notificaciones` muestra data mock; usuario final puede confundirlo con datos reales.
- **[CONFIRMADO]** La administración efectiva de usuarios se consolidó en `users.routes.ts`; el router duplicado anterior fue eliminado.
- **[NO ENCONTRADO]** Integración real de envío de email (double opt-in de newsletter genera token pero no hay adapter de correo).
- **[NO ENCONTRADO]** Modelo `SystemConfig` o similar para settings persistidos con cache.
- **[NO ENCONTRADO]** Modelo de permisos backend (no existe `Permission` en Prisma).
- **[NO ENCONTRADO]** UI de preferencias de notificación por usuario.

---

## 11. Priorización

Prioridad P0 (habilitadores; sin ellos las siguientes son riesgosas):

1. `manage:settings` en backend y alineación con frontend.
2. ✅ Completado en la rama auditada: rutas sensibles usan `requireRole`.
3. ✅ Completado en la rama auditada: `slug` inmutable por aplicación y secretos cifrados en seed.

Prioridad P1 (valor operativo alto, cambios acotados):

1. Alta de usuarios y asignación de roles (backend ya listo).
2. Editor de horario y keywords de departamentos.
3. Vista de auditoría y operación de colas sobre `/system/*`.
4. SLA de primera respuesta editable.

Prioridad P2 (mejoras de contenido y comunicación):

1. Contenido del asistente (`MUNICIPAL_INFO`, fallbacks, `REGISTERING`) en DB.
2. Newsletter: lista, export y política double opt-in.
3. Razones de cierre de ticket como catálogo.

Prioridad P3 (requiere infraestructura nueva o coordinación mayor):

1. Preferencias de notificación por usuario.
2. Estado/rotación de credenciales por línea con invalidación de cache.
3. Modelo `SystemConfig` con hot reload y unificación de defaults del orquestador y zona horaria.

---

## 12. Conclusión y nivel de preparación

Respuestas a las preguntas objetivo:

1. **¿Necesita Voz Ciudadana una sección centralizada de Configuraciones?** Sí. Ya existe una primera versión útil pero fragmentaria; el resto de configuración vive en tres capas no unificadas.
2. **¿Qué debería incluir una primera versión?** Lo ya presente (Equipo lectura + catálogos + IA) más los P0 y los P1 con impacto directo: `manage:settings` backend, alta/roles de usuarios, editor de horario y keywords de departamentos, vista de auditoría y operación de colas, y SLA editable.
3. **¿Qué debería quedar para fases posteriores?** P2 y P3: contenido del asistente, newsletter, razones de cierre como catálogo, preferencias de notificación, credenciales por línea, `SystemConfig`.
4. **¿Qué configuraciones actuales deberían centralizarse?** Los cuatro accesos ya agrupados en `SettingsView` más los enlaces de auditoría y operación de colas.
5. **¿Qué valores hardcodeados deberían revisarse?** `MUNICIPAL_INFO`, `SLA_FIRST_RESPONSE_MINUTES`, mensajes fallback del orquestador, `REGISTERING_FLOW_PROMPT_INSTRUCTION`, y unificación de defaults duplicados del orquestador y de zona horaria.
6. **¿Qué riesgos existen?** Los listados en §10, especialmente RBAC efectivo en rutas JWT-only, seed que guarda `whatsappAppSecret` en claro, y renombre de slug de departamento sin FK.
7. **¿Qué prerrequisitos deben resolverse antes de implementar?** P0 completo: permiso backend real, cierre de rutas JWT-only, protección del slug de departamento, cifrado consistente de secretos por línea; y decisiones de producto sobre razones de cierre y contenido del asistente (quién es "dueño" del texto).
8. **¿El proyecto está listo para generar un plan de integración?** Sí, con condiciones.

**Clasificación final: `LISTO CON PRERREQUISITOS`.**

Justificación: existen infraestructura y patrones suficientes (RBAC backend, CRUDs administrativos maduros, `PermissionGate`, `AuditLog`, endpoints `/system/*`, admin IA completo) para planificar una expansión de Configuraciones, pero hay huecos concretos y evitables que si no se resuelven antes convertirían la próxima iteración en una fuente de regresiones (RBAC efectivo, cifrado en seed, ausencia de permiso backend, divergencia FSM UI/BE, ausencia de `SystemConfig`). Estos prerrequisitos son acotados y no requieren rediseño arquitectónico.
