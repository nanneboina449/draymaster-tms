# Database Migrations Guide

## Overview

This directory contains SQL migration scripts for the DrayMaster TMS database schema changes.

---

## ⚠️ IMPORTANT: Migration Order

**If you're setting up a new database, you MUST run migrations in the correct order:**

### Quick Start (Recommended)

Use the master migration script that runs everything in the correct order:

```bash
# Backup first (always!)
pg_dump -h localhost -U postgres draymaster_tms > backup.sql

# Run complete migration (easiest method)
psql -h localhost -U postgres -d draymaster_tms -f migrations/000_complete_migration.sql
```

This single command will:
1. Create all base tables (orders, containers, trips, trip_stops, etc.)
2. Apply production enhancements (appointments, exceptions, indexes, views)
3. Run verification checks
4. Show you the results

### Manual Migration Order

If you prefer to run migrations manually, use this order:

```bash
# Step 1: Order Service Base Schema
psql -h localhost -U postgres -d draymaster_tms -f services/order-service/migrations/000001_init_schema.up.sql

# Step 2: Dispatch Service Base Schema
psql -h localhost -U postgres -d draymaster_tms -f services/dispatch-service/migrations/000001_init_schema.up.sql

# Step 3: Production Enhancements
psql -h localhost -U postgres -d draymaster_tms -f migrations/001_production_enhancements.sql
```

### Why Order Matters

The production enhancements migration references tables created in the base schemas:
- `terminal_appointments` has foreign keys to `orders(id)` and `trips(id)`
- `exceptions` has foreign keys to `trips(id)` and `trip_stops(id)`
- Enhanced columns are added to existing `orders`, `trips`, and `trip_stops` tables

**Error you'll see if you skip base schemas:**
```
ERROR: 42P01: relation "trip_stops" does not exist
```

---

## 📋 Migration: 001_production_enhancements.sql

**File:** `001_production_enhancements.sql`
**Version:** 1.0.0
**Date:** 2026-01-30

### What This Migration Does

This migration adds all database tables and indexes needed for the production enhancements:

#### **New Tables Created:**
1. ✅ `terminal_appointments` - Terminal gate appointment management
2. ✅ `terminal_gate_hours` - Terminal operating hours
3. ✅ `exceptions` - Operational exception tracking
4. ✅ `exception_comments` - Comments on exceptions
5. ✅ `exception_history` - Exception status change history

#### **Enhanced Existing Tables:**
- ✅ `orders` - Added columns: `move_type`, `customer_reference`, `deleted_at`
- ✅ `trips` - Added columns: `revenue`, `cost`, `deleted_at`
- ✅ `trip_stops` - Added column: `deleted_at`

#### **New Enum Types:**
- ✅ `appointment_type` - PICKUP, RETURN, DROP_OFF, DUAL
- ✅ `appointment_status` - REQUESTED, PENDING, CONFIRMED, etc.
- ✅ `exception_type` - FAILED_PICKUP, TERMINAL_CLOSED, etc.
- ✅ `exception_severity` - LOW, MEDIUM, HIGH, CRITICAL
- ✅ `exception_status` - OPEN, ACKNOWLEDGED, IN_PROGRESS, etc.

#### **Performance Indexes:**
- ✅ 50+ indexes for optimized queries
- ✅ Covering indexes for common filters
- ✅ Partial indexes for active records

#### **Database Views:**
- ✅ `v_active_orders` - Orders with container info
- ✅ `v_active_trips` - Trips with stop counts
- ✅ `v_open_exceptions` - Open exceptions summary
- ✅ `v_upcoming_appointments` - Future appointments

#### **Triggers:**
- ✅ Auto-update `updated_at` timestamps

---

## 🚀 How to Run the Migration

### Option 1: Using psql (Recommended)

```bash
# Connect to your database and run the migration
psql -h localhost -U your_username -d draymaster_tms -f migrations/001_production_enhancements.sql

# Or if you're already connected to psql:
\i migrations/001_production_enhancements.sql
```

### Option 2: Using pg_dump/restore tool

```bash
psql -h localhost -U your_username -d draymaster_tms < migrations/001_production_enhancements.sql
```

### Option 3: Using a Database IDE

1. Open **pgAdmin**, **DBeaver**, or **DataGrip**
2. Connect to your database
3. Open `001_production_enhancements.sql`
4. Execute the entire script

### Option 4: Using Docker (if running in Docker)

```bash
# Copy migration file into container
docker cp migrations/001_production_enhancements.sql draymaster-postgres:/tmp/

# Execute migration
docker exec -it draymaster-postgres psql -U postgres -d draymaster_tms -f /tmp/001_production_enhancements.sql
```

---

## ✅ Pre-Migration Checklist

Before running the migration:

1. **Backup Your Database**
   ```bash
   pg_dump -h localhost -U your_username draymaster_tms > backup_before_migration.sql
   ```

2. **Check Database Connection**
   ```bash
   psql -h localhost -U your_username -d draymaster_tms -c "SELECT version();"
   ```

3. **Verify Existing Tables**
   ```sql
   SELECT tablename FROM pg_tables WHERE schemaname = 'public';
   ```

4. **Check for Required Tables**
   - Ensure `orders` table exists
   - Ensure `trips` table exists
   - Ensure `trip_stops` table exists
   - Ensure `containers` table exists

---

## 🔍 Post-Migration Verification

After running the migration, verify everything was created successfully:

### 1. Check New Tables

```sql
-- Should return 5 rows
SELECT 'terminal_appointments' AS table_name, COUNT(*) AS count FROM terminal_appointments
UNION ALL
SELECT 'terminal_gate_hours', COUNT(*) FROM terminal_gate_hours
UNION ALL
SELECT 'exceptions', COUNT(*) FROM exceptions
UNION ALL
SELECT 'exception_comments', COUNT(*) FROM exception_comments
UNION ALL
SELECT 'exception_history', COUNT(*) FROM exception_history;
```

### 2. Check Indexes

```sql
-- Should return 50+ indexes
SELECT
    tablename,
    indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('terminal_appointments', 'exceptions', 'orders', 'trips', 'trip_stops')
ORDER BY tablename, indexname;
```

### 3. Check Views

```sql
-- Should return 4 views
SELECT viewname
FROM pg_views
WHERE schemaname = 'public'
  AND viewname LIKE 'v_%'
ORDER BY viewname;
```

### 4. Check Enum Types

```sql
-- Should return all new enum types
SELECT
    t.typname AS enum_name,
    STRING_AGG(e.enumlabel, ', ' ORDER BY e.enumsortorder) AS values
FROM pg_type t
JOIN pg_enum e ON t.oid = e.enumtypid
WHERE t.typname IN (
    'appointment_type',
    'appointment_status',
    'exception_type',
    'exception_severity',
    'exception_status'
)
GROUP BY t.typname
ORDER BY t.typname;
```

### 5. Check Triggers

```sql
SELECT
    trigger_name,
    event_object_table,
    action_timing,
    event_manipulation
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND trigger_name LIKE 'trigger_update_%';
```

---

## 📊 What Each Table Is For

### `terminal_appointments`
**Purpose:** Track terminal gate appointments

**Key Fields:**
- `order_id` - Links to order
- `window_start_time` / `window_end_time` - Appointment window
- `confirmation_number` - Terminal confirmation
- `status` - REQUESTED, CONFIRMED, COMPLETED, etc.

**Use Cases:**
- Book terminal appointments
- Track on-time arrivals
- Reschedule appointments
- Monitor appointment compliance

---

### `terminal_gate_hours`
**Purpose:** Store terminal operating hours

**Key Fields:**
- `terminal_id` - Which terminal
- `day_of_week` - 0-6 (Sunday-Saturday)
- `open_time` / `close_time` - Operating hours
- `is_closed` - Closed that day?
- `special_date` - For holidays

**Use Cases:**
- Validate appointment times
- Prevent booking when closed
- Holiday scheduling

---

### `exceptions`
**Purpose:** Track operational issues and delays

**Key Fields:**
- `trip_id` - Associated trip
- `type` - FAILED_PICKUP, CUSTOMS_HOLD, etc.
- `severity` - LOW, MEDIUM, HIGH, CRITICAL
- `status` - OPEN, ACKNOWLEDGED, RESOLVED
- `estimated_delay_mins` / `actual_delay_mins`
- `financial_impact` - Cost impact

**Use Cases:**
- Exception reporting
- Issue tracking
- Delay analysis
- Performance metrics
- Financial impact tracking

---

### `exception_comments`
**Purpose:** Discussion thread on exceptions

**Key Fields:**
- `exception_id` - Parent exception
- `author_name` - Who commented
- `comment` - The comment text
- `is_internal` - Internal note vs customer-visible

**Use Cases:**
- Team collaboration
- Status updates
- Resolution notes

---

### `exception_history`
**Purpose:** Audit trail of exception status changes

**Key Fields:**
- `exception_id` - Parent exception
- `from_status` / `to_status` - Status change
- `changed_by` - Who changed it
- `notes` - Why it changed

**Use Cases:**
- Audit trail
- Compliance tracking
- Performance analysis

---

## 🔧 Rollback (If Needed)

If you need to rollback this migration:

```sql
-- WARNING: This will delete all data in these tables!

-- Drop views
DROP VIEW IF EXISTS v_active_orders;
DROP VIEW IF EXISTS v_active_trips;
DROP VIEW IF EXISTS v_open_exceptions;
DROP VIEW IF EXISTS v_upcoming_appointments;

-- Drop tables
DROP TABLE IF EXISTS exception_history;
DROP TABLE IF EXISTS exception_comments;
DROP TABLE IF EXISTS exceptions;
DROP TABLE IF EXISTS terminal_gate_hours;
DROP TABLE IF EXISTS terminal_appointments;

-- Drop enum types
DROP TYPE IF EXISTS exception_status;
DROP TYPE IF EXISTS exception_severity;
DROP TYPE IF EXISTS exception_type;
DROP TYPE IF EXISTS appointment_status;
DROP TYPE IF EXISTS appointment_type;

-- Remove added columns from existing tables
ALTER TABLE orders DROP COLUMN IF EXISTS move_type;
ALTER TABLE orders DROP COLUMN IF EXISTS customer_reference;
ALTER TABLE orders DROP COLUMN IF EXISTS deleted_at;

ALTER TABLE trips DROP COLUMN IF EXISTS revenue;
ALTER TABLE trips DROP COLUMN IF EXISTS cost;
ALTER TABLE trips DROP COLUMN IF EXISTS deleted_at;

ALTER TABLE trip_stops DROP COLUMN IF EXISTS deleted_at;
```

---

## 📝 Sample Data (Optional)

To insert sample terminal gate hours:

```sql
-- Replace 'your-terminal-id' with an actual terminal UUID from your database
INSERT INTO terminal_gate_hours (terminal_id, day_of_week, open_time, close_time, is_closed)
VALUES
    ('your-terminal-id', 1, '06:00:00', '18:00:00', false), -- Monday
    ('your-terminal-id', 2, '06:00:00', '18:00:00', false), -- Tuesday
    ('your-terminal-id', 3, '06:00:00', '18:00:00', false), -- Wednesday
    ('your-terminal-id', 4, '06:00:00', '18:00:00', false), -- Thursday
    ('your-terminal-id', 5, '06:00:00', '18:00:00', false), -- Friday
    ('your-terminal-id', 6, '00:00:00', '00:00:00', true),  -- Saturday (closed)
    ('your-terminal-id', 0, '00:00:00', '00:00:00', true);  -- Sunday (closed)
```

---

## 🆘 Troubleshooting

### Error: "relation already exists"
**Cause:** Table already created (running migration twice)
**Solution:** Migration is idempotent - it's safe. The `IF NOT EXISTS` clauses prevent errors.

### Error: "type already exists"
**Cause:** Enum type already created
**Solution:** Migration handles this - enum creation is wrapped in exception handler.

### Error: "permission denied"
**Cause:** Database user lacks permissions
**Solution:** Run as superuser or grant permissions:
```sql
GRANT CREATE ON SCHEMA public TO your_username;
```

### Error: "column already exists"
**Cause:** Column was added in previous attempt
**Solution:** Migration checks for existence before adding columns.

### Error: "foreign key constraint violation"
**Cause:** Referenced tables don't exist
**Solution:** Ensure `orders`, `trips`, `trip_stops` tables exist first.

---

## 📞 Support

If you encounter issues:

1. Check the **PostgreSQL logs** for detailed errors
2. Verify **database version** (requires PostgreSQL 12+)
3. Check **user permissions**
4. Review the **pre-migration checklist** above

---

## 📈 Migration Impact

### Storage Impact
- Estimated additional storage: ~10-50 MB initially
- Scales with usage (exceptions, appointments)

### Performance Impact
- 50+ new indexes improve query performance
- Minimal impact on writes
- Views pre-aggregate common queries

### Application Impact
- **Breaking Changes:** None - only additions
- **Required Code Changes:** None - tables are optional
- **Recommended:** Update services to use new features

---

## ✅ Success Criteria

Migration is successful when:

1. ✅ All 5 new tables created
2. ✅ All indexes created (50+)
3. ✅ All views created (4)
4. ✅ All enum types created (5)
5. ✅ All triggers created (3)
6. ✅ Verification queries return expected results
7. ✅ No errors in PostgreSQL logs

---

**Migration Version:** 001
**Author:** Claude Sonnet 4.5
**Date:** 2026-01-30
**Status:** Ready for Production
