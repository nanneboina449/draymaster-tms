-- ==============================================================================
-- Migration 015: Fix Automation Triggers
-- ==============================================================================
-- Fixes:
-- 1. Change auto_calculate_load_charges to use order_charges table (not load_charges)
-- 2. Add missing container lifecycle status values
-- 3. Ensure proper column sizes for status fields

-- ==============================================================================
-- 1. ADD MISSING CONTAINER LIFECYCLE STATUS VALUES
-- ==============================================================================

-- Add container lifecycle status values used by triggers
ALTER TABLE containers ALTER COLUMN lifecycle_status TYPE VARCHAR(30);

-- ==============================================================================
-- 2. FIX AUTO LOAD CHARGES TO USE ORDER_CHARGES TABLE
-- ==============================================================================

-- Drop old trigger
DROP TRIGGER IF EXISTS trg_auto_load_charges ON orders;

-- Replace function to use order_charges instead of load_charges
CREATE OR REPLACE FUNCTION auto_calculate_load_charges()
RETURNS TRIGGER AS $$
DECLARE
    v_container RECORD;
    v_base_rate DECIMAL(10,2);
    v_fuel_rate DECIMAL(5,2) := 0.08; -- 8% default
BEGIN
    -- Only trigger when order is dispatched
    IF NEW.status = 'DISPATCHED' AND OLD.status != 'DISPATCHED' THEN

        -- Get container details
        SELECT c.*, s.customer_id
        INTO v_container
        FROM containers c
        JOIN shipments s ON c.shipment_id = s.id
        WHERE c.id = NEW.container_id;

        -- Get base rate for this lane/customer
        SELECT COALESCE(
            CASE v_container.size
                WHEN '20' THEN rl.rate_20ft
                WHEN '40' THEN rl.rate_40ft
                WHEN '40HC' THEN rl.rate_40hc
                WHEN '45' THEN rl.rate_45ft
                ELSE rl.rate_40ft
            END,
            350.00
        ) INTO v_base_rate
        FROM rate_lanes rl
        WHERE (rl.customer_id = v_container.customer_id OR rl.customer_id IS NULL)
        AND rl.is_active = TRUE
        ORDER BY rl.customer_id NULLS LAST
        LIMIT 1;

        IF v_base_rate IS NULL THEN
            v_base_rate := 350.00;
        END IF;

        -- Delete existing auto-calculated charges from ORDER_CHARGES (not load_charges)
        DELETE FROM order_charges
        WHERE order_id = NEW.id
        AND auto_calculated = TRUE;

        -- Add line haul charge
        INSERT INTO order_charges (order_id, charge_type, description, quantity, unit_rate, amount, billable_to, auto_calculated)
        VALUES (NEW.id, 'LINE_HAUL', 'Transportation - ' || COALESCE(v_container.container_number, 'N/A'), 1, v_base_rate, v_base_rate, 'CUSTOMER', TRUE);

        -- Add fuel surcharge
        INSERT INTO order_charges (order_id, charge_type, description, quantity, unit_rate, amount, billable_to, auto_calculated)
        VALUES (NEW.id, 'FUEL_SURCHARGE', 'Fuel Surcharge (8%)', 1, v_base_rate * v_fuel_rate, v_base_rate * v_fuel_rate, 'CUSTOMER', TRUE);

        -- Add hazmat surcharge if applicable
        IF v_container.is_hazmat = TRUE THEN
            INSERT INTO order_charges (order_id, charge_type, description, quantity, unit_rate, amount, billable_to, auto_calculated)
            VALUES (NEW.id, 'HAZMAT', 'Hazmat Handling', 1, 75.00, 75.00, 'CUSTOMER', TRUE);
        END IF;

        -- Add overweight surcharge if applicable
        IF v_container.is_overweight = TRUE OR COALESCE(v_container.weight_lbs, 0) > 44000 THEN
            INSERT INTO order_charges (order_id, charge_type, description, quantity, unit_rate, amount, billable_to, auto_calculated)
            VALUES (NEW.id, 'OVERWEIGHT', 'Overweight Container', 1, 100.00, 100.00, 'CUSTOMER', TRUE);
        END IF;

        -- Add reefer surcharge if applicable
        IF v_container.is_reefer = TRUE THEN
            INSERT INTO order_charges (order_id, charge_type, description, quantity, unit_rate, amount, billable_to, auto_calculated)
            VALUES (NEW.id, 'REEFER', 'Reefer Monitoring', 1, 50.00, 50.00, 'CUSTOMER', TRUE);
        END IF;

        -- Update order total charges
        UPDATE orders
        SET total_charges = (
            SELECT COALESCE(SUM(amount), 0)
            FROM order_charges
            WHERE order_id = NEW.id
        )
        WHERE id = NEW.id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate trigger using the fixed function
CREATE TRIGGER trg_auto_load_charges
    AFTER UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION auto_calculate_load_charges();

-- ==============================================================================
-- 3. ENSURE TRIGGER ALSO WORKS ON INSERT (for direct DISPATCHED inserts)
-- ==============================================================================

-- Create INSERT trigger as well
DROP TRIGGER IF EXISTS trg_auto_load_charges_insert ON orders;
CREATE TRIGGER trg_auto_load_charges_insert
    AFTER INSERT ON orders
    FOR EACH ROW
    WHEN (NEW.status = 'DISPATCHED')
    EXECUTE FUNCTION auto_calculate_load_charges();

-- ==============================================================================
-- 4. FIX SYNC_CONTAINER_LIFECYCLE FOR SAFE STATUS VALUES
-- ==============================================================================

CREATE OR REPLACE FUNCTION sync_container_lifecycle()
RETURNS TRIGGER AS $$
BEGIN
    -- Update container lifecycle when order status changes
    IF NEW.container_id IS NOT NULL THEN
        UPDATE containers
        SET lifecycle_status = CASE NEW.status
            WHEN 'DISPATCHED' THEN 'PICKED_UP'
            WHEN 'IN_PROGRESS' THEN
                CASE NEW.move_type_v2
                    WHEN 'IMPORT_DELIVERY' THEN 'PICKED_UP'
                    WHEN 'EMPTY_RETURN' THEN 'PICKED_UP'
                    ELSE COALESCE(lifecycle_status, 'PICKED_UP')
                END
            WHEN 'DELIVERED' THEN
                CASE NEW.move_type_v2
                    WHEN 'IMPORT_DELIVERY' THEN 'DELIVERED'
                    WHEN 'EMPTY_RETURN' THEN 'RETURNED'
                    ELSE COALESCE(lifecycle_status, 'DELIVERED')
                END
            WHEN 'COMPLETED' THEN
                CASE NEW.move_type_v2
                    WHEN 'EMPTY_RETURN' THEN 'COMPLETED'
                    ELSE 'COMPLETED'
                END
            ELSE COALESCE(lifecycle_status, 'BOOKED')
        END,
        -- Update gate times
        gate_out_at = CASE
            WHEN NEW.status = 'IN_PROGRESS' AND gate_out_at IS NULL
            THEN NOW()
            ELSE gate_out_at
        END,
        gate_in_at = CASE
            WHEN NEW.status IN ('COMPLETED', 'DELIVERED')
            AND NEW.move_type_v2 = 'EMPTY_RETURN'
            AND gate_in_at IS NULL
            THEN NOW()
            ELSE gate_in_at
        END,
        updated_at = NOW()
        WHERE id = NEW.container_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Migration 015: Automation triggers fixed successfully';
END $$;
