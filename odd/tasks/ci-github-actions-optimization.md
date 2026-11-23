# CI GitHub Actions optimization

Objective: reduce GitHub Actions usage while preserving production safeguards.
Branch: `ci/optimize-actions-minutes`. Delivery: work-unit commits; no push, merge, deploy, or remote workflow dispatch.
Runner: static YAML validation plus local workflow-contract checks; remote GitHub/GCP proof remains pending.

## Specs

S1. “Optimizar el CI/CD de Voz Ciudadana para reducir significativamente el consumo de minutos gratuitos de GitHub Actions” while conserving “Calidad y cobertura de pruebas”, “Seguridad del proceso de integración”, “Confiabilidad de los despliegues”, “Integridad de las migraciones”, and “Funcionamiento de los servicios en GCP”.

S2. “No existe una rama `develop` operativa y no debe crearse.” The flow is “Rama temporal → Pull Request → main → producción.” Pull requests to `main` retain their essential checks; the weekly cold-build schedule, forward-only migrations, WIF, Secret Manager, SHA image tags, deployment order, production verification, and non-cancellable deployments keep their behavior.

S3. Implement safe Docker validation, intelligent deployable-surface detection, and manual selection of “Todos los componentes”, “Solo backend”, or “Solo frontend”. “No elimines por completo el gate de CI ejecutado en `main` mientras no exista un mecanismo equivalente y confiable”.

S4. “No hagas push, merge ni despliegue.” No remote workflow dispatch, GCP mutation, billing change, secret change, new environment, paid service, or self-hosted runner is authorized.

## Tasks

- T1 — S1,S2: inline — complete — commit `f60cc32`; consolidated Jest/PostgreSQL infrastructure; full test, migration, and PostgreSQL integration evidence observed.
- T2 — S1,S2: inline — complete — commit `f60cc32`; frontend static checks consolidated and Vitest retained; checks observed.
- T3 — S1,S2,S3: inline — complete — commit `f60cc32`; conservative deploy classification, manual surfaces, and the main CI gate verified structurally.
- T4 — S1,S2,S3,S4: inline — complete — commit `f60cc32`; YAML parsing, workflow contract checks, Compose validation, independent verification, diff review, and a local work-unit commit completed.

## Log

L1 (2026-11-03): The user authorized the complete implementation of GitHub Actions optimizations, requested verification against current files, and explicitly prohibited push, merge, remote workflow dispatch, deployments, GCP changes, billing changes, secret changes, and self-hosted runners. The complete request is retained in this conversation; the exact operational constraints and acceptance criteria are quoted in S1–S4.

L2 (2026-11-03): Baseline audit verified `main` as the only integration/production branch, no branch protection, reusable Backend CI and Quality workflows invoked by Deploy GCP, and safe production concurrency (`cancel-in-progress: false`). Existing local backend and `.atl` changes predate this work and are out of scope.

L3 (2026-11-03): Implemented the workflow changes. Backend CI now targets PRs to `main`, combines Jest and the PostgreSQL suite into one job with one Pub/Sub emulator and one pnpm installation, retains all checks, and skips Compose validation only for the deployment profile. Quality combines static frontend checks while preserving an independent Vitest job and Docker smoke. Deploy GCP keeps its non-cancellable release sequence and CI gate, exposes manual `all`/`backend`/`frontend` selection, classifies test-only backend changes as no-op releases, and includes `.dockerignore` in its trigger.

L4 (2026-11-03): Observed: frontend `check` and Vitest passed (694 tests); backend lint, production/test typechecks, and Jest passed (188 suites, 1,954 tests); a local PostgreSQL + one Pub/Sub emulator run passed after `migrate:deploy` (10 suites, 55 tests); all three Compose configs, Ruby YAML parsing, workflow-contract checks, and `git diff --check` passed. `actionlint` is unavailable locally. Independent verifier found no candidate-caused regression; it noted the baseline's intentional ordering where ordinary Jest does not use PostgreSQL and the PostgreSQL suite runs after migrations.

Risk: item 5 (delivery/environment) — GitHub Actions controls production deployment. Independent structural verification and local test suites passed; GitHub-hosted execution and GCP verification remain pending.
