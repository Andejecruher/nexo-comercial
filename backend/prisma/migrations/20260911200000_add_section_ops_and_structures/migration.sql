-- Additive migration: operational metrics on electoral sections and
-- coordinator membership in an organizational structure catalog.
-- All new columns are nullable so existing rows stay valid without backfill.
--
-- Deploy sequence (forward-only, no SQL rollback, no seed/backfill):
-- 1. Merge to the branch that runs .github/workflows/deploy-gcp.yml
-- 2. Cloud Run job voz-migrator runs `prisma migrate deploy` BEFORE promoting
--    voz-api / voz-frontend (see docs/DEPLOYMENT_GCP.md)
-- 3. Confirm EXECUTION_SUCCEEDED and this folder name in migrate status
-- 4. Then serve traffic that uses /api/v1/structures and section metrics
-- Local: apply the same `prisma migrate deploy` against the development DB.
-- Do not run `prisma migrate reset` on shared environments.

CREATE TABLE "organizational_structures" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" VARCHAR(80) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "organizational_structures_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organizational_structures_slug_key" ON "organizational_structures"("slug");
CREATE INDEX "organizational_structures_is_active_name_idx" ON "organizational_structures"("is_active", "name");

ALTER TABLE "sections"
    ADD COLUMN "numero_casillas" INTEGER,
    ADD COLUMN "votos_por_casilla" INTEGER,
    ADD COLUMN "lista_nominal" INTEGER,
    ADD COLUMN "votos_necesarios" INTEGER;

ALTER TABLE "sections"
    ADD CONSTRAINT "sections_numero_casillas_nonneg_chk"
        CHECK ("numero_casillas" IS NULL OR "numero_casillas" >= 0),
    ADD CONSTRAINT "sections_votos_por_casilla_nonneg_chk"
        CHECK ("votos_por_casilla" IS NULL OR "votos_por_casilla" >= 0),
    ADD CONSTRAINT "sections_lista_nominal_nonneg_chk"
        CHECK ("lista_nominal" IS NULL OR "lista_nominal" >= 0),
    ADD CONSTRAINT "sections_votos_necesarios_nonneg_chk"
        CHECK ("votos_necesarios" IS NULL OR "votos_necesarios" >= 0);

ALTER TABLE "coordinators"
    ADD COLUMN "structure_id" UUID;

CREATE INDEX "coordinators_structure_id_is_active_idx" ON "coordinators"("structure_id", "is_active");

ALTER TABLE "coordinators"
    ADD CONSTRAINT "coordinators_structure_id_fkey"
        FOREIGN KEY ("structure_id") REFERENCES "organizational_structures"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
