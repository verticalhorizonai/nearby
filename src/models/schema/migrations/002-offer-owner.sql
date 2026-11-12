-- Migration 002 (build ruling 44): an offer posted through the demo belongs to the browser session that posted it, and
-- can be removed. Additive and idempotent, keyed on the old shape: applied at every start after schema.sql and 001.
-- 1. offers.owner_session_id: the posting session; NULL for the eight seed offers, which stay shared.
-- 2. offers.removed_at: set when the offer is removed or replaced by an edit; it is then never listed or matched.
-- 3. Once, when the columns are added: every offer that is not one of the seed's fixed ids was posted before offers had
--    an owner, so it is marked removed (nobody can own it). Rows are never deleted: proposals and purchases keep them.
-- The schema.sql it replaces is frozen as specs/migrations/baselines/002-before.sql; tools/schema-audit.mjs proves a
-- database built from it (or from 001-before.sql) converges to specs/schema.sql.

BEGIN;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'offers'::regclass AND attname = 'owner_session_id' AND NOT attisdropped
  ) THEN
    ALTER TABLE offers ADD COLUMN IF NOT EXISTS owner_session_id VARCHAR(64) NULL;
    ALTER TABLE offers ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ NULL;
    UPDATE offers SET removed_at = now()
     WHERE removed_at IS NULL
       AND id NOT IN (
         '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000102',
         '00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000000104',
         '00000000-0000-4000-8000-000000000105', '00000000-0000-4000-8000-000000000106',
         '00000000-0000-4000-8000-000000000107', '00000000-0000-4000-8000-000000000108'
       );
  END IF;
END
$do$;

COMMIT;
