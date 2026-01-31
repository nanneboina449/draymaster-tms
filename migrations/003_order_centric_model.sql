-- ==============================================================================
-- DrayMaster TMS — Order-Centric Data Model Migration
-- ==============================================================================
-- This migration enhances the orders table to be the primary dispatch unit,
-- replacing the "loads" concept with a cleaner shipment → container → order flow.
-- ==============================================================================

-- ==============================================================================
-- 1. NEW ENUM TYPES
-- ==============================================================================

-- Trip execution type (how the physical move is done)
DO $$ BEGIN
    CREATE TYPE trip_execution_type AS ENUM (
        'LIVE_UNLOAD',      -- Driver waits while container is unloaded
        'LIVE_LOAD',        -- Driver waits while container is loaded
        'DROP',             -- Drop container, leave
        'DROP_AND_HOOK',    -- Drop one container, pick up another
        'STREET_TURN',      -- Import container reused for export
        'PREPULL',          -- Pull from terminal to yard before delivery
        'REPO'              -- Reposition container
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Order type enhancement
DO $$ BEGIN
    CREATE TYPE order_move_type AS ENUM (
        'IMPORT_DELIVERY',  -- Terminal → Customer (deliver import)
        'EXPORT_PICKUP',    -- Customer → Terminal (pick up export)
        'EMPTY_RETURN',     -- Customer → Terminal (return empty)
        'EMPTY_PICKUP',     -- Terminal → Customer (pick up empty for loading)
        'YARD_PULL',        -- Terminal → Yard (prepull to company yard)
        'YARD_DELIVERY',    -- Yard → Customer (deliver from yard)
        'REPO'              -- Any location → Any location (reposition)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Container status (lifecycle tracking)
DO $$ BEGIN
    CREATE TYPE container_lifecycle_status AS ENUM (
        'BOOKED',           -- Container on booking, not yet available
        'AVAILABLE',        -- Available at terminal for pickup
        'PICKED_UP',        -- Picked up, in transit
        'DELIVERED',        -- Delivered to customer (loaded)
        'DROPPED',          -- Dropped at customer location
        'EMPTY_PICKED',     -- Empty picked up from customer
        'RETURNED',         -- Empty returned to terminal
        'COMPLETED'         -- All movements complete
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ==============================================================================
-- 2. ENHANCE CONTAINERS TABLE
-- ==============================================================================

-- Add lifecycle status to containers
ALTER TABLE containers
ADD COLUMN IF NOT EXISTS lifecycle_status VARCHAR(20) DEFAULT 'BOOKED';

-- Add terminal availability date
ALTER TABLE containers
ADD COLUMN IF NOT EXISTS terminal_available_date DATE;

-- Add terminal appointment
ALTER TABLE containers
ADD COLUMN IF NOT EXISTS terminal_appointment TIMESTAMPTZ;

-- ==============================================================================
-- 3. ENHANCE ORDERS TABLE
-- ==============================================================================

-- Add trip execution type
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS trip_execution_type VARCHAR(20) DEFAULT 'LIVE_UNLOAD';

-- Add order move type (more specific than order_type)
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS move_type_v2 VARCHAR(30);

-- Add pickup details
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS pickup_address TEXT;
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS pickup_city VARCHAR(100);
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS pickup_state VARCHAR(2);
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS pickup_zip VARCHAR(10);
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS pickup_contact_name VARCHAR(100);
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS pickup_contact_phone VARCHAR(20);
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS pickup_appointment TIMESTAMPTZ;
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS pickup_appointment_required BOOLEAN DEFAULT FALSE;

-- Add delivery details
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS delivery_address TEXT;
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS delivery_city VARCHAR(100);
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS delivery_state VARCHAR(2);
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS delivery_zip VARCHAR(10);
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS delivery_contact_name VARCHAR(100);
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS delivery_contact_phone VARCHAR(20);
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS delivery_appointment TIMESTAMPTZ;
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS delivery_appointment_required BOOLEAN DEFAULT FALSE;

-- Add execution sequence (for multi-order containers)
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS sequence_number INTEGER DEFAULT 1;

-- Add rate/billing fields
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS base_rate DECIMAL(10,2);
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS fuel_surcharge DECIMAL(10,2);
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS total_charges DECIMAL(10,2);

-- Add driver/trip assignment (direct link for simple cases)
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS assigned_driver_id UUID REFERENCES drivers(id);
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS assigned_trip_id UUID;

-- Add dispatch timestamps
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ;
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS picked_up_at TIMESTAMPTZ;
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- ==============================================================================
-- 4. CREATE TRIP_ORDERS JOIN TABLE
-- ==============================================================================

-- This allows a single trip to execute multiple orders
CREATE TABLE IF NOT EXISTS trip_orders (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id         UUID            NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    order_id        UUID            NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    sequence        INTEGER         NOT NULL DEFAULT 1,
    status          VARCHAR(20)     DEFAULT 'PENDING',
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    UNIQUE(trip_id, order_id)
);

-- ==============================================================================
-- 5. ADD ORDER CHARGES TABLE (migrate from load_charges concept)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS order_charges (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id        UUID            NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
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
-- 6. ADD ORDER NOTES TABLE
-- ==============================================================================

CREATE TABLE IF NOT EXISTS order_notes (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id            UUID            NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    author_name         VARCHAR(100)    NOT NULL,
    author_type         VARCHAR(20)     DEFAULT 'INTERNAL',
    message             TEXT            NOT NULL,
    visible_to_customer BOOLEAN         DEFAULT FALSE,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 7. ADD ORDER ACTIVITY LOG
-- ==============================================================================

CREATE TABLE IF NOT EXISTS order_activity_log (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id        UUID            NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    action          VARCHAR(50)     NOT NULL,
    from_value      VARCHAR(100),
    to_value        VARCHAR(100),
    details         TEXT,
    performed_by    VARCHAR(100)    DEFAULT 'SYSTEM',
    performer_type  VARCHAR(20)     DEFAULT 'SYSTEM',
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 8. UPDATE TRIPS TABLE
-- ==============================================================================

-- Add direct order reference for simple single-order trips
ALTER TABLE trips
ADD COLUMN IF NOT EXISTS primary_order_id UUID REFERENCES orders(id);

-- ==============================================================================
-- 9. CREATE INDEXES
-- ==============================================================================

CREATE INDEX IF NOT EXISTS idx_orders_shipment_id ON orders(shipment_id);
CREATE INDEX IF NOT EXISTS idx_orders_container_id ON orders(container_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_assigned_driver ON orders(assigned_driver_id);
CREATE INDEX IF NOT EXISTS idx_orders_pickup_appointment ON orders(pickup_appointment);
CREATE INDEX IF NOT EXISTS idx_orders_delivery_appointment ON orders(delivery_appointment);

CREATE INDEX IF NOT EXISTS idx_trip_orders_trip_id ON trip_orders(trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_orders_order_id ON trip_orders(order_id);

CREATE INDEX IF NOT EXISTS idx_order_charges_order_id ON order_charges(order_id);
CREATE INDEX IF NOT EXISTS idx_order_notes_order_id ON order_notes(order_id);
CREATE INDEX IF NOT EXISTS idx_order_activity_order_id ON order_activity_log(order_id);

CREATE INDEX IF NOT EXISTS idx_containers_lifecycle ON containers(lifecycle_status);

-- ==============================================================================
-- 10. CREATE VIEWS
-- ==============================================================================

-- Drop existing views first to allow column name changes
DROP VIEW IF EXISTS v_dispatch_board CASCADE;
DROP VIEW IF EXISTS v_shipment_summary CASCADE;
DROP VIEW IF EXISTS v_container_tracking CASCADE;

-- Dispatch board view: shows orders ready for dispatch
CREATE OR REPLACE VIEW v_dispatch_board AS
SELECT
    o.id AS order_id,
    o.order_number,
    o.status AS order_status,
    o.move_type_v2 AS move_type,
    o.trip_execution_type,
    o.pickup_appointment,
    o.delivery_appointment,
    o.sequence_number,
    c.id AS container_id,
    c.container_number,
    c.size AS container_size,
    c.type AS container_type,
    c.is_hazmat,
    c.is_overweight,
    c.customs_status,
    c.lifecycle_status,
    s.id AS shipment_id,
    s.reference_number AS shipment_reference,
    s.type AS shipment_type,
    s.customer_name,
    s.terminal_name,
    s.last_free_day,
    s.port_cutoff,
    o.assigned_driver_id,
    CONCAT(d.first_name, ' ', d.last_name) AS driver_name,
    o.assigned_trip_id,
    t.trip_number
FROM orders o
JOIN containers c ON o.container_id = c.id
JOIN shipments s ON o.shipment_id = s.id
LEFT JOIN drivers d ON o.assigned_driver_id = d.id
LEFT JOIN trips t ON o.assigned_trip_id = t.id
WHERE o.deleted_at IS NULL
  AND o.status IN ('PENDING', 'READY', 'DISPATCHED', 'IN_PROGRESS')
ORDER BY
    CASE o.status
        WHEN 'IN_PROGRESS' THEN 1
        WHEN 'DISPATCHED' THEN 2
        WHEN 'READY' THEN 3
        WHEN 'PENDING' THEN 4
    END,
    o.pickup_appointment NULLS LAST,
    o.delivery_appointment NULLS LAST;

-- Shipment summary view: shows shipments with container and order counts
CREATE OR REPLACE VIEW v_shipment_summary AS
SELECT
    s.id,
    s.reference_number,
    s.type,
    s.status,
    s.customer_name,
    s.steamship_line,
    s.booking_number,
    s.bill_of_lading,
    s.vessel,
    s.voyage,
    s.terminal_name,
    s.last_free_day,
    s.port_cutoff,
    s.created_at,
    COUNT(DISTINCT c.id) AS container_count,
    COUNT(DISTINCT o.id) AS order_count,
    COUNT(DISTINCT CASE WHEN o.status = 'COMPLETED' THEN o.id END) AS completed_orders,
    COUNT(DISTINCT CASE WHEN o.status IN ('DISPATCHED', 'IN_PROGRESS') THEN o.id END) AS active_orders
FROM shipments s
LEFT JOIN containers c ON c.shipment_id = s.id
LEFT JOIN orders o ON o.shipment_id = s.id AND o.deleted_at IS NULL
WHERE s.deleted_at IS NULL
GROUP BY s.id
ORDER BY s.created_at DESC;

-- Container tracking view
CREATE OR REPLACE VIEW v_container_tracking AS
SELECT
    c.id,
    c.container_number,
    c.size,
    c.type,
    c.lifecycle_status,
    c.customs_status,
    c.is_hazmat,
    c.is_overweight,
    c.terminal_available_date,
    s.id AS shipment_id,
    s.reference_number AS shipment_reference,
    s.type AS shipment_type,
    s.customer_name,
    s.terminal_name,
    s.last_free_day,
    (
        SELECT json_agg(json_build_object(
            'order_id', o.id,
            'order_number', o.order_number,
            'move_type', o.move_type_v2,
            'status', o.status,
            'sequence', o.sequence_number
        ) ORDER BY o.sequence_number)
        FROM orders o
        WHERE o.container_id = c.id AND o.deleted_at IS NULL
    ) AS orders
FROM containers c
JOIN shipments s ON c.shipment_id = s.id
WHERE c.deleted_at IS NULL
ORDER BY c.created_at DESC;

-- ==============================================================================
-- 11. TRIGGERS
-- ==============================================================================

-- Update timestamps
DROP TRIGGER IF EXISTS update_orders_updated_at ON orders;
CREATE TRIGGER update_orders_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_order_charges_updated_at ON order_charges;

-- ==============================================================================
-- 12. HELPER FUNCTIONS
-- ==============================================================================

-- Function to auto-create orders when a shipment is created
CREATE OR REPLACE FUNCTION create_orders_for_container(
    p_shipment_id UUID,
    p_container_id UUID,
    p_shipment_type VARCHAR(10),
    p_trip_type VARCHAR(20),
    p_delivery_address TEXT DEFAULT NULL,
    p_delivery_city VARCHAR(100) DEFAULT NULL,
    p_delivery_state VARCHAR(2) DEFAULT NULL,
    p_delivery_zip VARCHAR(10) DEFAULT NULL
) RETURNS SETOF orders AS $$
DECLARE
    v_order_number VARCHAR(20);
    v_order_id UUID;
BEGIN
    -- Generate order number
    v_order_number := 'ORD-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(NEXTVAL('order_number_seq')::TEXT, 5, '0');

    IF p_shipment_type = 'IMPORT' THEN
        -- Create delivery order
        INSERT INTO orders (
            order_number, shipment_id, container_id, type, move_type_v2,
            trip_execution_type, sequence_number, status,
            delivery_address, delivery_city, delivery_state, delivery_zip
        ) VALUES (
            v_order_number, p_shipment_id, p_container_id, 'IMPORT', 'IMPORT_DELIVERY',
            p_trip_type, 1, 'PENDING',
            p_delivery_address, p_delivery_city, p_delivery_state, p_delivery_zip
        ) RETURNING id INTO v_order_id;

        RETURN QUERY SELECT * FROM orders WHERE id = v_order_id;

        -- If DROP type, also create empty return order
        IF p_trip_type IN ('DROP', 'DROP_AND_HOOK') THEN
            v_order_number := 'ORD-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(NEXTVAL('order_number_seq')::TEXT, 5, '0');

            INSERT INTO orders (
                order_number, shipment_id, container_id, type, move_type_v2,
                trip_execution_type, sequence_number, status,
                pickup_address, pickup_city, pickup_state, pickup_zip
            ) VALUES (
                v_order_number, p_shipment_id, p_container_id, 'EMPTY_RETURN', 'EMPTY_RETURN',
                'DROP', 2, 'PENDING',
                p_delivery_address, p_delivery_city, p_delivery_state, p_delivery_zip
            ) RETURNING id INTO v_order_id;

            RETURN QUERY SELECT * FROM orders WHERE id = v_order_id;
        END IF;

    ELSIF p_shipment_type = 'EXPORT' THEN
        -- Create pickup order (empty to customer)
        INSERT INTO orders (
            order_number, shipment_id, container_id, type, move_type_v2,
            trip_execution_type, sequence_number, status,
            delivery_address, delivery_city, delivery_state, delivery_zip
        ) VALUES (
            v_order_number, p_shipment_id, p_container_id, 'EXPORT', 'EMPTY_PICKUP',
            'DROP', 1, 'PENDING',
            p_delivery_address, p_delivery_city, p_delivery_state, p_delivery_zip
        ) RETURNING id INTO v_order_id;

        RETURN QUERY SELECT * FROM orders WHERE id = v_order_id;

        -- Create export delivery order
        v_order_number := 'ORD-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(NEXTVAL('order_number_seq')::TEXT, 5, '0');

        INSERT INTO orders (
            order_number, shipment_id, container_id, type, move_type_v2,
            trip_execution_type, sequence_number, status,
            pickup_address, pickup_city, pickup_state, pickup_zip
        ) VALUES (
            v_order_number, p_shipment_id, p_container_id, 'EXPORT', 'EXPORT_PICKUP',
            p_trip_type, 2, 'PENDING',
            p_delivery_address, p_delivery_city, p_delivery_state, p_delivery_zip
        ) RETURNING id INTO v_order_id;

        RETURN QUERY SELECT * FROM orders WHERE id = v_order_id;
    END IF;

    RETURN;
END;
$$ LANGUAGE plpgsql;

-- Create sequence for order numbers if not exists
CREATE SEQUENCE IF NOT EXISTS order_number_seq START 1;

-- ==============================================================================
-- 13. DATA MIGRATION (optional - migrate existing loads to orders)
-- ==============================================================================

-- This can be run manually if you have existing load data to migrate
-- INSERT INTO orders (...)
-- SELECT ... FROM loads WHERE ...

COMMENT ON TABLE orders IS 'Primary dispatch unit. Each order represents one movement task for a container.';
COMMENT ON TABLE trip_orders IS 'Join table allowing trips to execute multiple orders.';
COMMENT ON VIEW v_dispatch_board IS 'Dispatch board showing orders ready for assignment.';
