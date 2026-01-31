-- ============================================================================
-- Migration 004: Add v2.0 Operational Tables
-- ============================================================================
-- The v2.0 frontend (Loads, Shipments, Rates, Street Turns, Settings,
-- Notifications) and supabase.ts data layer reference tables that were never
-- created in the original schema migration.  This migration adds them all.
-- Every statement is idempotent (IF NOT EXISTS / IF NOT EXISTS guards).
-- ============================================================================

-- ==============================================================================
-- 1. LOADS  (core operational entity — one row per load/container assignment)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS loads (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    load_number         VARCHAR(30)     UNIQUE NOT NULL,
    order_id            UUID            REFERENCES orders(id),
    customer_id         UUID            NOT NULL REFERENCES customers(id),
    container_number    VARCHAR(15),
    container_size      VARCHAR(10),
    container_type      VARCHAR(20)     DEFAULT 'DRY',
    weight_lbs          INTEGER,
    is_hazmat           BOOLEAN         DEFAULT FALSE,
    is_overweight       BOOLEAN         DEFAULT FALSE,
    requires_triaxle    BOOLEAN         DEFAULT FALSE,
    move_type           VARCHAR(20),
    terminal            VARCHAR(255),
    terminal_status     VARCHAR(20),
    last_free_day       DATE,
    hold_customs        BOOLEAN         DEFAULT FALSE,
    hold_freight        BOOLEAN         DEFAULT FALSE,
    hold_usda           BOOLEAN         DEFAULT FALSE,
    hold_tmf            BOOLEAN         DEFAULT FALSE,
    in_yard             BOOLEAN         DEFAULT FALSE,
    yard_location       VARCHAR(255),
    yard_in_date        TIMESTAMPTZ,
    status              VARCHAR(30)     NOT NULL DEFAULT 'TRACKING',
    total_charges       DECIMAL(10,2)   DEFAULT 0,
    invoice_id          UUID            REFERENCES invoices(id),
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 2. LOAD CHARGES  (line-item charges attached to a load)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS load_charges (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    load_id         UUID            NOT NULL REFERENCES loads(id) ON DELETE CASCADE,
    charge_type     VARCHAR(30)     NOT NULL,
    description     VARCHAR(255),
    quantity        DECIMAL(10,2)   DEFAULT 1,
    unit_rate       DECIMAL(10,2)   DEFAULT 0,
    amount          DECIMAL(10,2)   DEFAULT 0,
    billable_to     VARCHAR(20)     DEFAULT 'CUSTOMER',
    auto_calculated BOOLEAN         DEFAULT FALSE,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 3. LOAD NOTES  (internal / customer-visible notes on a load)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS load_notes (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    load_id                 UUID        NOT NULL REFERENCES loads(id) ON DELETE CASCADE,
    author_name             VARCHAR(100) NOT NULL,
    author_type             VARCHAR(20)  DEFAULT 'INTERNAL',
    message                 TEXT         NOT NULL,
    visible_to_customer     BOOLEAN      DEFAULT FALSE,
    created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 4. LOAD ACTIVITY LOG  (append-only audit trail for every load change)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS load_activity_log (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    load_id         UUID        NOT NULL REFERENCES loads(id) ON DELETE CASCADE,
    action          VARCHAR(50) NOT NULL,
    from_value      VARCHAR(100),
    to_value        VARCHAR(100),
    details         TEXT,
    performed_by    VARCHAR(100) DEFAULT 'SYSTEM',
    performer_type  VARCHAR(20)  DEFAULT 'SYSTEM',
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 5. STREET TURNS  (import→export container reuse opportunities)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS street_turns (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    street_turn_number      VARCHAR(30),
    import_shipment_id      UUID        REFERENCES shipments(id),
    export_shipment_id      UUID        REFERENCES shipments(id),
    import_load_id          UUID        REFERENCES loads(id),
    export_load_id          UUID        REFERENCES loads(id),
    import_container        VARCHAR(15),
    export_container        VARCHAR(15),
    container_size          VARCHAR(10),
    import_terminal         VARCHAR(255),
    export_terminal         VARCHAR(255),
    status                  VARCHAR(20) NOT NULL DEFAULT 'POTENTIAL',
    estimated_savings       DECIMAL(10,2) DEFAULT 0,
    approved_by             VARCHAR(100),
    approved_at             TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 6. DRIVER PAY RATE PROFILES  (pay structure templates)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS driver_rate_profiles (
    id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_name                VARCHAR(100) NOT NULL,
    driver_type                 VARCHAR(30)  DEFAULT 'COMPANY_DRIVER',
    pay_method                  VARCHAR(20)  DEFAULT 'PER_LOAD',
    default_rate                DECIMAL(10,2) DEFAULT 0,
    default_percentage          DECIMAL(5,2) DEFAULT 0,
    waiting_free_hours          INTEGER      DEFAULT 2,
    waiting_rate_per_hour       DECIMAL(8,2) DEFAULT 0,
    stop_pay                    DECIMAL(8,2) DEFAULT 0,
    free_stops                  INTEGER      DEFAULT 0,
    hazmat_pay                  DECIMAL(8,2) DEFAULT 0,
    overweight_pay              DECIMAL(8,2) DEFAULT 0,
    live_unload_pay             DECIMAL(8,2) DEFAULT 0,
    weekend_pay                 DECIMAL(8,2) DEFAULT 0,
    weekly_insurance_deduction  DECIMAL(8,2) DEFAULT 0,
    weekly_lease_deduction      DECIMAL(8,2) DEFAULT 0,
    is_active                   BOOLEAN      DEFAULT TRUE,
    created_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 7. LANE RATES  (origin→destination route pricing)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS lane_rates (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    origin_type         VARCHAR(30) NOT NULL,
    origin_value        VARCHAR(100) NOT NULL,
    destination_type    VARCHAR(30) NOT NULL,
    destination_value   VARCHAR(100) NOT NULL,
    flat_rate           DECIMAL(10,2) DEFAULT 0,
    per_mile_rate       DECIMAL(8,4) DEFAULT 0,
    estimated_miles     DECIMAL(8,2) DEFAULT 0,
    minimum_pay         DECIMAL(10,2) DEFAULT 0,
    is_active           BOOLEAN     DEFAULT TRUE,
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 8. DRIVER RATE ASSIGNMENTS  (which profile is assigned to which driver)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS driver_rate_assignments (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id       UUID        UNIQUE NOT NULL REFERENCES drivers(id),
    rate_profile_id UUID        NOT NULL REFERENCES driver_rate_profiles(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 9. COMPANY SETTINGS  (singleton row keyed by id = 'default')
-- ==============================================================================

CREATE TABLE IF NOT EXISTS company_settings (
    id                      VARCHAR(20) PRIMARY KEY,
    name                    VARCHAR(255),
    address                 VARCHAR(500),
    city                    VARCHAR(100),
    state                   VARCHAR(50),
    zip                     VARCHAR(20),
    phone                   VARCHAR(50),
    email                   VARCHAR(255),
    mc_number               VARCHAR(50),
    dot_number              VARCHAR(50),
    email_alerts            BOOLEAN DEFAULT TRUE,
    sms_alerts              BOOLEAN DEFAULT FALSE,
    dispatch_notifications  BOOLEAN DEFAULT TRUE,
    delivery_notifications  BOOLEAN DEFAULT TRUE,
    lfd_reminders           BOOLEAN DEFAULT TRUE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 10. NOTIFICATIONS  (dashboard + channel notifications)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS notifications (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    target_type     VARCHAR(50),
    target_id       VARCHAR(100),
    recipient_type  VARCHAR(50),
    title           VARCHAR(255) NOT NULL,
    message         TEXT,
    severity        VARCHAR(20) DEFAULT 'MEDIUM',
    channel         VARCHAR(20) DEFAULT 'DASHBOARD',
    status          VARCHAR(20) DEFAULT 'PENDING',
    read_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 11. YARD INVENTORY  (tracks what's physically in the yard)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS yard_inventory (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    yard_location_id    UUID        REFERENCES locations(id),
    load_id             UUID        REFERENCES loads(id),
    on_chassis          BOOLEAN     DEFAULT FALSE,
    chassis_number      VARCHAR(20),
    chassis_pool        VARCHAR(50),
    in_date             TIMESTAMPTZ,
    out_date            TIMESTAMPTZ,
    status              VARCHAR(20) DEFAULT 'IN_YARD',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 12. CONTAINER TRACKING  (eModal sync cache — container status snapshots)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS container_tracking (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    container_number    VARCHAR(15) UNIQUE NOT NULL,
    emodal_status       VARCHAR(50),
    availability_status VARCHAR(30),
    has_customs_hold    BOOLEAN     DEFAULT FALSE,
    has_freight_hold    BOOLEAN     DEFAULT FALSE,
    has_usda_hold       BOOLEAN     DEFAULT FALSE,
    yard_location       VARCHAR(255),
    last_checked_at     TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 13. ALTER EXISTING TABLES — add missing columns
-- ==============================================================================

-- trips needs load_id so the Shipments page can join trips back to loads
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'trips' AND column_name = 'load_id'
    ) THEN
        ALTER TABLE trips ADD COLUMN load_id UUID REFERENCES loads(id);
        RAISE NOTICE 'Added trips.load_id';
    END IF;
END $$;

-- drivers needs is_active flag (Rates page filters on this)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'drivers' AND column_name = 'is_active'
    ) THEN
        ALTER TABLE drivers ADD COLUMN is_active BOOLEAN DEFAULT TRUE;
        -- Back-fill: mark drivers whose status is not a terminal state as active
        UPDATE drivers SET is_active = (status IN ('AVAILABLE', 'ACTIVE', 'ON_DUTY'));
        RAISE NOTICE 'Added drivers.is_active';
    END IF;
END $$;

-- ==============================================================================
-- 14. INDEXES
-- ==============================================================================

CREATE INDEX IF NOT EXISTS idx_loads_customer       ON loads(customer_id);
CREATE INDEX IF NOT EXISTS idx_loads_status         ON loads(status);
CREATE INDEX IF NOT EXISTS idx_loads_container      ON loads(container_number);
CREATE INDEX IF NOT EXISTS idx_loads_lfd            ON loads(last_free_day);
CREATE INDEX IF NOT EXISTS idx_loads_created        ON loads(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_load_charges_load    ON load_charges(load_id);
CREATE INDEX IF NOT EXISTS idx_load_notes_load      ON load_notes(load_id);
CREATE INDEX IF NOT EXISTS idx_load_activity_load   ON load_activity_log(load_id);

CREATE INDEX IF NOT EXISTS idx_trips_load           ON trips(load_id);

CREATE INDEX IF NOT EXISTS idx_street_turns_status  ON street_turns(status);
CREATE INDEX IF NOT EXISTS idx_street_turns_import  ON street_turns(import_load_id);
CREATE INDEX IF NOT EXISTS idx_street_turns_export  ON street_turns(export_load_id);

CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(created_at DESC) WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_container_tracking_num ON container_tracking(container_number);

CREATE INDEX IF NOT EXISTS idx_driver_assignments_driver ON driver_rate_assignments(driver_id);

-- ==============================================================================
-- 15. EXTEND shipment_status ENUM
-- ==============================================================================
-- The Loads page status dropdown includes CONFIRMED and DELIVERED, which were
-- not in the original enum.  ADD VALUE IF NOT EXISTS is idempotent.
-- ==============================================================================

ALTER TYPE shipment_status ADD VALUE IF NOT EXISTS 'CONFIRMED';
ALTER TYPE shipment_status ADD VALUE IF NOT EXISTS 'DELIVERED';

-- ==============================================================================
-- 16. ALTER shipments — nullable FKs + text columns for the wizard
-- ==============================================================================
-- The NewLoadModal 5-step wizard collects plain-text values (customer name,
-- SSL name, terminal name) rather than FK UUIDs.  The FK columns are kept
-- for rows that were seeded with proper lookups; new wizard-created rows
-- populate the text columns instead.  All statements are guarded so this
-- migration is safe to re-run.
-- ==============================================================================

-- Drop NOT NULL on FK columns so wizard rows don't need lookup UUIDs
DO $$
BEGIN
    ALTER TABLE shipments ALTER COLUMN customer_id DROP NOT NULL;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE shipments ALTER COLUMN steamship_line_id DROP NOT NULL;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE shipments ALTER COLUMN port_id DROP NOT NULL;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE shipments ALTER COLUMN terminal_id DROP NOT NULL;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- Text columns for wizard-submitted values
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS customer_name      VARCHAR(255);
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS steamship_line     VARCHAR(255);
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS booking_number     VARCHAR(100);
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS bill_of_lading     VARCHAR(100);
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS vessel             VARCHAR(255);
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS voyage             VARCHAR(50);
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS terminal_name      VARCHAR(255);
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS trip_type          VARCHAR(50);
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS chassis_required   BOOLEAN DEFAULT TRUE;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS chassis_pool       VARCHAR(100);
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS chassis_size       VARCHAR(20);
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS delivery_address   VARCHAR(500);
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS delivery_city      VARCHAR(100);
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS delivery_state     VARCHAR(50);
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS delivery_zip       VARCHAR(20);
