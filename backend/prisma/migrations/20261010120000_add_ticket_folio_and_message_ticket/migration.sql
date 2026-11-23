-- Refactor de tickets/conversaciones:
--   1) tickets.folio      (YYYYMMDDHHMMSS_XXXX_YYYY, único)
--   2) messages.ticket_id (pertenencia directa del mensaje a un ticket)
--   3) conversations.active_ticket_id (ticket abierto actual, denormalizado)
--
-- folio y ticket_id se agregan nullable para poder backfillear; messages.ticket_id
-- queda nullable a nivel DB (mensajes históricos no siempre son reconstruibles),
-- pero la capa de aplicación exige ticket para todo mensaje nuevo.

-- ── 1) tickets.folio ────────────────────────────────────────────────────────
ALTER TABLE "tickets" ADD COLUMN "folio" VARCHAR(32);

WITH base AS (
  SELECT
    t."id",
    to_char(t."created_at" AT TIME ZONE 'UTC', 'YYYYMMDDHH24MISS')
      || '_' || lpad(right(regexp_replace(COALESCE(cl."phone_number", ''), '\D', '', 'g'), 4), 4, '0')
      || '_' || lpad(right(regexp_replace(COALESCE(c."phone", ''), '\D', '', 'g'), 4), 4, '0') AS "candidate"
  FROM "tickets" t
  JOIN "conversations" conv ON conv."id" = t."conversation_id"
  JOIN "citizens" c ON c."id" = conv."citizen_id"
  LEFT JOIN "conversation_meta" cm ON cm."conversation_id" = conv."id"
  LEFT JOIN "communication_lines" cl ON cl."id" = cm."communication_line_id"
),
ranked AS (
  SELECT "id", "candidate",
         row_number() OVER (PARTITION BY "candidate" ORDER BY "id") AS "rn"
  FROM base
)
UPDATE "tickets" t
SET "folio" = CASE WHEN r."rn" = 1 THEN r."candidate" ELSE r."candidate" || '_' || r."rn" END
FROM ranked r
WHERE r."id" = t."id";

ALTER TABLE "tickets" ALTER COLUMN "folio" SET NOT NULL;
CREATE UNIQUE INDEX "uq_tickets_folio" ON "tickets" ("folio");

-- ── 2) messages.ticket_id ───────────────────────────────────────────────────
ALTER TABLE "messages" ADD COLUMN "ticket_id" UUID;

UPDATE "messages" m
SET "ticket_id" = tm."ticket_id"
FROM (
  SELECT DISTINCT ON ("message_id") "message_id", "ticket_id"
  FROM "ticket_messages"
  ORDER BY "message_id", "created_at" ASC
) tm
WHERE tm."message_id" = m."id";

ALTER TABLE "messages"
  ADD CONSTRAINT "messages_ticket_id_fkey"
  FOREIGN KEY ("ticket_id") REFERENCES "tickets" ("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "messages_ticket_id_idx" ON "messages" ("ticket_id");

-- ── 3) conversations.active_ticket_id ───────────────────────────────────────
ALTER TABLE "conversations" ADD COLUMN "active_ticket_id" UUID;

UPDATE "conversations" conv
SET "active_ticket_id" = sub."id"
FROM (
  SELECT DISTINCT ON ("conversation_id") "conversation_id", "id"
  FROM "tickets"
  WHERE "status" IN ('OPEN', 'IN_PROGRESS')
  ORDER BY "conversation_id", "created_at" DESC
) sub
WHERE sub."conversation_id" = conv."id";

ALTER TABLE "conversations"
  ADD CONSTRAINT "conversations_active_ticket_id_fkey"
  FOREIGN KEY ("active_ticket_id") REFERENCES "tickets" ("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "conversations_active_ticket_id_idx" ON "conversations" ("active_ticket_id");
