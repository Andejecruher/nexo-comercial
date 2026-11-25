-- Consolidated baseline generated from the effective PostgreSQL 16 schema.
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;

COMMENT ON EXTENSION pg_trgm IS 'text similarity measurement and index searching based on trigrams';

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';

CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;

COMMENT ON EXTENSION unaccent IS 'text search dictionary that removes accents';

CREATE TYPE public."CampaignDispatchState" AS ENUM (
    'queued',
    'sending',
    'accepted',
    'finished',
    'uncertain'
);

CREATE TYPE public."CampaignMessageStatus" AS ENUM (
    'pending',
    'sent',
    'delivered',
    'read',
    'failed'
);

CREATE TYPE public."CampaignStatus" AS ENUM (
    'queued',
    'running',
    'completed',
    'needs_review'
);

CREATE TYPE public.ai_prompt_type AS ENUM (
    'system',
    'tool',
    'topic',
    'fallback'
);

CREATE TYPE public.ai_provider AS ENUM (
    'openai',
    'anthropic'
);

CREATE TYPE public.ai_run_status AS ENUM (
    'running',
    'completed',
    'failed',
    'skipped'
);

CREATE TYPE public.ai_tool_call_status AS ENUM (
    'running',
    'completed',
    'failed',
    'blocked'
);

CREATE TYPE public.ai_tool_execution_type AS ENUM (
    'function',
    'http'
);

CREATE TYPE public.ai_tool_http_method AS ENUM (
    'GET',
    'POST',
    'PUT',
    'PATCH',
    'DELETE'
);

CREATE TYPE public.ai_tool_kind AS ENUM (
    'internal',
    'external'
);

CREATE TYPE public.attendance_mode AS ENUM (
    'bot',
    'human'
);

CREATE TYPE public.attendance_status AS ENUM (
    'pending',
    'attended',
    'no_show'
);

CREATE TYPE public.conversation_channel AS ENUM (
    'whatsapp',
    'web_chat',
    'email',
    'sms',
    'other'
);

CREATE TYPE public.conversation_flow_state AS ENUM (
    'BOT_FLOW',
    'REGISTERING',
    'DEPARTMENT_ROUTING',
    'HUMAN_FLOW',
    'ESCALATED',
    'CLOSED'
);

CREATE TYPE public.conversation_status AS ENUM (
    'open',
    'in_progress',
    'resolved',
    'closed'
);

CREATE TYPE public.department_day_of_week AS ENUM (
    'MONDAY',
    'TUESDAY',
    'WEDNESDAY',
    'THURSDAY',
    'FRIDAY',
    'SATURDAY',
    'SUNDAY'
);

CREATE TYPE public.department_exception_recurrence_type AS ENUM (
    'NONE',
    'YEARLY',
    'WEEKLY',
    'SPECIFIC_WEEKDAYS'
);

CREATE TYPE public.department_schedule_exception_type AS ENUM (
    'PARTIALLY_OPEN',
    'PARTIALLY_CLOSED',
    'FULLY_CLOSED'
);

CREATE TYPE public.event_status AS ENUM (
    'draft',
    'published',
    'completed',
    'cancelled'
);

CREATE TYPE public.event_type AS ENUM (
    'townhall',
    'community',
    'volunteer',
    'campaign',
    'rally'
);

CREATE TYPE public.event_visibility AS ENUM (
    'public',
    'private'
);

CREATE TYPE public.export_job_status AS ENUM (
    'queued',
    'processing',
    'ready',
    'failed',
    'expired'
);

CREATE TYPE public.export_module AS ENUM (
    'citizens'
);

CREATE TYPE public.inbox_event_status AS ENUM (
    'pending',
    'processing',
    'processed',
    'failed',
    'dead_lettered'
);

CREATE TYPE public.lead_status AS ENUM (
    'new',
    'contacted',
    'engaged',
    'converted',
    'unsubscribed'
);

CREATE TYPE public.message_direction AS ENUM (
    'inbound',
    'outbound'
);

CREATE TYPE public.message_status_value AS ENUM (
    'sent',
    'delivered',
    'read',
    'failed'
);

CREATE TYPE public.message_type AS ENUM (
    'text',
    'image',
    'audio',
    'video',
    'document',
    'location',
    'template',
    'interactive',
    'system',
    'sticker',
    'contacts',
    'unsupported'
);

CREATE TYPE public.newsletter_subscriber_status AS ENUM (
    'pending',
    'active',
    'unsubscribed'
);

CREATE TYPE public.outbox_event_status AS ENUM (
    'pending',
    'sending',
    'sent',
    'failed',
    'dead_lettered'
);

CREATE TYPE public.realtime_outbox_status AS ENUM (
    'pending',
    'publishing',
    'published',
    'failed',
    'dead_lettered'
);

CREATE TYPE public.registration_status AS ENUM (
    'invited',
    'registered',
    'confirmed',
    'cancelled',
    'waitlist'
);

CREATE TYPE public.source_channel AS ENUM (
    'whatsapp',
    'web',
    'event',
    'referral',
    'other'
);

CREATE TYPE public.ticket_actor_type AS ENUM (
    'CITIZEN',
    'AGENT',
    'BOT',
    'SYSTEM'
);

CREATE TYPE public.ticket_priority AS ENUM (
    'LOW',
    'MEDIUM',
    'HIGH',
    'URGENT'
);

CREATE TYPE public.ticket_source AS ENUM (
    'WHATSAPP',
    'WEB',
    'OTHER'
);

CREATE TYPE public.ticket_status AS ENUM (
    'OPEN',
    'IN_PROGRESS',
    'RESOLVED',
    'CLOSED'
);

CREATE TYPE public.user_invitation_status AS ENUM (
    'pending',
    'sent',
    'failed',
    'accepted',
    'expired',
    'revoked'
);
