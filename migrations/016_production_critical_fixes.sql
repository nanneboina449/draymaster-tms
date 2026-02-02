-- ==============================================================================
-- DrayMaster TMS — Production Critical Fixes Migration
-- ==============================================================================
-- Addresses critical issues from Technical Review:
-- 1. Unique Constraints at Database Level (P0)
-- 2. Audit Trail for Compliance (P1)
-- 3. Outbox Pattern for Reliable Events (P0)
-- 4. Idempotency Keys for Duplicate Prevention (P0)
-- 5. Driver Availability/HOS Tracking (P1)
-- 6. Soft Delete Support (P2)
-- 7. Query Optimization Indexes (P2)
-- 8. Notification System Infrastructure (P1)
-- 9. Validation Rules Table (P0)
-- ==============================================================================

-- ==============================================================================
-- 1. UNIQUE CONSTRAINTS - Prevent duplicate records
-- ==============================================================================

-- Unique reference number per customer (shipments)
CREATE UNIQUE INDEX IF NOT EXISTS idx_shipments_customer_reference
    ON shipments(customer_id, reference_number)
    WHERE customer_id IS NOT NULL;

-- Unique container number per shipment
CREATE UNIQUE INDEX IF NOT EXISTS idx_containers_shipment_number
    ON containers(shipment_id, container_number);

-- Unique trip number
ALTER TABLE trips
    DROP CONSTRAINT IF EXISTS trips_trip_number_unique;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'trips_trip_number_unique'
    ) THEN
        ALTER TABLE trips ADD CONSTRAINT trips_trip_number_unique UNIQUE(trip_number);
    END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Prevent duplicate container assignments in orders
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_container_active
    ON orders(container_id)
    WHERE deleted_at IS NULL AND status NOT IN ('CANCELLED', 'COMPLETED');

-- Unique invoice number
ALTER TABLE invoices
    DROP CONSTRAINT IF EXISTS invoices_invoice_number_unique;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'invoices_invoice_number_key'
    ) THEN
        -- Already has UNIQUE constraint from table definition
        NULL;
    END IF;
END $$;

-- ==============================================================================
-- 2. AUDIT TRAIL - Track all changes for compliance
-- ==============================================================================

CREATE TABLE IF NOT EXISTS audit_logs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name          VARCHAR(100) NOT NULL,
    record_id           UUID NOT NULL,
    action              VARCHAR(20) NOT NULL, -- INSERT, UPDATE, DELETE

    -- Change tracking
    old_data            JSONB,
    new_data            JSONB,
    changed_fields      TEXT[], -- Array of field names that changed

    -- User tracking
    user_id             UUID,
    user_email          VARCHAR(255),
    user_role           VARCHAR(50),

    -- Context
    ip_address          INET,
    user_agent          TEXT,
    request_id          UUID,

    -- Timestamp
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Indexes for fast lookups
    CONSTRAINT audit_logs_action_check CHECK (action IN ('INSERT', 'UPDATE', 'DELETE'))
);

-- Indexes for audit log queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_table_record ON audit_logs(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_logs_table_created ON audit_logs(table_name, created_at DESC);

-- Function to log changes
CREATE OR REPLACE FUNCTION log_audit_change()
RETURNS TRIGGER AS $$
DECLARE
    v_old_data JSONB;
    v_new_data JSONB;
    v_changed_fields TEXT[];
    v_action VARCHAR(20);
    v_record_id UUID;
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_action := 'INSERT';
        v_new_data := to_jsonb(NEW);
        v_record_id := NEW.id;
        v_old_data := NULL;
    ELSIF TG_OP = 'UPDATE' THEN
        v_action := 'UPDATE';
        v_old_data := to_jsonb(OLD);
        v_new_data := to_jsonb(NEW);
        v_record_id := NEW.id;

        -- Find changed fields
        SELECT array_agg(key) INTO v_changed_fields
        FROM (
            SELECT key
            FROM jsonb_each(v_old_data) old_vals
            WHERE NOT EXISTS (
                SELECT 1 FROM jsonb_each(v_new_data) new_vals
                WHERE old_vals.key = new_vals.key
                AND old_vals.value = new_vals.value
            )
            UNION
            SELECT key
            FROM jsonb_each(v_new_data) new_vals
            WHERE NOT EXISTS (
                SELECT 1 FROM jsonb_each(v_old_data) old_vals
                WHERE old_vals.key = new_vals.key
            )
        ) changed;
    ELSIF TG_OP = 'DELETE' THEN
        v_action := 'DELETE';
        v_old_data := to_jsonb(OLD);
        v_record_id := OLD.id;
        v_new_data := NULL;
    END IF;

    -- Insert audit record
    INSERT INTO audit_logs (
        table_name, record_id, action,
        old_data, new_data, changed_fields,
        user_id, user_email
    ) VALUES (
        TG_TABLE_NAME, v_record_id, v_action,
        v_old_data, v_new_data, v_changed_fields,
        current_setting('app.current_user_id', true)::UUID,
        current_setting('app.current_user_email', true)
    );

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Create audit triggers for critical tables
DO $$
DECLARE
    tables_to_audit TEXT[] := ARRAY[
        'shipments', 'containers', 'orders', 'trips',
        'invoices', 'drivers', 'customers'
    ];
    t TEXT;
    trigger_name TEXT;
BEGIN
    FOREACH t IN ARRAY tables_to_audit
    LOOP
        trigger_name := 'audit_' || t || '_trigger';

        -- Drop existing trigger if any
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', trigger_name, t);

        -- Create new trigger
        EXECUTE format(
            'CREATE TRIGGER %I
            AFTER INSERT OR UPDATE OR DELETE ON %I
            FOR EACH ROW EXECUTE FUNCTION log_audit_change()',
            trigger_name, t
        );
    END LOOP;
END $$;

-- ==============================================================================
-- 3. OUTBOX PATTERN - Reliable event publishing
-- ==============================================================================

CREATE TABLE IF NOT EXISTS outbox_events (
    id                  BIGSERIAL PRIMARY KEY,
    aggregate_type      VARCHAR(100) NOT NULL, -- shipments, orders, trips, etc.
    aggregate_id        UUID NOT NULL,
    event_type          VARCHAR(100) NOT NULL, -- order.created, trip.assigned, etc.

    -- Event payload
    payload             JSONB NOT NULL,

    -- Processing status
    published           BOOLEAN DEFAULT FALSE,
    published_at        TIMESTAMPTZ,
    publish_attempts    INTEGER DEFAULT 0,
    last_error          TEXT,

    -- Ordering guarantee
    sequence_number     BIGINT,

    -- Timestamps
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Idempotency
    CONSTRAINT outbox_unique_event UNIQUE(aggregate_id, event_type, created_at)
);

-- Index for outbox processor to find unpublished events
CREATE INDEX IF NOT EXISTS idx_outbox_unpublished
    ON outbox_events(created_at)
    WHERE published = FALSE;

CREATE INDEX IF NOT EXISTS idx_outbox_aggregate
    ON outbox_events(aggregate_type, aggregate_id);

-- Sequence for ordering
CREATE SEQUENCE IF NOT EXISTS outbox_sequence_seq;

-- Function to create outbox event
CREATE OR REPLACE FUNCTION create_outbox_event(
    p_aggregate_type VARCHAR(100),
    p_aggregate_id UUID,
    p_event_type VARCHAR(100),
    p_payload JSONB
)
RETURNS BIGINT AS $$
DECLARE
    v_event_id BIGINT;
BEGIN
    INSERT INTO outbox_events (
        aggregate_type, aggregate_id, event_type, payload, sequence_number
    ) VALUES (
        p_aggregate_type, p_aggregate_id, p_event_type, p_payload,
        nextval('outbox_sequence_seq')
    ) RETURNING id INTO v_event_id;

    RETURN v_event_id;
END;
$$ LANGUAGE plpgsql;

-- Function to mark event as published
CREATE OR REPLACE FUNCTION mark_outbox_event_published(
    p_event_id BIGINT
)
RETURNS VOID AS $$
BEGIN
    UPDATE outbox_events
    SET published = TRUE, published_at = NOW()
    WHERE id = p_event_id;
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- 4. IDEMPOTENCY KEYS - Prevent duplicate requests
-- ==============================================================================

CREATE TABLE IF NOT EXISTS idempotency_keys (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key     VARCHAR(255) NOT NULL UNIQUE,

    -- Request info
    request_path        VARCHAR(500) NOT NULL,
    request_method      VARCHAR(10) NOT NULL,
    request_hash        VARCHAR(64), -- SHA256 of request body

    -- Response caching
    response_status     INTEGER,
    response_body       JSONB,

    -- Result tracking
    result_id           UUID, -- ID of created resource
    result_type         VARCHAR(100), -- Type of created resource

    -- Status
    status              VARCHAR(20) DEFAULT 'PROCESSING',
    -- PROCESSING, COMPLETED, FAILED
    error_message       TEXT,

    -- Timestamps
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at        TIMESTAMPTZ,
    expires_at          TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours')
);

CREATE INDEX IF NOT EXISTS idx_idempotency_keys_key ON idempotency_keys(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_expires ON idempotency_keys(expires_at);

-- Cleanup old idempotency keys
CREATE OR REPLACE FUNCTION cleanup_expired_idempotency_keys()
RETURNS INTEGER AS $$
DECLARE
    v_deleted INTEGER;
BEGIN
    DELETE FROM idempotency_keys WHERE expires_at < NOW();
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- 5. DRIVER AVAILABILITY & HOS TRACKING
-- ==============================================================================

-- Driver shifts
CREATE TABLE IF NOT EXISTS driver_shifts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id           UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,

    -- Shift times
    shift_date          DATE NOT NULL,
    shift_start         TIME NOT NULL,
    shift_end           TIME NOT NULL,

    -- Actual times
    actual_start        TIMESTAMPTZ,
    actual_end          TIMESTAMPTZ,

    -- Break tracking
    break_start         TIME,
    break_end           TIME,

    -- Status
    status              VARCHAR(20) DEFAULT 'SCHEDULED',
    -- SCHEDULED, ACTIVE, ON_BREAK, COMPLETED, CANCELLED, NO_SHOW

    -- Notes
    notes               TEXT,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(driver_id, shift_date)
);

CREATE INDEX IF NOT EXISTS idx_driver_shifts_driver_date ON driver_shifts(driver_id, shift_date);
CREATE INDEX IF NOT EXISTS idx_driver_shifts_date ON driver_shifts(shift_date);

-- Driver availability slots (for dispatch assignment)
CREATE TABLE IF NOT EXISTS driver_availability (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id           UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,

    -- Availability window
    available_from      TIMESTAMPTZ NOT NULL,
    available_until     TIMESTAMPTZ NOT NULL,

    -- Location
    start_location_id   UUID REFERENCES locations(id),
    start_latitude      DECIMAL(10,7),
    start_longitude     DECIMAL(10,7),

    -- Capacity
    max_trips           INTEGER DEFAULT 3,
    current_trips       INTEGER DEFAULT 0,

    -- Status
    status              VARCHAR(20) DEFAULT 'AVAILABLE',
    -- AVAILABLE, PARTIALLY_BOOKED, FULLY_BOOKED, OFF_DUTY

    -- Equipment
    has_chassis         BOOLEAN DEFAULT FALSE,
    chassis_size        VARCHAR(20),

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_driver_availability_driver ON driver_availability(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_availability_window ON driver_availability(available_from, available_until);
CREATE INDEX IF NOT EXISTS idx_driver_availability_status ON driver_availability(status);

-- HOS (Hours of Service) Tracking
CREATE TABLE IF NOT EXISTS driver_hos_logs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id           UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,

    -- HOS Period
    log_date            DATE NOT NULL,

    -- Hours
    driving_hours       DECIMAL(4,2) DEFAULT 0,
    on_duty_hours       DECIMAL(4,2) DEFAULT 0,
    off_duty_hours      DECIMAL(4,2) DEFAULT 0,
    sleeper_hours       DECIMAL(4,2) DEFAULT 0,

    -- Cumulative (7/8 day rolling)
    cumulative_7day     DECIMAL(5,2) DEFAULT 0,
    cumulative_8day     DECIMAL(5,2) DEFAULT 0,

    -- Compliance status
    is_compliant        BOOLEAN DEFAULT TRUE,
    violation_type      VARCHAR(50),
    violation_notes     TEXT,

    -- 34-hour reset tracking
    last_reset_start    TIMESTAMPTZ,
    last_reset_end      TIMESTAMPTZ,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(driver_id, log_date)
);

CREATE INDEX IF NOT EXISTS idx_hos_driver_date ON driver_hos_logs(driver_id, log_date DESC);

-- Driver certifications/endorsements
CREATE TABLE IF NOT EXISTS driver_certifications (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id           UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,

    certification_type  VARCHAR(50) NOT NULL,
    -- CDL, HAZMAT, TANKER, DOUBLES, TWIC, PORT_ACCESS

    certification_number VARCHAR(100),
    issued_by           VARCHAR(100),

    issue_date          DATE,
    expiry_date         DATE,

    is_active           BOOLEAN DEFAULT TRUE,

    -- Document storage
    document_url        TEXT,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(driver_id, certification_type)
);

CREATE INDEX IF NOT EXISTS idx_driver_certs ON driver_certifications(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_certs_expiry ON driver_certifications(expiry_date) WHERE is_active = TRUE;

-- Function to check driver availability
CREATE OR REPLACE FUNCTION check_driver_availability(
    p_driver_id UUID,
    p_start_time TIMESTAMPTZ,
    p_duration_hours INTEGER DEFAULT 4
)
RETURNS TABLE (
    is_available BOOLEAN,
    available_hours DECIMAL(4,2),
    hos_remaining DECIMAL(4,2),
    reason VARCHAR(200)
) AS $$
DECLARE
    v_shift_exists BOOLEAN;
    v_hos_remaining DECIMAL(4,2);
    v_current_trips INTEGER;
    v_max_trips INTEGER;
BEGIN
    -- Check if driver has a shift scheduled
    SELECT EXISTS(
        SELECT 1 FROM driver_shifts ds
        WHERE ds.driver_id = p_driver_id
        AND ds.shift_date = p_start_time::DATE
        AND ds.status IN ('SCHEDULED', 'ACTIVE')
        AND p_start_time::TIME BETWEEN ds.shift_start AND ds.shift_end
    ) INTO v_shift_exists;

    IF NOT v_shift_exists THEN
        RETURN QUERY SELECT FALSE, 0::DECIMAL(4,2), 0::DECIMAL(4,2),
            'No shift scheduled for this time'::VARCHAR(200);
        RETURN;
    END IF;

    -- Check HOS compliance
    SELECT 11 - COALESCE(dh.driving_hours, 0) INTO v_hos_remaining
    FROM driver_hos_logs dh
    WHERE dh.driver_id = p_driver_id
    AND dh.log_date = CURRENT_DATE;

    v_hos_remaining := COALESCE(v_hos_remaining, 11);

    IF v_hos_remaining < p_duration_hours THEN
        RETURN QUERY SELECT FALSE, v_hos_remaining, v_hos_remaining,
            'Insufficient HOS remaining'::VARCHAR(200);
        RETURN;
    END IF;

    -- Check availability slot booking
    SELECT da.current_trips, da.max_trips INTO v_current_trips, v_max_trips
    FROM driver_availability da
    WHERE da.driver_id = p_driver_id
    AND p_start_time BETWEEN da.available_from AND da.available_until
    AND da.status != 'FULLY_BOOKED';

    IF v_current_trips >= v_max_trips THEN
        RETURN QUERY SELECT FALSE, 0::DECIMAL(4,2), v_hos_remaining,
            'Driver fully booked for this time slot'::VARCHAR(200);
        RETURN;
    END IF;

    -- Driver is available
    RETURN QUERY SELECT TRUE, v_hos_remaining, v_hos_remaining, NULL::VARCHAR(200);
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- 6. SOFT DELETE SUPPORT
-- ==============================================================================

-- Add deleted_at to tables that don't have it
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE containers ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Indexes for soft delete queries
CREATE INDEX IF NOT EXISTS idx_shipments_deleted ON shipments(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_containers_deleted ON containers(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_orders_deleted ON orders(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_trips_deleted ON trips(deleted_at) WHERE deleted_at IS NULL;

-- ==============================================================================
-- 7. NOTIFICATION SYSTEM
-- ==============================================================================

CREATE TABLE IF NOT EXISTS notification_templates (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code                VARCHAR(50) NOT NULL UNIQUE,
    name                VARCHAR(100) NOT NULL,

    -- Template content
    subject_template    TEXT,
    body_template       TEXT NOT NULL,
    sms_template        TEXT,

    -- Channels
    send_email          BOOLEAN DEFAULT TRUE,
    send_sms            BOOLEAN DEFAULT FALSE,
    send_push           BOOLEAN DEFAULT FALSE,

    -- Settings
    is_active           BOOLEAN DEFAULT TRUE,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert default templates
INSERT INTO notification_templates (code, name, subject_template, body_template, sms_template, send_email, send_sms) VALUES
('ORDER_CREATED', 'Order Created', 'New Order #{{order_number}}',
    'A new order has been created.\n\nOrder: {{order_number}}\nContainer: {{container_number}}\nCustomer: {{customer_name}}\n\nPlease review and dispatch.',
    'New order {{order_number}} created for {{container_number}}', TRUE, FALSE),
('TRIP_ASSIGNED', 'Trip Assigned to Driver',  'Trip Assignment: {{trip_number}}',
    'You have been assigned a new trip.\n\nTrip: {{trip_number}}\nPickup: {{pickup_location}}\nDelivery: {{delivery_location}}\nScheduled: {{scheduled_time}}',
    'Trip {{trip_number}} assigned. Pickup at {{pickup_location}}', TRUE, TRUE),
('CONTAINER_AVAILABLE', 'Container Available for Pickup', 'Container {{container_number}} Available',
    'Container {{container_number}} is now available for pickup at {{terminal_name}}.\n\nLast Free Day: {{last_free_day}}',
    '{{container_number}} available at {{terminal_name}}. LFD: {{last_free_day}}', TRUE, TRUE),
('DEMURRAGE_WARNING', 'Demurrage Warning', 'URGENT: Demurrage Warning - {{container_number}}',
    'WARNING: Container {{container_number}} free time expires in {{hours_remaining}} hours.\n\nLast Free Day: {{last_free_day}}\nEstimated Demurrage: ${{estimated_demurrage}}\n\nPlease take action immediately.',
    'URGENT: {{container_number}} demurrage in {{hours_remaining}}h. LFD: {{last_free_day}}', TRUE, TRUE),
('DELIVERY_COMPLETE', 'Delivery Completed', 'Delivery Complete: {{container_number}}',
    'Delivery has been completed.\n\nContainer: {{container_number}}\nDelivered To: {{delivery_location}}\nTime: {{completion_time}}\nPOD: {{pod_status}}',
    'Delivered: {{container_number}} to {{delivery_location}}', TRUE, TRUE),
('EXCEPTION_ALERT', 'Exception Alert', 'ALERT: {{exception_type}} - {{container_number}}',
    'An exception has been detected:\n\nType: {{exception_type}}\nContainer: {{container_number}}\nDetails: {{exception_details}}\n\nPlease investigate.',
    'ALERT: {{exception_type}} on {{container_number}}', TRUE, TRUE)
ON CONFLICT (code) DO NOTHING;

-- Notification queue
CREATE TABLE IF NOT EXISTS notifications (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_code       VARCHAR(50) NOT NULL,

    -- Recipients
    recipient_email     VARCHAR(255),
    recipient_phone     VARCHAR(50),
    recipient_user_id   UUID,

    -- Content (rendered)
    subject             VARCHAR(500),
    body                TEXT,
    sms_body            VARCHAR(500),

    -- Variables used
    variables           JSONB,

    -- Channels sent
    email_sent          BOOLEAN DEFAULT FALSE,
    email_sent_at       TIMESTAMPTZ,
    sms_sent            BOOLEAN DEFAULT FALSE,
    sms_sent_at         TIMESTAMPTZ,
    push_sent           BOOLEAN DEFAULT FALSE,
    push_sent_at        TIMESTAMPTZ,

    -- Status
    status              VARCHAR(20) DEFAULT 'PENDING',
    -- PENDING, SENT, PARTIAL, FAILED
    error_message       TEXT,

    -- Retry tracking
    retry_count         INTEGER DEFAULT 0,
    next_retry_at       TIMESTAMPTZ,

    -- References
    order_id            UUID REFERENCES orders(id),
    trip_id             UUID REFERENCES trips(id),

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);
CREATE INDEX IF NOT EXISTS idx_notifications_pending ON notifications(status, next_retry_at)
    WHERE status IN ('PENDING', 'PARTIAL');
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_user_id);

-- ==============================================================================
-- 8. VALIDATION RULES
-- ==============================================================================

CREATE TABLE IF NOT EXISTS validation_rules (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_code           VARCHAR(50) NOT NULL UNIQUE,
    rule_name           VARCHAR(100) NOT NULL,

    -- Rule definition
    entity_type         VARCHAR(50) NOT NULL, -- orders, shipments, containers, trips
    field_name          VARCHAR(100),
    rule_type           VARCHAR(30) NOT NULL, -- REQUIRED, FORMAT, RANGE, CUSTOM, DEPENDENCY

    -- Validation parameters
    rule_expression     TEXT, -- SQL or regex expression
    error_message       TEXT NOT NULL,

    -- Settings
    severity            VARCHAR(20) DEFAULT 'ERROR', -- ERROR, WARNING, INFO
    is_active           BOOLEAN DEFAULT TRUE,
    applies_to_import   BOOLEAN DEFAULT TRUE,
    applies_to_export   BOOLEAN DEFAULT TRUE,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert validation rules
INSERT INTO validation_rules (rule_code, rule_name, entity_type, field_name, rule_type, rule_expression, error_message, severity) VALUES
-- Container validations
('CONTAINER_NUMBER_FORMAT', 'Container Number Format', 'containers', 'container_number', 'FORMAT',
    '^[A-Z]{4}[0-9]{7}$', 'Container number must be 4 letters followed by 7 digits (e.g., MAEU1234567)', 'ERROR'),
('CONTAINER_WEIGHT_RANGE', 'Container Weight Range', 'containers', 'weight_lbs', 'RANGE',
    'weight_lbs BETWEEN 1000 AND 55000', 'Container weight must be between 1,000 and 55,000 lbs', 'WARNING'),
('HAZMAT_CLASS_REQUIRED', 'Hazmat Class Required', 'containers', 'hazmat_class', 'DEPENDENCY',
    'NOT is_hazmat OR hazmat_class IS NOT NULL', 'Hazmat containers must have a hazmat class specified', 'ERROR'),
('REEFER_TEMP_REQUIRED', 'Reefer Temperature Required', 'containers', 'reefer_temp_setpoint', 'DEPENDENCY',
    'NOT is_reefer OR reefer_temp_setpoint IS NOT NULL', 'Reefer containers must have temperature setpoint', 'ERROR'),

-- Shipment validations
('BOOKING_NUMBER_REQUIRED_EXPORT', 'Booking Number Required for Export', 'shipments', 'booking_number', 'DEPENDENCY',
    'type != ''EXPORT'' OR booking_number IS NOT NULL', 'Export shipments require a booking number', 'ERROR'),
('LFD_FUTURE_DATE', 'Last Free Day Must Be Future', 'shipments', 'last_free_day', 'CUSTOM',
    'last_free_day IS NULL OR last_free_day >= CURRENT_DATE', 'Last Free Day cannot be in the past', 'WARNING'),
('PORT_CUTOFF_REQUIRED_EXPORT', 'Port Cutoff Required for Export', 'shipments', 'port_cutoff', 'DEPENDENCY',
    'type != ''EXPORT'' OR port_cutoff IS NOT NULL', 'Export shipments require port cutoff date', 'ERROR'),

-- Order validations
('DELIVERY_LOCATION_REQUIRED', 'Delivery Location Required', 'orders', 'delivery_location_id', 'REQUIRED',
    'delivery_location_id IS NOT NULL', 'Delivery location is required', 'ERROR'),
('DRIVER_HAZMAT_CERTIFICATION', 'Driver Hazmat Certification', 'trips', NULL, 'CUSTOM',
    'SELECT EXISTS(SELECT 1 FROM driver_certifications dc WHERE dc.driver_id = trips.driver_id AND dc.certification_type = ''HAZMAT'' AND dc.expiry_date > CURRENT_DATE)',
    'Driver must have valid HAZMAT certification for hazardous cargo', 'ERROR'),

-- Trip validations
('TRIP_HAS_CONTAINER', 'Trip Must Have Container', 'trips', 'container_id', 'DEPENDENCY',
    'container_id IS NOT NULL OR container_number IS NOT NULL', 'Trip must be associated with a container', 'ERROR'),
('CHASSIS_COMPATIBILITY', 'Chassis Size Compatibility', 'trips', NULL, 'CUSTOM',
    'check_equipment_compatibility(container_size, container_type, chassis_type, chassis_size)',
    'Chassis is not compatible with container size/type', 'ERROR')
ON CONFLICT (rule_code) DO NOTHING;

-- ==============================================================================
-- 9. ADDITIONAL QUERY OPTIMIZATION INDEXES
-- ==============================================================================

-- Orders - frequently queried columns
CREATE INDEX IF NOT EXISTS idx_orders_status_created ON orders(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_customer_status ON orders(shipment_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_container ON orders(container_id);

-- Shipments
CREATE INDEX IF NOT EXISTS idx_shipments_customer ON shipments(customer_id);
CREATE INDEX IF NOT EXISTS idx_shipments_status_type ON shipments(status, type);
CREATE INDEX IF NOT EXISTS idx_shipments_lfd ON shipments(last_free_day) WHERE last_free_day IS NOT NULL;

-- Containers
CREATE INDEX IF NOT EXISTS idx_containers_customs_status ON containers(customs_status);
CREATE INDEX IF NOT EXISTS idx_containers_demurrage ON containers(demurrage_status)
    WHERE demurrage_status IN ('WARNING', 'CRITICAL', 'OVERDUE');

-- Trips
CREATE INDEX IF NOT EXISTS idx_trips_driver_status ON trips(driver_id, status);
CREATE INDEX IF NOT EXISTS idx_trips_scheduled ON trips(scheduled_date) WHERE status IN ('PLANNED', 'ASSIGNED', 'DISPATCHED');
CREATE INDEX IF NOT EXISTS idx_trips_status_date ON trips(status, created_at DESC);

-- Drivers
CREATE INDEX IF NOT EXISTS idx_drivers_active ON drivers(id) WHERE status = 'ACTIVE';

-- Locations
CREATE INDEX IF NOT EXISTS idx_locations_type ON locations(type);
CREATE INDEX IF NOT EXISTS idx_locations_city_state ON locations(city, state);

-- ==============================================================================
-- 10. HELPER FUNCTIONS FOR REAL-TIME UPDATES
-- ==============================================================================

-- Notify on order changes (for Supabase Realtime)
CREATE OR REPLACE FUNCTION notify_order_change()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM pg_notify(
        'order_changes',
        json_build_object(
            'action', TG_OP,
            'order_id', COALESCE(NEW.id, OLD.id),
            'order_number', COALESCE(NEW.order_number, OLD.order_number),
            'status', COALESCE(NEW.status, OLD.status),
            'timestamp', NOW()
        )::text
    );
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS order_change_notify ON orders;
CREATE TRIGGER order_change_notify
    AFTER INSERT OR UPDATE OR DELETE ON orders
    FOR EACH ROW EXECUTE FUNCTION notify_order_change();

-- Notify on trip changes
CREATE OR REPLACE FUNCTION notify_trip_change()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM pg_notify(
        'trip_changes',
        json_build_object(
            'action', TG_OP,
            'trip_id', COALESCE(NEW.id, OLD.id),
            'trip_number', COALESCE(NEW.trip_number, OLD.trip_number),
            'status', COALESCE(NEW.status, OLD.status),
            'driver_id', COALESCE(NEW.driver_id, OLD.driver_id),
            'timestamp', NOW()
        )::text
    );
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trip_change_notify ON trips;
CREATE TRIGGER trip_change_notify
    AFTER INSERT OR UPDATE OR DELETE ON trips
    FOR EACH ROW EXECUTE FUNCTION notify_trip_change();

-- ==============================================================================
-- SUCCESS MESSAGE
-- ==============================================================================

DO $$
BEGIN
    RAISE NOTICE 'SUCCESS: Production critical fixes migration completed';
    RAISE NOTICE '';
    RAISE NOTICE 'Features added:';
    RAISE NOTICE '  1. Unique constraints to prevent duplicates';
    RAISE NOTICE '  2. Audit trail with triggers for compliance';
    RAISE NOTICE '  3. Outbox pattern for reliable event publishing';
    RAISE NOTICE '  4. Idempotency keys for duplicate request prevention';
    RAISE NOTICE '  5. Driver availability and HOS tracking';
    RAISE NOTICE '  6. Soft delete support';
    RAISE NOTICE '  7. Notification system infrastructure';
    RAISE NOTICE '  8. Validation rules table';
    RAISE NOTICE '  9. Query optimization indexes';
    RAISE NOTICE '  10. Real-time notification triggers';
END $$;
