-- Baseline migration: create newsletter subscribers table.

CREATE TABLE "newsletter_subscribers" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255),
    "status" "newsletter_subscriber_status" NOT NULL DEFAULT 'pending',
    "source" VARCHAR(50) NOT NULL,
    "subscribed_at" TIMESTAMPTZ(6),
    "unsubscribed_at" TIMESTAMPTZ(6),
    "ip_address" VARCHAR(45),
    "confirm_token_hash" VARCHAR(64),
    "confirm_token_expires_at" TIMESTAMPTZ(6),
    "unsubscribe_token_hash" VARCHAR(64),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "newsletter_subscribers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "newsletter_subscribers_email_key" ON "newsletter_subscribers"("email");
CREATE INDEX "newsletter_subscribers_status_idx" ON "newsletter_subscribers"("status");
CREATE INDEX "newsletter_subscribers_confirm_token_hash_idx" ON "newsletter_subscribers"("confirm_token_hash");
CREATE INDEX "newsletter_subscribers_unsubscribe_token_hash_idx" ON "newsletter_subscribers"("unsubscribe_token_hash");
