# Migration History

Chronological inventory of the Prisma migration baseline in `backend/prisma/migrations`. Each entry includes the migration purpose and the objects it creates.

> **Policy reminder:** These baseline migrations are applied and immutable. Do not rename, edit, reorder, or delete them. If a correction is needed, add a new compensating migration.

## Baseline migration index

| # | Folder name | Purpose |
|---|-------------|---------|
| 1 | `00000000000000_init_enums` | Create all PostgreSQL enums used by the current schema. |
| 2 | `00000000000001_create_users_roles` | Create `users`, `roles`, and `user_roles` tables with indexes and FKs. |
| 3 | `00000000000002_create_neighborhoods` | Create `neighborhoods` reference table. |
| 4 | `00000000000003_create_citizens` | Create `citizens` table with neighborhood FK. |
| 5 | `00000000000004_create_departments` | Create `departments` reference table. |
| 6 | `00000000000005_create_conversations` | Create `conversations` table with citizen/user FKs. |
| 7 | `00000000000006_create_tags_and_citizen_tags` | Create `tags` and `citizen_tags` tables. |
| 8 | `00000000000007_create_messages_and_attachments` | Create `messages` and `attachments` tables with mutual optional FKs. |
| 9 | `00000000000008_create_messaging_queues` | Create `audit_logs`, `message_statuses`, `inbox_events`, `outbox_events`, `webhook_event_logs`, and `assignments`. |
| 10 | `00000000000009_create_events_module` | Create `events`, `event_registrations`, and `event_checkins`. |
| 11 | `00000000000010_create_ai_agents` | Create `ai_agents` table. |
| 12 | `00000000000011_create_ai_topics` | Create `ai_topics` table (system_prompt_id FK added later). |
| 13 | `00000000000012_create_ai_prompts` | Create `ai_prompts` table and wire topic ↔ prompt FKs. |
| 14 | `00000000000013_create_ai_tools` | Create `ai_tools` table. |
| 15 | `00000000000014_create_ai_topic_tools` | Create `ai_topic_tools` link table. |
| 16 | `00000000000015_create_ai_agent_topics` | Create `ai_agent_topics` link table. |
| 17 | `00000000000016_create_communication_lines` | Create `communication_lines` table with agent FKs. |
| 18 | `00000000000017_create_conversation_meta` | Create `conversation_meta` table with conversation/communication-line/user FKs. |
| 19 | `00000000000018_create_ai_runs_and_calls` | Create `ai_runs` and `ai_tool_calls` tables. |
| 20 | `00000000000019_create_tickets_and_messages` | Create `tickets` and `ticket_messages` tables. |
| 21 | `00000000000020_create_newsletter_subscribers` | Create `newsletter_subscribers` table. |
| 22 | `00000000000021_create_realtime_outbox_events` | Create `realtime_outbox_events` table. |
| 23 | `00000000000022_add_raw_sql_invariants` | Add functional/partial unique indexes not declared in `schema.prisma`. |
| 24 | `00000000000023_seed_panel_roles` | Idempotent insert of the four base panel roles. |

## Migration → objects matrix

| Migration | Enums created | Tables created | Raw indexes/constraints added |
|-----------|---------------|----------------|-------------------------------|
| `00000000000000_init_enums` | All current enums | — | — |
| `00000000000001_create_users_roles` | — | `users`, `roles`, `user_roles` | `users_email_key`, `roles_name_key`, `uq_user_roles_user_role` |
| `00000000000002_create_neighborhoods` | — | `neighborhoods` | `neighborhoods_name_key` |
| `00000000000003_create_citizens` | — | `citizens` | `citizens_phone_key` |
| `00000000000004_create_departments` | — | `departments` | `departments_slug_key` |
| `00000000000005_create_conversations` | — | `conversations` | `conversations_citizen_id_status_idx` |
| `00000000000006_create_tags_and_citizen_tags` | — | `tags`, `citizen_tags` | `tags_name_key`, `uq_citizen_tags_citizen_tag` |
| `00000000000007_create_messages_and_attachments` | — | `messages`, `attachments` | — |
| `00000000000008_create_messaging_queues` | — | `audit_logs`, `message_statuses`, `inbox_events`, `outbox_events`, `webhook_event_logs`, `assignments` | `inbox_events_wamid_key`, `outbox_events_idempotency_key_key` |
| `00000000000009_create_events_module` | — | `events`, `event_registrations`, `event_checkins` | `events_slug_key`, `uq_event_registrations_event_citizen` |
| `00000000000010_create_ai_agents` | — | `ai_agents` | `ai_agents_slug_key` |
| `00000000000011_create_ai_topics` | — | `ai_topics` | `ai_topics_slug_key` |
| `00000000000012_create_ai_prompts` | — | `ai_prompts` | `uq_ai_prompts_topic_version` |
| `00000000000013_create_ai_tools` | — | `ai_tools` | `ai_tools_name_key` |
| `00000000000014_create_ai_topic_tools` | — | `ai_topic_tools` | `uq_ai_topic_tools_topic_tool` |
| `00000000000015_create_ai_agent_topics` | — | `ai_agent_topics` | `uq_ai_agent_topics_agent_topic` |
| `00000000000016_create_communication_lines` | — | `communication_lines` | `uq_communication_lines_channel_external` |
| `00000000000017_create_conversation_meta` | — | `conversation_meta` | `conversation_meta_conversation_id_key` |
| `00000000000018_create_ai_runs_and_calls` | — | `ai_runs`, `ai_tool_calls` | — |
| `00000000000019_create_tickets_and_messages` | — | `tickets`, `ticket_messages` | `uq_ticket_messages_ticket_message` |
| `00000000000020_create_newsletter_subscribers` | — | `newsletter_subscribers` | `newsletter_subscribers_email_key` |
| `00000000000021_create_realtime_outbox_events` | — | `realtime_outbox_events` | `realtime_outbox_events_status_next_retry_at_idx`, `realtime_outbox_events_event_type_idx`, `realtime_outbox_events_created_at_idx` |
| `00000000000022_add_raw_sql_invariants` | — | — | `uq_tags_name_lower`, `uq_conversations_active_per_citizen_channel`, `uq_tickets_one_active_per_conversation` |
| `00000000000023_seed_panel_roles` | — | — (data only) | — |

## Out-of-folder scripts

| File | Purpose | Status |
|------|---------|--------|
| `backend/scripts/migrations/sanitize_phone_duplicates.sql` | One-off data fix for `+52` vs `52` phone duplicates. | Not tracked by Prisma Migrate. Run manually only after review. |
| `backend/scripts/migrations/fix-fsm-states.ts` | One-off FSM state fix script. | Not tracked by Prisma Migrate. |
