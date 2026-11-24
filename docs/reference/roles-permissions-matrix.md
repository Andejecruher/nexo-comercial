# Matriz real de roles y permisos

Leyenda: ✅ confirmado, ⚠️ parcial/inconsistente, ❌ denegado, ❓ no demostrado. “DB” indica autorización de filas, no integridad referencial.

## Acceso por recurso y acción

| Rol                  | Recurso                    | Acción                                         | Frontend            | Backend       | DB/RLS | Estado |
| -------------------- | -------------------------- | ---------------------------------------------- | ------------------- | ------------- | ------ | ------ |
| SUPERADMIN           | Conversaciones             | Listar/ver/mensajes                            | ✅                  | ✅            | ❌     | ✅     |
| COORDINADOR          | Conversaciones             | Listar/ver/mensajes                            | ✅                  | ✅            | ❌     | ✅     |
| OPERADOR_CHAT        | Conversaciones             | Listar/ver/mensajes                            | ✅                  | ✅            | ❌     | ✅     |
| ANALISTA             | Conversaciones             | Listar/ver/mensajes                            | ❌ `view:inbox`     | ✅            | ❌     | ⚠️     |
| SUPERADMIN           | Conversaciones             | Asignar/transferir/handover/cerrar/reabrir     | ✅                  | ✅            | ❌     | ✅     |
| COORDINADOR          | Conversaciones             | Asignar/transferir/handover/cerrar/reabrir     | ✅                  | ✅            | ❌     | ✅     |
| OPERADOR_CHAT        | Conversaciones             | Asignar/transferir/handover/cerrar/reabrir     | ✅                  | ✅            | ❌     | ✅     |
| ANALISTA             | Conversaciones             | Mutar                                          | ❌                  | ❌            | ❌     | ❌     |
| SUPERADMIN           | Mensajes                   | Enviar/adjuntar                                | ✅                  | ✅            | ❌     | ✅     |
| COORDINADOR          | Mensajes                   | Enviar/adjuntar                                | ✅                  | ✅            | ❌     | ✅     |
| OPERADOR_CHAT        | Mensajes                   | Enviar/adjuntar                                | ✅                  | ✅            | ❌     | ✅     |
| ANALISTA             | Mensajes                   | Enviar/adjuntar                                | ❌                  | ❌            | ❌     | ❌     |
| SUPERADMIN           | Analytics                  | Ver                                            | ✅                  | ✅            | ❌     | ✅     |
| COORDINADOR          | Analytics                  | Ver                                            | ✅                  | ✅            | ❌     | ✅     |
| OPERADOR_CHAT        | Analytics                  | Ver                                            | ❌                  | ❌            | ❌     | ❌     |
| ANALISTA             | Analytics                  | Ver                                            | ✅                  | ✅            | ❌     | ✅     |
| SUPERADMIN           | Usuarios                   | Listar/ver                                     | ✅ settings         | ✅            | ❌     | ✅     |
| COORDINADOR          | Usuarios                   | Listar/ver                                     | ✅ settings         | ✅            | ❌     | ✅     |
| OPERADOR_CHAT        | Usuarios                   | Listar/ver                                     | ❌                  | ❌            | ❌     | ❌     |
| ANALISTA             | Usuarios                   | Listar/ver                                     | ❌                  | ❌            | ❌     | ❌     |
| SUPERADMIN           | Usuarios                   | Crear/editar/desactivar                        | ❌ UI activa        | ✅            | ❌     | ⚠️     |
| COORDINADOR          | Usuarios                   | Crear/editar/desactivar                        | ❌                  | ❌            | ❌     | ❌     |
| SUPERADMIN           | Roles                      | Asignar/remover                                | ❌ UI activa        | ✅            | ❌     | ⚠️     |
| Resto                | Roles                      | Asignar/remover                                | ❌                  | ❌            | ❌     | ❌     |
| SUPERADMIN           | Ciudadanos                 | Listar/ver/perfil                              | ✅                  | ✅            | ❌     | ✅     |
| COORDINADOR          | Ciudadanos                 | Listar/ver/perfil                              | ✅                  | ✅            | ❌     | ✅     |
| OPERADOR_CHAT        | Ciudadanos                 | Listar/ver/perfil                              | ✅ permiso local    | ❌            | ❌     | ⚠️     |
| ANALISTA             | Ciudadanos                 | Listar/ver/perfil                              | ✅ permiso local    | ❌            | ❌     | ⚠️     |
| SUPERADMIN           | Ciudadanos                 | Crear/editar/eliminar                          | ✅                  | ✅            | ❌     | ✅     |
| Resto                | Ciudadanos                 | Crear/editar/eliminar                          | ❌/visible variable | ❌            | ❌     | ❌     |
| SUPERADMIN           | Tags de ciudadano          | Asignar/remover/bulk                           | ✅                  | ✅            | ❌     | ✅     |
| COORDINADOR          | Tags de ciudadano          | Asignar/remover/bulk                           | ✅                  | ✅            | ❌     | ✅     |
| SUPERADMIN           | Eventos                    | Listar/crear/editar/invitar/registrar/check-in | ✅                  | ✅            | ❌     | ✅     |
| COORDINADOR          | Eventos                    | Listar/crear/editar/invitar/registrar/check-in | ✅                  | ✅            | ❌     | ✅     |
| OPERADOR_CHAT        | Eventos                    | Cualquier acción interna                       | ❌                  | ❌            | ❌     | ❌     |
| ANALISTA             | Eventos                    | Ver                                            | ✅ permiso local    | ❌            | ❌     | ⚠️     |
| SUPERADMIN           | Barrios/tags/departamentos | Listar                                         | ✅                  | ✅            | ❌     | ✅     |
| COORDINADOR          | Barrios/tags/departamentos | Listar                                         | ✅                  | ✅            | ❌     | ✅     |
| SUPERADMIN           | Barrios/tags/departamentos | Crear/editar/eliminar                          | ✅                  | ✅            | ❌     | ✅     |
| COORDINADOR          | Barrios/tags/departamentos | Crear/editar/eliminar                          | UI puede mostrar    | ❌            | ❌     | ⚠️     |
| SUPERADMIN           | IA                         | CRUD/activar/asignar                           | ✅                  | ✅            | ❌     | ✅     |
| Resto                | IA                         | Cualquier acción                               | sidebar visible     | ❌            | ❌     | ⚠️     |
| SUPERADMIN           | Auditoría/colas            | Ver/retry/reprocess                            | ❌ vista            | ✅            | ❌     | ⚠️     |
| Resto                | Auditoría/colas            | Ver/retry/reprocess                            | ❌                  | ❌            | ❌     | ❌     |
| Cualquier JWT válido | WebSocket admin            | Conectar/recibir globales                      | ✅                  | ⚠️ sin rol    | ❌     | ⚠️     |
| Cualquier JWT válido | WebSocket conversación     | Suscribirse por ID                             | ✅                  | ⚠️ sin policy | ❌     | ⚠️     |

## Acciones no encontradas

| Acción                                 | Estado                |
| -------------------------------------- | --------------------- |
| Exportar usuarios/ciudadanos/auditoría | ❓ No demostrado      |
| Aprobar usuarios o cambios de rol      | ❌ No implementado    |
| Permisos individuales                  | ❌ No implementado    |
| Cambiar organización/municipio         | ❌ Modelo inexistente |
| Invitar usuarios de panel              | ❌ No implementado    |
| Restablecer contraseña por usuario     | ❌ No implementado    |
| Eliminar usuario físicamente por API   | ❌ No implementado    |

## Fuente de verdad

Para seguridad REST prevalecen los routers backend, no `frontend/lib/shared/auth-guards.ts`. La matriz se deriva de:

- `backend/src/routes/*.routes.ts`
- `backend/src/middlewares/rbac.ts`
- `backend/src/routes/index.ts`
- `frontend/lib/shared/auth-guards.ts`
- `frontend/components/shared/PermissionGate.tsx`
