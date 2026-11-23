-- Baseline migration: create tags and citizen-tag join table.

CREATE TABLE "tags" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "color" VARCHAR(20),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "citizen_tags" (
    "id" UUID NOT NULL,
    "citizen_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,
    "assigned_by_id" UUID,
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "citizen_tags_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tags_name_key" ON "tags"("name");
CREATE INDEX "tags_name_idx" ON "tags"("name");
CREATE INDEX "citizen_tags_citizen_id_idx" ON "citizen_tags"("citizen_id");
CREATE INDEX "citizen_tags_tag_id_idx" ON "citizen_tags"("tag_id");
CREATE UNIQUE INDEX "uq_citizen_tags_citizen_tag" ON "citizen_tags"("citizen_id", "tag_id");

ALTER TABLE "citizen_tags" ADD CONSTRAINT "citizen_tags_citizen_id_fkey" FOREIGN KEY ("citizen_id") REFERENCES "citizens"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "citizen_tags" ADD CONSTRAINT "citizen_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "citizen_tags" ADD CONSTRAINT "citizen_tags_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
