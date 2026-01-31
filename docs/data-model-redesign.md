# DrayMaster TMS - Data Model Redesign

## Problem Statement

The current data model has overlapping concepts between "Shipment" and "Load" that cause confusion:
- Both store container information
- Both track delivery details
- The relationship between them is unclear
- "Order" entity is underutilized

## Proposed Solution: Unified Hierarchy

### Entity Hierarchy

```
SHIPMENT (Booking/Customer Request)
    └── CONTAINER (Physical Unit, 1 or many per shipment)
            └── ORDER (Work Order, 1 or many per container)
                    └── TRIP (Driver Assignment)
```

### Detailed Entity Definitions

#### 1. SHIPMENT (Booking Level)

The customer's shipping request. One shipment = one booking/BL that may contain multiple containers.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| reference_number | VARCHAR | Auto-generated (IMP-2024-0001) |
| type | ENUM | IMPORT, EXPORT |
| status | ENUM | PENDING, CONFIRMED, IN_PROGRESS, COMPLETED, CANCELLED |
| customer_id | FK | Reference to customers table |
| steamship_line | VARCHAR | SSL name (MSC, COSCO, etc.) |
| booking_number | VARCHAR | SSL booking reference |
| bill_of_lading | VARCHAR | Master or House BL |
| vessel | VARCHAR | Vessel name |
| voyage | VARCHAR | Voyage number |
| terminal_id | FK | Reference to terminals table |
| port_cutoff | TIMESTAMP | Export: cargo cutoff time |
| last_free_day | DATE | Import: last free day at terminal |
| earliest_return_date | DATE | Export: earliest empty return |
| special_instructions | TEXT | Notes for all containers |

**Status Flow:**
```
PENDING → CONFIRMED → IN_PROGRESS → COMPLETED
                   ↘ CANCELLED
```

#### 2. CONTAINER (Physical Container)

Each container in a shipment. Tracks the physical unit and its current state.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| shipment_id | FK | Parent shipment |
| container_number | VARCHAR | ISO container number (MSCU1234567) |
| size | ENUM | 20, 40, 40HC, 45 |
| type | ENUM | DRY, REEFER, FLAT, OPEN_TOP, TANK |
| weight_lbs | INTEGER | Cargo weight |
| seal_number | VARCHAR | Security seal |
| is_hazmat | BOOLEAN | Hazardous material flag |
| hazmat_class | VARCHAR | UN hazmat class if applicable |
| hazmat_un | VARCHAR | UN number if applicable |
| is_overweight | BOOLEAN | Over legal weight limit |
| is_reefer | BOOLEAN | Temperature controlled |
| reefer_temp | INTEGER | Required temp (°F) |
| customs_status | ENUM | PENDING, HOLD, RELEASED |
| customs_hold_reason | VARCHAR | If on hold, why |
| terminal_available_date | DATE | When available at terminal |
| status | ENUM | Container-specific status |

**Container Status Flow:**
```
BOOKED → AVAILABLE → PICKED_UP → IN_TRANSIT → DELIVERED → EMPTY_RETURNED
                              ↘ DROPPED (at customer) → PICKED_UP_EMPTY → EMPTY_RETURNED
```

#### 3. ORDER (Work Order)

A specific movement task for a container. One container may have multiple orders (e.g., deliver + return empty).

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| order_number | VARCHAR | Auto-generated (ORD-2024-0001) |
| shipment_id | FK | Parent shipment |
| container_id | FK | Parent container |
| order_type | ENUM | Type of movement |
| trip_type | ENUM | How the move is executed |
| pickup_location_id | FK | Where to pick up |
| pickup_address | TEXT | Pickup address (if no location_id) |
| pickup_appointment | TIMESTAMP | Appointment time |
| delivery_location_id | FK | Where to deliver |
| delivery_address | TEXT | Delivery address (if no location_id) |
| delivery_appointment | TIMESTAMP | Appointment time |
| status | ENUM | Order status |
| sequence | INTEGER | Order of execution (1, 2, 3...) |
| notes | TEXT | Order-specific instructions |
| rate | DECIMAL | Billing rate |
| billing_status | ENUM | UNBILLED, INVOICED, PAID |

**Order Types:**
| Type | Description | Example |
|------|-------------|---------|
| IMPORT_DELIVERY | Terminal → Customer | Pick up import, deliver to warehouse |
| EXPORT_PICKUP | Customer → Terminal | Pick up export, deliver to port |
| EMPTY_RETURN | Customer → Terminal | Return empty container |
| EMPTY_PICKUP | Terminal → Customer | Pick up empty for loading |
| REPO | Location → Location | Reposition container |

**Trip Types (How the delivery is executed):**
| Type | Description |
|------|-------------|
| LIVE_UNLOAD | Driver waits while container is unloaded |
| LIVE_LOAD | Driver waits while container is loaded |
| DROP | Drop container, pick up later |
| DROP_AND_HOOK | Drop full, pick up empty (or vice versa) |
| STREET_TURN | Use import container for export (no return to terminal) |

**Order Status Flow:**
```
PENDING → READY → DISPATCHED → IN_PROGRESS → COMPLETED
       ↘ HOLD → READY
                            ↘ FAILED → PENDING (retry)
```

#### 4. TRIP (Driver Assignment)

The actual execution - who is doing the work.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| trip_number | VARCHAR | Auto-generated (TRP-2024-0001) |
| driver_id | FK | Assigned driver |
| tractor_id | FK | Assigned truck |
| chassis_id | FK | Assigned chassis (if company-owned) |
| chassis_number | VARCHAR | Chassis number (if pool) |
| chassis_pool | VARCHAR | DCLI, TRAC, FLEXI, etc. |
| planned_start | TIMESTAMP | When driver should start |
| actual_start | TIMESTAMP | When driver actually started |
| planned_end | TIMESTAMP | Expected completion |
| actual_end | TIMESTAMP | Actual completion |
| status | ENUM | Trip status |
| driver_pay | DECIMAL | Driver compensation |
| notes | TEXT | Trip notes |

**Relationship to Orders:**
- A trip can execute ONE or MORE orders
- Join table: `trip_orders` (trip_id, order_id, sequence)
- Example: One trip picks up Container A and Container B at the same terminal

---

## Example Scenarios

### Scenario 1: Single Container Import (Live Unload)

**Customer Request:** "Pick up 1 container from APM Terminal, deliver to ABC Warehouse"

```
SHIPMENT: IMP-2024-0001
├── Customer: ABC Company
├── Type: IMPORT
├── Booking: MSC123456
├── Terminal: APM Los Angeles
├── Last Free Day: 2024-02-15
│
└── CONTAINER: MSCU1234567
        ├── Size: 40HC
        ├── Weight: 42,000 lbs
        ├── Customs: RELEASED
        │
        └── ORDER #1: Import Delivery
                ├── Type: IMPORT_DELIVERY
                ├── Trip Type: LIVE_UNLOAD
                ├── From: APM Terminal
                ├── To: ABC Warehouse
                ├── Appointment: 2024-02-14 10:00 AM
                │
                └── TRIP: TRP-2024-0001
                        ├── Driver: John Smith
                        ├── Truck: T-101
                        └── Status: COMPLETED
```

### Scenario 2: Single Container Import (Drop & Pick)

**Customer Request:** "Drop container at warehouse, pick up empty later"

```
SHIPMENT: IMP-2024-0002
└── CONTAINER: OOLU9999999
        │
        ├── ORDER #1: Import Delivery (DROP)
        │       ├── Type: IMPORT_DELIVERY
        │       ├── Trip Type: DROP
        │       ├── From: Everport Terminal
        │       ├── To: XYZ Distribution
        │       └── TRIP: TRP-2024-0002 (Driver drops container)
        │
        └── ORDER #2: Empty Return
                ├── Type: EMPTY_RETURN
                ├── Trip Type: DROP_AND_HOOK (pick up empty, drop at terminal)
                ├── From: XYZ Distribution
                ├── To: Everport Terminal
                └── TRIP: TRP-2024-0005 (Different day, maybe different driver)
```

### Scenario 3: Multi-Container Import

**Customer Request:** "3 containers from same vessel, 2 go to Warehouse A, 1 goes to Warehouse B"

```
SHIPMENT: IMP-2024-0003
├── Customer: Multi-Location Corp
├── Booking: COSCO789
│
├── CONTAINER: CSLU1111111
│       └── ORDER #1 → Warehouse A → TRIP: TRP-2024-0010
│
├── CONTAINER: CSLU2222222
│       └── ORDER #1 → Warehouse A → TRIP: TRP-2024-0010 (same trip!)
│
└── CONTAINER: CSLU3333333
        └── ORDER #1 → Warehouse B → TRIP: TRP-2024-0011 (different trip)
```

### Scenario 4: Export with Street Turn

**Situation:** Import container can be reused for export (no empty return needed)

```
IMPORT SHIPMENT: IMP-2024-0004
└── CONTAINER: OOLU5555555
        └── ORDER #1: Terminal → Customer A (LIVE_UNLOAD)
                └── TRIP: TRP-2024-0020

EXPORT SHIPMENT: EXP-2024-0001
└── CONTAINER: OOLU5555555 (same container!)
        │
        ├── ORDER #1: Empty Pickup from Customer A
        │       ├── Type: EMPTY_PICKUP
        │       ├── Trip Type: STREET_TURN
        │       ├── From: Customer A (where import was delivered)
        │       ├── To: Customer B (export shipper)
        │       └── TRIP: TRP-2024-0021
        │
        └── ORDER #2: Export Delivery
                ├── Type: EXPORT_PICKUP
                ├── From: Customer B
                ├── To: Terminal
                └── TRIP: TRP-2024-0022
```

---

## UI Changes Required

### 1. Rename "Loads" Page to "Shipments" or "Bookings"

The main page shows SHIPMENTS (customer bookings). Each shipment shows its containers and their status.

### 2. Dispatch Board Changes

The dispatch board should show ORDERS (work to be done), not loads:
- Filter by: Ready, Pending Appointment, Dispatched
- Group by: Terminal, Customer, Driver
- Assign orders to trips

### 3. Container Tracking

Add a container-centric view:
- Search by container number
- See all orders for a container
- Track current location/status

### 4. Order Generation

When creating a shipment:
1. For IMPORT + LIVE_UNLOAD → Auto-create 1 order (terminal → customer)
2. For IMPORT + DROP → Auto-create 2 orders (delivery + empty return)
3. For EXPORT → Auto-create 2 orders (empty pickup + export delivery)

User can manually add/modify orders as needed.

---

## Migration Path

1. Keep existing `shipments` table (already has correct structure)
2. Keep existing `containers` table (already correct)
3. Enhance `orders` table to be the primary dispatch unit
4. Deprecate `loads` table (merge functionality into orders)
5. Update UI to work with shipments → containers → orders → trips

---

## Benefits

1. **Clear hierarchy**: Shipment → Container → Order → Trip
2. **No redundant data**: Container info stored once
3. **Flexible**: Handle any number of containers and movements
4. **Industry standard**: Matches how drayage actually works
5. **Better tracking**: Each movement is a separate order with its own status
