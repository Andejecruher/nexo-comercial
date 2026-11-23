-- Baseline migration: create citizens table.

CREATE TABLE "citizens" (
    "id" UUID NOT NULL,
    "phone" VARCHAR(30) NOT NULL,
    "name" VARCHAR(255),
    "last_name" VARCHAR(255),
    "email" VARCHAR(255),
    "source_channel" "source_channel" NOT NULL DEFAULT 'whatsapp',
    "lead_status" "lead_status" NOT NULL DEFAULT 'new',
    "consent_given" BOOLEAN NOT NULL DEFAULT false,
    "consent_at" TIMESTAMPTZ(6),
    "neighborhood" VARCHAR(255),
    "neighborhood_id" UUID,
    "interests" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "citizens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "citizens_phone_key" ON "citizens"("phone");
CREATE INDEX "citizens_phone_idx" ON "citizens"("phone");
CREATE INDEX "citizens_email_idx" ON "citizens"("email");

ALTER TABLE "citizens" ADD CONSTRAINT "citizens_neighborhood_id_fkey" FOREIGN KEY ("neighborhood_id") REFERENCES "neighborhoods"("id") ON DELETE SET NULL ON UPDATE CASCADE;
