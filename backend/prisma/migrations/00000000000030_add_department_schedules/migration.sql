CREATE TYPE "department_day_of_week" AS ENUM ('MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY');
CREATE TYPE "department_schedule_exception_type" AS ENUM ('PARTIALLY_OPEN','PARTIALLY_CLOSED','FULLY_CLOSED');

CREATE TABLE "department_schedules" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "department_id" UUID NOT NULL,
  "day_of_week" "department_day_of_week" NOT NULL,
  "is_open" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "department_schedules_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "department_schedule_intervals" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "schedule_id" UUID NOT NULL,
  "start_time" VARCHAR(5) NOT NULL,
  "end_time" VARCHAR(5) NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "department_schedule_intervals_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "department_schedule_exceptions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "department_id" UUID NOT NULL,
  "type" "department_schedule_exception_type" NOT NULL,
  "start_date" DATE NOT NULL,
  "end_date" DATE NOT NULL,
  "reason" VARCHAR(500),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "department_schedule_exceptions_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "department_exception_intervals" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "exception_id" UUID NOT NULL,
  "start_time" VARCHAR(5) NOT NULL,
  "end_time" VARCHAR(5) NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "department_exception_intervals_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "uq_department_schedules_department_day" ON "department_schedules"("department_id", "day_of_week");
CREATE INDEX "department_schedules_department_id_idx" ON "department_schedules"("department_id");
CREATE INDEX "department_schedules_day_of_week_idx" ON "department_schedules"("day_of_week");
CREATE UNIQUE INDEX "uq_department_schedule_intervals_range" ON "department_schedule_intervals"("schedule_id", "start_time", "end_time");
CREATE INDEX "department_schedule_intervals_schedule_id_sort_order_idx" ON "department_schedule_intervals"("schedule_id", "sort_order");
CREATE INDEX "department_schedule_exceptions_department_id_idx" ON "department_schedule_exceptions"("department_id");
CREATE INDEX "department_schedule_exceptions_department_id_start_date_end_date_idx" ON "department_schedule_exceptions"("department_id", "start_date", "end_date");
CREATE UNIQUE INDEX "uq_department_exception_intervals_range" ON "department_exception_intervals"("exception_id", "start_time", "end_time");
CREATE INDEX "department_exception_intervals_exception_id_sort_order_idx" ON "department_exception_intervals"("exception_id", "sort_order");
ALTER TABLE "department_schedules" ADD CONSTRAINT "department_schedules_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "department_schedule_intervals" ADD CONSTRAINT "department_schedule_intervals_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "department_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "department_schedule_exceptions" ADD CONSTRAINT "department_schedule_exceptions_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "department_exception_intervals" ADD CONSTRAINT "department_exception_intervals_exception_id_fkey" FOREIGN KEY ("exception_id") REFERENCES "department_schedule_exceptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "department_schedule_exceptions" ADD CONSTRAINT "department_schedule_exceptions_date_order_chk" CHECK ("start_date" <= "end_date");
ALTER TABLE "department_schedule_intervals" ADD CONSTRAINT "department_schedule_intervals_time_order_chk" CHECK ("start_time" < "end_time");
ALTER TABLE "department_exception_intervals" ADD CONSTRAINT "department_exception_intervals_time_order_chk" CHECK ("start_time" < "end_time");
