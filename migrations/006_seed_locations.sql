-- Migration: Seed common locations for dispatch
-- This adds common terminals, yards, and depots for LA/Long Beach ports

-- Insert common terminals (LA/LB Port Area)
INSERT INTO locations (id, name, type, address, city, state, zip, notes) VALUES
  (gen_random_uuid(), 'APM Terminals - Los Angeles', 'TERMINAL', '2500 Navy Way', 'Los Angeles', 'CA', '90731', 'APM LA Terminal'),
  (gen_random_uuid(), 'Pier 400 - Maersk', 'TERMINAL', '500 Pier 400', 'Los Angeles', 'CA', '90731', 'Maersk Terminal at Pier 400'),
  (gen_random_uuid(), 'TraPac Terminal', 'TERMINAL', '630 Terminal Way', 'San Pedro', 'CA', '90731', 'TraPac Container Terminal'),
  (gen_random_uuid(), 'Yusen Terminals (YTI)', 'TERMINAL', '701 New Dock St', 'San Pedro', 'CA', '90731', 'Yusen Terminal'),
  (gen_random_uuid(), 'Pacific Container Terminal (PCT)', 'TERMINAL', '2020 John S Gibson Blvd', 'San Pedro', 'CA', '90731', 'PCT Terminal'),
  (gen_random_uuid(), 'Long Beach Container Terminal (LBCT)', 'TERMINAL', '1 Pier T Blvd', 'Long Beach', 'CA', '90802', 'LBCT Middle Harbor'),
  (gen_random_uuid(), 'ITS Terminal', 'TERMINAL', '1 Pier G Way', 'Long Beach', 'CA', '90802', 'International Transportation Service'),
  (gen_random_uuid(), 'SSA Marine Terminal A', 'TERMINAL', '1411 Pier C St', 'Long Beach', 'CA', '90813', 'SSA Terminal A'),
  (gen_random_uuid(), 'West Basin Container Terminal', 'TERMINAL', '1171 Pier S Way', 'Long Beach', 'CA', '90802', 'WBCT')
ON CONFLICT DO NOTHING;

-- Insert common yards
INSERT INTO locations (id, name, type, address, city, state, zip, notes) VALUES
  (gen_random_uuid(), 'Main Yard - Carson', 'YARD', '20000 S Main St', 'Carson', 'CA', '90810', 'Primary container yard'),
  (gen_random_uuid(), 'Compton Yard', 'YARD', '1000 E Compton Blvd', 'Compton', 'CA', '90221', 'Secondary yard - Compton'),
  (gen_random_uuid(), 'Wilmington Yard', 'YARD', '1300 N Avalon Blvd', 'Wilmington', 'CA', '90744', 'Yard near port'),
  (gen_random_uuid(), 'Long Beach Yard', 'YARD', '2500 E Pacific Coast Hwy', 'Long Beach', 'CA', '90804', 'Long Beach area yard'),
  (gen_random_uuid(), 'Rancho Dominguez Yard', 'YARD', '18000 S Figueroa St', 'Rancho Dominguez', 'CA', '90220', 'Rancho Dominguez storage')
ON CONFLICT DO NOTHING;

-- Insert common empty return depots
INSERT INTO locations (id, name, type, address, city, state, zip, notes) VALUES
  (gen_random_uuid(), 'DCLI - Carson', 'DEPOT', '19000 S Wilmington Ave', 'Carson', 'CA', '90810', 'DCLI chassis depot'),
  (gen_random_uuid(), 'TRAC - Long Beach', 'DEPOT', '1900 W Anaheim St', 'Long Beach', 'CA', '90813', 'TRAC chassis depot'),
  (gen_random_uuid(), 'Flexivan - Compton', 'DEPOT', '800 E Artesia Blvd', 'Compton', 'CA', '90221', 'Flexivan depot'),
  (gen_random_uuid(), 'Universal Intermodal', 'DEPOT', '1600 E Sepulveda Blvd', 'Carson', 'CA', '90745', 'Universal chassis/container depot')
ON CONFLICT DO NOTHING;

-- Verify insertions
DO $$
DECLARE
  terminal_count INTEGER;
  yard_count INTEGER;
  depot_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO terminal_count FROM locations WHERE type = 'TERMINAL';
  SELECT COUNT(*) INTO yard_count FROM locations WHERE type = 'YARD';
  SELECT COUNT(*) INTO depot_count FROM locations WHERE type = 'DEPOT';

  RAISE NOTICE 'Locations seeded: % terminals, % yards, % depots', terminal_count, yard_count, depot_count;
END $$;
