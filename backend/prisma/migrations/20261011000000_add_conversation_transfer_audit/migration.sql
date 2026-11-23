-- Trazabilidad del último handoff a departamento (auditoría + alertas).
ALTER TABLE "conversations"
  ADD COLUMN "transferred_at" TIMESTAMPTZ(6),
  ADD COLUMN "transferred_by" VARCHAR(100),
  ADD COLUMN "transfer_reason" VARCHAR(255);

-- Índice para la alerta de handoffs con la IA aún activa.
CREATE INDEX "conversations_transferred_at_idx"
  ON "conversations" ("transferred_at");
