-- Baseline migration: create AI topic-tool links.

CREATE TABLE "ai_topic_tools" (
    "id" UUID NOT NULL,
    "topic_id" UUID NOT NULL,
    "tool_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 100,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_topic_tools_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_topic_tools_topic_id_is_active_idx" ON "ai_topic_tools"("topic_id", "is_active");
CREATE INDEX "ai_topic_tools_tool_id_idx" ON "ai_topic_tools"("tool_id");
CREATE UNIQUE INDEX "uq_ai_topic_tools_topic_tool" ON "ai_topic_tools"("topic_id", "tool_id");

ALTER TABLE "ai_topic_tools" ADD CONSTRAINT "ai_topic_tools_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "ai_topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_topic_tools" ADD CONSTRAINT "ai_topic_tools_tool_id_fkey" FOREIGN KEY ("tool_id") REFERENCES "ai_tools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
