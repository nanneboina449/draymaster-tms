-- ==============================================================================
-- DrayMaster TMS — Comprehensive Features Migration
-- ==============================================================================
-- This migration adds:
-- 1. Demurrage/Detention tracking with free time calculations
-- 2. Port/Rail API integration infrastructure
-- 3. Billing and invoicing system
-- 4. Equipment/Chassis management
-- 5. Multi-stop route optimization
-- 6. Exception handling workflow
-- ==============================================================================

-- ==============================================================================
-- 1. DEMURRAGE & DETENTION TRACKING
-- ==============================================================================

-- Carrier free time rules (different carriers have different rules)
CREATE TABLE IF NOT EXISTS carrier_free_time_rules (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    carrier_code            VARCHAR(20) NOT NULL,  -- MAERSK, CMA_CGM, COSCO, etc.
    carrier_name            VARCHAR(100) NOT NULL,

    -- Import free time (from gate release)
    import_free_days        INTEGER DEFAULT 5,
    import_free_hours       INTEGER DEFAULT 0,  -- Some carriers use hours

    -- Export free time
    export_free_days        INTEGER DEFAULT 7,

    -- Detention (equipment off-port)
    detention_free_days     INTEGER DEFAULT 3,

    -- Demurrage rates (escalating)
    demurrage_rate_day1_4   DECIMAL(10,2) DEFAULT 75.00,
    demurrage_rate_day5_7   DECIMAL(10,2) DEFAULT 100.00,
    demurrage_rate_day8_plus DECIMAL(10,2) DEFAULT 150.00,

    -- Detention rates
    detention_rate_per_day  DECIMAL(10,2) DEFAULT 50.00,
    detention_rate_per_hour DECIMAL(10,2) DEFAULT 10.00,

    -- Weekend/holiday rules
    exclude_weekends        BOOLEAN DEFAULT TRUE,
    exclude_holidays        BOOLEAN DEFAULT TRUE,

    is_active               BOOLEAN DEFAULT TRUE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(carrier_code)
);

-- Holiday calendar for free time calculations
CREATE TABLE IF NOT EXISTS holiday_calendar (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    holiday_date            DATE NOT NULL,
    holiday_name            VARCHAR(100) NOT NULL,
    applies_to_port         VARCHAR(50),  -- NULL = all ports, or specific port code
    applies_to_carrier      VARCHAR(20),  -- NULL = all carriers, or specific carrier
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(holiday_date, applies_to_port, applies_to_carrier)
);

-- Container demurrage/detention tracking
CREATE TABLE IF NOT EXISTS container_charges (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    container_id            UUID NOT NULL REFERENCES containers(id) ON DELETE CASCADE,
    shipment_id             UUID REFERENCES shipments(id),
    charge_type             VARCHAR(20) NOT NULL,  -- DEMURRAGE, DETENTION, PER_DIEM

    -- Time tracking
    free_time_start         TIMESTAMPTZ NOT NULL,  -- When free time clock started
    free_time_end           TIMESTAMPTZ NOT NULL,  -- When free time expires
    actual_return           TIMESTAMPTZ,           -- When container was returned

    -- Calculations
    free_days_allowed       INTEGER NOT NULL,
    days_used               INTEGER DEFAULT 0,
    days_over               INTEGER DEFAULT 0,

    -- Charges
    daily_rate              DECIMAL(10,2) NOT NULL,
    total_charge            DECIMAL(10,2) DEFAULT 0,

    -- Status
    status                  VARCHAR(20) DEFAULT 'ACCRUING',  -- ACCRUING, CLOSED, WAIVED, DISPUTED
    waiver_reason           TEXT,
    waiver_approved_by      VARCHAR(100),
    waiver_approved_at      TIMESTAMPTZ,

    -- Dispute tracking
    dispute_filed_at        TIMESTAMPTZ,
    dispute_reason          TEXT,
    dispute_status          VARCHAR(20),  -- PENDING, APPROVED, DENIED
    dispute_resolution      TEXT,

    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add demurrage tracking fields to containers
ALTER TABLE containers
ADD COLUMN IF NOT EXISTS gate_out_at TIMESTAMPTZ;

ALTER TABLE containers
ADD COLUMN IF NOT EXISTS gate_in_at TIMESTAMPTZ;

ALTER TABLE containers
ADD COLUMN IF NOT EXISTS free_time_expires_at TIMESTAMPTZ;

ALTER TABLE containers
ADD COLUMN IF NOT EXISTS demurrage_status VARCHAR(20) DEFAULT 'OK';
-- OK, WARNING (80%), CRITICAL (90%), OVERDUE (100%+)

ALTER TABLE containers
ADD COLUMN IF NOT EXISTS estimated_demurrage DECIMAL(10,2) DEFAULT 0;

-- ==============================================================================
-- 2. PORT/RAIL API INTEGRATION INFRASTRUCTURE
-- ==============================================================================

-- External system connections
CREATE TABLE IF NOT EXISTS api_connections (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    system_type             VARCHAR(30) NOT NULL,  -- PORT, RAIL, CARRIER, CUSTOMS
    system_name             VARCHAR(100) NOT NULL, -- eModal, UP, BNSF, etc.
    api_base_url            VARCHAR(500),
    auth_type               VARCHAR(20),           -- API_KEY, OAUTH, BASIC
    -- Credentials stored encrypted or in env vars
    is_active               BOOLEAN DEFAULT FALSE,
    last_sync_at            TIMESTAMPTZ,
    last_sync_status        VARCHAR(20),
    sync_frequency_minutes  INTEGER DEFAULT 15,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Container tracking events from external systems
CREATE TABLE IF NOT EXISTS container_tracking_events (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    container_id            UUID REFERENCES containers(id),
    container_number        VARCHAR(15) NOT NULL,

    -- Event details
    event_type              VARCHAR(50) NOT NULL,
    -- VESSEL_ARRIVAL, VESSEL_DEPARTURE, DISCHARGED, AVAILABLE, CUSTOMS_HOLD,
    -- CUSTOMS_RELEASED, GATE_OUT, GATE_IN, ON_RAIL, OFF_RAIL
    event_timestamp         TIMESTAMPTZ NOT NULL,
    event_location          VARCHAR(200),
    event_terminal          VARCHAR(100),

    -- Source
    source_system           VARCHAR(50) NOT NULL,  -- EMODAL, UP_API, MANUAL, etc.
    source_reference        VARCHAR(100),
    raw_data                JSONB,

    -- Processing
    processed               BOOLEAN DEFAULT FALSE,
    processed_at            TIMESTAMPTZ,

    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Vessel schedule tracking
CREATE TABLE IF NOT EXISTS vessel_schedules (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vessel_name             VARCHAR(100) NOT NULL,
    voyage_number           VARCHAR(50),
    carrier_code            VARCHAR(20),

    -- Port info
    port_code               VARCHAR(20) NOT NULL,
    terminal_code           VARCHAR(20),

    -- Schedule
    eta                     TIMESTAMPTZ,
    ata                     TIMESTAMPTZ,  -- Actual time of arrival
    etd                     TIMESTAMPTZ,
    atd                     TIMESTAMPTZ,  -- Actual time of departure

    -- Status
    status                  VARCHAR(20) DEFAULT 'SCHEDULED',
    -- SCHEDULED, ARRIVED, BERTHED, DISCHARGING, LOADING, DEPARTED, DELAYED
    delay_reason            TEXT,

    last_updated            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    source_system           VARCHAR(50)
);

-- Rail schedules
CREATE TABLE IF NOT EXISTS rail_schedules (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    train_id                VARCHAR(50) NOT NULL,
    carrier_code            VARCHAR(20) NOT NULL,  -- UP, BNSF, NS, CSX

    -- Origin
    origin_ramp             VARCHAR(100) NOT NULL,
    origin_city             VARCHAR(100),

    -- Destination
    destination_ramp        VARCHAR(100) NOT NULL,
    destination_city        VARCHAR(100),

    -- Schedule
    scheduled_departure     TIMESTAMPTZ,
    actual_departure        TIMESTAMPTZ,
    scheduled_arrival       TIMESTAMPTZ,
    actual_arrival          TIMESTAMPTZ,

    status                  VARCHAR(20) DEFAULT 'SCHEDULED',

    last_updated            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 3. BILLING AND INVOICING SYSTEM
-- ==============================================================================

-- Rate tables by lane
CREATE TABLE IF NOT EXISTS rate_lanes (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id             UUID REFERENCES customers(id),  -- NULL = default rates

    -- Origin
    origin_type             VARCHAR(20) NOT NULL,  -- TERMINAL, RAIL_RAMP, CITY, ZIP
    origin_code             VARCHAR(50) NOT NULL,
    origin_name             VARCHAR(200),

    -- Destination
    destination_type        VARCHAR(20) NOT NULL,
    destination_code        VARCHAR(50) NOT NULL,
    destination_name        VARCHAR(200),

    -- Rates by container size
    rate_20ft               DECIMAL(10,2),
    rate_40ft               DECIMAL(10,2),
    rate_40hc               DECIMAL(10,2),
    rate_45ft               DECIMAL(10,2),

    -- Modifiers
    hazmat_surcharge        DECIMAL(10,2) DEFAULT 50.00,
    overweight_surcharge    DECIMAL(10,2) DEFAULT 75.00,
    reefer_surcharge        DECIMAL(10,2) DEFAULT 100.00,

    -- Validity
    effective_date          DATE NOT NULL,
    expiry_date             DATE,
    is_active               BOOLEAN DEFAULT TRUE,

    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Accessorial charge definitions
CREATE TABLE IF NOT EXISTS accessorial_types (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code                    VARCHAR(30) NOT NULL UNIQUE,
    name                    VARCHAR(100) NOT NULL,
    description             TEXT,

    -- Default rate
    default_rate            DECIMAL(10,2) NOT NULL,
    rate_type               VARCHAR(20) NOT NULL,  -- FLAT, PER_HOUR, PER_DAY, PER_MILE

    -- Free time (if applicable)
    free_time_value         INTEGER,
    free_time_unit          VARCHAR(10),  -- HOURS, DAYS

    is_active               BOOLEAN DEFAULT TRUE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add columns if table already exists from previous migration
ALTER TABLE accessorial_types ADD COLUMN IF NOT EXISTS free_time_value INTEGER;
ALTER TABLE accessorial_types ADD COLUMN IF NOT EXISTS free_time_unit VARCHAR(10);
ALTER TABLE accessorial_types ADD COLUMN IF NOT EXISTS default_rate DECIMAL(10,2);
ALTER TABLE accessorial_types ADD COLUMN IF NOT EXISTS rate_type VARCHAR(20);

-- Update default_rate to have a default if it was added as nullable
UPDATE accessorial_types SET default_rate = 0 WHERE default_rate IS NULL;
UPDATE accessorial_types SET rate_type = 'FLAT' WHERE rate_type IS NULL;

-- Insert common accessorial types
INSERT INTO accessorial_types (code, name, description, default_rate, rate_type, free_time_value, free_time_unit) VALUES
('FUEL_SURCHARGE', 'Fuel Surcharge', 'Percentage-based fuel surcharge', 8.00, 'PERCENT', NULL, NULL),
('DETENTION', 'Detention', 'Waiting time at pickup/delivery', 50.00, 'PER_HOUR', 2, 'HOURS'),
('STORAGE', 'Storage', 'Yard storage per day', 35.00, 'PER_DAY', 2, 'DAYS'),
('CHASSIS_SPLIT', 'Chassis Split', 'Using pool chassis', 25.00, 'FLAT', NULL, NULL),
('PREPULL', 'Pre-Pull', 'Early terminal pickup to yard', 125.00, 'FLAT', NULL, NULL),
('HAZMAT', 'Hazmat Handling', 'Hazardous materials surcharge', 75.00, 'FLAT', NULL, NULL),
('OVERWEIGHT', 'Overweight', 'Overweight container surcharge', 100.00, 'FLAT', NULL, NULL),
('TRIAXLE', 'Tri-Axle Chassis', 'Tri-axle chassis requirement', 75.00, 'FLAT', NULL, NULL),
('PORT_CONGESTION', 'Port Congestion', 'Port congestion surcharge', 50.00, 'FLAT', NULL, NULL),
('WEEKEND_DELIVERY', 'Weekend Delivery', 'Saturday/Sunday delivery', 150.00, 'FLAT', NULL, NULL),
('AFTER_HOURS', 'After Hours', 'After hours pickup/delivery', 100.00, 'FLAT', NULL, NULL),
('GATE_FEE', 'Gate Fee', 'Port/terminal gate fee', 35.00, 'FLAT', NULL, NULL),
('CHASSIS_RENTAL', 'Chassis Rental', 'Daily chassis rental', 25.00, 'PER_DAY', NULL, NULL),
('REEFER_MONITOR', 'Reefer Monitoring', 'Temperature monitoring', 50.00, 'FLAT', NULL, NULL),
('RESIDENTIAL', 'Residential Delivery', 'Residential area delivery', 100.00, 'FLAT', NULL, NULL)
ON CONFLICT (code) DO NOTHING;

-- Invoices
CREATE TABLE IF NOT EXISTS invoices (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number          VARCHAR(50) NOT NULL UNIQUE,
    customer_id             UUID NOT NULL REFERENCES customers(id),

    -- Dates
    invoice_date            DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date                DATE NOT NULL,

    -- Amounts
    subtotal                DECIMAL(12,2) NOT NULL DEFAULT 0,
    tax_amount              DECIMAL(12,2) DEFAULT 0,
    total_amount            DECIMAL(12,2) NOT NULL DEFAULT 0,
    amount_paid             DECIMAL(12,2) DEFAULT 0,
    balance_due             DECIMAL(12,2) NOT NULL DEFAULT 0,

    -- Status
    status                  VARCHAR(20) DEFAULT 'DRAFT',
    -- DRAFT, SENT, PARTIAL, PAID, OVERDUE, DISPUTED, VOID

    -- Payment
    payment_terms           VARCHAR(20) DEFAULT 'NET_30',
    payment_method          VARCHAR(30),
    payment_reference       VARCHAR(100),
    paid_at                 TIMESTAMPTZ,

    notes                   TEXT,

    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Invoice line items
CREATE TABLE IF NOT EXISTS invoice_line_items (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id              UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    order_id                UUID REFERENCES orders(id),

    -- Line item details
    description             TEXT NOT NULL,
    charge_type             VARCHAR(30) NOT NULL,  -- LINE_HAUL, FUEL, ACCESSORIAL, DEMURRAGE, etc.

    -- Amounts
    quantity                DECIMAL(10,2) DEFAULT 1,
    unit_rate               DECIMAL(10,2) NOT NULL,
    amount                  DECIMAL(10,2) NOT NULL,

    -- Reference
    container_number        VARCHAR(15),
    reference_number        VARCHAR(100),
    service_date            DATE,

    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 4. EQUIPMENT/CHASSIS MANAGEMENT
-- ==============================================================================

-- Chassis inventory
CREATE TABLE IF NOT EXISTS chassis_inventory (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chassis_number          VARCHAR(30) NOT NULL UNIQUE,

    -- Pool/ownership
    pool                    VARCHAR(20) NOT NULL,  -- DCLI, TRAC, FLEXI, DIRECT, COMPANY
    owner                   VARCHAR(100),

    -- Specifications
    chassis_type            VARCHAR(20) NOT NULL,  -- STANDARD, TRIAXLE, SLIDER, EXTENDABLE
    size_compatibility      VARCHAR(20) NOT NULL,  -- 20FT, 40FT, 40HC, 45FT, COMBO
    weight_capacity_lbs     INTEGER DEFAULT 44000,

    -- Condition
    condition               VARCHAR(20) DEFAULT 'GOOD',  -- GOOD, FAIR, NEEDS_REPAIR, OUT_OF_SERVICE
    last_inspection_date    DATE,
    next_inspection_due     DATE,

    -- Location tracking
    current_location_type   VARCHAR(20),  -- YARD, PORT, CUSTOMER, IN_TRANSIT
    current_location_name   VARCHAR(200),
    current_container_id    UUID REFERENCES containers(id),

    -- Assignment
    assigned_driver_id      UUID REFERENCES drivers(id),
    assigned_at             TIMESTAMPTZ,

    -- Status
    status                  VARCHAR(20) DEFAULT 'AVAILABLE',
    -- AVAILABLE, IN_USE, RESERVED, MAINTENANCE, OUT_OF_SERVICE

    -- Rental tracking
    is_rental               BOOLEAN DEFAULT FALSE,
    rental_rate_per_day     DECIMAL(10,2),
    rental_start_date       DATE,

    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Chassis movement history
CREATE TABLE IF NOT EXISTS chassis_movements (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chassis_id              UUID NOT NULL REFERENCES chassis_inventory(id),

    movement_type           VARCHAR(30) NOT NULL,
    -- PICKUP, DROP, INTERCHANGE, INSPECTION, MAINTENANCE

    from_location           VARCHAR(200),
    to_location             VARCHAR(200),

    container_id            UUID REFERENCES containers(id),
    container_number        VARCHAR(15),

    driver_id               UUID REFERENCES drivers(id),
    order_id                UUID REFERENCES orders(id),

    movement_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes                   TEXT,

    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Equipment compatibility rules
CREATE TABLE IF NOT EXISTS equipment_compatibility (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    container_size          VARCHAR(10) NOT NULL,  -- 20, 40, 40HC, 45
    container_type          VARCHAR(20),           -- DRY, REEFER, FLAT, TANK

    chassis_type            VARCHAR(20) NOT NULL,
    chassis_size            VARCHAR(20) NOT NULL,

    is_compatible           BOOLEAN NOT NULL DEFAULT TRUE,
    notes                   TEXT,

    UNIQUE(container_size, container_type, chassis_type, chassis_size)
);

-- Insert compatibility rules
INSERT INTO equipment_compatibility (container_size, container_type, chassis_type, chassis_size, is_compatible) VALUES
('20', NULL, 'STANDARD', '20FT', TRUE),
('20', NULL, 'STANDARD', 'COMBO', TRUE),
('40', NULL, 'STANDARD', '40FT', TRUE),
('40', NULL, 'STANDARD', 'COMBO', TRUE),
('40HC', NULL, 'STANDARD', '40FT', FALSE),  -- HC needs slider or extendable
('40HC', NULL, 'SLIDER', '40FT', TRUE),
('45', NULL, 'EXTENDABLE', '45FT', TRUE),
('40', 'REEFER', 'STANDARD', '40FT', TRUE),
('40', 'REEFER', 'TRIAXLE', '40FT', TRUE)
ON CONFLICT DO NOTHING;

-- ==============================================================================
-- 5. MULTI-STOP ROUTE OPTIMIZATION
-- ==============================================================================

-- Multi-stop trips (extends existing trips table)
ALTER TABLE trips
ADD COLUMN IF NOT EXISTS total_stops INTEGER DEFAULT 2;

ALTER TABLE trips
ADD COLUMN IF NOT EXISTS total_distance_miles DECIMAL(10,2);

ALTER TABLE trips
ADD COLUMN IF NOT EXISTS estimated_duration_minutes INTEGER;

ALTER TABLE trips
ADD COLUMN IF NOT EXISTS route_optimized BOOLEAN DEFAULT FALSE;

-- Trip stops (for 3+ stop trips)
CREATE TABLE IF NOT EXISTS trip_stops (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id                 UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,

    stop_sequence           INTEGER NOT NULL,
    stop_type               VARCHAR(30) NOT NULL,
    -- PICKUP_LOADED, PICKUP_EMPTY, DELIVER_LOADED, DELIVER_EMPTY, DROP_TRAILER, HOOK_TRAILER

    -- Location
    location_name           VARCHAR(200) NOT NULL,
    location_address        TEXT,
    location_city           VARCHAR(100),
    location_state          VARCHAR(2),
    location_zip            VARCHAR(10),
    location_lat            DECIMAL(10,7),
    location_lng            DECIMAL(10,7),

    -- Container at this stop
    container_id            UUID REFERENCES containers(id),
    container_number        VARCHAR(15),
    action                  VARCHAR(30),  -- LOAD, UNLOAD, SWAP, INSPECT

    -- Appointment
    appointment_start       TIMESTAMPTZ,
    appointment_end         TIMESTAMPTZ,
    appointment_number      VARCHAR(50),

    -- Actuals
    arrival_time            TIMESTAMPTZ,
    departure_time          TIMESTAMPTZ,
    dwell_minutes           INTEGER,

    -- Status
    status                  VARCHAR(20) DEFAULT 'PENDING',
    -- PENDING, EN_ROUTE, ARRIVED, COMPLETED, SKIPPED

    -- Notes
    special_instructions    TEXT,
    driver_notes            TEXT,

    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(trip_id, stop_sequence)
);

-- ==============================================================================
-- 6. EXCEPTION HANDLING WORKFLOW
-- ==============================================================================

-- Incident types
CREATE TABLE IF NOT EXISTS incident_types (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code                    VARCHAR(30) NOT NULL UNIQUE,
    name                    VARCHAR(100) NOT NULL,
    severity                VARCHAR(20) NOT NULL,  -- LOW, MEDIUM, HIGH, CRITICAL
    requires_report         BOOLEAN DEFAULT FALSE,
    auto_notify             BOOLEAN DEFAULT TRUE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert incident types
INSERT INTO incident_types (code, name, severity, requires_report, auto_notify) VALUES
('DRIVER_NO_SHOW', 'Driver No-Show', 'HIGH', FALSE, TRUE),
('DRIVER_LATE', 'Driver Late Arrival', 'MEDIUM', FALSE, TRUE),
('APPOINTMENT_MISSED', 'Missed Appointment', 'HIGH', FALSE, TRUE),
('CONTAINER_DAMAGE', 'Container Damage', 'HIGH', TRUE, TRUE),
('CARGO_DAMAGE', 'Cargo Damage', 'CRITICAL', TRUE, TRUE),
('ACCIDENT', 'Vehicle Accident', 'CRITICAL', TRUE, TRUE),
('BREAKDOWN', 'Equipment Breakdown', 'HIGH', FALSE, TRUE),
('CHASSIS_ISSUE', 'Chassis Problem', 'MEDIUM', FALSE, TRUE),
('SEAL_DISCREPANCY', 'Seal Number Mismatch', 'HIGH', TRUE, TRUE),
('WEIGHT_OVERLOAD', 'Weight Exceeded', 'HIGH', FALSE, TRUE),
('CUSTOMS_HOLD', 'Customs Hold Detected', 'MEDIUM', FALSE, TRUE),
('PORT_DELAY', 'Port Congestion Delay', 'LOW', FALSE, FALSE),
('WEATHER_DELAY', 'Weather Related Delay', 'LOW', FALSE, FALSE),
('REFUSED_DELIVERY', 'Delivery Refused', 'HIGH', TRUE, TRUE),
('WRONG_CONTAINER', 'Wrong Container Picked', 'CRITICAL', TRUE, TRUE)
ON CONFLICT (code) DO NOTHING;

-- Incidents log
CREATE TABLE IF NOT EXISTS incidents (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_number         VARCHAR(50) NOT NULL UNIQUE,
    incident_type_code      VARCHAR(30) NOT NULL REFERENCES incident_types(code),

    -- Related entities
    order_id                UUID REFERENCES orders(id),
    trip_id                 UUID REFERENCES trips(id),
    container_id            UUID REFERENCES containers(id),
    driver_id               UUID REFERENCES drivers(id),

    -- Details
    title                   VARCHAR(200) NOT NULL,
    description             TEXT,
    location                VARCHAR(200),
    occurred_at             TIMESTAMPTZ NOT NULL,
    reported_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reported_by             VARCHAR(100),

    -- Severity and status
    severity                VARCHAR(20) NOT NULL,
    status                  VARCHAR(20) DEFAULT 'OPEN',
    -- OPEN, INVESTIGATING, RESOLVED, CLOSED

    -- Resolution
    resolution_notes        TEXT,
    resolved_at             TIMESTAMPTZ,
    resolved_by             VARCHAR(100),

    -- Financial impact
    estimated_cost          DECIMAL(12,2),
    actual_cost             DECIMAL(12,2),
    insurance_claim_number  VARCHAR(100),

    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Incident attachments
CREATE TABLE IF NOT EXISTS incident_attachments (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id             UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    file_name               VARCHAR(255) NOT NULL,
    file_type               VARCHAR(50),
    file_url                TEXT NOT NULL,
    uploaded_by             VARCHAR(100),
    uploaded_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Exception alerts queue
CREATE TABLE IF NOT EXISTS exception_alerts (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_type              VARCHAR(50) NOT NULL,
    severity                VARCHAR(20) NOT NULL,

    -- Reference
    order_id                UUID REFERENCES orders(id),
    container_id            UUID REFERENCES containers(id),
    driver_id               UUID REFERENCES drivers(id),

    -- Alert details
    title                   VARCHAR(200) NOT NULL,
    message                 TEXT NOT NULL,

    -- Status
    status                  VARCHAR(20) DEFAULT 'NEW',
    -- NEW, ACKNOWLEDGED, IN_PROGRESS, RESOLVED, DISMISSED
    acknowledged_by         VARCHAR(100),
    acknowledged_at         TIMESTAMPTZ,
    resolved_at             TIMESTAMPTZ,

    -- Auto-actions
    auto_action_taken       VARCHAR(100),

    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at              TIMESTAMPTZ
);

-- ==============================================================================
-- 7. HELPER FUNCTIONS
-- ==============================================================================

-- Function: Calculate free time remaining
CREATE OR REPLACE FUNCTION calculate_free_time_remaining(
    p_container_id UUID
)
RETURNS TABLE (
    free_time_expires_at TIMESTAMPTZ,
    hours_remaining INTEGER,
    percent_used INTEGER,
    status VARCHAR(20)
) AS $$
DECLARE
    v_gate_out_at TIMESTAMPTZ;
    v_free_days INTEGER;
    v_carrier_code VARCHAR(20);
    v_expires_at TIMESTAMPTZ;
    v_hours_remaining INTEGER;
    v_total_hours INTEGER;
    v_hours_used INTEGER;
    v_percent INTEGER;
    v_status VARCHAR(20);
BEGIN
    -- Get container info
    SELECT c.gate_out_at, s.steamship_line
    INTO v_gate_out_at, v_carrier_code
    FROM containers c
    JOIN shipments s ON c.shipment_id = s.id
    WHERE c.id = p_container_id;

    IF v_gate_out_at IS NULL THEN
        RETURN QUERY SELECT NULL::TIMESTAMPTZ, NULL::INTEGER, 0::INTEGER, 'NOT_STARTED'::VARCHAR(20);
        RETURN;
    END IF;

    -- Get free days from carrier rules (default to 5)
    SELECT COALESCE(cfr.import_free_days, 5)
    INTO v_free_days
    FROM carrier_free_time_rules cfr
    WHERE cfr.carrier_code = v_carrier_code;

    IF v_free_days IS NULL THEN
        v_free_days := 5;
    END IF;

    -- Calculate expiration (simplified - not accounting for holidays)
    v_expires_at := v_gate_out_at + (v_free_days || ' days')::INTERVAL;
    v_total_hours := v_free_days * 24;
    v_hours_used := EXTRACT(EPOCH FROM (NOW() - v_gate_out_at)) / 3600;
    v_hours_remaining := GREATEST(0, v_total_hours - v_hours_used);
    v_percent := LEAST(100, (v_hours_used * 100 / NULLIF(v_total_hours, 0)));

    -- Determine status
    IF v_hours_remaining <= 0 THEN
        v_status := 'OVERDUE';
    ELSIF v_percent >= 90 THEN
        v_status := 'CRITICAL';
    ELSIF v_percent >= 80 THEN
        v_status := 'WARNING';
    ELSE
        v_status := 'OK';
    END IF;

    RETURN QUERY SELECT v_expires_at, v_hours_remaining::INTEGER, v_percent::INTEGER, v_status;
END;
$$ LANGUAGE plpgsql;

-- Function: Create incident
CREATE OR REPLACE FUNCTION create_incident(
    p_type_code VARCHAR(30),
    p_title VARCHAR(200),
    p_description TEXT,
    p_order_id UUID DEFAULT NULL,
    p_driver_id UUID DEFAULT NULL,
    p_container_id UUID DEFAULT NULL,
    p_location VARCHAR(200) DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_incident_id UUID;
    v_severity VARCHAR(20);
    v_incident_number VARCHAR(50);
BEGIN
    -- Get severity from incident type
    SELECT severity INTO v_severity FROM incident_types WHERE code = p_type_code;

    -- Generate incident number
    v_incident_number := 'INC-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' ||
                         LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');

    -- Create incident
    INSERT INTO incidents (
        incident_number, incident_type_code, title, description,
        order_id, driver_id, container_id, location,
        occurred_at, severity
    ) VALUES (
        v_incident_number, p_type_code, p_title, p_description,
        p_order_id, p_driver_id, p_container_id, p_location,
        NOW(), v_severity
    ) RETURNING id INTO v_incident_id;

    -- Create alert
    INSERT INTO exception_alerts (
        alert_type, severity, order_id, driver_id, container_id,
        title, message
    ) VALUES (
        p_type_code, v_severity, p_order_id, p_driver_id, p_container_id,
        p_title, p_description
    );

    RETURN v_incident_id;
END;
$$ LANGUAGE plpgsql;

-- Function: Check equipment compatibility
CREATE OR REPLACE FUNCTION check_equipment_compatibility(
    p_container_size VARCHAR(10),
    p_container_type VARCHAR(20),
    p_chassis_type VARCHAR(20),
    p_chassis_size VARCHAR(20)
)
RETURNS BOOLEAN AS $$
DECLARE
    v_compatible BOOLEAN;
BEGIN
    SELECT is_compatible INTO v_compatible
    FROM equipment_compatibility
    WHERE container_size = p_container_size
      AND (container_type IS NULL OR container_type = p_container_type)
      AND chassis_type = p_chassis_type
      AND chassis_size = p_chassis_size;

    RETURN COALESCE(v_compatible, TRUE);  -- Default to compatible if no rule
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- 8. INDEXES
-- ==============================================================================

CREATE INDEX IF NOT EXISTS idx_container_charges_container ON container_charges(container_id);
CREATE INDEX IF NOT EXISTS idx_container_charges_status ON container_charges(status);
CREATE INDEX IF NOT EXISTS idx_tracking_events_container ON container_tracking_events(container_id);
CREATE INDEX IF NOT EXISTS idx_tracking_events_timestamp ON container_tracking_events(event_timestamp);
CREATE INDEX IF NOT EXISTS idx_chassis_status ON chassis_inventory(status);
CREATE INDEX IF NOT EXISTS idx_chassis_location ON chassis_inventory(current_location_type);
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_trip_stops_trip ON trip_stops(trip_id);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_exception_alerts_status ON exception_alerts(status);

-- ==============================================================================
-- 9. SEED DATA - Sample Carrier Rules
-- ==============================================================================

INSERT INTO carrier_free_time_rules (carrier_code, carrier_name, import_free_days, detention_free_days, demurrage_rate_day1_4, demurrage_rate_day5_7, demurrage_rate_day8_plus) VALUES
('MAERSK', 'Maersk Line', 5, 3, 75.00, 125.00, 200.00),
('MSC', 'Mediterranean Shipping', 4, 3, 80.00, 130.00, 210.00),
('CMA_CGM', 'CMA CGM', 5, 4, 70.00, 120.00, 190.00),
('COSCO', 'COSCO Shipping', 5, 3, 75.00, 125.00, 200.00),
('EVERGREEN', 'Evergreen Marine', 5, 3, 75.00, 120.00, 195.00),
('ONE', 'Ocean Network Express', 5, 3, 80.00, 130.00, 210.00),
('HAPAG', 'Hapag-Lloyd', 5, 4, 75.00, 125.00, 200.00),
('YANG_MING', 'Yang Ming Marine', 5, 3, 70.00, 115.00, 185.00),
('HMM', 'Hyundai Merchant Marine', 5, 3, 75.00, 120.00, 195.00),
('ZIM', 'ZIM Integrated Shipping', 4, 3, 80.00, 130.00, 210.00)
ON CONFLICT (carrier_code) DO UPDATE SET
    carrier_name = EXCLUDED.carrier_name,
    import_free_days = EXCLUDED.import_free_days,
    updated_at = NOW();

-- ==============================================================================
-- SUCCESS MESSAGE
-- ==============================================================================

DO $$
BEGIN
    RAISE NOTICE 'SUCCESS: Comprehensive TMS features migration completed';
    RAISE NOTICE 'New features added:';
    RAISE NOTICE '  1. Demurrage/Detention tracking';
    RAISE NOTICE '  2. Port/Rail API integration infrastructure';
    RAISE NOTICE '  3. Billing and invoicing system';
    RAISE NOTICE '  4. Equipment/Chassis management';
    RAISE NOTICE '  5. Multi-stop route optimization';
    RAISE NOTICE '  6. Exception handling workflow';
END $$;
