-- Migration: Fix orders.status column type
-- The orders table was created with shipment_status enum but should use order_status enum
-- This migration safely converts the column type

-- First, ensure the order_status enum exists with all required values
DO $$ BEGIN
    CREATE TYPE order_status AS ENUM (
        'PENDING', 'READY', 'DISPATCHED', 'IN_PROGRESS',
        'DELIVERED', 'COMPLETED', 'HOLD', 'CANCELLED', 'FAILED'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add any missing values to order_status enum (safe to run multiple times)
DO $$
BEGIN
    -- Add READY if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'READY' AND enumtypid = 'order_status'::regtype) THEN
        ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'READY' AFTER 'PENDING';
    END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Now alter the orders.status column from shipment_status to order_status
-- We need to do this in steps:
-- 1. Add a temporary column with the correct type
-- 2. Copy data (mapping values)
-- 3. Drop old column
-- 4. Rename new column

DO $$
DECLARE
    current_type text;
BEGIN
    -- Check current column type
    SELECT data_type INTO current_type
    FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'status';

    -- If it's using the wrong type (USER-DEFINED means enum)
    IF current_type = 'USER-DEFINED' THEN
        -- Check if it's specifically shipment_status
        SELECT udt_name INTO current_type
        FROM information_schema.columns
        WHERE table_name = 'orders' AND column_name = 'status';

        IF current_type = 'shipment_status' THEN
            RAISE NOTICE 'Converting orders.status from shipment_status to order_status';

            -- Add temporary column
            ALTER TABLE orders ADD COLUMN status_new order_status;

            -- Map existing values to new enum
            UPDATE orders SET status_new =
                CASE status::text
                    WHEN 'PENDING' THEN 'PENDING'::order_status
                    WHEN 'CONFIRMED' THEN 'READY'::order_status
                    WHEN 'IN_PROGRESS' THEN 'IN_PROGRESS'::order_status
                    WHEN 'DELIVERED' THEN 'DELIVERED'::order_status
                    WHEN 'COMPLETED' THEN 'COMPLETED'::order_status
                    WHEN 'CANCELLED' THEN 'CANCELLED'::order_status
                    -- Map any other values to PENDING as fallback
                    ELSE 'PENDING'::order_status
                END;

            -- Drop old column
            ALTER TABLE orders DROP COLUMN status;

            -- Rename new column
            ALTER TABLE orders RENAME COLUMN status_new TO status;

            -- Set NOT NULL and default
            ALTER TABLE orders ALTER COLUMN status SET NOT NULL;
            ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'PENDING'::order_status;

            RAISE NOTICE 'Successfully converted orders.status to order_status enum';
        ELSE
            RAISE NOTICE 'orders.status is already using % type, no conversion needed', current_type;
        END IF;
    ELSE
        RAISE NOTICE 'orders.status is type %, no conversion needed', current_type;
    END IF;
END $$;

-- Recreate index on status column
DROP INDEX IF EXISTS idx_orders_status;
CREATE INDEX idx_orders_status ON orders(status);

DROP INDEX IF EXISTS idx_orders_active;
CREATE INDEX idx_orders_active ON orders(status) WHERE status NOT IN ('COMPLETED', 'CANCELLED');

-- Verify the fix
DO $$
DECLARE
    col_type text;
BEGIN
    SELECT udt_name INTO col_type
    FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'status';

    IF col_type = 'order_status' THEN
        RAISE NOTICE 'SUCCESS: orders.status is now using order_status enum';
    ELSE
        RAISE WARNING 'orders.status is using % - may need manual intervention', col_type;
    END IF;
END $$;
