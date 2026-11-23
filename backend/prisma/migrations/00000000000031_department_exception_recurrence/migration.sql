CREATE TYPE "department_exception_recurrence_type" AS ENUM ('NONE', 'YEARLY', 'WEEKLY', 'SPECIFIC_WEEKDAYS');

ALTER TABLE "department_schedule_exceptions"
  ADD COLUMN "recurrence_type" "department_exception_recurrence_type" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "recurrence_starts_on" DATE,
  ADD COLUMN "recurrence_ends_on" DATE,
  ADD COLUMN "yearly_start_month" INTEGER,
  ADD COLUMN "yearly_start_day" INTEGER,
  ADD COLUMN "yearly_end_month" INTEGER,
  ADD COLUMN "yearly_end_day" INTEGER,
  ADD COLUMN "weekly_anchor_date" DATE,
  ADD COLUMN "weekdays" "department_day_of_week"[] NOT NULL DEFAULT ARRAY[]::"department_day_of_week"[],
  ALTER COLUMN "start_date" DROP NOT NULL,
  ALTER COLUMN "end_date" DROP NOT NULL;

CREATE INDEX "department_schedule_exceptions_department_id_recurrence_type_idx" ON "department_schedule_exceptions"("department_id", "recurrence_type");
CREATE INDEX "department_schedule_exceptions_department_id_recurrence_starts_on_recurrence_ends_on_idx" ON "department_schedule_exceptions"("department_id", "recurrence_starts_on", "recurrence_ends_on");
CREATE INDEX "department_schedule_exceptions_department_id_yearly_start_month_yearly_start_day_yearly_end_month_yearly_end_day_idx" ON "department_schedule_exceptions"("department_id", "yearly_start_month", "yearly_start_day", "yearly_end_month", "yearly_end_day");
