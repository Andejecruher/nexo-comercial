-- Baseline migration: create all PostgreSQL enums used by the current schema.
-- Enums are created first so subsequent table migrations can reference them.

CREATE TYPE "source_channel" AS ENUM ('whatsapp', 'web', 'event', 'referral', 'other');
CREATE TYPE "lead_status" AS ENUM ('new', 'contacted', 'engaged', 'converted', 'unsubscribed');
CREATE TYPE "conversation_status" AS ENUM ('open', 'in_progress', 'resolved', 'closed');
CREATE TYPE "conversation_channel" AS ENUM ('whatsapp', 'web_chat', 'email', 'sms', 'other');
CREATE TYPE "message_direction" AS ENUM ('inbound', 'outbound');
CREATE TYPE "message_type" AS ENUM ('text', 'image', 'audio', 'video', 'document', 'location', 'template', 'interactive', 'system');
CREATE TYPE "conversation_flow_state" AS ENUM ('BOT_FLOW', 'REGISTERING', 'DEPARTMENT_ROUTING', 'HUMAN_FLOW', 'ESCALATED', 'CLOSED');
CREATE TYPE "message_status_value" AS ENUM ('sent', 'delivered', 'read', 'failed');
CREATE TYPE "inbox_event_status" AS ENUM ('pending', 'processing', 'processed', 'failed', 'dead_lettered');
CREATE TYPE "outbox_event_status" AS ENUM ('pending', 'sending', 'sent', 'failed', 'dead_lettered');
CREATE TYPE "realtime_outbox_status" AS ENUM ('pending', 'publishing', 'published', 'failed', 'dead_lettered');
CREATE TYPE "ai_provider" AS ENUM ('openai', 'anthropic');
CREATE TYPE "ai_tool_kind" AS ENUM ('internal', 'external');
CREATE TYPE "ai_prompt_type" AS ENUM ('system', 'tool', 'topic', 'fallback');
CREATE TYPE "ai_tool_execution_type" AS ENUM ('function', 'http');
CREATE TYPE "ai_tool_http_method" AS ENUM ('GET', 'POST', 'PUT', 'PATCH', 'DELETE');
CREATE TYPE "ai_run_status" AS ENUM ('running', 'completed', 'failed', 'skipped');
CREATE TYPE "ai_tool_call_status" AS ENUM ('running', 'completed', 'failed', 'blocked');
CREATE TYPE "event_status" AS ENUM ('draft', 'published', 'completed', 'cancelled');
CREATE TYPE "event_type" AS ENUM ('townhall', 'community', 'volunteer', 'campaign', 'rally');
CREATE TYPE "registration_status" AS ENUM ('invited', 'registered', 'confirmed', 'cancelled', 'waitlist');
CREATE TYPE "attendance_status" AS ENUM ('pending', 'attended', 'no_show');
CREATE TYPE "ticket_status" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');
CREATE TYPE "ticket_priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');
CREATE TYPE "ticket_source" AS ENUM ('WHATSAPP', 'WEB', 'OTHER');
CREATE TYPE "ticket_actor_type" AS ENUM ('CITIZEN', 'AGENT', 'BOT', 'SYSTEM');
CREATE TYPE "newsletter_subscriber_status" AS ENUM ('pending', 'active', 'unsubscribed');
