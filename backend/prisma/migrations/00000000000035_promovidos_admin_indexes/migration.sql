-- Additive migration: extend promovidos for the admin redesign.
-- Keeps existing encrypted data intact; adds privacy-preserving indexes and
-- administrative fields. A separate backfill script populates fingerprints and
-- reports historical duplicates without resolving them automatically.

ALTER TABLE "promovidos" ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "promovidos" ADD COLUMN "voter_key_fingerprint" VARCHAR(32);
ALTER TABLE "promovidos" ADD COLUMN "curp_fingerprint" VARCHAR(32);
ALTER TABLE "promovidos" ADD COLUMN "phone_fingerprint" VARCHAR(32);
ALTER TABLE "promovidos" ADD COLUMN "name_search_tokens" TEXT[] NOT NULL DEFAULT '{}';

-- Allow manual entries without an upload record.
ALTER TABLE "promovidos" ALTER COLUMN "upload_record_id" DROP NOT NULL;

-- Unique constraint on the HMAC fingerprint of the voter key. It is enforced
-- at the DB level; the application layer also verifies it with advisory locks
-- before insert. If historical duplicates exist, the backfill script will
-- report them; the migration itself does not populate or validate fingerprints.
CREATE UNIQUE INDEX "uq_promovidos_voter_key_fingerprint" ON "promovidos"("voter_key_fingerprint");

CREATE INDEX "promovidos_is_active_created_at_idx" ON "promovidos"("is_active", "created_at");
CREATE INDEX "promovidos_curp_fingerprint_idx" ON "promovidos"("curp_fingerprint");
CREATE INDEX "promovidos_phone_fingerprint_idx" ON "promovidos"("phone_fingerprint");
CREATE INDEX "promovidos_name_search_tokens_idx" ON "promovidos" USING GIN ("name_search_tokens");
