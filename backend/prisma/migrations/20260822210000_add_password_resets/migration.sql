-- Migration: add_password_resets
-- Description: Store hashed, single-use password reset tokens for the forgot-password flow.

CREATE TABLE "password_resets" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "token_hash" VARCHAR(128) NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "used_at" TIMESTAMPTZ(6),
  "invalidated_at" TIMESTAMPTZ(6),
  "requested_ip" VARCHAR(45),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "password_resets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_password_resets_token_hash" ON "password_resets"("token_hash");
CREATE INDEX "password_resets_user_id_idx" ON "password_resets"("user_id");
CREATE INDEX "password_resets_expires_at_idx" ON "password_resets"("expires_at");

ALTER TABLE "password_resets"
  ADD CONSTRAINT "password_resets_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
