-- Add PostgreSQL-side UUID defaults for tables whose Prisma models use @default(uuid()).
-- Prisma Client already generates UUIDs for application writes, but these defaults
-- keep raw SQL seeders, data migrations, and operational scripts consistent.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE "users" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "roles" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "user_roles" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "permissions" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "departments" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "neighborhoods" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "citizens" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "conversations" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "messages" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "attachments" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "tags" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "citizen_tags" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "audit_logs" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "inbox_events" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "outbox_events" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "webhook_event_logs" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "events" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "event_registrations" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "event_checkins" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "assignments" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "communication_lines" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "ai_agents" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "ai_topics" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "ai_prompts" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "ai_tools" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "ai_topic_tools" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "ai_agent_topics" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "conversation_meta" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "message_statuses" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "ai_runs" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "ai_tool_calls" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "tickets" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "ticket_messages" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "newsletter_subscribers" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "realtime_outbox_events" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "user_invitations" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "department_schedules" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "department_schedule_intervals" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "department_schedule_exceptions" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "department_exception_intervals" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
