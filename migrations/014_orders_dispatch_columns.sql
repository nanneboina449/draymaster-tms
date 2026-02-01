-- ==============================================================================
-- Migration 014: Add missing dispatch-related columns to orders table
-- ==============================================================================
-- The dispatch board expects these columns for driver/tractor/chassis assignment

-- Add tractor assignment to orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS assigned_tractor_id UUID REFERENCES tractors(id);

-- Add chassis information to orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS chassis_number VARCHAR(30);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS chassis_pool VARCHAR(20) DEFAULT 'DCLI';

-- Create indexes for dispatch queries
CREATE INDEX IF NOT EXISTS idx_orders_assigned_tractor ON orders(assigned_tractor_id);

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Migration 014: orders dispatch columns added successfully';
END $$;
