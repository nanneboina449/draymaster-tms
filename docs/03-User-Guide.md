# DrayMaster TMS — User Guide

---

## How to Read This Guide

Each section maps to a page in the left sidebar. Sections are ordered to follow the most common daily workflow: a container arrives at port → you track it → you dispatch it → you invoice it. Side workflows (drivers, equipment, chassis, reports) are covered after the core flow.

---

## 1. Dashboard

**Where:** Click "Dashboard" in the sidebar (home icon, first item).

The dashboard is your daily command center. Everything you need at a glance is here.

### What You See

- **Stats row at top** — Total active loads, containers currently on hold, LFD alerts firing right now, and trips currently in progress. These numbers update each time you reload.
- **LFD Alert Panel** — A list of containers approaching or past their Last Free Day. Color coding tells you urgency at a glance:
  - **Red bold "OVERDUE"** — the container has passed its LFD. Demurrage is accruing.
  - **Red "TODAY"** — LFD is today. Pick up or you start paying.
  - **Orange** — 1–2 days remaining.
  - **Yellow** — 3–5 days remaining.
  - **Green** — 6+ days. No urgency.
- **Available Containers** — Containers at terminal that are cleared and ready for pickup.
- **Today's Appointments** — All terminal gate appointments scheduled for today.
- **Trips in Progress** — Active trips with their driver, tractor, and current status.
- **eModal Sync button** — Click this to pull the latest container statuses from eModal. This updates the status of every container you're tracking.

---

## 2. Core Workflow: Import Container Lifecycle

This is the typical flow for an import container from vessel arrival to invoice.

### Step 1 — Container Arrives (Shipment Created)

A new import shipment is created when a booking is received. The shipment records the vessel, port, terminal, steamship line, and Last Free Day. Containers are linked to the shipment.

Go to **Shipments** to see all containers with their current status, appointment info, and dispatch activity.

### Step 2 — Create a Load

Go to **Loads** → click **+ Create Load**.

Fill in:
- **Customer** — select from dropdown
- **Container Number** — the ISO container number (e.g., MSCU1234567)
- **Container Size / Type** — 20/40/45, DRY/HIGH_CUBE/REEFER etc.
- **Move Type** — LIVE (driver waits for unload), DROP (driver drops container), PREPULL (move container to yard first), etc.
- **Terminal** — which terminal the container is at
- **Last Free Day** — when demurrage starts
- **Hold flags** — check Customs / Freight / USDA / TMF if the container has any holds
- **Hazmat / Overweight / Triaxle** — check if applicable (these trigger surcharges)

Click **Create**. A load number is auto-generated (e.g., `LD-2026-483921`). The load starts in **TRACKING** status.

### Step 3 — Monitor Container Status (eModal)

Go to **eModal** and use the container status lookup to check if the container has been discharged, is available, or is on hold.

Click the **Sync** button on the dashboard (or go to eModal settings) to sync all tracked containers. The system updates statuses automatically.

When a container becomes **AVAILABLE**, the load status should be updated to **AVAILABLE**.

### Step 4 — Book a Terminal Appointment

If the terminal requires an appointment:

1. Go to **eModal** → **Appointments**
2. Select the terminal and date
3. Choose an available time slot
4. Book via ProPass

The appointment confirmation links back to your load.

### Step 5 — Dispatch the Load

Go to **Dispatch**. Your load should appear on the kanban board.

1. Select the load
2. Assign a **Driver** — pick from available drivers (the system filters out drivers currently on active trips)
3. Assign a **Tractor**
4. Optionally assign a **Chassis** (or let the driver pick one at the terminal)
5. Click **Dispatch**

The load status moves to **DISPATCHED** and a trip is created.

### Step 6 — Track the Trip

Go to **Live Tracking** to see the trip in progress. The tracking page shows:
- Current GPS position of the tractor
- Stop-by-stop progress (pickup → delivery → return)
- Driver updates

### Step 7 — Invoice the Customer

Once the load is completed, go to **Loads**, find the load, and click **Generate Invoice**. The system:
- Collects all charges on the load (line haul, fuel surcharge, detention, hazmat, etc.)
- Creates an invoice with line items
- Sets the due date (default 30 days)

Go to **Invoices** to review, edit, and send the invoice to the customer.

---

## 3. Loads Page

**Where:** "Loads" in the sidebar.

This is your primary load management screen.

### Filtering

Use the filter bar at the top:
- **Status dropdown** — filter by TRACKING, AVAILABLE, HOLD, DISPATCHED, COMPLETED, etc.
- **Move Type dropdown** — filter by LIVE, DROP, PREPULL, STREET_TURN, RETURN_EMPTY
- **Search box** — searches across load number, customer name, and container number

### Reading the Table

Each row shows:
- **Load #** — the auto-generated load number
- **Customer** — the customer name
- **Container** — container number with size/type badge. Below it, hold badges appear if any holds are active (Customs, Freight, USDA, TMF)
- **Move** — the move type. HAZ, OVW, TRI tags appear if the container is hazmat, overweight, or requires triaxle
- **Terminal** — which terminal the container is at
- **LFD** — Last Free Day, colored by urgency (same color scheme as dashboard)
- **Status** — current load status with color coding
- **Charges** — total charges accumulated on this load
- **Actions** — Edit or Delete buttons

### Creating and Editing

Click **+ Create Load** or the Edit button on any row to open the modal form. All fields are editable. Changes save immediately on Submit.

---

## 4. Shipments Page

**Where:** "Shipments" in the sidebar.

This is a **read-only detail view**. To edit loads, go to the Loads page.

### Reading Shipment Cards

Each card represents a load. Click a card to expand it and see three detail panels:

1. **Container Status** — the latest status from eModal (e.g., DISCHARGED, AVAILABLE, ON_HOLD). Shows yard location if the container is in yard, and when the status was last checked.

2. **Appointment** — if a terminal appointment exists, you'll see the date, time slot, and confirmation status.

3. **Dispatch Activity** — if a trip has been created for this load, you'll see the trip number, status badge, assigned driver name, and tractor unit number.

### Stats Bar

At the top: Total loads, how many are synced with eModal, how many are on hold, and how many have active trips.

---

## 5. Dispatch Page

**Where:** "Dispatch" in the sidebar.

A kanban board view of loads organized by status. Drag-and-drop or use the action buttons to move loads between columns.

Key actions on each card:
- **Assign Driver** — select from available drivers
- **Assign Tractor** — select from available tractors
- **Create Trip** — creates a trip linked to this load
- **View Details** — opens the full load detail panel

---

## 6. Trips Page

**Where:** "Trips" in the sidebar.

Manage all trips. Each trip can have multiple legs (stops).

### Creating a Trip

1. Click **+ New Trip**
2. Select the trip type (LIVE_LOAD, DROP_HOOK, STREET_TURN, etc.)
3. Assign driver, tractor, and optionally chassis
4. Add stops in sequence: each stop has a type (PICKUP, DELIVERY, RETURN), a location, and an appointment time
5. Submit

Trip numbers are auto-generated by the database as `TRP-YYYYMMDD-NNNN`.

### Trip Lifecycle

DRAFT → PLANNED → ASSIGNED → DISPATCHED → EN_ROUTE → IN_PROGRESS → COMPLETED

Each transition updates the trip status and logs the change.

---

## 7. Live Tracking Page

**Where:** "Live Tracking" in the sidebar.

Shows all active trips with real-time GPS positions and milestone tracking. Each trip card shows:
- Current driver location on a map
- Stop progression (which stops are completed, which is current)
- Timestamps for each milestone (departure, arrival, etc.)

This tracks **your trucks**. For tracking **containers at the terminal**, use the eModal page.

---

## 8. eModal Integration

**Where:** "eModal" in the sidebar.

### Container Status Lookup

Enter a container number to see its real-time status from eModal. Statuses include: MANIFESTED, DISCHARGED, IN_YARD, AVAILABLE, ON_HOLD, CUSTOMS_HOLD, GATE_IN, GATE_OUT, RELEASED, LOADED, NOT_MANIFESTED.

### Terminal Dashboard

Select a terminal to see:
- **Availability** — appointment slots for the next several days
- **Dwell Statistics** — average time containers spend at the terminal
- **Appointment Performance** — on-time rate

### Appointments

Book, view, and cancel terminal appointments via the ProPass API. Select a terminal, date, move type, and available time slot. The system returns a confirmation number.

### Watchlist

Add containers to a watchlist for continuous monitoring. Status changes trigger notifications.

### Settings

Configure your eModal API key. The key is stored in the `emodal_config` database table and used by the server-side API routes. Toggle sync on/off.

---

## 9. Drivers Page

**Where:** "Drivers" in the sidebar.

Manage your driver roster.

### Driver Profile

Each driver record includes:
- Personal info (name, phone, email)
- CDL details (number, state, class, expiration)
- Endorsements: TWIC, Hazmat, Tanker, Doubles
- Medical card expiration
- Current GPS position
- HOS (Hours of Service) remaining: drive minutes, duty minutes, cycle minutes

### Compliance Alerts

Drivers with expiring documents or HOS violations show compliance alerts with severity levels and days until expiration.

---

## 10. Equipment Page

**Where:** "Equipment" in the sidebar.

### Tractors

View and manage your tractor fleet. Each tractor shows:
- Unit number, make, model, year
- Current status (AVAILABLE, IN_USE, MAINTENANCE)
- Current driver assignment
- Odometer and engine hours
- Maintenance history

### Trailers

Similar to tractors — unit details, status, current assignment.

### Maintenance

Log maintenance events for any piece of equipment. Track scheduled vs. completed dates, vendor, labor/parts costs.

### Inspections

Pre-trip and post-trip inspection records. Flag defects with severity levels. Track resolution status.

---

## 11. Chassis Page

**Where:** "Chassis" in the sidebar.

### Chassis Usage Tab

Track every chassis pickup and return. The table shows:
- Chassis number and pool (DCLI, TRAC, Flexi-Van, or company-owned)
- Which container it's under and which customer
- Pickup date, terminal, and driver
- Days out, free days remaining, and per-diem charges accruing
- Status: OUT, RETURNED, INVOICED, RECONCILED, STREET_TURNED

**Actions on OUT chassis:**
- **Edit** — update any field
- **Return** — record the return date, location, and driver
- **ST (Street Turn)** — close this usage and open a new one for a different container (avoids returning empty chassis to the pool)

### Pool Rates Tab

View the configured chassis pools and their rates. Rates are set by size (20/40/45) and include split-day rates.

### Invoice Audit Tab

Reconcile pool invoices against your usage records.

1. Click **Upload Invoice CSV**
2. Select a CSV file from your pool provider (DCLI, Flexi-Van, etc.)
3. The system auto-detects the chassis number and amount columns (it looks for headers containing "chassis" and "amount"/"charge"/"total")
4. It matches each invoice line against your `chassis_usage` records

The result shows:
- **Summary** — total invoice lines, how many matched, how many didn't, and the total dollar variance
- **Matched Records** — side-by-side comparison of invoice amount vs. your usage amount. Green = exact match. Orange = variance. The variance column shows the difference.
- **Unmatched Lines** — invoice lines with no corresponding usage record in your system. These need investigation (possibly a chassis you didn't track, or a billing error from the pool).

---

## 12. Customers Page

**Where:** "Customers" in the sidebar.

Manage customer master data. Each customer can have:
- Company details (name, address, phone, email)
- Rate agreements
- Billing preferences
- Communication preferences

---

## 13. Invoices Page

**Where:** "Invoices" in the sidebar.

Full invoice lifecycle management.

### Invoice States

DRAFT → SENT → PAID (or CANCELLED at any point)

### Creating an Invoice

Invoices are typically generated from a completed load (see Step 7 in the core workflow). You can also create one manually from this page.

### Sending

Click **Send** to email the invoice to the customer via SendGrid. The system logs the send date and tracks delivery.

### Payment Tracking

Record payments against invoices. The balance due updates automatically.

---

## 14. Billing Page

**Where:** "Billing" in the sidebar.

A dashboard view of billing health:
- Outstanding invoices and their aging
- Recent payments received
- Billing status summary across all orders

---

## 15. Settlements Page

**Where:** "Settlements" in the sidebar.

Calculate and process driver pay settlements.

### How Settlements Work

1. Select a settlement period (weekly, bi-weekly, monthly)
2. The system calculates gross earnings based on the driver's rate profile and completed trips
3. Deductions are applied: fuel, advances, insurance, lease payments
4. Net pay is calculated
5. Approve and record payment

---

## 16. Rates Page

**Where:** "Rates" in the sidebar.

### Pay Profiles Tab

Define pay structures for different driver types:
- **Company Driver (W2)** — typically per-load flat rates
- **Owner Operator (1099)** — typically percentage of gross
- **Lease Operator** — similar to OO with lease deductions

Each profile configures:
- Pay method and default rate
- Waiting/detention pay (free hours + hourly rate after)
- Stop pay (free stops + per-extra-stop rate)
- Accessorial pay (hazmat, overweight, live unload, weekend)
- Weekly deductions (insurance, lease) for OO/lease drivers

### Lane Rates Tab

Set route-specific pricing. Define origin and destination by type (Port, Rail, ZIP, City, Zone) and value. Set flat rates, per-mile rates, estimated miles, and minimums.

### Driver Assignments Tab

Assign pay profiles to individual drivers. The table shows all active drivers with:
- Name, CDL number, driver type
- A dropdown to select their rate profile
- The effective pay rate shown beneath the dropdown

Changing the dropdown saves immediately. Select "No profile" to remove an assignment.

---

## 17. Street Turns Page

**Where:** "Street Turns" in the sidebar.

### What is a Street Turn?

Instead of returning an empty import container to the terminal after delivery, you deliver it directly to an export shipper who needs a container of the same size. This saves:
- A trip back to the terminal
- Fuel costs
- Terminal gate fees
- Time

### How to Use

The system automatically identifies opportunities by matching:
- Import containers that have been delivered (customs released)
- Export shipments that need a container of the same size

Each match card shows:
- The import details (reference, customer, container, terminal, LFD)
- The export details (reference, customer, needed size, terminal, cutoff date)
- Whether it's a **Same Terminal** match (higher savings ~$200) or **Different Terminal** (~$150)

### Creating a Street Turn

1. Click **Create Street Turn** on a match card
2. A confirmation prompt appears: **Confirm? Yes / No**
3. Click **Yes**
4. The system looks up both shipment IDs, creates a street turn record with POTENTIAL status, and removes the match from the list
5. The created turn appears in the **Created This Session** section at the bottom

---

## 18. Reports Page

**Where:** "Reports" in the sidebar.

### Date Filtering

Use the date range bar at the top to control which data is included in all reports:
- Click the start/end date fields to pick custom dates
- Use the quick buttons: **7d**, **30d**, **90d**, **This Month**

All stats and export data update when you change the date range.

### Reading the Reports

- **Revenue Summary** — 4 gradient cards showing Total Revenue, Paid Invoices, Outstanding balance, and Average Rate per Order for the selected period
- **Shipment Overview** — total shipments with import/export split and a status breakdown with progress bars
- **Trip Performance** — total trips, completed trips, active drivers, and completion rate percentage

### Exporting Data

Four export buttons at the bottom, each showing the number of records that will be exported:

- **Shipment Report** — exports all shipments in the date range (reference, type, status, customer, terminal, created date)
- **Revenue Report** — exports all orders (order ID, customer, rate, total amount, status, created date)
- **Trip Report** — exports all trips (trip ID, load ID, driver, status, origin, destination, created date)
- **Driver Report** — exports all drivers (ID, name, CDL, status, type, email, phone). Note: driver data is not date-filtered since it's reference data.

Click any export button and the CSV downloads immediately.

---

## 19. Documents Page

**Where:** "Documents" in the sidebar.

Upload and retrieve shipping documents: Bills of Lading (BOL), Proofs of Delivery (POD), customs paperwork, and other documents. Documents are linked to shipments or orders.

---

## 20. Notifications Page

**Where:** "Notifications" in the sidebar.

View all system notifications. Notifications are generated for:
- **LFD Warnings** — when a container's Last Free Day is approaching (24h, 48h thresholds)
- **Dispatch Events** — when trips are created, assigned, or completed
- **System Messages** — configuration changes, sync status, etc.

Mark notifications as read by clicking them. Unread notifications show a badge on the sidebar icon.

---

## 21. Quotes Page

**Where:** "Quotes" in the sidebar.

Generate rate quotes for customers using your configured lane rates and accessorial rates. Quotes can be converted to orders.

---

## 22. Customer Portal

**Where:** "Customer Portal" in the sidebar.

A simplified read-only view that customers can access to:
- Track their shipment status
- View their invoices and payment history

---

## 23. Settings Page

**Where:** "Settings" in the sidebar (gear icon, last item).

### Company Information

Set your company details: name, address, city, state, ZIP, phone, email, MC number, and DOT number. These appear on invoices and documents.

Click **Save Changes** to persist. You'll see a green success message or a red error message if something went wrong. The message auto-dismisses after a few seconds.

### Notifications

Toggle notification channels on or off:
- **Email Alerts** — receive alerts via email
- **SMS Alerts** — receive alerts via SMS (requires Twilio setup)
- **Dispatch Notifications** — notified when trips are created/updated
- **Delivery Confirmations** — notified when deliveries are completed
- **LFD Reminders** — notified when containers approach their Last Free Day

All notification settings are saved with the company settings when you click Save.

### Integrations

Placeholder cards for third-party integrations (Google Maps for GPS/routing, SendGrid for email, Twilio for SMS). Click Configure on any card to set up the integration.

---

## Quick Reference: Status Colors

These colors are used consistently across the application:

| Color | Meaning |
|---|---|
| Blue | Active / In Progress |
| Green | Completed / Available / Success |
| Yellow | Warning / Approaching deadline (3–5 days) |
| Orange | Caution / Approaching deadline (1–2 days) |
| Red | Urgent / Overdue / Error |
| Purple | Special operations (street turns, chassis street-turned) |
| Gray | Inactive / Completed / Reconciled |

---

## Quick Reference: Load Status Flow

```
TRACKING → AVAILABLE → APPOINTMENT_NEEDED → READY_FOR_DISPATCH
                                                     │
                                                     ▼
                                              DISPATCHED
                                                     │
                                        ┌────────────┼────────────┐
                                        ▼            ▼            ▼
                                   IN_YARD     IN_TRANSIT    AT_PICKUP
                                                     │
                                                     ▼
                                              AT_DELIVERY
                                                     │
                                                     ▼
                                               RETURNING
                                                     │
                                                     ▼
                                              COMPLETED → INVOICED
```

At any point, a load can move to **HOLD** (if a hold is placed) or **CANCELLED**.
