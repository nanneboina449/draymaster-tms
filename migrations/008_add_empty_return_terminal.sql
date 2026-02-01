-- Migration: Add empty_return_terminal to shipments table
-- This tracks where empty containers should be returned (may differ from pickup terminal)

ALTER TABLE shipments ADD COLUMN IF NOT EXISTS empty_return_terminal VARCHAR(255);

-- Also add to loads table if it exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'loads'
    ) THEN
        ALTER TABLE loads ADD COLUMN IF NOT EXISTS empty_return_terminal VARCHAR(255);
    END IF;
END $$;

-- Verify the addition
DO $$
DECLARE
    col_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'shipments' AND column_name = 'empty_return_terminal'
    ) INTO col_exists;

    IF col_exists THEN
        RAISE NOTICE 'SUCCESS: empty_return_terminal column added to shipments table';
    ELSE
        RAISE WARNING 'Column was not added - may already exist or table not found';
    END IF;
END $$;
