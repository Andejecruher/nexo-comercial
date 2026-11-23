-- Baseline migration: create AI prompts table and wire the topic <-> prompt
-- optional foreign keys. ai_topics.system_prompt_id is back-filled here now
-- that both tables exist.

CREATE TABLE "ai_prompts" (
    "id" UUID NOT NULL,
    "topic_id" UUID,
    "name" VARCHAR(255) NOT NULL,
    "type" "ai_prompt_type" NOT NULL DEFAULT 'topic',
    "version" INTEGER NOT NULL DEFAULT 1,
    "content" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ai_prompts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_prompts_topic_id_is_active_idx" ON "ai_prompts"("topic_id", "is_active");
CREATE UNIQUE INDEX "uq_ai_prompts_topic_version" ON "ai_prompts"("topic_id", "version");

ALTER TABLE "ai_prompts" ADD CONSTRAINT "ai_prompts_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "ai_topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_topics" ADD CONSTRAINT "ai_topics_system_prompt_id_fkey" FOREIGN KEY ("system_prompt_id") REFERENCES "ai_prompts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
