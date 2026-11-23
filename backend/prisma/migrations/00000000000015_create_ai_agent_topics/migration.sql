-- Baseline migration: create AI agent-topic links.

CREATE TABLE "ai_agent_topics" (
    "id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "topic_id" UUID NOT NULL,
    "prompt_id" UUID NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ai_agent_topics_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_agent_topics_agent_id_is_active_idx" ON "ai_agent_topics"("agent_id", "is_active");
CREATE INDEX "ai_agent_topics_topic_id_is_active_idx" ON "ai_agent_topics"("topic_id", "is_active");
CREATE INDEX "ai_agent_topics_prompt_id_idx" ON "ai_agent_topics"("prompt_id");
CREATE UNIQUE INDEX "uq_ai_agent_topics_agent_topic" ON "ai_agent_topics"("agent_id", "topic_id");

ALTER TABLE "ai_agent_topics" ADD CONSTRAINT "ai_agent_topics_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "ai_agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_agent_topics" ADD CONSTRAINT "ai_agent_topics_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "ai_topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_agent_topics" ADD CONSTRAINT "ai_agent_topics_prompt_id_fkey" FOREIGN KEY ("prompt_id") REFERENCES "ai_prompts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
