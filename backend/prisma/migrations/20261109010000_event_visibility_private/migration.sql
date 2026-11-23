-- Align the visibility language with the team: 'internal' becomes 'private'.
ALTER TYPE "event_visibility" RENAME VALUE 'internal' TO 'private';

-- The internal logistics workspace was folded into "Jornadas y Eventos";
-- the 1:1 operational details extension is no longer used.
DROP TRIGGER IF EXISTS "trg_event_internal_details_visibility" ON "event_internal_details";
DROP FUNCTION IF EXISTS enforce_internal_event_details_visibility();
DROP TABLE IF EXISTS "event_internal_details";
