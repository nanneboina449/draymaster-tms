-- ==============================================================================
-- Migration 012: Add missing columns to chassis_usage table
-- ==============================================================================
-- The chassis management page expects these columns for full functionality

-- Add missing columns to chassis_usage table
ALTER TABLE chassis_usage ADD COLUMN IF NOT EXISTS chassis_number VARCHAR(30);
ALTER TABLE chassis_usage ADD COLUMN IF NOT EXISTS chassis_pool VARCHAR(20) DEFAULT 'DCLI';
ALTER TABLE chassis_usage ADD COLUMN IF NOT EXISTS is_company_owned BOOLEAN DEFAULT FALSE;
ALTER TABLE chassis_usage ADD COLUMN IF NOT EXISTS container_number VARCHAR(15);
ALTER TABLE chassis_usage ADD COLUMN IF NOT EXISTS customer_name VARCHAR(200);
ALTER TABLE chassis_usage ADD COLUMN IF NOT EXISTS booking_reference VARCHAR(100);
ALTER TABLE chassis_usage ADD COLUMN IF NOT EXISTS pickup_date TIMESTAMPTZ;
ALTER TABLE chassis_usage ADD COLUMN IF NOT EXISTS pickup_terminal VARCHAR(100);
ALTER TABLE chassis_usage ADD COLUMN IF NOT EXISTS picked_up_by VARCHAR(100);
ALTER TABLE chassis_usage ADD COLUMN IF NOT EXISTS return_date TIMESTAMPTZ;
ALTER TABLE chassis_usage ADD COLUMN IF NOT EXISTS returned_by VARCHAR(100);
ALTER TABLE chassis_usage ADD COLUMN IF NOT EXISTS free_days INTEGER DEFAULT 4;
ALTER TABLE chassis_usage ADD COLUMN IF NOT EXISTS days_out INTEGER DEFAULT 0;
ALTER TABLE chassis_usage ADD COLUMN IF NOT EXISTS billable_days INTEGER DEFAULT 0;
ALTER TABLE chassis_usage ADD COLUMN IF NOT EXISTS per_diem_amount DECIMAL(10,2) DEFAULT 0;
ALTER TABLE chassis_usage ADD COLUMN IF NOT EXISTS billed_to_customer BOOLEAN DEFAULT FALSE;
ALTER TABLE chassis_usage ADD COLUMN IF NOT EXISTS pool_invoice_number VARCHAR(50);
ALTER TABLE chassis_usage ADD COLUMN IF NOT EXISTS reconciled BOOLEAN DEFAULT FALSE;
ALTER TABLE chassis_usage ADD COLUMN IF NOT EXISTS is_street_turn BOOLEAN DEFAULT FALSE;
ALTER TABLE chassis_usage ADD COLUMN IF NOT EXISTS street_turn_from_usage_id UUID;
ALTER TABLE chassis_usage ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'OUT';
ALTER TABLE chassis_usage ADD COLUMN IF NOT EXISTS notes TEXT;

-- Copy existing pickup_time to pickup_date if pickup_date is null
UPDATE chassis_usage
SET pickup_date = pickup_time
WHERE pickup_date IS NULL AND pickup_time IS NOT NULL;

-- Copy existing return_time to return_date if return_date is null
UPDATE chassis_usage
SET return_date = return_time
WHERE return_date IS NULL AND return_time IS NOT NULL;

-- Create index on status for filtering
CREATE INDEX IF NOT EXISTS idx_chassis_usage_status ON chassis_usage(status);

-- Function to auto-calculate days_out and per_diem when records are updated
CREATE OR REPLACE FUNCTION calculate_chassis_per_diem()
RETURNS TRIGGER AS $$
BEGIN
    -- Calculate days out
    IF NEW.pickup_date IS NOT NULL THEN
        NEW.days_out := GREATEST(0, EXTRACT(DAY FROM (COALESCE(NEW.return_date, NOW()) - NEW.pickup_date))::INTEGER);
        NEW.billable_days := GREATEST(0, NEW.days_out - COALESCE(NEW.free_days, 4));
        NEW.per_diem_amount := NEW.billable_days * COALESCE(NEW.daily_rate, 30);
    END IF;

    -- Update status based on return_date
    IF NEW.return_date IS NOT NULL AND NEW.status = 'OUT' THEN
        NEW.status := 'RETURNED';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for per diem calculation
DROP TRIGGER IF EXISTS trg_chassis_per_diem ON chassis_usage;
CREATE TRIGGER trg_chassis_per_diem
    BEFORE INSERT OR UPDATE ON chassis_usage
    FOR EACH ROW
    EXECUTE FUNCTION calculate_chassis_per_diem();

-- Add chassis_pools table if not exists (for pool rate management)
CREATE TABLE IF NOT EXISTS chassis_pools (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pool_name       VARCHAR(100) NOT NULL,
    pool_code       VARCHAR(20) NOT NULL UNIQUE,
    free_days       INTEGER DEFAULT 4,
    daily_rate      DECIMAL(10,2) DEFAULT 30.00,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert default chassis pools if they don't exist
INSERT INTO chassis_pools (pool_name, pool_code, free_days, daily_rate) VALUES
('DCLI Pool', 'DCLI', 4, 30.00),
('TRAC Intermodal', 'TRAC', 4, 32.00),
('FlexiVan', 'FLEXI', 5, 28.00),
('Direct Chassis', 'DIRECT', 3, 35.00),
('Company Owned', 'OWN', 999, 0.00)
ON CONFLICT (pool_code) DO NOTHING;

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Migration 012: chassis_usage columns added successfully';
END $$;
