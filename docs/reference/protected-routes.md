# Rutas frontend protegidas

## Protección transversal

Todas las páginas bajo `frontend/app/(admin)` pasan por:

```text
ProtectedRoute → RealtimeProvider → AdminLayout
```

`ProtectedRoute` decide en cliente usando `AuthProvider`. En Next.js 16, `frontend/proxy.ts` con el export nombrado `proxy` es una convención activa; la implementación actual no autentica ni consulta la cookie, solo normaliza `/admin`.

## Guards observados

| Ruta                         | Guard frontend        | Roles derivados                        | Backend relacionado                     | Estado |
| ---------------------------- | --------------------- | -------------------------------------- | --------------------------------------- | ------ |
| `/admin/indicadores/*`       | `view:dashboard`      | SUPERADMIN, COORDINADOR, ANALISTA      | Analytics coincide                      | ✅     |
| `/admin/conversaciones/list` | `view:inbox`          | SUPERADMIN, COORDINADOR, OPERADOR_CHAT | Lectura backend incluye ANALISTA        | ⚠️     |
| `/admin/conversaciones/[id]` | `view:inbox`          | SUPERADMIN, COORDINADOR, OPERADOR_CHAT | Lectura backend incluye ANALISTA        | ⚠️     |
| `/admin/tickets` y detalle   | `view:inbox`          | SUPERADMIN, COORDINADOR, OPERADOR_CHAT | Usa conversaciones/tickets internos     | ⚠️     |
| `/admin/eventos`             | `view:events`         | SUPERADMIN, COORDINADOR, ANALISTA      | Backend excluye ANALISTA                | ⚠️     |
| `/admin/eventos/new`         | `view:events`         | SUPERADMIN, COORDINADOR, ANALISTA      | Backend excluye ANALISTA                | ⚠️     |
| `/admin/settings`            | `manage:settings`     | SUPERADMIN, COORDINADOR                | Backend autoriza cada endpoint por rol  | ⚠️     |
| `/admin/ciudadanos*`         | Solo `ProtectedRoute` | Cualquier autenticado                  | Backend solo SUPERADMIN, COORDINADOR    | ⚠️     |
| `/admin/barrios`             | Solo `ProtectedRoute` | Cualquier autenticado                  | Backend lectura SUPERADMIN, COORDINADOR | ⚠️     |
| `/admin/etiquetas`           | Solo `ProtectedRoute` | Cualquier autenticado                  | Backend lectura SUPERADMIN, COORDINADOR | ⚠️     |
| `/admin/departamentos`       | Solo `ProtectedRoute` | Cualquier autenticado                  | Backend lectura SUPERADMIN, COORDINADOR | ⚠️     |
| `/admin/ai*`                 | Solo `ProtectedRoute` | Cualquier autenticado                  | Backend SUPERADMIN                      | ⚠️     |

## Navegación

`AdminSidebar` declara elementos estáticos y no usa `PermissionGate` ni roles (`frontend/components/shared/sidebar.tsx:25-49,128-273`). Todos los autenticados ven enlaces que pueden terminar en fallback frontend o 403 backend.

## Autoridad

- Cambiar `vc_user.roles` en `localStorage` puede mostrar/ocultar páginas y botones.
- No modifica los roles firmados en el access JWT.
- Las rutas backend inventariadas vuelven a validar el rol, por lo que el guard cliente no es la única barrera REST.
- WebSocket es la excepción relevante: su control backend es solo JWT.
