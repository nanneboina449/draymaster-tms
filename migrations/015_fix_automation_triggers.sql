-- ==============================================================================
-- Migration 015: Fix Automation Triggers
-- ==============================================================================
-- Fixes:
-- 1. Add missing columns to invoice_line_items table
-- 2. Change auto_calculate_load_charges to use order_charges table (not load_charges)

-- ==============================================================================
-- 0. ADD MISSING COLUMNS TO INVOICE_LINE_ITEMS
-- ==============================================================================

-- The auto_generate_invoice trigger needs these columns
ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS service_date DATE;
ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS unit_rate DECIMAL(10,2);
ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS reference_number VARCHAR(100);

-- ==============================================================================
-- 1. FIX AUTO LOAD CHARGES TO USE ORDER_CHARGES TABLE
-- ==============================================================================

-- Drop old trigger first
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
    IF NEW.status = 'DISPATCHED' AND (OLD IS NULL OR OLD.status != 'DISPATCHED') THEN

        -- Get container details
        SELECT c.*, s.customer_id
        INTO v_container
        FROM containers c
        JOIN shipments s ON c.shipment_id = s.id
        WHERE c.id = NEW.container_id;

        -- Set default base rate
        v_base_rate := 350.00;

        -- Try to get customer-specific rate
        IF v_container IS NOT NULL THEN
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
        END IF;

        IF v_base_rate IS NULL THEN
            v_base_rate := 350.00;
        END IF;

        -- Delete existing auto-calculated charges from ORDER_CHARGES (not load_charges!)
        DELETE FROM order_charges
        WHERE order_id = NEW.id
        AND auto_calculated = TRUE;

        -- Add line haul charge
        INSERT INTO order_charges (order_id, charge_type, description, quantity, unit_rate, amount, billable_to, auto_calculated)
        VALUES (NEW.id, 'LINE_HAUL', 'Transportation', 1, v_base_rate, v_base_rate, 'CUSTOMER', TRUE);

        -- Add fuel surcharge
        INSERT INTO order_charges (order_id, charge_type, description, quantity, unit_rate, amount, billable_to, auto_calculated)
        VALUES (NEW.id, 'FUEL_SURCHARGE', 'Fuel Surcharge (8%)', 1, v_base_rate * v_fuel_rate, v_base_rate * v_fuel_rate, 'CUSTOMER', TRUE);

        -- Add hazmat surcharge if applicable
        IF v_container IS NOT NULL AND v_container.is_hazmat = TRUE THEN
            INSERT INTO order_charges (order_id, charge_type, description, quantity, unit_rate, amount, billable_to, auto_calculated)
            VALUES (NEW.id, 'HAZMAT', 'Hazmat Handling', 1, 75.00, 75.00, 'CUSTOMER', TRUE);
        END IF;

        -- Add overweight surcharge if applicable
        IF v_container IS NOT NULL AND (v_container.is_overweight = TRUE OR COALESCE(v_container.weight_lbs, 0) > 44000) THEN
            INSERT INTO order_charges (order_id, charge_type, description, quantity, unit_rate, amount, billable_to, auto_calculated)
            VALUES (NEW.id, 'OVERWEIGHT', 'Overweight Container', 1, 100.00, 100.00, 'CUSTOMER', TRUE);
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
-- 2. ENSURE TRIGGER ALSO WORKS ON INSERT (for direct DISPATCHED inserts)
-- ==============================================================================

DROP TRIGGER IF EXISTS trg_auto_load_charges_insert ON orders;
CREATE TRIGGER trg_auto_load_charges_insert
    AFTER INSERT ON orders
    FOR EACH ROW
    WHEN (NEW.status = 'DISPATCHED')
    EXECUTE FUNCTION auto_calculate_load_charges();

-- ==============================================================================
-- 3. FIX SYNC_CONTAINER_LIFECYCLE - Use only valid status values
-- ==============================================================================

CREATE OR REPLACE FUNCTION sync_container_lifecycle()
RETURNS TRIGGER AS $$
BEGIN
    -- Update container lifecycle when order status changes
    IF NEW.container_id IS NOT NULL THEN
        UPDATE containers
        SET lifecycle_status = CASE NEW.status
            WHEN 'DISPATCHED' THEN 'PICKED_UP'
            WHEN 'IN_PROGRESS' THEN 'PICKED_UP'
            WHEN 'DELIVERED' THEN
                CASE NEW.move_type_v2
                    WHEN 'IMPORT_DELIVERY' THEN 'DELIVERED'
                    WHEN 'EMPTY_RETURN' THEN 'RETURNED'
                    ELSE 'DELIVERED'
                END
            WHEN 'COMPLETED' THEN 'COMPLETED'
            ELSE lifecycle_status
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
    RAISE NOTICE 'Migration 015: Automation triggers fixed - using order_charges table';
END $$;
