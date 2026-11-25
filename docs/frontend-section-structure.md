# Frontend sections and ownership

The legacy candidate landing and `/jovenes` have been removed. `/` redirects to
`/admin`; the existing proxy selects `/admin/indicadores/atencion`, and the existing
authentication guard waits for session restoration before either rendering the
platform or redirecting to `/login?redirectTo=...`.

## Active routes

Route groups select layouts; they do not introduce URL segments or layer section
names. `fonts/` contains the application's local font, not a route.

```text
app/
├── page.tsx                          / → /admin
├── (auth)/
│   ├── activate-account/
│   ├── forgot-password/
│   ├── login/
│   └── reset-password/
├── (public)/
│   ├── politica-y-privacidad/
│   └── terminos-y-condiciones/
├── boletin/
│   ├── baja/
│   └── confirmar/
└── (admin)/
    ├── perfil/
    └── admin/
        ├── accesos/                  → /admin/accesos/roles
        │   ├── permissions/
        │   └── roles/
        │       └── [id]/permissions/
        ├── ai/                       → /admin/ai/agents
        │   ├── agents/
        │   │   └── [id]/
        │   ├── lines/                → /admin/ai/phone-lines
        │   ├── phone-lines/
        │   ├── prompts/
        │   ├── relationships/
        │   ├── tools/
        │   └── topics/
        ├── barrios/
        ├── campanas/
        │   ├── [id]/
        │   └── nueva/
        ├── ciudadanos/
        │   └── [id]/
        ├── configuracion/
        ├── conversaciones/
        │   └── list/
        ├── departamentos/
        ├── equipo/
        ├── etiquetas/
        ├── eventos/
        │   └── [id]/
        ├── indicadores/
        │   └── atencion/
        ├── mensajes-masivos/
        ├── notificaciones/
        ├── plantillas/
        └── tickets/
            └── [id]/
```

Existing compatibility redirects remain active. There is no `/jovenes` redirect:
the removed URL receives the normal not-found response.

## Symmetric layer groups

Each section key below is a literal directory in `app/`. Nested views and actions
such as `campanas/nueva` belong to their enclosing business section. A missing
section in a layer means that layer has no exclusive files for it, not that an
empty directory should be created.

```text
frontend/
├── components/
│   ├── ui/                           business-agnostic visual primitives only
│   ├── shared/                       layouts, providers, guards, brand, shared widgets
│   ├── accesos/
│   ├── activate-account/
│   ├── ai/
│   ├── barrios/
│   ├── boletin/
│   ├── campanas/
│   ├── ciudadanos/
│   ├── configuracion/
│   ├── conversaciones/
│   ├── departamentos/
│   ├── equipo/
│   ├── etiquetas/
│   ├── eventos/
│   ├── forgot-password/
│   ├── indicadores/
│   ├── login/
│   ├── mensajes-masivos/
│   ├── notificaciones/
│   ├── plantillas/
│   ├── politica-y-privacidad/
│   ├── reset-password/
│   ├── terminos-y-condiciones/
│   └── tickets/
├── hooks/
│   ├── shared/
│   ├── ai/
│   ├── ciudadanos/
│   ├── conversaciones/
│   ├── equipo/
│   ├── eventos/
│   ├── indicadores/
│   ├── plantillas/
│   └── tickets/
├── lib/
│   ├── shared/
│   ├── activate-account/
│   ├── ai/
│   ├── ciudadanos/
│   ├── eventos/
│   ├── perfil/
│   └── plantillas/
├── store/
│   └── shared/                       all current stores have multiple/global consumers
└── tests/
    ├── shared/                       shared subjects, UI, root entry, setup and test helpers
    ├── accesos/
    ├── activate-account/
    ├── ai/
    ├── campanas/
    ├── ciudadanos/
    ├── configuracion/
    ├── conversaciones/
    ├── equipo/
    ├── eventos/
    ├── indicadores/
    ├── mensajes-masivos/
    ├── perfil/
    ├── plantillas/
    └── tickets/
```

Tests use optional `components/`, `hooks/`, `lib/`, `store/`, or `app/` subgroups
inside their section to avoid filename collisions. The application store layer
itself is singular `store/`; old `stores/` and `test/` roots no longer exist.

### Dependency rules

- A section imports only its own section, `shared/`, and visual primitives in
  `components/ui/`, including across layers.
- Resources consumed by two or more sections or by any global/group layout belong
  to `shared/`. This includes transitive dependencies: a shared widget must not
  import a section-private helper.
- Shared layout content for both legal pages is under `components/shared/public/`;
  the two exclusive legal documents have their literal route section names.
- Authentication context and guards remain single shared modules. Individual
  authentication forms belong to `login/`, `forgot-password/`, `reset-password/`,
  and `activate-account/`.
- shadcn generation aliases target `components/shared`, `hooks/shared`, and
  `lib/shared`; visual primitive generation still targets `components/ui`.
- Brand generation reads `components/shared/brand/`. Existing font, brand,
  newsletter and legal assets needed outside the removed landing are retained.

## Removed files

All paths below are relative to `frontend/`. `app/page.tsx` was replaced, not
deleted.

```text
app/jovenes/page.tsx
components/jovenes/jovenes-compromiso.tsx
components/jovenes/jovenes-content.ts
components/jovenes/jovenes-escucha.tsx
components/jovenes/jovenes-hero.tsx
components/jovenes/jovenes-jornadas.tsx
components/jovenes/jovenes-page-view.tsx
components/public/eventos-section.tsx
components/public/galeria-section.tsx
components/public/hero-section.tsx
components/public/propuestas-section.tsx
components/public/register-form.tsx
components/public/stats-section.tsx
components/public/sumate-section.tsx
components/public/sumate-section-view.tsx
components/public/team-section.tsx
components/public/vision-section.tsx
components/public/whatsapp-fab.tsx
hooks/useRegistroCiudadano.ts
lib/public-eventos-api.ts
lib/public-registro-api.ts
lib/registro-errors.ts
public/images/candidata-hero.jpg
public/images/candidata-vision.jpg
public/images/galeria-1.jpg
public/images/galeria-2.jpg
public/images/galeria-3.jpg
public/images/galeria-4.jpg
public/images/galeria-5.jpg
public/images/team-1.jpg
public/images/team-2.jpg
public/images/team-3.jpg
public/images/team-4.jpg
public/images/team-candidata.jpg
```

The surviving public header/footer were moved to `components/shared/public/`.
Their dead landing anchors, candidate social link and campaign-only customization
were removed; legal links and newsletter subscription remain.

## Verification

From `frontend/`:

```sh
npm run test:structure
npm exec -- next typegen
npm run typecheck -- --incremental false
npm test
npm run lint
npm run format:check
```

`npm test` and `npm run test:run` run structural checks before Vitest.
`test:structure` uses only Node.js and checks legacy removal, root entry,
section naming, test relocation, import resolution and section boundaries.
Vitest covers root/proxy routing and the unchanged guard states, in addition to
the existing application tests. Run `git diff --check` from the repository root.

Validation results are recorded in
[`odd/tasks/frontend-section-symmetry.md`](../odd/tasks/frontend-section-symmetry.md).

### Observed results

- Structural checks: **4/4 passed**.
- Vitest: **103 files, 641 tests passed**, including real auth-provider/guard
  integration.
- TypeScript: **0 errors** after fresh Next route-type generation, independently
  verified in clean source copies.
- ESLint, Prettier and staged/unstaged `git diff --check`: **passed**.
- Independent requirement verification: **S1-S6 met, no blockers**.

The live workspace's root-owned `.next/dev/types` still references the removed
`/jovenes` route. Its active dev server/cache was not restarted, deleted or
re-owned: live typecheck failed on that stale artifact, and live `next typegen`
failed with EACCES. Clean-copy checks included fresh generated route types rather
than suppressing or excluding errors. No live-server HTTP check was performed.
The verifier's auxiliary aggregate audit script did not complete; its failed
attempts and the successful targeted checks are disclosed in the task log.
