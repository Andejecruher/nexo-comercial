# Schema Drift Report

Report date: 2026-07-09
Scope: Prisma schema and the new clean migration baseline.

## Audit methodology

1. Read `backend/prisma/schema.prisma` as the declared source of truth.
2. Generate the SQL that Prisma would produce from the schema against an empty database using `prisma migrate diff --from-empty --to-schema-datamodel`.
3. Compare the generated SQL against the concatenated baseline migrations.
4. Verify that raw SQL invariants are present in the baseline.

## Source-of-truth comparison

| Source | Last known state | Trust level | Notes |
|--------|------------------|-------------|-------|
| `backend/prisma/schema.prisma` | Valid; Prisma 5.22.0 | **Primary source of truth** | Declares models, enums, relations, and Prisma-managed indexes. |
| `backend/prisma/migrations/` | Clean baseline | **Immutable baseline** | Recreates the current schema in ordered migrations. |
| Docker development DB | Not checked in this rewrite | N/A | Verify before applying to an existing dev database. |
| Production DB | **Not checked** | **Unknown** | Must be verified before any future migration deployment. |

## Drift findings

### Finding 1: Raw functional unique index not represented in Prisma schema

- **Object:** `uq_tags_name_lower`
- **Migration:** `00000000000022_add_raw_sql_invariants`
- **SQL:** `CREATE UNIQUE INDEX IF NOT EXISTS "uq_tags_name_lower" ON "tags" (lower("name"));`
- **Prisma schema representation:** The Prisma model `Tag` has `@unique` on `name`, which creates `tags_name_key` on the raw column. The functional index on `lower(name)` is not declared in the Prisma schema.
- **Drift type:** Prisma schema is missing a DB-level invariant.
- **Risk:** A future `prisma db push` could drop the functional index unintentionally.
- **Resolution:** Preserved in the baseline `00000000000022_add_raw_sql_invariants` migration.

### Finding 2: Partial unique index on active conversations

- **Object:** `uq_conversations_active_per_citizen_channel`
- **Migration:** `00000000000022_add_raw_sql_invariants`
- **SQL:** Partial unique index on `(citizen_id, channel) WHERE status IN ('open', 'in_progress')`.
- **Prisma schema representation:** Not declared in the `Conversation` model.
- **Drift type:** Business rule enforced only in raw SQL.
- **Resolution:** Preserved in the baseline `00000000000022_add_raw_sql_invariants` migration.

### Finding 3: Partial unique index on active tickets

- **Object:** `uq_tickets_one_active_per_conversation`
- **Migration:** `00000000000022_add_raw_sql_invariants`
- **SQL:** Partial unique index on `conversation_id WHERE status IN ('OPEN', 'IN_PROGRESS')`.
- **Prisma schema representation:** Not declared in the `Ticket` model.
- **Drift type:** Business rule enforced only in raw SQL.
- **Resolution:** Preserved in the baseline `00000000000022_add_raw_sql_invariants` migration.

### Finding 4: Realtime outbox indexes

- **Object:** `realtime_outbox_events_status_next_retry_at_idx`, `realtime_outbox_events_event_type_idx`, `realtime_outbox_events_created_at_idx`
- **Migration:** `00000000000021_create_realtime_outbox_events`
- **Prisma schema representation:** The `RealtimeOutboxEvent` model declares `@@index([status, nextRetryAt])`, `@@index([eventType])`, and `@@index([createdAt])`. These match the migration.
- **Drift type:** None.
- **Risk:** Low.

### Finding 5: `sanitize_phone_duplicates.sql` moved

- **Object:** `backend/scripts/migrations/sanitize_phone_duplicates.sql`
- **Status:** Moved out of the Prisma migrations folder.
- **Drift type:** Operational artifact outside version-controlled migration flow.
- **Risk:** Could be run accidentally or forgotten. No idempotent re-run guarantee from Prisma.
- **Resolution:** Documented as a manual one-off script.

### Finding 6: Seed migration `00000000000023_seed_panel_roles` is data-only

- **Object:** `roles` table population.
- **Drift type:** None; this is an intentional data seed migration.
- **Risk:** Low. The migration is idempotent via `ON CONFLICT ... DO NOTHING`.

### Finding 7: Prisma schema vs migration column defaults

- **Observation:** The Prisma schema uses `@default` values that match the migrations (e.g., `ConversationStatus.open`, `LeadStatus.new`, arrays defaulting to `[]`).
- **Drift type:** None detected.
- **Risk:** Low.

### Finding 8: Superadmin default password fallback removed

- **Object:** `backend/prisma/seed/dev/superadmin.seed.ts`
- **Observation:** The seeder now throws if `SUPERADMIN_PASSWORD` is unset.
- **Drift type:** Operational risk resolved.
- **Risk:** Low.

### Finding 9: AI communication line phone mismatch resolved

- **Object:** `backend/prisma/seed/dev/ai-module.seed.ts`
- **Observation:** Both `update` and `create` paths now use `+5215551468932`.
- **Drift type:** Data inconsistency resolved.
- **Risk:** Low.

## Schema drift risk matrix

| ID | Finding | Severity | Current action required |
|----|---------|----------|------------------------|
| 1 | `uq_tags_name_lower` not in Prisma schema | Medium | Preserved in baseline; continue to preserve in future tag-related migrations. |
| 2 | Active conversation partial unique index not in schema | Medium | Preserved in baseline. |
| 3 | Active ticket partial unique index not in schema | Medium | Preserved in baseline. |
| 4 | Realtime outbox indexes match schema | Low | None. |
| 5 | `sanitize_phone_duplicates.sql` moved | Medium | Documented as manual one-off. |
| 6 | Data-only seed migration | Low | None. |
| 7 | Defaults match | Low | None. |
| 8 | Superadmin default password | Low | Resolved. |
| 9 | Seeder phone number mismatch | Low | Resolved. |

## Verification commands

Safe commands to reproduce this report:

```bash
# Validate schema
npx prisma validate --schema=./prisma/schema.prisma

# Generate full SQL from schema (does not modify DB)
npx prisma migrate diff --from-empty --to-schema-datamodel ./prisma/schema.prisma --script > /tmp/schema_to_empty.sql

# Compare with baseline migrations
cat prisma/migrations/*/migration.sql > /tmp/baseline.sql
# Diff after normalizing comments and whitespace
```

> Do not run `prisma db pull` or `prisma migrate reset` against production or shared databases.

## Recommendations

1. **Verify production** before the next deployment by running `prisma migrate status` against a read-only replica.
2. **Preserve raw SQL invariants** in any future migration that touches `tags`, `conversations`, or `tickets`.
3. **Document out-of-band indexes** in migration header comments so future developers know they exist.
4. **Fix seeder issues** (phone mismatch, default password) were resolved in the seed reorganization.
