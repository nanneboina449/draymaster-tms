-- ==============================================================================
-- Quick Fix: Remove overly restrictive unique constraint on orders
-- ==============================================================================
-- The previous migration created a constraint that only allows ONE order per container.
-- This breaks the workflow since containers need multiple orders:
--   - Import: IMPORT_DELIVERY + EMPTY_RETURN
--   - Export: EMPTY_PICKUP + EXPORT_PICKUP
-- ==============================================================================

-- Step 1: Drop the restrictive index that blocks multiple orders per container
DROP INDEX IF EXISTS idx_orders_container_active;

-- Step 2: Create the correct index that allows multiple orders with different move types
-- This prevents duplicates of the SAME move type, but allows different move types
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_container_move_type_active
    ON orders(container_id, move_type_v2)
    WHERE deleted_at IS NULL AND status NOT IN ('CANCELLED', 'COMPLETED');
