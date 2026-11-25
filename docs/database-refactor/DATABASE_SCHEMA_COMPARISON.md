# Historical versus consolidated PostgreSQL schema

## Environments and method

- Reference Git commit: `603c480ca437d44ee02dca9392e2ee4d7bd20b57` (78 historical migration files verified in Git).
- Two independent disposable `postgres:16-alpine` containers, both PostgreSQL **16.16**, same image and extension availability. Instance A applied the 78 historical migrations; instance B applied only the new 60-migration baseline. A second empty database was rebuilt from the active baseline.
- `prisma migrate deploy` succeeded on both. `pg_dump --schema-only --no-owner --no-privileges` was captured for each. The dumps differ only in `pg_dump`'s random `\restrict`/`\unrestrict` token; after removing those tokens, both have SHA-256 `e796e067265a9950be2e5416d25ff3040613840e966a3545b90c9ffde30ebd17`.
- Independently of text comparison, PostgreSQL catalog JSON was compared for each table's ordered columns (type, nullable, default), constraints (including FK actions and CHECK), and indexes; enums, extensions, function and trigger definitions were compared separately. Sequence parameters, views, RLS and policies were compared by catalog query. No application data was copied.

## Structural inventory

| Object | Historical A | Baseline B | Classification |
|---|---:|---:|---|
| Application tables | 58 | 58 | Equivalent |
| Enums | 38 | 38 | Equivalent, including values and order |
| Indexes, including PK/UNIQUE | 255 | 255 | Equivalent, including 4 partial and 3 expression indexes |
| Primary keys | 58 | 58 | Equivalent |
| Foreign keys | 68 | 68 | Equivalent, including ON DELETE/UPDATE |
| CHECK constraints | 4 | 4 | Equivalent |
| Other UNIQUE constraints | 1 | 1 | Equivalent; unique indexes counted above |
| Application sequences | 1 | 1 | Equivalent: `template_status_events_id_seq` |
| Own functions/triggers | 1 / 1 | 1 / 1 | Equivalent definitions |
| Extensions | `pgcrypto`, `pg_trgm`, `unaccent`, `plpgsql` | Same | Equivalent |
| Views / RLS policies | 0 / 0 | 0 / 0 | Equivalent |

The only `_prisma_migrations` differences are migration records (78 versus 60), intentionally excluded from the application inventory. None of the 15 transient tables appear in either final schema. The retained WhatsApp tables `campaigns`, `campaign_recipients`, `campaign_attachments` and their foreign keys are identical.

## Critical behavior

- `conversation_meta_line_scope` invokes `sync_conversation_line_scope()`. A new meta row inherits a bound conversation line when its own line is null. A conflicting line on insert or update is rejected; assigning a line to an unbound conversation updates its scope. The function and trigger definitions matched exactly in A and B. The new baseline test `baseline-invariants.postgres.test.ts` exercised those insert and update cases in B; 2 tests passed.
- `uq_conversations_active_per_citizen_channel_line`: `CREATE UNIQUE INDEX uq_conversations_active_per_citizen_channel_line ON public.conversations USING btree (citizen_id, channel, COALESCE(communication_line_id, '00000000-0000-0000-0000-000000000000'::uuid)) WHERE (status = ANY (ARRAY['open'::conversation_status, 'in_progress'::conversation_status]))`. The test rejected a second active conversation for the same citizen/channel/line, and admitted a closed one and an active one on another line.
- `uq_tickets_one_active_per_conversation`: `CREATE UNIQUE INDEX uq_tickets_one_active_per_conversation ON public.tickets USING btree (conversation_id) WHERE (status = ANY (ARRAY['OPEN'::ticket_status, 'IN_PROGRESS'::ticket_status]))`. The test rejected a second OPEN/IN_PROGRESS ticket for the same conversation while admitting a CLOSED ticket.
- Functional uniqueness on `lower(tags.name)` and the canonical-conversation partial index were also present in both catalog snapshots. The active WhatsApp campaign PostgreSQL suite passed.

## Prisma differences and resolution

`prisma migrate diff --from-url <baseline> --to-schema-datamodel prisma/schema.prisma --script` was run against B. The SQL catalog remains the source of truth. Prisma 5.22.0 does not fully model these SQL objects:

| Object | Effective PostgreSQL | Prisma description | Difference, behavior and risk | Resolution and evidence |
|---|---|---|---|---|
| 42 `id` columns | `DEFAULT gen_random_uuid()` | `@default(uuid())` generates IDs client side | Prisma proposes `DROP DEFAULT`; raw SQL inserts would lose UUID generation | Kept database defaults in table migrations and client defaults in Prisma; 42 catalog defaults matched A/B. Do not apply this generated diff. |
| 6 `updated_at` columns | `DEFAULT CURRENT_TIMESTAMP` | `@updatedAt` | Prisma proposes `DROP DEFAULT`; raw SQL inserts could fail | Preserved SQL defaults. Six catalog defaults matched A/B. |
| Three neighborhood indexes | Two GIN trigram indexes and one btree zone index | Prisma previously omitted them | A generated diff proposed dropping them | Added `@@index` with `raw("gin_trgm_ops")`/`map`; all three DROP INDEX operations disappeared. PostgreSQL catalog remained identical. |
| `conversation_bulk_items.jobId` FK | `conversation_bulk_items_jobId_fkey`, ON DELETE CASCADE, ON UPDATE NO ACTION | Prisma previously assumed ON UPDATE CASCADE | Prisma proposed drop/recreate FK; changes referential behavior | Added Prisma `map` and `onUpdate: NoAction`. The FK diff disappeared; catalog remained identical. |
| 10 index names | Existing SQL names | Prisma generated alternate names | Prisma proposed renames without semantic change | Added Prisma `map` metadata. All rename operations disappeared from the diff. |
| Partial/expression indexes and trigger | SQL in baseline | Not representable in Prisma datamodel | Future generated migrations may omit or drop them | Kept SQL definitions, added behavioral tests, and require review of generated SQL before applying future migrations. |

UUID default tables: `ai_agent_topics`, `ai_agents`, `ai_prompts`, `ai_runs`, `ai_tool_calls`, `ai_tools`, `ai_topic_tools`, `ai_topics`, `assignments`, `attachments`, `audit_logs`, `citizen_tags`, `citizens`, `communication_lines`, `conversation_meta`, `conversations`, `department_exception_intervals`, `department_schedule_exceptions`, `department_schedule_intervals`, `department_schedules`, `departments`, `event_checkins`, `event_registrations`, `events`, `identity_lockouts`, `inbox_events`, `message_statuses`, `messages`, `neighborhoods`, `newsletter_subscribers`, `outbox_events`, `permissions`, `realtime_outbox_events`, `roles`, `tags`, `ticket_messages`, `tickets`, `user_invitations`, `user_notification_preferences`, `user_roles`, `users`, `webhook_event_logs`.

`updated_at` default tables: `batch_window_claims`, `batch_windows`, `department_schedule_exceptions`, `department_schedules`, `identity_lockouts`, `user_invitations`.

The remaining Prisma-generated diff contains **48 `DROP DEFAULT` operations**; those are known representation gaps, not changes applied to PostgreSQL. No unexpected PostgreSQL catalog difference remains. Future Prisma migration SQL must be inspected for these operations before deployment.

## Conclusion

The historical and consolidated schemas are structurally equivalent by catalog comparison. Their matching trigger and partial-index definitions, together with executed insertion/update tests on the consolidated baseline, support functional equivalence for the critical WhatsApp isolation rules. This conclusion applies to **new, empty PostgreSQL 16 installations**. No existing database was modified or tested for migration compatibility.
