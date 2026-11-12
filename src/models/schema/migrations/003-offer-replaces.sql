-- Migration 003 (build ruling 45): editing a seed offer makes a private copy. offers.replaces_offer_id names the seed
-- offer a session's posted offer replaces in that session's demo; NULL when it replaces none. Additive and idempotent,
-- keyed on the old shape: applied at every start after schema.sql, 001 and 002. The seed rows are never changed.
-- The schema.sql it replaces is frozen as specs/migrations/baselines/003-before.sql; tools/schema-audit.mjs proves a
-- database built from it (or from an earlier baseline) converges to specs/schema.sql.

BEGIN;

ALTER TABLE offers ADD COLUMN IF NOT EXISTS replaces_offer_id UUID NULL;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_offers_replaces' AND conrelid = 'offers'::regclass
  ) THEN
    ALTER TABLE offers ADD CONSTRAINT fk_offers_replaces FOREIGN KEY (replaces_offer_id) REFERENCES offers (id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_offers_replaces_owned' AND conrelid = 'offers'::regclass
  ) THEN
    ALTER TABLE offers ADD CONSTRAINT chk_offers_replaces_owned CHECK (replaces_offer_id IS NULL OR owner_session_id IS NOT NULL);
  END IF;
END
$do$;

COMMIT;
