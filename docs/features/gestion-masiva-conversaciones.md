# Gestión masiva de conversaciones

Vista: `/admin/mensajes-masivos`. El menú existente ya apunta a esta ruta.

## Puesta en marcha

1. Generar Prisma: `pnpm --dir backend exec prisma generate`.
2. En una base administrada mediante migraciones, aplicar `pnpm --dir backend run migrate:deploy`.
   La migración nueva es `20261014170000_conversation_bulk_jobs`; sólo agrega dos tablas e índices.
   Una base inicializada mediante `db push` debe reconciliar su historial antes de ejecutar todas las migraciones.
3. Ejecutar la API y el frontend como de costumbre. Ejecutar el proceso independiente
   `pnpm --dir backend run dev:worker` en desarrollo o `pnpm --dir backend run start:worker`
   después de compilar. Requiere `WORKERS_ENABLED=true` y la misma base PostgreSQL que la API.
   Esta cola usa polling de PostgreSQL: requiere un worker residente con CPU disponible,
   incluso si otras tareas usan `BACKGROUND_EXECUTION_BACKEND=cloud_tasks`.
   No depende de Redis. No se inicia procesamiento masivo dentro del proceso API.

## API

Se conserva el prefijo existente `/api/v1`:

- `POST /api/v1/conversations/bulk-action`: JWT y permisos `mensajes_masivos.view`,
  `mensajes_masivos.create`, `conversaciones.update`.
- `GET /api/v1/conversations/bulk-action/:jobId`: JWT, `mensajes_masivos.view`, sólo el propietario.
- La vista también requiere `conversaciones.view` para listar conversaciones;
  la selección de departamentos usa el catálogo existente y `departamentos.view`.

El POST requiere `Idempotency-Key: <UUID>`. Reintentos de la misma solicitud deben
conservar la clave. Reutilizarla con otro payload devuelve 409. El 202 sólo se envía
cuando el trabajo y sus elementos están guardados atómicamente.

```json
{
  "conversation_ids": ["11111111-1111-4111-8111-111111111111"],
  "action": "send_message",
  "message": "Hola, tenemos información para ti."
}
```

Acciones: `send_message`, `activate_bot`, `deactivate_bot`, `close_tickets`.
`deactivate_bot` requiere `target: { "type": "department", "departmentSlug": "salud" }`
o `target: { "type": "agent", "toUserId": "<UUID>" }`.
Máximo 500 IDs por solicitud, UUIDs deduplicados, mensaje no vacío de hasta 1000 caracteres.

Respuesta 202: `{ "job_id": "<UUID>", "total": 1 }`.
El GET devuelve `job_id`, `done` y `items` con `conversationId`, `status`, `error`.
El trabajo conserva el actor y payload para trazabilidad. El frontend consulta el
progreso cada dos segundos; los errores individuales aparecen en “Ver incidencias”.

## Worker y servicios reutilizados

`BulkActionWorker` toma hasta diez elementos por lote y espera al menos un segundo
entre lotes. El bloqueo transaccional de PostgreSQL serializa las reclamaciones
entre réplicas; nunca se retiene mientras se ejecutan servicios de dominio.
Se procesan elementos secuencialmente y se vuelven a verificar permisos del actor.

- Envío: `MessageService.sendMessage`, con clave estable por elemento; conserva el
  outbox, proveedor y rate limiter ya existentes. Se comprueba de nuevo que haya
  un folio activo. “Completada” significa encolada para entrega, no entregada por WhatsApp.
- Bot: `ConversationsService.transfer`, con destino `ai`, departamento o agente.
  Conserva las validaciones de FSM, horarios, propiedad, tickets y eventos existentes.
- Folios: `TicketService.getActiveTicketByConversation` y `closeTicket`.
  No cierra la conversación ni recrea la lógica del ticket.

Los fallos conocidos de validación se marcan `failed`. Errores inesperados o
reclamaciones abandonadas durante cinco minutos se marcan `uncertain`; no se
reenvían automáticamente porque una operación podría haber tenido efecto antes de
un fallo. Se debe revisar el resultado individual antes de solicitar una nueva acción.
Los elementos pendientes continúan tras un reinicio. El cierre normal espera el lote en curso.

“Seleccionar todo” selecciona la página visible; se conservan selecciones al
paginar, hasta 500. Cambiar búsqueda o estado limpia la selección. Para un mensaje,
la UI exige retirar las conversaciones inactivas. Los conteos son una instantánea;
las validaciones definitivas siguen estando en el worker y servicios de dominio.

## Verificación

```sh
pnpm --dir backend exec jest --runInBand src/__tests__/unit/bulk-actions.test.ts
pnpm --dir backend exec jest --config jest.postgres.config.js --runInBand src/__tests__/postgres/bulk-actions.postgres.test.ts
pnpm --dir frontend exec vitest run components/admin/__tests__/bulk-conversations-view.test.tsx
```

La prueba PostgreSQL usa un esquema temporal independiente y lo elimina al terminar.
Cubre reintentos concurrentes, autorización de consulta por propietario, exclusión
entre workers, límite de lote, fallos parciales y recuperación de reclamaciones.
