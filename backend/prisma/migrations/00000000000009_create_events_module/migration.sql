-- Baseline migration: create events, registrations, and check-ins tables.

CREATE TABLE "events" (
    "id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "event_type" "event_type" NOT NULL DEFAULT 'townhall',
    "status" "event_status" NOT NULL DEFAULT 'draft',
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6),
    "location_name" VARCHAR(255),
    "address" VARCHAR(500),
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "capacity" INTEGER,
    "organizer_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "event_registrations" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "citizen_id" UUID NOT NULL,
    "registration_status" "registration_status" NOT NULL DEFAULT 'registered',
    "attendance_status" "attendance_status" NOT NULL DEFAULT 'pending',
    "checked_in_at" TIMESTAMPTZ(6),
    "source_channel" "source_channel" NOT NULL DEFAULT 'web',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "event_registrations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "event_checkins" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "registration_id" UUID NOT NULL,
    "checked_in_by" UUID,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_checkins_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "events_slug_key" ON "events"("slug");
CREATE INDEX "events_status_idx" ON "events"("status");
CREATE INDEX "events_starts_at_idx" ON "events"("starts_at");
CREATE INDEX "events_organizer_user_id_idx" ON "events"("organizer_user_id");
CREATE INDEX "event_registrations_event_id_idx" ON "event_registrations"("event_id");
CREATE INDEX "event_registrations_citizen_id_idx" ON "event_registrations"("citizen_id");
CREATE INDEX "event_registrations_registration_status_idx" ON "event_registrations"("registration_status");
CREATE UNIQUE INDEX "uq_event_registrations_event_citizen" ON "event_registrations"("event_id", "citizen_id");
CREATE INDEX "event_checkins_event_id_idx" ON "event_checkins"("event_id");
CREATE INDEX "event_checkins_registration_id_idx" ON "event_checkins"("registration_id");

ALTER TABLE "events" ADD CONSTRAINT "events_organizer_user_id_fkey" FOREIGN KEY ("organizer_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_citizen_id_fkey" FOREIGN KEY ("citizen_id") REFERENCES "citizens"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_checkins" ADD CONSTRAINT "event_checkins_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_checkins" ADD CONSTRAINT "event_checkins_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "event_registrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_checkins" ADD CONSTRAINT "event_checkins_checked_in_by_fkey" FOREIGN KEY ("checked_in_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
