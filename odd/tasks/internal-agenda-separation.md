# Internal agenda separation
Implement a private logistical agenda while preserving public event behavior and hardening every public exposure path.
Branch: `feat/internal-agenda-separation`. Delivery: `feature-branch-chain`; test runners: backend Jest/Postgres and frontend Vitest.

## Specs
S1. “Crear la migración `20261109000000_event_visibility`” with `CREATE TYPE "event_visibility" AS ENUM ('public', 'internal');`, `visibility` on `events` defaulting to `'public'`, `event_internal_details` as 1:1 `ON DELETE CASCADE`, compound indexes, and a trigger rejecting details for non-internal events.
S2. “Forzar `{ visibility: EventVisibility.public }` de forma rígida en todos los métodos de consulta pública” and “No permitir que la visibilidad sea un parámetro opcional en estas firmas.”
S3. “La agenda interna es exclusivamente para logística interna y equipo (NO maneja RSVP público ni check-in).” Existing public administration endpoints must operate only on `visibility = 'public'`; internal events cannot invite or create outbound messages.
S4. “Crear controlador, servicio y archivo de rutas `backend/src/routes/internal-agenda.routes.ts` bajo la base `/api/v1/admin/jornada/internal-agenda`” with `GET`, `POST`, `GET /:id`, `PATCH /:id`, and `DELETE /:id` logical cancellation.
S5. “Asignar permisos `agenda_interna.*` (`view`, `create`, `update`, `delete`) al rol `super-admin` y `coordinador`” and “Asegurar que el rol `capturista` NO tenga acceso por defecto al módulo `agenda_interna`.”
S6. “Crear `frontend/lib/internal-agenda-api.ts` y el hook `useInternalAgenda.ts` completamente aislados del módulo de eventos públicos”; add URL-backed `?tab=public|internal`, permission-gated internal UI, sidebar entry, visible “Solo Uso Interno” badge, and logistical checklist management.
S7. “Crear `backend/src/__tests__/postgres/event-visibility.postgres.test.ts`” validating internal published events are absent from `listPublishedInWeek`, public attendance returns 404 for them, and `getWeeklyEvents` omits them. Run `pnpm --dir backend run typecheck`, `pnpm --dir backend run test:postgres`, and `pnpm --dir frontend run typecheck`.

## Tasks
- T1 | S1-S3 | inline — high-risk item 3: public API/AI exposure contract | complete | `6c8fbad`; focused PostgreSQL suite GREEN
- T2 | S4-S5 | inline — high-risk item 3: administrative API and RBAC contract | complete | `0ac8e84`; integration route suite GREEN
- T3 | S6 | inline — high-risk item 3: admin UI authorization behavior | complete | `01ba7d0`; focused Vitest GREEN
- T4 | S7 | inline — high-risk item 3: verification and regression proofs | complete | `1b5f165`; focused PostgreSQL and timezone Vitest GREEN

## Log
L1 (2026-11-09): “Necesitamos implementar la separación completa entre los **Eventos Públicos** y la nueva **Agenda Interna** (logística de equipo) en el proyecto Voz Ciudadana (`voz-ciudadana.com.mx`), aplicando una arquitectura híbrida A+ (`visibility` en la tabla principal `events` + extensión 1:1 `event_internal_details` para datos logísticos).”
L2 (2026-11-09): Scope is authorized implementation. Existing public endpoint is `/api/v1/public/eventos/semana`; it serves both public sites. AI tools access EventRepository public-listing methods. Internal agenda has no public RSVP or check-in.
L3 (2026-11-09): Route: inline. All requirements are specified, but public and RBAC contracts are high-risk item 3. Work-unit commits will isolate each high-risk slice.
L4 (2026-11-09): Implemented T1–T4 pending work-unit commits and independent high-risk verification. `pnpm --dir backend run typecheck`, `pnpm --dir frontend run typecheck`, focused backend unit/integration/PostgreSQL tests, focused frontend Vitest, and full backend `pnpm run test` passed (1968 tests). `pnpm --dir backend run test:postgres` has 4 failures in pre-existing `conversation-cycle.postgres.test.ts`; the same baseline commit `5e6a9da` reproduces those failures. The feature-specific PostgreSQL suite passes all 4 checks, including the database trigger rejection.
L5 (2026-11-09): User selected “Cadena desde feature” for the reviewable work-unit chain.
L6 (2026-11-09): Independent high-risk verifier found four candidate regressions: UTC timestamps were reinterpreted as local time on edit, blank notes could not clear persisted text, nested relation writes used `updateMany`, and an internal-only viewer could not reach the shared page. `1b5f165` fixes them. The bounded recheck passed each application blocker with actual local PostgreSQL and `TZ=America/Mexico_City` probes. The verifier reported an environment process breach because pnpm attempted dependency reconciliation in its isolated scratch copy; it made no workspace changes.
L7 (2026-11-09): Risk: item 3 — this feature changes public-event exposure, administrative/RBAC contracts, and authorized UI routing. RDD is clone-locally disabled, so no native review lifecycle was started.
L8 (2026-11-09): Final parent PostgreSQL spot check became unavailable because `localhost:5432` was not accepting connections. Do not claim final local database proof until the service is available again; prior focused proof and the independent recheck remain recorded above.
L9 (2026-11-09): PostgreSQL became available again. Final parent spot check passed: `event-visibility.postgres.test.ts` completed all 5 checks against real local PostgreSQL.
