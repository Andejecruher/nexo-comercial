# Remove campaign modules
Objective: Remove six campaign modules from frontend, backend, RBAC, and PostgreSQL while preserving retained workflows.
Branch: `chore/remove-campaign-modules`. Delivery: `exception-ok` (deletion-heavy local cleanup, no push or PR). Test runners: Vitest, Jest, Prisma/PostgreSQL, TypeScript, ESLint, Next.js build.

## Specs
- S1: Remove completely: “Indicadores de precampaña”, “Catálogo Electoral”, “Estructuras”, “Coordinadores”, “Líderes”, and “Promovidos y simpatizantes”.
- S2: “Busca en todo el repositorio (nombres de archivos, carpetas, rutas, imports, textos en UI y variables) todas las referencias relacionadas con estos 6 módulos (considera variaciones como singular/plural, con/sin acentos y en inglés/español).”
- S3: Preserve retained modules and verify their dependencies: “Usuarios, Roles, Permisos, Dashboards generales o Reportes”. Preserve WhatsApp, citizens, events, neighborhoods, and the attention dashboard discovered during mapping.
- S4: Frontend: remove sidebar/navigation items, view permissions, routes, pages, exclusive components, hooks, stores, and API services for the six modules. `/admin` must land on `/admin/indicadores/atencion`.
- S5: Backend: unmount and remove exclusive routes, controllers, services, use cases, validators/DTOs, middleware, OCR jobs, scripts, and API tests for the six modules.
- S6: Database and RBAC: remove exclusive Prisma models and relations, remove seed entries and persisted permissions, preserve historical migrations, and add one forward migration. Keep the `COORDINADOR`, `LIDER`, and `CAPTURISTA` roles, but remove permissions for deleted modules. `COORDINADOR` keeps WhatsApp/events without citizen-export scope.
- S7: Preserve remote historical objects in Google Drive/GCS. Remove their PostgreSQL references but do not issue remote deletion operations.
- S8: Preserve shared Google providers used by WhatsApp/media/exports, shared phone helpers, the neighborhood selector used by citizens/events, citizen records, users, conversations, and retained export behavior for admin scope.
- S9: “Asegúrate de que no queden `imports` rotos, variables sin usar ni referencias huérfanas.” Run frontend/backend tests, typecheck, lint, build, Prisma validation/generation, migration verification on disposable PostgreSQL, and startup/smoke checks where the environment permits.
- S10: Final report: “un resumen breve de los archivos eliminados, los archivos modificados y cualquier tabla de base de datos que requiera una migración manual.”
- S11: Preserve the pre-existing local modification in `backend/.env.example`; do not include it in this feature’s commits.

## Tasks
- T1 [S3, S4, S8] route=delegated (parallel frontend unit) status=complete commit=ebf06c4 — Extract shared frontend helpers and selector, then remove frontend module surfaces.
- T2 [S3, S5, S8] route=delegated (parallel backend unit) status=complete commit=b5c927c — Detach retained backend readers and remove exclusive API/OCR/worker code.
- T3 [S6, S7] route=inline status=complete commit=0521cab — Clean RBAC/docs and create the forward Prisma migration.
- T4 [S2, S9, S10, S11] route=inline status=complete commit=a293e56 — Search for residual references, run verification, and produce the final inventory.

## Log
- L1 (2026-11-23): “Necesito realizar una limpieza profunda en el proyecto para eliminar por completo los siguientes 6 módulos, tanto en el **Frontend** como en el **Backend**:

  1. **Indicadores de precampaña**
  2. **Catálogo Electoral**
  3. **Estructuras**
  4. **Coordinadores**
  5. **Líderes**
  6. **Promovidos y simpatizantes**”
- L2 (2026-11-23): User selected: keep `COORDINADOR` for WhatsApp/events without citizen exports.
- L3 (2026-11-23): User selected: preserve historical remote files in Google Drive/GCS.
- L4 (2026-11-23): Mapping found frontend shared dependencies in phone helpers and `BarrioSelectCombobox`; backend shared dependencies in scope, citizens, neighborhoods, exports, workers, Google providers, and Prisma relations.
- L5 (2026-11-23): Forecast exceeds 400 authored lines because the requested outcome removes six complete vertical slices and a coupled database graph. Work remains split by coherent behavior; deletion volume will not be code-golfed.
- L6 (2026-11-23): Frontend focused checks passed in the delegated unit; parent spot check confirmed backend TypeScript and the shared phone helper. A parent Vitest rerun hit a Tinypool process-stack failure after the phone tests passed and will be retried with a single-thread pool during T4.
- L7 (2026-11-23): Prisma schema validation and generation succeeded. Migration `20261123000000_remove_campaign_modules` applied successfully after all 77 historical migrations on disposable PostgreSQL 16. Post-migration probes found zero retired tables, no `neighborhoods.section_id`, `export_module=citizens`, and the retained neighborhood unique index.
- L8 (2026-11-23): Independent verification found six residual contract groups. Commit `9cb664a` removed section query/UI contracts, tightened neighborhood schemas, fixed the retained seed and export scope, removed active OCR deployment references, and regenerated the frontend TypeScript build metadata. The focused recheck passed all six groups.
- L9 (2026-11-23): Full frontend verification passed 99 test files and 630 tests. Two unrelated baseline failures remain in `useResponsivePagination.realtime.test.ts` and `brand-logo.test.tsx`. Full frontend lint reports eight pre-existing Prettier errors in five unchanged files; ESLint passed for every frontend file changed by this feature. Frontend typecheck and the Next.js production build passed.
- L10 (2026-11-23): Full backend verification passed 174 suites and 1710 tests; one suite and one test fail because the baseline datasource fixture defines `CLOUDSQL_DB_USER=voz` but expects `nexo`, and two tests are skipped. Commit `a293e56` fixed the two feature-related failures; their focused 13-test run, backend ESLint, typecheck, and build passed.
- L11 (2026-11-23): Startup smoke checks passed. The backend applied all migrations to disposable PostgreSQL, connected, served on port 3199, and shut down cleanly. The frontend started on port 3198 and `/admin` returned `307` to `/admin/indicadores/atencion`.
- L12 (2026-11-23): Final inventory at implementation commit `a293e56`: 227 files changed from baseline, with 125 deleted, 95 modified, 6 added, and 1 renamed before this tracking document. `backend/.env.example` and the later user-owned change in `frontend/components/admin/citizen-profile.tsx` remain unstaged and are excluded from feature commits.
