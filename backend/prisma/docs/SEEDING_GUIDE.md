# Seeding guide

The active baseline is for empty PostgreSQL 16 databases. Run `prisma migrate deploy` before seeding. `backend/prisma/seed/index.ts` defaults to `core`, refuses `NODE_ENV=production`, and runs seeders in this order:

1. `core/neighborhoods.seed.ts` — operational neighborhood catalog.
2. `core/roles.seed.ts` — five active panel roles.
3. `core/permissions.seed.ts` — active permission catalog.
4. `core/role-permissions.seed.ts` — role to permission assignments.
5. `core/departments.seed.ts` — seven departments, weekly schedules and configured exceptions.
6. `dev/superadmin.seed.ts` and `dev/ai-module.seed.ts` — optional development data only.

The former `test/fixtures.seed.ts` was empty and had no test consumers. It and `prisma:seed:test` were removed. PostgreSQL integration tests now create their own temporary databases and install the active baseline.

## Commands

```bash
pnpm --dir backend migrate:deploy
pnpm --dir backend prisma:seed:core
pnpm --dir backend prisma:seed:dev  # Requires SUPERADMIN_PASSWORD and core data first
pnpm --dir backend prisma:seed:all  # Core, then dev
```

`prisma:seed` defaults to `core`. `prisma:seed:ai` remains an alias for the `dev` scope. None of these commands should be run on a previously migrated database with the historical 78 migration chain. The generic seeder refuses production.

## Idempotency and data classes

Roles, permissions and their matrix are necessary for RBAC. Neighborhoods and departments are operational reference data. The development superadmin requires `SUPERADMIN_PASSWORD` from the environment; its email has a configurable default. The AI seeder uses fixed UUIDs for deterministic demonstration data and reads WhatsApp credentials only from environment variables.

Department schedules use `(department_id, day_of_week)` and their existing unique interval ranges as stable identities. Repeated core runs preserve IDs and timestamps for unchanged departments, schedules, intervals and exceptions. Obsolete seeded ranges are removed only when the configured reference schedule changes. `role-permissions.seed.ts` uses `skipDuplicates`; it does not remove older assignments in an already populated database.

For the executed two-run evidence, counts and row snapshots, see [`docs/database-refactor/DATABASE_VALIDATION.md`](../../../docs/database-refactor/DATABASE_VALIDATION.md).
