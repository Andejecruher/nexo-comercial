# Database baseline validation

## Scope and environment

Implementation branch: `refactor/database-baseline`. Reference Git commit: `603c480ca437d44ee02dca9392e2ee4d7bd20b57`. PostgreSQL image: `postgres:16-alpine` (server 16.16). Historical and baseline migrations ran in separate, disposable containers. All further seed and application checks used disposable databases. No shared or existing database was reset or migrated.

## Migration and schema results

| Check | Command or method | Result |
|---|---|---|
| Historical installation | `prisma migrate deploy` with 78 Git-reference migrations | 78/78 applied |
| Consolidated installation | `prisma migrate deploy` with 60 active migrations | 60/60 applied |
| Second clean rebuild | `prisma migrate deploy` on a second empty database | 60/60 applied |
| Subsequent normal migration command | `prisma migrate deploy` again | `No pending migrations to apply` |
| Migration state | `prisma migrate status` | `Database schema is up to date` |
| Schema comparison | `pg_dump --schema-only` and PostgreSQL catalog JSON | 58 tables, 38 enums, 255 indexes, 68 FKs, 4 CHECKs, one sequence, one function and one trigger match. See [`DATABASE_SCHEMA_COMPARISON.md`](DATABASE_SCHEMA_COMPARISON.md). |
| Prisma syntax/client | `prisma validate`; `pnpm run prisma:generate` | Passed, Prisma Client 5.22.0 generated |

The PostgreSQL and Prisma comparison has 48 known `DROP DEFAULT` suggestions (42 UUID, 6 `updated_at`), which were **not** executed. Index and FK rename/drop suggestions were resolved with Prisma metadata. These defaults are the remaining representation gap and require review whenever future migration SQL is generated.

## Seeder validation

The `core` scope was run twice consecutively on the same newly rebuilt database with `NODE_ENV=development`. Row counts and a hash of the complete JSON row set for each department table were captured immediately after both runs:

| Table | Before first run | After first | After second | Full row snapshot unchanged on second run |
|---|---:|---:|---:|---|
| `departments` | 0 | 7 | 7 | Yes |
| `department_schedules` | 0 | 49 | 49 | Yes |
| `department_schedule_intervals` | 0 | 39 | 39 | Yes |
| `department_schedule_exceptions` | 0 | 3 | 3 | Yes |
| `department_exception_intervals` | 0 | 2 | 2 | Yes |

The first run created seven departments; the second found and updated zero values that differed. The complete row snapshots, including IDs and timestamps, had equal hashes before and after the second run. The other core seeders produced 837 neighborhoods, five roles, 70 permissions and 141 role-permission assignments without an integrity error.

Snapshot MD5 values after both runs, respectively: `departments` `6bfd4208281aa213af2b444d8af10999`, `department_schedules` `7560a0ab564f9475a8ce063094f464b9`, `department_schedule_intervals` `32b03c9843f2e5dd0b5c5e21d4332abe`, `department_schedule_exceptions` `0a2a8843cb6efcad25b09fff15738e4a`, and `department_exception_intervals` `d7b913ceec70f6949003be9698ae9e07`.

The `dev` scope passed after supplying local disposable values for all required environment variables and a valid 32-byte encryption key: superadmin, AI agent, prompts, topics, tools and communication line synchronized. Two earlier attempts failed because the test environment omitted required variables and then supplied an invalid-length dummy encryption key; neither failure was caused by migration incompatibility. The removed `test` seeder was a no-op with no test consumer.

## WhatsApp isolation and application checks

- The new `baseline-invariants.postgres.test.ts` passed **2/2** tests. It exercised the line-scope trigger on insert and update, rejection of conflicting line assignments, and both critical partial unique indexes by attempting valid and invalid inserts. Their SQL definitions matched the historical catalog.
- The complete PostgreSQL suite passed: **12 suites, 74 tests passed, one skipped**. Campaign WhatsApp, bulk actions, event visibility, messaging and baseline invariant suites used isolated databases where needed.
- Backend unit suite passed: **175 suites, 1711 tests passed, two skipped** (one suite skipped).
- Backend `typecheck`, `typecheck:test`, seed TypeScript check, lint and build passed. The backend started against a disposable baseline database, connected to PostgreSQL, and `GET /health` returned **HTTP 200** with `{"status":"ok"}`.
- Frontend `typecheck`, lint and test passed: **103 test files, 641 tests**. The build passed and produced the expected admin campaign routes. The frontend served `/admin` with HTTP 307 to `/admin/indicadores/atencion`.

## Commands to reproduce on an empty local database

Set `DATABASE_URL` to a **new PostgreSQL 16 database**, then:

```bash
pnpm --dir backend migrate:deploy
pnpm --dir backend migrate:deploy      # Must report no pending migrations
pnpm --dir backend exec prisma migrate status --schema=./prisma/schema.prisma
pnpm --dir backend prisma:seed:core
pnpm --dir backend prisma:seed:core     # Repeat; department rows must stay stable
pnpm --dir backend exec prisma validate --schema=./prisma/schema.prisma
pnpm --dir backend prisma:generate
pnpm --dir backend typecheck
pnpm --dir backend typecheck:test
pnpm --dir backend build
pnpm --dir backend lint
pnpm --dir backend test
pnpm --dir backend test:postgres
pnpm --dir frontend typecheck
pnpm --dir frontend lint
pnpm --dir frontend test
pnpm --dir frontend build
```

`prisma:seed:dev` additionally requires `SUPERADMIN_PASSWORD`, a valid `ENCRYPTION_KEY`, and the required app/WhatsApp environment settings. Use disposable values in test databases. PostgreSQL integration suites create and remove their own temporary databases, so the DB role must have `CREATEDB` privilege.

## Pending and limits

- Final result: **0 failing suites and 0 failing tests** in the executed backend, PostgreSQL and frontend suites. During implementation, an initial PostgreSQL test run failed because schema-qualified SQL was being applied through a schema-scoped URL; suites were moved to separate temporary databases and then passed. One new trigger test initially failed because its fixture omitted the referenced communication lines; the fixture was corrected and the test passed. The two initial dev-seed attempts failed on missing or invalid disposable environment values; the final configured run passed.
- No dedicated browser end-to-end suite is declared in `frontend/package.json`; the frontend build and test suite were run instead.
- No deployment, production migration, merge, commit or push was performed.
- This baseline is **only for empty databases**. An installation with the historical 78 migrations in `_prisma_migrations` requires a separate, approved adoption procedure.
- Future Prisma migrations can suggest dropping database defaults. Review generated SQL against [`DATABASE_SCHEMA_COMPARISON.md`](DATABASE_SCHEMA_COMPARISON.md) before applying it.

**Estado: LISTO PARA REVISIÓN.** La comparación de catálogos no dejó diferencias inesperadas y las validaciones críticas pasaron. La decisión operativa pendiente es mantener la revisión manual de los 48 defaults SQL al generar migraciones futuras; esta implementación no aplicó el diff de Prisma.
