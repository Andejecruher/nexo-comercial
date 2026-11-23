# Inventario de endpoints y controles

Base REST: `/api/v1`. “Permiso” se refiere a permiso backend; actualmente todos son roles hardcodeados.

## Autenticación

| Ruta/Endpoint         | Auth                     | Rol        | Permiso | Scope                    | Riesgo                 |
| --------------------- | ------------------------ | ---------- | ------- | ------------------------ | ---------------------- |
| `POST /auth/login`    | Credenciales             | —          | —       | Cuenta                   | Rate limit + lockout   |
| `POST /auth/refresh`  | Refresh JWT + PostgreSQL | —          | —       | Sesión/device            | Rotación               |
| `GET /auth/me`        | Access JWT               | Cualquiera | —       | Usuario propio por `sub` | Bajo                   |
| `POST /auth/logout`   | Access JWT               | Cualquiera | —       | Sesión/usuario propio    | Access no revocado     |
| `POST /auth/register` | Access JWT               | SUPERADMIN | Rol     | Global                   | Puede crear SUPERADMIN |

## Usuarios y configuración

| Ruta/Endpoint                                | Auth | Rol                     | Permiso | Scope       | Riesgo                       |
| -------------------------------------------- | ---- | ----------------------- | ------- | ----------- | ---------------------------- |
| `GET /admin/users[/:id]`                     | JWT  | SUPERADMIN, COORDINADOR | Rol     | Global      | Expone todo el equipo        |
| `POST /admin/users`                          | JWT  | SUPERADMIN              | Rol     | Global      | Permite activo sin rol       |
| `PATCH /admin/users/:id`                     | JWT  | SUPERADMIN              | Rol     | ID cliente  | Auto-desactivación vía PATCH |
| `DELETE /admin/users/:id`                    | JWT  | SUPERADMIN              | Rol     | ID cliente  | Bloquea self solo aquí       |
| `POST/DELETE /admin/users/:id/roles/:roleId` | JWT  | SUPERADMIN              | Rol     | IDs cliente | Sin último-superadmin        |
| `GET /admin/config`                          | JWT  | SUPERADMIN              | Rol     | Global      | Stub estático                |

## Conversaciones y mensajería

| Ruta/Endpoint | Auth | Rol | Permiso | Scope | Riesgo |
| --- | --- | --- | --- | --- | --- |
| `GET /conversations[/:id]` | JWT | Todos los roles | Rol | Global/ID | Sin asignación/departamento |
| `GET /conversations/:id/messages` | JWT | Todos los roles | Rol | Conversation ID | Sin ownership |
| `POST /conversations/:id/messages` | JWT | SUPERADMIN, COORDINADOR, OPERADOR_CHAT | Rol | Conversation ID | Cualquier conversación |
| `POST /conversations/:id/assign` | JWT | SUPERADMIN, COORDINADOR, OPERADOR_CHAT | Rol | `userId`, `departmentSlug` cliente | Asignación arbitraria |
| `POST /conversations/:id/transfer` | JWT | SUPERADMIN, COORDINADOR, OPERADOR_CHAT | Rol | `toUserId`, dept cliente | Transferencia arbitraria |
| `POST /conversations/:id/handover` | JWT | SUPERADMIN, COORDINADOR, OPERADOR_CHAT | Rol | Conversation ID | Sin ownership |
| `POST /conversations/:id/close` | JWT | SUPERADMIN, COORDINADOR, OPERADOR_CHAT | Rol | Conversation ID | Sin ownership |
| `POST /conversations/:id/reopen` | JWT | SUPERADMIN, COORDINADOR, OPERADOR_CHAT | Rol | Conversation ID | Sin ownership |
| `POST /messages/text` | JWT | SUPERADMIN, COORDINADOR, OPERADOR_CHAT | Rol | `to` libre; conversación opcional | Envío a número arbitrario |
| `POST /messages/:id/attachments` | JWT | SUPERADMIN, COORDINADOR, OPERADOR_CHAT | Rol | Message ID | Scope no demostrado |
| `POST /handover/take` | JWT | SUPERADMIN, COORDINADOR, OPERADOR_CHAT | Rol | Conversation ID | Estado FSM |
| `POST /handover/release` | JWT | SUPERADMIN, COORDINADOR, OPERADOR_CHAT | Rol | Conversation ID | No exige agente asignado |
| `POST /handover/escalate` | JWT | SUPERADMIN, COORDINADOR, OPERADOR_CHAT | Rol | Conversation ID | No exige agente asignado |

## Analytics y ciudadanos

| Ruta/Endpoint                           | Auth | Rol                               | Permiso | Scope             | Riesgo                |
| --------------------------------------- | ---- | --------------------------------- | ------- | ----------------- | --------------------- |
| `GET /analytics/*`                      | JWT  | SUPERADMIN, COORDINADOR, ANALISTA | Rol     | Global            | Sin tenant/dept       |
| `GET /citizens[/:id]`                   | JWT  | SUPERADMIN, COORDINADOR           | Rol     | Global/ID         | PII global            |
| `GET /citizens/:id/profile`             | JWT  | SUPERADMIN, COORDINADOR           | Rol     | Citizen ID        | PII + historial       |
| `POST/PATCH/DELETE /citizens`           | JWT  | SUPERADMIN                        | Rol     | Global/ID         | Hard delete ciudadano |
| `POST/DELETE /citizens/:id/tags/:tagId` | JWT  | SUPERADMIN, COORDINADOR           | Rol     | IDs cliente       | Coordinador muta      |
| `POST /citizens/tags/bulk`              | JWT  | SUPERADMIN, COORDINADOR           | Rol     | Hasta 500×100 IDs | Mutación masiva       |

## Eventos y catálogos

| Ruta/Endpoint | Auth | Rol | Permiso | Scope | Riesgo |
| --- | --- | --- | --- | --- | --- |
| `/admin/events*` todas las acciones | JWT | SUPERADMIN, COORDINADOR | Rol | Global/IDs | Sin ownership de organizer |
| `GET /admin/neighborhoods` | JWT | SUPERADMIN, COORDINADOR | Rol | Global | — |
| `GET /admin/tags` | JWT | SUPERADMIN, COORDINADOR | Rol | Global | — |
| `GET /admin/departments` | JWT | SUPERADMIN, COORDINADOR | Rol | Global | — |
| Mutaciones de neighborhoods/tags/departments | JWT | SUPERADMIN | Rol | Global/ID | Soft/hard según servicio |

Las acciones de eventos incluyen listar, crear, ver, editar, invitar, registrar, listar registros, confirmar, check-in y listar asistentes (`backend/src/routes/events.routes.ts:25-59`).

## IA y operación del sistema

| Ruta/Endpoint | Auth | Rol | Permiso | Scope | Riesgo |
| --- | --- | --- | --- | --- | --- |
| `/admin/ai/agents*` | JWT | SUPERADMIN | Rol router | Global | Config sensible |
| `/admin/ai/tools*` | JWT | SUPERADMIN | Rol router | Global | URLs/headers externos |
| `/admin/ai/topics*` | JWT | SUPERADMIN | Rol router | Global | — |
| `/admin/ai/prompts*` | JWT | SUPERADMIN | Rol router | Global | Comportamiento IA |
| `/admin/ai/lines*` | JWT | SUPERADMIN | Rol router | Global | Secretos/canales |
| `GET /system/audit-logs` | JWT | SUPERADMIN | Rol | Global | Logs sensibles |
| `GET /system/inbox-events` | JWT | SUPERADMIN | Rol | Global | Payloads/PII |
| `GET /system/outbox-events` | JWT | SUPERADMIN | Rol | Global | Payloads/PII |
| `POST /system/outbox-events/:id/retry` | JWT | SUPERADMIN | Rol | Event ID | Acción operacional |
| `POST /system/inbox-events/:id/reprocess` | JWT | SUPERADMIN | Rol | Event ID | Acción operacional |

## Público e integración

| Ruta/Endpoint                         | Auth                     | Rol | Permiso                 | Scope           | Riesgo                                 |
| ------------------------------------- | ------------------------ | --- | ----------------------- | --------------- | -------------------------------------- |
| `GET /public/barrios`                 | No                       | —   | Rate limit              | Global          | Intencionalmente público               |
| `POST /public/registro-ciudadano`     | No                       | —   | Rate limit + validación | Payload         | Alta pública                           |
| `GET /public/eventos/semana`          | No                       | —   | Rate limit              | Publicados      | Intencionalmente público               |
| `POST /public/eventos/:id/asistencia` | No                       | —   | Rate limit + validación | Event ID        | Registro público                       |
| `/public/newsletter/*`                | Token puntual/rate limit | —   | —                       | Suscriptor      | Intencionalmente público               |
| `GET /webhook`                        | Challenge Meta           | —   | Verify token/config     | —               | Integración                            |
| `POST /webhook`                       | Firma HMAC               | —   | Idempotencia            | Línea WhatsApp  | ✅ Pipeline dedicado                   |
| `/health`, `/ready`, `/`              | No                       | —   | —                       | Estado servicio | Readiness revela dependencias ok/error |

## Socket.IO

| Canal                          | Auth                 | Rol | Permiso | Scope                  | Riesgo |
| ------------------------------ | -------------------- | --- | ------- | ---------------------- | ------ |
| Namespace `/admin`             | Access JWT           | No  | No      | Global                 | Alto   |
| `conversation.subscribe`       | Conexión autenticada | No  | No      | ID enviado por cliente | Alto   |
| `admin.notification` y updates | Conexión autenticada | No  | No      | Broadcast namespace    | Alto   |

Fuente: `backend/src/services/realtime/websocket-gateway.service.ts`.
