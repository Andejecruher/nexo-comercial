-- Baseline migration: create AI tools table.

CREATE TABLE "ai_tools" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT NOT NULL,
    "type" "ai_tool_kind" NOT NULL DEFAULT 'internal',
    "execution_type" "ai_tool_execution_type" NOT NULL DEFAULT 'function',
    "config" JSONB NOT NULL DEFAULT '{}',
    "kind" "ai_tool_kind" NOT NULL,
    "internal_key" VARCHAR(120),
    "external_url" TEXT,
    "external_method" "ai_tool_http_method",
    "external_headers" JSONB,
    "external_auth_env_key" VARCHAR(120),
    "timeout_ms" INTEGER NOT NULL DEFAULT 8000,
    "allowlist_domains" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "input_schema" JSONB,
    "output_schema" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ai_tools_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ai_tools_name_key" ON "ai_tools"("name");
CREATE INDEX "ai_tools_kind_is_active_idx" ON "ai_tools"("kind", "is_active");
