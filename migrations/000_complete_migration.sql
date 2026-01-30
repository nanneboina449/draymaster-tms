-- ==============================================================================
-- COMPLETE DATABASE MIGRATION - DrayMaster TMS
-- ==============================================================================
-- This file combines all migrations in the correct order for initial setup
--
-- Contents:
--   1. Order Service Base Schema (tables: orders, containers, shipments, etc.)
--   2. Dispatch Service Base Schema (tables: trips, trip_stops, etc.)
--   3. Production Enhancements (appointments, exceptions, indexes, views)
--
-- Run Order: Execute this single file instead of running migrations separately
--
-- Usage:
--   psql -h localhost -U your_username -d draymaster_tms -f migrations/000_complete_migration.sql
--
-- ==============================================================================

\echo '================================================================================'
\echo 'Starting Complete Migration for DrayMaster TMS'
\echo '================================================================================'
\echo ''

-- ==============================================================================
-- PART 1: ORDER SERVICE BASE SCHEMA
-- ==============================================================================

\echo '--- Part 1/3: Creating Order Service Base Schema ---'
\echo ''

\i services/order-service/migrations/000001_init_schema.up.sql

\echo ''
\echo '✓ Order Service Base Schema Created'
\echo ''

-- ==============================================================================
-- PART 2: DISPATCH SERVICE BASE SCHEMA
-- ==============================================================================

\echo '--- Part 2/3: Creating Dispatch Service Base Schema ---'
\echo ''

\i services/dispatch-service/migrations/000001_init_schema.up.sql

\echo ''
\echo '✓ Dispatch Service Base Schema Created'
\echo ''

-- ==============================================================================
-- PART 3: PRODUCTION ENHANCEMENTS
-- ==============================================================================

\echo '--- Part 3/3: Applying Production Enhancements ---'
\echo ''

\i migrations/001_production_enhancements.sql

\echo ''
\echo '✓ Production Enhancements Applied'
\echo ''

-- ==============================================================================
-- VERIFICATION
-- ==============================================================================

\echo '================================================================================'
\echo 'Migration Complete! Running Verification Checks...'
\echo '================================================================================'
\echo ''

\echo '--- Checking Base Tables ---'
SELECT
    'orders' AS table_name,
    COUNT(*) AS row_count
FROM orders
UNION ALL
SELECT 'containers', COUNT(*) FROM containers
UNION ALL
SELECT 'shipments', COUNT(*) FROM shipments
UNION ALL
SELECT 'trips', COUNT(*) FROM trips
UNION ALL
SELECT 'trip_stops', COUNT(*) FROM trip_stops;

\echo ''
\echo '--- Checking New Enhancement Tables ---'
SELECT
    'terminal_appointments' AS table_name,
    COUNT(*) AS row_count
FROM terminal_appointments
UNION ALL
SELECT 'terminal_gate_hours', COUNT(*) FROM terminal_gate_hours
UNION ALL
SELECT 'exceptions', COUNT(*) FROM exceptions
UNION ALL
SELECT 'exception_comments', COUNT(*) FROM exception_comments
UNION ALL
SELECT 'exception_history', COUNT(*) FROM exception_history;

\echo ''
\echo '--- Checking Views ---'
SELECT viewname
FROM pg_views
WHERE schemaname = 'public'
  AND viewname LIKE 'v_%'
ORDER BY viewname;

\echo ''
\echo '--- Checking Enum Types ---'
SELECT
    t.typname AS enum_name,
    COUNT(e.enumlabel) AS value_count
FROM pg_type t
JOIN pg_enum e ON t.oid = e.enumtypid
WHERE t.typname IN (
    'order_status',
    'order_type',
    'trip_status',
    'trip_type',
    'appointment_type',
    'appointment_status',
    'exception_type',
    'exception_severity',
    'exception_status'
)
GROUP BY t.typname
ORDER BY t.typname;

\echo ''
\echo '--- Checking Index Count ---'
SELECT
    tablename,
    COUNT(*) AS index_count
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN (
    'orders', 'trips', 'trip_stops',
    'terminal_appointments', 'exceptions'
  )
GROUP BY tablename
ORDER BY tablename;

\echo ''
\echo '================================================================================'
\echo '✓✓✓ All Migrations Completed Successfully! ✓✓✓'
\echo '================================================================================'
\echo ''
\echo 'Database is now ready for production use.'
\echo ''
\echo 'Next Steps:'
\echo '  1. Review the verification results above'
\echo '  2. Run your application services'
\echo '  3. Check application logs for connectivity'
\echo ''
\echo 'Documentation:'
\echo '  - Feature Guide: PRODUCTION_ENHANCEMENTS.md'
\echo '  - API Reference: CRUD_OPERATIONS_GUIDE.md'
\echo '  - Migration Details: migrations/README.md'
\echo ''
\echo '================================================================================'
