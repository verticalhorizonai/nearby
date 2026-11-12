-- Migration 001 (build ruling 42): Nearby's offers for any agent, with the purchase still one person's yes.
-- 1. appointments.added_by: who put the stop in the session, the calendar or the person's assistant (checkout handoff).
-- 2. proposals.source gains 'assistant': the pick handed over through a checkout link.
-- Idempotent and keyed on the old shape: applied at every start after schema.sql (src/models/schema/runner.ts).
-- The schema.sql it replaces is frozen as specs/migrations/baselines/001-before.sql; tools/schema-audit.mjs proves
-- a database built from it converges to specs/schema.sql.

BEGIN;

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS added_by VARCHAR(16) NOT NULL DEFAULT 'calendar';

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_appointments_added_by' AND conrelid = 'appointments'::regclass
  ) THEN
    ALTER TABLE appointments ADD CONSTRAINT chk_appointments_added_by CHECK (added_by IN ('calendar', 'assistant'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_proposals_source' AND conrelid = 'proposals'::regclass
      AND pg_get_constraintdef(oid) LIKE '%assistant%'
  ) THEN
    ALTER TABLE proposals DROP CONSTRAINT IF EXISTS chk_proposals_source;
    ALTER TABLE proposals ADD CONSTRAINT chk_proposals_source CHECK (source IN ('agent', 'fallback', 'assistant'));
  END IF;
END
$do$;

COMMIT;
