# Hallazgos de seguridad de acceso

> **Nota de vigencia (post-migración Redis-free):** este documento es un relevamiento de un momento dado. Las sesiones de auth, el lockout y el rate limiting ya no usan Redis: hoy se persisten en PostgreSQL (`refresh_sessions`, `identity_lockouts`, `rate_limit_counters`). Las referencias a Redis describen el estado al momento de la auditoría y se conservan por trazabilidad.

Ordenados por severidad. La severidad asume datos ciudadanos reales y usuarios internos no completamente confiables.

## [RATE-01] Rate limits por IP confían en `X-Forwarded-For` controlable

**Severidad:** Alto
**Estado:** Confirmado en código; exposición depende del proxy desplegado
**Componente:** Login, refresh y endpoints públicos
**Archivos afectados:** `backend/src/middlewares/rate-limit.middleware.ts:36-42`; `backend/src/middlewares/public-ip-rate-limit.middleware.ts:9-13`; `backend/src/server.ts`

**Descripción:** los middlewares toman directamente el primer valor de `X-Forwarded-For`. No se encontró configuración `trust proxy` ni validación de proxies confiables.

**Impacto:** un cliente que alcance directamente Express puede rotar el header y eludir límites por IP. El lockout por identidad todavía limita intentos sobre una misma cuenta, pero el control IP deja de ser confiable.

**Escenario de riesgo:** un atacante envía un valor `X-Forwarded-For` distinto en cada login o alta pública.

**Recomendación:** derivar IP mediante `req.ip` con `trust proxy` restringido a la topología real y bloquear acceso directo al proceso.

## [WS-01] WebSocket autentica, pero no autoriza roles ni conversaciones

**Severidad:** Alto
**Estado:** Confirmado
**Componente:** Socket.IO `/admin`
**Archivos afectados:** `backend/src/services/realtime/websocket-gateway.service.ts:35-78,126-153,166-188`

**Descripción:** cualquier access JWT válido puede conectar, aunque no tenga roles. `conversation.subscribe` acepta cualquier string no vacío y une el socket a esa room sin comprobar acceso al recurso. Otros eventos se emiten globalmente al namespace.

**Evidencia:** el middleware solo verifica firma/tipo y guarda claims; no usa `requireRole` ni repositorio.

**Impacto:** exposición en tiempo real de mensajes, estados y notificaciones a cuentas sin el rol REST equivalente.

**Escenario de riesgo:** una cuenta activa sin roles conecta y adivina/obtiene un `conversationId`, luego recibe eventos de esa conversación.

**Recomendación:** exigir roles al handshake y autorizar cada suscripción mediante una policy común con REST; evitar broadcasts globales cuando el evento tenga scope.

## [DATA-01] Acceso global por rol sin scope de asignación o departamento

**Severidad:** Alto
**Estado:** Confirmado
**Componente:** Conversaciones, ciudadanos, analytics y eventos
**Archivos afectados:** `conversation.repository.ts:146-160,218-232`; `conversations.routes.ts`; `citizens.routes.ts`; `events.routes.ts`

**Descripción:** las rutas validan rol, pero servicios/repositorios consultan por ID o dataset global. `assignedUserId`, `departmentSlug` y `organizerUserId` no son condiciones de autorización.

**Impacto:** un operador puede leer/modificar cualquier conversación; coordinadores ven toda la PII y pueden editar cualquier evento, sin límite por responsabilidad.

**Escenario de riesgo:** un operador cambia el UUID en URL y cierra una conversación asignada a otro equipo.

**Recomendación:** definir explícitamente si el producto requiere scope y, de ser así, derivarlo de identidad confiable y aplicarlo en consultas/acciones, no solo en UI.

## [MSG-01] Un rol operativo puede enviar WhatsApp a un número arbitrario

**Severidad:** Alto
**Estado:** Confirmado
**Componente:** Mensajería outbound
**Archivos afectados:** `backend/src/controllers/messages.controller.ts:15-19,42-62`

**Descripción:** `POST /messages/text` acepta `to` como string y `conversationId` opcional. No comprueba que el teléfono pertenezca al ciudadano de una conversación abierta, asignada o visible para el actor.

**Impacto:** uso del canal institucional para spam, mensajes no autorizados o contacto de destinatarios fuera del CRM.

**Escenario de riesgo:** un `OPERADOR_CHAT` llama directamente al endpoint con un número externo y omite `conversationId`.

**Recomendación:** exigir conversación, resolver el destinatario server-side y aplicar estado/asignación/scope antes de encolar.

## [TENANT-01] No existe aislamiento multi-tenant

**Severidad:** Alto si se mezclan municipios/organizaciones; Informativo en single-tenant estricto
**Estado:** Confirmado
**Componente:** Modelo de datos y consultas
**Archivos afectados:** `backend/prisma/schema.prisma`; migraciones y repositorios

**Descripción:** no hay tenant/organization/municipality/membership, claims de tenant, filtros obligatorios ni RLS.

**Impacto:** datos de instituciones distintas quedarían en un dataset común.

**Escenario de riesgo:** incorporar un segundo municipio sin rediseñar el boundary permite a usuarios del primero consultar el segundo.

**Recomendación:** declarar formalmente single-tenant o implementar el boundary completo antes de cargar datos multi-institución.

## [TOKEN-01] Access y refresh tokens accesibles a JavaScript

**Severidad:** Medio
**Estado:** Confirmado
**Componente:** Frontend auth storage
**Archivos afectados:** `frontend/lib/auth-storage.ts:42-60,129-140`

**Descripción:** ambos tokens viven en `localStorage`; el access token también va a una cookie no `HttpOnly`.

**Impacto:** una vulnerabilidad XSS puede robar una sesión renovable de hasta siete días.

**Escenario de riesgo:** script inyectado lee `vc_refresh_token` y rota sesiones desde otro cliente.

**Recomendación:** evaluar refresh token en cookie `HttpOnly; Secure; SameSite`, CSP estricta y reducción de superficie XSS.

## [REV-01] Cambios de rol y desactivación no revocan access tokens vigentes

**Severidad:** Medio
**Estado:** Confirmado
**Componente:** JWT middleware y administración
**Archivos afectados:** `auth.middleware.ts:18-49`; `auth.service.ts:206-227`; `user.service.ts`

**Descripción:** `authMiddleware` no consulta usuario/sesión. El estado y los roles se actualizan al refresh, no por request.

**Impacto:** una cuenta desactivada o degradada conserva permisos hasta la expiración del access token (15 minutos por defecto).

**Escenario de riesgo:** tras remover `SUPERADMIN`, el token previo continúa operando rutas de sistema.

**Recomendación:** invalidar sesiones al cambiar estado/roles y usar versión de sesión/roles o denylist para revocación inmediata de acciones sensibles.

## [ADMIN-01] Invariantes de superadmin incompletas

**Severidad:** Medio
**Estado:** Confirmado
**Componente:** Gestión de usuarios/roles
**Archivos afectados:** `users.controller.ts:68-95,120-174`; `user.service.ts:98-143`

**Descripción:** `DELETE` bloquea auto-desactivación, pero `PATCH` acepta `isActive:false` sobre el propio ID. También se puede remover el propio rol o el último `SUPERADMIN`.

**Impacto:** lockout administrativo y pérdida de capacidad de recuperación desde la aplicación.

**Escenario de riesgo:** único superadmin se auto-desactiva por PATCH o elimina su rol.

**Recomendación:** imponer invariantes en servicio/transacción, cubrir ambas rutas y conservar al menos un superadmin activo.

## [FE-01] Mapa de permisos frontend contradice al backend

**Severidad:** Medio
**Estado:** Confirmado
**Componente:** UI RBAC
**Archivos afectados:** `frontend/lib/auth-guards.ts:27-40`; páginas admin; rutas backend

**Descripción:** frontend concede ciudadanos a operador/analista y eventos a analista, mientras backend los deniega. Además, el sidebar no filtra.

**Impacto:** errores 403, navegación engañosa y riesgo de que futuros equipos confundan el permiso UI con control de seguridad.

**Escenario de riesgo:** analista abre Eventos, ve formularios, pero toda carga/acción falla.

**Recomendación:** generar/compartir capacidades desde una fuente backend y mantener el enforcement en servidor.

## [HANDOVER-01] Release y escalate no exigen ser el agente asignado

**Severidad:** Medio
**Estado:** Confirmado
**Componente:** Handover
**Archivos afectados:** `backend/src/controllers/handover.controller.ts:68-125`

**Descripción:** cualquier rol operativo puede liberar o escalar por `conversationId`; el controlador no compara `req.user.id` con la asignación/lock actual.

**Impacto:** interferencia entre operadores y cambios no autorizados de estado.

**Recomendación:** validar asignación actual o una capacidad explícita de coordinación.

## [CORS-01] Origen CORS por defecto abierto

**Severidad:** Medio
**Estado:** Confirmado en configuración; valor desplegado no demostrado
**Componente:** HTTP
**Archivos afectados:** `backend/src/config/env.config.ts:31-40`; `backend/src/server.ts:65-76`

**Descripción:** `CORS_ORIGIN` usa `*` por defecto. Las APIs usan Bearer header, por lo que CORS no entrega credenciales automáticamente, pero un origen abierto amplía la superficie ante tokens expuestos o clientes mal configurados.

**Recomendación:** exigir allowlist explícita en producción y fallar el arranque ante wildcard.

## [SEED-01] Seed superadmin tenía credenciales fallback conocidas

**Severidad:** Bajo a Alto según despliegue
**Estado:** Mitigado en refactor actual
**Componente:** Seed
**Archivos afectados:** `backend/prisma/seed/dev/superadmin.seed.ts:5-13`

**Descripción:** el antiguo `backend/prisma/seed/seed.ts` creaba `admin@vozcuidadana.mx` con `changeme_in_production_123!` cuando faltaban env vars. Ese archivo fue eliminado en la reorganización de seeders. El superadmin ahora vive en `backend/prisma/seed/dev/superadmin.seed.ts`, que se niega a ejecutar cuando `NODE_ENV === 'production'` y **falla si `SUPERADMIN_PASSWORD` no está definida**; el email y nombre completo aún tienen defaults de desarrollo, pero no la contraseña.

**Impacto:** compromiso total si el seed se ejecuta así en un entorno accesible.

**Escenario de riesgo:** despliegue nuevo ejecuta seed sin secreto y conserva la contraseña.

**Recomendación:** seguir exigiendo `SUPERADMIN_PASSWORD` explícita y rotarla antes del primer login.

## [AUDIT-01] Append-only de auditoría no está impuesto por DB

**Severidad:** Bajo
**Estado:** Confirmado
**Componente:** `AuditLog`
**Archivos afectados:** `backend/prisma/schema.prisma:255-276`; migraciones

**Descripción:** el comentario declara inmutabilidad, pero no se encontraron triggers, RLS o grants que impidan UPDATE/DELETE.

**Impacto:** un proceso con credenciales DB amplias puede alterar trazabilidad.

**Recomendación:** documentar que es garantía de aplicación o imponer privilegios/trigger a nivel DB.

## [SESSION-01] Evicción “FIFO” de sesiones no está demostrada

**Severidad:** Bajo
**Estado:** Parcial
**Componente:** AuthService/Redis
**Archivos afectados:** `backend/src/services/auth.service.ts:345-358`

**Descripción:** se elimina `existing[0]` de un set Redis, estructura sin orden FIFO contractual.

**Impacto:** puede revocarse una sesión distinta de la más antigua.

**Recomendación:** usar sorted set con timestamp o almacenar orden explícito.

## [REDIRECT-01] Destino post-login no se restringe a ruta interna

**Severidad:** Bajo
**Estado:** Confirmado; explotación según semántica de `router.push`/navegador
**Componente:** Login frontend
**Archivos afectados:** `frontend/components/auth/LoginForm.tsx:49-61`

**Descripción:** `redirectTo` se toma del query string y se pasa sin allowlist a `router.push`.

**Impacto:** posible redirección post-login a un destino protocol-relative o no esperado.

**Recomendación:** aceptar solo paths internos que empiecen con `/` y rechazar `//`, esquemas y caracteres de control.
