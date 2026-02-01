-- ==============================================================================
-- DrayMaster TMS — Fix Enum Type Casting in Triggers
-- ==============================================================================
-- This migration fixes the issue where triggers try to set shipment.status
-- using VARCHAR values but the column is of type shipment_status (enum).
-- PostgreSQL requires explicit casting from VARCHAR to enum types.
-- ==============================================================================

-- ==============================================================================
-- 1. FIX: Update Container Lifecycle Trigger
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
      AND (lifecycle_status IS NULL OR lifecycle_status != v_new_lifecycle);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- 2. FIX: Update Shipment Status From Containers Trigger
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
    -- Cast VARCHAR to shipment_status enum type
    UPDATE shipments
    SET status = v_new_status::shipment_status,
        total_containers = v_total_containers,
        completed_containers = v_completed_containers,
        total_orders = v_total_orders,
        completed_orders = v_completed_orders,
        updated_at = NOW()
    WHERE id = v_shipment_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- 3. FIX: Update Shipment From Order Change Trigger
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

    -- Update shipment - cast to enum type
    UPDATE shipments
    SET status = v_new_status::shipment_status,
        total_containers = v_total_containers,
        completed_containers = v_completed_containers,
        total_orders = v_total_orders,
        completed_orders = v_completed_orders,
        updated_at = NOW()
    WHERE id = v_shipment_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- 4. Verify triggers still exist (recreate if needed)
-- ==============================================================================

-- Trigger on containers for shipment status
DROP TRIGGER IF EXISTS trg_update_shipment_status ON containers;
CREATE TRIGGER trg_update_shipment_status
    AFTER INSERT OR UPDATE OF lifecycle_status ON containers
    FOR EACH ROW
    EXECUTE FUNCTION update_shipment_status_from_containers();

-- Trigger on orders for container lifecycle
DROP TRIGGER IF EXISTS trg_update_container_lifecycle ON orders;
CREATE TRIGGER trg_update_container_lifecycle
    AFTER INSERT OR UPDATE OF status ON orders
    FOR EACH ROW
    EXECUTE FUNCTION update_container_lifecycle_from_orders();

-- Trigger on orders for shipment status
DROP TRIGGER IF EXISTS trg_update_shipment_from_orders ON orders;
CREATE TRIGGER trg_update_shipment_from_orders
    AFTER INSERT OR UPDATE OF status ON orders
    FOR EACH ROW
    EXECUTE FUNCTION update_shipment_from_order_change();

-- ==============================================================================
-- Success message
-- ==============================================================================
DO $$
BEGIN
    RAISE NOTICE 'SUCCESS: Fixed enum type casting in shipment status triggers';
END $$;
