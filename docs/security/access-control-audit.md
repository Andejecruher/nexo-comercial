# Auditoría de control de acceso

> **Nota de vigencia (post-migración Redis-free):** auditoría de un momento dado. La mención a Redis corresponde al estado previo a la migración; hoy las sesiones, el lockout y el rate limiting viven en PostgreSQL (`refresh_sessions`, `identity_lockouts`, `rate_limit_counters`). Se conserva por trazabilidad.

## Método

Inspección cruzada de:

- Prisma schema, migraciones y seeds;
- auth, tokens, lockout y Redis;
- middlewares y registro efectivo de routers;
- controllers, services y repositories;
- App Router, guards, storage y API client;
- Socket.IO;
- pruebas y documentación existente.

Se tomó como estado real el código conectado desde `backend/src/routes/index.ts`, no archivos históricos o comentarios.

## Pruebas ejecutadas

### Backend

Comando:

```bash
pnpm test -- --runInBand src/__tests__/integration/auth.integration.test.ts src/__tests__/integration/rbac-jwt-routes.integration.test.ts
```

Resultado: **2 suites, 29 pruebas aprobadas**.

Comprueba:

- 401 sin Authorization;
- 403 para roles no permitidos;
- accesos permitidos por rol en usuarios, conversaciones, mensajes, handover y analytics;
- wiring de login, refresh y logout.

Límite: ambas suites sustituyen middleware/servicios con mocks. Demuestran la composición de rutas y respuestas, no una sesión real PostgreSQL+Redis ni firma JWT end-to-end.

Huecos ejecutables detectados:

- `PATCH` y `DELETE /admin/users/:id`;
- auto-desactivación por DELETE y por PATCH;
- `POST /auth/register` y `GET /auth/me`;
- usuario multi-rol y usuario con token sin roles;
- autorización de rooms Socket.IO;
- envío de `/messages/text` vinculado a una conversación;
- contratos distintos de error entre `checkRole` legacy y `requireRole`.

### Frontend

Comando:

```bash
pnpm test -- hooks/__tests__/useAuth.test.ts
```

Vitest ejecutó la suite completa: **16 archivos, 162 pruebas aprobadas**, incluidas 14 pruebas de `useAuth`.

Comprueba restauración, refresh silencioso, login, logout y sincronización entre pestañas con mocks del API client.

## Escenarios obligatorios

| Escenario                           | Resultado                                                               | Evidencia                         |
| ----------------------------------- | ----------------------------------------------------------------------- | --------------------------------- |
| No autenticado a ruta privada       | ✅ 401 backend; redirect cliente                                        | Tests auth/RBAC; `ProtectedRoute` |
| Ciudadano a endpoint admin          | ❓ Citizen no tiene sesión/rol; un request sin JWT recibe 401           | Separación `Citizen`/`User`       |
| Cambiar ID en URL/payload           | ⚠️ UUID/existencia sí; ownership/tenant no                              | Services/repositorios             |
| Organización A consulta B           | ❌ A/B no existen; sin aislamiento si se mezclan                        | Schema y consultas                |
| Admin se convierte en superadmin    | ✅ Solo SUPERADMIN puede asignar; no hay escalación desde roles menores | `users.routes.ts`                 |
| Payload `{role:"superadmin"}`       | ✅ No cambia rol; campo fuera del schema                                | `UpdateUserSchema`                |
| Llamada directa a API oculta        | ✅ Backend vuelve a validar rol                                         | Routers con `requireRole`         |
| Usuario sin roles conecta a WS      | ⚠️ Permitido con JWT válido                                             | `socketAuthMiddleware`            |
| Operador usa conversation ID ajeno  | ⚠️ Permitido si existe; no hay ownership                                | Conversation routes/repository    |
| Desactivar usuario con token activo | ⚠️ Token sigue válido hasta expirar                                     | JWT stateless por request         |

## Estado por capa

| Capa                   | Estado | Observación                                      |
| ---------------------- | ------ | ------------------------------------------------ |
| Modelo de usuario      | ✅     | Local, simple, sin perfil separado               |
| Autenticación          | ✅     | JWT + Redis + lockout                            |
| Sesión                 | ✅/⚠️  | Rotación robusta; storage cliente y FIFO débiles |
| RBAC REST              | ✅     | Cuatro roles, listas por ruta                    |
| Permisos granulares    | ⚠️     | Solo frontend                                    |
| Ownership/departamento | ❌     | Campos descriptivos, no policies                 |
| Multi-tenancy          | ❌     | Inexistente                                      |
| Frontend               | ⚠️     | Guards parciales y divergentes                   |
| WebSocket              | ⚠️     | JWT sin autorización                             |
| DB/RLS                 | ❌     | Solo integridad                                  |
| Auditoría              | ✅/⚠️  | Logs de app; append-only no impuesto en DB       |

## Evidencia de código muerto o legado

- `backend/src/middlewares/jwt.middleware.ts`: re-export deprecado, aún usado.
- `backend/src/middlewares/role.middleware.ts`: `checkRole` legacy.
- `User.isSuperuser`: columna legacy.
- Routers/controladores eliminados en la rama no están conectados; la autoridad actual es `createUsersRouter`.

## Límites de esta auditoría

No se inspeccionó un entorno desplegado ni se accedió a datos reales. Por ello quedan como **❓ NO DEMOSTRADO**:

- secretos/configuración efectivos;
- cuentas y roles existentes en producción;
- ejecución real de seeds;
- privilegios del usuario PostgreSQL;
- TLS, WAF, reverse proxy e IAM;
- monitoreo/alertas de eventos de seguridad.
