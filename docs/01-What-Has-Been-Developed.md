# DrayMaster TMS — What Has Been Developed

## Overview

DrayMaster TMS is a Transportation Management System purpose-built for **intermodal container drayage operations** at US seaports. It covers the full lifecycle of a container from vessel arrival through terminal pickup, last-mile delivery, empty return, and invoicing — with real-time eModal integration for container status and terminal appointment management.

---

## 1. Frontend Application (Next.js 14)

### 1.1 Navigation & Layout

A persistent sidebar navigation with 22 menu items, each with a custom SVG icon. Active route highlighting via `usePathname`. The layout wraps every page in a fixed sidebar + scrollable main content area.

### 1.2 Dashboard (`/`)

The operational home page. Displays:

- **Stats cards** — total active loads, containers on hold, LFD alerts, trips in progress
- **LFD Alert Panel** — containers approaching or past their Last Free Day, color-coded by urgency (red = overdue, orange = 1–2 days, yellow = 3–5 days, green = 6+ days)
- **Available Containers** — containers at terminal ready for pickup
- **Today's Appointments** — terminal gate appointments scheduled for the current day
- **Trips in Progress** — live trip status with driver and tractor info
- **eModal Sync Button** — triggers a background sync of all tracked containers against the eModal API

### 1.3 Loads (`/loads`) — NEW

Load-level CRUD management page. This is the primary place to create and manage loads.

- **Stat bar** — Total / Available / On Hold / Dispatched / Completed counts
- **Filter bar** — filter by status, move type, or free-text search across load number, customer, and container
- **Table columns** — Load #, Customer, Container (with size/type badges and hold indicators like Customs/Freight/USDA/TMF), Move type (with HAZ/OVW/Triaxle tags), Terminal, LFD (urgency-colored), Status, Total Charges, Actions
- **Create/Edit Modal** — full form: customer dropdown, container number/size/type, weight, move type, terminal, LFD date, hazmat/overweight/triaxle checkboxes, and all four hold flags
- Uses `createLoad()` and `updateLoad()` from the data layer; load numbers are auto-generated as `LD-{year}-{timestamp6}`

### 1.4 Shipments (`/shipments`) — REWRITTEN

Container-level operational detail view. Read-focused; editing is done via Loads.

- Fetches loads, container_tracking, trips, and terminal_appointments in parallel, then joins client-side into a unified `ShipmentDetail[]`
- **Expandable card rows** — clicking a row reveals a three-column detail panel:
  1. **Container Status** — eModal status, availability, yard location, last checked timestamp
  2. **Appointment** — date, time slot, status
  3. **Dispatch Activity** — linked trip number, status badge, assigned driver, tractor
- Stats bar shows: Total loads, eModal Synced count, On Hold count, Loads with active trips
- "Manage Loads →" link navigates back to `/loads` for any edits

### 1.5 Dispatch (`/dispatch`)

Kanban-style dispatch board. Loads are displayed as cards grouped by status column. Supports driver and tractor assignment, trip creation, and real-time status progression.

### 1.6 Trips (`/trips`)

Trip management with multi-leg support. Create trips, assign drivers and equipment, define pickup/delivery stops, and track trip progression through its lifecycle (DRAFT → PLANNED → DISPATCHED → EN_ROUTE → COMPLETED).

### 1.7 Live Tracking (`/tracking`)

Trip-level GPS and milestone tracking. Shows each active trip's current location, stop-by-stop progress, and driver updates. This is distinct from eModal — Tracking shows where your trucks are; eModal shows where your containers are at the terminal.

### 1.8 eModal (`/emodal`)

Terminal integration dashboard:

- Container status lookup (real-time from eModal API)
- Terminal availability and dwell statistics
- Appointment booking and cancellation via ProPass API
- Container watchlist management
- Gate fee tracking
- **Settings panel** — configure eModal API key (stored in `emodal_config` table), toggle sync on/off

### 1.9 Drivers (`/drivers`)

Driver roster with profile management, CDL/TWIC/Hazmat endorsement tracking, compliance alerts, and document uploads.

### 1.10 Equipment (`/equipment`)

Tractor and trailer fleet management. Includes unit details, maintenance records, fuel transactions, and equipment inspections with defect tracking.

### 1.11 Chassis (`/chassis`) — UPDATED

Three-tab chassis management:

- **Chassis Usage** — table of all chassis pickups/returns with status filter. Actions: Edit, Return (records return date/location), Street Turn (closes current usage and opens a new one for the next container)
- **Pool Rates** — displays active chassis pools (DCLI, TRAC, Flexi-Van) with their free-day and daily-rate configurations
- **Invoice Audit** — CSV upload reconciliation tool. Upload a pool invoice CSV; the system auto-detects chassis number and amount columns, matches each line against usage records, and presents a reconciliation report:
  - Summary: total lines, matched, unmatched, total variance
  - Matched table with per-row variance coloring (green = exact, orange = mismatch, red = overcharged)
  - Unmatched table highlighting invoice lines with no corresponding usage record

### 1.12 Customers (`/customers`)

Customer master data with billing settings, rate agreements, and communication preferences.

### 1.13 Invoices (`/invoices`)

Invoice lifecycle management — draft, send, track payment. Invoices can be generated directly from a completed load's charges.

### 1.14 Billing (`/billing`)

Billing dashboard covering outstanding invoices, recent payments, and billing status overview.

### 1.15 Settlements (`/settlements`)

Driver settlement calculation. Computes gross earnings, applies deductions (fuel, advances, insurance, lease), and produces net-pay settlements.

### 1.16 Rates (`/rates`) — UPDATED

Three-tab rate management:

- **Pay Profiles** — CRUD for driver pay structures (per-load, per-mile, percentage, hourly). Includes waiting/detention pay, stop pay, accessorial pay (hazmat, overweight, live unload, weekend), and weekly deductions for owner-operators
- **Lane Rates** — route-specific pricing by origin/destination type (port, rail, ZIP, city, zone)
- **Driver Assignments** — table of all active drivers with a per-row dropdown to assign a rate profile. Changes are saved immediately via upsert. Shows the effective pay rate beneath each assignment

### 1.17 Street Turns (`/street-turns`) — UPDATED

Import/export container matching to avoid empty returns.

- Fetches pending imports with released customs and pending exports, matches by container size and terminal
- Each match card shows the import and export details side by side, with a savings estimate ($200 same-terminal, $150 cross-terminal)
- **Create Street Turn** button with inline Yes/No confirmation. On confirm: looks up both shipment IDs, inserts a `street_turns` record with POTENTIAL status, removes the match from the list
- **Created This Session** section at the bottom shows all street turns created during the current session

### 1.18 Reports (`/reports`) — REWRITTEN

Analytics and CSV export with date filtering.

- **Date range filter bar** — start/end date pickers plus quick-select buttons (7d, 30d, 90d, This Month). All queries filter by `created_at` within the selected range
- **Revenue summary cards** — Total Revenue, Paid Invoices, Outstanding, Avg Rate/Order
- **Shipment Overview** — total/imports/exports with status breakdown bar chart
- **Trip Performance** — total trips, completed, active drivers, completion rate
- **Quick Export** — four CSV export buttons (Shipment, Revenue, Trip, Driver reports), each showing the live record count. Exports download immediately as `.csv` files via browser

### 1.19 Documents (`/documents`)

BOL, POD, and other document upload and retrieval.

### 1.20 Notifications (`/notifications`)

Notification center showing dispatch alerts, LFD warnings, and system messages. Supports read/unread tracking.

### 1.21 Quotes (`/quotes`)

Quote generation with rate templates.

### 1.22 Customer Portal (`/portal`)

Read-only view for customers to track their shipments and view invoices.

### 1.23 Settings (`/settings`) — REWRITTEN

Persisted system settings with Supabase backend.

- **Company Information** — name, address, phone, email, MC/DOT numbers. Loaded from `company_settings` table on mount; saved via upsert
- **Notifications** — toggle switches for email alerts, SMS, dispatch/delivery notifications, LFD reminders. Persisted alongside company settings
- **Integrations** — placeholder cards for Google Maps, SendGrid, and Twilio
- **Save button** — shows inline success (green) or error (red) feedback; auto-dismisses after 3–5 seconds. Button disables during save with "Saving..." text

---

## 2. Backend API Routes

### 2.1 `/api/emodal`

Proxies requests to the eModal EDS and ProPass APIs. Actions: `terminals`, `availability`, `dwell`, `container`, `slots`, `sync`, `book`, `cancel`, `watchlist-add`. Reads the API key from the `emodal_config` database table (filtered by `is_active`). Attaches the key as an `apikey` header on all outbound requests.

### 2.2 `/api/emodal-sync`

Batch container sync. POST triggers a sync cycle: fetches up to 50 containers from `container_tracking` (ordered by oldest `last_checked_at`), calls eModal for each, updates statuses in the database, and triggers LFD warning emails when thresholds are crossed.

### 2.3 `/api/email`

Email dispatch via SendGrid. Actions: `send` (generic), `send-invoice` (invoice PDF attachment), `send-lfd-warning` (templated LFD alert), `test`. Includes email logging.

### 2.4 `/api/notify`

Internal notification dispatch endpoint.

---

## 3. Database (PostgreSQL via Supabase)

### 3.1 Schema Summary

43+ tables organized into 8 logical domains:

| Domain | Tables |
|---|---|
| Reference Data | customers, steamship_lines, ports, locations, chassis_pools |
| Order Service | shipments, containers, orders |
| Driver Service | drivers, hos_logs, hos_violations, compliance_alerts, driver_documents |
| Equipment Service | tractors, chassis, trailers, chassis_usage, maintenance_records, fuel_transactions, equipment_inspections, inspection_defects |
| Dispatch Service | trips, trip_stops, trip_orders, stop_documents |
| Appointments & Exceptions | terminal_appointments, terminal_gate_hours, exceptions, exception_comments, exception_history |
| eModal Integration | published_containers, gate_fees |
| Billing Service | invoices, invoice_line_items, payments, rates, accessorial_rates, driver_settlements, settlement_line_items, driver_pay_rates |
| Tracking Service | location_records, milestones, geofences |

### 3.2 Views

6 pre-built views for common read patterns: `v_active_orders`, `v_active_trips`, `v_open_exceptions`, `v_upcoming_appointments`, `v_dispatch_board`, `v_street_turn_candidates`.

### 3.3 Seed Data

Pre-populated with 10 steamship lines, 10 US ports, 8 LA/LB terminals, 2 company yards, 5 warehouses, 8 customers, 3 chassis pools, 5 drivers, 5 tractors, 5 chassis, terminal gate hours, sample shipments/containers/orders, and default accessorial rates.

---

## 4. Data Layer (`supabase.ts`)

882 lines of typed functions covering all CRUD operations. Organized into two sections:

- **v1.0 functions** — standard CRUD for customers, drivers, tractors, chassis, orders, trips, shipments, invoices, settlements
- **v2.0 functions** — load-centric operations: dispatch board queries (with view fallback), load CRUD, charge management with auto-recalculation, activity logging, street turn lifecycle, yard management, notifications, and invoice generation from loads

---

## 5. eModal Integration Service (Go)

A dedicated Go microservice under `services/emodal-integration/` with:

- **eModal API client** — calls EDS and ProPass endpoints
- **Service Bus consumer** — listens for real-time container status events from Azure Service Bus
- **Container publisher** — publishes containers for status tracking
- **gRPC server** — exposes container status and fee data to other internal services
- **Repository layer** — reads/writes `published_containers` and `gate_fees` tables

---

## 6. Bugs Fixed During This Session

| Bug | Location | Fix |
|---|---|---|
| URL typo (`propassagapi` → `propassapi`) | `api/emodal/route.ts` | Every ProPass API call was hitting a non-existent domain |
| Credential field mismatch (`api_key_encrypted` → `api_key`) | Both eModal API routes | Settings saves to `api_key` but routes were reading a non-existent column |
| Mock fallback masking real errors | `api/emodal/route.ts` container action | Inner try/catch returned fake `{status:'UNKNOWN'}` data, hiding auth failures |
| Settings not persisted | `settings/page.tsx` | `alert()` replaced with actual Supabase upsert |
| Reports no date filtering | `reports/page.tsx` | All queries now filter by `created_at` within selected date range |
| Reports export buttons non-functional | `reports/page.tsx` | Wired 4 CSV export functions with proper Blob download |
| Street Turn button wired but no-op | `street-turns/page.tsx` | Full create flow with confirmation, DB insert, and session tracking |
| Rates Driver Assignments placeholder | `rates/page.tsx` | Replaced with live driver table + profile assignment dropdowns |
| Chassis Invoice Audit placeholder | `chassis/page.tsx` | Full CSV upload, parse, match, and reconciliation report |
