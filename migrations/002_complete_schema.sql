-- ==============================================================================
-- DrayMaster TMS — Complete Database Migration
-- ==============================================================================
-- Single idempotent file: safe to run on a fresh DB or re-run against an
-- existing one.  Every DDL statement uses IF NOT EXISTS / DO $$ guards so
-- nothing fails on re-execution.  Seed rows use ON CONFLICT DO NOTHING.
--
-- Sections
--   1  Extensions & utility functions
--   2  Enum types
--   3  Core reference tables
--   4  Order-service tables (shipments, containers, orders, loads, street_turns)
--   5  Driver-service tables
--   6  Equipment-service tables (+ yard_inventory)
--   7  Dispatch-service tables (trips, trip_stops, trip_legs)
--   8  Appointment & exception tables
--   9  eModal-integration tables (+ container_tracking)
--  10  Billing-service & rate tables (+ driver_rate_profiles, lane_rates)
--  11  Tracking-service tables
--  12  Admin tables (company_settings, notifications)
--  13  Column-safety (ALTER for pre-existing DBs)
--  14  Indexes
--  15  Triggers (updated_at)
--  16  Views
--  17  Seed data
-- ==============================================================================

-- ==============================================================================
-- 1. EXTENSIONS & UTILITY FUNCTIONS
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- 2. ENUM TYPES
-- ==============================================================================

-- Helper: each block is wrapped in DO $$ so duplicates are silently ignored.

DO $$ BEGIN CREATE TYPE shipment_type       AS ENUM ('IMPORT','EXPORT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE shipment_status     AS ENUM ('PENDING','CONFIRMED','IN_PROGRESS','DELIVERED','COMPLETED','CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE container_size      AS ENUM ('20','40','40HC','45');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE container_type      AS ENUM ('DRY','HIGH_CUBE','REEFER','TANK','FLAT_RACK','OPEN_TOP');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE container_state     AS ENUM ('LOADED','EMPTY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE customs_status      AS ENUM ('PENDING','HOLD','RELEASED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE location_type       AS ENUM ('VESSEL','TERMINAL','IN_TRANSIT','CUSTOMER','YARD');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE order_type          AS ENUM ('IMPORT','EXPORT','REPO','EMPTY_RETURN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE order_status        AS ENUM ('PENDING','READY','DISPATCHED','IN_PROGRESS','DELIVERED','COMPLETED','HOLD','CANCELLED','FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE billing_status      AS ENUM ('UNBILLED','BILLED','PAID');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE trip_type           AS ENUM (
    'LIVE_LOAD','LIVE_UNLOAD','DROP_HOOK_SAME','DROP_HOOK_DIFF','DROP_ONLY',
    'STREET_TURN','DUAL_TRANSACTION','BOBTAIL','EMPTY_PICKUP','EMPTY_RETURN',
    'PRE_PULL','TRANSLOAD');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE trip_status         AS ENUM (
    'DRAFT','PLANNED','ASSIGNED','DISPATCHED','EN_ROUTE',
    'IN_PROGRESS','COMPLETED','CANCELLED','FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE stop_type           AS ENUM ('PICKUP','DELIVERY','RETURN','YARD');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE activity_type       AS ENUM (
    'PICKUP_LOADED','PICKUP_EMPTY','DELIVER_LOADED','DROP_LOADED','DROP_EMPTY',
    'HOOK_EMPTY','LIVE_LOAD','LIVE_UNLOAD','CHASSIS_PICKUP','CHASSIS_DROP',
    'FUEL_STOP','SCALE','CUSTOMS_EXAM');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE stop_status         AS ENUM (
    'PENDING','EN_ROUTE','ARRIVED','IN_PROGRESS','COMPLETED','FAILED','SKIPPED','CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE appointment_type    AS ENUM ('PICKUP','RETURN','DROP_OFF','DUAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE appointment_status  AS ENUM (
    'REQUESTED','PENDING','CONFIRMED','CANCELLED','COMPLETED','MISSED','RESCHEDULED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE exception_type      AS ENUM (
    'FAILED_PICKUP','FAILED_DELIVERY','TERMINAL_CLOSED','EQUIPMENT_FAILURE',
    'CHASSIS_UNAVAILABLE','CONTAINER_UNAVAILABLE','CUSTOMS_HOLD','WEATHER_DELAY',
    'DRIVER_UNAVAILABLE','ACCIDENT','ROAD_CLOSURE','APPOINTMENT_MISSED',
    'WEIGHT_ISSUE','DAMAGE','OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE exception_severity  AS ENUM ('LOW','MEDIUM','HIGH','CRITICAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE exception_status    AS ENUM (
    'OPEN','ACKNOWLEDGED','IN_PROGRESS','RESOLVED','CLOSED','CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Extend enums if types already exist without new values (pre-existing DB)
DO $$ BEGIN ALTER TYPE shipment_status ADD VALUE IF NOT EXISTS 'CONFIRMED';  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE shipment_status ADD VALUE IF NOT EXISTS 'DELIVERED';  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE container_size  ADD VALUE IF NOT EXISTS '40HC';       EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE stop_status     ADD VALUE IF NOT EXISTS 'CANCELLED';  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ==============================================================================
-- 3. CORE REFERENCE TABLES
-- ==============================================================================

CREATE TABLE IF NOT EXISTS customers (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name VARCHAR(255) NOT NULL,
    code        VARCHAR(50)  UNIQUE NOT NULL,
    type        VARCHAR(50)  NOT NULL DEFAULT 'both',
    address     VARCHAR(500),
    city        VARCHAR(100),
    state       VARCHAR(50),
    zip         VARCHAR(20),
    phone       VARCHAR(50),
    email       VARCHAR(255),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS steamship_lines (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(255) NOT NULL,
    code        VARCHAR(10)  UNIQUE NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ports (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(255) NOT NULL,
    code        VARCHAR(10)  UNIQUE NOT NULL,
    city        VARCHAR(100),
    state       VARCHAR(50),
    country     VARCHAR(100) DEFAULT 'USA',
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS locations (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255) NOT NULL,
    type            VARCHAR(50)  NOT NULL,
    address         VARCHAR(500),
    city            VARCHAR(100),
    state           VARCHAR(50),
    zip             VARCHAR(20),
    latitude        DECIMAL(10,8),
    longitude       DECIMAL(11,8),
    contact_name    VARCHAR(255),
    contact_phone   VARCHAR(50),
    notes           TEXT,
    geofence_id     UUID,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 4. ORDER-SERVICE TABLES
-- ==============================================================================

CREATE SEQUENCE IF NOT EXISTS order_number_seq START 1;

CREATE TABLE IF NOT EXISTS shipments (
    id                        UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    type                      shipment_type   NOT NULL,
    reference_number          VARCHAR(100)    NOT NULL,
    -- FK columns — nullable so the Loads-page wizard can omit lookup UUIDs
    customer_id               UUID            REFERENCES customers(id),
    steamship_line_id         UUID            REFERENCES steamship_lines(id),
    port_id                   UUID            REFERENCES ports(id),
    terminal_id               UUID            REFERENCES locations(id),
    -- Original detail columns
    vessel_name               VARCHAR(255),
    voyage_number             VARCHAR(50),
    vessel_eta                TIMESTAMPTZ,
    vessel_ata                TIMESTAMPTZ,
    last_free_day             DATE,
    port_cutoff               TIMESTAMPTZ,
    doc_cutoff                TIMESTAMPTZ,
    earliest_return_date      DATE,
    consignee_id              UUID            REFERENCES locations(id),
    shipper_id                UUID            REFERENCES locations(id),
    empty_return_location_id  UUID            REFERENCES locations(id),
    empty_pickup_location_id  UUID            REFERENCES locations(id),
    status                    shipment_status NOT NULL DEFAULT 'PENDING',
    special_instructions      TEXT,
    -- Text columns populated by the Loads-page wizard (when FK UUIDs are not used)
    customer_name             VARCHAR(255),
    steamship_line            VARCHAR(255),
    booking_number            VARCHAR(100),
    bill_of_lading            VARCHAR(100),
    vessel                    VARCHAR(255),
    voyage                    VARCHAR(50),
    terminal_name             VARCHAR(255),
    trip_type                 VARCHAR(50),
    chassis_required          BOOLEAN         DEFAULT TRUE,
    chassis_pool              VARCHAR(100),
    chassis_size              VARCHAR(20),
    delivery_address          VARCHAR(500),
    delivery_city             VARCHAR(100),
    delivery_state            VARCHAR(50),
    delivery_zip              VARCHAR(20),
    created_at                TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at                TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    UNIQUE(steamship_line_id, reference_number)
);

CREATE TABLE IF NOT EXISTS containers (
    id                       UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
    shipment_id              UUID             NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
    container_number         VARCHAR(15)      NOT NULL,
    size                     container_size   NOT NULL,
    type                     container_type   NOT NULL DEFAULT 'DRY',
    seal_number              VARCHAR(50),
    weight_lbs               INTEGER          DEFAULT 0,
    is_hazmat                BOOLEAN          DEFAULT FALSE,
    hazmat_class             VARCHAR(20),
    un_number                VARCHAR(20),
    is_overweight            BOOLEAN          DEFAULT FALSE,
    is_reefer                BOOLEAN          DEFAULT FALSE,
    reefer_temp_setpoint     DECIMAL(5,2),
    commodity                VARCHAR(255),
    customs_status           customs_status   NOT NULL DEFAULT 'PENDING',
    customs_hold_type        VARCHAR(100),
    terminal_available_date  TIMESTAMPTZ,
    current_state            container_state  NOT NULL DEFAULT 'LOADED',
    current_location_type    location_type    NOT NULL DEFAULT 'VESSEL',
    current_location_id      UUID             REFERENCES locations(id),
    created_at               TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
    id                       UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number             VARCHAR(20)     UNIQUE NOT NULL,
    container_id             UUID            NOT NULL REFERENCES containers(id),
    shipment_id              UUID            NOT NULL REFERENCES shipments(id),
    type                     order_type      NOT NULL,
    move_type                VARCHAR(50),
    customer_reference       VARCHAR(100),
    pickup_location_id       UUID            REFERENCES locations(id),
    delivery_location_id     UUID            REFERENCES locations(id),
    return_location_id       UUID            REFERENCES locations(id),
    requested_pickup_date    TIMESTAMPTZ,
    requested_delivery_date  TIMESTAMPTZ,
    status                   order_status    NOT NULL DEFAULT 'PENDING',
    billing_status           billing_status  NOT NULL DEFAULT 'UNBILLED',
    linked_order_id          UUID            REFERENCES orders(id),
    special_instructions     TEXT,
    created_at               TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    deleted_at               TIMESTAMPTZ
);

-- ─── Loads (operational dispatch entity — one row per container assignment) ──

CREATE TABLE IF NOT EXISTS loads (
    id                         UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    load_number                VARCHAR(30)     UNIQUE NOT NULL,
    order_id                   UUID            REFERENCES orders(id),
    customer_id                UUID            NOT NULL REFERENCES customers(id),
    container_number           VARCHAR(15),
    container_size             VARCHAR(10),
    container_type             VARCHAR(20)     DEFAULT 'DRY',
    weight_lbs                 INTEGER,
    is_hazmat                  BOOLEAN         DEFAULT FALSE,
    is_overweight              BOOLEAN         DEFAULT FALSE,
    requires_triaxle           BOOLEAN         DEFAULT FALSE,
    move_type                  VARCHAR(20),
    terminal                   VARCHAR(255),
    terminal_status            VARCHAR(20),
    last_free_day              DATE,
    hold_customs               BOOLEAN         DEFAULT FALSE,
    hold_freight               BOOLEAN         DEFAULT FALSE,
    hold_usda                  BOOLEAN         DEFAULT FALSE,
    hold_tmf                   BOOLEAN         DEFAULT FALSE,
    in_yard                    BOOLEAN         DEFAULT FALSE,
    yard_location              VARCHAR(255),
    yard_in_date               TIMESTAMPTZ,
    status                     VARCHAR(30)     NOT NULL DEFAULT 'TRACKING',
    total_charges              DECIMAL(10,2)   DEFAULT 0,
    invoice_id                 UUID,
    terminal_appointment_date  DATE,
    terminal_appointment_time  VARCHAR(10),
    delivery_appointment_date  DATE,
    delivery_appointment_time  VARCHAR(10),
    created_at                 TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at                 TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- ─── Load charges (line-item charges attached to a load) ─────────────────────

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

-- ─── Load notes (internal / customer-visible notes on a load) ────────────────

CREATE TABLE IF NOT EXISTS load_notes (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    load_id                 UUID        NOT NULL REFERENCES loads(id) ON DELETE CASCADE,
    author_name             VARCHAR(100) NOT NULL,
    author_type             VARCHAR(20)  DEFAULT 'INTERNAL',
    message                 TEXT         NOT NULL,
    visible_to_customer     BOOLEAN      DEFAULT FALSE,
    created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─── Load activity log (append-only audit trail) ────────────────────────────

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

-- ─── Street turns (import→export container reuse) ───────────────────────────

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
-- 5. DRIVER-SERVICE TABLES
-- ==============================================================================

CREATE TABLE IF NOT EXISTS drivers (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_number         VARCHAR(20),
    first_name              VARCHAR(100) NOT NULL,
    last_name               VARCHAR(100) NOT NULL,
    email                   VARCHAR(255),
    phone                   VARCHAR(50),
    status                  VARCHAR(20)  NOT NULL DEFAULT 'AVAILABLE',
    license_number          VARCHAR(50),
    license_state           VARCHAR(10),
    license_class           VARCHAR(10),
    license_expiration      TIMESTAMPTZ,
    has_twic                BOOLEAN      DEFAULT FALSE,
    twic_expiration         TIMESTAMPTZ,
    has_hazmat_endorsement  BOOLEAN      DEFAULT FALSE,
    hazmat_expiration       TIMESTAMPTZ,
    has_tanker_endorsement  BOOLEAN      DEFAULT FALSE,
    has_doubles_endorsement BOOLEAN      DEFAULT FALSE,
    medical_card_expiration TIMESTAMPTZ,
    current_latitude        DECIMAL(10,8) DEFAULT 0,
    current_longitude       DECIMAL(11,8) DEFAULT 0,
    current_tractor_id      UUID,
    current_trip_id         UUID,
    available_drive_mins    INTEGER      DEFAULT 660,
    available_duty_mins     INTEGER      DEFAULT 840,
    available_cycle_mins    INTEGER      DEFAULT 4200,
    last_hos_update         TIMESTAMPTZ,
    home_terminal_id        UUID         REFERENCES locations(id),
    hire_date               TIMESTAMPTZ,
    termination_date        TIMESTAMPTZ,
    app_user_id             UUID,
    device_token            VARCHAR(500),
    is_active               BOOLEAN      DEFAULT TRUE,
    created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hos_logs (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id       UUID        NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
    status          VARCHAR(30) NOT NULL,
    start_time      TIMESTAMPTZ NOT NULL,
    end_time        TIMESTAMPTZ,
    duration_mins   INTEGER     DEFAULT 0,
    location        VARCHAR(200),
    latitude        DECIMAL(10,8),
    longitude       DECIMAL(11,8),
    odometer        INTEGER     DEFAULT 0,
    engine_hours    DECIMAL(8,2) DEFAULT 0,
    trip_id         UUID,
    tractor_id      UUID,
    notes           VARCHAR(500),
    source          VARCHAR(20) DEFAULT 'eld',
    edit_reason     VARCHAR(200),
    original_log_id UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hos_violations (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id       UUID        NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
    type            VARCHAR(30) NOT NULL,
    occurred_at     TIMESTAMPTZ NOT NULL,
    duration_mins   INTEGER     DEFAULT 0,
    description     VARCHAR(500),
    acknowledged    BOOLEAN     DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS compliance_alerts (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id       UUID        NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
    type            VARCHAR(50) NOT NULL,
    severity        VARCHAR(20) NOT NULL DEFAULT 'warning',
    message         VARCHAR(500) NOT NULL,
    expires_at      TIMESTAMPTZ,
    days_until      INTEGER,
    acknowledged    BOOLEAN     DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS driver_documents (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id       UUID        NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
    type            VARCHAR(50) NOT NULL,
    file_name       VARCHAR(255) NOT NULL,
    file_path       VARCHAR(500) NOT NULL,
    file_size       INTEGER,
    mime_type       VARCHAR(100),
    expires_at      TIMESTAMPTZ,
    uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    uploaded_by     VARCHAR(100)
);

-- ==============================================================================
-- 6. EQUIPMENT-SERVICE TABLES
-- ==============================================================================

CREATE TABLE IF NOT EXISTS chassis_pools (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(100) NOT NULL,
    code            VARCHAR(20)  UNIQUE NOT NULL,
    provider_name   VARCHAR(200),
    api_endpoint    VARCHAR(500),
    api_key         VARCHAR(500),
    daily_rate_20   DECIMAL(6,2) DEFAULT 0,
    daily_rate_40   DECIMAL(6,2) DEFAULT 0,
    daily_rate_45   DECIMAL(6,2) DEFAULT 0,
    split_day_rate  DECIMAL(6,2) DEFAULT 0,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tractors (
    id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_number           VARCHAR(50) UNIQUE NOT NULL,
    vin                   VARCHAR(20),
    make                  VARCHAR(50),
    model                 VARCHAR(100),
    year                  INTEGER,
    status                VARCHAR(30) NOT NULL DEFAULT 'AVAILABLE',
    ownership_type        VARCHAR(30) DEFAULT 'company',
    owner_operator_id     UUID,
    current_driver_id     UUID        REFERENCES drivers(id),
    current_trip_id       UUID,
    current_latitude      DECIMAL(10,8) DEFAULT 0,
    current_longitude     DECIMAL(11,8) DEFAULT 0,
    current_odometer      INTEGER     DEFAULT 0,
    current_engine_hours  DECIMAL(8,2) DEFAULT 0,
    gross_weight          INTEGER     DEFAULT 0,
    fuel_type             VARCHAR(20) DEFAULT 'diesel',
    fuel_capacity         INTEGER     DEFAULT 0,
    sleeper_type          VARCHAR(20) DEFAULT 'day_cab',
    axle_config           VARCHAR(20) DEFAULT 'tandem',
    eld_provider          VARCHAR(50),
    eld_device_id         VARCHAR(100),
    license_plate         VARCHAR(20),
    license_state         VARCHAR(10),
    registration_exp      TIMESTAMPTZ,
    insurance_policy      VARCHAR(100),
    insurance_exp         TIMESTAMPTZ,
    last_inspection_date  TIMESTAMPTZ,
    next_inspection_date  TIMESTAMPTZ,
    home_terminal_id      UUID        REFERENCES locations(id),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chassis (
    id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    chassis_number        VARCHAR(50) NOT NULL,
    status                VARCHAR(30) NOT NULL DEFAULT 'AVAILABLE',
    owner_type            VARCHAR(20) DEFAULT 'pool',
    pool_id               UUID        REFERENCES chassis_pools(id),
    pool_name             VARCHAR(100),
    steamship_line_id     UUID        REFERENCES steamship_lines(id),
    size                  VARCHAR(10) DEFAULT '40',
    type                  VARCHAR(30) DEFAULT 'standard',
    max_weight            INTEGER     DEFAULT 0,
    tare_weight           INTEGER     DEFAULT 0,
    num_axles             INTEGER     DEFAULT 2,
    current_location_id   UUID        REFERENCES locations(id),
    current_location_type VARCHAR(30),
    current_trip_id       UUID,
    current_container_id  UUID,
    last_latitude         DECIMAL(10,8),
    last_longitude        DECIMAL(11,8),
    last_position_time    TIMESTAMPTZ,
    license_plate         VARCHAR(20),
    license_state         VARCHAR(10),
    registration_exp      TIMESTAMPTZ,
    last_inspection_date  TIMESTAMPTZ,
    fhwa_inspection_exp   TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(chassis_number, pool_id)
);

CREATE TABLE IF NOT EXISTS trailers (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    trailer_number      VARCHAR(50) UNIQUE NOT NULL,
    vin                 VARCHAR(20),
    type                VARCHAR(30) NOT NULL DEFAULT 'dry_van',
    status              VARCHAR(30) NOT NULL DEFAULT 'AVAILABLE',
    length              INTEGER     DEFAULT 53,
    max_weight          INTEGER     DEFAULT 0,
    tare_weight         INTEGER     DEFAULT 0,
    is_reefer           BOOLEAN     DEFAULT FALSE,
    reefer_unit         VARCHAR(50),
    current_driver_id   UUID        REFERENCES drivers(id),
    current_trip_id     UUID,
    current_location_id UUID        REFERENCES locations(id),
    license_plate       VARCHAR(20),
    license_state       VARCHAR(10),
    registration_exp    TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chassis_usage (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    chassis_id      UUID        NOT NULL REFERENCES chassis(id) ON DELETE CASCADE,
    trip_id         UUID,
    pool_id         UUID        REFERENCES chassis_pools(id),
    pickup_time     TIMESTAMPTZ NOT NULL,
    pickup_location VARCHAR(200),
    return_time     TIMESTAMPTZ,
    return_location VARCHAR(200),
    usage_days      INTEGER     DEFAULT 0,
    is_split_day    BOOLEAN     DEFAULT FALSE,
    daily_rate      DECIMAL(6,2) DEFAULT 0,
    total_cost      DECIMAL(8,2) DEFAULT 0,
    invoice_id      UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS maintenance_records (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    equipment_type  VARCHAR(20) NOT NULL,
    equipment_id    UUID        NOT NULL,
    type            VARCHAR(30) NOT NULL DEFAULT 'preventive',
    description     VARCHAR(500),
    status          VARCHAR(30) NOT NULL DEFAULT 'scheduled',
    scheduled_date  TIMESTAMPTZ,
    completed_date  TIMESTAMPTZ,
    odometer        INTEGER     DEFAULT 0,
    engine_hours    DECIMAL(8,2) DEFAULT 0,
    vendor_name     VARCHAR(200),
    labor_cost      DECIMAL(8,2) DEFAULT 0,
    parts_cost      DECIMAL(8,2) DEFAULT 0,
    total_cost      DECIMAL(8,2) DEFAULT 0,
    notes           TEXT,
    created_by      VARCHAR(100),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fuel_transactions (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tractor_id          UUID        NOT NULL REFERENCES tractors(id),
    driver_id           UUID        NOT NULL REFERENCES drivers(id),
    trip_id             UUID,
    transaction_date    TIMESTAMPTZ NOT NULL,
    location            VARCHAR(200),
    fuel_type           VARCHAR(20) DEFAULT 'diesel',
    gallons             DECIMAL(8,2) NOT NULL,
    price_per_gallon    DECIMAL(6,4) NOT NULL,
    total_amount        DECIMAL(8,2) NOT NULL,
    odometer            INTEGER     DEFAULT 0,
    payment_method      VARCHAR(20) DEFAULT 'fuel_card',
    card_number         VARCHAR(30),
    receipt_number      VARCHAR(50),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS equipment_inspections (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    equipment_type      VARCHAR(20) NOT NULL,
    equipment_id        UUID        NOT NULL,
    driver_id           UUID        NOT NULL REFERENCES drivers(id),
    trip_id             UUID,
    inspection_type     VARCHAR(20) NOT NULL DEFAULT 'pre_trip',
    inspection_date     TIMESTAMPTZ NOT NULL,
    odometer            INTEGER     DEFAULT 0,
    location            VARCHAR(200),
    latitude            DECIMAL(10,8),
    longitude           DECIMAL(11,8),
    has_defects         BOOLEAN     DEFAULT FALSE,
    is_safe_to_operate  BOOLEAN     DEFAULT TRUE,
    driver_signature    VARCHAR(500),
    signed_at           TIMESTAMPTZ,
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inspection_defects (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    inspection_id   UUID        NOT NULL REFERENCES equipment_inspections(id) ON DELETE CASCADE,
    category        VARCHAR(50) NOT NULL,
    description     VARCHAR(500) NOT NULL,
    severity        VARCHAR(20) NOT NULL DEFAULT 'minor',
    photo_path      VARCHAR(500),
    resolved        BOOLEAN     DEFAULT FALSE,
    resolved_at     TIMESTAMPTZ,
    resolved_by     VARCHAR(100),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Yard inventory (tracks what's physically in the yard) ──────────────────

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
-- 7. DISPATCH-SERVICE TABLES
-- ==============================================================================

CREATE SEQUENCE IF NOT EXISTS trip_number_seq START 1;

CREATE TABLE IF NOT EXISTS trips (
    id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_number            VARCHAR(20) UNIQUE NOT NULL,
    type                   trip_type   NOT NULL,
    status                 trip_status NOT NULL DEFAULT 'PLANNED',
    driver_id              UUID        REFERENCES drivers(id),
    tractor_id             UUID        REFERENCES tractors(id),
    chassis_id             UUID        REFERENCES chassis(id),
    current_stop_sequence  INTEGER     DEFAULT 1,
    planned_start_time     TIMESTAMPTZ,
    actual_start_time      TIMESTAMPTZ,
    planned_end_time       TIMESTAMPTZ,
    actual_end_time        TIMESTAMPTZ,
    estimated_duration_mins INTEGER    DEFAULT 0,
    total_miles            DECIMAL(10,2) DEFAULT 0,
    completed_miles        DECIMAL(10,2) DEFAULT 0,
    revenue                DECIMAL(10,2) DEFAULT 0,
    cost                   DECIMAL(10,2) DEFAULT 0,
    is_street_turn         BOOLEAN     DEFAULT FALSE,
    is_dual_transaction    BOOLEAN     DEFAULT FALSE,
    linked_trip_id         UUID        REFERENCES trips(id),
    load_id                UUID        REFERENCES loads(id),
    shipment_id            UUID,
    container_id           UUID        REFERENCES containers(id),
    chassis_number         VARCHAR(50),
    created_by             VARCHAR(100),
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at             TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS trip_stops (
    id                     UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id                UUID          NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    sequence               INTEGER       NOT NULL,
    type                   stop_type     NOT NULL,
    activity               activity_type NOT NULL,
    status                 stop_status   NOT NULL DEFAULT 'PENDING',
    location_id            UUID          NOT NULL REFERENCES locations(id),
    container_id           UUID,
    container_number       VARCHAR(15),
    order_id               UUID,
    appointment_time       TIMESTAMPTZ,
    appointment_number     VARCHAR(50),
    appointment_window_mins INTEGER      DEFAULT 60,
    planned_arrival        TIMESTAMPTZ,
    estimated_arrival      TIMESTAMPTZ,
    actual_arrival         TIMESTAMPTZ,
    actual_departure       TIMESTAMPTZ,
    estimated_duration_mins INTEGER      DEFAULT 30,
    actual_duration_mins   INTEGER       DEFAULT 0,
    free_time_mins         INTEGER       DEFAULT 120,
    detention_start_time   TIMESTAMPTZ,
    detention_mins         INTEGER       DEFAULT 0,
    chassis_in_id          UUID,
    chassis_out_id         UUID,
    container_in_id        UUID,
    container_out_id       UUID,
    gate_ticket_number     VARCHAR(50),
    seal_number            VARCHAR(50),
    failure_reason         TEXT,
    notes                  TEXT,
    created_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    deleted_at             TIMESTAMPTZ,
    UNIQUE(trip_id, sequence)
);

-- ─── Trip legs (multi-leg dispatch routing — pickup/delivery/return segments) ─

CREATE TABLE IF NOT EXISTS trip_legs (
    id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id               UUID        NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    leg_number            INTEGER     NOT NULL DEFAULT 1,
    leg_type              VARCHAR(30) NOT NULL,
    location_type         VARCHAR(30),
    location_name         VARCHAR(255),
    location_address      VARCHAR(255),
    location_city         VARCHAR(100),
    location_state        VARCHAR(10),
    location_zip          VARCHAR(10),
    scheduled_time        TIMESTAMPTZ,
    actual_arrival        TIMESTAMPTZ,
    actual_departure      TIMESTAMPTZ,
    status                VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    waiting_time_minutes  INTEGER     DEFAULT 0,
    detention_charged     BOOLEAN     DEFAULT FALSE,
    pod_captured          BOOLEAN     DEFAULT FALSE,
    notes                 TEXT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trip_orders (
    trip_id   UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    order_id  UUID NOT NULL,
    PRIMARY KEY (trip_id, order_id)
);

CREATE TABLE IF NOT EXISTS stop_documents (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    stop_id         UUID        NOT NULL REFERENCES trip_stops(id) ON DELETE CASCADE,
    document_type   VARCHAR(50) NOT NULL,
    file_name       VARCHAR(255) NOT NULL,
    file_path       VARCHAR(500) NOT NULL,
    file_size       INTEGER,
    mime_type       VARCHAR(100),
    uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION generate_trip_number()
RETURNS VARCHAR(20) AS $$
DECLARE
    seq_val INTEGER;
BEGIN
    SELECT nextval('trip_number_seq') INTO seq_val;
    RETURN 'TRP-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(seq_val::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- 8. APPOINTMENT & EXCEPTION TABLES
-- ==============================================================================

CREATE TABLE IF NOT EXISTS terminal_appointments (
    id                      UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id                UUID                NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    trip_id                 UUID                REFERENCES trips(id) ON DELETE SET NULL,
    terminal_id             UUID                NOT NULL,
    terminal_name           VARCHAR(200),
    type                    appointment_type   NOT NULL,
    status                  appointment_status NOT NULL DEFAULT 'REQUESTED',
    container_id            UUID,
    container_number        VARCHAR(11),
    chassis_id              UUID,
    driver_id               UUID,
    tractor_id              UUID,
    requested_time          TIMESTAMPTZ         NOT NULL,
    confirmed_time          TIMESTAMPTZ,
    window_start_time       TIMESTAMPTZ         NOT NULL,
    window_end_time         TIMESTAMPTZ         NOT NULL,
    confirmation_number     VARCHAR(50),
    gate_number             VARCHAR(20),
    lane_number             VARCHAR(20),
    special_instructions    TEXT,
    actual_arrival_time     TIMESTAMPTZ,
    actual_completion_time  TIMESTAMPTZ,
    gate_ticket_number      VARCHAR(50),
    cancellation_reason     TEXT,
    rescheduled_from        UUID                REFERENCES terminal_appointments(id),
    requested_by            VARCHAR(100)        NOT NULL,
    requested_by_id         UUID,
    confirmed_by            VARCHAR(100),
    terminal_reference      VARCHAR(100),
    metadata                JSONB,
    created_at              TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ         NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS terminal_gate_hours (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    terminal_id     UUID        NOT NULL,
    day_of_week     INTEGER     CHECK (day_of_week >= 0 AND day_of_week <= 6),
    open_time       TIME        NOT NULL,
    close_time      TIME        NOT NULL,
    is_holiday      BOOLEAN     DEFAULT FALSE,
    is_closed       BOOLEAN     DEFAULT FALSE,
    special_date    DATE,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS exceptions (
    id                      UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id                 UUID               NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    stop_id                 UUID               REFERENCES trip_stops(id) ON DELETE SET NULL,
    order_id                UUID               REFERENCES orders(id) ON DELETE SET NULL,
    container_id            UUID,
    driver_id               UUID,
    type                    exception_type     NOT NULL,
    severity                exception_severity NOT NULL,
    status                  exception_status   NOT NULL DEFAULT 'OPEN',
    title                   VARCHAR(200)       NOT NULL,
    description             TEXT,
    location_id             UUID,
    latitude                DECIMAL(10,8),
    longitude               DECIMAL(11,8),
    reported_by             VARCHAR(100)       NOT NULL,
    reported_by_id          UUID,
    assigned_to             VARCHAR(100),
    assigned_to_id          UUID,
    resolution              TEXT,
    resolution_notes        TEXT,
    estimated_delay_mins    INTEGER,
    actual_delay_mins       INTEGER,
    financial_impact        DECIMAL(10,2),
    requires_reschedule     BOOLEAN            DEFAULT FALSE,
    requires_reassignment   BOOLEAN            DEFAULT FALSE,
    photo_urls              TEXT[],
    document_urls           TEXT[],
    metadata                JSONB,
    occurred_at             TIMESTAMPTZ        NOT NULL,
    acknowledged_at         TIMESTAMPTZ,
    resolved_at             TIMESTAMPTZ,
    created_at              TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ        NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS exception_comments (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    exception_id    UUID        NOT NULL REFERENCES exceptions(id) ON DELETE CASCADE,
    author_id       UUID,
    author_name     VARCHAR(100) NOT NULL,
    comment         TEXT        NOT NULL,
    is_internal     BOOLEAN     DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS exception_history (
    id              UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
    exception_id    UUID             NOT NULL REFERENCES exceptions(id) ON DELETE CASCADE,
    from_status     exception_status,
    to_status       exception_status NOT NULL,
    changed_by      VARCHAR(100),
    changed_by_id   UUID,
    notes           TEXT,
    changed_at      TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 9. EMODAL-INTEGRATION TABLES
-- ==============================================================================

CREATE TABLE IF NOT EXISTS published_containers (
    container_number  VARCHAR(11)  NOT NULL PRIMARY KEY,
    terminal_code     VARCHAR(20)  NOT NULL,
    port_code         VARCHAR(10),
    published_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    last_status_at    TIMESTAMPTZ,
    current_status    VARCHAR(30)  CHECK (current_status IN (
        'MANIFESTED','DISCHARGED','IN_YARD','AVAILABLE','ON_HOLD',
        'CUSTOMS_HOLD','GATE_IN','GATE_OUT','RELEASED','LOADED','NOT_MANIFESTED'
    )),
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gate_fees (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    container_id     UUID,
    container_number VARCHAR(11) NOT NULL,
    order_id         UUID,
    terminal_id      UUID,
    terminal_code    VARCHAR(20),
    type             VARCHAR(30) NOT NULL CHECK (type IN (
        'DEMURRAGE','STORAGE','GATE_FEE','EXTENDED_GATE_FEE','PER_DIEM','CUSTOMS_EXAM'
    )),
    amount           DECIMAL(10,2) NOT NULL DEFAULT 0,
    currency         VARCHAR(3)  NOT NULL DEFAULT 'USD',
    billable_to      VARCHAR(100),
    status           VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN (
        'PENDING','ASSESSED','PAID','WAIVED','DISPUTED'
    )),
    emodal_fee_id    VARCHAR(100),
    assessed_at      TIMESTAMPTZ,
    paid_at          TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Container tracking (eModal sync cache — container status snapshots) ─────

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
-- 10. BILLING-SERVICE TABLES
-- ==============================================================================

CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START 1;
CREATE SEQUENCE IF NOT EXISTS settlement_number_seq START 1;

CREATE TABLE IF NOT EXISTS invoices (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number  VARCHAR(30) UNIQUE NOT NULL,
    customer_id     UUID        NOT NULL REFERENCES customers(id),
    customer_name   VARCHAR(255),
    shipment_id     UUID        REFERENCES shipments(id),
    status          VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    invoice_date    TIMESTAMPTZ NOT NULL,
    due_date        TIMESTAMPTZ,
    sent_date       TIMESTAMPTZ,
    paid_date       TIMESTAMPTZ,
    subtotal        DECIMAL(12,2) DEFAULT 0,
    tax_rate        DECIMAL(5,4) DEFAULT 0,
    tax_amount      DECIMAL(10,2) DEFAULT 0,
    total_amount    DECIMAL(12,2) DEFAULT 0,
    paid_amount     DECIMAL(12,2) DEFAULT 0,
    balance_due     DECIMAL(12,2) DEFAULT 0,
    payment_terms   VARCHAR(20),
    currency        VARCHAR(3)  DEFAULT 'USD',
    po_number       VARCHAR(100),
    bol_number      VARCHAR(100),
    notes           TEXT,
    qb_invoice_id   VARCHAR(100),
    synced_at       TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by      VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS invoice_line_items (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id      UUID        NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    trip_id         UUID,
    order_id        UUID,
    charge_type     VARCHAR(30) NOT NULL,
    description     VARCHAR(500),
    quantity        DECIMAL(8,2) DEFAULT 1,
    unit_price      DECIMAL(10,2) DEFAULT 0,
    amount          DECIMAL(10,2) DEFAULT 0,
    container_number VARCHAR(15),
    trip_number     VARCHAR(20),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payments (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id      UUID        NOT NULL REFERENCES invoices(id),
    payment_number  VARCHAR(30),
    payment_date    TIMESTAMPTZ NOT NULL,
    amount          DECIMAL(12,2) NOT NULL,
    payment_method  VARCHAR(30) DEFAULT 'check',
    reference_number VARCHAR(100),
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by      VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS rates (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id         UUID        NOT NULL REFERENCES customers(id),
    name                VARCHAR(100) NOT NULL,
    description         VARCHAR(500),
    rate_type           VARCHAR(20) NOT NULL DEFAULT 'flat',
    origin_type         VARCHAR(20) DEFAULT 'any',
    origin_id           UUID,
    origin_zone         VARCHAR(50),
    destination_type    VARCHAR(20) DEFAULT 'any',
    destination_id      UUID,
    destination_zone    VARCHAR(50),
    container_size      VARCHAR(10) DEFAULT 'any',
    container_type      VARCHAR(20) DEFAULT 'any',
    base_rate           DECIMAL(10,2) NOT NULL,
    fuel_surcharge      DECIMAL(8,2) DEFAULT 0,
    fuel_surcharge_type VARCHAR(20) DEFAULT 'percent',
    effective_date      TIMESTAMPTZ NOT NULL,
    expiration_date     TIMESTAMPTZ,
    is_active           BOOLEAN     DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS accessorial_rates (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id     UUID        REFERENCES customers(id),
    charge_type     VARCHAR(30) NOT NULL,
    description     VARCHAR(500),
    rate_type       VARCHAR(20) NOT NULL DEFAULT 'flat',
    rate            DECIMAL(8,2) NOT NULL,
    min_charge      DECIMAL(8,2) DEFAULT 0,
    max_charge      DECIMAL(8,2),
    free_time       INTEGER     DEFAULT 0,
    is_active       BOOLEAN     DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS driver_settlements (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id           UUID        NOT NULL REFERENCES drivers(id),
    settlement_number   VARCHAR(30) UNIQUE NOT NULL,
    period_start        TIMESTAMPTZ NOT NULL,
    period_end          TIMESTAMPTZ NOT NULL,
    status              VARCHAR(20) NOT NULL DEFAULT 'draft',
    gross_earnings      DECIMAL(12,2) DEFAULT 0,
    total_miles         DECIMAL(10,2) DEFAULT 0,
    total_trips         INTEGER     DEFAULT 0,
    fuel_deductions     DECIMAL(10,2) DEFAULT 0,
    advance_deductions  DECIMAL(10,2) DEFAULT 0,
    other_deductions    DECIMAL(10,2) DEFAULT 0,
    total_deductions    DECIMAL(10,2) DEFAULT 0,
    net_pay             DECIMAL(12,2) DEFAULT 0,
    paid_date           TIMESTAMPTZ,
    payment_method      VARCHAR(30),
    payment_reference   VARCHAR(100),
    notes               TEXT,
    approved_by         VARCHAR(100),
    approved_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS settlement_line_items (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    settlement_id   UUID        NOT NULL REFERENCES driver_settlements(id) ON DELETE CASCADE,
    trip_id         UUID,
    trip_number     VARCHAR(20),
    trip_date       TIMESTAMPTZ,
    type            VARCHAR(30) NOT NULL,
    description     VARCHAR(500),
    miles           DECIMAL(10,2) DEFAULT 0,
    rate            DECIMAL(8,2) DEFAULT 0,
    amount          DECIMAL(10,2) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS driver_pay_rates (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id       UUID        NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
    pay_type        VARCHAR(30) NOT NULL,
    rate            DECIMAL(8,4) NOT NULL,
    percentage_of   VARCHAR(30),
    container_size  VARCHAR(10),
    trip_type       VARCHAR(30),
    effective_date  TIMESTAMPTZ NOT NULL,
    expiration_date TIMESTAMPTZ,
    is_active       BOOLEAN     DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Driver pay rate profiles (pay-structure templates) ──────────────────────

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

-- ─── Lane rates (origin→destination route pricing) ───────────────────────────

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

-- ─── Driver rate assignments (profile → driver mapping) ──────────────────────

CREATE TABLE IF NOT EXISTS driver_rate_assignments (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id       UUID        UNIQUE NOT NULL REFERENCES drivers(id),
    rate_profile_id UUID        NOT NULL REFERENCES driver_rate_profiles(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 11. TRACKING-SERVICE TABLES
-- ==============================================================================

CREATE TABLE IF NOT EXISTS location_records (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id       UUID        NOT NULL REFERENCES drivers(id),
    tractor_id      UUID,
    trip_id         UUID,
    latitude        DECIMAL(10,8) NOT NULL,
    longitude       DECIMAL(11,8) NOT NULL,
    speed_mph       DECIMAL(6,2) DEFAULT 0,
    heading         DECIMAL(5,2) DEFAULT 0,
    accuracy_meters DECIMAL(8,2),
    source          VARCHAR(20) DEFAULT 'eld',
    recorded_at     TIMESTAMPTZ NOT NULL,
    received_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS milestones (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id         UUID        NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    stop_id         UUID,
    type            VARCHAR(50) NOT NULL,
    occurred_at     TIMESTAMPTZ NOT NULL,
    latitude        DECIMAL(10,8),
    longitude       DECIMAL(11,8),
    location_id     UUID        REFERENCES locations(id),
    location_name   VARCHAR(200),
    container_id    UUID,
    container_number VARCHAR(15),
    metadata        JSONB,
    source          VARCHAR(20) DEFAULT 'auto',
    recorded_by     VARCHAR(100),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS geofences (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id         UUID        REFERENCES locations(id),
    name                VARCHAR(200) NOT NULL,
    type                VARCHAR(20) NOT NULL DEFAULT 'circle',
    center_latitude     DECIMAL(10,8),
    center_longitude    DECIMAL(11,8),
    radius_meters       DECIMAL(10,2),
    polygon             JSONB,
    is_active           BOOLEAN     DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 12. ADMIN TABLES
-- ==============================================================================

-- ─── Company settings (singleton row keyed by id = 'default') ────────────────

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

-- ─── Notifications (dashboard + channel notifications) ───────────────────────

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
-- 13. COLUMN SAFETY — backfill columns on pre-existing tables
-- ==============================================================================
-- When this file is run against a database that already contains tables from
-- per-service migrations (order-service, dispatch-service) or 001, those tables
-- may be missing columns that were added later.  CREATE TABLE IF NOT EXISTS
-- skips re-creation, so we ALTER TABLE here to guarantee every column the
-- indexes below need actually exists before we try to index it.
-- ==============================================================================

DO $$
BEGIN
    -- ── customers ─────────────────────────────────────────────────────────
    -- Migration 003 renamed customers.name → company_name.  On a pre-existing
    -- DB the old column name may still be in place; rename it before the seed
    -- INSERT that references company_name.
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'name') THEN
        ALTER TABLE customers RENAME COLUMN name TO company_name;
    END IF;

    -- ── shipments ─────────────────────────────────────────────────────────
    -- FK columns that may be missing if table was created by an older migration
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shipments' AND column_name = 'customer_id') THEN
        ALTER TABLE shipments ADD COLUMN customer_id UUID REFERENCES customers(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shipments' AND column_name = 'steamship_line_id') THEN
        ALTER TABLE shipments ADD COLUMN steamship_line_id UUID REFERENCES steamship_lines(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shipments' AND column_name = 'port_id') THEN
        ALTER TABLE shipments ADD COLUMN port_id UUID REFERENCES ports(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shipments' AND column_name = 'terminal_id') THEN
        ALTER TABLE shipments ADD COLUMN terminal_id UUID REFERENCES locations(id);
    END IF;
    -- Wizard text columns (migration 004 §16)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shipments' AND column_name = 'customer_name') THEN
        ALTER TABLE shipments ADD COLUMN customer_name VARCHAR(255);
        ALTER TABLE shipments ADD COLUMN steamship_line VARCHAR(255);
        ALTER TABLE shipments ADD COLUMN booking_number VARCHAR(100);
        ALTER TABLE shipments ADD COLUMN bill_of_lading VARCHAR(100);
        ALTER TABLE shipments ADD COLUMN vessel VARCHAR(255);
        ALTER TABLE shipments ADD COLUMN voyage VARCHAR(50);
        ALTER TABLE shipments ADD COLUMN terminal_name VARCHAR(255);
        ALTER TABLE shipments ADD COLUMN trip_type VARCHAR(50);
        ALTER TABLE shipments ADD COLUMN chassis_required BOOLEAN DEFAULT TRUE;
        ALTER TABLE shipments ADD COLUMN chassis_pool VARCHAR(100);
        ALTER TABLE shipments ADD COLUMN chassis_size VARCHAR(20);
        ALTER TABLE shipments ADD COLUMN delivery_address VARCHAR(500);
        ALTER TABLE shipments ADD COLUMN delivery_city VARCHAR(100);
        ALTER TABLE shipments ADD COLUMN delivery_state VARCHAR(50);
        ALTER TABLE shipments ADD COLUMN delivery_zip VARCHAR(20);
    END IF;

    -- ── orders ────────────────────────────────────────────────────────────
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'deleted_at') THEN
        ALTER TABLE orders ADD COLUMN deleted_at TIMESTAMPTZ;
    END IF;

    -- ── containers ────────────────────────────────────────────────────────
    -- Columns that may be missing if table was created by an older migration
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'containers' AND column_name = 'current_state') THEN
        ALTER TABLE containers ADD COLUMN current_state container_state NOT NULL DEFAULT 'LOADED';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'containers' AND column_name = 'current_location_type') THEN
        ALTER TABLE containers ADD COLUMN current_location_type location_type NOT NULL DEFAULT 'VESSEL';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'containers' AND column_name = 'current_location_id') THEN
        ALTER TABLE containers ADD COLUMN current_location_id UUID REFERENCES locations(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'containers' AND column_name = 'customs_status') THEN
        ALTER TABLE containers ADD COLUMN customs_status customs_status NOT NULL DEFAULT 'PENDING';
    END IF;

    -- ── drivers ───────────────────────────────────────────────────────────
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'is_active') THEN
        ALTER TABLE drivers ADD COLUMN is_active BOOLEAN DEFAULT TRUE;
        UPDATE drivers SET is_active = (status IN ('AVAILABLE', 'ACTIVE', 'ON_DUTY'));
    END IF;

    -- ── trips ─────────────────────────────────────────────────────────────
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trips' AND column_name = 'revenue') THEN
        ALTER TABLE trips ADD COLUMN revenue DECIMAL(10,2) DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trips' AND column_name = 'cost') THEN
        ALTER TABLE trips ADD COLUMN cost DECIMAL(10,2) DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trips' AND column_name = 'deleted_at') THEN
        ALTER TABLE trips ADD COLUMN deleted_at TIMESTAMPTZ;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trips' AND column_name = 'load_id') THEN
        ALTER TABLE trips ADD COLUMN load_id UUID REFERENCES loads(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trips' AND column_name = 'shipment_id') THEN
        ALTER TABLE trips ADD COLUMN shipment_id UUID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trips' AND column_name = 'container_id') THEN
        ALTER TABLE trips ADD COLUMN container_id UUID REFERENCES containers(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trips' AND column_name = 'chassis_number') THEN
        ALTER TABLE trips ADD COLUMN chassis_number VARCHAR(50);
    END IF;

    -- ── loads ─────────────────────────────────────────────────────────────
    -- Appointment columns added in 002 but not in 004
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'loads' AND column_name = 'terminal_appointment_date') THEN
        ALTER TABLE loads ADD COLUMN terminal_appointment_date DATE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'loads' AND column_name = 'terminal_appointment_time') THEN
        ALTER TABLE loads ADD COLUMN terminal_appointment_time VARCHAR(10);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'loads' AND column_name = 'delivery_appointment_date') THEN
        ALTER TABLE loads ADD COLUMN delivery_appointment_date DATE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'loads' AND column_name = 'delivery_appointment_time') THEN
        ALTER TABLE loads ADD COLUMN delivery_appointment_time VARCHAR(10);
    END IF;

    -- ── trip_stops ────────────────────────────────────────────────────────
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trip_stops' AND column_name = 'estimated_arrival') THEN
        ALTER TABLE trip_stops ADD COLUMN estimated_arrival TIMESTAMPTZ;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trip_stops' AND column_name = 'deleted_at') THEN
        ALTER TABLE trip_stops ADD COLUMN deleted_at TIMESTAMPTZ;
    END IF;

    -- ── terminal_appointments ────────────────────────────────────────────
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'terminal_appointments' AND column_name = 'terminal_id') THEN
        ALTER TABLE terminal_appointments ADD COLUMN terminal_id UUID;
    END IF;
END $$;

-- Make shipments FK columns nullable on pre-existing DBs (migration 004 §16)
DO $$ BEGIN ALTER TABLE shipments ALTER COLUMN customer_id       DROP NOT NULL; EXCEPTION WHEN undefined_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE shipments ALTER COLUMN steamship_line_id DROP NOT NULL; EXCEPTION WHEN undefined_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE shipments ALTER COLUMN port_id           DROP NOT NULL; EXCEPTION WHEN undefined_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE shipments ALTER COLUMN terminal_id       DROP NOT NULL; EXCEPTION WHEN undefined_column THEN NULL; END $$;

-- ==============================================================================
-- 14. INDEXES
-- ==============================================================================

-- customers
CREATE INDEX IF NOT EXISTS idx_customers_code    ON customers(code);
CREATE INDEX IF NOT EXISTS idx_customers_company_name ON customers(company_name);

-- shipments
CREATE INDEX IF NOT EXISTS idx_shipments_customer        ON shipments(customer_id);
CREATE INDEX IF NOT EXISTS idx_shipments_status          ON shipments(status);
CREATE INDEX IF NOT EXISTS idx_shipments_type            ON shipments(type);
CREATE INDEX IF NOT EXISTS idx_shipments_lfd             ON shipments(last_free_day);
CREATE INDEX IF NOT EXISTS idx_shipments_reference       ON shipments(reference_number);
CREATE INDEX IF NOT EXISTS idx_shipments_terminal        ON shipments(terminal_id);
CREATE INDEX IF NOT EXISTS idx_shipments_ssl             ON shipments(steamship_line_id);

-- containers
CREATE INDEX IF NOT EXISTS idx_containers_shipment       ON containers(shipment_id);
CREATE INDEX IF NOT EXISTS idx_containers_number         ON containers(container_number);
CREATE INDEX IF NOT EXISTS idx_containers_customs        ON containers(customs_status);
CREATE INDEX IF NOT EXISTS idx_containers_state          ON containers(current_state);

-- orders
CREATE INDEX IF NOT EXISTS idx_orders_container          ON orders(container_id);
CREATE INDEX IF NOT EXISTS idx_orders_shipment           ON orders(shipment_id);
CREATE INDEX IF NOT EXISTS idx_orders_status             ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_type               ON orders(type);
CREATE INDEX IF NOT EXISTS idx_orders_billing_status     ON orders(billing_status);
CREATE INDEX IF NOT EXISTS idx_orders_pickup_date        ON orders(requested_pickup_date) WHERE requested_pickup_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_delivery_date      ON orders(requested_delivery_date) WHERE requested_delivery_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_active             ON orders(status) WHERE status NOT IN ('COMPLETED','CANCELLED');
CREATE INDEX IF NOT EXISTS idx_orders_not_deleted        ON orders(deleted_at) WHERE deleted_at IS NULL;

-- drivers
CREATE INDEX IF NOT EXISTS idx_drivers_status            ON drivers(status);
CREATE INDEX IF NOT EXISTS idx_drivers_employee_number   ON drivers(employee_number);
CREATE INDEX IF NOT EXISTS idx_drivers_last_name         ON drivers(last_name);

-- tractors
CREATE INDEX IF NOT EXISTS idx_tractors_status           ON tractors(status);
CREATE INDEX IF NOT EXISTS idx_tractors_driver           ON tractors(current_driver_id) WHERE current_driver_id IS NOT NULL;

-- chassis
CREATE INDEX IF NOT EXISTS idx_chassis_status            ON chassis(status);
CREATE INDEX IF NOT EXISTS idx_chassis_pool              ON chassis(pool_id) WHERE pool_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chassis_number            ON chassis(chassis_number);

-- trips
CREATE INDEX IF NOT EXISTS idx_trips_status              ON trips(status);
CREATE INDEX IF NOT EXISTS idx_trips_type                ON trips(type);
CREATE INDEX IF NOT EXISTS idx_trips_driver              ON trips(driver_id) WHERE driver_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trips_tractor             ON trips(tractor_id) WHERE tractor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trips_planned_start       ON trips(planned_start_time) WHERE planned_start_time IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trips_active              ON trips(status) WHERE status IN ('DISPATCHED','EN_ROUTE','IN_PROGRESS');
CREATE INDEX IF NOT EXISTS idx_trips_not_deleted         ON trips(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_trips_created_at          ON trips(created_at);
CREATE INDEX IF NOT EXISTS idx_trips_street_turn         ON trips(is_street_turn) WHERE is_street_turn = TRUE;

-- trip_stops
CREATE INDEX IF NOT EXISTS idx_trip_stops_trip           ON trip_stops(trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_stops_status         ON trip_stops(status);
CREATE INDEX IF NOT EXISTS idx_trip_stops_location       ON trip_stops(location_id);
CREATE INDEX IF NOT EXISTS idx_trip_stops_container      ON trip_stops(container_id) WHERE container_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trip_stops_order          ON trip_stops(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trip_stops_sequence       ON trip_stops(trip_id, sequence);

-- trip_orders
CREATE INDEX IF NOT EXISTS idx_trip_orders_order         ON trip_orders(order_id);

-- terminal_appointments
CREATE INDEX IF NOT EXISTS idx_appointments_order        ON terminal_appointments(order_id);
CREATE INDEX IF NOT EXISTS idx_appointments_trip         ON terminal_appointments(trip_id) WHERE trip_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_appointments_terminal     ON terminal_appointments(terminal_id);
CREATE INDEX IF NOT EXISTS idx_appointments_status       ON terminal_appointments(status);
CREATE INDEX IF NOT EXISTS idx_appointments_window       ON terminal_appointments(window_start_time);

-- exceptions
CREATE INDEX IF NOT EXISTS idx_exceptions_trip           ON exceptions(trip_id);
CREATE INDEX IF NOT EXISTS idx_exceptions_status         ON exceptions(status);
CREATE INDEX IF NOT EXISTS idx_exceptions_severity       ON exceptions(severity);
CREATE INDEX IF NOT EXISTS idx_exceptions_type           ON exceptions(type);
CREATE INDEX IF NOT EXISTS idx_exceptions_occurred       ON exceptions(occurred_at);
CREATE INDEX IF NOT EXISTS idx_exceptions_open           ON exceptions(status) WHERE status IN ('OPEN','ACKNOWLEDGED','IN_PROGRESS');

-- exception_comments / history
CREATE INDEX IF NOT EXISTS idx_exc_comments_exc          ON exception_comments(exception_id);
CREATE INDEX IF NOT EXISTS idx_exc_history_exc           ON exception_history(exception_id);

-- eModal
CREATE INDEX IF NOT EXISTS idx_pc_status                 ON published_containers(current_status) WHERE current_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pc_terminal               ON published_containers(terminal_code);
CREATE INDEX IF NOT EXISTS idx_gf_container_number       ON gate_fees(container_number);
CREATE INDEX IF NOT EXISTS idx_gf_status                 ON gate_fees(status);
CREATE INDEX IF NOT EXISTS idx_gf_type                   ON gate_fees(type);

-- billing
CREATE INDEX IF NOT EXISTS idx_invoices_customer         ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status           ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_date             ON invoices(invoice_date);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice     ON invoice_line_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_invoice          ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_rates_customer            ON rates(customer_id);
CREATE INDEX IF NOT EXISTS idx_rates_active              ON rates(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_settlements_driver        ON driver_settlements(driver_id);
CREATE INDEX IF NOT EXISTS idx_settlements_status        ON driver_settlements(status);
CREATE INDEX IF NOT EXISTS idx_settlement_items_settle   ON settlement_line_items(settlement_id);
CREATE INDEX IF NOT EXISTS idx_pay_rates_driver          ON driver_pay_rates(driver_id);

-- driver service
CREATE INDEX IF NOT EXISTS idx_hos_logs_driver           ON hos_logs(driver_id);
CREATE INDEX IF NOT EXISTS idx_hos_logs_start            ON hos_logs(start_time);
CREATE INDEX IF NOT EXISTS idx_hos_violations_driver     ON hos_violations(driver_id);
CREATE INDEX IF NOT EXISTS idx_compliance_driver         ON compliance_alerts(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_docs_driver        ON driver_documents(driver_id);

-- equipment service
CREATE INDEX IF NOT EXISTS idx_chassis_usage_chassis     ON chassis_usage(chassis_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_equip         ON maintenance_records(equipment_id);
CREATE INDEX IF NOT EXISTS idx_fuel_tractor              ON fuel_transactions(tractor_id);
CREATE INDEX IF NOT EXISTS idx_fuel_driver               ON fuel_transactions(driver_id);
CREATE INDEX IF NOT EXISTS idx_inspections_equip         ON equipment_inspections(equipment_id);
CREATE INDEX IF NOT EXISTS idx_defects_inspection        ON inspection_defects(inspection_id);

-- tracking
CREATE INDEX IF NOT EXISTS idx_loc_records_driver        ON location_records(driver_id);
CREATE INDEX IF NOT EXISTS idx_loc_records_trip          ON location_records(trip_id) WHERE trip_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_loc_records_time          ON location_records(recorded_at);
CREATE INDEX IF NOT EXISTS idx_milestones_trip           ON milestones(trip_id);
CREATE INDEX IF NOT EXISTS idx_milestones_type           ON milestones(type);
CREATE INDEX IF NOT EXISTS idx_geofences_location        ON geofences(location_id) WHERE location_id IS NOT NULL;

-- loads
CREATE INDEX IF NOT EXISTS idx_loads_customer       ON loads(customer_id);
CREATE INDEX IF NOT EXISTS idx_loads_status         ON loads(status);
CREATE INDEX IF NOT EXISTS idx_loads_container      ON loads(container_number);
CREATE INDEX IF NOT EXISTS idx_loads_lfd            ON loads(last_free_day);
CREATE INDEX IF NOT EXISTS idx_loads_created        ON loads(created_at DESC);

-- load sub-tables
CREATE INDEX IF NOT EXISTS idx_load_charges_load    ON load_charges(load_id);
CREATE INDEX IF NOT EXISTS idx_load_notes_load      ON load_notes(load_id);
CREATE INDEX IF NOT EXISTS idx_load_activity_load   ON load_activity_log(load_id);

-- street turns
CREATE INDEX IF NOT EXISTS idx_street_turns_status  ON street_turns(status);
CREATE INDEX IF NOT EXISTS idx_street_turns_import  ON street_turns(import_load_id);
CREATE INDEX IF NOT EXISTS idx_street_turns_export  ON street_turns(export_load_id);

-- yard inventory
CREATE INDEX IF NOT EXISTS idx_yard_inv_load        ON yard_inventory(load_id) WHERE load_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_yard_inv_status      ON yard_inventory(status);

-- trip_legs
CREATE INDEX IF NOT EXISTS idx_trip_legs_trip       ON trip_legs(trip_id);

-- trips (new columns)
CREATE INDEX IF NOT EXISTS idx_trips_load           ON trips(load_id) WHERE load_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trips_shipment       ON trips(shipment_id) WHERE shipment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trips_container2     ON trips(container_id) WHERE container_id IS NOT NULL;

-- container tracking
CREATE INDEX IF NOT EXISTS idx_container_tracking_num ON container_tracking(container_number);

-- driver rate tables
CREATE INDEX IF NOT EXISTS idx_driver_assignments_driver ON driver_rate_assignments(driver_id);

-- notifications
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(created_at DESC) WHERE read_at IS NULL;

-- ==============================================================================
-- 15. TRIGGERS (updated_at)
-- ==============================================================================

-- Macro to create trigger if not exists — applied to every table with updated_at
DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOR tbl IN VALUES
        ('customers'),('steamship_lines'),('ports'),('locations'),
        ('shipments'),('containers'),('orders'),
        ('loads'),('street_turns'),('yard_inventory'),
        ('drivers'),('tractors'),('chassis'),('chassis_pools'),('trailers'),
        ('trips'),('trip_stops'),('trip_legs'),
        ('terminal_appointments'),('terminal_gate_hours'),('exceptions'),
        ('published_containers'),('gate_fees'),('container_tracking'),
        ('invoices'),('rates'),('accessorial_rates'),
        ('driver_settlements'),('driver_pay_rates'),
        ('driver_rate_profiles'),('lane_rates'),('driver_rate_assignments'),
        ('maintenance_records'),
        ('company_settings'),
        ('geofences')
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_trigger
            WHERE tgname = 'trg_' || tbl || '_updated_at'
        ) THEN
            EXECUTE format(
                'CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON %I '
                'FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()',
                tbl, tbl
            );
        END IF;
    END LOOP;
END $$;

-- ==============================================================================
-- 16. VIEWS
-- ==============================================================================

CREATE OR REPLACE VIEW v_active_orders AS
SELECT
    o.id, o.order_number, o.type, o.status, o.billing_status,
    o.customer_reference, o.requested_pickup_date, o.requested_delivery_date,
    c.container_number, c.size AS container_size, c.type AS container_type,
    c.weight_lbs, c.is_hazmat, c.is_overweight, c.customs_status,
    o.created_at, o.updated_at
FROM orders o
LEFT JOIN containers c ON o.container_id = c.id
WHERE o.status NOT IN ('COMPLETED','CANCELLED')
  AND o.deleted_at IS NULL;

CREATE OR REPLACE VIEW v_active_trips AS
SELECT
    t.id, t.trip_number, t.type, t.status, t.driver_id,
    t.planned_start_time, t.planned_end_time, t.total_miles,
    t.estimated_duration_mins, t.is_street_turn, t.is_dual_transaction,
    COUNT(ts.id) AS total_stops,
    COUNT(ts.id) FILTER (WHERE ts.status = 'COMPLETED') AS completed_stops,
    t.created_at, t.updated_at
FROM trips t
LEFT JOIN trip_stops ts ON t.id = ts.trip_id
WHERE t.status IN ('DISPATCHED','EN_ROUTE','IN_PROGRESS')
  AND t.deleted_at IS NULL
GROUP BY t.id;

CREATE OR REPLACE VIEW v_open_exceptions AS
SELECT
    e.id, e.trip_id, e.type, e.severity, e.status, e.title,
    e.occurred_at, e.estimated_delay_mins,
    e.requires_reschedule, e.requires_reassignment,
    e.reported_by, e.assigned_to,
    COUNT(ec.id) AS comment_count,
    e.created_at
FROM exceptions e
LEFT JOIN exception_comments ec ON e.id = ec.exception_id
WHERE e.status IN ('OPEN','ACKNOWLEDGED','IN_PROGRESS')
GROUP BY e.id;

CREATE OR REPLACE VIEW v_upcoming_appointments AS
SELECT
    a.id, a.order_id, a.terminal_id, a.type, a.status,
    a.container_number, a.window_start_time, a.window_end_time,
    a.confirmation_number,
    o.order_number, o.customer_reference,
    a.created_at
FROM terminal_appointments a
LEFT JOIN orders o ON a.order_id = o.id
WHERE a.status IN ('REQUESTED','PENDING','CONFIRMED')
  AND a.window_start_time > NOW()
ORDER BY a.window_start_time;

CREATE OR REPLACE VIEW v_dispatch_board AS
SELECT
    t.id, t.trip_number, t.type, t.status, t.driver_id, t.tractor_id,
    t.planned_start_time, t.estimated_duration_mins, t.total_miles,
    t.is_street_turn, t.is_dual_transaction,
    COUNT(ts.id) AS stop_count,
    ARRAY_AGG(DISTINCT ts.container_number) FILTER (WHERE ts.container_number IS NOT NULL) AS containers
FROM trips t
LEFT JOIN trip_stops ts ON t.id = ts.trip_id
WHERE t.deleted_at IS NULL
GROUP BY t.id;

CREATE OR REPLACE VIEW v_street_turn_candidates AS
SELECT
    t.id AS trip_id, t.trip_number,
    ts.container_id, ts.container_number,
    ts.location_id AS delivery_location_id,
    ts.appointment_time AS delivery_time,
    t.driver_id
FROM trips t
JOIN trip_stops ts ON t.id = ts.trip_id
WHERE t.type IN ('LIVE_UNLOAD','DROP_HOOK_SAME','DROP_HOOK_DIFF')
  AND t.status NOT IN ('COMPLETED','CANCELLED','FAILED')
  AND ts.type = 'DELIVERY'
  AND ts.activity IN ('LIVE_UNLOAD','DROP_LOADED');

-- ==============================================================================
-- 17. SEED DATA
-- ==============================================================================

-- --- Steamship lines ---
INSERT INTO steamship_lines (id, name, code) VALUES
    ('550e8400-e29b-41d4-a716-446655440001', 'Maersk',       'MAEU'),
    ('550e8400-e29b-41d4-a716-446655440002', 'MSC',          'MSCU'),
    ('550e8400-e29b-41d4-a716-446655440003', 'CMA CGM',      'CMDU'),
    ('550e8400-e29b-41d4-a716-446655440004', 'COSCO',        'COSU'),
    ('550e8400-e29b-41d4-a716-446655440005', 'Hapag-Lloyd',  'HLCU'),
    ('550e8400-e29b-41d4-a716-446655440006', 'ONE',          'ONEY'),
    ('550e8400-e29b-41d4-a716-446655440007', 'Evergreen',    'EGLV'),
    ('550e8400-e29b-41d4-a716-446655440008', 'Yang Ming',    'YMLU'),
    ('550e8400-e29b-41d4-a716-446655440009', 'HMM',          'HDMU'),
    ('550e8400-e29b-41d4-a716-446655440010', 'ZIM',          'ZIMU')
ON CONFLICT (code) DO NOTHING;

-- --- Ports ---
INSERT INTO ports (id, name, code, city, state) VALUES
    ('660e8400-e29b-41d4-a716-446655440001', 'Port of Los Angeles',  'USLAX', 'Los Angeles', 'CA'),
    ('660e8400-e29b-41d4-a716-446655440002', 'Port of Long Beach',   'USLGB', 'Long Beach',  'CA'),
    ('660e8400-e29b-41d4-a716-446655440003', 'Port of Oakland',      'USOAK', 'Oakland',      'CA'),
    ('660e8400-e29b-41d4-a716-446655440004', 'Port of Seattle',      'USSEA', 'Seattle',      'WA'),
    ('660e8400-e29b-41d4-a716-446655440005', 'Port of Tacoma',       'USTAC', 'Tacoma',       'WA'),
    ('660e8400-e29b-41d4-a716-446655440006', 'Port of Houston',      'USHST', 'Houston',      'TX'),
    ('660e8400-e29b-41d4-a716-446655440007', 'Port of Savannah',     'USSAV', 'Savannah',     'GA'),
    ('660e8400-e29b-41d4-a716-446655440008', 'Port of Charleston',   'USCHA', 'Charleston',   'SC'),
    ('660e8400-e29b-41d4-a716-446655440009', 'Port of Norfolk',      'USNFK', 'Norfolk',      'VA'),
    ('660e8400-e29b-41d4-a716-446655440010', 'Port of New York',     'USNYC', 'New York',     'NY')
ON CONFLICT (code) DO NOTHING;

-- --- Locations (terminals + yards + warehouses) ---
INSERT INTO locations (id, name, type, city, state, latitude, longitude) VALUES
    -- LA/LB Terminals
    ('770e8400-e29b-41d4-a716-446655440001', 'APM Terminals (POLA)',      'terminal',  'Los Angeles', 'CA',  33.73980, -118.26140),
    ('770e8400-e29b-41d4-a716-446655440002', 'TraPac (POLA)',             'terminal',  'Los Angeles', 'CA',  33.75120, -118.27010),
    ('770e8400-e29b-41d4-a716-446655440003', 'Fenix Marine (POLA)',       'terminal',  'Los Angeles', 'CA',  33.74560, -118.25890),
    ('770e8400-e29b-41d4-a716-446655440004', 'LBCT (POLB)',               'terminal',  'Long Beach',  'CA',  33.76540, -118.21340),
    ('770e8400-e29b-41d4-a716-446655440005', 'PCT (POLB)',                'terminal',  'Long Beach',  'CA',  33.75890, -118.20450),
    ('770e8400-e29b-41d4-a716-446655440006', 'TTI (POLB)',                'terminal',  'Long Beach',  'CA',  33.76230, -118.21870),
    ('770e8400-e29b-41d4-a716-446655440007', 'ITS (POLB)',                'terminal',  'Long Beach',  'CA',  33.75980, -118.20980),
    ('770e8400-e29b-41d4-a716-446655440008', 'Yusen Terminals (POLA)',    'terminal',  'Los Angeles', 'CA',  33.75340, -118.26780),
    -- Yards
    ('770e8400-e29b-41d4-a716-446655440011', 'DrayMaster Main Yard',     'yard',      'Carson',      'CA',  33.79200, -118.28700),
    ('770e8400-e29b-41d4-a716-446655440012', 'DrayMaster South Yard',    'yard',      'Wilmington',  'CA',  33.77800, -118.23500),
    -- Warehouses / Consignees
    ('770e8400-e29b-41d4-a716-446655440021', 'Amazon Fulfillment Center', 'warehouse', 'Moreno Valley','CA', 33.73500, -117.23000),
    ('770e8400-e29b-41d4-a716-446655440022', 'Walmart DC #7',             'warehouse', 'Perris',      'CA',  33.79100, -117.24300),
    ('770e8400-e29b-41d4-a716-446655440023', 'Target DC - Rancho Cucamonga','warehouse','Rancho Cucamonga','CA',34.10600,-117.55400),
    ('770e8400-e29b-41d4-a716-446655440024', 'Home Depot Dist Center',   'warehouse', 'Rialto',      'CA',  34.10200, -117.47200),
    ('770e8400-e29b-41d4-a716-446655440025', 'Samsung Logistics Hub',   'warehouse', 'Ontario',     'CA',  34.06400, -117.56100)
ON CONFLICT (id) DO NOTHING;

-- --- Customers ---
INSERT INTO customers (id, company_name, code, type, city, state, email, phone) VALUES
    ('880e8400-e29b-41d4-a716-446655440001', 'Acme Imports LLC',           'ACME',  'both',     'Los Angeles',    'CA', 'billing@acmeimports.com',     '(310) 555-0101'),
    ('880e8400-e29b-41d4-a716-446655440002', 'Pacific Goods Corp',         'PCFG',  'both',     'Long Beach',     'CA', 'ap@pacificgoods.com',         '(562) 555-0202'),
    ('880e8400-e29b-41d4-a716-446655440003', 'Golden Gate Trading',        'GGTD',  'both',     'Oakland',        'CA', 'accounts@goldengate.com',     '(510) 555-0303'),
    ('880e8400-e29b-41d4-a716-446655440004', 'Harbor Freight Forwarding',  'HRB',   'both',     'Houston',        'TX', 'billing@harborfreight.com',   '(713) 555-0404'),
    ('880e8400-e29b-41d4-a716-446655440005', 'Summit Logistics Inc',      'SMMT',  'both',     'Savannah',       'GA', 'ops@summiitlogistics.com',    '(912) 555-0505'),
    ('880e8400-e29b-41d4-a716-446655440006', 'Coastal Container Co',       'CSTL',  'both',     'Charleston',     'SC', 'billing@coastalcontainer.com','(843) 555-0606'),
    ('880e8400-e29b-41d4-a716-446655440007', 'TechFlow Electronics',       'TCHF',  'both',     'Los Angeles',    'CA', 'ap@techflow.com',            '(213) 555-0707'),
    ('880e8400-e29b-41d4-a716-446655440008', 'NutriFoods International',   'NTRF',  'both',     'Long Beach',     'CA', 'billing@nutrifoods.com',     '(310) 555-0808')
ON CONFLICT (code) DO NOTHING;

-- --- Chassis Pools ---
INSERT INTO chassis_pools (id, name, code, provider_name, daily_rate_20, daily_rate_40, daily_rate_45, split_day_rate) VALUES
    ('990e8400-e29b-41d4-a716-446655440001', 'DCLI Pool',          'DCLI',  'Direct ChassisLink Inc',  22.50, 28.50, 32.00, 14.25),
    ('990e8400-e29b-41d4-a716-446655440002', 'TRAC Intermodal',    'TRAC',  'TRAC Intermodal LLC',     20.00, 26.00, 30.00, 13.00),
    ('990e8400-e29b-41d4-a716-446655440003', 'Flexi-Van Pool',     'FLXV',  'Flexi-Van Leasing',       18.00, 24.00, 28.00, 12.00)
ON CONFLICT (code) DO NOTHING;

-- --- Drivers ---
INSERT INTO drivers (id, employee_number, first_name, last_name, status, has_twic, license_number, license_state,
                     current_latitude, current_longitude, available_drive_mins, available_duty_mins) VALUES
    ('aa0e8400-e29b-41d4-a716-446655440001', 'DRV-001', 'James',   'Rodriguez', 'AVAILABLE', TRUE,  'CA-DL-1234567', 'CA', 33.7920, -118.2870, 660, 840),
    ('aa0e8400-e29b-41d4-a716-446655440002', 'DRV-002', 'Maria',   'Gonzalez',  'AVAILABLE', TRUE,  'CA-DL-2345678', 'CA', 33.7780, -118.2350, 540, 720),
    ('aa0e8400-e29b-41d4-a716-446655440003', 'DRV-003', 'Robert',  'Johnson',   'ON_DUTY',   TRUE,  'CA-DL-3456789', 'CA', 33.8100, -118.1800, 480, 660),
    ('aa0e8400-e29b-41d4-a716-446655440004', 'DRV-004', 'Sarah',   'Williams',  'AVAILABLE', FALSE, 'CA-DL-4567890', 'CA', 33.7650, -118.2500, 660, 840),
    ('aa0e8400-e29b-41d4-a716-446655440005', 'DRV-005', 'David',   'Chen',      'AVAILABLE', TRUE,  'CA-DL-5678901', 'CA', 33.7920, -118.2870, 600, 780)
ON CONFLICT (id) DO NOTHING;

-- --- Tractors ---
INSERT INTO tractors (id, unit_number, make, model, year, status, ownership_type, current_driver_id,
                      current_latitude, current_longitude, current_odometer, fuel_type) VALUES
    ('bb0e8400-e29b-41d4-a716-446655440001', 'TRK-0101', 'Freightliner', 'Cascadia',  2022, 'AVAILABLE', 'company', 'aa0e8400-e29b-41d4-a716-446655440001', 33.7920, -118.2870, 124500, 'diesel'),
    ('bb0e8400-e29b-41d4-a716-446655440002', 'TRK-0102', 'Freightliner', 'Cascadia',  2023, 'AVAILABLE', 'company', 'aa0e8400-e29b-41d4-a716-446655440002', 33.7780, -118.2350,  58200, 'diesel'),
    ('bb0e8400-e29b-41d4-a716-446655440003', 'TRK-0103', 'Kenworth',     'T680',      2021, 'IN_USE',    'company', 'aa0e8400-e29b-41d4-a716-446655440003', 33.8100, -118.1800, 198000, 'diesel'),
    ('bb0e8400-e29b-41d4-a716-446655440004', 'TRK-0104', 'Peterbilt',    '579',       2022, 'AVAILABLE', 'company', 'aa0e8400-e29b-41d4-a716-446655440004', 33.7650, -118.2500,  87300, 'diesel'),
    ('bb0e8400-e29b-41d4-a716-446655440005', 'TRK-0105', 'Freightliner', 'Cascadia',  2023, 'AVAILABLE', 'company', 'aa0e8400-e29b-41d4-a716-446655440005', 33.7920, -118.2870,  42100, 'diesel')
ON CONFLICT (unit_number) DO NOTHING;

-- --- Chassis ---
INSERT INTO chassis (id, chassis_number, status, owner_type, pool_id, pool_name, size, type, max_weight) VALUES
    ('cc0e8400-e29b-41d4-a716-446655440001', 'CHS-4401', 'AVAILABLE', 'pool', '990e8400-e29b-41d4-a716-446655440001', 'DCLI Pool',       '40', 'standard',  80000),
    ('cc0e8400-e29b-41d4-a716-446655440002', 'CHS-4402', 'AVAILABLE', 'pool', '990e8400-e29b-41d4-a716-446655440001', 'DCLI Pool',       '40', 'standard',  80000),
    ('cc0e8400-e29b-41d4-a716-446655440003', 'CHS-4403', 'AVAILABLE', 'pool', '990e8400-e29b-41d4-a716-446655440002', 'TRAC Intermodal', '40', 'standard',  80000),
    ('cc0e8400-e29b-41d4-a716-446655440004', 'CHS-2201', 'AVAILABLE', 'pool', '990e8400-e29b-41d4-a716-446655440001', 'DCLI Pool',       '20', 'standard',  60000),
    ('cc0e8400-e29b-41d4-a716-446655440005', 'CHS-4501', 'AVAILABLE', 'pool', '990e8400-e29b-41d4-a716-446655440003', 'Flexi-Van Pool',  '45', 'extendable', 80000)
ON CONFLICT (id) DO NOTHING;

-- --- Gate hours for seeded terminals (Mon-Fri 06:00-18:00, Sat-Sun closed) ---
INSERT INTO terminal_gate_hours (terminal_id, day_of_week, open_time, close_time, is_closed)
SELECT loc_id, dow, '06:00:00'::TIME, '18:00:00'::TIME, FALSE
FROM (VALUES
    ('770e8400-e29b-41d4-a716-446655440001'::UUID),
    ('770e8400-e29b-41d4-a716-446655440002'),
    ('770e8400-e29b-41d4-a716-446655440003'),
    ('770e8400-e29b-41d4-a716-446655440004'),
    ('770e8400-e29b-41d4-a716-446655440005'),
    ('770e8400-e29b-41d4-a716-446655440006'),
    ('770e8400-e29b-41d4-a716-446655440007'),
    ('770e8400-e29b-41d4-a716-446655440008')
) AS t(loc_id)
CROSS JOIN (VALUES (1),(2),(3),(4),(5)) AS d(dow)
WHERE NOT EXISTS (
    SELECT 1 FROM terminal_gate_hours tgh
    WHERE tgh.terminal_id = t.loc_id AND tgh.day_of_week = d.dow
);

INSERT INTO terminal_gate_hours (terminal_id, day_of_week, open_time, close_time, is_closed)
SELECT loc_id, dow, '00:00:00'::TIME, '00:00:00'::TIME, TRUE
FROM (VALUES
    ('770e8400-e29b-41d4-a716-446655440001'::UUID),
    ('770e8400-e29b-41d4-a716-446655440002'),
    ('770e8400-e29b-41d4-a716-446655440003'),
    ('770e8400-e29b-41d4-a716-446655440004'),
    ('770e8400-e29b-41d4-a716-446655440005'),
    ('770e8400-e29b-41d4-a716-446655440006'),
    ('770e8400-e29b-41d4-a716-446655440007'),
    ('770e8400-e29b-41d4-a716-446655440008')
) AS t(loc_id)
CROSS JOIN (VALUES (0),(6)) AS d(dow)
WHERE NOT EXISTS (
    SELECT 1 FROM terminal_gate_hours tgh
    WHERE tgh.terminal_id = t.loc_id AND tgh.day_of_week = d.dow
);

-- --- Sample shipment + container + order chain ---
INSERT INTO shipments (id, type, reference_number, customer_id, steamship_line_id, port_id, terminal_id,
                       vessel_name, voyage_number, vessel_eta, last_free_day, status)
VALUES
    ('dd0e8400-e29b-41d4-a716-446655440001', 'IMPORT', 'BKG-20260115-001',
     '880e8400-e29b-41d4-a716-446655440001',
     '550e8400-e29b-41d4-a716-446655440002',
     '660e8400-e29b-41d4-a716-446655440001',
     '770e8400-e29b-41d4-a716-446655440001',
     'MSC FLAMINIA', 'VO-2601150', '2026-01-15 06:00:00+00', '2026-02-05', 'IN_PROGRESS'),
    ('dd0e8400-e29b-41d4-a716-446655440002', 'IMPORT', 'BKG-20260118-002',
     '880e8400-e29b-41d4-a716-446655440002',
     '550e8400-e29b-41d4-a716-446655440001',
     '660e8400-e29b-41d4-a716-446655440002',
     '770e8400-e29b-41d4-a716-446655440004',
     'MAERSK DETROIT', 'VO-2601180', '2026-01-18 08:00:00+00', '2026-02-08', 'PENDING'),
    ('dd0e8400-e29b-41d4-a716-446655440003', 'EXPORT', 'BKG-20260120-003',
     '880e8400-e29b-41d4-a716-446655440003',
     '550e8400-e29b-41d4-a716-446655440003',
     '660e8400-e29b-41d4-a716-446655440003',
     '770e8400-e29b-41d4-a716-446655440002',
     'CMA CGM PARIS', 'VO-2601200', '2026-01-25 12:00:00+00', NULL, 'PENDING')
ON CONFLICT (id) DO NOTHING;

INSERT INTO containers (id, shipment_id, container_number, size, type, weight_lbs, commodity, current_state, current_location_type)
VALUES
    ('ee0e8400-e29b-41d4-a716-446655440001', 'dd0e8400-e29b-41d4-a716-446655440001', 'MSCU1234567', '40', 'DRY',  24500, 'Consumer Electronics', 'LOADED',  'TERMINAL'),
    ('ee0e8400-e29b-41d4-a716-446655440002', 'dd0e8400-e29b-41d4-a716-446655440001', 'MSCU1234568', '40', 'DRY',  18200, 'Apparel',              'LOADED',  'TERMINAL'),
    ('ee0e8400-e29b-41d4-a716-446655440003', 'dd0e8400-e29b-41d4-a716-446655440002', 'MAEU2345678', '40', 'REEFER', 22100, 'Fresh Produce',       'LOADED',  'VESSEL'),
    ('ee0e8400-e29b-41d4-a716-446655440004', 'dd0e8400-e29b-41d4-a716-446655440003', 'CMDU3456789', '20', 'DRY',  12400, 'Machinery Parts',     'EMPTY',   'TERMINAL')
ON CONFLICT (id) DO NOTHING;

INSERT INTO orders (id, order_number, container_id, shipment_id, type, move_type,
                    pickup_location_id, delivery_location_id, return_location_id,
                    requested_pickup_date, requested_delivery_date, status)
VALUES
    ('ff0e8400-e29b-41d4-a716-446655440001', 'ORD-20260131-0001',
     'ee0e8400-e29b-41d4-a716-446655440001', 'dd0e8400-e29b-41d4-a716-446655440001',
     'IMPORT', 'LIVE_UNLOAD',
     '770e8400-e29b-41d4-a716-446655440001', '770e8400-e29b-41d4-a716-446655440021', '770e8400-e29b-41d4-a716-446655440011',
     '2026-02-01 08:00:00+00', '2026-02-01 14:00:00+00', 'READY'),
    ('ff0e8400-e29b-41d4-a716-446655440002', 'ORD-20260131-0002',
     'ee0e8400-e29b-41d4-a716-446655440002', 'dd0e8400-e29b-41d4-a716-446655440001',
     'IMPORT', 'DROP_HOOK',
     '770e8400-e29b-41d4-a716-446655440001', '770e8400-e29b-41d4-a716-446655440022', '770e8400-e29b-41d4-a716-446655440011',
     '2026-02-02 07:00:00+00', '2026-02-02 12:00:00+00', 'PENDING'),
    ('ff0e8400-e29b-41d4-a716-446655440003', 'ORD-20260131-0003',
     'ee0e8400-e29b-41d4-a716-446655440004', 'dd0e8400-e29b-41d4-a716-446655440003',
     'EXPORT', 'LIVE_LOAD',
     '770e8400-e29b-41d4-a716-446655440023', '770e8400-e29b-41d4-a716-446655440002', NULL,
     '2026-02-03 06:00:00+00', '2026-02-03 15:00:00+00', 'PENDING')
ON CONFLICT (order_number) DO NOTHING;

-- --- Accessorial rates (defaults, customer_id NULL = applies to all) ---
INSERT INTO accessorial_rates (charge_type, description, rate_type, rate, min_charge, free_time, is_active)
VALUES
    ('DETENTION',        'Terminal detention charge',         'per_hour', 75.00, 75.00,  120, TRUE),
    ('DEMURRAGE',        'Steamship line demurrage',          'per_day',  100.00, 100.00, 0,  TRUE),
    ('PER_DIEM',         'Per-diem storage at yard',          'per_day',  35.00,  35.00,  5,  TRUE),
    ('FUEL_SURCHARGE',   'Fuel surcharge (flat)',             'flat',     45.00,  45.00,  0,  TRUE),
    ('OVERWEIGHT',       'Overweight surcharge',              'flat',     100.00, 100.00, 0,  TRUE),
    ('HAZMAT',           'Hazmat handling fee',               'flat',     150.00, 150.00, 0,  TRUE),
    ('REEFER',           'Reefer surcharge',                  'flat',     75.00,  75.00,  0,  TRUE),
    ('CHASSIS',          'Chassis usage fee (pass-through)',  'per_day',  28.50,  28.50,  0,  TRUE),
    ('DRY_RUN',          'Dry run / failed pickup',           'flat',     200.00, 200.00, 0,  TRUE),
    ('REDELIVERY',       'Container redelivery',              'flat',     175.00, 175.00, 0,  TRUE)
ON CONFLICT DO NOTHING;

-- --- Wizard-style shipments (text columns only, no FK UUIDs) ---
INSERT INTO shipments (id, type, reference_number, customer_name, steamship_line, terminal_name,
                       vessel, voyage, last_free_day, status, trip_type,
                       chassis_required, chassis_pool,
                       delivery_address, delivery_city, delivery_state, delivery_zip)
VALUES
    ('dd0e8400-e29b-41d4-a716-446655440004', 'IMPORT', 'BKG-20260125-004',
     'TechFlow Electronics',    'Hapag-Lloyd',  'PCT (POLB)',
     'HLCU VENTURE', 'VO-2601250', '2026-02-12', 'CONFIRMED', 'LIVE',
     TRUE, 'DCLI',
     '2345 Tech Parkway', 'Ontario', 'CA', '91762'),
    ('dd0e8400-e29b-41d4-a716-446655440005', 'IMPORT', 'BKG-20260128-005',
     'NutriFoods International', 'ONE',          'TTI (POLB)',
     'ONEY MANHATTAN', 'VO-2601280', '2026-02-18', 'PENDING', 'DROP',
     TRUE, 'TRAC',
     '8901 Food Dist Ave', 'Compton', 'CA', '90220')
ON CONFLICT (id) DO NOTHING;

INSERT INTO containers (id, shipment_id, container_number, size, type, weight_lbs, commodity, current_state, current_location_type)
VALUES
    ('ee0e8400-e29b-41d4-a716-446655440005', 'dd0e8400-e29b-41d4-a716-446655440004', 'HLCU9876543', '40', 'DRY',   28100, 'Consumer Electronics', 'LOADED', 'TERMINAL'),
    ('ee0e8400-e29b-41d4-a716-446655440006', 'dd0e8400-e29b-41d4-a716-446655440005', 'ONEY8765432', '40', 'REEFER', 19800, 'Frozen Seafood',       'LOADED', 'TERMINAL')
ON CONFLICT (id) DO NOTHING;

-- --- Loads (dispatch board sample data) ---
INSERT INTO loads (id, load_number, customer_id, container_number, container_size, container_type,
                   weight_lbs, move_type, terminal, last_free_day,
                   hold_customs, hold_freight, hold_usda, hold_tmf, in_yard,
                   status, total_charges)
VALUES
    ('a10e8400-e29b-41d4-a716-446655440001', 'LDR-001',
     '880e8400-e29b-41d4-a716-446655440001',
     'HAPG1111111', '40', 'DRY', 22400, 'LIVE',    'APM Terminals', '2026-01-29',
     FALSE, FALSE, FALSE, FALSE, FALSE, 'AVAILABLE', 0),

    ('a10e8400-e29b-41d4-a716-446655440002', 'LDR-002',
     '880e8400-e29b-41d4-a716-446655440001',
     'ZIMU2222222', '40', 'DRY', 18800, 'DROP',    'APM Terminals', '2026-02-03',
     FALSE, FALSE, FALSE, FALSE, FALSE, 'TRACKING', 0),

    ('a10e8400-e29b-41d4-a716-446655440003', 'LDR-003',
     '880e8400-e29b-41d4-a716-446655440002',
     'COSU3333333', '40', 'REEFER', 21600, 'LIVE', 'LBCT',          '2026-02-01',
     TRUE,  FALSE, FALSE, FALSE, FALSE, 'HOLD',               0),

    ('a10e8400-e29b-41d4-a716-446655440004', 'LDR-004',
     '880e8400-e29b-41d4-a716-446655440003',
     'CMDU4444444', '20', 'DRY', 14200, 'PREPULL', 'TraPac',        '2026-02-10',
     FALSE, FALSE, FALSE, FALSE, FALSE, 'READY_FOR_DISPATCH', 0),

    ('a10e8400-e29b-41d4-a716-446655440005', 'LDR-005',
     '880e8400-e29b-41d4-a716-446655440004',
     'HLCU5555555', '40', 'DRY', 19500, 'LIVE',    'PCT',           '2026-02-15',
     FALSE, FALSE, FALSE, FALSE, FALSE, 'DISPATCHED',         73.50),

    ('a10e8400-e29b-41d4-a716-446655440006', 'LDR-006',
     '880e8400-e29b-41d4-a716-446655440005',
     'ONEY6666666', '40', 'DRY', 16800, 'DROP',    'TTI',           '2026-02-20',
     FALSE, FALSE, FALSE, FALSE, TRUE,  'IN_YARD',            0)
ON CONFLICT (id) DO NOTHING;

-- --- Load charges (for dispatched load LDR-005) ---
INSERT INTO load_charges (id, load_id, charge_type, description, quantity, unit_rate, amount, billable_to, auto_calculated)
VALUES
    ('a40e8400-e29b-41d4-a716-446655440001', 'a10e8400-e29b-41d4-a716-446655440005',
     'FUEL_SURCHARGE',  'Fuel surcharge',            1, 45.00, 45.00, 'CUSTOMER', TRUE),
    ('a40e8400-e29b-41d4-a716-446655440002', 'a10e8400-e29b-41d4-a716-446655440005',
     'CHASSIS_RENTAL',  'DCLI chassis rental (1 day)', 1, 28.50, 28.50, 'CUSTOMER', TRUE)
ON CONFLICT (id) DO NOTHING;

-- --- Load notes ---
INSERT INTO load_notes (id, load_id, author_name, author_type, message, visible_to_customer)
VALUES
    ('a50e8400-e29b-41d4-a716-446655440001', 'a10e8400-e29b-41d4-a716-446655440003',
     'Dispatch Team', 'INTERNAL',
     'Customs hold placed by CBP. Awaiting release — est. 2 business days.', FALSE),
    ('a50e8400-e29b-41d4-a716-446655440002', 'a10e8400-e29b-41d4-a716-446655440005',
     'James Rodriguez', 'DRIVER',
     'Picked up container at PCT, en route to delivery.', TRUE)
ON CONFLICT (id) DO NOTHING;

-- --- Load activity log ---
INSERT INTO load_activity_log (id, load_id, action, from_value, to_value, performed_by)
VALUES
    ('a60e8400-e29b-41d4-a716-446655440001', 'a10e8400-e29b-41d4-a716-446655440003',
     'STATUS_CHANGE', 'TRACKING', 'HOLD', 'SYSTEM'),
    ('a60e8400-e29b-41d4-a716-446655440002', 'a10e8400-e29b-41d4-a716-446655440005',
     'STATUS_CHANGE', 'READY_FOR_DISPATCH', 'DISPATCHED', 'Dispatch Manager'),
    ('a60e8400-e29b-41d4-a716-446655440003', 'a10e8400-e29b-41d4-a716-446655440005',
     'DRIVER_ASSIGNED', NULL, 'James Rodriguez (DRV-001)', 'Dispatch Manager')
ON CONFLICT (id) DO NOTHING;

-- --- Trip (dispatched load LDR-005 → driver James Rodriguez / TRK-0101) ---
INSERT INTO trips (id, trip_number, type, status, driver_id, tractor_id, chassis_number,
                   load_id, planned_start_time, created_at, updated_at)
VALUES
    ('a20e8400-e29b-41d4-a716-446655440001', 'TRP-20260131-0001', 'LIVE_LOAD', 'DISPATCHED',
     'aa0e8400-e29b-41d4-a716-446655440001',
     'bb0e8400-e29b-41d4-a716-446655440001',
     'CHS-4401',
     'a10e8400-e29b-41d4-a716-446655440005',
     '2026-01-31 08:00:00+00', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- --- Trip legs (pickup + delivery for the dispatched trip) ---
INSERT INTO trip_legs (id, trip_id, leg_number, leg_type, location_name, location_city, location_state,
                       scheduled_time, status)
VALUES
    ('a30e8400-e29b-41d4-a716-446655440001', 'a20e8400-e29b-41d4-a716-446655440001',
     1, 'PICKUP',   'PCT Terminal',                    'Long Beach', 'CA', '2026-01-31 08:00:00+00', 'COMPLETED'),
    ('a30e8400-e29b-41d4-a716-446655440002', 'a20e8400-e29b-41d4-a716-446655440001',
     2, 'DELIVERY', 'Harbor Freight Forwarding DC',   'Houston',    'TX', '2026-01-31 14:00:00+00', 'PENDING')
ON CONFLICT (id) DO NOTHING;

-- --- Company settings (singleton) ---
INSERT INTO company_settings (id, name, address, city, state, zip, phone, email, mc_number, dot_number)
VALUES
    ('default', 'DrayMaster Drayage', '1234 Harbor Dr', 'Carson', 'CA', '90745',
     '(310) 555-9900', 'dispatch@draymaster.com', 'MC-1234567', 'DOT-7654321')
ON CONFLICT (id) DO NOTHING;

-- --- Driver rate profiles ---
INSERT INTO driver_rate_profiles (id, profile_name, driver_type, pay_method, default_rate,
                                  waiting_free_hours, waiting_rate_per_hour, hazmat_pay, overweight_pay,
                                  is_active)
VALUES
    ('c10e8400-e29b-41d4-a716-446655440001', 'Company Driver — Standard', 'COMPANY_DRIVER', 'PER_LOAD',  200.00, 2, 35.00, 50.00, 25.00, TRUE),
    ('c10e8400-e29b-41d4-a716-446655440002', 'Owner Operator — Standard', 'OWNER_OPERATOR', 'PERCENTAGE', 0,    2,  0.00,  0.00,  0.00, TRUE)
ON CONFLICT (id) DO NOTHING;

-- --- Lane rates ---
INSERT INTO lane_rates (id, origin_type, origin_value, destination_type, destination_value,
                        flat_rate, estimated_miles, is_active)
VALUES
    ('c20e8400-e29b-41d4-a716-446655440001', 'terminal', 'APM_POLA',  'warehouse', 'Inland Empire', 75.00, 45.00, TRUE),
    ('c20e8400-e29b-41d4-a716-446655440002', 'terminal', 'LBCT_POLB', 'warehouse', 'Inland Empire', 70.00, 40.00, TRUE),
    ('c20e8400-e29b-41d4-a716-446655440003', 'warehouse','Inland Empire', 'terminal', 'APM_POLA',    75.00, 45.00, TRUE)
ON CONFLICT (id) DO NOTHING;

-- --- Driver rate assignments ---
INSERT INTO driver_rate_assignments (id, driver_id, rate_profile_id)
VALUES
    ('c30e8400-e29b-41d4-a716-446655440001', 'aa0e8400-e29b-41d4-a716-446655440001', 'c10e8400-e29b-41d4-a716-446655440001'),
    ('c30e8400-e29b-41d4-a716-446655440002', 'aa0e8400-e29b-41d4-a716-446655440002', 'c10e8400-e29b-41d4-a716-446655440001'),
    ('c30e8400-e29b-41d4-a716-446655440003', 'aa0e8400-e29b-41d4-a716-446655440004', 'c10e8400-e29b-41d4-a716-446655440001'),
    ('c30e8400-e29b-41d4-a716-446655440004', 'aa0e8400-e29b-41d4-a716-446655440005', 'c10e8400-e29b-41d4-a716-446655440001')
ON CONFLICT (id) DO NOTHING;

-- --- Notifications ---
INSERT INTO notifications (id, target_type, target_id, title, message, severity, channel, status)
VALUES
    ('b10e8400-e29b-41d4-a716-446655440001', 'LOAD', 'LDR-003',
     'LFD Alert: COSU3333333',
     'Last free day is tomorrow (2026-02-01). Container at LBCT is on customs hold.',
     'HIGH', 'DASHBOARD', 'PENDING'),
    ('b10e8400-e29b-41d4-a716-446655440002', 'LOAD', 'LDR-001',
     'LFD Overdue: HAPG1111111',
     'Last free day was 2026-01-29. Demurrage charges may apply.',
     'CRITICAL', 'DASHBOARD', 'PENDING'),
    ('b10e8400-e29b-41d4-a716-446655440003', 'TRIP', 'TRP-20260131-0001',
     'Dispatch Confirmed',
     'Driver James Rodriguez dispatched for load LDR-005 (HLCU5555555) via TRK-0101.',
     'LOW', 'DASHBOARD', 'PENDING')
ON CONFLICT (id) DO NOTHING;

-- ==============================================================================
-- VERIFICATION
-- ==============================================================================

SELECT
    table_name,
    COUNT(*) AS columns
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
      'customers','steamship_lines','ports','locations',
      'shipments','containers','orders',
      'loads','load_charges','load_notes','load_activity_log','street_turns',
      'drivers','tractors','chassis','chassis_pools','trailers','yard_inventory',
      'trips','trip_stops','trip_legs','trip_orders','stop_documents',
      'terminal_appointments','terminal_gate_hours',
      'exceptions','exception_comments','exception_history',
      'published_containers','gate_fees','container_tracking',
      'invoices','invoice_line_items','payments',
      'rates','accessorial_rates',
      'driver_settlements','settlement_line_items','driver_pay_rates',
      'driver_rate_profiles','lane_rates','driver_rate_assignments',
      'hos_logs','hos_violations','compliance_alerts','driver_documents',
      'chassis_usage','maintenance_records','fuel_transactions',
      'equipment_inspections','inspection_defects',
      'location_records','milestones','geofences',
      'company_settings','notifications'
  )
GROUP BY table_name
ORDER BY table_name;

-- ==============================================================================
-- END
-- ==============================================================================
