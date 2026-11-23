# Seeding Guide

This document describes the seeder architecture, idempotency rules, and operational commands for the `voz-ciudadana` backend after the baseline reorganization.

## Current seeders

| File | Purpose | Production guard |
|------|---------|------------------|
| `backend/prisma/seed/index.ts` | Dependency-aware orchestrator. Runs core seeders, then dev seeders, then optional test fixtures. | Throws if `NODE_ENV === 'production'`. |
| `backend/prisma/seed/core/neighborhoods.seed.ts` | Reference data: ~850 neighborhood names from Cintalapa de Figueroa, Chiapas. | N/A (called by orchestrator). |
| `backend/prisma/seed/core/roles.seed.ts` | Reference data: four panel roles. | N/A (called by orchestrator). |
| `backend/prisma/seed/core/departments.seed.ts` | Reference data: seven municipal departments with service schedules and routing keywords. | N/A (called by orchestrator). |
| `backend/prisma/seed/dev/superadmin.seed.ts` | Development-only superadmin user. | N/A (called by orchestrator). |
| `backend/prisma/seed/dev/ai-module.seed.ts` | Development-only AI smoke data: agent, topics, prompts, tools, topic links, communication line. | N/A (called by orchestrator). |
| `backend/prisma/seed/test/fixtures.seed.ts` | Test-only fixtures (placeholder). | N/A (called by orchestrator). |
| `backend/prisma/seed/shared/utils.ts` | Shared helpers: `toNameLower`, `hashPassword`. | N/A. |

## Seeder architecture

```text
backend/prisma/seed/
├── index.ts                    # Orchestrator: core → dev → test
├── core/
│   ├── neighborhoods.seed.ts   # Required reference data
│   ├── roles.seed.ts           # Required reference data
│   └── departments.seed.ts     # Required reference data
├── dev/
│   ├── superadmin.seed.ts      # Development-only superadmin
│   └── ai-module.seed.ts       # Development-only AI smoke data
├── test/
│   └── fixtures.seed.ts        # Deterministic test fixtures
└── shared/
    └── utils.ts                # Common upsert helpers, hashers
```

### Dependency-aware orchestration

`index.ts` runs seeders in dependency order and fails fast on errors. The default scope is `core`, so the generic seed command is safe to run in fresh environments without dev credentials:

```text
1. core/reference data (neighborhoods, roles, departments) — default
2. dev data (superadmin, AI module) — only with scope `dev` or `all`
3. test fixtures — only when NODE_ENV === 'test' or scope === 'test'
```

Pass a scope argument to override the default (`core`):

```bash
pnpm run prisma:seed        # core only (safe default)
pnpm run prisma:seed core   # core only (explicit)
pnpm run prisma:seed dev    # dev only (superadmin + AI module; requires SUPERADMIN_PASSWORD)
pnpm run prisma:seed all    # core + dev + test path (requires SUPERADMIN_PASSWORD)
pnpm run prisma:seed test   # test fixtures only
```

> Running `all` calls the test-fixture seeder, but that seeder returns immediately unless `NODE_ENV=test`.

## Idempotency rules

All seed functions use Prisma `upsert` with deterministic natural keys or fixed UUIDs:

| Entity | Upsert key | Notes |
|--------|-----------|-------|
| `Neighborhood` | `name` | Updates `nameLower` if the name already exists. |
| `Role` | `name` | Updates description. |
| `Department` | `slug` | Updates name, description, service hours, schedule, keywords. |
| `User` (superadmin) | `email` | Skips creation if the email exists. Password now required via env var. |
| `AiAgent` | `id` (fixed UUID) | Full update body. |
| `AiPrompt` | `id` (fixed UUID) | Full update body. |
| `AiTopic` | `id` (fixed UUID) | Full update body. |
| `AiTool` | `id` (fixed UUID) | Full update body. |
| `AiTopicTool` | `id` (fixed UUID) | Full update body. |
| `AiAgentTopic` | `id` (fixed UUID) | Full update body. |
| `CommunicationLine` | `channel` + `externalIdentifier` (natural key), fallback to `id` (fixed UUID) | Resolves the natural unique key first, so a line created from the admin UI or with an older WhatsApp phone id is updated in place instead of moving the identifier between rows. Full update body. |

### Required idempotency principles

1. **Use `upsert` or `ON CONFLICT` for every seeded row.** Never assume the database is empty.
2. **Prefer stable natural keys** (`slug`, `name`, `email`) over auto-generated UUIDs for core reference data.
3. **Use fixed UUIDs only when the seed is tied to hardcoded IDs elsewhere** (e.g., the AI module uses fixed IDs for deterministic smoke tests).
4. **Make update bodies deterministic.** Running the seeder twice must produce the same final row state.
5. **Guard production explicitly.** Throw early if `NODE_ENV === 'production'` unless the seeder is explicitly production-safe.
6. **Do not delete data in seeders.** Seeders should be additive/idempotent, not destructive.

## Operational commands

```bash
# Core only (safe default)
pnpm run prisma:seed

# Core only (explicit)
pnpm run prisma:seed:core

# Dev only (superadmin + AI module; depends on core seed; requires SUPERADMIN_PASSWORD)
pnpm run prisma:seed:dev

# Backward-compatible alias for dev-only AI seed
pnpm run prisma:seed:ai

# All scopes (core + dev + test path; requires SUPERADMIN_PASSWORD)
pnpm run prisma:seed:all

# Test fixtures only
pnpm run prisma:seed:test

# Seed in a fresh Docker environment
pnpm run prisma:migrate:prod && pnpm run prisma:seed
```

## Seeder environment matrix

| Seeder | Development | Staging | Test | Production |
|--------|-------------|---------|------|------------|
| Neighborhoods | Yes | Yes | Yes | Manual/None |
| Roles | Yes | Yes | Yes | Manual/None |
| Departments | Yes | Yes | Yes | Manual/None |
| Superadmin | Yes | Manual | Yes | Manual |
| AI module | Yes | No | Yes | No |
| Test fixtures | No | No | Yes | No |

> Production should receive reference data through controlled migrations or admin onboarding, not through the generic seed command.

## Seeder do's and don'ts

### Do

- Use `upsert` for every row.
- Guard production with an early `throw`.
- Keep seeders deterministic and repeatable.
- Document dependencies between seeders.
- Run seeders inside transactions when order matters.
- Log what was created vs skipped.

### Don't

- Delete or truncate tables in seeders.
- Generate random UUIDs unless the data is purely ephemeral.
- Hardcode secrets or production credentials.
- Run seeders against production without explicit approval.
- Introduce non-idempotent inserts.

## Resolved issues

1. **Removed default superadmin password fallback.**
   - `seedSuperadmin` now throws if `SUPERADMIN_PASSWORD` is unset.

2. **Aligned `CommunicationLine` phone number between update and create paths.**
   - Both paths now use `+5215551468932`.

3. **Split seeders into `core/`, `dev/`, `test/` folders.**
   - Each domain owns its seed file; `index.ts` orchestrates dependencies.

4. **Fixed the `CommunicationLine` unique-constraint collision.**
   - The seeder used the fixed seed UUID as its only upsert key, so an existing line holding the same `(channel, external_identifier)` pair under a different id made the run fail with `P2002`.
   - It now resolves the natural key first and falls back to the fixed UUID only when that pair is free.
