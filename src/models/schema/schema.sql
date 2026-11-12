-- SCHEMA CONTRACT — machine-readable source of truth for database structure.
-- Generated from shared-types.ts and data-model.md. DO NOT MODIFY without team-lead approval.
-- Agents MUST read this file before writing any migration or table code.
--
-- Project:   Nearby (spec)
-- Database:  PostgreSQL 13+ (Railway, REQ-07-02)
-- Naming:    snake_case in storage. The API layer serializes to camelCase.
--
-- Global conventions (data-model.md §0):
--   * Primary keys are UUID DEFAULT gen_random_uuid(). The seed script may supply fixed UUIDs (REQ-06-01).
--   * Timestamps are TIMESTAMPTZ and are serialized as ISO 8601 strings.
--   * Every *_cents column is BIGINT. Never INTEGER, NUMERIC or REAL.
--     Dollar input has at most two decimals; more are refused, never rounded (ruling 4).
--   * Enums are VARCHAR + CHECK (... IN (...)). Values match the shared union types exactly, casing included.
--   * GeoPoint is stored as location_lat / location_lng (DOUBLE PRECISION).
--     It is serialized as location: { lat, lng }.
--   * ValidWindow is stored flat on offers (valid_days, valid_start_time, valid_end_time).
--   * "HH:MM" times are VARCHAR(5) with a format CHECK. TIME is not used, so values never leak as HH:MM:SS.
--   * updated_at is maintained by the shared trigger set_updated_at().
--   * There are NO user, role, session or auth tables ("a seat is not a sign-in").
--
-- Persistent entity interfaces -> tables (1:1):
--   Appointment -> appointments
--   Merchant    -> merchants
--   Offer       -> offers
--   Proposal    -> proposals
--   Purchase    -> purchases
--
-- Every other interface in shared-types.ts is a projection, DTO, envelope, config or adapter value.
-- These intentionally have NO table (data-model.md §1.2):
--   CalendarConnection, SkippedEvent, UpcomingAppointmentsResult,
--   ListUpcomingAppointmentsToolInput, PlaceSummary (never persisted, REQ-02-05),
--   AppointmentMapData, MapMerchantPin, Pick, AppointmentPicks, ConfirmSheet,
--   AcceptProposalResult, StartPaymentRequest, StartPaymentResult, Receipt,
--   PaymentReturnResult, SalesFeedItem, SalesFeed, AppointmentTile, ShopperSeatCard,
--   MerchantSeatCard, ChooseSeatData, CurrentSeat (session cookie), ResetDemoResult,
--   PublicConfig (environment), PaginationMeta, ApiResponse, ApiCollectionResponse,
--   ApiErrorResponse, FieldError, GeoPoint (embedded columns), ValidWindow (embedded columns).
--
-- Open items of data-model.md §8, as settled by build ruling 9 (G-05, R-T):
--   1. Browser-session ownership: appointments.session_id and proposals.session_id (spec 3.9). A purchase is owned
--      through its proposal.
--   2. Confirmation token: proposals.confirm_token_hash (spec 3.9) with confirm_token_expires_at and
--      confirm_token_used_at beside it (3.7.4: 10 minutes, single use).
--   3. CalendarConnection.connectedAt: the earliest created_at of the session's appointments.
--   4. Agent rate-limit counters. These are process-local sliding windows.
--   5. Kill switch. This is the AGENT_DISABLED environment variable.
-- Applied at every start (IF NOT EXISTS: idempotent, and it never changes a table that already exists), then
-- the migrations in file-name order. The application applies its own copy, src/models/schema/schema.sql
-- (spec 3.13, ruling 2); this file is the copy of record and verify:phaseN fails when the two differ (build ruling 13). A change to an existing table ships as a numbered, idempotent migration
-- with the schema.sql it replaces frozen under specs/migrations/baselines/; node tools/schema-audit.mjs proves an old
-- database converges to this schema and appends to specs/schema-audit.log.

BEGIN;

-- gen_random_uuid() is built in from PostgreSQL 13. pgcrypto keeps older environments compatible.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- SHARED TRIGGER FUNCTION: set_updated_at()  (data-model.md §7)
-- ============================================================================

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql
AS $fn$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$fn$;

-- ============================================================================
-- TABLE: appointments   (interface Appointment)
-- Source: REQ-01-01, REQ-01-02, REQ-01-03, REQ-01-05, REQ-05-02, REQ-06-01
--
-- Every event the demo calendar returns is stored per browser session (spec 3.9: session_id,
-- source_event_id, skip_reason). A skipped event keeps its skip_reason and may lack a location
-- or coordinates; a usable one (skip_reason NULL) has all three (build ruling 9, G-05).
-- There is no HTTP create endpoint; rows are written when the session connects the demo calendar.
-- The only HTTP mutation is the enabled toggle (UpdateAppointmentRequest).
-- ============================================================================

CREATE TABLE IF NOT EXISTS appointments (
  id               UUID             NOT NULL DEFAULT gen_random_uuid(),  -- id
  session_id       VARCHAR(64)      NOT NULL,                            -- browser session that owns the row (spec 3.9; build ruling 9)
  source_event_id  VARCHAR(255)     NOT NULL,                            -- calendar event id (spec 3.9, 3.2.2 id)
  title            VARCHAR(255)     NOT NULL,                            -- title (trimmed to 80 chars by the MCP tool)
  starts_at        TIMESTAMPTZ      NOT NULL,                            -- startsAt (spec start_at)
  ends_at          TIMESTAMPTZ      NOT NULL,                            -- endsAt (spec end_at)
  location_text    TEXT             NULL,                                -- address at the API boundary (spec location_text)
  location_lat     DOUBLE PRECISION NULL,                                -- location.lat (spec lat)
  location_lng     DOUBLE PRECISION NULL,                                -- location.lng (spec lng)
  skip_reason      VARCHAR(32)      NULL,                                -- SkippedEventReason; NULL = usable appointment (spec 3.9, 3.2.3)
  enabled          BOOLEAN          NOT NULL DEFAULT TRUE,               -- enabled (FALSE = excluded from picks)
  created_at       TIMESTAMPTZ      NOT NULL DEFAULT now(),              -- createdAt
  updated_at       TIMESTAMPTZ      NOT NULL DEFAULT now(),              -- updatedAt (trigger-maintained)
  CONSTRAINT pk_appointments                PRIMARY KEY (id),
  CONSTRAINT uq_appointments_session_event  UNIQUE (session_id, source_event_id),
  CONSTRAINT chk_appointments_title_nonblank   CHECK (char_length(btrim(title)) > 0),
  CONSTRAINT chk_appointments_location_lat     CHECK (location_lat IS NULL OR location_lat BETWEEN -90 AND 90),
  CONSTRAINT chk_appointments_location_lng     CHECK (location_lng IS NULL OR location_lng BETWEEN -180 AND 180),
  CONSTRAINT chk_appointments_time_order       CHECK (ends_at >= starts_at),
  CONSTRAINT chk_appointments_skip_reason
    CHECK (skip_reason IS NULL OR skip_reason IN ('no_address', 'video_call', 'all_day', 'no_coordinates', 'out_of_area')),
  CONSTRAINT chk_appointments_usable
    CHECK (skip_reason IS NOT NULL OR (location_text IS NOT NULL AND char_length(btrim(location_text)) > 0 AND location_lat IS NOT NULL AND location_lng IS NOT NULL))
);

-- Supports the 7-day window query (APPOINTMENT_WINDOW_DAYS = 7).
CREATE INDEX IF NOT EXISTS idx_appointments_session_starts_at
  ON appointments (session_id, starts_at);

-- ============================================================================
-- TABLE: merchants   (interface Merchant)
-- Source: REQ-04-01, REQ-05-03, REQ-05-07, REQ-06-01
--
-- There is no HTTP create or update endpoint.
-- The seed script writes exactly SAMPLE_MERCHANT_COUNT = 8 rows via
-- INSERT ... ON CONFLICT (id) DO UPDATE.
-- is_sample is always TRUE for seeded merchants and drives the Sample badge.
-- ============================================================================

CREATE TABLE IF NOT EXISTS merchants (
  id            UUID             NOT NULL DEFAULT gen_random_uuid(),  -- id
  name          VARCHAR(255)     NOT NULL,                            -- name
  type          VARCHAR(100)     NOT NULL,                            -- type
  area          VARCHAR(255)     NOT NULL,                            -- area
  location_lat  DOUBLE PRECISION NOT NULL,                            -- location.lat
  location_lng  DOUBLE PRECISION NOT NULL,                            -- location.lng
  is_sample     BOOLEAN          NOT NULL,                            -- isSample
  created_at    TIMESTAMPTZ      NOT NULL DEFAULT now(),              -- createdAt
  updated_at    TIMESTAMPTZ      NOT NULL DEFAULT now(),              -- updatedAt (trigger-maintained)

  CONSTRAINT pk_merchants                PRIMARY KEY (id),
  CONSTRAINT uq_merchants_name           UNIQUE (name),               -- guards against duplicate re-seed
  CONSTRAINT chk_merchants_name_nonblank CHECK (char_length(btrim(name)) > 0),
  CONSTRAINT chk_merchants_type_nonblank CHECK (char_length(btrim(type)) > 0),
  CONSTRAINT chk_merchants_area_nonblank CHECK (char_length(btrim(area)) > 0),
  CONSTRAINT chk_merchants_location_lat  CHECK (location_lat BETWEEN -90 AND 90),
  CONSTRAINT chk_merchants_location_lng  CHECK (location_lng BETWEEN -180 AND 180)
);

-- ============================================================================
-- TABLE: offers   (interface Offer extends ValidWindow)
-- Source: REQ-04-02, REQ-04-03, REQ-02-06, REQ-02-07, REQ-03-01, REQ-06-01
--
-- Offers are live from the moment they are published. There is NO status column.
-- There is no HTTP edit or delete. UpdateOfferRequest is used for the seed upsert only.
-- category is OfferCategory = string, so there is NO enum CHECK. The backend validates it.
-- valid_days is DayOfWeek[]. The application rejects duplicate days.
-- Any comparison of regular_price_cents against price_cents lives in the REQ-04-03 validator.
-- is_deposit is set only by the seed (SeedOfferInput). HTTP-created offers get FALSE.
-- ============================================================================

CREATE TABLE IF NOT EXISTS offers (
  id                   UUID        NOT NULL DEFAULT gen_random_uuid(),  -- id
  merchant_id          UUID        NOT NULL,                            -- merchantId
  title                VARCHAR(60) NOT NULL,                            -- title
  price_cents          BIGINT      NOT NULL,                            -- priceCents (integer cents)
  regular_price_cents  BIGINT      NULL,                                -- regularPriceCents (integer cents)
  category             VARCHAR(50) NOT NULL,                            -- category (OfferCategory)
  valid_days           TEXT[]      NOT NULL,                            -- validDays (DayOfWeek[])
  valid_start_time     VARCHAR(5)  NOT NULL,                            -- validStartTime "HH:MM"
  valid_end_time       VARCHAR(5)  NOT NULL,                            -- validEndTime   "HH:MM"
  is_deposit           BOOLEAN     NOT NULL DEFAULT FALSE,              -- isDeposit
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),              -- createdAt
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),              -- updatedAt (trigger-maintained)

  CONSTRAINT pk_offers PRIMARY KEY (id),
  CONSTRAINT fk_offers_merchant FOREIGN KEY (merchant_id)
    REFERENCES merchants (id) ON DELETE RESTRICT,

  -- Target of the composite FKs on proposals and purchases.
  -- This stops an offer from being paired with the wrong merchant.
  CONSTRAINT uq_offers_id_merchant UNIQUE (id, merchant_id),

  -- OFFER_TITLE_MIN_LENGTH = 1, OFFER_TITLE_MAX_LENGTH = 60. Titles are stored trimmed.
  CONSTRAINT chk_offers_title_length CHECK (char_length(btrim(title)) BETWEEN 1 AND 60),

  -- Spec 3.8: price 50 to 50,000 cents; regular price, when given, greater than the price (build ruling 11, G-27).
  CONSTRAINT chk_offers_price_cents_bounds CHECK (price_cents BETWEEN 50 AND 50000),
  CONSTRAINT chk_offers_regular_price_above_price
    CHECK (regular_price_cents IS NULL OR regular_price_cents > price_cents),

  -- OFFER_CATEGORIES, the five of spec 3.8 (build ruling 11, G-07).
  CONSTRAINT chk_offers_category
    CHECK (category IN ('coffee', 'lunch', 'dinner', 'juice_or_snack', 'service')),

  -- DayOfWeek: 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'
  CONSTRAINT chk_offers_valid_days_cardinality CHECK (cardinality(valid_days) BETWEEN 1 AND 7),
  CONSTRAINT chk_offers_valid_days_values
    CHECK (valid_days <@ ARRAY['mon','tue','wed','thu','fri','sat','sun']::TEXT[]),

  CONSTRAINT chk_offers_valid_start_time_format
    CHECK (valid_start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  CONSTRAINT chk_offers_valid_end_time_format
    CHECK (valid_end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),

  -- Zero-padded "HH:MM" values compare correctly as strings.
  CONSTRAINT chk_offers_window_order CHECK (valid_start_time < valid_end_time)
);

-- Supports the merchant dashboard offers list and the seat cards.
CREATE INDEX IF NOT EXISTS idx_offers_merchant_created
  ON offers (merchant_id, created_at DESC);

-- ============================================================================
-- TABLE: proposals   (interface Proposal)
-- Source: REQ-02-02, REQ-02-03, REQ-02-06, REQ-02-07, REQ-02-08, REQ-03-02, REQ-03-06, REQ-03-12
--
-- Proposals are created internally by the agent service or the fallback path.
-- There is no HTTP create endpoint.
--
-- Allowed status transitions (service layer, guarded UPDATE ... WHERE status = <from>):
--   proposed -> accepted   (Yes; a confirmation token is minted)
--   proposed -> declined   (Not now; nothing is created at PayPal)
--   declined -> proposed   (Show hidden picks, before expiry; build ruling 40)
--   accepted -> proposed   (cancel at PayPal, failed capture, or token expired unused)
--   proposed | accepted -> expired   (now() - created_at >= PROPOSAL_EXPIRY_MS = 10800000, spec 3.9.1;
--                                     never while a completed purchase exists, build ruling 7)
--
-- expired is terminal.
-- After a completed purchase the proposal remains 'accepted'.
-- reason (<= PICK_REASON_MAX_WORDS = 25 words, one sentence) is validated in code before insert.
-- created_at is the expiry clock (spec 3.9.1; build ruling 12, G-12).
-- ============================================================================

CREATE TABLE IF NOT EXISTS proposals (
  id               UUID             NOT NULL DEFAULT gen_random_uuid(),  -- id
  session_id       VARCHAR(64)      NOT NULL,                            -- browser session that owns the row (spec 3.9; build ruling 9)
  appointment_id   UUID             NOT NULL,                            -- appointmentId
  offer_id         UUID             NOT NULL,                            -- offerId
  merchant_id      UUID             NOT NULL,                            -- merchantId
  rank             SMALLINT         NOT NULL,                            -- rank (1 or 2)
  score            DOUBLE PRECISION NOT NULL,                            -- score (0..1, >= MIN_PICK_SCORE)
  reason           TEXT             NOT NULL,                            -- reason
  distance_meters  INTEGER          NOT NULL,                            -- distanceMeters (whole meters)
  source           VARCHAR(16)      NOT NULL,                            -- source (PickSource)
  status           VARCHAR(16)      NOT NULL DEFAULT 'proposed',         -- status (ProposalStatus)
  confirm_token_hash       CHAR(64)    NULL,                             -- SHA-256 hex of the confirmation token (spec 3.9, 3.7.4)
  confirm_token_expires_at TIMESTAMPTZ NULL,                             -- mint time + 10 minutes (spec 3.7.4; build ruling 9)
  confirm_token_used_at    TIMESTAMPTZ NULL,                             -- set when POST /api/purchases claims it (single use)
  created_at       TIMESTAMPTZ      NOT NULL DEFAULT now(),              -- createdAt
  updated_at       TIMESTAMPTZ      NOT NULL DEFAULT now(),              -- updatedAt (trigger-maintained)

  CONSTRAINT pk_proposals PRIMARY KEY (id),
  CONSTRAINT fk_proposals_appointment FOREIGN KEY (appointment_id)
    REFERENCES appointments (id) ON DELETE RESTRICT,
  CONSTRAINT fk_proposals_offer_merchant FOREIGN KEY (offer_id, merchant_id)
    REFERENCES offers (id, merchant_id) ON DELETE RESTRICT,

  -- MAX_PICKS_PER_APPOINTMENT = 2
  CONSTRAINT chk_proposals_rank CHECK (rank IN (1, 2)),

  -- MIN_PICK_SCORE = 0.35
  CONSTRAINT chk_proposals_score CHECK (score >= 0.35 AND score <= 1),

  CONSTRAINT chk_proposals_reason_nonblank CHECK (char_length(btrim(reason)) > 0),
  CONSTRAINT chk_proposals_distance_nonnegative CHECK (distance_meters >= 0),

  -- PickSource: 'agent' | 'fallback'
  CONSTRAINT chk_proposals_source CHECK (source IN ('agent', 'fallback')),

  -- ProposalStatus: 'proposed' | 'accepted' | 'declined' | 'expired'
  CONSTRAINT chk_proposals_status
    CHECK (status IN ('proposed', 'accepted', 'declined', 'expired'))
);

CREATE INDEX IF NOT EXISTS idx_proposals_appointment_status
  ON proposals (appointment_id, status);
CREATE INDEX IF NOT EXISTS idx_proposals_session
  ON proposals (session_id);

-- Supports the expiry sweep.
CREATE INDEX IF NOT EXISTS idx_proposals_status_updated
  ON proposals (status, updated_at);

-- Foreign-key lookup support.
CREATE INDEX IF NOT EXISTS idx_proposals_offer_merchant
  ON proposals (offer_id, merchant_id);

-- ============================================================================
-- TABLE: purchases   (interface Purchase)
-- Source: REQ-03-01, REQ-03-07, REQ-03-09, REQ-03-10, REQ-03-11, REQ-03-12, REQ-04-04, REQ-04-05
--
-- Purchases are created server-side when the PayPal order is created.
-- There is no direct HTTP create endpoint.
--
-- amount_cents is a snapshot of offers.price_cents, read server-side.
-- It is NEVER taken from the browser (REQ-03-09).
-- paypal_order_id is the lookup key on return. A duplicate return yields the same receipt
-- and no second capture.
-- redemption_code uses REDEMPTION_CODE_ALPHABET ('ABCDEFGHJKLMNPQRSTUVWXYZ23456789') and
-- REDEMPTION_CODE_LENGTH = 6. On a uniqueness collision the code is regenerated.
--
-- Allowed status transitions:
--   (insert) -> created              (PayPal order created after the token is verified and consumed)
--   created  -> approved             (return URL, approval confirmed)
--   approved -> completed            (capture status = 'COMPLETED'; redemption_code and completed_at
--                                     are set in the same transaction)
--   created | approved -> failed     (cancel URL, or any capture status other than 'COMPLETED';
--                                     the proposal goes accepted -> proposed in the same transaction)
--
-- completed and failed are terminal. A retry after failed inserts a NEW row.
-- No PayPal credentials or payer data are persisted (REQ-07-06).
-- ============================================================================

CREATE TABLE IF NOT EXISTS purchases (
  id               UUID        NOT NULL DEFAULT gen_random_uuid(),  -- id
  proposal_id      UUID        NOT NULL,                            -- proposalId
  offer_id         UUID        NOT NULL,                            -- offerId
  merchant_id      UUID        NOT NULL,                            -- merchantId
  amount_cents     BIGINT      NOT NULL,                            -- amountCents (integer cents)
  paypal_order_id  VARCHAR(64) NOT NULL,                            -- paypalOrderId
  status           VARCHAR(16) NOT NULL DEFAULT 'created',          -- status (PurchaseStatus)
  redemption_code  CHAR(6)     NULL,                                -- redemptionCode
  completed_at     TIMESTAMPTZ NULL,                                -- completedAt
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),              -- createdAt
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),              -- updatedAt (trigger-maintained)

  CONSTRAINT pk_purchases PRIMARY KEY (id),
  CONSTRAINT fk_purchases_proposal FOREIGN KEY (proposal_id)
    REFERENCES proposals (id) ON DELETE RESTRICT,
  CONSTRAINT fk_purchases_offer_merchant FOREIGN KEY (offer_id, merchant_id)
    REFERENCES offers (id, merchant_id) ON DELETE RESTRICT,

  CONSTRAINT uq_purchases_paypal_order_id UNIQUE (paypal_order_id),
  CONSTRAINT uq_purchases_redemption_code UNIQUE (redemption_code),

  CONSTRAINT chk_purchases_amount_cents_positive CHECK (amount_cents > 0),

  -- PurchaseStatus: 'created' | 'approved' | 'completed' | 'failed'
  CONSTRAINT chk_purchases_status
    CHECK (status IN ('created', 'approved', 'completed', 'failed')),

  -- REDEMPTION_CODE_ALPHABET: A-Z excluding I and O, plus digits 2-9.
  CONSTRAINT chk_purchases_redemption_code_format
    CHECK (redemption_code IS NULL OR redemption_code ~ '^[A-HJ-NP-Z2-9]{6}$'),

  -- A redemption code and completion time exist if and only if the capture was COMPLETED.
  CONSTRAINT chk_purchases_completion CHECK (
    (status = 'completed' AND redemption_code IS NOT NULL AND completed_at IS NOT NULL)
    OR
    (status <> 'completed' AND redemption_code IS NULL AND completed_at IS NULL)
  )
);

-- At most one completed purchase per proposal.
CREATE UNIQUE INDEX IF NOT EXISTS uq_purchases_one_completed_per_proposal
  ON purchases (proposal_id) WHERE status = 'completed';

-- Prevents double order creation (at most one in-flight purchase per proposal).
CREATE UNIQUE INDEX IF NOT EXISTS uq_purchases_one_inflight_per_proposal
  ON purchases (proposal_id) WHERE status IN ('created', 'approved');

-- Live Sales Feed: newest first, LIMIT SALES_FEED_MAX_ITEMS (20).
CREATE INDEX IF NOT EXISTS idx_purchases_sales_feed
  ON purchases (merchant_id, completed_at DESC) WHERE status = 'completed';

-- Foreign-key lookup support.
CREATE INDEX IF NOT EXISTS idx_purchases_proposal_id
  ON purchases (proposal_id);
CREATE INDEX IF NOT EXISTS idx_purchases_offer_merchant
  ON purchases (offer_id, merchant_id);

-- ============================================================================
-- updated_at TRIGGERS (BEFORE UPDATE on all five tables)
-- PostgreSQL has no CREATE TRIGGER IF NOT EXISTS.
-- Each guarded DO block below gives the same idempotent behaviour.
-- ============================================================================

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_appointments_updated'
      AND tgrelid = 'appointments'::regclass
  ) THEN
    CREATE TRIGGER trg_appointments_updated
      BEFORE UPDATE ON appointments
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_merchants_updated'
      AND tgrelid = 'merchants'::regclass
  ) THEN
    CREATE TRIGGER trg_merchants_updated
      BEFORE UPDATE ON merchants
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_offers_updated'
      AND tgrelid = 'offers'::regclass
  ) THEN
    CREATE TRIGGER trg_offers_updated
      BEFORE UPDATE ON offers
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_proposals_updated'
      AND tgrelid = 'proposals'::regclass
  ) THEN
    CREATE TRIGGER trg_proposals_updated
      BEFORE UPDATE ON proposals
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_purchases_updated'
      AND tgrelid = 'purchases'::regclass
  ) THEN
    CREATE TRIGGER trg_purchases_updated
      BEFORE UPDATE ON purchases
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END
$do$;

-- ============================================================================
-- ENUM CONFORMANCE CHECKLIST (data-model.md §11)
--
-- Unions backed by a column CHECK:
--   ProposalStatus -> proposals.status       : 'proposed','accepted','declined','expired'
--   PurchaseStatus -> purchases.status       : 'created','approved','completed','failed'
--   PickSource     -> proposals.source       : 'agent','fallback'
--   DayOfWeek      -> offers.valid_days[]    : 'mon','tue','wed','thu','fri','sat','sun'
--
-- Unions with no column, and therefore no CHECK:
--   Request-time or response-only: SkippedEventReason, MapRenderMode, MapPinKind,
--                                  PaymentReturnOutcome, OfferFormField, ApiErrorCode
--   Session state:                 SeatKind
--   Not persisted:                 CalendarMcpToolName
--   Environment:                   EveryVariable
--   Unconstrained string by contract: OfferCategory
--
-- WRITE PROCEDURES (reference only, data-model.md §7):
--   Reset Demo runs in one transaction:
--     1. DELETE FROM purchases WHERE <scope>
--     2. DELETE FROM proposals WHERE <scope>
--     3. UPDATE appointments SET enabled = TRUE WHERE enabled = FALSE
--     <scope> is pending team-lead decision (§8 item 1).
--     merchants, offers and seeded appointments are never deleted.
--   Seed script:
--     ON CONFLICT (id) DO UPDATE for merchants, offers and appointments.
--     It never touches proposals or purchases.
-- ============================================================================

COMMIT;