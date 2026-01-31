-- ==============================================================================
-- DrayMaster TMS — Shipment Status Tracking Migration
-- ==============================================================================
-- This migration adds automatic status tracking for shipments and containers
-- based on order completion status.
-- ==============================================================================

-- ==============================================================================
-- 1. ADD PROGRESS TRACKING COLUMNS TO SHIPMENTS
-- ==============================================================================

-- Total counts for progress display
ALTER TABLE shipments
ADD COLUMN IF NOT EXISTS total_containers INTEGER DEFAULT 0;

ALTER TABLE shipments
ADD COLUMN IF NOT EXISTS completed_containers INTEGER DEFAULT 0;

ALTER TABLE shipments
ADD COLUMN IF NOT EXISTS total_orders INTEGER DEFAULT 0;

ALTER TABLE shipments
ADD COLUMN IF NOT EXISTS completed_orders INTEGER DEFAULT 0;

-- ==============================================================================
-- 2. FUNCTION: Update Container Lifecycle Based on Orders
-- ==============================================================================

CREATE OR REPLACE FUNCTION update_container_lifecycle_from_orders()
RETURNS TRIGGER AS $$
DECLARE
    v_container_id UUID;
    v_total_orders INTEGER;
    v_completed_orders INTEGER;
    v_in_progress_orders INTEGER;
    v_new_lifecycle VARCHAR(20);
BEGIN
    -- Get the container_id from the order
    v_container_id := COALESCE(NEW.container_id, OLD.container_id);

    IF v_container_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Count orders for this container
    SELECT
        COUNT(*),
        COUNT(*) FILTER (WHERE status = 'COMPLETED'),
        COUNT(*) FILTER (WHERE status IN ('DISPATCHED', 'IN_PROGRESS'))
    INTO v_total_orders, v_completed_orders, v_in_progress_orders
    FROM orders
    WHERE container_id = v_container_id
      AND deleted_at IS NULL;

    -- Determine new lifecycle status
    IF v_completed_orders = v_total_orders AND v_total_orders > 0 THEN
        v_new_lifecycle := 'COMPLETED';
    ELSIF v_in_progress_orders > 0 THEN
        v_new_lifecycle := 'PICKED_UP';
    ELSIF v_completed_orders > 0 THEN
        -- Some orders completed but not all
        v_new_lifecycle := 'DELIVERED';
    ELSE
        v_new_lifecycle := 'BOOKED';
    END IF;

    -- Update container
    UPDATE containers
    SET lifecycle_status = v_new_lifecycle,
        updated_at = NOW()
    WHERE id = v_container_id
      AND lifecycle_status != v_new_lifecycle;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for order status changes
DROP TRIGGER IF EXISTS trg_update_container_lifecycle ON orders;
CREATE TRIGGER trg_update_container_lifecycle
    AFTER INSERT OR UPDATE OF status ON orders
    FOR EACH ROW
    EXECUTE FUNCTION update_container_lifecycle_from_orders();

-- ==============================================================================
-- 3. FUNCTION: Update Shipment Status Based on Containers/Orders
-- ==============================================================================

CREATE OR REPLACE FUNCTION update_shipment_status_from_containers()
RETURNS TRIGGER AS $$
DECLARE
    v_shipment_id UUID;
    v_total_containers INTEGER;
    v_completed_containers INTEGER;
    v_total_orders INTEGER;
    v_completed_orders INTEGER;
    v_in_progress_orders INTEGER;
    v_new_status VARCHAR(20);
BEGIN
    -- Get shipment_id from container
    SELECT shipment_id INTO v_shipment_id
    FROM containers
    WHERE id = COALESCE(NEW.id, OLD.id);

    IF v_shipment_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Count containers
    SELECT
        COUNT(*),
        COUNT(*) FILTER (WHERE lifecycle_status = 'COMPLETED')
    INTO v_total_containers, v_completed_containers
    FROM containers
    WHERE shipment_id = v_shipment_id;

    -- Count orders
    SELECT
        COUNT(*),
        COUNT(*) FILTER (WHERE status = 'COMPLETED'),
        COUNT(*) FILTER (WHERE status IN ('DISPATCHED', 'IN_PROGRESS'))
    INTO v_total_orders, v_completed_orders, v_in_progress_orders
    FROM orders
    WHERE shipment_id = v_shipment_id
      AND deleted_at IS NULL;

    -- Determine new status
    IF v_completed_containers = v_total_containers AND v_total_containers > 0 THEN
        v_new_status := 'COMPLETED';
    ELSIF v_in_progress_orders > 0 THEN
        v_new_status := 'IN_PROGRESS';
    ELSIF v_completed_orders > 0 THEN
        v_new_status := 'IN_PROGRESS';
    ELSE
        v_new_status := 'PENDING';
    END IF;

    -- Update shipment with counts and status
    UPDATE shipments
    SET status = v_new_status,
        total_containers = v_total_containers,
        completed_containers = v_completed_containers,
        total_orders = v_total_orders,
        completed_orders = v_completed_orders,
        updated_at = NOW()
    WHERE id = v_shipment_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for container lifecycle changes
DROP TRIGGER IF EXISTS trg_update_shipment_status ON containers;
CREATE TRIGGER trg_update_shipment_status
    AFTER INSERT OR UPDATE OF lifecycle_status ON containers
    FOR EACH ROW
    EXECUTE FUNCTION update_shipment_status_from_containers();

-- ==============================================================================
-- 4. FUNCTION: Also Update Shipment When Orders Change (Direct Link)
-- ==============================================================================

CREATE OR REPLACE FUNCTION update_shipment_from_order_change()
RETURNS TRIGGER AS $$
DECLARE
    v_shipment_id UUID;
    v_total_containers INTEGER;
    v_completed_containers INTEGER;
    v_total_orders INTEGER;
    v_completed_orders INTEGER;
    v_in_progress_orders INTEGER;
    v_new_status VARCHAR(20);
BEGIN
    v_shipment_id := COALESCE(NEW.shipment_id, OLD.shipment_id);

    IF v_shipment_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Count containers
    SELECT
        COUNT(*),
        COUNT(*) FILTER (WHERE lifecycle_status = 'COMPLETED')
    INTO v_total_containers, v_completed_containers
    FROM containers
    WHERE shipment_id = v_shipment_id;

    -- Count orders
    SELECT
        COUNT(*),
        COUNT(*) FILTER (WHERE status = 'COMPLETED'),
        COUNT(*) FILTER (WHERE status IN ('DISPATCHED', 'IN_PROGRESS'))
    INTO v_total_orders, v_completed_orders, v_in_progress_orders
    FROM orders
    WHERE shipment_id = v_shipment_id
      AND deleted_at IS NULL;

    -- Determine new status
    IF v_completed_orders = v_total_orders AND v_total_orders > 0 THEN
        v_new_status := 'COMPLETED';
    ELSIF v_in_progress_orders > 0 THEN
        v_new_status := 'IN_PROGRESS';
    ELSIF v_completed_orders > 0 THEN
        v_new_status := 'IN_PROGRESS';
    ELSE
        v_new_status := 'PENDING';
    END IF;

    -- Update shipment
    UPDATE shipments
    SET status = v_new_status,
        total_containers = v_total_containers,
        completed_containers = v_completed_containers,
        total_orders = v_total_orders,
        completed_orders = v_completed_orders,
        updated_at = NOW()
    WHERE id = v_shipment_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger on orders for shipment status
DROP TRIGGER IF EXISTS trg_update_shipment_from_orders ON orders;
CREATE TRIGGER trg_update_shipment_from_orders
    AFTER INSERT OR UPDATE OF status ON orders
    FOR EACH ROW
    EXECUTE FUNCTION update_shipment_from_order_change();

-- ==============================================================================
-- 5. ONE-TIME: Initialize Existing Shipment Counts
-- ==============================================================================

-- Update all existing shipments with correct counts
UPDATE shipments s
SET
    total_containers = (
        SELECT COUNT(*) FROM containers c WHERE c.shipment_id = s.id
    ),
    completed_containers = (
        SELECT COUNT(*) FROM containers c
        WHERE c.shipment_id = s.id AND c.lifecycle_status = 'COMPLETED'
    ),
    total_orders = (
        SELECT COUNT(*) FROM orders o
        WHERE o.shipment_id = s.id AND o.deleted_at IS NULL
    ),
    completed_orders = (
        SELECT COUNT(*) FROM orders o
        WHERE o.shipment_id = s.id AND o.status = 'COMPLETED' AND o.deleted_at IS NULL
    );

-- ==============================================================================
-- 6. ENHANCED VIEW: Shipment List with Progress
-- ==============================================================================

DROP VIEW IF EXISTS v_shipment_list CASCADE;

CREATE OR REPLACE VIEW v_shipment_list AS
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
    s.updated_at,
    COALESCE(s.total_containers, 0) AS total_containers,
    COALESCE(s.completed_containers, 0) AS completed_containers,
    COALESCE(s.total_orders, 0) AS total_orders,
    COALESCE(s.completed_orders, 0) AS completed_orders,
    CASE
        WHEN COALESCE(s.total_orders, 0) = 0 THEN 0
        ELSE ROUND((COALESCE(s.completed_orders, 0)::NUMERIC / s.total_orders) * 100)
    END AS progress_percent,
    -- Urgency indicators
    CASE
        WHEN s.last_free_day IS NOT NULL AND s.last_free_day <= CURRENT_DATE THEN 'OVERDUE'
        WHEN s.last_free_day IS NOT NULL AND s.last_free_day <= CURRENT_DATE + INTERVAL '2 days' THEN 'URGENT'
        WHEN s.last_free_day IS NOT NULL AND s.last_free_day <= CURRENT_DATE + INTERVAL '5 days' THEN 'WARNING'
        ELSE 'NORMAL'
    END AS urgency
FROM shipments s
ORDER BY
    CASE s.status
        WHEN 'IN_PROGRESS' THEN 1
        WHEN 'PENDING' THEN 2
        WHEN 'COMPLETED' THEN 3
        ELSE 4
    END,
    s.last_free_day NULLS LAST,
    s.created_at DESC;

-- ==============================================================================
-- 7. VIEW: Shipment Detail with Containers and Orders
-- ==============================================================================

DROP VIEW IF EXISTS v_shipment_detail CASCADE;

CREATE OR REPLACE VIEW v_shipment_detail AS
SELECT
    s.id AS shipment_id,
    s.reference_number,
    s.type AS shipment_type,
    s.status AS shipment_status,
    s.customer_name,
    s.terminal_name,
    s.last_free_day,
    s.port_cutoff,
    c.id AS container_id,
    c.container_number,
    c.size AS container_size,
    c.type AS container_type,
    c.lifecycle_status AS container_status,
    c.is_hazmat,
    c.is_overweight,
    c.customs_status,
    o.id AS order_id,
    o.order_number,
    o.move_type_v2 AS order_move_type,
    o.trip_execution_type,
    o.sequence_number AS order_sequence,
    o.status AS order_status,
    o.pickup_appointment,
    o.delivery_appointment,
    o.assigned_driver_id,
    CONCAT(d.first_name, ' ', d.last_name) AS driver_name,
    o.dispatched_at,
    o.picked_up_at,
    o.delivered_at,
    o.completed_at
FROM shipments s
LEFT JOIN containers c ON c.shipment_id = s.id
LEFT JOIN orders o ON o.container_id = c.id AND o.deleted_at IS NULL
LEFT JOIN drivers d ON o.assigned_driver_id = d.id
ORDER BY s.id, c.container_number, o.sequence_number;

COMMENT ON VIEW v_shipment_list IS 'Shipment list with progress tracking and urgency indicators';
COMMENT ON VIEW v_shipment_detail IS 'Full shipment details with all containers and orders';
