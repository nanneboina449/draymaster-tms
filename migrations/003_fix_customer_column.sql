-- ============================================================================
-- Migration 003: Rename customers.name → customers.company_name
-- ============================================================================
-- The customers table was created with a `name` column, but all application
-- code references `company_name`. This migration renames the column and its
-- index to match.  Safe to run multiple times (DO blocks guard each statement).
-- ============================================================================

-- Rename column (only if it still has the old name)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'customers'
          AND column_name = 'name'
    ) THEN
        ALTER TABLE customers RENAME COLUMN name TO company_name;
        RAISE NOTICE 'Renamed customers.name to customers.company_name';
    ELSE
        RAISE NOTICE 'customers.company_name already exists, skipping rename';
    END IF;
END $$;

-- Rename the index to match the new column name
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE tablename = 'customers'
          AND indexname = 'idx_customers_name'
    ) THEN
        ALTER INDEX idx_customers_name RENAME TO idx_customers_company_name;
        RAISE NOTICE 'Renamed index idx_customers_name to idx_customers_company_name';
    END IF;
END $$;

-- Create the index if it doesn't exist (covers fresh-deploy edge case)
CREATE INDEX IF NOT EXISTS idx_customers_company_name ON customers(company_name);
