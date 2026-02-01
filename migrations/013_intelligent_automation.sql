-- ==============================================================================
-- Migration 013: Intelligent Automation System
-- ==============================================================================
-- This migration adds automatic triggers and functions for:
-- 1. Chassis tracking on dispatch
-- 2. Demurrage/detention auto-calculation
-- 3. Auto-invoice generation on trip completion
-- 4. Auto-settlement line item creation
-- 5. Container lifecycle status updates
-- 6. Load charge auto-calculation
-- ==============================================================================

-- ==============================================================================
-- 1. AUTO CHASSIS TRACKING ON DISPATCH
-- ==============================================================================

-- Function: Create chassis usage record when trip is dispatched
CREATE OR REPLACE FUNCTION auto_create_chassis_usage()
RETURNS TRIGGER AS $$
DECLARE
    v_container_number VARCHAR(15);
    v_customer_name VARCHAR(200);
    v_booking_ref VARCHAR(100);
    v_pool_free_days INTEGER;
    v_pool_daily_rate DECIMAL(10,2);
BEGIN
    -- Only trigger when trip gets a chassis assigned and status changes to DISPATCHED
    IF NEW.chassis_number IS NOT NULL
       AND NEW.status IN ('DISPATCHED', 'EN_ROUTE', 'IN_PROGRESS')
       AND (OLD.chassis_number IS NULL OR OLD.status = 'PLANNED') THEN

        -- Get container and shipment info
        SELECT
            c.container_number,
            COALESCE(s.customer_name, cust.company_name),
            s.booking_number
        INTO v_container_number, v_customer_name, v_booking_ref
        FROM containers c
        LEFT JOIN shipments s ON c.shipment_id = s.id
        LEFT JOIN customers cust ON s.customer_id = cust.id
        WHERE c.id = NEW.container_id;

        -- Get pool rates (default to DCLI if not found)
        SELECT COALESCE(cp.free_days, 4), COALESCE(cp.daily_rate, 30.00)
        INTO v_pool_free_days, v_pool_daily_rate
        FROM chassis_pools cp
        WHERE cp.code = COALESCE(
            (SELECT chassis_pool FROM shipments WHERE id = NEW.shipment_id),
            'DCLI'
        );

        IF v_pool_free_days IS NULL THEN
            v_pool_free_days := 4;
            v_pool_daily_rate := 30.00;
        END IF;

        -- Check if chassis usage already exists for this trip
        IF NOT EXISTS (
            SELECT 1 FROM chassis_usage
            WHERE chassis_number = NEW.chassis_number
            AND container_number = v_container_number
            AND status = 'OUT'
        ) THEN
            -- Create chassis usage record
            INSERT INTO chassis_usage (
                chassis_number,
                chassis_pool,
                container_number,
                customer_name,
                booking_reference,
                pickup_date,
                pickup_terminal,
                picked_up_by,
                free_days,
                daily_rate,
                status
            ) VALUES (
                NEW.chassis_number,
                COALESCE((SELECT chassis_pool FROM shipments WHERE id = NEW.shipment_id), 'DCLI'),
                v_container_number,
                v_customer_name,
                v_booking_ref,
                COALESCE(NEW.actual_start_time, NOW()),
                (SELECT l.name FROM locations l
                 JOIN trip_stops ts ON ts.location_id = l.id
                 WHERE ts.trip_id = NEW.id AND ts.sequence = 1 LIMIT 1),
                (SELECT CONCAT(d.first_name, ' ', d.last_name) FROM drivers d WHERE d.id = NEW.driver_id),
                v_pool_free_days,
                v_pool_daily_rate,
                'OUT'
            );
        END IF;
    END IF;

    -- Auto-return chassis when trip is completed
    IF NEW.status = 'COMPLETED' AND OLD.status != 'COMPLETED'
       AND NEW.chassis_number IS NOT NULL THEN
        UPDATE chassis_usage
        SET
            return_date = COALESCE(NEW.actual_end_time, NOW()),
            return_location = (SELECT l.name FROM locations l
                              JOIN trip_stops ts ON ts.location_id = l.id
                              WHERE ts.trip_id = NEW.id
                              ORDER BY ts.sequence DESC LIMIT 1),
            returned_by = (SELECT CONCAT(d.first_name, ' ', d.last_name)
                          FROM drivers d WHERE d.id = NEW.driver_id),
            status = 'RETURNED'
        WHERE chassis_number = NEW.chassis_number
        AND status = 'OUT';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for chassis tracking
DROP TRIGGER IF EXISTS trg_auto_chassis_usage ON trips;
CREATE TRIGGER trg_auto_chassis_usage
    AFTER INSERT OR UPDATE ON trips
    FOR EACH ROW
    EXECUTE FUNCTION auto_create_chassis_usage();

-- ==============================================================================
-- 2. AUTO DEMURRAGE CALCULATION
-- ==============================================================================

-- Function: Calculate and create demurrage charges when container gate_out
CREATE OR REPLACE FUNCTION auto_calculate_demurrage()
RETURNS TRIGGER AS $$
DECLARE
    v_carrier_code VARCHAR(20);
    v_free_days INTEGER;
    v_free_time_end TIMESTAMPTZ;
    v_demurrage_rate DECIMAL(10,2);
BEGIN
    -- Only trigger when gate_out_at is set
    IF NEW.gate_out_at IS NOT NULL AND OLD.gate_out_at IS NULL THEN

        -- Get carrier code from shipment
        SELECT s.steamship_line INTO v_carrier_code
        FROM shipments s WHERE s.id = NEW.shipment_id;

        -- Get free time rules for carrier
        SELECT
            COALESCE(cfr.import_free_days, 5),
            COALESCE(cfr.demurrage_rate_day1_4, 75.00)
        INTO v_free_days, v_demurrage_rate
        FROM carrier_free_time_rules cfr
        WHERE cfr.carrier_code = v_carrier_code;

        -- Default if no carrier rules found
        IF v_free_days IS NULL THEN
            v_free_days := 5;
            v_demurrage_rate := 75.00;
        END IF;

        -- Calculate free time expiration
        v_free_time_end := NEW.gate_out_at + (v_free_days || ' days')::INTERVAL;

        -- Update container with demurrage tracking
        NEW.free_time_expires_at := v_free_time_end;
        NEW.demurrage_status := 'OK';
        NEW.estimated_demurrage := 0;

        -- Create container charge record for tracking
        INSERT INTO container_charges (
            container_id,
            shipment_id,
            charge_type,
            free_time_start,
            free_time_end,
            free_days_allowed,
            daily_rate,
            status
        ) VALUES (
            NEW.id,
            NEW.shipment_id,
            'DEMURRAGE',
            NEW.gate_out_at,
            v_free_time_end,
            v_free_days,
            v_demurrage_rate,
            'ACCRUING'
        )
        ON CONFLICT DO NOTHING;
    END IF;

    -- Update demurrage when container returned (gate_in)
    IF NEW.gate_in_at IS NOT NULL AND OLD.gate_in_at IS NULL THEN
        -- Close the demurrage charge
        UPDATE container_charges
        SET
            actual_return = NEW.gate_in_at,
            days_used = GREATEST(0, EXTRACT(DAY FROM (NEW.gate_in_at - free_time_start))::INTEGER),
            days_over = GREATEST(0, EXTRACT(DAY FROM (NEW.gate_in_at - free_time_end))::INTEGER),
            total_charge = GREATEST(0, EXTRACT(DAY FROM (NEW.gate_in_at - free_time_end))::INTEGER) * daily_rate,
            status = CASE
                WHEN NEW.gate_in_at <= free_time_end THEN 'CLOSED'
                ELSE 'CALCULATED'
            END
        WHERE container_id = NEW.id AND charge_type = 'DEMURRAGE' AND status = 'ACCRUING';

        -- Update container demurrage fields
        NEW.demurrage_status := 'CLOSED';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for demurrage calculation
DROP TRIGGER IF EXISTS trg_auto_demurrage ON containers;
CREATE TRIGGER trg_auto_demurrage
    BEFORE UPDATE ON containers
    FOR EACH ROW
    EXECUTE FUNCTION auto_calculate_demurrage();

-- Function: Update demurrage status periodically (call via cron or app)
CREATE OR REPLACE FUNCTION update_demurrage_status()
RETURNS INTEGER AS $$
DECLARE
    v_updated INTEGER := 0;
BEGIN
    -- Update containers that are past warning threshold (80% of free time)
    UPDATE containers
    SET
        demurrage_status = CASE
            WHEN NOW() > free_time_expires_at THEN 'OVERDUE'
            WHEN NOW() > free_time_expires_at - INTERVAL '1 day' THEN 'CRITICAL'
            WHEN NOW() > free_time_expires_at - INTERVAL '2 days' THEN 'WARNING'
            ELSE 'OK'
        END,
        estimated_demurrage = CASE
            WHEN NOW() > free_time_expires_at THEN
                GREATEST(0, EXTRACT(DAY FROM (NOW() - free_time_expires_at))::INTEGER) *
                COALESCE((SELECT daily_rate FROM container_charges cc
                         WHERE cc.container_id = containers.id
                         AND cc.charge_type = 'DEMURRAGE' LIMIT 1), 75)
            ELSE 0
        END
    WHERE gate_out_at IS NOT NULL
    AND gate_in_at IS NULL
    AND lifecycle_status NOT IN ('RETURNED', 'COMPLETED');

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RETURN v_updated;
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- 3. AUTO INVOICE GENERATION
-- ==============================================================================

-- Function: Auto-generate invoice when order is completed
CREATE OR REPLACE FUNCTION auto_generate_invoice()
RETURNS TRIGGER AS $$
DECLARE
    v_invoice_id UUID;
    v_invoice_number VARCHAR(50);
    v_customer_id UUID;
    v_subtotal DECIMAL(12,2) := 0;
    v_charge RECORD;
BEGIN
    -- Only trigger when order status changes to COMPLETED or DELIVERED (for billing)
    IF NEW.status IN ('COMPLETED', 'DELIVERED')
       AND OLD.status NOT IN ('COMPLETED', 'DELIVERED', 'INVOICED') THEN

        -- Get customer from shipment
        SELECT s.customer_id INTO v_customer_id
        FROM shipments s
        JOIN containers c ON c.shipment_id = s.id
        WHERE c.id = NEW.container_id;

        -- Skip if no customer or already invoiced
        IF v_customer_id IS NULL THEN
            RETURN NEW;
        END IF;

        -- Check if invoice already exists for this order
        IF EXISTS (SELECT 1 FROM invoice_line_items ili
                  JOIN invoices i ON i.id = ili.invoice_id
                  WHERE ili.reference_number = NEW.order_number) THEN
            RETURN NEW;
        END IF;

        -- Generate invoice number
        v_invoice_number := 'INV-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' ||
                           LPAD((SELECT COUNT(*) + 1 FROM invoices
                                WHERE DATE(created_at) = CURRENT_DATE)::TEXT, 4, '0');

        -- Create invoice
        INSERT INTO invoices (
            invoice_number,
            customer_id,
            shipment_id,
            invoice_date,
            due_date,
            status
        ) VALUES (
            v_invoice_number,
            v_customer_id,
            NEW.shipment_id,
            CURRENT_DATE,
            CURRENT_DATE + INTERVAL '30 days',
            'DRAFT'
        ) RETURNING id INTO v_invoice_id;

        -- Add line haul charge based on order type
        INSERT INTO invoice_line_items (
            invoice_id,
            description,
            charge_type,
            container_number,
            service_date,
            quantity,
            unit_rate,
            amount
        )
        SELECT
            v_invoice_id,
            CASE NEW.move_type_v2
                WHEN 'IMPORT_DELIVERY' THEN 'Import Delivery - ' || c.container_number
                WHEN 'EXPORT_PICKUP' THEN 'Export Pickup - ' || c.container_number
                WHEN 'EMPTY_RETURN' THEN 'Empty Return - ' || c.container_number
                WHEN 'EMPTY_PICKUP' THEN 'Empty Pickup - ' || c.container_number
                ELSE 'Transportation - ' || c.container_number
            END,
            'LINE_HAUL',
            c.container_number,
            CURRENT_DATE,
            1,
            COALESCE(
                (SELECT rate_40ft FROM rate_lanes rl
                 WHERE rl.customer_id = v_customer_id
                 AND rl.is_active = TRUE LIMIT 1),
                350.00
            ),
            COALESCE(
                (SELECT rate_40ft FROM rate_lanes rl
                 WHERE rl.customer_id = v_customer_id
                 AND rl.is_active = TRUE LIMIT 1),
                350.00
            )
        FROM containers c WHERE c.id = NEW.container_id;

        -- Add fuel surcharge (default 8%)
        INSERT INTO invoice_line_items (
            invoice_id,
            description,
            charge_type,
            service_date,
            quantity,
            unit_rate,
            amount
        )
        SELECT
            v_invoice_id,
            'Fuel Surcharge (8%)',
            'FUEL_SURCHARGE',
            CURRENT_DATE,
            1,
            unit_rate * 0.08,
            unit_rate * 0.08
        FROM invoice_line_items WHERE invoice_id = v_invoice_id AND charge_type = 'LINE_HAUL';

        -- Add demurrage charges if any
        INSERT INTO invoice_line_items (
            invoice_id,
            description,
            charge_type,
            container_number,
            service_date,
            quantity,
            unit_rate,
            amount
        )
        SELECT
            v_invoice_id,
            'Demurrage - ' || cc.days_over || ' days over free time',
            'DEMURRAGE',
            c.container_number,
            CURRENT_DATE,
            cc.days_over,
            cc.daily_rate,
            cc.total_charge
        FROM container_charges cc
        JOIN containers c ON c.id = cc.container_id
        WHERE cc.container_id = NEW.container_id
        AND cc.charge_type = 'DEMURRAGE'
        AND cc.total_charge > 0;

        -- Add chassis per diem if applicable
        INSERT INTO invoice_line_items (
            invoice_id,
            description,
            charge_type,
            service_date,
            quantity,
            unit_rate,
            amount
        )
        SELECT
            v_invoice_id,
            'Chassis Per Diem - ' || cu.chassis_number || ' (' || cu.billable_days || ' billable days)',
            'CHASSIS_PER_DIEM',
            CURRENT_DATE,
            cu.billable_days,
            cu.daily_rate,
            cu.per_diem_amount
        FROM chassis_usage cu
        JOIN containers c ON cu.container_number = c.container_number
        WHERE c.id = NEW.container_id
        AND cu.per_diem_amount > 0
        AND cu.billed_to_customer = FALSE;

        -- Mark chassis as billed
        UPDATE chassis_usage
        SET billed_to_customer = TRUE
        WHERE container_number = (SELECT container_number FROM containers WHERE id = NEW.container_id)
        AND billed_to_customer = FALSE;

        -- Calculate totals
        SELECT COALESCE(SUM(amount), 0) INTO v_subtotal
        FROM invoice_line_items WHERE invoice_id = v_invoice_id;

        -- Update invoice totals
        UPDATE invoices
        SET
            subtotal = v_subtotal,
            total_amount = v_subtotal,
            balance_due = v_subtotal
        WHERE id = v_invoice_id;

        -- Update order to mark as invoiced
        NEW.status := 'INVOICED';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for auto-invoice
DROP TRIGGER IF EXISTS trg_auto_invoice ON orders;
CREATE TRIGGER trg_auto_invoice
    BEFORE UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION auto_generate_invoice();

-- ==============================================================================
-- 4. AUTO SETTLEMENT LINE ITEMS
-- ==============================================================================

-- Function: Create settlement line items when trip is completed
CREATE OR REPLACE FUNCTION auto_create_settlement_items()
RETURNS TRIGGER AS $$
DECLARE
    v_driver_rate RECORD;
    v_base_pay DECIMAL(10,2);
    v_waiting_pay DECIMAL(10,2) := 0;
    v_accessorial_pay DECIMAL(10,2) := 0;
    v_settlement_id UUID;
BEGIN
    -- Only trigger when trip is completed
    IF NEW.status = 'COMPLETED' AND OLD.status != 'COMPLETED' THEN

        -- Get driver pay rate
        SELECT * INTO v_driver_rate
        FROM driver_pay_rates dpr
        WHERE dpr.driver_id = NEW.driver_id
        AND dpr.is_active = TRUE
        ORDER BY dpr.effective_date DESC
        LIMIT 1;

        -- Calculate base pay based on pay type
        IF v_driver_rate.pay_type = 'PER_LOAD' THEN
            v_base_pay := v_driver_rate.rate;
        ELSIF v_driver_rate.pay_type = 'PER_MILE' THEN
            v_base_pay := COALESCE(NEW.total_miles, 0) * v_driver_rate.rate;
        ELSIF v_driver_rate.pay_type = 'PERCENTAGE' THEN
            v_base_pay := COALESCE(NEW.revenue, 0) * (v_driver_rate.rate / 100);
        ELSE
            v_base_pay := COALESCE(v_driver_rate.rate, 100.00);
        END IF;

        -- Calculate waiting time pay
        SELECT COALESCE(SUM(detention_mins), 0) INTO v_waiting_pay
        FROM trip_stops WHERE trip_id = NEW.id;

        IF v_waiting_pay > 120 THEN -- Free 2 hours
            v_waiting_pay := ((v_waiting_pay - 120) / 60.0) *
                            COALESCE((SELECT waiting_rate_per_hour FROM driver_rate_profiles
                                     WHERE id = v_driver_rate.profile_id), 25.00);
        ELSE
            v_waiting_pay := 0;
        END IF;

        -- Get or create current period settlement
        SELECT id INTO v_settlement_id
        FROM driver_settlements
        WHERE driver_id = NEW.driver_id
        AND status = 'DRAFT'
        AND period_start <= CURRENT_DATE
        AND period_end >= CURRENT_DATE;

        IF v_settlement_id IS NULL THEN
            INSERT INTO driver_settlements (
                driver_id,
                settlement_number,
                period_start,
                period_end,
                status
            ) VALUES (
                NEW.driver_id,
                'STL-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' ||
                LPAD((SELECT COUNT(*) + 1 FROM driver_settlements
                     WHERE DATE(created_at) = CURRENT_DATE)::TEXT, 4, '0'),
                DATE_TRUNC('week', CURRENT_DATE),
                DATE_TRUNC('week', CURRENT_DATE) + INTERVAL '6 days',
                'DRAFT'
            ) RETURNING id INTO v_settlement_id;
        END IF;

        -- Create base pay line item
        INSERT INTO settlement_line_items (
            settlement_id,
            trip_id,
            trip_number,
            type,
            description,
            miles,
            rate,
            amount
        ) VALUES (
            v_settlement_id,
            NEW.id,
            NEW.trip_number,
            'BASE_PAY',
            'Trip ' || NEW.trip_number || ' - ' || COALESCE(v_driver_rate.pay_type, 'FLAT'),
            NEW.total_miles,
            v_driver_rate.rate,
            v_base_pay
        );

        -- Create waiting time line item if applicable
        IF v_waiting_pay > 0 THEN
            INSERT INTO settlement_line_items (
                settlement_id,
                trip_id,
                trip_number,
                type,
                description,
                amount
            ) VALUES (
                v_settlement_id,
                NEW.id,
                NEW.trip_number,
                'WAITING_TIME',
                'Waiting time - Trip ' || NEW.trip_number,
                v_waiting_pay
            );
        END IF;

        -- Update settlement totals
        UPDATE driver_settlements
        SET
            total_trips = (SELECT COUNT(DISTINCT trip_id) FROM settlement_line_items WHERE settlement_id = v_settlement_id),
            total_miles = (SELECT COALESCE(SUM(miles), 0) FROM settlement_line_items WHERE settlement_id = v_settlement_id),
            gross_earnings = (SELECT COALESCE(SUM(amount), 0) FROM settlement_line_items WHERE settlement_id = v_settlement_id AND type NOT LIKE '%DEDUCTION%'),
            waiting_pay = (SELECT COALESCE(SUM(amount), 0) FROM settlement_line_items WHERE settlement_id = v_settlement_id AND type = 'WAITING_TIME'),
            net_pay = (SELECT COALESCE(SUM(amount), 0) FROM settlement_line_items WHERE settlement_id = v_settlement_id) -
                     COALESCE(fuel_deductions, 0) - COALESCE(advance_deductions, 0) - COALESCE(other_deductions, 0),
            updated_at = NOW()
        WHERE id = v_settlement_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for auto-settlement
DROP TRIGGER IF EXISTS trg_auto_settlement ON trips;
CREATE TRIGGER trg_auto_settlement
    AFTER UPDATE ON trips
    FOR EACH ROW
    EXECUTE FUNCTION auto_create_settlement_items();

-- ==============================================================================
-- 5. CONTAINER LIFECYCLE STATUS SYNC
-- ==============================================================================

-- Function: Auto-update container lifecycle based on order/trip status
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
                    WHEN 'IMPORT_DELIVERY' THEN 'IN_TRANSIT'
                    WHEN 'EMPTY_RETURN' THEN 'RETURNING'
                    ELSE lifecycle_status
                END
            WHEN 'DELIVERED' THEN
                CASE NEW.move_type_v2
                    WHEN 'IMPORT_DELIVERY' THEN 'DELIVERED'
                    WHEN 'EMPTY_RETURN' THEN 'RETURNED'
                    ELSE lifecycle_status
                END
            WHEN 'COMPLETED' THEN
                CASE NEW.move_type_v2
                    WHEN 'EMPTY_RETURN' THEN 'COMPLETED'
                    ELSE lifecycle_status
                END
            ELSE lifecycle_status
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

-- Create trigger for container lifecycle sync
DROP TRIGGER IF EXISTS trg_sync_container_lifecycle ON orders;
CREATE TRIGGER trg_sync_container_lifecycle
    AFTER UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION sync_container_lifecycle();

-- ==============================================================================
-- 6. AUTO LOAD CHARGES CALCULATION
-- ==============================================================================

-- Function: Auto-calculate charges when order is dispatched
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

        -- Delete existing auto-calculated charges
        DELETE FROM load_charges
        WHERE order_id = NEW.id
        AND auto_calculated = TRUE;

        -- Add line haul charge
        INSERT INTO load_charges (order_id, charge_type, description, quantity, unit_rate, amount, billable_to, auto_calculated)
        VALUES (NEW.id, 'LINE_HAUL', 'Transportation - ' || v_container.container_number, 1, v_base_rate, v_base_rate, 'CUSTOMER', TRUE);

        -- Add fuel surcharge
        INSERT INTO load_charges (order_id, charge_type, description, quantity, unit_rate, amount, billable_to, auto_calculated)
        VALUES (NEW.id, 'FUEL_SURCHARGE', 'Fuel Surcharge (8%)', 1, v_base_rate * v_fuel_rate, v_base_rate * v_fuel_rate, 'CUSTOMER', TRUE);

        -- Add hazmat surcharge if applicable
        IF v_container.is_hazmat = TRUE THEN
            INSERT INTO load_charges (order_id, charge_type, description, quantity, unit_rate, amount, billable_to, auto_calculated)
            VALUES (NEW.id, 'HAZMAT', 'Hazmat Handling', 1, 75.00, 75.00, 'CUSTOMER', TRUE);
        END IF;

        -- Add overweight surcharge if applicable
        IF v_container.is_overweight = TRUE OR COALESCE(v_container.weight_lbs, 0) > 44000 THEN
            INSERT INTO load_charges (order_id, charge_type, description, quantity, unit_rate, amount, billable_to, auto_calculated)
            VALUES (NEW.id, 'OVERWEIGHT', 'Overweight Container', 1, 100.00, 100.00, 'CUSTOMER', TRUE);
        END IF;

        -- Add reefer surcharge if applicable
        IF v_container.is_reefer = TRUE THEN
            INSERT INTO load_charges (order_id, charge_type, description, quantity, unit_rate, amount, billable_to, auto_calculated)
            VALUES (NEW.id, 'REEFER', 'Reefer Monitoring', 1, 50.00, 50.00, 'CUSTOMER', TRUE);
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for auto load charges
DROP TRIGGER IF EXISTS trg_auto_load_charges ON orders;
CREATE TRIGGER trg_auto_load_charges
    AFTER UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION auto_calculate_load_charges();

-- ==============================================================================
-- 7. ADD MISSING COLUMNS FOR AUTOMATION
-- ==============================================================================

-- Add order_id to load_charges if not exists
ALTER TABLE load_charges ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES orders(id);
ALTER TABLE load_charges ADD COLUMN IF NOT EXISTS auto_calculated BOOLEAN DEFAULT FALSE;

-- Add reference_number to invoice_line_items for deduplication
ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS reference_number VARCHAR(100);

-- Add profile_id to driver_pay_rates
ALTER TABLE driver_pay_rates ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES driver_rate_profiles(id);
ALTER TABLE driver_pay_rates ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- Add INVOICED status to orders if not in enum
DO $$
BEGIN
    -- Check if INVOICED exists in the enum
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'INVOICED'
        AND enumtypid = 'order_status'::regtype
    ) THEN
        ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'INVOICED';
    END IF;
EXCEPTION
    WHEN undefined_object THEN
        -- order_status type doesn't exist or is varchar, ignore
        NULL;
END $$;

-- ==============================================================================
-- 8. INDEXES FOR PERFORMANCE
-- ==============================================================================

CREATE INDEX IF NOT EXISTS idx_orders_status_container ON orders(status, container_id);
CREATE INDEX IF NOT EXISTS idx_trips_status_driver ON trips(status, driver_id);
CREATE INDEX IF NOT EXISTS idx_chassis_usage_status ON chassis_usage(status);
CREATE INDEX IF NOT EXISTS idx_container_charges_container ON container_charges(container_id, charge_type);
CREATE INDEX IF NOT EXISTS idx_settlement_items_settlement ON settlement_line_items(settlement_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_line_items(invoice_id);

-- ==============================================================================
-- SUCCESS MESSAGE
-- ==============================================================================

DO $$
BEGIN
    RAISE NOTICE '==============================================';
    RAISE NOTICE 'Migration 013: Intelligent Automation System';
    RAISE NOTICE '==============================================';
    RAISE NOTICE 'Automated features enabled:';
    RAISE NOTICE '  1. Chassis tracking on dispatch';
    RAISE NOTICE '  2. Demurrage/detention auto-calculation';
    RAISE NOTICE '  3. Auto-invoice generation on completion';
    RAISE NOTICE '  4. Auto-settlement line items';
    RAISE NOTICE '  5. Container lifecycle sync';
    RAISE NOTICE '  6. Load charges auto-calculation';
    RAISE NOTICE '==============================================';
END $$;
