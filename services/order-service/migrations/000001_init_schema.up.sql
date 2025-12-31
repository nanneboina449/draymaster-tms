-- 000001_init_schema.up.sql
-- Order Service Database Schema

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enum types
CREATE TYPE shipment_type AS ENUM ('IMPORT', 'EXPORT');
CREATE TYPE shipment_status AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
CREATE TYPE container_size AS ENUM ('20', '40', '45');
CREATE TYPE container_type AS ENUM ('DRY', 'HIGH_CUBE', 'REEFER', 'TANK', 'FLAT_RACK', 'OPEN_TOP');
CREATE TYPE container_state AS ENUM ('LOADED', 'EMPTY');
CREATE TYPE customs_status AS ENUM ('PENDING', 'HOLD', 'RELEASED');
CREATE TYPE location_type AS ENUM ('VESSEL', 'TERMINAL', 'IN_TRANSIT', 'CUSTOMER', 'YARD');
CREATE TYPE order_type AS ENUM ('IMPORT', 'EXPORT', 'REPO', 'EMPTY_RETURN');
CREATE TYPE order_status AS ENUM ('PENDING', 'READY', 'DISPATCHED', 'IN_PROGRESS', 'DELIVERED', 'COMPLETED', 'HOLD', 'CANCELLED', 'FAILED');
CREATE TYPE billing_status AS ENUM ('UNBILLED', 'BILLED', 'PAID');

-- Customers table
CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) UNIQUE NOT NULL,
    type VARCHAR(50) NOT NULL DEFAULT 'both',
    address VARCHAR(500),
    city VARCHAR(100),
    state VARCHAR(50),
    zip VARCHAR(20),
    phone VARCHAR(50),
    email VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Steamship lines table
CREATE TABLE steamship_lines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    code VARCHAR(10) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Locations table (terminals, warehouses, yards)
CREATE TABLE locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,
    address VARCHAR(500),
    city VARCHAR(100),
    state VARCHAR(50),
    zip VARCHAR(20),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    contact_name VARCHAR(255),
    contact_phone VARCHAR(50),
    notes TEXT,
    geofence_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ports table
CREATE TABLE ports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    code VARCHAR(10) UNIQUE NOT NULL,
    city VARCHAR(100),
    state VARCHAR(50),
    country VARCHAR(100) DEFAULT 'USA',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Shipments table
CREATE TABLE shipments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type shipment_type NOT NULL,
    reference_number VARCHAR(100) NOT NULL,
    customer_id UUID NOT NULL REFERENCES customers(id),
    steamship_line_id UUID NOT NULL REFERENCES steamship_lines(id),
    port_id UUID NOT NULL REFERENCES ports(id),
    terminal_id UUID NOT NULL REFERENCES locations(id),
    vessel_name VARCHAR(255),
    voyage_number VARCHAR(50),
    vessel_eta TIMESTAMP WITH TIME ZONE,
    vessel_ata TIMESTAMP WITH TIME ZONE,
    last_free_day DATE,
    port_cutoff TIMESTAMP WITH TIME ZONE,
    doc_cutoff TIMESTAMP WITH TIME ZONE,
    earliest_return_date DATE,
    consignee_id UUID REFERENCES locations(id),
    shipper_id UUID REFERENCES locations(id),
    empty_return_location_id UUID REFERENCES locations(id),
    empty_pickup_location_id UUID REFERENCES locations(id),
    status shipment_status NOT NULL DEFAULT 'PENDING',
    special_instructions TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(steamship_line_id, reference_number)
);

-- Containers table
CREATE TABLE containers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shipment_id UUID NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
    container_number VARCHAR(15) NOT NULL,
    size container_size NOT NULL,
    type container_type NOT NULL DEFAULT 'DRY',
    seal_number VARCHAR(50),
    weight_lbs INTEGER DEFAULT 0,
    is_hazmat BOOLEAN DEFAULT FALSE,
    hazmat_class VARCHAR(20),
    un_number VARCHAR(20),
    is_overweight BOOLEAN DEFAULT FALSE,
    is_reefer BOOLEAN DEFAULT FALSE,
    reefer_temp_setpoint DECIMAL(5, 2),
    commodity VARCHAR(255),
    customs_status customs_status NOT NULL DEFAULT 'PENDING',
    customs_hold_type VARCHAR(100),
    terminal_available_date TIMESTAMP WITH TIME ZONE,
    current_state container_state NOT NULL DEFAULT 'LOADED',
    current_location_type location_type NOT NULL DEFAULT 'VESSEL',
    current_location_id UUID REFERENCES locations(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Orders table
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_number VARCHAR(20) UNIQUE NOT NULL,
    container_id UUID NOT NULL REFERENCES containers(id),
    shipment_id UUID NOT NULL REFERENCES shipments(id),
    type order_type NOT NULL,
    move_type VARCHAR(50),
    customer_reference VARCHAR(100),
    pickup_location_id UUID REFERENCES locations(id),
    delivery_location_id UUID REFERENCES locations(id),
    return_location_id UUID REFERENCES locations(id),
    requested_pickup_date TIMESTAMP WITH TIME ZONE,
    requested_delivery_date TIMESTAMP WITH TIME ZONE,
    status order_status NOT NULL DEFAULT 'PENDING',
    billing_status billing_status NOT NULL DEFAULT 'UNBILLED',
    linked_order_id UUID REFERENCES orders(id),
    special_instructions TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Order number sequence
CREATE SEQUENCE order_number_seq START 1;

-- Indexes
CREATE INDEX idx_shipments_customer ON shipments(customer_id);
CREATE INDEX idx_shipments_status ON shipments(status);
CREATE INDEX idx_shipments_type ON shipments(type);
CREATE INDEX idx_shipments_lfd ON shipments(last_free_day);
CREATE INDEX idx_shipments_reference ON shipments(reference_number);
CREATE INDEX idx_shipments_terminal ON shipments(terminal_id);

CREATE INDEX idx_containers_shipment ON containers(shipment_id);
CREATE INDEX idx_containers_number ON containers(container_number);
CREATE INDEX idx_containers_customs ON containers(customs_status);
CREATE INDEX idx_containers_state ON containers(current_state);

CREATE INDEX idx_orders_container ON orders(container_id);
CREATE INDEX idx_orders_shipment ON orders(shipment_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_type ON orders(type);
CREATE INDEX idx_orders_number ON orders(order_number);

-- Updated at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_steamship_lines_updated_at BEFORE UPDATE ON steamship_lines
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_locations_updated_at BEFORE UPDATE ON locations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_shipments_updated_at BEFORE UPDATE ON shipments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_containers_updated_at BEFORE UPDATE ON containers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Seed data: Steamship Lines
INSERT INTO steamship_lines (id, name, code) VALUES
    ('550e8400-e29b-41d4-a716-446655440001', 'Maersk', 'MAEU'),
    ('550e8400-e29b-41d4-a716-446655440002', 'MSC', 'MSCU'),
    ('550e8400-e29b-41d4-a716-446655440003', 'CMA CGM', 'CMDU'),
    ('550e8400-e29b-41d4-a716-446655440004', 'COSCO', 'COSU'),
    ('550e8400-e29b-41d4-a716-446655440005', 'Hapag-Lloyd', 'HLCU'),
    ('550e8400-e29b-41d4-a716-446655440006', 'ONE', 'ONEY'),
    ('550e8400-e29b-41d4-a716-446655440007', 'Evergreen', 'EGLV'),
    ('550e8400-e29b-41d4-a716-446655440008', 'Yang Ming', 'YMLU'),
    ('550e8400-e29b-41d4-a716-446655440009', 'HMM', 'HDMU'),
    ('550e8400-e29b-41d4-a716-446655440010', 'ZIM', 'ZIMU');

-- Seed data: Ports
INSERT INTO ports (id, name, code, city, state) VALUES
    ('660e8400-e29b-41d4-a716-446655440001', 'Port of Los Angeles', 'USLAX', 'Los Angeles', 'CA'),
    ('660e8400-e29b-41d4-a716-446655440002', 'Port of Long Beach', 'USLGB', 'Long Beach', 'CA'),
    ('660e8400-e29b-41d4-a716-446655440003', 'Port of Oakland', 'USOAK', 'Oakland', 'CA'),
    ('660e8400-e29b-41d4-a716-446655440004', 'Port of Seattle', 'USSEA', 'Seattle', 'WA'),
    ('660e8400-e29b-41d4-a716-446655440005', 'Port of Tacoma', 'USTAC', 'Tacoma', 'WA');

-- Seed data: Terminals (LA/LB)
INSERT INTO locations (id, name, type, city, state, latitude, longitude) VALUES
    ('770e8400-e29b-41d4-a716-446655440001', 'APM Terminals', 'terminal', 'Los Angeles', 'CA', 33.7398, -118.2614),
    ('770e8400-e29b-41d4-a716-446655440002', 'TraPac', 'terminal', 'Los Angeles', 'CA', 33.7512, -118.2701),
    ('770e8400-e29b-41d4-a716-446655440003', 'Fenix Marine Services', 'terminal', 'Los Angeles', 'CA', 33.7456, -118.2589),
    ('770e8400-e29b-41d4-a716-446655440004', 'LBCT', 'terminal', 'Long Beach', 'CA', 33.7654, -118.2134),
    ('770e8400-e29b-41d4-a716-446655440005', 'PCT', 'terminal', 'Long Beach', 'CA', 33.7589, -118.2045),
    ('770e8400-e29b-41d4-a716-446655440006', 'TTI', 'terminal', 'Long Beach', 'CA', 33.7623, -118.2187),
    ('770e8400-e29b-41d4-a716-446655440007', 'ITS', 'terminal', 'Long Beach', 'CA', 33.7598, -118.2098),
    ('770e8400-e29b-41d4-a716-446655440008', 'Yusen Terminals', 'terminal', 'Los Angeles', 'CA', 33.7534, -118.2678);
