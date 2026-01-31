# DrayMaster TMS — Technical Design & Architecture

---

## 1. System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser / Client                          │
│   Next.js 14 App Router  ·  React 18  ·  Tailwind CSS           │
│   Zustand  ·  React Query  ·  Apollo Client                     │
└────────────┬───────────────────────────────┬────────────────────┘
             │  HTTPS                         │  HTTPS
             ▼                                ▼
┌────────────────────────┐   ┌────────────────────────────────────┐
│   Next.js API Routes   │   │   Next.js Pages (SSR / Client)     │
│  /api/emodal           │   │  22 pages under /app/              │
│  /api/emodal-sync      │   │  Supabase JS client (direct DB)    │
│  /api/email            │   │                                    │
│  /api/notify           │   │                                    │
└────────┬───────────────┘   └────────────┬───────────────────────┘
         │                                 │
         │ server-side fetch               │ Supabase JS SDK
         ▼                                 ▼
┌──────────────────┐     ┌───────────────────────────────────────┐
│  eModal APIs     │     │           Supabase / PostgreSQL        │
│  EDS endpoint    │     │  43+ tables  ·  6 views                │
│  ProPass endpoint│     │  60+ indexes  ·  triggers              │
└──────────────────┘     │  Row-level security (optional)         │
                         └───────────────────────────────────────┘
                                          ▲
                         ┌────────────────┘
                         │  gRPC
┌────────────────────────┴──────────────────────────┐
│              Go Microservices                      │
│  order-service      dispatch-service               │
│  driver-service     equipment-service              │
│  billing-service    tracking-service               │
│  emodal-integration (+ Azure Service Bus consumer) │
└───────────────────────────────────────────────────┘
```

### Key Architectural Decisions

1. **Frontend-first data access** — Pages call Supabase directly via the JS SDK rather than routing through Go microservices. This keeps the frontend fast and simple; the Go services exist for heavy batch processing, event-driven logic, and inter-service communication via gRPC.

2. **API routes as a proxy layer** — The 4 Next.js API routes (`/api/emodal`, `/api/emodal-sync`, `/api/email`, `/api/notify`) act as server-side proxies. They keep secrets (API keys, SendGrid keys) out of the browser and add a server-side fetch layer for external third-party APIs.

3. **Client-side joins** — Pages like Shipments fetch multiple tables in parallel via `Promise.all` and merge the results in JavaScript. This avoids complex SQL joins and keeps queries simple, at the cost of slightly more network round-trips.

4. **Single idempotent migration** — `002_complete_schema.sql` is the source of truth. It uses `IF NOT EXISTS` / `DO $$` guards everywhere, making it safe to re-run against any database state. Per-service migrations exist but are superseded by this file.

---

## 2. Frontend Technology Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | Next.js (App Router) | 14.0.4 |
| Language | TypeScript | 5.3.3 |
| UI Library | React | 18.2.0 |
| Styling | Tailwind CSS | 3.4.0 |
| Database Client | @supabase/supabase-js | 2.89.0 |
| State (server) | TanStack React Query | 5.13.4 |
| State (client) | Zustand | 4.4.7 |
| Forms | React Hook Form | 7.49.2 |
| Validation | Zod | 3.22.4 |
| GraphQL | Apollo Client | 3.8.8 |
| Tables | TanStack React Table | 8.10.7 |
| Charts | Recharts | 2.10.3 |
| Maps | Leaflet | 1.9.4 |
| Animation | Framer Motion | 10.16.16 |
| Email | SendGrid | via API |

### File Structure

```
web/src/
├── app/
│   ├── layout.tsx              Root layout + providers
│   ├── providers.tsx           QueryClient, Apollo setup
│   ├── page.tsx                Dashboard
│   ├── loads/page.tsx          Load management
│   ├── shipments/page.tsx      Container detail view
│   ├── dispatch/page.tsx       Dispatch board
│   ├── trips/page.tsx          Trip management
│   ├── tracking/page.tsx       GPS tracking
│   ├── emodal/page.tsx         eModal integration
│   ├── drivers/page.tsx        Driver roster
│   ├── equipment/page.tsx      Fleet management
│   ├── chassis/page.tsx        Chassis + audit
│   ├── customers/page.tsx      Customer master
│   ├── invoices/page.tsx       Invoice lifecycle
│   ├── billing/page.tsx        Billing dashboard
│   ├── settlements/page.tsx    Driver settlements
│   ├── rates/page.tsx          Rate + assignment mgmt
│   ├── street-turns/page.tsx   Street turn matching
│   ├── reports/page.tsx        Analytics + export
│   ├── documents/page.tsx      Document storage
│   ├── notifications/page.tsx  Notification center
│   ├── quotes/page.tsx         Quote generation
│   ├── portal/page.tsx         Customer portal
│   ├── settings/page.tsx       System settings
│   └── api/
│       ├── emodal/route.ts     eModal proxy
│       ├── emodal-sync/route.ts Batch sync
│       ├── email/route.ts      Email dispatch
│       └── notify/route.ts     Notification dispatch
├── components/
│   ├── layout/                 Sidebar, Header
│   ├── dashboard/              Dashboard sub-components
│   ├── dispatch/               Dispatch board, modals
│   ├── shipments/              Shipment modals
│   ├── customers/              Rate setup
│   ├── street-turns/           Street turn UI
│   └── notifications/          Notification center
└── lib/
    ├── supabase.ts             All DB types + functions (882 lines)
    ├── types.ts                Extended type definitions (817 lines)
    ├── emodal.ts               eModal client library (337 lines)
    ├── apollo.ts               GraphQL client
    └── sendgrid.ts             Email helper
```

---

## 3. Database Schema

### 3.1 Entity Relationship Overview

```
customers ─────┬──── shipments ──── containers ──── orders
               │         │                              │
               │         │ (1:N)                        │ (1:1)
               │         ▼                              ▼
               │     published_containers           trip_stops
               │                                       │
               │                                  trips ◄──┘
               │                                    │  │
               └──── invoices ◄─────────────────────┘  │
                        │                               │
                        ▼                               ▼
                 invoice_line_items              trip_orders
                        │                         stop_documents
                 payments                         exceptions
                                                    │
drivers ─── hos_logs                         exception_comments
  │     ─── hos_violations                  exception_history
  │     ─── compliance_alerts
  │     ─── driver_documents            terminal_appointments
  │                                      terminal_gate_hours
tractors ─── maintenance_records
chassis ──── chassis_usage               location_records
trailers     fuel_transactions           milestones
             equipment_inspections       geofences
             inspection_defects

driver_settlements ─── settlement_line_items
driver_pay_rates
rates
accessorial_rates
gate_fees
```

### 3.2 Key Tables — Detailed Columns

#### `shipments`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| type | shipment_type | IMPORT \| EXPORT |
| reference_number | VARCHAR(100) | Booking/BL reference |
| customer_id | UUID FK→customers | |
| steamship_line_id | UUID FK→steamship_lines | |
| port_id | UUID FK→ports | |
| terminal_id | UUID FK→locations | |
| vessel_name | VARCHAR(255) | |
| voyage_number | VARCHAR(50) | |
| vessel_eta / vessel_ata | TIMESTAMPTZ | Estimated/Actual arrival |
| last_free_day | DATE | Critical for demurrage avoidance |
| port_cutoff / doc_cutoff | TIMESTAMPTZ | Export deadlines |
| status | shipment_status | PENDING→IN_PROGRESS→COMPLETED |

#### `containers`
| Column | Type | Notes |
|---|---|---|
| shipment_id | UUID FK→shipments | CASCADE on delete |
| container_number | VARCHAR(15) | ISO standard (e.g., MSCU1234567) |
| size | container_size | 20 \| 40 \| 45 |
| type | container_type | DRY, HIGH_CUBE, REEFER, TANK, etc. |
| weight_lbs | INTEGER | |
| is_hazmat / is_overweight / is_reefer | BOOLEAN | Surcharge triggers |
| customs_status | customs_status | PENDING \| HOLD \| RELEASED |
| current_state | container_state | LOADED \| EMPTY |
| current_location_type | location_type | VESSEL, TERMINAL, IN_TRANSIT, etc. |

#### `orders`
| Column | Type | Notes |
|---|---|---|
| container_id | UUID FK→containers | One order per container |
| shipment_id | UUID FK→shipments | |
| type | order_type | IMPORT, EXPORT, REPO, EMPTY_RETURN |
| move_type | VARCHAR(50) | LIVE_LOAD, DROP_HOOK, PREPULL, etc. |
| pickup_location_id | UUID FK→locations | |
| delivery_location_id | UUID FK→locations | |
| return_location_id | UUID FK→locations | |
| status | order_status | 9-state lifecycle |
| billing_status | billing_status | UNBILLED→BILLED→PAID |
| deleted_at | TIMESTAMPTZ | Soft delete |

#### `trips`
| Column | Type | Notes |
|---|---|---|
| trip_number | VARCHAR(20) | Auto-generated: TRP-YYYYMMDD-NNNN |
| type | trip_type | 12 types (LIVE_LOAD through TRANSLOAD) |
| status | trip_status | 9-state lifecycle |
| driver_id / tractor_id / chassis_id | UUID FK | Equipment assignment |
| planned_start_time / actual_start_time | TIMESTAMPTZ | |
| revenue / cost | DECIMAL(10,2) | Added in production enhancements |
| is_street_turn / is_dual_transaction | BOOLEAN | Special trip flags |
| linked_trip_id | UUID FK→trips | Self-referential for linked trips |
| deleted_at | TIMESTAMPTZ | Soft delete |

#### `trip_stops`
| Column | Type | Notes |
|---|---|---|
| sequence | INTEGER | UNIQUE with trip_id |
| type | stop_type | PICKUP, DELIVERY, RETURN, YARD |
| activity | activity_type | 13 activity types |
| status | stop_status | 8-state lifecycle |
| location_id | UUID FK→locations | |
| appointment_time / window_mins | | Scheduled window |
| planned/estimated/actual arrival/departure | TIMESTAMPTZ | 6 time columns |
| free_time_mins / detention_mins | INTEGER | Detention tracking |
| chassis_in_id / chassis_out_id | UUID | Chassis swap tracking |
| container_in_id / container_out_id | UUID | Container swap tracking |

#### `drivers`
| Column | Type | Notes |
|---|---|---|
| employee_number | VARCHAR(20) | |
| first_name / last_name | VARCHAR | |
| license_number / license_state / license_class | VARCHAR | CDL info |
| license_expiration | TIMESTAMPTZ | |
| has_twic / twic_expiration | BOOLEAN + TIMESTAMPTZ | Port access |
| has_hazmat_endorsement / hazmat_expiration | | |
| available_drive_mins / duty_mins / cycle_mins | INTEGER | HOS remaining |
| current_latitude / current_longitude | DECIMAL | GPS position |
| device_token | VARCHAR(500) | Push notification token |

#### `published_containers` (eModal)
| Column | Type | Notes |
|---|---|---|
| container_number | VARCHAR(11) PK | ISO container number |
| terminal_code | VARCHAR(20) | eModal terminal identifier |
| current_status | VARCHAR(30) | 11 possible statuses (CHECK constraint) |
| last_status_at | TIMESTAMPTZ | When status last changed |

#### `gate_fees` (eModal)
| Column | Type | Notes |
|---|---|---|
| container_number | VARCHAR(11) | Cross-references published_containers |
| type | VARCHAR(30) | 6 fee types (CHECK constraint) |
| amount | DECIMAL(10,2) | |
| status | VARCHAR(20) | 5 statuses: PENDING→ASSESSED→PAID/WAIVED/DISPUTED |
| emodal_fee_id | VARCHAR(100) | eModal's internal fee reference |

### 3.3 Enum Types (21 total)

```
shipment_type       → IMPORT, EXPORT
shipment_status     → PENDING, IN_PROGRESS, COMPLETED, CANCELLED
container_size      → 20, 40, 45
container_type      → DRY, HIGH_CUBE, REEFER, TANK, FLAT_RACK, OPEN_TOP
container_state     → LOADED, EMPTY
customs_status      → PENDING, HOLD, RELEASED
location_type       → VESSEL, TERMINAL, IN_TRANSIT, CUSTOMER, YARD
order_type          → IMPORT, EXPORT, REPO, EMPTY_RETURN
order_status        → PENDING, READY, DISPATCHED, IN_PROGRESS, DELIVERED,
                       COMPLETED, HOLD, CANCELLED, FAILED
billing_status      → UNBILLED, BILLED, PAID
trip_type           → LIVE_LOAD, LIVE_UNLOAD, DROP_HOOK_SAME, DROP_HOOK_DIFF,
                       DROP_ONLY, STREET_TURN, DUAL_TRANSACTION, BOBTAIL,
                       EMPTY_PICKUP, EMPTY_RETURN, PRE_PULL, TRANSLOAD
trip_status         → DRAFT, PLANNED, ASSIGNED, DISPATCHED, EN_ROUTE,
                       IN_PROGRESS, COMPLETED, CANCELLED, FAILED
stop_type           → PICKUP, DELIVERY, RETURN, YARD
activity_type       → 13 types covering all stop activities
stop_status         → PENDING, EN_ROUTE, ARRIVED, IN_PROGRESS, COMPLETED,
                       FAILED, SKIPPED, CANCELLED
appointment_type    → PICKUP, RETURN, DROP_OFF, DUAL
appointment_status  → REQUESTED, PENDING, CONFIRMED, CANCELLED, COMPLETED,
                       MISSED, RESCHEDULED
exception_type      → 15 types covering all operational exceptions
exception_severity  → LOW, MEDIUM, HIGH, CRITICAL
exception_status    → OPEN, ACKNOWLEDGED, IN_PROGRESS, RESOLVED, CLOSED, CANCELLED
```

### 3.4 Views

| View | Purpose |
|---|---|
| `v_active_orders` | Orders not completed/cancelled, not soft-deleted, with container info |
| `v_active_trips` | In-progress trips with stop completion counts |
| `v_open_exceptions` | Open/acknowledged exceptions with comment counts |
| `v_upcoming_appointments` | Future confirmed/pending appointments |
| `v_dispatch_board` | Trip summary with container arrays for the kanban board |
| `v_street_turn_candidates` | Delivery stops eligible for street turn matching |

### 3.5 Indexes (60+)

Partial indexes are used extensively for performance:
- `WHERE status NOT IN ('COMPLETED','CANCELLED')` — active record lookups
- `WHERE deleted_at IS NULL` — soft-delete filtering
- `WHERE is_active = TRUE` — rate lookups
- `WHERE is_street_turn = TRUE` — street turn queries
- `WHERE current_status IS NOT NULL` — eModal status lookups

### 3.6 Triggers

A single reusable function `update_updated_at_column()` is applied via triggers to 26 tables. The trigger creation loop checks `pg_trigger` to avoid duplicates on re-run.

---

## 4. API Architecture

### 4.1 eModal Proxy (`/api/emodal`)

```
Client → GET /api/emodal?action=container&container=MSCU1234567
              │
              ▼
         Read api_key from emodal_config WHERE is_active = true
              │
              ▼
         fetch(https://apidocs.eds.emodal.com/..., { headers: { apikey } })
              │
              ▼
         Transform response → NextResponse JSON
```

Actions and their upstream URLs:

| Action | Method | Upstream |
|---|---|---|
| terminals | GET | EDS `/terminals` |
| availability | GET | EDS `/terminals/{id}/availability` |
| dwell | GET | EDS `/terminals/{id}/dwell` |
| container | GET | EDS `/containers/{number}/status` |
| slots | GET | ProPass `/appointments/available` |
| sync | POST | EDS (batch container status) |
| book | POST | ProPass `/appointments` |
| cancel | POST | ProPass `/appointments/{id}/cancel` |
| watchlist-add | POST | EDS `/watchlist` |

### 4.2 Sync Route (`/api/emodal-sync`)

```
POST /api/emodal-sync
  1. Read emodal_config (api_key)
  2. SELECT 50 oldest from container_tracking
     (fallback: extract container numbers from active shipments)
  3. For each container:
     a. Call eModal container status API
     b. UPSERT into container_tracking
     c. If LFD crossed threshold → queue email via /api/email
  4. Return sync summary { updated, failed, duration_ms }
```

### 4.3 Email Route (`/api/email`)

All email goes through SendGrid. The route handles 4 actions:

- `send` — generic email with subject/body/recipients
- `send-invoice` — generates invoice HTML, attaches as inline content
- `send-lfd-warning` — templated email with container number, terminal, days remaining, urgency color
- `test` — sends a test email to verify SendGrid configuration

---

## 5. Data Layer (`supabase.ts`)

### 5.1 Patterns

**CRUD functions** follow a consistent pattern:
```typescript
export async function getCustomers(): Promise<Customer[]> {
  const { data, error } = await supabase.from('customers').select('*').order('...');
  if (error) { console.error('Error:', error); return []; }
  return data || [];
}
```

**Joined queries** use Supabase's nested select syntax:
```typescript
// Trips with driver, tractor, and order relations
supabase.from('trips').select('*, driver:drivers(*), tractor:tractors(*), order:orders(*)')
```

**View with fallback** — `getDispatchBoard()` tries `v_dispatch_board` first, falls back to a manual query against the `loads` table if the view doesn't exist.

**Auto-generated IDs:**
- Load numbers: `LD-{year}-{last6digits of timestamp}`
- Order numbers: `ORD-{last8digits of timestamp}`
- Invoice numbers: `INV-{year}-{last6digits of timestamp}`
- Trip numbers (DB): `TRP-YYYYMMDD-NNNN` (via sequence)

### 5.2 Function Categories

| Category | Functions |
|---|---|
| Customers | getCustomers, createCustomer, updateCustomer, deleteCustomer |
| Drivers | getDrivers, createDriver, updateDriver, deleteDriver, getAvailableDrivers |
| Tractors | getTractors, createTractor, updateTractor, deleteTractor |
| Chassis | getAllChassis, createChassis, updateChassis, deleteChassis |
| Orders | getOrders, createOrder, updateOrder, deleteOrder |
| Trips | getTrips, createTrip, createMultiLegTrip, updateTrip |
| Shipments | getShipments, createShipment, updateShipment |
| Invoices | getInvoices, createInvoice, updateInvoice, generateInvoiceFromLoad |
| Settlements | getSettlements, createSettlement |
| Loads | getLoadsByStatus, getLoadDetails, createLoad, updateLoad, updateLoadStatus |
| Load Charges | addLoadCharge, recalculateLoadTotal |
| Load Notes | addLoadNote, logLoadActivity, getLoadActivityLog |
| Dispatch | getDispatchBoard |
| Street Turns | getStreetTurnOpportunities, createStreetTurn, approveStreetTurn |
| Yard | moveToYard, getYardInventory |
| Notifications | createNotification, getUnreadNotifications, markNotificationRead |

---

## 6. Go Microservices

### 6.1 Service Layout

Each service follows the same internal structure:

```
services/{name}/
├── cmd/main.go                 Entry point, server bootstrap
├── go.mod / go.sum             Dependencies
├── internal/
│   ├── domain/models.go        Domain types and business rules
│   ├── service/*.go            Business logic layer
│   ├── repository/*.go         Database access (pgx)
│   ├── grpc/server.go          gRPC server (if exposed)
│   └── client/*.go             External API clients
└── migrations/
    └── 000001_init_schema.up.sql
```

### 6.2 eModal Integration Service (Detailed)

The most complex service. Its responsibilities:

1. **Container Publisher** — When a container needs tracking, it is inserted into `published_containers` and a request is made to the eModal EDS to start monitoring it.

2. **Service Bus Consumer** — Listens on an Azure Service Bus topic for real-time container status events. When an event arrives, it updates `published_containers.current_status` and `last_status_at`.

3. **Fee Aggregation** — Gate fee notifications from eModal are parsed and inserted into the `gate_fees` table with appropriate status tracking.

4. **gRPC Server** — Exposes container status and fee queries to other internal services (billing, dispatch) over gRPC for inter-service communication.

### 6.3 Inter-Service Communication

- **Frontend → DB** — Direct via Supabase JS SDK (most read/write operations)
- **Frontend → External APIs** — Via Next.js API routes (eModal, SendGrid)
- **Service → Service** — Via gRPC (e.g., eModal service → billing service for fee data)
- **Event-Driven** — Azure Service Bus for real-time container status updates

---

## 7. Infrastructure

| Component | Technology |
|---|---|
| Database | PostgreSQL 15 (hosted via Supabase) |
| Cache | Redis 7 |
| Event Streaming | Apache Kafka / Azure Service Bus |
| Search | Elasticsearch |
| Orchestration | Docker + Kubernetes |
| IaC | Terraform |
| CI/CD | GitHub Actions |
| Observability | OpenTelemetry + Grafana |
| CDN/Hosting | Vercel (Next.js) / cloud container registry |

---

## 8. Strengths & Gaps

### Strengths
- **Domain model depth** — The schema accurately models intermodal drayage: 12 trip types, 13 activity types, 15 exception types, container holds, chassis splits, street turns. This is not a generic trucking app; it understands port operations.
- **Idempotent migrations** — `002_complete_schema.sql` can be run repeatedly without breaking anything. Every DDL uses guards; seed data uses `ON CONFLICT DO NOTHING`.
- **60+ indexes with partial indexing** — Performance-conscious. Partial indexes on soft-deletes, active records, and status filters mean common queries hit small index slices.
- **eModal integration is real** — After bug fixes, the app makes genuine API calls to eModal EDS and ProPass. The sync route batches 50 containers at a time.
- **Load-centric v2.0 layer** — The `supabase.ts` v2.0 functions (loads, charges, activity log, street turns, yard) represent a mature operational data model on top of the raw order/shipment schema.

### Known Gaps (TypeScript errors in other files)
The TypeScript compiler reports ~80 errors, all in files **outside** the pages modified in this session. Root causes:
- `types.ts` and `supabase.ts` have divergent type definitions for `Driver`, `Shipment`, `Invoice`, `Trip`, `Load`, `DispatchBoardItem` — the types file has fields the supabase interfaces lack (and vice versa)
- Several components import functions that don't exist in supabase.ts (`deleteInvoice`, `updateDriverStatus`, `updateTripStatus`, `autoCalculateCharges`)
- The `Shipment` type in supabase.ts is minimal (6 fields) but components like `EditShipmentModal` and `ShipmentList` access 15+ fields
- `NotificationCenter.tsx` uses `Set<string>` iteration without `downlevelIteration` enabled

These are pre-existing issues that predate the current work. Resolving them requires either expanding the supabase.ts interfaces to match the DB schema, or aligning types.ts with supabase.ts — a type-consolidation pass.
