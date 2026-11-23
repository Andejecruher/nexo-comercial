-- Baseline migration: create AI runs and tool-call tables.
-- Depends on conversations, citizens, communication_lines, ai_agents, ai_topics,
-- ai_prompts, and ai_tools.

CREATE TABLE "ai_runs" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "citizen_id" UUID NOT NULL,
    "communication_line_id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "topic_id" UUID NOT NULL,
    "prompt_id" UUID NOT NULL,
    "provider" "ai_provider" NOT NULL,
    "model" VARCHAR(255) NOT NULL,
    "status" "ai_run_status" NOT NULL DEFAULT 'running',
    "input_message" TEXT NOT NULL,
    "prompt_snapshot" TEXT NOT NULL,
    "model_response" TEXT,
    "error_message" TEXT,
    "steps" INTEGER NOT NULL DEFAULT 0,
    "max_steps" INTEGER NOT NULL DEFAULT 4,
    "tool_calls_count" INTEGER NOT NULL DEFAULT 0,
    "correlation_id" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),

    CONSTRAINT "ai_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_tool_calls" (
    "id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "tool_id" UUID NOT NULL,
    "tool_name" VARCHAR(120) NOT NULL,
    "status" "ai_tool_call_status" NOT NULL DEFAULT 'running',
    "input_payload" JSONB NOT NULL DEFAULT '{}',
    "output_payload" JSONB,
    "error_message" TEXT,
    "duration_ms" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),

    CONSTRAINT "ai_tool_calls_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_runs_conversation_id_created_at_idx" ON "ai_runs"("conversation_id", "created_at");
CREATE INDEX "ai_runs_communication_line_id_created_at_idx" ON "ai_runs"("communication_line_id", "created_at");
CREATE INDEX "ai_runs_agent_id_topic_id_created_at_idx" ON "ai_runs"("agent_id", "topic_id", "created_at");
CREATE INDEX "ai_tool_calls_run_id_created_at_idx" ON "ai_tool_calls"("run_id", "created_at");
CREATE INDEX "ai_tool_calls_tool_id_idx" ON "ai_tool_calls"("tool_id");
CREATE INDEX "ai_tool_calls_status_idx" ON "ai_tool_calls"("status");

ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_citizen_id_fkey" FOREIGN KEY ("citizen_id") REFERENCES "citizens"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_communication_line_id_fkey" FOREIGN KEY ("communication_line_id") REFERENCES "communication_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "ai_agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "ai_topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_prompt_id_fkey" FOREIGN KEY ("prompt_id") REFERENCES "ai_prompts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_tool_calls" ADD CONSTRAINT "ai_tool_calls_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "ai_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_tool_calls" ADD CONSTRAINT "ai_tool_calls_tool_id_fkey" FOREIGN KEY ("tool_id") REFERENCES "ai_tools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
