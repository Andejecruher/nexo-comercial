-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "send_by_user_id" UUID;

-- Backfill desde el legacy meta JSONB (meta->>'senderId').
-- Solo se copian UUIDs válidos que referencien un usuario existente.
-- Mensajes de bot IA (meta->>'source' = 'ai') y ciudades inbound quedan NULL.
UPDATE "messages"
SET "send_by_user_id" = ("meta"->>'senderId')::uuid
WHERE "meta"->>'senderId' IS NOT NULL
  AND "meta"->>'senderId' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND EXISTS (
    SELECT 1 FROM "users" u
    WHERE u."id" = ("meta"->>'senderId')::uuid
  );

-- CreateIndex
CREATE INDEX "messages_send_by_user_id_idx" ON "messages"("send_by_user_id");

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_send_by_user_id_fkey" FOREIGN KEY ("send_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;