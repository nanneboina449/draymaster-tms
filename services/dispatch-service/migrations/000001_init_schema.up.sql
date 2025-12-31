-- 000001_init_schema.up.sql
-- Dispatch Service Database Schema

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enum types
CREATE TYPE trip_type AS ENUM (
    'LIVE_LOAD', 'LIVE_UNLOAD', 'DROP_HOOK_SAME', 'DROP_HOOK_DIFF',
    'DROP_ONLY', 'STREET_TURN', 'DUAL_TRANSACTION', 'BOBTAIL',
    'EMPTY_PICKUP', 'EMPTY_RETURN', 'PRE_PULL', 'TRANSLOAD'
);

CREATE TYPE trip_status AS ENUM (
    'DRAFT', 'PLANNED', 'ASSIGNED', 'DISPATCHED', 'EN_ROUTE',
    'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'FAILED'
);

CREATE TYPE stop_type AS ENUM ('PICKUP', 'DELIVERY', 'RETURN', 'YARD');

CREATE TYPE activity_type AS ENUM (
    'PICKUP_LOADED', 'PICKUP_EMPTY', 'DELIVER_LOADED', 'DROP_LOADED',
    'DROP_EMPTY', 'HOOK_EMPTY', 'LIVE_LOAD', 'LIVE_UNLOAD',
    'CHASSIS_PICKUP', 'CHASSIS_DROP', 'FUEL_STOP', 'SCALE', 'CUSTOMS_EXAM'
);

CREATE TYPE stop_status AS ENUM (
    'PENDING', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'SKIPPED'
);

-- Trips table
CREATE TABLE trips (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trip_number VARCHAR(20) UNIQUE NOT NULL,
    type trip_type NOT NULL,
    status trip_status NOT NULL DEFAULT 'PLANNED',
    driver_id UUID,
    tractor_id UUID,
    chassis_id UUID,
    current_stop_sequence INTEGER DEFAULT 1,
    planned_start_time TIMESTAMP WITH TIME ZONE,
    actual_start_time TIMESTAMP WITH TIME ZONE,
    planned_end_time TIMESTAMP WITH TIME ZONE,
    actual_end_time TIMESTAMP WITH TIME ZONE,
    estimated_duration_mins INTEGER DEFAULT 0,
    total_miles DECIMAL(10, 2) DEFAULT 0,
    completed_miles DECIMAL(10, 2) DEFAULT 0,
    is_street_turn BOOLEAN DEFAULT FALSE,
    is_dual_transaction BOOLEAN DEFAULT FALSE,
    linked_trip_id UUID REFERENCES trips(id),
    created_by VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Trip stops table
CREATE TABLE trip_stops (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    sequence INTEGER NOT NULL,
    type stop_type NOT NULL,
    activity activity_type NOT NULL,
    status stop_status NOT NULL DEFAULT 'PENDING',
    location_id UUID NOT NULL,
    container_id UUID,
    container_number VARCHAR(15),
    order_id UUID,
    appointment_time TIMESTAMP WITH TIME ZONE,
    appointment_number VARCHAR(50),
    appointment_window_mins INTEGER DEFAULT 60,
    planned_arrival TIMESTAMP WITH TIME ZONE,
    actual_arrival TIMESTAMP WITH TIME ZONE,
    actual_departure TIMESTAMP WITH TIME ZONE,
    estimated_duration_mins INTEGER DEFAULT 30,
    actual_duration_mins INTEGER DEFAULT 0,
    free_time_mins INTEGER DEFAULT 120,
    detention_start_time TIMESTAMP WITH TIME ZONE,
    detention_mins INTEGER DEFAULT 0,
    chassis_in_id UUID,
    chassis_out_id UUID,
    container_in_id UUID,
    container_out_id UUID,
    gate_ticket_number VARCHAR(50),
    seal_number VARCHAR(50),
    failure_reason TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(trip_id, sequence)
);

-- Trip order associations
CREATE TABLE trip_orders (
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    order_id UUID NOT NULL,
    PRIMARY KEY (trip_id, order_id)
);

-- Stop documents
CREATE TABLE stop_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    stop_id UUID NOT NULL REFERENCES trip_stops(id) ON DELETE CASCADE,
    document_type VARCHAR(50) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_size INTEGER,
    mime_type VARCHAR(100),
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Trip number sequence
CREATE SEQUENCE trip_number_seq START 1;

-- Indexes
CREATE INDEX idx_trips_status ON trips(status);
CREATE INDEX idx_trips_type ON trips(type);
CREATE INDEX idx_trips_driver ON trips(driver_id);
CREATE INDEX idx_trips_planned_start ON trips(planned_start_time);
CREATE INDEX idx_trips_created ON trips(created_at);
CREATE INDEX idx_trips_number ON trips(trip_number);

CREATE INDEX idx_trip_stops_trip ON trip_stops(trip_id);
CREATE INDEX idx_trip_stops_status ON trip_stops(status);
CREATE INDEX idx_trip_stops_location ON trip_stops(location_id);
CREATE INDEX idx_trip_stops_container ON trip_stops(container_id);
CREATE INDEX idx_trip_stops_order ON trip_stops(order_id);
CREATE INDEX idx_trip_stops_sequence ON trip_stops(trip_id, sequence);

CREATE INDEX idx_trip_orders_order ON trip_orders(order_id);

-- Updated at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_trips_updated_at BEFORE UPDATE ON trips
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_trip_stops_updated_at BEFORE UPDATE ON trip_stops
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to generate trip number
CREATE OR REPLACE FUNCTION generate_trip_number()
RETURNS VARCHAR(20) AS $$
DECLARE
    seq_val INTEGER;
    trip_num VARCHAR(20);
BEGIN
    SELECT nextval('trip_number_seq') INTO seq_val;
    trip_num := 'TRP-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(seq_val::TEXT, 4, '0');
    RETURN trip_num;
END;
$$ LANGUAGE plpgsql;

-- View for dispatch board
CREATE VIEW dispatch_board_view AS
SELECT 
    t.id,
    t.trip_number,
    t.type,
    t.status,
    t.driver_id,
    t.tractor_id,
    t.planned_start_time,
    t.estimated_duration_mins,
    t.total_miles,
    t.is_street_turn,
    t.is_dual_transaction,
    COUNT(ts.id) as stop_count,
    MIN(CASE WHEN ts.sequence = 1 THEN ts.location_id END) as first_stop_location,
    MAX(CASE WHEN ts.sequence = (SELECT MAX(sequence) FROM trip_stops WHERE trip_id = t.id) THEN ts.location_id END) as last_stop_location,
    ARRAY_AGG(ts.container_number) FILTER (WHERE ts.container_number IS NOT NULL) as containers
FROM trips t
LEFT JOIN trip_stops ts ON t.id = ts.trip_id
GROUP BY t.id;

-- View for street turn matching
CREATE VIEW street_turn_candidates AS
SELECT 
    t.id as trip_id,
    t.trip_number,
    ts.container_id,
    ts.container_number,
    ts.location_id as delivery_location_id,
    ts.appointment_time as delivery_time,
    t.driver_id
FROM trips t
JOIN trip_stops ts ON t.id = ts.trip_id
WHERE t.type IN ('LIVE_UNLOAD', 'DROP_HOOK_SAME', 'DROP_HOOK_DIFF')
    AND t.status NOT IN ('COMPLETED', 'CANCELLED', 'FAILED')
    AND ts.type = 'DELIVERY'
    AND ts.activity IN ('LIVE_UNLOAD', 'DROP_LOADED');
