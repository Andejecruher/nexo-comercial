# Frontend section symmetry

Objective: remove legacy campaign pages and align frontend layers with active routes. Branch: `chore/remove-campaign-modules`.
Delivery: `ask-on-risk`, local work-unit commits only; forecast ~1,000 import/structure changes plus legacy deletions. Runner: frontend npm scripts (Vitest, TypeScript, ESLint, Prettier).

## Specs

- **S1:** "Eliminar por completo la vista pública heredada en `/` y la sección `/jovenes`, junto con todos sus componentes, hooks, utilidades, estados, assets y pruebas huérfanas."
- **S2:** "Configurar `frontend/app/page.tsx` con una redirección limpia hacia la sección principal activa de `nexo-comercial` (ej. `/dashboard` o `/login` según el flujo de autenticación existente)."
- **S3:** "Auditar todas las carpetas de rutas en `frontend/app` (incluyendo route groups como `(auth)` o `(platform)` si existen) para confirmar que cada carpeta represente de forma limpia, uniforme y semántica una sección activa de la plataforma (ej. `dashboard/`, `productos/`, `ventas/`, `clientes/`, `login/`, etc.)." "Eliminar carpetas de rutas vacías, obsoletas o duplicadas, y actualizar cualquier enlace en navegación, menús o middlewares que apunte a rutas eliminadas."
- **S4:** "Carpeta `ui/` (solo en `components/ui/`): Primitivos visuales atómicos y agnósticos del negocio (botones, inputs, modales, tablas base, badges)." "Carpeta `shared/` (en todas las capas: `components/shared/`, `hooks/shared/`, `lib/shared/`, `store/shared/`, `tests/shared/`):" "Todo recurso utilizado por **2 o más secciones** de `app/`, o consumido desde layouts globales (`RootLayout` o layouts de grupo)." "El nombre `<seccion>` debe coincidir **1 a 1** con el nombre de la carpeta de ruta correspondiente en `app/`" "Solo se crean subcarpetas de `<seccion>` en aquellas capas que realmente tengan archivos para esa sección (no crear carpetas vacías)."
- **S5:** "**Cero imports cruzados entre secciones:** Un archivo dentro de `<capa>/<seccion-A>/` **nunca** puede importar desde `<capa>/<seccion-B>/`. Si ambos necesitan el mismo recurso, ese recurso debe promoverse a `<capa>/shared/`." "Actualizar todas las rutas de importación (`@/...` y relativas) en todo el proyecto tras mover los archivos." "Limpiar archivos barrel (`index.ts`) obsoletos o actualizarlos para reflejar las nuevas rutas."
- **S6:** "Ejecutar `npm run typecheck` (o el script de verificación de tipos configurado en `frontend`) y confirmar 0 errores." "Ejecutar las pruebas unitarias/integración y el formateador/linter del frontend (`prettier` / `eslint` si aplican) y verificar `git diff --check`." "Entregar un reporte final que incluya:" "1. Lista de rutas y archivos eliminados (`/` y `/jovenes`)." "2. Mapa definitivo de secciones en `app/`." "3. Árbol actualizado de `components/`, `hooks/`, `lib/`, `store/` y `tests/` demostrando la simetría entre capas."

## Tasks

- T1 | S1-S3 | inline (one cohesive removal; no writer trigger) | completed | independent S1-S3 met; root/guard parity verified; commit `281ab08b0eb1c275dcabf9b81bfaf534a42b5cff`.
- T2 | S4-S5 | inline (one mechanical import graph migration; no independent disjoint writers) | completed | structural RED 4/4 → GREEN 4/4; 340 relocations; independent S4-S5 met; commit `281ab08b0eb1c275dcabf9b81bfaf534a42b5cff`.
- T3 | S6 | inline implementation; command worker + independent verifier for item 2 (auth/guard module relocation) | completed | independent S6 met; clean-copy typecheck 0; 103 files / 641 tests + 4 structural tests; lint/format/diff clean; commit `281ab08b0eb1c275dcabf9b81bfaf534a42b5cff`.

## Log

### L1 — Original request

### Contexto

En el frontend del proyecto **nexo-comercial** (`./frontend`), aún existen vistas heredadas del dominio anterior (una landing pública de promoción de una candidata en la ruta raíz `/` y una sección especial en `/jovenes`). Además, necesitamos estandarizar la estructura interna para que exista una **correspondencia exacta y consistente** entre las carpetas de secciones en `app/` y las carpetas de agrupación en `components/`, `hooks/`, `lib/` (o `libs/`), `store/` y `tests/`.

### Objetivo

1. Eliminar por completo la vista pública heredada en `/` y la sección `/jovenes`, junto con todos sus componentes, hooks, utilidades, estados, assets y pruebas huérfanas.
2. Auditar y normalizar las carpetas dentro de `frontend/app` para que representen de forma clara y consistente las rutas y secciones reales de la plataforma `nexo-comercial`.
3. Reorganizar `components/`, `hooks/`, `lib/` (o `libs/`), `store/` y `tests/` aplicando exactamente los mismos nombres de sección definidos en `app/`, separando lo **exclusivo de una sección** de lo **global/compartido**.

### Instrucciones de Ejecución

#### Fase 1: Eliminación de vistas heredadas (`/` y `/jovenes`)

- Eliminar la ruta `/jovenes` (`frontend/app/jovenes` o dentro de route groups) y la landing pública de la candidata en `frontend/app/page.tsx` (o route group público).
- Configurar `frontend/app/page.tsx` con una redirección limpia hacia la sección principal activa de `nexo-comercial` (ej. `/dashboard` o `/login` según el flujo de autenticación existente).
- Rastrear y eliminar todo código muerto resultante (componentes, hooks, helpers, stores, constantes, imágenes en `public/` y archivos de prueba) que solo daba soporte a `/` o `/jovenes`.

#### Fase 2: Auditoría y consistencia de rutas en `frontend/app`

- Auditar todas las carpetas de rutas en `frontend/app` (incluyendo route groups como `(auth)` o `(platform)` si existen) para confirmar que cada carpeta represente de forma limpia, uniforme y semántica una sección activa de la plataforma (ej. `dashboard/`, `productos/`, `ventas/`, `clientes/`, `login/`, etc.).
- Eliminar carpetas de rutas vacías, obsoletas o duplicadas, y actualizar cualquier enlace en navegación, menús o middlewares que apunte a rutas eliminadas.

#### Fase 3: Agrupación simétrica en `components`, `hooks`, `lib`, `store` y `tests`

Reorganizar cada una de las capas (`components/`, `hooks/`, `lib/`, `store/`, `tests/`) utilizando **exactamente el mismo esquema de subcarpetas**:

1. **Carpeta `ui/` (solo en `components/ui/`):** Primitivos visuales atómicos y agnósticos del negocio (botones, inputs, modales, tablas base, badges).
2. **Carpeta `shared/` (en todas las capas: `components/shared/`, `hooks/shared/`, `lib/shared/`, `store/shared/`, `tests/shared/`):**
   - Todo recurso utilizado por **2 o más secciones** de `app/`, o consumido desde layouts globales (`RootLayout` o layouts de grupo).
3. **Carpetas `<seccion>/` (en todas las capas: `components/<seccion>/`, `hooks/<seccion>/`, `lib/<seccion>/`, `store/<seccion>/`, `tests/<seccion>/`):**
   - El nombre `<seccion>` debe coincidir **1 a 1** con el nombre de la carpeta de ruta correspondiente en `app/` (por ejemplo: si existe `app/(platform)/productos/`, sus archivos exclusivos deben vivir en `components/productos/`, `hooks/productos/`, `lib/productos/`, `store/productos/` y `tests/productos/`).
   - Solo se crean subcarpetas de `<seccion>` en aquellas capas que realmente tengan archivos para esa sección (no crear carpetas vacías).

#### Reglas de Integridad y Dependencias

- **Cero imports cruzados entre secciones:** Un archivo dentro de `<capa>/<seccion-A>/` **nunca** puede importar desde `<capa>/<seccion-B>/`. Si ambos necesitan el mismo recurso, ese recurso debe promoverse a `<capa>/shared/`.
- Actualizar todas las rutas de importación (`@/...` y relativas) en todo el proyecto tras mover los archivos.
- Limpiar archivos barrel (`index.ts`) obsoletos o actualizarlos para reflejar las nuevas rutas.

#### Fase 4: Validación y Entrega

- Ejecutar `npm run typecheck` (o el script de verificación de tipos configurado en `frontend`) y confirmar 0 errores.
- Ejecutar las pruebas unitarias/integración y el formateador/linter del frontend (`prettier` / `eslint` si aplican) y verificar `git diff --check`.
- Entregar un reporte final que incluya:
  1. Lista de rutas y archivos eliminados (`/` y `/jovenes`).
  2. Mapa definitivo de secciones en `app/`.
  3. Árbol actualizado de `components/`, `hooks/`, `lib/`, `store/` y `tests/` demostrando la simetría entre capas.

### L2 — Baseline and route decisions

- Baseline `9cfcae041ce18d87d1b1dc4927baeac42bee8a42`; preserve existing `.atl/skill-registry.md`, `.atl/.skill-registry.cache.json`, `frontend/tsconfig.tsbuildinfo`.
- Initial four checks fail with exit 127: tsc, vitest, eslint, prettier not installed. Offline frozen install fails on backend `jest-runner@29.7.0`; frontend-filtered offline install fails on `vite@5.4.21`. No manifest/lockfile changes.
- Root will use server `redirect('/admin')`, reusing the existing proxy redirect to `/admin/indicadores/atencion` and the unchanged client authentication guard. No server inspection of localStorage and no duplicated auth decision.
- Section keys are literal route directories: admin's immediate business sections, `perfil`, individual auth routes, `boletin`, and individual legal routes. Route groups are layout organization, not invented layer sections `auth` or `public`. Global/group-layout resources are shared.
- Keep active compatibility redirects `/admin/ai/lines`, `/admin/ai`, `/admin/accesos`; do not remove consumed URLs solely because they redirect.
- Promote transitive multi-section consumers to shared; place single-section resources with that section. All tests move into `tests/<section>` or `tests/shared`; all stores move into singular `store/`.
- Risk: item 2 (relocation of auth provider/guards and their dependencies requires proving module identity and existing access checks remain intact).

### L3 — Recovery, implementation and checks

- User selected "Autorizar descarga" to authorize frontend-only pnpm dependency downloads from `https://registry.npmjs.org`, without credentials, lockfile changes or installation scripts. The scoped frozen install succeeded.
- User: "The server restarted while you were working. Continue from where you left off without repeating completed work." Reconciled disk and memory; did not rerun the migration.
- Removed 22 legacy source files and 12 candidate/gallery/team images; replaced the root page, retained active legal/newsletter/brand/font resources, and removed dead navigation anchors and candidate social customization.
- Relocated 340 source/test/assets files by transitive route ownership; moved tests to `tests/<section>` or `tests/shared`, stores to `store/shared`, and generator/shadcn/setup/documentation consumers to current paths. Preserved shared provider/barrel dependencies instead of introducing reverse dependencies.
- Structural tests observed RED for all four requested rules before implementation, then GREEN (4/4). Focused root/proxy/auth/provider tests passed 28/28. Initial full suite passed 637/638; its sole brand-tagline assertion also failed on baseline `9cfcae0` (13/14), then was corrected to the current platform tagline.
- Live typecheck found stale `.next/dev/types/validator.ts` referencing removed `/jovenes`; `next typegen` cannot write the root-owned cache (EACCES), and an active Next dev process uses it. Did not mutate, remove or change ownership of that live cache.
- A clean source copy with freshly generated Next route types passed `npm exec -- next typegen` and `npm run typecheck -- --incremental false`, exit 0. The live-cache limitation remains disclosed; no TypeScript source errors were hidden or excluded.
- Initial lint, format check and `git diff --check` passed. Final full-suite/lint/format recheck pending after ownership refinements.
- Concurrent Google Drive dependency/backend/lockfile edits are unrelated and preserved alongside pre-existing `.atl/*` and `frontend/tsconfig.tsbuildinfo`; they will not be staged in this feature.
- One cohesive source work unit exceeds the advisory 400-line size because it removes complete legacy views and rewrites one frontend-wide import graph. Artificial layer-by-layer commits would leave broken imports. Delivery remains `ask-on-risk`; no push or PR is authorized.
- Canonical inventory/report: `docs/frontend-section-structure.md`.

### L4 — Explicit commit authorization

User: "Una ves termines genera los commits necesarios para los cambios"

Create local Conventional Commits for this frontend feature after verification;
exclude unrelated backend/lockfile/registry/cache changes. No push or PR requested.

### L5 — Independent verification and final candidate

- Corrected full suite passed 102 files / 638 Vitest tests plus 4 structural tests; lint, format and diff checks passed.
- Independent verifier returned S1-S6 met with no blockers. Its baseline/candidate access parity probes passed 18/18 each; candidate route/root probes 4/4; baseline compatibility routes 3/3; real provider/guard/permission integration 3/3. Independent clean-copy typegen/typecheck and structural checks also passed.
- Independent inventory inspection matched 49 route directories and 62 documented layer-tree entries. Its auxiliary aggregate AST audit script failed twice (directory parser, then CSS alias lookup); no aggregate audit PASS is claimed. Targeted inspection, structural import checks and TypeScript verified the relevant invariants; no live-server HTTP probe was run.
- Added the verifier's 3 real-provider integration probes to `frontend/tests/shared/components/auth-guard-integration.test.tsx`; parent focused run passed 3/3 and clean-copy typecheck passed again.
- Final full suite/lint/format run is pending for the candidate including those probes. Staged scope is frontend plus the canonical report and exact moved-path documentation corrections only.
- Concurrent backend work was committed separately as `4c3c7c5` and `208b90c`. Neither belongs to this frontend work unit; its actual parent commit will be the native review base.

### L6 — Final functional proof

- Final candidate: 103 Vitest files / 641 tests passed plus 4/4 structural tests.
- Lint, frontend format check, staged and unstaged whitespace checks all passed.
- Parent reran the added integration probe (3/3) and clean-copy typecheck (exit 0).
- Implementation work-unit commit and native committed-range assessment are next; the source candidate excludes all unrelated work. User explicitly authorized local commits; no publishing is authorized.

### L7 — Source commit and review disposition

- Source work unit: `281ab08b0eb1c275dcabf9b81bfaf534a42b5cff`, `refactor(frontend): align sections and remove legacy landing`; parent/base `208b90c5820c417ed7505c0709a6ffd69385b0b3`. Commit contained 545 frontend/documentation paths only, with no hook-produced frontend source changes.
- Native assessment: high, item 2 escalation (authentication/guard relocation); `review_due: true`, `review_due_reason: high_risk`. Initial untracked-tracker declaration/preflight issues were resolved by staging this task document; no review authority had been started.
- User selected "Omitir esta vez". Executed the provider's exact candidate-bound decline once; verified `action: declined`, `consent: declined_this_candidate` and matching target `sha256:3d8fe6cc01bfbed85bebef64ed25ba9fd4fee06cab1aafff7aa4f525724e345d`.
- No native reviewer transaction or receipt was created. RDD remains enabled for future candidates; the independent functional/security verification above stands. Local commits follow ordinary repository policy.
- All S1-S6 are complete with the disclosed live generated-cache limitation and auxiliary audit failures. No live-server HTTP check or publishing was performed.
- This documentation-only closure records the source commit and completed evidence; its final commit identity is reported in the delivery response. Pre-existing registry/cache modifications remain outside both feature commits.
- Risk: item 2 (auth provider/guard module relocation; independently verified; additional candidate review declined by the user).
