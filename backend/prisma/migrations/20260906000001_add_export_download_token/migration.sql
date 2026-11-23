-- One-time download token columns for authenticated direct download without Bearer.
ALTER TABLE "export_jobs"
    ADD COLUMN "download_token_hash" VARCHAR(64),
    ADD COLUMN "download_token_expires_at" TIMESTAMPTZ(6),
    ADD COLUMN "download_token_consumed_at" TIMESTAMPTZ(6);