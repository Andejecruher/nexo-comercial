-- Soporte de paginación por offset en el listado de tickets (dashboard admin).
--
-- El orden es `updated_at DESC, id DESC`: el `id` es el tiebreaker que hace
-- determinista la ventana. Sin él, dos tickets con el mismo `updated_at`
-- pueden aparecer en dos páginas distintas o desaparecer del recorrido.
--
-- Postgres puede recorrer estos índices en reversa, así que sirven tanto para
-- `ORDER BY updated_at DESC` como `ASC` sin declarar direcciones.
--
-- En tablas grandes conviene aplicar los índices con CONCURRENTLY fuera de
-- transacción:
--   prisma db execute --file <este archivo> --schema prisma/schema.prisma
-- y editar las sentencias a `CREATE INDEX CONCURRENTLY IF NOT EXISTS`.
-- Este tamaño de tabla no lo requiere todavía.

CREATE INDEX "tickets_updated_at_id_idx" ON "tickets"("updated_at", "id");
CREATE INDEX "tickets_status_updated_at_id_idx" ON "tickets"("status", "updated_at", "id");
CREATE INDEX "tickets_department_slug_updated_at_id_idx" ON "tickets"("department_slug", "updated_at", "id");
CREATE INDEX "tickets_assigned_user_id_updated_at_id_idx" ON "tickets"("assigned_user_id", "updated_at", "id");
