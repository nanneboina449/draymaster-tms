-- ==============================================================================
-- DrayMaster TMS — Complex Trip Support Migration
-- ==============================================================================
-- This migration adds support for complex drayage scenarios:
-- 1. DROP operations with separate empty pickups
-- 2. SWAP/Hook operations across different containers
-- 3. Bobtail leg tracking
-- 4. Container empty-ready status tracking
-- 5. Multi-order trips with proper sequencing
-- ==============================================================================

-- ==============================================================================
-- 1. ADD CONTAINER EMPTY TRACKING
-- ==============================================================================

-- Track when container is ready for empty pickup (customer emptied it)
ALTER TABLE containers
ADD COLUMN IF NOT EXISTS empty_ready_at TIMESTAMPTZ;

-- Track who confirmed the empty is ready
ALTER TABLE containers
ADD COLUMN IF NOT EXISTS empty_ready_confirmed_by VARCHAR(100);

-- Expected empty ready date (for planning)
ALTER TABLE containers
ADD COLUMN IF NOT EXISTS expected_empty_ready_date DATE;

-- ==============================================================================
-- 2. ADD ORDER LINKING FOR CROSS-CONTAINER OPERATIONS
-- ==============================================================================

-- Allow an order to specify a different container for empty pickup
-- Use case: Driver B drops Container 2, picks up empty Container 1
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS linked_empty_container_id UUID REFERENCES containers(id);

-- Return type after delivery (what happens after drop/delivery)
-- BOBTAIL = driver returns empty (no container)
-- HOOK_SAME = driver picks up this container's empty later
-- HOOK_OTHER = driver picks up another container's empty (use linked_empty_container_id)
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS return_type VARCHAR(20) DEFAULT 'BOBTAIL';

-- For HOOK_OTHER, reference the empty return order this links to
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS linked_return_order_id UUID REFERENCES orders(id);

-- ==============================================================================
-- 3. ADD TRIP LEG TYPES FOR BOBTAIL
-- ==============================================================================

-- Trip legs table enhancement - add bobtail tracking
ALTER TABLE trip_legs
ADD COLUMN IF NOT EXISTS is_bobtail BOOLEAN DEFAULT FALSE;

-- Add leg purpose (more granular than leg_type)
ALTER TABLE trip_legs
ADD COLUMN IF NOT EXISTS leg_purpose VARCHAR(30);

COMMENT ON COLUMN trip_legs.leg_purpose IS 'Purpose: PICKUP_LOADED, DELIVER_LOADED, PICKUP_EMPTY, DELIVER_EMPTY, BOBTAIL_TO, BOBTAIL_FROM';

-- ==============================================================================
-- 4. ADD ORDER DEPENDENCIES
-- ==============================================================================

-- Table to track order dependencies (Order B depends on Order A completing)
CREATE TABLE IF NOT EXISTS order_dependencies (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id            UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    depends_on_order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    dependency_type     VARCHAR(30) NOT NULL,
    is_satisfied        BOOLEAN DEFAULT FALSE,
    satisfied_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(order_id, depends_on_order_id)
);

COMMENT ON TABLE order_dependencies IS 'Tracks dependencies between orders. E.g., empty pickup depends on container being emptied';
COMMENT ON COLUMN order_dependencies.dependency_type IS 'Types: EMPTY_READY, DELIVERY_COMPLETE, CONTAINER_AVAILABLE';

-- ==============================================================================
-- 5. ENHANCE TRIPS FOR MULTI-CONTAINER OPERATIONS
-- ==============================================================================

-- Track if this trip involves multiple containers
ALTER TABLE trips
ADD COLUMN IF NOT EXISTS is_multi_container BOOLEAN DEFAULT FALSE;

-- Add trip mode (how the truck is loaded during the trip)
ALTER TABLE trips
ADD COLUMN IF NOT EXISTS outbound_mode VARCHAR(20) DEFAULT 'LOADED';
-- LOADED = carrying a loaded container
-- BOBTAIL = driving without container
-- EMPTY = carrying empty container

ALTER TABLE trips
ADD COLUMN IF NOT EXISTS inbound_mode VARCHAR(20) DEFAULT 'BOBTAIL';
-- LOADED = returning with loaded container
-- BOBTAIL = returning without container
-- EMPTY = returning with empty container

-- Secondary container for SWAP operations
ALTER TABLE trips
ADD COLUMN IF NOT EXISTS secondary_container_id UUID REFERENCES containers(id);

-- ==============================================================================
-- 6. CREATE HELPER VIEWS
-- ==============================================================================

-- View: Containers ready for empty pickup
DROP VIEW IF EXISTS v_containers_empty_ready;
CREATE VIEW v_containers_empty_ready AS
SELECT
    c.id,
    c.container_number,
    c.size,
    c.type,
    c.shipment_id,
    s.reference_number AS shipment_ref,
    s.customer_name,
    c.lifecycle_status,
    c.empty_ready_at,
    c.empty_ready_confirmed_by,
    -- Find the delivery order
    delivery_order.id AS delivery_order_id,
    delivery_order.delivery_address,
    delivery_order.delivery_city,
    delivery_order.delivered_at,
    -- Check if empty return order exists
    empty_order.id AS empty_return_order_id,
    empty_order.status AS empty_return_status,
    empty_order.assigned_driver_id AS empty_return_driver_id
FROM containers c
JOIN shipments s ON c.shipment_id = s.id
LEFT JOIN orders delivery_order ON delivery_order.container_id = c.id
    AND delivery_order.move_type_v2 = 'IMPORT_DELIVERY'
    AND delivery_order.deleted_at IS NULL
LEFT JOIN orders empty_order ON empty_order.container_id = c.id
    AND empty_order.move_type_v2 = 'EMPTY_RETURN'
    AND empty_order.deleted_at IS NULL
WHERE c.lifecycle_status IN ('DROPPED', 'DELIVERED')
   OR c.empty_ready_at IS NOT NULL;

-- View: Pending empty returns
DROP VIEW IF EXISTS v_pending_empty_returns;
CREATE VIEW v_pending_empty_returns AS
SELECT
    o.id AS order_id,
    o.order_number,
    o.container_id,
    c.container_number,
    c.size AS container_size,
    s.customer_name,
    o.pickup_address,
    o.pickup_city,
    o.status,
    c.empty_ready_at,
    c.lifecycle_status AS container_status,
    -- Urgency based on how long container has been ready
    CASE
        WHEN c.empty_ready_at IS NULL THEN 'WAITING'
        WHEN c.empty_ready_at < NOW() - INTERVAL '3 days' THEN 'OVERDUE'
        WHEN c.empty_ready_at < NOW() - INTERVAL '1 day' THEN 'URGENT'
        ELSE 'READY'
    END AS urgency
FROM orders o
JOIN containers c ON o.container_id = c.id
JOIN shipments s ON o.shipment_id = s.id
WHERE o.move_type_v2 = 'EMPTY_RETURN'
  AND o.status IN ('PENDING', 'READY')
  AND o.deleted_at IS NULL
ORDER BY
    CASE WHEN c.empty_ready_at IS NOT NULL THEN 0 ELSE 1 END,
    c.empty_ready_at;

-- View: Available empties for swap (containers at same location as pending deliveries)
DROP VIEW IF EXISTS v_swap_opportunities;
CREATE VIEW v_swap_opportunities AS
SELECT
    -- Delivery (outbound loaded)
    del.id AS delivery_order_id,
    del.container_id AS delivery_container_id,
    del_c.container_number AS delivery_container_number,
    del.delivery_city,
    del.delivery_address,
    del.assigned_driver_id AS delivery_driver_id,
    -- Empty (can pick up on return)
    emp.id AS empty_order_id,
    emp.container_id AS empty_container_id,
    emp_c.container_number AS empty_container_number,
    emp.pickup_city AS empty_city,
    emp_c.empty_ready_at,
    -- Match score
    CASE
        WHEN del.delivery_city = emp.pickup_city THEN 100
        WHEN del.delivery_address ILIKE '%' || emp.pickup_city || '%' THEN 80
        ELSE 50
    END AS match_score
FROM orders del
JOIN containers del_c ON del.container_id = del_c.id
JOIN orders emp ON emp.move_type_v2 = 'EMPTY_RETURN'
    AND emp.status IN ('PENDING', 'READY')
    AND emp.assigned_driver_id IS NULL  -- Not yet assigned
    AND emp.deleted_at IS NULL
JOIN containers emp_c ON emp.container_id = emp_c.id
WHERE del.move_type_v2 IN ('IMPORT_DELIVERY', 'YARD_DELIVERY')
  AND del.status IN ('PENDING', 'READY', 'DISPATCHED')
  AND del.deleted_at IS NULL
  AND del.trip_execution_type = 'DROP'  -- Only for DROP operations
  AND emp_c.empty_ready_at IS NOT NULL  -- Empty is ready
  AND del.delivery_city = emp.pickup_city  -- Same city
ORDER BY match_score DESC;

-- ==============================================================================
-- 7. INDEXES FOR PERFORMANCE
-- ==============================================================================

CREATE INDEX IF NOT EXISTS idx_containers_empty_ready ON containers(empty_ready_at) WHERE empty_ready_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_linked_empty ON orders(linked_empty_container_id) WHERE linked_empty_container_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_move_type_v2 ON orders(move_type_v2);
CREATE INDEX IF NOT EXISTS idx_trips_secondary_container ON trips(secondary_container_id) WHERE secondary_container_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_order_dependencies_order ON order_dependencies(order_id);
CREATE INDEX IF NOT EXISTS idx_order_dependencies_depends ON order_dependencies(depends_on_order_id);

-- ==============================================================================
-- 8. FUNCTION: Mark Container Empty Ready
-- ==============================================================================

CREATE OR REPLACE FUNCTION mark_container_empty_ready(
    p_container_id UUID,
    p_confirmed_by VARCHAR DEFAULT 'SYSTEM'
)
RETURNS VOID AS $$
BEGIN
    UPDATE containers
    SET empty_ready_at = NOW(),
        empty_ready_confirmed_by = p_confirmed_by,
        lifecycle_status = 'EMPTY_PICKED',
        updated_at = NOW()
    WHERE id = p_container_id
      AND lifecycle_status IN ('DROPPED', 'DELIVERED');

    -- Mark any EMPTY_RETURN orders as READY
    UPDATE orders
    SET status = 'READY',
        updated_at = NOW()
    WHERE container_id = p_container_id
      AND move_type_v2 = 'EMPTY_RETURN'
      AND status = 'PENDING';

    -- Satisfy dependencies
    UPDATE order_dependencies
    SET is_satisfied = TRUE,
        satisfied_at = NOW()
    WHERE depends_on_order_id IN (
        SELECT id FROM orders WHERE container_id = p_container_id
    )
    AND dependency_type = 'EMPTY_READY';
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- 9. FUNCTION: Create Swap Trip
-- ==============================================================================

CREATE OR REPLACE FUNCTION create_swap_trip(
    p_delivery_order_id UUID,
    p_empty_order_id UUID,
    p_driver_id UUID,
    p_chassis_number VARCHAR DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_trip_id UUID;
    v_delivery_container_id UUID;
    v_empty_container_id UUID;
BEGIN
    -- Get container IDs
    SELECT container_id INTO v_delivery_container_id FROM orders WHERE id = p_delivery_order_id;
    SELECT container_id INTO v_empty_container_id FROM orders WHERE id = p_empty_order_id;

    -- Create the trip
    INSERT INTO trips (
        trip_number,
        driver_id,
        container_id,
        secondary_container_id,
        is_multi_container,
        outbound_mode,
        inbound_mode,
        chassis_number,
        status,
        created_at
    ) VALUES (
        'TRP-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0'),
        p_driver_id,
        v_delivery_container_id,
        v_empty_container_id,
        TRUE,
        'LOADED',
        'EMPTY',
        p_chassis_number,
        'PLANNED',
        NOW()
    ) RETURNING id INTO v_trip_id;

    -- Link both orders to this trip
    INSERT INTO trip_orders (trip_id, order_id, sequence, status)
    VALUES
        (v_trip_id, p_delivery_order_id, 1, 'PENDING'),
        (v_trip_id, p_empty_order_id, 2, 'PENDING');

    -- Update orders
    UPDATE orders
    SET assigned_driver_id = p_driver_id,
        assigned_trip_id = v_trip_id,
        status = 'DISPATCHED',
        dispatched_at = NOW(),
        return_type = 'HOOK_OTHER',
        linked_empty_container_id = v_empty_container_id,
        linked_return_order_id = p_empty_order_id
    WHERE id = p_delivery_order_id;

    UPDATE orders
    SET assigned_driver_id = p_driver_id,
        assigned_trip_id = v_trip_id,
        status = 'DISPATCHED',
        dispatched_at = NOW()
    WHERE id = p_empty_order_id;

    RETURN v_trip_id;
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- SUCCESS MESSAGE
-- ==============================================================================

DO $$
BEGIN
    RAISE NOTICE 'SUCCESS: Complex trip support migration completed';
    RAISE NOTICE 'New features:';
    RAISE NOTICE '  - Container empty_ready tracking';
    RAISE NOTICE '  - Cross-container order linking';
    RAISE NOTICE '  - Order dependencies';
    RAISE NOTICE '  - Multi-container trip support';
    RAISE NOTICE '  - Swap opportunity detection';
END $$;
