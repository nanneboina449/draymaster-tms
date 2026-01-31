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
--   4  Order-service tables
--   5  Driver-service tables
--   6  Equipment-service tables
--   7  Dispatch-service tables
--   8  Appointment & exception tables
--   9  eModal-integration tables
--  10  Billing-service tables
--  11  Tracking-service tables
--  12  Indexes
--  13  Triggers (updated_at)
--  14  Views
--  15  Seed data
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

DO $$ BEGIN CREATE TYPE shipment_status     AS ENUM ('PENDING','IN_PROGRESS','COMPLETED','CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE container_size      AS ENUM ('20','40','45');
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

-- Add CANCELLED to stop_status if the type was created without it (pre-existing DB)
DO $$
BEGIN
    ALTER TYPE stop_status ADD VALUE IF NOT EXISTS 'CANCELLED';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

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
    customer_id               UUID            NOT NULL REFERENCES customers(id),
    steamship_line_id         UUID            NOT NULL REFERENCES steamship_lines(id),
    port_id                   UUID            NOT NULL REFERENCES ports(id),
    terminal_id               UUID            NOT NULL REFERENCES locations(id),
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
-- 11b. COLUMN SAFETY — backfill columns on pre-existing tables
-- ==============================================================================
-- When this file is run against a database that already contains tables from
-- per-service migrations (order-service, dispatch-service) or 001, those tables
-- may be missing columns that were added later.  CREATE TABLE IF NOT EXISTS
-- skips re-creation, so we ALTER TABLE here to guarantee every column the
-- indexes below need actually exists before we try to index it.
-- ==============================================================================

DO $$
BEGIN
    -- shipments.terminal_id  (order-service always includes it, but guard anyway)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'shipments' AND column_name = 'terminal_id'
    ) THEN
        ALTER TABLE shipments ADD COLUMN terminal_id UUID REFERENCES locations(id);
    END IF;

    -- orders.deleted_at  (added by 001_production_enhancements)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'orders' AND column_name = 'deleted_at'
    ) THEN
        ALTER TABLE orders ADD COLUMN deleted_at TIMESTAMPTZ;
    END IF;

    -- trips.revenue  (added by 001_production_enhancements)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'trips' AND column_name = 'revenue'
    ) THEN
        ALTER TABLE trips ADD COLUMN revenue DECIMAL(10,2) DEFAULT 0;
    END IF;

    -- trips.cost  (added by 001_production_enhancements)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'trips' AND column_name = 'cost'
    ) THEN
        ALTER TABLE trips ADD COLUMN cost DECIMAL(10,2) DEFAULT 0;
    END IF;

    -- trips.deleted_at  (added by 001_production_enhancements)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'trips' AND column_name = 'deleted_at'
    ) THEN
        ALTER TABLE trips ADD COLUMN deleted_at TIMESTAMPTZ;
    END IF;

    -- trip_stops.estimated_arrival  (new in 002)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'trip_stops' AND column_name = 'estimated_arrival'
    ) THEN
        ALTER TABLE trip_stops ADD COLUMN estimated_arrival TIMESTAMPTZ;
    END IF;

    -- trip_stops.deleted_at  (added by 001_production_enhancements)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'trip_stops' AND column_name = 'deleted_at'
    ) THEN
        ALTER TABLE trip_stops ADD COLUMN deleted_at TIMESTAMPTZ;
    END IF;

    -- terminal_appointments.terminal_id  (001 always includes it, but guard anyway)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'terminal_appointments' AND column_name = 'terminal_id'
    ) THEN
        ALTER TABLE terminal_appointments ADD COLUMN terminal_id UUID;
    END IF;
END $$;

-- ==============================================================================
-- 12. INDEXES
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

-- ==============================================================================
-- 13. TRIGGERS (updated_at)
-- ==============================================================================

-- Macro to create trigger if not exists — applied to every table with updated_at
DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOR tbl IN VALUES
        ('customers'),('steamship_lines'),('ports'),('locations'),
        ('shipments'),('containers'),('orders'),
        ('drivers'),('tractors'),('chassis'),('chassis_pools'),('trailers'),
        ('trips'),('trip_stops'),
        ('terminal_appointments'),('terminal_gate_hours'),('exceptions'),
        ('published_containers'),('gate_fees'),
        ('invoices'),('rates'),('accessorial_rates'),
        ('driver_settlements'),('driver_pay_rates'),
        ('maintenance_records'),
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
-- 14. VIEWS
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
-- 15. SEED DATA
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
      'drivers','tractors','chassis','chassis_pools','trailers',
      'trips','trip_stops','trip_orders','stop_documents',
      'terminal_appointments','terminal_gate_hours',
      'exceptions','exception_comments','exception_history',
      'published_containers','gate_fees',
      'invoices','invoice_line_items','payments',
      'rates','accessorial_rates',
      'driver_settlements','settlement_line_items','driver_pay_rates',
      'hos_logs','hos_violations','compliance_alerts','driver_documents',
      'chassis_usage','maintenance_records','fuel_transactions',
      'equipment_inspections','inspection_defects',
      'location_records','milestones','geofences'
  )
GROUP BY table_name
ORDER BY table_name;

-- ==============================================================================
-- END
-- ==============================================================================
