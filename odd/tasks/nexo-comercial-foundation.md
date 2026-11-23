# Nexo Comercial foundation

Objective: turn the inherited Voz Ciudadana codebase into a bootable Nexo Comercial base. Branch: current working tree. Delivery: ask-on-risk. Test runner: `pnpm --dir backend exec jest` for touched unit tests.

## Specs

S1. Reuse users, permissions, roles, AI channels, departments, tags, calendar, and WhatsApp. Leave out the electoral catalog, promovidos, structure, coordinators, and campaign-related modules, except the calendar.

S2. Rename Voz Ciudadana to nexo-comercial in how containers and volumes are built, and in the documentation.

S3. Remove the GCP deploy from the workflow. Keep the deployment documentation, adapted so a later deploy is straightforward. The user request: "remover del workflow lo que tenemos para el deploy a gcp ya que por ahora este proyecto no se despliega pero debemos conservar la documentacion con sus adaptaciones necesarias".

S4. Assumption: `Citizen` stays as the WhatsApp contact. Renaming that model is out of this foundation. Neighborhoods stay, detached from the electoral section when S1 is implemented.

## Tasks

- T1 — S2 — inline — done. Compose projects `nexo-comercial-dev|qa|prod`, database defaults `nexo` / `nexocomercial`, package `nexo-comercial-api`, entrypoints renamed, brand and operator docs updated. `docker compose -f docker-compose.dev.yml config --quiet` ok.
- T2 — S3 — inline — done. Workflow parked at `docs/deploy/deploy-gcp.yml`. `make gcp-build` exits 2 with the disabled message. `scripts/deploy-gcp-local.sh` and `deploy-infrastructure.sh` exit 1 unless `GCP_DEPLOY_ENABLED=1`.
- T3 — S1 — inline — pending. Remove electoral catalog, promovidos, structure, coordinators, leaders, INE/OCR, and send-campaigns. Keep calendar, templates, inbox bulk actions, tickets, citizens, and neighborhoods.

## Log

L1 (2026-11-23): "Estoy usando como base para un nuevo proyecto llamado nexo-comercial lo que ya hemos creado para voz-ciudadana ya que nos interesa reutilizar todo el tema de usuarios, permisos, roles, canales de ia , departamenteos, tags, calendario, whatsapp y solamente dejar fuera lo de catalogo electoral, promovidos, estructura,cordinadores y lo relacionado a campana a exepcion de calendario por lo cual quisiera ver como avanzamos para dejar una base solida para continuar con el proyexto de nexo comercial e ir integrando los modulos necesarios, asi mismo necesito renombrar todo lo de voz ciudadana a nexo-comercial desde como se construyen los contenedores y los volumenes como la documentacion, tambien remover del workglow lo que tenemos para el deploy a gcp ya que por ahora este proyecto no se despliega pero debemos conservar la documentacion con sus adaptaciones necesarias para que podamos hacer el deply mas adelante de forma sencilla como recomiendas avanzar"

L2 (2026-11-23): Identity and GCP unhook proceed first. Domain removal (T3) waits until the renamed base boots. Historical notes under `odd/tasks/` (other features) and `docs/analysis/` keep their original Voz Ciudadana wording.

L3 (2026-11-23): T1 and T2 observed. `docker compose -f docker-compose.dev.yml config --quiet` succeeded. `make gcp-build` exited 2 with "GCP deploy is disabled". Email template tests: 15 passed. `railway.json` was left in place.
