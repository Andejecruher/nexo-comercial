-- Baseline migration: create conversation meta table.
-- Placed after communication_lines because conversation_meta references it.

CREATE TABLE "conversation_meta" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "communication_line_id" UUID,
    "flow_state" "conversation_flow_state" NOT NULL DEFAULT 'BOT_FLOW',
    "locked_by_user_id" UUID,
    "locked_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 0,
    "department_slug" VARCHAR(100),
    "handover_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "conversation_meta_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "conversation_meta_conversation_id_key" ON "conversation_meta"("conversation_id");
CREATE INDEX "conversation_meta_flow_state_idx" ON "conversation_meta"("flow_state");
CREATE INDEX "conversation_meta_locked_by_user_id_idx" ON "conversation_meta"("locked_by_user_id");
CREATE INDEX "conversation_meta_communication_line_id_idx" ON "conversation_meta"("communication_line_id");

ALTER TABLE "conversation_meta" ADD CONSTRAINT "conversation_meta_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversation_meta" ADD CONSTRAINT "conversation_meta_communication_line_id_fkey" FOREIGN KEY ("communication_line_id") REFERENCES "communication_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;
