# Table / Model Evolution

This document maps each current Prisma model (and historically significant removed model) to the baseline migrations that created it.

> Models and table names use Prisma `@@map` mappings. The Prisma model name is listed first, with the PostgreSQL table name in parentheses where it differs.
> This document reflects the clean migration baseline. Historical migrations that no longer exist were removed during the baseline rewrite.

## Legend

| Symbol | Meaning |
|--------|---------|
| `C` | Created |
| `A` | Altered (columns added/removed, constraints changed) |
| `D` | Dropped |
| `S` | Seeded with data |
| `R` | Raw SQL invariant added (index/constraint) |

## Current models (from `schema.prisma`)

### User (`users`)

| Migration | Action | Details |
|-----------|--------|---------|
| `00000000000001_create_users_roles` | C | Created `users` table. |

### Role (`roles`)

| Migration | Action | Details |
|-----------|--------|---------|
| `00000000000001_create_users_roles` | C | Created `roles` table. |
| `00000000000023_seed_panel_roles` | S | Inserted SUPERADMIN, COORDINADOR, OPERADOR_CHAT, ANALISTA. |

### UserRole (`user_roles`)

| Migration | Action | Details |
|-----------|--------|---------|
| `00000000000001_create_users_roles` | C | Created join table with unique constraint `uq_user_roles_user_role`. |

### Neighborhood (`neighborhoods`)

| Migration | Action | Details |
|-----------|--------|---------|
| `00000000000002_create_neighborhoods` | C | Created with name, name_lower, description, zone. |

### Citizen (`citizens`)

| Migration | Action | Details |
|-----------|--------|---------|
| `00000000000003_create_citizens` | C | Created with phone, name, last_name, email, source_channel, lead_status, consent_given, consent_at, neighborhood, neighborhood_id, interests. |

### Conversation (`conversations`)

| Migration | Action | Details |
|-----------|--------|---------|
| `00000000000005_create_conversations` | C | Created with citizen_id, status, channel, assigned_dept, assigned_user_id. |
| `00000000000022_add_raw_sql_invariants` | R | Partial unique index `uq_conversations_active_per_citizen_channel`. |

### Message (`messages`)

| Migration | Action | Details |
|-----------|--------|---------|
| `00000000000007_create_messages_and_attachments` | C | Created with conversation_id, body, direction, message_type, external_message_id, attachment_id, meta. |

### Attachment (`attachments`)

| Migration | Action | Details |
|-----------|--------|---------|
| `00000000000007_create_messages_and_attachments` | C | Created with storage_key, mime_type, file_size_bytes, message_id, citizen_id, uploaded_by. |

### Tag (`tags`)

| Migration | Action | Details |
|-----------|--------|---------|
| `00000000000006_create_tags_and_citizen_tags` | C | Created name, description, color. |
| `00000000000022_add_raw_sql_invariants` | R | Functional unique index `uq_tags_name_lower` on `lower(name)`. |

### CitizenTag (`citizen_tags`)

| Migration | Action | Details |
|-----------|--------|---------|
| `00000000000006_create_tags_and_citizen_tags` | C | Created join table with unique constraint `uq_citizen_tags_citizen_tag`. |

### AuditLog (`audit_logs`)

| Migration | Action | Details |
|-----------|--------|---------|
| `00000000000008_create_messaging_queues` | C | Created actor_id, action, target_type, target_id, metadata, ip, user_agent. |

### ConversationMeta (`conversation_meta`)

| Migration | Action | Details |
|-----------|--------|---------|
| `00000000000017_create_conversation_meta` | C | Created with conversation_id, communication_line_id, flow_state, locked_by_user_id, locked_at, version, department_slug, handover_at. |

### MessageStatus (`message_statuses`)

| Migration | Action | Details |
|-----------|--------|---------|
| `00000000000008_create_messaging_queues` | C | Created message_id, wamid, status, error_code, error_title, timestamp. |

### InboxEvent (`inbox_events`)

| Migration | Action | Details |
|-----------|--------|---------|
| `00000000000008_create_messaging_queues` | C | Created wamid, phone, payload, status, retry_count, last_error_at, last_error, idempotency_key, processed_at. |

### OutboxEvent (`outbox_events`)

| Migration | Action | Details |
|-----------|--------|---------|
| `00000000000008_create_messaging_queues` | C | Created conversation_id, phone, payload, status, retry_count, next_retry_at, last_error, wamid, idempotency_key, sent_at. |

### WebhookEventLog (`webhook_event_logs`)

| Migration | Action | Details |
|-----------|--------|---------|
| `00000000000008_create_messaging_queues` | C | Created correlation_id, raw_payload, signature, processed_ok, error_message, ip_address. |

### Department (`departments`)

| Migration | Action | Details |
|-----------|--------|---------|
| `00000000000004_create_departments` | C | Created with slug, name, description, service_hours, service_schedule, is_active, keywords. |

### Assignment (`assignments`)

| Migration | Action | Details |
|-----------|--------|---------|
| `00000000000008_create_messaging_queues` | C | Created conversation_id, user_id, department_slug, assigned_at, released_at, is_active. |

### Event (`events`)

| Migration | Action | Details |
|-----------|--------|---------|
| `00000000000009_create_events_module` | C | Created with title, slug, description, event_type, status, starts_at, ends_at, location, capacity, organizer_user_id. |

### EventRegistration (`event_registrations`)

| Migration | Action | Details |
|-----------|--------|---------|
| `00000000000009_create_events_module` | C | Created with event_id, citizen_id, registration_status, attendance_status, checked_in_at, source_channel, notes. |

### EventCheckin (`event_checkins`)

| Migration | Action | Details |
|-----------|--------|---------|
| `00000000000009_create_events_module` | C | Created with event_id, registration_id, checked_in_by, notes. |

### CommunicationLine (`communication_lines`)

| Migration | Action | Details |
|-----------|--------|---------|
| `00000000000016_create_communication_lines` | C | Created with channel, external_identifier, phone_number, provider, display_name, is_active, is_default, ai_enabled, agent_id, ai_agent_id, metadata, and WhatsApp credential columns. |

### AiAgent (`ai_agents`)

| Migration | Action | Details |
|-----------|--------|---------|
| `00000000000010_create_ai_agents` | C | Created with slug, name, description, provider, model, temperature, max_tokens, is_active, metadata. |

### AiTopic (`ai_topics`)

| Migration | Action | Details |
|-----------|--------|---------|
| `00000000000011_create_ai_topics` | C | Created with slug, name, description, system_prompt_id, matcher_keywords, is_active. |
| `00000000000012_create_ai_prompts` | A | Added `ai_topics_system_prompt_id_fkey` foreign key. |

### AiPrompt (`ai_prompts`)

| Migration | Action | Details |
|-----------|--------|---------|
| `00000000000012_create_ai_prompts` | C | Created with topic_id, name, type, version, content, is_active, metadata. |

### AiTool (`ai_tools`)

| Migration | Action | Details |
|-----------|--------|---------|
| `00000000000013_create_ai_tools` | C | Created with name, description, type, execution_type, config, kind, internal_key, external_url, external_method, external_headers, external_auth_env_key, timeout_ms, allowlist_domains, input_schema, output_schema, is_active. |

### AiTopicTool (`ai_topic_tools`)

| Migration | Action | Details |
|-----------|--------|---------|
| `00000000000014_create_ai_topic_tools` | C | Created with topic_id, tool_id, sort_order, is_required, is_active. |

### AiAgentTopic (`ai_agent_topics`)

| Migration | Action | Details |
|-----------|--------|---------|
| `00000000000015_create_ai_agent_topics` | C | Created with agent_id, topic_id, prompt_id, priority, is_default, is_active. |

### AiRun (`ai_runs`)

| Migration | Action | Details |
|-----------|--------|---------|
| `00000000000018_create_ai_runs_and_calls` | C | Created with conversation_id, citizen_id, communication_line_id, agent_id, topic_id, prompt_id, provider, model, status, input_message, prompt_snapshot, model_response, error_message, steps, max_steps, tool_calls_count, correlation_id, finished_at. |

### AiToolCall (`ai_tool_calls`)

| Migration | Action | Details |
|-----------|--------|---------|
| `00000000000018_create_ai_runs_and_calls` | C | Created with run_id, tool_id, tool_name, status, input_payload, output_payload, error_message, duration_ms, finished_at. |

### NewsletterSubscriber (`newsletter_subscribers`)

| Migration | Action | Details |
|-----------|--------|---------|
| `00000000000020_create_newsletter_subscribers` | C | Created with email, name, status, source, subscribed_at, unsubscribed_at, ip_address, confirm_token_hash, confirm_token_expires_at, unsubscribe_token_hash. |

### Ticket (`tickets`)

| Migration | Action | Details |
|-----------|--------|---------|
| `00000000000019_create_tickets_and_messages` | C | Created with conversation_id, citizen_id, status, priority, source, title, description, department_slug, assigned_user_id, close_reason, close_summary, escalation_reason, closed_at. |
| `00000000000022_add_raw_sql_invariants` | R | Partial unique index `uq_tickets_one_active_per_conversation`. |

### TicketMessage (`ticket_messages`)

| Migration | Action | Details |
|-----------|--------|---------|
| `00000000000019_create_tickets_and_messages` | C | Created with ticket_id, message_id, actor_type. |

### RealtimeOutboxEvent (`realtime_outbox_events`)

| Migration | Action | Details |
|-----------|--------|---------|
| `00000000000021_create_realtime_outbox_events` | C | Created with event_type, socket_event_name, payload, status, attempts, next_retry_at, locked_at, locked_by, published_at, last_error. |

## Removed models

The legacy `colonies` table and integer-PK `departments` table were removed during the migration baseline rewrite. They do not exist in the current schema.

## Enum evolution

All current enums are created in `00000000000000_init_enums`. No enum values are modified after creation in the baseline.
