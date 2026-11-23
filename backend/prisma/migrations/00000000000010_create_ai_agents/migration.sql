-- Baseline migration: create AI agents table.

CREATE TABLE "ai_agents" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "provider" "ai_provider" NOT NULL,
    "model" VARCHAR(255) NOT NULL,
    "temperature" DECIMAL(4,2),
    "max_tokens" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ai_agents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ai_agents_slug_key" ON "ai_agents"("slug");
CREATE INDEX "ai_agents_is_active_idx" ON "ai_agents"("is_active");
