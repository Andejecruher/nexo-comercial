# Prisma Migrations Overview

This document describes the migration strategy and operational rules for the `nexo-comercial` backend database.

- **Database**: PostgreSQL
- **Prisma ORM version**: `5.22.0`
- **Migration engine**: Prisma Migrate
- **Migration folder**: `backend/prisma/migrations`
- **Schema source of truth**: `backend/prisma/schema.prisma`

## Executive summary

The migration history was rewritten into a clean baseline. The old 17 incremental migrations (which included destructive refactors, short-lived columns, and add-then-drop churn) were replaced by a set of ordered baseline migrations that create the current schema from an empty database.

This rewrite is safe only for new or local databases. Do **not** apply this baseline to a database that already has the old migrations recorded in `_prisma_migrations`.

## Core policy: baseline migrations are immutable

Once a baseline migration has been applied to any shared database, it must not be modified.

### Forbidden operations on applied migrations

- Rename migration folders or files.
- Edit `migration.sql` contents.
- Reorder migrations.
- Delete migration folders.
- Regenerate migrations that have already been applied.
- Manually edit `migration_lock.toml`.

### Allowed corrections

- Add **new** migrations to fix issues or add features.
- Update **documentation only** (this folder).
- Run read-only validation commands.

> The only safe way to "fix" an applied migration is to add a new compensating migration that runs after it.

## Baseline naming convention

The baseline migrations use a sequential `00000000000000_<description>` prefix so the ordering is explicit and independent of wall-clock time:

```text
00000000000000_init_enums
00000000000001_create_users_roles
00000000000002_create_neighborhoods
...
```

### Future migration naming convention

All **future** migrations must use the following format:

```text
YYYYMMDDHHMMSS_<action>_<object>
```

Examples:

```text
20260709103000_add_citizen_verified_at
20260709110000_create_service_catalog_table
20260709111500_alter_department_add_parent_id
20260709113000_drop_legacy_temp_table
```

| Segment          | Rule                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------- |
| `YYYYMMDDHHMMSS` | UTC timestamp when the migration is created. Use the actual clock time, not a fictional sequence. |
| `<action>`       | One of: `init`, `create`, `add`, `alter`, `drop`, `rename`, `seed`, `fix`.                        |
| `<object>`       | Lowercase, snake_case, descriptive table/column/feature name.                                     |

## Per-migration review checklist

Before merging any new migration:

- [ ] Migration name follows the `YYYYMMDDHHMMSS_<action>_<object>` convention (or the baseline sequential convention for baseline edits).
- [ ] Migration is generated against the latest `schema.prisma`.
- [ ] `prisma migrate diff` or local `prisma migrate dev` was used to produce the SQL.
- [ ] Destructive changes are intentional and documented in the migration header comments.
- [ ] A data-loss warning is added if the migration drops columns, tables, or enums.
- [ ] Indexes on large tables use `CONCURRENTLY` where appropriate.
- [ ] Raw SQL invariants (partial indexes, functional indexes) are documented in `MIGRATION_HISTORY.md`.
- [ ] The migration has been applied locally or in a Docker dev database and verified.
- [ ] `prisma migrate status` shows no pending or failed migrations.
- [ ] A rollback plan exists for production (e.g., a compensating migration or backup restore).

## Source-of-truth comparison

| Source                         | Last known state                     | Trust level                 | Notes                                                          |
| ------------------------------ | ------------------------------------ | --------------------------- | -------------------------------------------------------------- |
| `backend/prisma/schema.prisma` | Valid; Prisma 5.22.0                 | **Primary source of truth** | Declares models, enums, relations, and Prisma-managed indexes. |
| `backend/prisma/migrations/`   | Clean baseline                       | **Immutable baseline**      | Ordered migrations that recreate the current schema.           |
| Docker development DB          | Not checked in this baseline rewrite | High for dev environment    | Verify before applying to any existing dev database.           |
| Production DB                  | **Not checked**                      | **Unknown**                 | Must be verified before any future migration deployment.       |

## Safe operational commands

The following commands are safe to run in development and CI:

```bash
# Validate schema syntax
npx prisma validate --schema=./prisma/schema.prisma

# Check migration status (read-only against the DB)
npx prisma migrate status --schema=./prisma/schema.prisma

# Generate Prisma Client
npx prisma generate --schema=./prisma/schema.prisma

# Apply pending migrations in production-like environments
npx prisma migrate deploy --schema=./prisma/schema.prisma

# Seed development database with core data (only when NODE_ENV != production)
pnpm run prisma:seed
```

## Forbidden operational commands

Do not run these against a shared or production database unless you have a verified backup and an explicit runbook:

```bash
# Resets the database and reapplies migrations — destructive.
npx prisma migrate reset

# Pushes schema changes without migrations — bypasses version control.
npx prisma db push

# Pulls schema from DB and overwrites schema.prisma — can erase Prisma-specific metadata.
npx prisma db pull

# Executes arbitrary SQL without review.
npx prisma db execute --file ./unreviewed.sql
```

## Raw SQL invariants to preserve

The following constraints and indexes are implemented as raw SQL and must be preserved in future migrations:

| Object                                            | Migration                                                              | Type                    | Purpose                                                  |
| ------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------- | -------------------------------------------------------- |
| `uq_tags_name_lower`                              | `00000000000022_add_raw_sql_invariants`                                | Functional unique index | Case-insensitive uniqueness on `tags.name`.              |
| `uq_conversations_active_per_citizen_channel`     | `00000000000022_add_raw_sql_invariants`                                | Partial unique index    | One active conversation per citizen/channel.             |
| `uq_tickets_one_active_per_conversation`          | `00000000000022_add_raw_sql_invariants`                                | Partial unique index    | One active ticket per conversation.                      |
| `realtime_outbox_events_status_next_retry_at_idx` | `00000000000021_create_realtime_outbox_events`                         | Composite index         | Outbox polling by status/retry time.                     |
| `realtime_outbox_events_event_type_idx`           | `00000000000021_create_realtime_outbox_events`                         | Single-column index     | Event-type filtering.                                    |
| `realtime_outbox_events_created_at_idx`           | `00000000000021_create_realtime_outbox_events`                         | Single-column index     | Time-based cleanup/queries.                              |
| `sections_*_nonneg_chk`                           | `20260911200000_add_section_ops_and_structures`                        | CHECK                   | Non-negative nullable operational metrics on `sections`. |
| `organizational_structures_color_hex_chk`         | `20260912180000_alter_organizational_structures_add_color_and_manager` | CHECK                   | HEX `#RRGGBB` on `organizational_structures.color`.      |

## Baseline rationale

| Finding                                                                           | Resolution in baseline                                                 |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `20260424021000_align_full_crm_schema` dropped legacy tables, columns, and enums. | Removed; baseline creates the final tables directly.                   |
| `20260425234513_` had an empty name suffix.                                       | Removed; replaced by descriptive baseline migration names.             |
| `20260510161656_add_whatsapp_fields` added then dropped FSM tracking columns.     | Removed; baseline only creates columns that exist in the final schema. |
| `sanitize_phone_duplicates.sql` was outside Prisma Migrate tracking.              | Moved to `backend/scripts/migrations/sanitize_phone_duplicates.sql`.   |

## Related documents

- `MIGRATION_HISTORY.md` — chronological baseline inventory and migration → objects matrix.
- `TABLE_EVOLUTION.md` — table/model → migrations evolution.
- `SCHEMA_DRIFT_REPORT.md` — drift findings and source-of-truth comparison.
- `SEEDING_GUIDE.md` — seeder architecture, idempotency, and commands.
