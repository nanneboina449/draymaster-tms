-- Migration: Add pickup/delivery location columns to trips table
-- These columns support the multi-leg trip tracking feature

-- Add pickup_location and delivery_location text fields to trips
ALTER TABLE trips ADD COLUMN IF NOT EXISTS pickup_location VARCHAR(255);
ALTER TABLE trips ADD COLUMN IF NOT EXISTS delivery_location VARCHAR(255);
ALTER TABLE trips ADD COLUMN IF NOT EXISTS notes TEXT;

-- Add indexes for location-based queries
CREATE INDEX IF NOT EXISTS idx_trips_pickup_location ON trips(pickup_location);
CREATE INDEX IF NOT EXISTS idx_trips_delivery_location ON trips(delivery_location);

-- Add index for container_id if not exists (for multi-leg trip queries)
CREATE INDEX IF NOT EXISTS idx_trips_container_id ON trips(container_id);
CREATE INDEX IF NOT EXISTS idx_trips_shipment_id ON trips(shipment_id);

-- Verify the additions
DO $$
DECLARE
  col_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO col_count
  FROM information_schema.columns
  WHERE table_name = 'trips' AND column_name IN ('pickup_location', 'delivery_location', 'notes');

  RAISE NOTICE 'Trips table now has % location/notes columns', col_count;
END $$;
