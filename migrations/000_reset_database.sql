-- ==============================================================================
-- DrayMaster TMS — Database Reset Script
-- ==============================================================================
-- Run this BEFORE 002_complete_schema.sql to start fresh.
-- Drops all tables, sequences, enums, and functions in dependency order.
-- ==============================================================================

-- Disable foreign key checks during drop (PostgreSQL uses CASCADE)
SET client_min_messages TO WARNING;

-- ==============================================================================
-- 1. DROP ALL TABLES (in reverse dependency order)
-- ==============================================================================

-- Tracking & location
DROP TABLE IF EXISTS milestones CASCADE;
DROP TABLE IF EXISTS location_records CASCADE;
DROP TABLE IF EXISTS geofences CASCADE;

-- Notifications
DROP TABLE IF EXISTS notifications CASCADE;

-- Company settings
DROP TABLE IF EXISTS company_settings CASCADE;

-- Driver rates & assignments
DROP TABLE IF EXISTS driver_rate_assignments CASCADE;
DROP TABLE IF EXISTS lane_rates CASCADE;
DROP TABLE IF EXISTS driver_rate_profiles CASCADE;

-- Billing & settlements
DROP TABLE IF EXISTS settlement_line_items CASCADE;
DROP TABLE IF EXISTS driver_settlements CASCADE;
DROP TABLE IF EXISTS driver_pay_rates CASCADE;
DROP TABLE IF EXISTS accessorial_rates CASCADE;
DROP TABLE IF EXISTS rates CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS invoice_line_items CASCADE;
DROP TABLE IF EXISTS invoices CASCADE;

-- eModal integration
DROP TABLE IF EXISTS container_tracking CASCADE;
DROP TABLE IF EXISTS gate_fees CASCADE;
DROP TABLE IF EXISTS published_containers CASCADE;

-- Exceptions
DROP TABLE IF EXISTS exception_history CASCADE;
DROP TABLE IF EXISTS exception_comments CASCADE;
DROP TABLE IF EXISTS exceptions CASCADE;

-- Appointments
DROP TABLE IF EXISTS terminal_gate_hours CASCADE;
DROP TABLE IF EXISTS terminal_appointments CASCADE;

-- Dispatch (trips, stops, legs)
DROP TABLE IF EXISTS stop_documents CASCADE;
DROP TABLE IF EXISTS trip_orders CASCADE;
DROP TABLE IF EXISTS trip_legs CASCADE;
DROP TABLE IF EXISTS trip_stops CASCADE;
DROP TABLE IF EXISTS trips CASCADE;

-- Equipment
DROP TABLE IF EXISTS inspection_defects CASCADE;
DROP TABLE IF EXISTS equipment_inspections CASCADE;
DROP TABLE IF EXISTS fuel_transactions CASCADE;
DROP TABLE IF EXISTS maintenance_records CASCADE;
DROP TABLE IF EXISTS chassis_usage CASCADE;
DROP TABLE IF EXISTS yard_inventory CASCADE;
DROP TABLE IF EXISTS trailers CASCADE;
DROP TABLE IF EXISTS chassis CASCADE;
DROP TABLE IF EXISTS tractors CASCADE;
DROP TABLE IF EXISTS chassis_pools CASCADE;

-- Driver service
DROP TABLE IF EXISTS driver_documents CASCADE;
DROP TABLE IF EXISTS compliance_alerts CASCADE;
DROP TABLE IF EXISTS hos_violations CASCADE;
DROP TABLE IF EXISTS hos_logs CASCADE;
DROP TABLE IF EXISTS drivers CASCADE;

-- Order service (loads, orders, containers, shipments)
DROP TABLE IF EXISTS load_activity_log CASCADE;
DROP TABLE IF EXISTS load_notes CASCADE;
DROP TABLE IF EXISTS load_charges CASCADE;
DROP TABLE IF EXISTS street_turns CASCADE;
DROP TABLE IF EXISTS loads CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS containers CASCADE;
DROP TABLE IF EXISTS shipments CASCADE;

-- Core reference tables
DROP TABLE IF EXISTS locations CASCADE;
DROP TABLE IF EXISTS ports CASCADE;
DROP TABLE IF EXISTS steamship_lines CASCADE;
DROP TABLE IF EXISTS customers CASCADE;

-- ==============================================================================
-- 2. DROP SEQUENCES
-- ==============================================================================

DROP SEQUENCE IF EXISTS order_number_seq CASCADE;
DROP SEQUENCE IF EXISTS trip_number_seq CASCADE;
DROP SEQUENCE IF EXISTS invoice_number_seq CASCADE;
DROP SEQUENCE IF EXISTS settlement_number_seq CASCADE;

-- ==============================================================================
-- 3. DROP ENUM TYPES
-- ==============================================================================

DROP TYPE IF EXISTS shipment_type CASCADE;
DROP TYPE IF EXISTS shipment_status CASCADE;
DROP TYPE IF EXISTS container_size CASCADE;
DROP TYPE IF EXISTS container_type CASCADE;
DROP TYPE IF EXISTS container_state CASCADE;
DROP TYPE IF EXISTS customs_status CASCADE;
DROP TYPE IF EXISTS location_type CASCADE;
DROP TYPE IF EXISTS order_type CASCADE;
DROP TYPE IF EXISTS order_status CASCADE;
DROP TYPE IF EXISTS billing_status CASCADE;
DROP TYPE IF EXISTS trip_type CASCADE;
DROP TYPE IF EXISTS trip_status CASCADE;
DROP TYPE IF EXISTS stop_type CASCADE;
DROP TYPE IF EXISTS activity_type CASCADE;
DROP TYPE IF EXISTS stop_status CASCADE;
DROP TYPE IF EXISTS appointment_type CASCADE;
DROP TYPE IF EXISTS appointment_status CASCADE;
DROP TYPE IF EXISTS exception_type CASCADE;
DROP TYPE IF EXISTS exception_severity CASCADE;
DROP TYPE IF EXISTS exception_status CASCADE;

-- ==============================================================================
-- 4. DROP FUNCTIONS
-- ==============================================================================

DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;
DROP FUNCTION IF EXISTS generate_trip_number() CASCADE;

-- ==============================================================================
-- DONE — Database is now empty. Run 002_complete_schema.sql next.
-- ==============================================================================

SELECT 'Database reset complete. Ready for 002_complete_schema.sql' AS status;
