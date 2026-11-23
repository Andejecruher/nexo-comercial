CREATE TYPE "user_invitation_status" AS ENUM ('pending', 'sent', 'failed', 'accepted', 'expired', 'revoked');

CREATE TABLE "user_invitations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "token_hash" VARCHAR(128) NOT NULL,
  "status" "user_invitation_status" NOT NULL DEFAULT 'pending',
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "sent_at" TIMESTAMPTZ(6),
  "accepted_at" TIMESTAMPTZ(6),
  "revoked_at" TIMESTAMPTZ(6),
  "provider" VARCHAR(40),
  "provider_message_id" VARCHAR(255),
  "last_error_code" VARCHAR(80),
  "delivery_attempt_count" INTEGER NOT NULL DEFAULT 0,
  "created_by_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_invitations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_user_invitations_token_hash" ON "user_invitations"("token_hash");
CREATE INDEX "user_invitations_user_id_status_idx" ON "user_invitations"("user_id", "status");
CREATE INDEX "user_invitations_expires_at_idx" ON "user_invitations"("expires_at");
ALTER TABLE "user_invitations" ADD CONSTRAINT "user_invitations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
