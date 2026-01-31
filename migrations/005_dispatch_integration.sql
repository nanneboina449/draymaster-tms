-- ============================================================================
-- Migration 005: Dispatch Integration
-- ============================================================================
-- trip_legs: referenced by dispatch code (createMultiLegTrip, getLoadDetails,
--   LoadDetailPanel routing tab) but never created.  trip_stops (migration 002)
--   is a different table with a different schema.
-- trips.shipment_id / container_id: allow dispatching shipments created via the
--   Loads page wizard without requiring a corresponding loads table record.
-- trips.chassis_number: text field for free-form chassis entry from the dispatch
--   form (the original chassis_id FK requires a pre-existing chassis record).
-- Every statement is idempotent.
-- ============================================================================

-- 1. trip_legs table
CREATE TABLE IF NOT EXISTS trip_legs (
    id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id               UUID        NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    leg_number            INTEGER     NOT NULL DEFAULT 1,
    leg_type              VARCHAR(30) NOT NULL,
    location_type         VARCHAR(30),
    location_name         VARCHAR(255),
    location_address      VARCHAR(255),
    location_city         VARCHAR(100),
    location_state        VARCHAR(10),
    location_zip          VARCHAR(10),
    scheduled_time        TIMESTAMPTZ,
    actual_arrival        TIMESTAMPTZ,
    actual_departure      TIMESTAMPTZ,
    status                VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    waiting_time_minutes  INTEGER     DEFAULT 0,
    detention_charged     BOOLEAN     DEFAULT FALSE,
    pod_captured          BOOLEAN     DEFAULT FALSE,
    notes                 TEXT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trip_legs_trip ON trip_legs(trip_id);

-- 2. trips.shipment_id — links a trip back to the shipments table when the
--    dispatched load originated from the Loads page wizard (shipments+containers)
--    rather than from the dispatch page's OrderEntryForm (loads table).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'trips' AND column_name = 'shipment_id'
    ) THEN
        ALTER TABLE trips ADD COLUMN shipment_id UUID;
        RAISE NOTICE 'Added trips.shipment_id';
    END IF;
END $$;

-- 3. trips.container_id — identifies which specific container within a shipment
--    is being dispatched (one trip per container).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'trips' AND column_name = 'container_id'
    ) THEN
        ALTER TABLE trips ADD COLUMN container_id UUID REFERENCES containers(id);
        RAISE NOTICE 'Added trips.container_id';
    END IF;
END $$;

-- 4. trips.chassis_number — stores the free-form chassis identifier entered in
--    the dispatch form.  The original chassis_id is a FK to a chassis master
--    table; dispatchers often enter chassis numbers that aren't pre-registered.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'trips' AND column_name = 'chassis_number'
    ) THEN
        ALTER TABLE trips ADD COLUMN chassis_number VARCHAR(50);
        RAISE NOTICE 'Added trips.chassis_number';
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_trips_shipment   ON trips(shipment_id)  WHERE shipment_id  IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trips_container2 ON trips(container_id) WHERE container_id IS NOT NULL;
