-- =====================================================
-- DrayMaster TMS - Production Enhancements Migration
-- Version: 1.0.0
-- Date: 2026-01-30
-- Description: Adds tables for appointments, exceptions,
--              and enhanced CRUD operations
-- =====================================================

-- =====================================================
-- 1. TERMINAL APPOINTMENTS
-- =====================================================

-- Terminal appointment types and statuses
DO $$ BEGIN
    CREATE TYPE appointment_type AS ENUM ('PICKUP', 'RETURN', 'DROP_OFF', 'DUAL');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE appointment_status AS ENUM (
        'REQUESTED',
        'PENDING',
        'CONFIRMED',
        'CANCELLED',
        'COMPLETED',
        'MISSED',
        'RESCHEDULED'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Terminal appointments table
CREATE TABLE IF NOT EXISTS terminal_appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    trip_id UUID REFERENCES trips(id) ON DELETE SET NULL,
    terminal_id UUID NOT NULL,
    terminal_name VARCHAR(200),
    type appointment_type NOT NULL,
    status appointment_status NOT NULL DEFAULT 'REQUESTED',
    container_id UUID,
    container_number VARCHAR(11),
    chassis_id UUID,
    driver_id UUID,
    tractor_id UUID,
    requested_time TIMESTAMPTZ NOT NULL,
    confirmed_time TIMESTAMPTZ,
    window_start_time TIMESTAMPTZ NOT NULL,
    window_end_time TIMESTAMPTZ NOT NULL,
    confirmation_number VARCHAR(50),
    gate_number VARCHAR(20),
    lane_number VARCHAR(20),
    special_instructions TEXT,
    actual_arrival_time TIMESTAMPTZ,
    actual_completion_time TIMESTAMPTZ,
    gate_ticket_number VARCHAR(50),
    cancellation_reason TEXT,
    rescheduled_from UUID REFERENCES terminal_appointments(id),
    requested_by VARCHAR(100) NOT NULL,
    requested_by_id UUID,
    confirmed_by VARCHAR(100),
    terminal_reference VARCHAR(100),
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for terminal appointments
CREATE INDEX IF NOT EXISTS idx_appointments_order_id ON terminal_appointments(order_id);
CREATE INDEX IF NOT EXISTS idx_appointments_trip_id ON terminal_appointments(trip_id) WHERE trip_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_appointments_terminal_id ON terminal_appointments(terminal_id);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON terminal_appointments(status);
CREATE INDEX IF NOT EXISTS idx_appointments_window_start ON terminal_appointments(window_start_time);
CREATE INDEX IF NOT EXISTS idx_appointments_confirmation ON terminal_appointments(confirmation_number) WHERE confirmation_number IS NOT NULL;

-- Terminal gate hours
CREATE TABLE IF NOT EXISTS terminal_gate_hours (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    terminal_id UUID NOT NULL,
    day_of_week INTEGER CHECK (day_of_week >= 0 AND day_of_week <= 6),
    open_time TIME NOT NULL,
    close_time TIME NOT NULL,
    is_holiday BOOLEAN DEFAULT false,
    is_closed BOOLEAN DEFAULT false,
    special_date DATE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gate_hours_terminal ON terminal_gate_hours(terminal_id);
CREATE INDEX IF NOT EXISTS idx_gate_hours_special_date ON terminal_gate_hours(special_date) WHERE special_date IS NOT NULL;

-- =====================================================
-- 2. EXCEPTIONS MANAGEMENT
-- =====================================================

-- Exception types, severity, and status
DO $$ BEGIN
    CREATE TYPE exception_type AS ENUM (
        'FAILED_PICKUP',
        'FAILED_DELIVERY',
        'TERMINAL_CLOSED',
        'EQUIPMENT_FAILURE',
        'CHASSIS_UNAVAILABLE',
        'CONTAINER_UNAVAILABLE',
        'CUSTOMS_HOLD',
        'WEATHER_DELAY',
        'DRIVER_UNAVAILABLE',
        'ACCIDENT',
        'ROAD_CLOSURE',
        'APPOINTMENT_MISSED',
        'WEIGHT_ISSUE',
        'DAMAGE',
        'OTHER'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE exception_severity AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE exception_status AS ENUM (
        'OPEN',
        'ACKNOWLEDGED',
        'IN_PROGRESS',
        'RESOLVED',
        'CLOSED',
        'CANCELLED'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Exceptions table
CREATE TABLE IF NOT EXISTS exceptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    stop_id UUID REFERENCES trip_stops(id) ON DELETE SET NULL,
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    container_id UUID,
    driver_id UUID,
    type exception_type NOT NULL,
    severity exception_severity NOT NULL,
    status exception_status NOT NULL DEFAULT 'OPEN',
    title VARCHAR(200) NOT NULL,
    description TEXT,
    location_id UUID,
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    reported_by VARCHAR(100) NOT NULL,
    reported_by_id UUID,
    assigned_to VARCHAR(100),
    assigned_to_id UUID,
    resolution TEXT,
    resolution_notes TEXT,
    estimated_delay_mins INTEGER,
    actual_delay_mins INTEGER,
    financial_impact DECIMAL(10, 2),
    requires_reschedule BOOLEAN DEFAULT false,
    requires_reassignment BOOLEAN DEFAULT false,
    photo_urls TEXT[],
    document_urls TEXT[],
    metadata JSONB,
    occurred_at TIMESTAMPTZ NOT NULL,
    acknowledged_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for exceptions
CREATE INDEX IF NOT EXISTS idx_exceptions_trip_id ON exceptions(trip_id);
CREATE INDEX IF NOT EXISTS idx_exceptions_stop_id ON exceptions(stop_id) WHERE stop_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_exceptions_order_id ON exceptions(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_exceptions_type ON exceptions(type);
CREATE INDEX IF NOT EXISTS idx_exceptions_severity ON exceptions(severity);
CREATE INDEX IF NOT EXISTS idx_exceptions_status ON exceptions(status);
CREATE INDEX IF NOT EXISTS idx_exceptions_occurred_at ON exceptions(occurred_at);
CREATE INDEX IF NOT EXISTS idx_exceptions_open ON exceptions(status) WHERE status IN ('OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS');

-- Exception comments
CREATE TABLE IF NOT EXISTS exception_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exception_id UUID NOT NULL REFERENCES exceptions(id) ON DELETE CASCADE,
    author_id UUID,
    author_name VARCHAR(100) NOT NULL,
    comment TEXT NOT NULL,
    is_internal BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exception_comments_exception_id ON exception_comments(exception_id);
CREATE INDEX IF NOT EXISTS idx_exception_comments_created_at ON exception_comments(created_at);

-- Exception history (status changes)
CREATE TABLE IF NOT EXISTS exception_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exception_id UUID NOT NULL REFERENCES exceptions(id) ON DELETE CASCADE,
    from_status exception_status,
    to_status exception_status NOT NULL,
    changed_by VARCHAR(100),
    changed_by_id UUID,
    notes TEXT,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exception_history_exception_id ON exception_history(exception_id);
CREATE INDEX IF NOT EXISTS idx_exception_history_changed_at ON exception_history(changed_at);

-- =====================================================
-- 3. ENHANCED ORDERS TABLE (Additional Columns)
-- =====================================================

-- Add columns if they don't exist
DO $$
BEGIN
    -- Add move_type if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'orders' AND column_name = 'move_type'
    ) THEN
        ALTER TABLE orders ADD COLUMN move_type VARCHAR(50);
    END IF;

    -- Add customer_reference if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'orders' AND column_name = 'customer_reference'
    ) THEN
        ALTER TABLE orders ADD COLUMN customer_reference VARCHAR(100);
    END IF;

    -- Add deleted_at for soft deletes if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'orders' AND column_name = 'deleted_at'
    ) THEN
        ALTER TABLE orders ADD COLUMN deleted_at TIMESTAMPTZ;
    END IF;
END $$;

-- Enhanced indexes for orders
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_type ON orders(type);
CREATE INDEX IF NOT EXISTS idx_orders_billing_status ON orders(billing_status);
CREATE INDEX IF NOT EXISTS idx_orders_shipment_id ON orders(shipment_id);
CREATE INDEX IF NOT EXISTS idx_orders_container_id ON orders(container_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_pickup_date ON orders(requested_pickup_date) WHERE requested_pickup_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_delivery_date ON orders(requested_delivery_date) WHERE requested_delivery_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_customer_ref ON orders(customer_reference) WHERE customer_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_active ON orders(status) WHERE status NOT IN ('COMPLETED', 'CANCELLED');
CREATE INDEX IF NOT EXISTS idx_orders_not_deleted ON orders(deleted_at) WHERE deleted_at IS NULL;

-- =====================================================
-- 4. ENHANCED TRIPS TABLE (Additional Columns)
-- =====================================================

-- Add columns if they don't exist
DO $$
BEGIN
    -- Add revenue if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'trips' AND column_name = 'revenue'
    ) THEN
        ALTER TABLE trips ADD COLUMN revenue DECIMAL(10, 2) DEFAULT 0;
    END IF;

    -- Add cost if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'trips' AND column_name = 'cost'
    ) THEN
        ALTER TABLE trips ADD COLUMN cost DECIMAL(10, 2) DEFAULT 0;
    END IF;

    -- Add deleted_at for soft deletes if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'trips' AND column_name = 'deleted_at'
    ) THEN
        ALTER TABLE trips ADD COLUMN deleted_at TIMESTAMPTZ;
    END IF;
END $$;

-- Enhanced indexes for trips
CREATE INDEX IF NOT EXISTS idx_trips_status ON trips(status);
CREATE INDEX IF NOT EXISTS idx_trips_type ON trips(type);
CREATE INDEX IF NOT EXISTS idx_trips_driver_id ON trips(driver_id) WHERE driver_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trips_tractor_id ON trips(tractor_id) WHERE tractor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trips_planned_start ON trips(planned_start_time) WHERE planned_start_time IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trips_planned_end ON trips(planned_end_time) WHERE planned_end_time IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trips_actual_start ON trips(actual_start_time) WHERE actual_start_time IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trips_actual_end ON trips(actual_end_time) WHERE actual_end_time IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trips_trip_number ON trips(trip_number);
CREATE INDEX IF NOT EXISTS idx_trips_street_turn ON trips(is_street_turn) WHERE is_street_turn = true;
CREATE INDEX IF NOT EXISTS idx_trips_dual_transaction ON trips(is_dual_transaction) WHERE is_dual_transaction = true;
CREATE INDEX IF NOT EXISTS idx_trips_active ON trips(status) WHERE status IN ('DISPATCHED', 'EN_ROUTE', 'IN_PROGRESS');
CREATE INDEX IF NOT EXISTS idx_trips_not_deleted ON trips(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_trips_created_at ON trips(created_at);

-- =====================================================
-- 5. ENHANCED TRIP STOPS TABLE (Additional Columns)
-- =====================================================

-- Add columns if they don't exist
DO $$
BEGIN
    -- Add cancelled status support
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'trip_stops' AND column_name = 'deleted_at'
    ) THEN
        ALTER TABLE trip_stops ADD COLUMN deleted_at TIMESTAMPTZ;
    END IF;
END $$;

-- Enhanced indexes for trip_stops
CREATE INDEX IF NOT EXISTS idx_trip_stops_trip_id ON trip_stops(trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_stops_sequence ON trip_stops(trip_id, sequence);
CREATE INDEX IF NOT EXISTS idx_trip_stops_status ON trip_stops(status);
CREATE INDEX IF NOT EXISTS idx_trip_stops_location_id ON trip_stops(location_id);
CREATE INDEX IF NOT EXISTS idx_trip_stops_order_id ON trip_stops(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trip_stops_container_id ON trip_stops(container_id) WHERE container_id IS NOT NULL;

-- =====================================================
-- 6. TRIGGER FUNCTIONS FOR UPDATED_AT
-- =====================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to terminal_appointments
DROP TRIGGER IF EXISTS trigger_update_appointments_updated_at ON terminal_appointments;
CREATE TRIGGER trigger_update_appointments_updated_at
    BEFORE UPDATE ON terminal_appointments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to terminal_gate_hours
DROP TRIGGER IF EXISTS trigger_update_gate_hours_updated_at ON terminal_gate_hours;
CREATE TRIGGER trigger_update_gate_hours_updated_at
    BEFORE UPDATE ON terminal_gate_hours
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to exceptions
DROP TRIGGER IF EXISTS trigger_update_exceptions_updated_at ON exceptions;
CREATE TRIGGER trigger_update_exceptions_updated_at
    BEFORE UPDATE ON exceptions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 7. VIEWS FOR COMMON QUERIES
-- =====================================================

-- View: Active orders with container info
CREATE OR REPLACE VIEW v_active_orders AS
SELECT
    o.id,
    o.order_number,
    o.type,
    o.status,
    o.billing_status,
    o.customer_reference,
    o.requested_pickup_date,
    o.requested_delivery_date,
    c.container_number,
    c.size AS container_size,
    c.type AS container_type,
    c.weight_lbs,
    c.is_hazmat,
    c.is_overweight,
    c.customs_status,
    o.created_at,
    o.updated_at
FROM orders o
LEFT JOIN containers c ON o.container_id = c.id
WHERE o.status NOT IN ('COMPLETED', 'CANCELLED')
  AND o.deleted_at IS NULL;

-- View: Active trips with driver info
CREATE OR REPLACE VIEW v_active_trips AS
SELECT
    t.id,
    t.trip_number,
    t.type,
    t.status,
    t.driver_id,
    t.planned_start_time,
    t.planned_end_time,
    t.total_miles,
    t.estimated_duration_mins,
    t.is_street_turn,
    t.is_dual_transaction,
    COUNT(ts.id) AS total_stops,
    COUNT(ts.id) FILTER (WHERE ts.status = 'COMPLETED') AS completed_stops,
    t.created_at,
    t.updated_at
FROM trips t
LEFT JOIN trip_stops ts ON t.id = ts.trip_id
WHERE t.status IN ('DISPATCHED', 'EN_ROUTE', 'IN_PROGRESS')
  AND t.deleted_at IS NULL
GROUP BY t.id;

-- View: Open exceptions summary
CREATE OR REPLACE VIEW v_open_exceptions AS
SELECT
    e.id,
    e.trip_id,
    e.type,
    e.severity,
    e.status,
    e.title,
    e.occurred_at,
    e.estimated_delay_mins,
    e.requires_reschedule,
    e.requires_reassignment,
    e.reported_by,
    e.assigned_to,
    COUNT(ec.id) AS comment_count,
    e.created_at
FROM exceptions e
LEFT JOIN exception_comments ec ON e.id = ec.exception_id
WHERE e.status IN ('OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS')
GROUP BY e.id;

-- View: Upcoming appointments
CREATE OR REPLACE VIEW v_upcoming_appointments AS
SELECT
    a.id,
    a.order_id,
    a.terminal_id,
    a.type,
    a.status,
    a.container_number,
    a.window_start_time,
    a.window_end_time,
    a.confirmation_number,
    o.order_number,
    o.customer_reference,
    a.created_at
FROM terminal_appointments a
LEFT JOIN orders o ON a.order_id = o.id
WHERE a.status IN ('REQUESTED', 'PENDING', 'CONFIRMED')
  AND a.window_start_time > NOW()
ORDER BY a.window_start_time;

-- =====================================================
-- 8. GRANT PERMISSIONS (Adjust as needed)
-- =====================================================

-- Grant permissions to application user (replace 'draymaster_app' with your user)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO draymaster_app;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO draymaster_app;
-- GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO draymaster_app;

-- =====================================================
-- 9. SAMPLE DATA (Optional - for testing)
-- =====================================================

-- You can uncomment this section to insert sample terminal gate hours
/*
INSERT INTO terminal_gate_hours (terminal_id, day_of_week, open_time, close_time, is_closed)
VALUES
    ('your-terminal-id', 1, '06:00:00', '18:00:00', false), -- Monday
    ('your-terminal-id', 2, '06:00:00', '18:00:00', false), -- Tuesday
    ('your-terminal-id', 3, '06:00:00', '18:00:00', false), -- Wednesday
    ('your-terminal-id', 4, '06:00:00', '18:00:00', false), -- Thursday
    ('your-terminal-id', 5, '06:00:00', '18:00:00', false), -- Friday
    ('your-terminal-id', 6, '00:00:00', '00:00:00', true),  -- Saturday (closed)
    ('your-terminal-id', 0, '00:00:00', '00:00:00', true);  -- Sunday (closed)
*/

-- =====================================================
-- 10. VERIFICATION QUERIES
-- =====================================================

-- Run these after migration to verify tables were created
SELECT 'terminal_appointments' AS table_name, COUNT(*) AS count FROM terminal_appointments
UNION ALL
SELECT 'terminal_gate_hours', COUNT(*) FROM terminal_gate_hours
UNION ALL
SELECT 'exceptions', COUNT(*) FROM exceptions
UNION ALL
SELECT 'exception_comments', COUNT(*) FROM exception_comments
UNION ALL
SELECT 'exception_history', COUNT(*) FROM exception_history;

-- Verify indexes
SELECT
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('terminal_appointments', 'exceptions', 'orders', 'trips', 'trip_stops')
ORDER BY tablename, indexname;

-- Verify views
SELECT
    schemaname,
    viewname,
    viewowner
FROM pg_views
WHERE schemaname = 'public'
  AND viewname LIKE 'v_%'
ORDER BY viewname;

-- =====================================================
-- END OF MIGRATION
-- =====================================================

-- Migration completed successfully
SELECT 'Migration 001_production_enhancements.sql completed successfully!' AS status;
