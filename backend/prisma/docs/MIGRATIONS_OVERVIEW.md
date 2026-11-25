# Prisma migrations overview

The active `backend/prisma/migrations/` directory contains a consolidated baseline for **new PostgreSQL 16 databases only**. It replaces the former 78 incremental migrations with 60 ordered migrations: one for shared PostgreSQL types/extensions, one per retained table (58), and one for three cyclic foreign keys plus the conversation line function and trigger. The historical chain is recoverable from Git at `603c480ca437d44ee02dca9392e2ee4d7bd20b57`.

Use `pnpm --dir backend migrate:deploy` on an empty database. Do **not** run this rewritten chain against a database that has the old migrations recorded in `_prisma_migrations`. The migration lock remains PostgreSQL. After a baseline is applied to a shared environment, future changes must use new forward migrations.

`schema.prisma` describes Prisma models and many indexes, but cannot express every effective SQL object. Database-side UUID defaults, functional and partial indexes, and the trigger are owned by the migration SQL. Review `prisma migrate diff` before accepting generated SQL: it currently proposes dropping database-side defaults. See [`DATABASE_SCHEMA_COMPARISON.md`](../../../docs/database-refactor/DATABASE_SCHEMA_COMPARISON.md).
