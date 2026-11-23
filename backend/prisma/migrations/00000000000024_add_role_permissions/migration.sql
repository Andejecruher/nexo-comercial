-- Add permission catalog and role-permission assignments.
-- Apply:   npm run prisma:migrate:prod (or npx prisma migrate deploy --schema=./prisma/schema.prisma)
-- Revert safely, if no newer migrations depend on this schema:
--   DROP TABLE IF EXISTS "role_permissions";
--   DROP TABLE IF EXISTS "permissions";
--   DROP INDEX IF EXISTS "roles_slug_idx";
--   DROP INDEX IF EXISTS "roles_slug_key";
--   ALTER TABLE "roles" DROP COLUMN IF EXISTS "slug", DROP COLUMN IF EXISTS "updated_at";

ALTER TABLE "roles" ADD COLUMN "slug" VARCHAR(80);
ALTER TABLE "roles" ADD COLUMN "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "roles"
SET "slug" = lower(regexp_replace("name", '[^a-zA-Z0-9]+', '_', 'g'))
WHERE "slug" IS NULL;

ALTER TABLE "roles" ALTER COLUMN "slug" SET NOT NULL;
ALTER TABLE "roles" ALTER COLUMN "updated_at" DROP DEFAULT;

CREATE UNIQUE INDEX "roles_slug_key" ON "roles"("slug");
CREATE INDEX "roles_slug_idx" ON "roles"("slug");

CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "module" VARCHAR(80) NOT NULL,
    "description" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "permissions_slug_key" ON "permissions"("slug");
CREATE INDEX "permissions_module_idx" ON "permissions"("module");
CREATE INDEX "permissions_slug_idx" ON "permissions"("slug");

CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id", "permission_id")
);

CREATE INDEX "role_permissions_role_id_idx" ON "role_permissions"("role_id");
CREATE INDEX "role_permissions_permission_id_idx" ON "role_permissions"("permission_id");

ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
