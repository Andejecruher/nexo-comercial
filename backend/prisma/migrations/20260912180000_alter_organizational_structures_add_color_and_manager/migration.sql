-- Additive: HEX color and optional manager fields on organizational_structures.
-- Existing rows receive slate #64748B so color can be NOT NULL without a backfill job.
-- The API still requires color on create; the DB default is a compatibility net only.
--
-- Deploy sequence (forward-only, no SQL rollback):
-- 1. voz-migrator runs `prisma migrate deploy` BEFORE promoting voz-api / voz-frontend
-- 2. Confirm EXECUTION_SUCCEEDED and this folder name in migrate status
-- Local: `prisma migrate deploy` against the development DB.

ALTER TABLE "organizational_structures"
    ADD COLUMN "color" VARCHAR(7) NOT NULL DEFAULT '#64748B',
    ADD COLUMN "nombre_encargado" VARCHAR(120),
    ADD COLUMN "apellidos_encargado" VARCHAR(120),
    ADD COLUMN "telefono_encargado" VARCHAR(30);

ALTER TABLE "organizational_structures"
    ADD CONSTRAINT "organizational_structures_color_hex_chk"
        CHECK ("color" ~ '^#[0-9A-Fa-f]{6}$');
