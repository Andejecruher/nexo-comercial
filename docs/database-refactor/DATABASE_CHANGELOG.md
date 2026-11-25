# Database baseline changelog

Reference commit: `603c480ca437d44ee02dca9392e2ee4d7bd20b57` on `work`. Implementation branch: `refactor/database-baseline`. No commit, push, merge, deployment or migration of an existing database was performed.

## Migration replacement

The 78 historical Prisma `migration.sql` files were removed from the active path; they remain recoverable from Git at the reference commit. The new baseline contains 60 files: one for effective enums and extensions, 58 for the retained tables, and one for three cyclic foreign keys plus `sync_conversation_line_scope()` and its trigger. The companion migration is necessary for the `ai_prompts`/`ai_topics`, `attachments`/`messages`, and `conversations`/`tickets` cycles. All other foreign keys are installed with the owning table migration.

The 58 retained tables and their exact definitions are listed in [`DATABASE_SCHEMA.md`](DATABASE_SCHEMA.md). The 15 transient tables omitted from the baseline are: `coordinator_backfill_issues`, `coordinator_backfill_map`, `coordinators`, `electoral_districts`, `electoral_states`, `event_internal_details`, `ine_ocr_jobs`, `leaders`, `ocr_extractions`, `organizational_structures`, `precampaign_goals`, `promovidos`, `sections`, `stored_files`, `upload_records`. These include retired electoral/OCR/precampaign objects, two temporary coordinator backfill tables and the temporary event details table. WhatsApp `campaigns`, `campaign_recipients`, and `campaign_attachments` remain active and are in the baseline.

### Old to new correspondence

The table migrations below are listed in the installation order. The shared bootstrap is `00000000000000_init_shared_objects`, and the companion is `00000000000059_add_shared_constraints`.

| Migraciones históricas | Migración implementada |
|---|---|
| `00000000000000_init_enums`, migraciones posteriores con `CREATE TYPE`/`ALTER TYPE`, `20260716120000_add_uuid_database_defaults` (extensión) | `00000000000000_init_shared_objects` (solo enums vigentes y extensiones necesarias; defaults en tablas) |
| `00000000000010_create_ai_agents`, `20260716120000_add_uuid_database_defaults` | `00000000000001_create_ai_agents` |
| `00000000000012_create_ai_prompts`, `20260716120000_add_uuid_database_defaults` | `00000000000002_create_ai_prompts` |
| `00000000000011_create_ai_topics`, `00000000000012_create_ai_prompts`, `20260716120000_add_uuid_database_defaults` | `00000000000003_create_ai_topics` |
| `00000000000013_create_ai_tools`, `20260716120000_add_uuid_database_defaults` | `00000000000004_create_ai_tools` |
| `20260922090000_add_message_batch_windows` | `00000000000005_create_batch_window_claims` |
| `20260922090000_add_message_batch_windows` | `00000000000006_create_batch_windows` |
| `20261014170000_conversation_bulk_jobs` | `00000000000007_create_conversation_bulk_jobs` |
| `00000000000004_create_departments`, `20260716120000_add_uuid_database_defaults` | `00000000000008_create_departments` |
| `20260906000000_add_export_jobs`, `20260906000001_add_export_download_token`, `20261023180000_gcs_object_paths`, `20261123000000_remove_campaign_modules` | `00000000000009_create_export_jobs` |
| `20260916120000_redis_free_models` | `00000000000010_create_identity_lockouts` |
| `00000000000008_create_messaging_queues`, `20260716120000_add_uuid_database_defaults`, `20260819120000_add_messaging_queue_leases`, `20260918232300_add_queue_fsm_indexes`, `20261013170000_realtime_ingress` | `00000000000011_create_inbox_events` |
| `20261014000000_template_management` | `00000000000012_create_managed_templates` |
| `00000000000002_create_neighborhoods`, `20260716120000_add_uuid_database_defaults`, `20260817140000_promovidos_crm_neighborhood_matching`, `20260822120000_add_geo_fields_to_neighborhoods`, `20260822130000_neighborhood_match_key_municipality_unique`, `20261123000000_remove_campaign_modules` | `00000000000013_create_neighborhoods` |
| `00000000000020_create_newsletter_subscribers`, `20260716120000_add_uuid_database_defaults` | `00000000000014_create_newsletter_subscribers` |
| `20261009000000_add_notifications`, `20261013170000_realtime_ingress`, `20261018000000_message_media_history` | `00000000000015_create_notifications` |
| `00000000000008_create_messaging_queues`, `20260716120000_add_uuid_database_defaults`, `20260819120000_add_messaging_queue_leases` | `00000000000016_create_outbox_events` |
| `00000000000024_add_role_permissions`, `20260716120000_add_uuid_database_defaults`, `20260722120000_add_permission_management` | `00000000000017_create_permissions` |
| `20260916120000_redis_free_models` | `00000000000018_create_rate_limit_counters` |
| `00000000000021_create_realtime_outbox_events`, `20260716120000_add_uuid_database_defaults` | `00000000000019_create_realtime_outbox_events` |
| `00000000000001_create_users_roles`, `00000000000024_add_role_permissions`, `20260716120000_add_uuid_database_defaults` | `00000000000020_create_roles` |
| `00000000000006_create_tags_and_citizen_tags`, `00000000000022_add_raw_sql_invariants`, `20260716120000_add_uuid_database_defaults` | `00000000000021_create_tags` |
| `20261014000000_template_management` | `00000000000022_create_template_status_events` |
| `00000000000001_create_users_roles`, `20260716120000_add_uuid_database_defaults`, `20261019000000_add_user_phone` | `00000000000023_create_users` |
| `00000000000008_create_messaging_queues`, `20260716120000_add_uuid_database_defaults`, `20261018000000_message_media_history` | `00000000000024_create_webhook_event_logs` |
| `00000000000015_create_ai_agent_topics`, `20260716120000_add_uuid_database_defaults` | `00000000000025_create_ai_agent_topics` |
| `00000000000014_create_ai_topic_tools`, `20260716120000_add_uuid_database_defaults` | `00000000000026_create_ai_topic_tools` |
| `00000000000008_create_messaging_queues`, `20260716120000_add_uuid_database_defaults` | `00000000000027_create_audit_logs` |
| `00000000000003_create_citizens`, `20260716120000_add_uuid_database_defaults`, `20260817140000_promovidos_crm_neighborhood_matching` | `00000000000028_create_citizens` |
| `00000000000016_create_communication_lines`, `20260716120000_add_uuid_database_defaults` | `00000000000029_create_communication_lines` |
| `20261014170000_conversation_bulk_jobs` | `00000000000030_create_conversation_bulk_items` |
| `00000000000030_add_department_schedules`, `00000000000031_department_exception_recurrence`, `20260716120000_add_uuid_database_defaults` | `00000000000031_create_department_schedule_exceptions` |
| `00000000000030_add_department_schedules`, `20260716120000_add_uuid_database_defaults` | `00000000000032_create_department_schedules` |
| `00000000000009_create_events_module`, `20260716120000_add_uuid_database_defaults`, `20260906060000_add_event_neighborhood`, `20261109000000_event_visibility` | `00000000000033_create_events` |
| `20260822210000_add_password_resets` | `00000000000034_create_password_resets` |
| `20260916130000_refresh_sessions_idempotency` | `00000000000035_create_refresh_sessions` |
| `00000000000024_add_role_permissions` | `00000000000036_create_role_permissions` |
| `20260714120000_add_user_invitations`, `20260716120000_add_uuid_database_defaults` | `00000000000037_create_user_invitations` |
| `20261010130000_add_user_notification_preferences` | `00000000000038_create_user_notification_preferences` |
| `00000000000001_create_users_roles`, `20260716120000_add_uuid_database_defaults` | `00000000000039_create_user_roles` |
| `20261014060000_whatsapp_campaigns` | `00000000000040_create_campaigns` |
| `00000000000006_create_tags_and_citizen_tags`, `20260716120000_add_uuid_database_defaults` | `00000000000041_create_citizen_tags` |
| `00000000000005_create_conversations`, `00000000000022_add_raw_sql_invariants`, `20260716120000_add_uuid_database_defaults`, `20261007000000_add_conversation_is_canonical`, `20261010000000_add_attendance_mode`, `20261010120000_add_ticket_folio_and_message_ticket`, `20261011000000_add_conversation_transfer_audit`, `20261013170000_realtime_ingress`, `20261102000000_conversation_line_scope` | `00000000000042_create_conversations` |
| `00000000000019_create_tickets_and_messages`, `00000000000022_add_raw_sql_invariants`, `20260716120000_add_uuid_database_defaults`, `20261010120000_add_ticket_folio_and_message_ticket`, `20261109120000_tickets_pagination_indexes` | `00000000000043_create_tickets` |
| `00000000000030_add_department_schedules`, `20260716120000_add_uuid_database_defaults` | `00000000000044_create_department_exception_intervals` |
| `00000000000030_add_department_schedules`, `20260716120000_add_uuid_database_defaults` | `00000000000045_create_department_schedule_intervals` |
| `00000000000009_create_events_module`, `20260716120000_add_uuid_database_defaults` | `00000000000046_create_event_registrations` |
| `00000000000018_create_ai_runs_and_calls`, `20260716120000_add_uuid_database_defaults` | `00000000000047_create_ai_runs` |
| `00000000000008_create_messaging_queues`, `20260716120000_add_uuid_database_defaults` | `00000000000048_create_assignments` |
| `00000000000007_create_messages_and_attachments`, `20260716120000_add_uuid_database_defaults`, `20261018000000_message_media_history`, `20261104000000_attachment_provider_media_index` | `00000000000049_create_attachments` |
| `00000000000007_create_messages_and_attachments`, `20260716120000_add_uuid_database_defaults`, `20260916130000_refresh_sessions_idempotency`, `20260921050907_add_message_send_by`, `20261010120000_add_ticket_folio_and_message_ticket`, `20261018000000_message_history_media` | `00000000000050_create_messages` |
| `20261014080000_campaign_attachments`, `20261023180000_gcs_object_paths` | `00000000000051_create_campaign_attachments` |
| `20261014060000_whatsapp_campaigns` | `00000000000052_create_campaign_recipients` |
| `00000000000017_create_conversation_meta`, `20260716120000_add_uuid_database_defaults`, `20260916120000_redis_free_models`, `20260918232300_add_queue_fsm_indexes`, `20260921120000_add_handoff_kind` | `00000000000053_create_conversation_meta` |
| `20260924000000_add_conversation_reads` | `00000000000054_create_conversation_reads` |
| `00000000000009_create_events_module`, `20260716120000_add_uuid_database_defaults` | `00000000000055_create_event_checkins` |
| `00000000000018_create_ai_runs_and_calls`, `20260716120000_add_uuid_database_defaults` | `00000000000056_create_ai_tool_calls` |
| `00000000000008_create_messaging_queues`, `20260716120000_add_uuid_database_defaults` | `00000000000057_create_message_statuses` |
| `00000000000019_create_tickets_and_messages`, `20260716120000_add_uuid_database_defaults` | `00000000000058_create_ticket_messages` |
| Claves entre tablas cíclicas de `00000000000011_create_ai_topics`, `00000000000012_create_ai_prompts`, `00000000000005_create_conversations`, `00000000000007_create_messages_and_attachments` y `00000000000019_create_tickets_and_messages`; función y trigger de `20261102000000_conversation_line_scope` y `20261105000000_conversation_meta_insert_scope` | `00000000000059_add_shared_constraints` (tres claves foráneas, función y trigger definitivos) |
| Migraciones que solo crean y luego borran tablas electorales y `event_internal_details`; DML de `20261123000000_remove_campaign_modules` | Ninguna; omitir de la nueva base vacía |

## Code and data initialization

- `backend/prisma/schema.prisma`: added Prisma `map` metadata for existing index names, raw GIN trigram opclasses and the `conversation_bulk_items.jobId` foreign key, and declared its effective `ON UPDATE NO ACTION`. The SQL schema was not changed.
- `backend/prisma/seed/core/departments.seed.ts`: reconciles intervals by the existing unique range keys and skips updates when data is unchanged. Two consecutive runs now preserve every department, schedule, interval and exception row, including IDs and timestamps.
- `backend/prisma/seed/test/fixtures.seed.ts`: removed; it created no fixtures and had no legitimate test consumer. Removed its command and orchestrator path. Core and dev seeders remain.
- Three PostgreSQL suites now install the current baseline in their own temporary databases. Added `baseline-invariants.postgres.test.ts` for trigger and partial-index behavior.
- `README.md`, `backend/prisma/docs/`, and the CI migration-immutability gate were updated for the one-time baseline replacement.

## Decisions and plan deviations

The planned count of 60 was retained because three FK cycles require one companion migration. The PostgreSQL schema is kept exact. Prisma metadata was aligned where that did not alter SQL behavior; 42 UUID and 6 `updated_at` database defaults remain SQL-managed because Prisma 5.22.0 does not represent their database-side defaults alongside client-side defaults. The dev AI seeder was not removed because it supports active WhatsApp/AI workflows. Only the no-op test seeder was removed. No active table or campaign feature was deleted.

## File inventory

| Operation | Files |
|---|---|
| Created | 60 `backend/prisma/migrations/000000000000NN_*/migration.sql` files; `backend/src/__tests__/postgres/baseline-schema.ts`; `backend/src/__tests__/postgres/baseline-invariants.postgres.test.ts`; `docs/database-refactor/{DATABASE_CHANGELOG,DATABASE_SCHEMA_COMPARISON,DATABASE_VALIDATION}.md`. The three audit documents in the same directory existed as untracked work from phase 1 and were updated. |
| Modified | `.github/workflows/backend-ci.yml`, `README.md`, `backend/package.json`, `backend/prisma/schema.prisma`, `backend/prisma/seed/{index.ts,core/departments.seed.ts}`, the three existing PostgreSQL suites for campaigns, bulk actions and event visibility, `backend/prisma/docs/` (five files), `backend/src/ai/README.md`, and the affected migration references in `docs/{architecture/users-roles-permissions.md,campanas-whatsapp.md,mensajeria-medios-auditoria.md,plantillas-whatsapp.md}`. |
| Removed from active path | 78 historical `migration.sql` files and the no-op `backend/prisma/seed/test/fixtures.seed.ts`. The historical SQL remains at the Git reference commit. |

No frontend source file changed. A generated `frontend/tsconfig.tsbuildinfo` difference produced by frontend checks was restored to its initial tracked state.
