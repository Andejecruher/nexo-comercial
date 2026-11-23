-- Baseline migration: create tickets and ticket-message link tables.

CREATE TABLE "tickets" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "citizen_id" UUID NOT NULL,
    "status" "ticket_status" NOT NULL DEFAULT 'OPEN',
    "priority" "ticket_priority" NOT NULL DEFAULT 'MEDIUM',
    "source" "ticket_source" NOT NULL DEFAULT 'WHATSAPP',
    "title" VARCHAR(255),
    "description" TEXT,
    "department_slug" VARCHAR(100),
    "assigned_user_id" UUID,
    "close_reason" VARCHAR(50),
    "close_summary" TEXT,
    "escalation_reason" VARCHAR(500),
    "closed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ticket_messages" (
    "id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "actor_type" "ticket_actor_type" NOT NULL DEFAULT 'CITIZEN',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "tickets_conversation_id_status_idx" ON "tickets"("conversation_id", "status");
CREATE INDEX "tickets_citizen_id_idx" ON "tickets"("citizen_id");
CREATE INDEX "tickets_assigned_user_id_idx" ON "tickets"("assigned_user_id");
CREATE INDEX "tickets_status_idx" ON "tickets"("status");
CREATE INDEX "ticket_messages_ticket_id_idx" ON "ticket_messages"("ticket_id");
CREATE INDEX "ticket_messages_message_id_idx" ON "ticket_messages"("message_id");
CREATE UNIQUE INDEX "uq_ticket_messages_ticket_message" ON "ticket_messages"("ticket_id", "message_id");

ALTER TABLE "tickets" ADD CONSTRAINT "tickets_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_citizen_id_fkey" FOREIGN KEY ("citizen_id") REFERENCES "citizens"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assigned_user_id_fkey" FOREIGN KEY ("assigned_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
