-- Separa "quién atiende" (attendance_mode) del estado FSM (flow_state).
-- Motivo: DEPARTMENT_ROUTING es AI-active para la IA autónoma, pero un transfer
-- de plataforma a departamento debe silenciar al bot. flowState por sí solo no
-- alcanza para decidir; attendance_mode/bot_enabled pasan a ser la fuente de verdad.

CREATE TYPE "attendance_mode" AS ENUM ('bot', 'human');

ALTER TABLE "conversations"
  ADD COLUMN "attendance_mode" "attendance_mode" NOT NULL DEFAULT 'bot',
  ADD COLUMN "bot_enabled" BOOLEAN NOT NULL DEFAULT true;

-- Backfill: conversaciones ya asignadas a un agente humano se marcan como human.
-- El resto queda en 'bot' (default), preservando el comportamiento previo.
UPDATE "conversations"
SET "attendance_mode" = 'human',
    "bot_enabled" = false
WHERE "assigned_user_id" IS NOT NULL;

-- Índice parcial para el job de conciliación:
-- assigned_user_id != null AND attendance_mode = 'bot' (filas inconsistentes).
CREATE INDEX "conversations_attendance_reconcile_idx"
  ON "conversations"("attendance_mode")
  WHERE "assigned_user_id" IS NOT NULL;
