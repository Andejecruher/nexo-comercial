-- Baseline migration: create AI topics table.
-- The optional system_prompt_id foreign key to ai_prompts is added in a later
-- migration after ai_prompts exists, because prompts also reference topics.

CREATE TABLE "ai_topics" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "system_prompt_id" UUID,
    "matcher_keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ai_topics_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ai_topics_slug_key" ON "ai_topics"("slug");
CREATE INDEX "ai_topics_is_active_idx" ON "ai_topics"("is_active");
CREATE INDEX "ai_topics_system_prompt_id_idx" ON "ai_topics"("system_prompt_id");
