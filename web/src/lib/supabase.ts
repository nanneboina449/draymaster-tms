// ============================================================================
// DRAYMASTER TMS - Supabase Functions (MERGED: Old + New v2.0)
// ============================================================================

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseKey);

// ============================================================================
// EXISTING TYPES (for compatibility)
// ============================================================================

export interface Customer {
  id: string;
  company_name: string;
  contact_name?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  is_active?: boolean;
  created_at?: string;
}

export interface Driver {
  id: string;
  first_name: string;
  last_name: string;
  name?: string; // computed: first_name + last_name
  phone?: string;
  email?: string;
  license_number?: string;
  license_state?: string;
  license_expiry?: string;
  twic_expiry?: string;
  hazmat_endorsement?: boolean;
  twic_card?: boolean;
  status: string;
  pay_type?: string;
  pay_rate?: number | string;
  created_at?: string;
}

export interface Tractor {
  id: string;
  unit_number: string;
  make?: string;
  model?: string;
  year?: number;
  vin?: string;
  license_plate?: string;
  license_state?: string;
  status: string;
  created_at?: string;
}

export interface Chassis {
  id: string;
  chassis_number: string;
  pool?: string;
  size?: string;
  type?: string;
  status: string;
  current_location?: string;
  created_at?: string;
}

export interface Order {
  id: string;
  order_number: string;
  customer_id?: string;
  type: string;
  status: string;
  billing_status?: 'UNBILLED' | 'BILLED' | 'PAID';
  container_number?: string;
  pickup_location?: string;
  delivery_location?: string;
  total_amount?: number;
  created_at?: string;
  location_city?: string;
  shipping_line?: string;
  booking_number?: string;
}

export interface Trip {
  id: string;
  trip_number?: string;
  type?: string;
  status: string;
  order_id?: string;
  load_id?: string;
  driver_id?: string;
  tractor_id?: string;
  chassis_id?: string;
  chassis_number?: string;
  chassis?: Chassis;
  container_number?: string;
  pickup_location?: string;
  delivery_location?: string;
  planned_start?: string;
  actual_start?: string;
  pickup_arrival?: string;
  pickup_departure?: string;
  delivery_arrival?: string;
  actual_end?: string;
  notes?: string;
  priority?: string;
  is_team_driver?: boolean;
  dispatch_notes?: string;
  created_at?: string;
  driver?: Driver;
  tractor?: Tractor;
  legs?: TripLeg[];
}

export interface TripLeg {
  id: string;
  trip_id: string;
  leg_number: number;
  leg_type: string;
  status: string;
  driver_id?: string;
  pickup_location?: string;
  delivery_location?: string;
  notes?: string;
}

export interface Shipment {
  id: string;
  reference_number?: string;
  shipment_number?: string;
  customer_id?: string;
  customer_name?: string;
  type?: string;
  status?: string;
  steamship_line?: string;
  booking_number?: string;
  bill_of_lading?: string;
  vessel?: string;
  voyage?: string;
  terminal_name?: string;
  last_free_day?: string;
  port_cutoff?: string;
  trip_type?: string;
  chassis_required?: boolean;
  chassis_pool?: string;
  chassis_size?: string;
  delivery_address?: string;
  delivery_city?: string;
  delivery_state?: string;
  delivery_zip?: string;
  special_instructions?: string;
  containers?: any[];
  container_number?: string;
  created_at?: string;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  customer_id?: string;
  customer_name?: string;
  shipment_id?: string;
  subtotal: number;
  tax: number;
  tax_rate?: number;
  tax_amount?: number;
  total: number;
  total_amount?: number; // alias for total
  balance_due?: number;
  status: string;
  invoice_date?: string;
  due_date?: string;
  billing_address?: string;
  notes?: string;
  created_at?: string;
}

// ============================================================================
// ORIGINAL FUNCTIONS (for existing pages)
// ============================================================================

// CUSTOMERS
export async function getCustomers(): Promise<Customer[]> {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .order('company_name');
  if (error) { console.error('Error:', error); return []; }
  return data || [];
}

export async function createCustomer(customer: Partial<Customer>): Promise<Customer | null> {
  const { data, error } = await supabase.from('customers').insert(customer).select().single();
  if (error) { console.error('Error:', error); return null; }
  return data;
}

export async function updateCustomer(id: string, updates: Partial<Customer>): Promise<Customer | null> {
  const { data, error } = await supabase.from('customers').update(updates).eq('id', id).select().single();
  if (error) { console.error('Error:', error); return null; }
  return data;
}

export async function deleteCustomer(id: string): Promise<boolean> {
  const { error } = await supabase.from('customers').delete().eq('id', id);
  return !error;
}

// DRIVERS
export async function getDrivers(): Promise<Driver[]> {
  const { data, error } = await supabase
    .from('drivers')
    .select('*')
    .order('first_name');
  if (error) { console.error('Error:', error); return []; }
  return data || [];
}

export async function createDriver(driver: Partial<Driver>): Promise<Driver | null> {
  const { data, error } = await supabase.from('drivers').insert(driver).select().single();
  if (error) { console.error('Error:', error); return null; }
  return data;
}

export async function updateDriver(id: string, updates: Partial<Driver>): Promise<Driver | null> {
  const { data, error } = await supabase.from('drivers').update(updates).eq('id', id).select().single();
  if (error) { console.error('Error:', error); return null; }
  return data;
}

export async function deleteDriver(id: string): Promise<boolean> {
  const { error } = await supabase.from('drivers').delete().eq('id', id);
  return !error;
}

export async function updateDriverStatus(id: string, status: string): Promise<boolean> {
  const { error } = await supabase.from('drivers').update({ status }).eq('id', id);
  return !error;
}

// TRACTORS
export async function getTractors(): Promise<Tractor[]> {
  const { data, error } = await supabase
    .from('tractors')
    .select('*')
    .order('unit_number');
  if (error) { console.error('Error:', error); return []; }
  return data || [];
}

export async function createTractor(tractor: Partial<Tractor>): Promise<Tractor | null> {
  const { data, error } = await supabase.from('tractors').insert(tractor).select().single();
  if (error) { console.error('Error:', error); return null; }
  return data;
}

export async function updateTractor(id: string, updates: Partial<Tractor>): Promise<boolean> {
  const { error } = await supabase.from('tractors').update(updates).eq('id', id);
  return !error;
}

export async function deleteTractor(id: string): Promise<boolean> {
  const { error } = await supabase.from('tractors').delete().eq('id', id);
  return !error;
}

// CHASSIS
export async function getAllChassis(): Promise<Chassis[]> {
  const { data, error } = await supabase
    .from('chassis')
    .select('*')
    .order('chassis_number');
  if (error) { console.error('Error:', error); return []; }
  return data || [];
}

export async function createChassis(chassis: Partial<Chassis>): Promise<Chassis | null> {
  const { data, error } = await supabase.from('chassis').insert(chassis).select().single();
  if (error) { console.error('Error:', error); return null; }
  return data;
}

export async function updateChassis(id: string, updates: Partial<Chassis>): Promise<boolean> {
  const { error } = await supabase.from('chassis').update(updates).eq('id', id);
  return !error;
}

export async function deleteChassis(id: string): Promise<boolean> {
  const { error } = await supabase.from('chassis').delete().eq('id', id);
  return !error;
}

// ORDERS
export async function getOrders(): Promise<Order[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) { console.error('Error:', error); return []; }
  return data || [];
}

export async function createOrder(order: Partial<Order>): Promise<Order | null> {
  const orderNumber = `ORD-${Date.now().toString().slice(-8)}`;
  const { data, error } = await supabase
    .from('orders')
    .insert({ ...order, order_number: orderNumber })
    .select()
    .single();
  if (error) { console.error('Error:', error); return null; }
  return data;
}

export async function updateOrder(id: string, updates: Partial<Order>): Promise<boolean> {
  const { error } = await supabase.from('orders').update(updates).eq('id', id);
  return !error;
}

export async function deleteOrder(id: string): Promise<boolean> {
  const { error } = await supabase.from('orders').delete().eq('id', id);
  return !error;
}

// TRIPS
export async function getTrips(): Promise<Trip[]> {
  const { data, error } = await supabase
    .from('trips')
    .select(`
      *,
      driver:drivers(*),
      tractor:tractors(*),
      order:orders(*)
    `)
    .order('created_at', { ascending: false });
  if (error) { console.error('Error:', error); return []; }
  return data || [];
}

export async function createTrip(
  loadIdOrTrip: string | Partial<Trip>,
  driver_id?: string,
  tractor_id?: string,
  chassis_number?: string,
  chassis_pool?: string,
  move_type?: string,
  legs?: any[]
): Promise<Trip | null> {
  // Map frontend MoveType labels to DB trip_type enum values
  const tripTypeMap: Record<string, string> = {
    'LIVE': 'LIVE_LOAD',
    'DROP': 'DROP_ONLY',
    'PREPULL': 'PRE_PULL',
    'STREET_TURN': 'STREET_TURN',
  };

  const tripNumber = `TRP-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
  let tripRecord: any;
  let tripLegs: any[] = [];

  if (typeof loadIdOrTrip === 'string') {
    // Positional-arg signature used by LoadDetailPanel
    const isShipment = loadIdOrTrip.startsWith('shp:');

    tripRecord = {
      trip_number: tripNumber,
      type: tripTypeMap[move_type || 'LIVE'] || 'LIVE_LOAD',
      status: 'DISPATCHED',
      driver_id: driver_id || null,
      tractor_id: tractor_id || null,
      chassis_number: chassis_number || null,
    };

    if (isShipment) {
      const containerId = loadIdOrTrip.slice(4);
      const { data: containerRow } = await supabase
        .from('containers').select('shipment_id').eq('id', containerId).single();
      if (containerRow) {
        tripRecord.shipment_id = containerRow.shipment_id;
        tripRecord.container_id = containerId;
      }
    } else {
      tripRecord.load_id = loadIdOrTrip;
    }

    tripLegs = legs || [];
  } else {
    // Single-object signature (backward compat)
    tripRecord = { trip_number: tripNumber, ...loadIdOrTrip };
  }

  const { data, error } = await supabase
    .from('trips').insert(tripRecord).select().single();
  if (error) { console.error('Error creating trip:', error); return null; }

  // Insert legs into trip_legs
  for (let i = 0; i < tripLegs.length; i++) {
    await supabase.from('trip_legs').insert({
      ...tripLegs[i],
      trip_id: data.id,
      leg_number: i + 1,
      status: 'PENDING',
    });
  }

  return data;
}

export async function createMultiLegTrip(trip: Partial<Trip>, legs: Partial<TripLeg>[]): Promise<Trip | null> {
  const { data: tripData, error: tripError } = await supabase
    .from('trips')
    .insert(trip)
    .select()
    .single();
  
  if (tripError) { console.error('Error:', tripError); return null; }
  
  for (const leg of legs) {
    await supabase.from('trip_legs').insert({ ...leg, trip_id: tripData.id });
  }
  
  return tripData;
}

export async function updateTrip(id: string, updates: Partial<Trip>): Promise<boolean> {
  const { error } = await supabase.from('trips').update(updates).eq('id', id);
  return !error;
}

export async function updateTripStatus(id: string, status: string): Promise<boolean> {
  const { error } = await supabase.from('trips').update({ status }).eq('id', id);
  return !error;
}

// SHIPMENTS
export async function getShipments(): Promise<Shipment[]> {
  const { data, error } = await supabase
    .from('shipments')
    .select(`
      *,
      containers(
        *,
        orders:orders(id, status, order_number, move_type_v2, sequence_number)
      )
    `)
    .order('created_at', { ascending: false });
  if (error) { console.error('Error:', error); return []; }
  return data || [];
}

export async function createShipment(shipment: any, containers?: any[]): Promise<Shipment | null> {
  const referenceNumber = `SHP-${Date.now().toString().slice(-8)}`;
  const { data, error } = await supabase
    .from('shipments')
    .insert({ ...shipment, reference_number: referenceNumber })
    .select()
    .single();
  if (error) { console.error('Error:', error); return null; }

  if (containers && containers.length > 0 && data) {
    const rows = containers.map(c => ({
      shipment_id: data.id,
      container_number: c.container_number,
      size: c.size,
      type: c.type,
      weight_lbs: c.weight || null,
      seal_number: c.seal_number || null,
      is_hazmat: c.is_hazmat || false,
      hazmat_class: c.hazmat_class || null,
      is_overweight: c.is_overweight || false,
      is_reefer: c.is_reefer || false,
      reefer_temp_setpoint: c.reefer_temp || null,
      customs_status: c.customs_status || 'PENDING',
    }));
    await supabase.from('containers').insert(rows);
  }

  return data;
}

export async function updateShipment(id: string, updates: Partial<Shipment>): Promise<boolean> {
  const { error } = await supabase.from('shipments').update(updates).eq('id', id);
  return !error;
}

export async function deleteShipment(id: string): Promise<boolean> {
  const { error } = await supabase.from('shipments').delete().eq('id', id);
  return !error;
}

export async function updateShipmentStatus(id: string, status: string): Promise<boolean> {
  const { error } = await supabase.from('shipments').update({ status }).eq('id', id);
  return !error;
}

// CONTAINERS
export interface Container {
  id: string;
  shipment_id: string;
  container_number: string;
  size: string;
  type: string;
  weight_lbs?: number;
  seal_number?: string;
  is_hazmat?: boolean;
  hazmat_class?: string;
  un_number?: string;
  is_overweight?: boolean;
  is_reefer?: boolean;
  reefer_temp_setpoint?: number;
  customs_status?: string;
  created_at?: string;
}

export async function addContainer(container: any): Promise<Container> {
  const { data, error } = await supabase
    .from('containers')
    .insert({
      shipment_id: container.shipment_id,
      container_number: container.container_number,
      size: container.size,
      type: container.type,
      weight_lbs: container.weight || null,
      seal_number: container.seal_number || null,
      is_hazmat: container.is_hazmat || false,
      hazmat_class: container.hazmat_class || null,
      un_number: container.hazmat_un || null,
      is_overweight: container.is_overweight || false,
      is_reefer: container.is_reefer || false,
      reefer_temp_setpoint: container.reefer_temp || null,
      customs_status: container.customs_status || 'PENDING',
      lifecycle_status: 'BOOKED',
    })
    .select()
    .single();
  if (error) {
    console.error('Error creating container:', error);
    throw new Error(error.message || 'Failed to create container');
  }
  return data;
}

export async function updateContainer(id: string, updates: any): Promise<Container> {
  const { data, error } = await supabase
    .from('containers')
    .update({
      container_number: updates.container_number,
      size: updates.size,
      type: updates.type,
      weight_lbs: updates.weight || null,
      seal_number: updates.seal_number || null,
      is_hazmat: updates.is_hazmat || false,
      hazmat_class: updates.hazmat_class || null,
      un_number: updates.hazmat_un || null,
      is_overweight: updates.is_overweight || false,
      is_reefer: updates.is_reefer || false,
      reefer_temp_setpoint: updates.reefer_temp || null,
      customs_status: updates.customs_status || 'PENDING',
    })
    .eq('id', id)
    .select()
    .single();
  if (error) {
    console.error('Error updating container:', error);
    throw new Error(error.message || 'Failed to update container');
  }
  return data;
}

export async function deleteContainer(id: string): Promise<boolean> {
  const { error } = await supabase.from('containers').delete().eq('id', id);
  return !error;
}

// INVOICES
export async function getInvoices(): Promise<Invoice[]> {
  const { data, error } = await supabase
    .from('invoices')
    .select(`*, customer:customers(*), shipment:shipments(*)`)
    .order('created_at', { ascending: false });
  if (error) { console.error('Error:', error); return []; }
  return data || [];
}

export async function createInvoice(invoice: Partial<Invoice>, items?: any[]): Promise<Invoice | null> {
  const invoiceNumber = `INV-${Date.now().toString().slice(-8)}`;
  const { data, error } = await supabase
    .from('invoices')
    .insert({ ...invoice, invoice_number: invoiceNumber })
    .select()
    .single();
  if (error) { console.error('Error:', error); return null; }

  // Create line items if provided
  if (items && items.length > 0 && data) {
    for (const item of items) {
      await supabase.from('invoice_line_items').insert({
        invoice_id: data.id,
        ...item,
      });
    }
  }

  return data;
}

export async function updateInvoice(id: string, updates: Partial<Invoice>): Promise<boolean> {
  const { error } = await supabase.from('invoices').update(updates).eq('id', id);
  return !error;
}

export async function deleteInvoice(id: string): Promise<boolean> {
  const { error } = await supabase.from('invoices').delete().eq('id', id);
  return !error;
}

// SETTLEMENTS
export async function getSettlements(): Promise<any[]> {
  const { data, error } = await supabase
    .from('settlements')
    .select(`*, driver:drivers(*)`)
    .order('created_at', { ascending: false });
  if (error) { console.error('Error:', error); return []; }
  return data || [];
}

export async function createSettlement(settlement: any): Promise<any> {
  const { data, error } = await supabase.from('settlements').insert(settlement).select().single();
  if (error) { console.error('Error:', error); return null; }
  return data;
}

// ============================================================================
// NEW v2.0 TYPES
// ============================================================================

export type OrderType = 'IMPORT' | 'EXPORT';
export type MoveType = 'LIVE' | 'DROP' | 'PREPULL' | 'STREET_TURN' | 'RETURN_EMPTY';
export type ContainerSize = '20' | '40' | '40HC' | '45';
export type TerminalStatus = 'ON_VESSEL' | 'DISCHARGED' | 'AVAILABLE' | 'PICKED_UP' | 'RETURNED' | 'TRACKING';
export type LoadStatus = 'TRACKING' | 'AVAILABLE' | 'HOLD' | 'APPOINTMENT_NEEDED' | 'READY_FOR_DISPATCH' | 'DISPATCHED' | 'IN_YARD' | 'IN_TRANSIT' | 'AT_PICKUP' | 'AT_DELIVERY' | 'RETURNING' | 'COMPLETED' | 'INVOICED' | 'CANCELLED';
export type ChargeType = 'LINE_HAUL' | 'FUEL_SURCHARGE' | 'PREPULL' | 'DETENTION' | 'STORAGE' | 'CHASSIS_SPLIT' | 'CHASSIS_RENTAL' | 'DEMURRAGE' | 'GATE_FEE' | 'HAZMAT' | 'OVERWEIGHT' | 'TRIAXLE' | 'WAITING_TIME' | 'STOP_OFF' | 'OTHER';
export type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface Load {
  id: string;
  load_number: string;
  order_id?: string;
  customer_id: string;
  container_number?: string;
  container_size?: ContainerSize;
  container_type?: string;
  weight_lbs?: number;
  is_hazmat?: boolean;
  is_overweight?: boolean;
  requires_triaxle?: boolean;
  move_type?: MoveType;
  terminal?: string;
  terminal_status?: TerminalStatus;
  last_free_day?: string;
  hold_customs?: boolean;
  hold_freight?: boolean;
  hold_usda?: boolean;
  hold_tmf?: boolean;
  in_yard?: boolean;
  yard_location?: string;
  yard_in_date?: string;
  status: LoadStatus;
  total_charges?: number;
  invoice_id?: string;
  created_at?: string;
  updated_at?: string;
  customer?: Customer;
  order?: Order;
  charges?: LoadCharge[];
  notes?: LoadNote[];
  trip?: Trip;
}

export interface LoadCharge {
  id: string;
  load_id: string;
  charge_type: ChargeType;
  description: string;
  quantity: number;
  unit_rate: number;
  amount: number;
  billable_to: string;
  auto_calculated?: boolean;
  created_at?: string;
}

export interface LoadNote {
  id: string;
  load_id: string;
  author_name: string;
  author_type: string;
  message: string;
  visible_to_customer?: boolean;
  created_at?: string;
}

export interface LoadActivityLog {
  id: string;
  load_id: string;
  action: string;
  from_value?: string;
  to_value?: string;
  performed_by: string;
  performer_type: string;
  details?: string;
  created_at?: string;
}

export interface DispatchBoardItem {
  id: string;
  load_number: string;
  container_number?: string;
  container_size?: string;
  status: LoadStatus;
  terminal_status?: string;
  terminal?: string;
  last_free_day?: string;
  move_type?: string;
  hold_customs?: boolean;
  hold_freight?: boolean;
  hold_usda?: boolean;
  hold_tmf?: boolean;
  has_holds?: boolean;
  in_yard?: boolean;
  customer_name?: string;
  delivery_city?: string;
  trip_id?: string;
  trip_status?: string;
  driver_id?: string;
  driver_name?: string;
  truck_number?: string;
  lfd_urgency?: string;
  days_until_lfd?: number;
}

export interface StreetTurnOpportunity {
  import_load_id: string;
  import_container?: string;
  import_ssl?: string;
  import_size?: string;
  import_customer?: string;
  export_load_id: string;
  export_container?: string;
  export_ssl?: string;
  export_size?: string;
  export_customer?: string;
  match_score: number;
}

// ============================================================================
// NEW v2.0 FUNCTIONS
// ============================================================================

// DISPATCH BOARD
export async function getDispatchBoard(): Promise<DispatchBoardItem[]> {
  const { data, error } = await supabase
    .from('v_dispatch_board')
    .select('*')
    .order('last_free_day', { ascending: true, nullsFirst: false });
  if (error) { 
    console.error('Error fetching dispatch board:', error);
    // Fallback: try to get from loads directly
    return getLoadsForDispatch();
  }
  return data || [];
}

// Compute LFD urgency relative to today
function computeLFDUrgency(lfd: string | null): { lfd_urgency: string; days_until_lfd: number } {
  if (!lfd) return { lfd_urgency: 'OK', days_until_lfd: 999 };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const lfdDate = new Date(lfd); lfdDate.setHours(0, 0, 0, 0);
  const diff = Math.ceil((lfdDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return { lfd_urgency: 'OVERDUE', days_until_lfd: diff };
  if (diff === 0) return { lfd_urgency: 'TOMORROW', days_until_lfd: 0 };
  if (diff <= 3) return { lfd_urgency: 'SOON', days_until_lfd: diff };
  return { lfd_urgency: 'OK', days_until_lfd: diff };
}

// Map shipment_status enum → LoadStatus for the dispatch board
function mapShipmentStatusToLoadStatus(status: string | null): LoadStatus {
  const map: Record<string, LoadStatus> = {
    'PENDING': 'TRACKING',
    'CONFIRMED': 'AVAILABLE',
    'IN_PROGRESS': 'DISPATCHED',
    'DELIVERED': 'COMPLETED',
    'COMPLETED': 'COMPLETED',
    'CANCELLED': 'CANCELLED',
  };
  return map[status || ''] || 'TRACKING';
}

// Map LoadStatus back → shipment_status enum for updates
function mapLoadStatusToShipmentStatus(status: string): string {
  const map: Record<string, string> = {
    'TRACKING': 'PENDING',
    'AVAILABLE': 'CONFIRMED',
    'HOLD': 'PENDING',
    'APPOINTMENT_NEEDED': 'PENDING',
    'READY_FOR_DISPATCH': 'CONFIRMED',
    'DISPATCHED': 'IN_PROGRESS',
    'IN_TRANSIT': 'IN_PROGRESS',
    'AT_PICKUP': 'IN_PROGRESS',
    'AT_DELIVERY': 'IN_PROGRESS',
    'RETURNING': 'IN_PROGRESS',
    'IN_YARD': 'IN_PROGRESS',
    'COMPLETED': 'DELIVERED',
    'INVOICED': 'COMPLETED',
    'CANCELLED': 'CANCELLED',
  };
  return map[status] || 'IN_PROGRESS';
}

// Fetches from both loads and shipments tables and merges into one board
async function getLoadsForDispatch(): Promise<DispatchBoardItem[]> {
  // 1. Loads table (created via dispatch page OrderEntryForm)
  const { data: loadsData } = await supabase
    .from('loads')
    .select(`*, customer:customers(company_name), order:orders(location_city)`)
    .order('last_free_day', { ascending: true, nullsFirst: false });

  const loadItems: DispatchBoardItem[] = (loadsData || []).map((load: any) => {
    const urgency = computeLFDUrgency(load.last_free_day);
    return {
      id: load.id,
      load_number: load.load_number,
      container_number: load.container_number,
      container_size: load.container_size,
      status: load.status,
      terminal_status: load.terminal_status,
      terminal: load.terminal,
      last_free_day: load.last_free_day,
      move_type: load.move_type,
      hold_customs: load.hold_customs,
      hold_freight: load.hold_freight,
      hold_usda: load.hold_usda,
      hold_tmf: load.hold_tmf,
      in_yard: load.in_yard,
      customer_name: load.customer?.company_name,
      delivery_city: load.order?.location_city,
      lfd_urgency: urgency.lfd_urgency,
      days_until_lfd: urgency.days_until_lfd,
    };
  });

  // 2. Shipments + containers (created via Loads page NewLoadModal wizard)
  const { data: shipmentsData } = await supabase
    .from('shipments')
    .select(`*, containers(*)`)
    .order('created_at', { ascending: false });

  const shipmentItems: DispatchBoardItem[] = [];
  for (const shipment of (shipmentsData || [])) {
    for (const container of (shipment.containers || [])) {
      const urgency = computeLFDUrgency(shipment.last_free_day);
      shipmentItems.push({
        id: `shp:${container.id}`,
        load_number: shipment.reference_number || shipment.id,
        container_number: container.container_number,
        container_size: container.size,
        status: mapShipmentStatusToLoadStatus(shipment.status),
        terminal_status: 'AVAILABLE',
        terminal: shipment.terminal_name,
        last_free_day: shipment.last_free_day,
        move_type: shipment.trip_type || 'LIVE',
        hold_customs: container.customs_status === 'HOLD',
        hold_freight: false,
        hold_usda: false,
        hold_tmf: false,
        in_yard: false,
        customer_name: shipment.customer_name,
        delivery_city: shipment.delivery_city,
        lfd_urgency: urgency.lfd_urgency,
        days_until_lfd: urgency.days_until_lfd,
      });
    }
  }

  return [...loadItems, ...shipmentItems];
}

// LOADS
export async function getLoadsByStatus(status: LoadStatus | LoadStatus[]): Promise<Load[]> {
  const statuses = Array.isArray(status) ? status : [status];
  const { data, error } = await supabase
    .from('loads')
    .select(`*, customer:customers(*), order:orders(*)`)
    .in('status', statuses)
    .order('last_free_day', { ascending: true, nullsFirst: false });
  if (error) { console.error('Error:', error); return []; }
  return data || [];
}

export async function getLoadDetails(loadId: string): Promise<Load | null> {
  const { data, error } = await supabase
    .from('loads')
    .select(`
      *,
      customer:customers(*),
      order:orders(*),
      charges:load_charges(*),
      notes:load_notes(*)
    `)
    .eq('id', loadId)
    .single();
  if (error) { console.error('Error:', error); return null; }
  
  // Get trip
  const { data: trip } = await supabase
    .from('trips')
    .select(`*, driver:drivers(*), tractor:tractors(*), legs:trip_legs(*)`)
    .eq('load_id', loadId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  
  return { ...data, trip } as Load;
}

export async function createLoad(load: Partial<Load>): Promise<Load | null> {
  const loadNumber = `LD-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
  const { data, error } = await supabase
    .from('loads')
    .insert({ ...load, load_number: loadNumber, status: load.status || 'TRACKING' })
    .select()
    .single();
  if (error) { console.error('Error:', error); return null; }
  return data;
}

export async function updateLoadStatus(
  loadId: string,
  newStatus: LoadStatus,
  performedBy: string = 'SYSTEM'
): Promise<boolean> {
  // Shipment-sourced loads: update the parent shipment's status
  if (loadId.startsWith('shp:')) {
    const containerId = loadId.slice(4);
    const { data: containerRow } = await supabase
      .from('containers').select('shipment_id').eq('id', containerId).single();
    if (!containerRow) return false;
    const shipmentStatus = mapLoadStatusToShipmentStatus(newStatus);
    const { error } = await supabase
      .from('shipments').update({ status: shipmentStatus }).eq('id', containerRow.shipment_id);
    return !error;
  }

  // Loads-table sourced items: update loads.status directly
  const { error } = await supabase
    .from('loads')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', loadId);
  if (error) { console.error('Error:', error); return false; }

  await logLoadActivity(loadId, 'STATUS_CHANGE', null, newStatus, undefined, performedBy);
  return true;
}

export async function updateLoad(loadId: string, updates: Partial<Load>): Promise<Load | null> {
  const { data, error } = await supabase
    .from('loads')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', loadId)
    .select()
    .single();
  if (error) { console.error('Error:', error); return null; }
  return data;
}

// LOAD CHARGES
export async function addLoadCharge(charge: Partial<LoadCharge>): Promise<LoadCharge | null> {
  const { data, error } = await supabase.from('load_charges').insert(charge).select().single();
  if (error) { console.error('Error:', error); return null; }
  if (charge.load_id) await recalculateLoadTotal(charge.load_id);
  return data;
}

export async function recalculateLoadTotal(loadId: string): Promise<number> {
  const { data: charges } = await supabase
    .from('load_charges')
    .select('amount')
    .eq('load_id', loadId)
    .eq('billable_to', 'CUSTOMER');
  const total = charges?.reduce((sum, c) => sum + Number(c.amount), 0) || 0;
  await supabase.from('loads').update({ total_charges: total }).eq('id', loadId);
  return total;
}

// LOAD NOTES & ACTIVITY
export async function addLoadNote(
  loadId: string,
  message: string,
  authorName: string,
  authorType: string = 'INTERNAL',
  visibleToCustomer: boolean = false
): Promise<LoadNote | null> {
  const { data, error } = await supabase
    .from('load_notes')
    .insert({ load_id: loadId, message, author_name: authorName, author_type: authorType, visible_to_customer: visibleToCustomer })
    .select()
    .single();
  if (error) { console.error('Error:', error); return null; }
  return data;
}

export async function logLoadActivity(
  loadId: string,
  action: string,
  fromValue?: string | null,
  toValue?: string | null,
  details?: string,
  performedBy: string = 'SYSTEM',
  performerType: string = 'SYSTEM'
): Promise<void> {
  await supabase.from('load_activity_log').insert({
    load_id: loadId,
    action,
    from_value: fromValue,
    to_value: toValue,
    details,
    performed_by: performedBy,
    performer_type: performerType,
  });
}

export async function getLoadActivityLog(loadId: string): Promise<LoadActivityLog[]> {
  const { data, error } = await supabase
    .from('load_activity_log')
    .select('*')
    .eq('load_id', loadId)
    .order('created_at', { ascending: false });
  if (error) { console.error('Error:', error); return []; }
  return data || [];
}

// STREET TURNS
export async function getStreetTurnOpportunities(): Promise<StreetTurnOpportunity[]> {
  const { data, error } = await supabase
    .from('v_street_turn_opportunities')
    .select('*')
    .order('match_score', { ascending: false });
  if (error) { console.error('Error:', error); return []; }
  return data || [];
}

export async function createStreetTurn(importLoadId: string, exportLoadId: string): Promise<any> {
  const stNumber = `ST-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
  const { data, error } = await supabase
    .from('street_turns')
    .insert({
      street_turn_number: stNumber,
      status: 'POTENTIAL',
      import_load_id: importLoadId,
      export_load_id: exportLoadId,
      estimated_savings: 170,
    })
    .select()
    .single();
  if (error) { console.error('Error:', error); return null; }
  return data;
}

export async function approveStreetTurn(streetTurnId: string, approvedBy: string): Promise<boolean> {
  const { error } = await supabase
    .from('street_turns')
    .update({ status: 'APPROVED', approved_by: approvedBy, approved_at: new Date().toISOString() })
    .eq('id', streetTurnId);
  return !error;
}

// YARD
export async function moveToYard(
  loadId: string,
  yardLocationId: string,
  chassisNumber?: string,
  chassisPool?: string,
  onChassis: boolean = true
): Promise<any> {
  const { data, error } = await supabase
    .from('yard_inventory')
    .insert({
      yard_location_id: yardLocationId,
      load_id: loadId,
      on_chassis: onChassis,
      chassis_number: chassisNumber,
      chassis_pool: chassisPool,
      in_date: new Date().toISOString(),
      status: 'IN_YARD',
    })
    .select()
    .single();
  if (error) { console.error('Error:', error); return null; }
  
  await supabase.from('loads').update({
    in_yard: true,
    yard_location: yardLocationId,
    yard_in_date: new Date().toISOString(),
    status: 'IN_YARD',
  }).eq('id', loadId);
  
  return data;
}

export async function getYardInventory(yardLocationId?: string): Promise<any[]> {
  let query = supabase.from('yard_inventory').select(`*, load:loads(*)`).eq('status', 'IN_YARD');
  if (yardLocationId) query = query.eq('yard_location_id', yardLocationId);
  const { data, error } = await query;
  if (error) { console.error('Error:', error); return []; }
  return data || [];
}

// NOTIFICATIONS
export async function createNotification(
  targetType: string,
  targetId: string,
  recipientType: string,
  title: string,
  message: string,
  severity: Severity = 'MEDIUM',
  channel: string = 'DASHBOARD'
): Promise<void> {
  await supabase.from('notifications').insert({
    target_type: targetType,
    target_id: targetId,
    recipient_type: recipientType,
    title,
    message,
    severity,
    channel,
    status: 'PENDING',
  });
}

export async function getUnreadNotifications(recipientType?: string): Promise<any[]> {
  let query = supabase
    .from('notifications')
    .select('*')
    .eq('channel', 'DASHBOARD')
    .is('read_at', null)
    .order('created_at', { ascending: false });
  if (recipientType) query = query.eq('recipient_type', recipientType);
  const { data } = await query;
  return data || [];
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', notificationId);
}

// INVOICE FROM LOAD
export async function generateInvoiceFromLoad(loadId: string): Promise<string | null> {
  const load = await getLoadDetails(loadId);
  if (!load) return null;
  
  const { data: charges } = await supabase
    .from('load_charges')
    .select('*')
    .eq('load_id', loadId)
    .eq('billable_to', 'CUSTOMER');
  
  const subtotal = charges?.reduce((sum, c) => sum + Number(c.amount), 0) || 0;
  const invoiceNumber = `INV-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
  
  const { data: invoice, error } = await supabase
    .from('invoices')
    .insert({
      invoice_number: invoiceNumber,
      customer_id: load.customer_id,
      shipment_id: load.order_id,
      subtotal,
      tax: 0,
      total: subtotal,
      status: 'DRAFT',
      due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .select()
    .single();
  
  if (error) { console.error('Error:', error); return null; }
  
  // Create line items
  for (const charge of charges || []) {
    await supabase.from('invoice_items').insert({
      invoice_id: invoice.id,
      description: charge.description,
      quantity: charge.quantity,
      unit_price: charge.unit_rate,
      amount: charge.amount,
    });
  }
  
  // Update load
  await supabase.from('loads').update({ invoice_id: invoice.id, status: 'INVOICED' }).eq('id', loadId);
  
  return invoice.id;
}

// AVAILABLE DRIVERS (for dispatch)
export async function getAvailableDrivers(): Promise<Driver[]> {
  const { data: busyDriverIds } = await supabase
    .from('trips')
    .select('driver_id')
    .in('status', ['DISPATCHED', 'EN_ROUTE', 'AT_PICKUP', 'AT_DELIVERY']);

  const busyIds = busyDriverIds?.map((t: any) => t.driver_id).filter(Boolean) || [];

  let query = supabase.from('drivers').select('*').in('status', ['ACTIVE', 'AVAILABLE']);
  if (busyIds.length > 0) {
    query = query.not('id', 'in', busyIds);
  }

  const { data } = await query;
  // Compute name from first_name + last_name (DB columns) so the dispatch
  // form dropdown can render driver.name
  return (data || []).map((d: any) => ({
    ...d,
    name: `${d.first_name || ''} ${d.last_name || ''}`.trim(),
  }));
}

// Fetch a single container + parent shipment and return as a Load-compatible
// object so LoadDetailPanel can render it without changes.
export async function getShipmentAsLoad(containerId: string): Promise<Load | null> {
  const { data, error } = await supabase
    .from('containers')
    .select('*, shipment:shipments(*)')
    .eq('id', containerId)
    .single();
  if (error || !data) return null;

  const shipment = (data as any).shipment;

  // Check for an existing trip dispatched for this container
  const { data: trip } = await supabase
    .from('trips')
    .select('*, driver:drivers(*), tractor:tractors(*), legs:trip_legs(*)')
    .eq('container_id', containerId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  return {
    id: `shp:${containerId}`,
    load_number: shipment?.reference_number || '',
    container_number: (data as any).container_number,
    container_size: (data as any).size,
    container_type: (data as any).type || 'DRY',
    weight_lbs: (data as any).weight_lbs,
    seal_number: (data as any).seal_number,
    is_hazmat: (data as any).is_hazmat || false,
    hazmat_class: (data as any).hazmat_class,
    is_overweight: (data as any).is_overweight || false,
    requires_triaxle: (data as any).is_overweight || false,
    move_type: shipment?.trip_type || 'LIVE',
    terminal: shipment?.terminal_name,
    terminal_status: 'AVAILABLE',
    last_free_day: shipment?.last_free_day,
    hold_customs: (data as any).customs_status === 'HOLD',
    hold_freight: false,
    hold_usda: false,
    hold_tmf: false,
    hold_other: false,
    gate_fee_paid: false,
    on_chassis: false,
    in_yard: false,
    status: mapShipmentStatusToLoadStatus(shipment?.status),
    total_charges: 0,
    customer_id: shipment?.customer_id || '',
    customer: shipment?.customer_name
      ? { id: shipment.customer_id || '', company_name: shipment.customer_name } as any
      : undefined,
    order: {
      location_name: shipment?.delivery_city
        ? `${shipment.delivery_city}, ${shipment.delivery_state || ''}`
        : 'Customer Location',
      location_address: shipment?.delivery_address,
      location_city: shipment?.delivery_city,
      location_state: shipment?.delivery_state,
    } as any,
    trip: trip || undefined,
    created_at: shipment?.created_at || '',
    updated_at: shipment?.created_at || '',
  } as unknown as Load;
}

// Stub — rate-based auto-calculation is not yet implemented.
export async function autoCalculateCharges(loadId: string): Promise<void> {
  console.log('autoCalculateCharges: not yet implemented for', loadId);
}

// ============================================================================
// ORDER-CENTRIC MODEL FUNCTIONS (New)
// ============================================================================

// Types for order-centric model
export type OrderMoveType =
  | 'IMPORT_DELIVERY'
  | 'EXPORT_PICKUP'
  | 'EMPTY_RETURN'
  | 'EMPTY_PICKUP'
  | 'YARD_PULL'
  | 'YARD_DELIVERY'
  | 'REPO';

export type TripExecutionType =
  | 'LIVE_UNLOAD'
  | 'LIVE_LOAD'
  | 'DROP'
  | 'DROP_AND_HOOK'
  | 'STREET_TURN'
  | 'PREPULL'
  | 'REPO';

export type OrderStatus =
  | 'PENDING'
  | 'READY'
  | 'DISPATCHED'
  | 'IN_PROGRESS'
  | 'DELIVERED'
  | 'COMPLETED'
  | 'HOLD'
  | 'CANCELLED'
  | 'FAILED';

export type ContainerLifecycleStatus =
  | 'BOOKED'
  | 'AVAILABLE'
  | 'PICKED_UP'
  | 'DELIVERED'
  | 'DROPPED'
  | 'EMPTY_PICKED'
  | 'RETURNED'
  | 'COMPLETED';

export interface OrderV2 {
  id: string;
  order_number: string;
  shipment_id: string;
  container_id: string;
  type: string;
  move_type_v2?: OrderMoveType;
  trip_execution_type?: TripExecutionType;
  sequence_number: number;
  status: OrderStatus;
  billing_status: string;
  // Pickup
  pickup_location_id?: string;
  pickup_address?: string;
  pickup_city?: string;
  pickup_state?: string;
  pickup_zip?: string;
  pickup_contact_name?: string;
  pickup_contact_phone?: string;
  pickup_appointment?: string;
  pickup_appointment_required?: boolean;
  // Delivery
  delivery_location_id?: string;
  delivery_address?: string;
  delivery_city?: string;
  delivery_state?: string;
  delivery_zip?: string;
  delivery_contact_name?: string;
  delivery_contact_phone?: string;
  delivery_appointment?: string;
  delivery_appointment_required?: boolean;
  // Assignment
  assigned_driver_id?: string;
  assigned_trip_id?: string;
  // Timestamps
  dispatched_at?: string;
  picked_up_at?: string;
  delivered_at?: string;
  completed_at?: string;
  // Billing
  base_rate?: number;
  fuel_surcharge?: number;
  total_charges?: number;
  // Notes
  special_instructions?: string;
  created_at?: string;
  updated_at?: string;
  // Related
  container?: any;
  shipment?: Shipment;
  driver?: Driver;
}

// Create shipment with containers and auto-generate orders
export async function createShipmentWithOrders(
  shipmentData: any,
  containers: any[],
  deliveryInfo?: {
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    contactName?: string;
    contactPhone?: string;
  }
): Promise<Shipment | null> {
  // 1. Create shipment
  const referenceNumber = `SHP-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
  const { data: shipment, error: shipmentError } = await supabase
    .from('shipments')
    .insert({
      ...shipmentData,
      reference_number: referenceNumber,
      status: 'PENDING'
    })
    .select()
    .single();

  if (shipmentError || !shipment) {
    console.error('Error creating shipment:', shipmentError);
    return null;
  }

  // 2. Create containers and orders for each
  for (const container of containers) {
    // Create container
    const { data: containerData, error: containerError } = await supabase
      .from('containers')
      .insert({
        shipment_id: shipment.id,
        container_number: container.container_number,
        size: container.size,
        type: container.type,
        weight_lbs: container.weight || null,
        seal_number: container.seal_number || null,
        is_hazmat: container.is_hazmat || false,
        hazmat_class: container.hazmat_class || null,
        un_number: container.hazmat_un || null,
        is_overweight: container.is_overweight || false,
        is_reefer: container.is_reefer || false,
        reefer_temp_setpoint: container.reefer_temp || null,
        customs_status: container.customs_status || 'PENDING',
        lifecycle_status: 'BOOKED',
      })
      .select()
      .single();

    if (containerError || !containerData) {
      console.error('Error creating container:', containerError);
      continue;
    }

    // 3. Create orders based on shipment type and trip execution type
    const tripType = shipmentData.trip_type || 'LIVE_UNLOAD';
    await createOrdersForContainer(
      shipment.id,
      containerData.id,
      shipmentData.type,
      tripType,
      deliveryInfo
    );
  }

  return shipment;
}

// Create orders for a container based on shipment type
async function createOrdersForContainer(
  shipmentId: string,
  containerId: string,
  shipmentType: 'IMPORT' | 'EXPORT',
  tripExecutionType: TripExecutionType,
  deliveryInfo?: {
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    contactName?: string;
    contactPhone?: string;
  }
): Promise<void> {
  const orderNumber = () => `ORD-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;

  if (shipmentType === 'IMPORT') {
    // Order 1: Import Delivery (terminal → customer)
    await supabase.from('orders').insert({
      order_number: orderNumber(),
      shipment_id: shipmentId,
      container_id: containerId,
      type: 'IMPORT',
      move_type_v2: 'IMPORT_DELIVERY',
      trip_execution_type: tripExecutionType,
      sequence_number: 1,
      status: 'PENDING',
      billing_status: 'UNBILLED',
      delivery_address: deliveryInfo?.address,
      delivery_city: deliveryInfo?.city,
      delivery_state: deliveryInfo?.state,
      delivery_zip: deliveryInfo?.zip,
      delivery_contact_name: deliveryInfo?.contactName,
      delivery_contact_phone: deliveryInfo?.contactPhone,
    });

    // If DROP type, create Order 2: Empty Return
    if (tripExecutionType === 'DROP' || tripExecutionType === 'DROP_AND_HOOK') {
      await supabase.from('orders').insert({
        order_number: orderNumber(),
        shipment_id: shipmentId,
        container_id: containerId,
        type: 'EMPTY_RETURN',
        move_type_v2: 'EMPTY_RETURN',
        trip_execution_type: 'DROP',
        sequence_number: 2,
        status: 'PENDING',
        billing_status: 'UNBILLED',
        // Pickup is where we delivered (customer location)
        pickup_address: deliveryInfo?.address,
        pickup_city: deliveryInfo?.city,
        pickup_state: deliveryInfo?.state,
        pickup_zip: deliveryInfo?.zip,
      });
    }
  } else if (shipmentType === 'EXPORT') {
    // Order 1: Empty Pickup (terminal → customer)
    await supabase.from('orders').insert({
      order_number: orderNumber(),
      shipment_id: shipmentId,
      container_id: containerId,
      type: 'EXPORT',
      move_type_v2: 'EMPTY_PICKUP',
      trip_execution_type: 'DROP',
      sequence_number: 1,
      status: 'PENDING',
      billing_status: 'UNBILLED',
      delivery_address: deliveryInfo?.address,
      delivery_city: deliveryInfo?.city,
      delivery_state: deliveryInfo?.state,
      delivery_zip: deliveryInfo?.zip,
    });

    // Order 2: Export Pickup (customer → terminal)
    await supabase.from('orders').insert({
      order_number: orderNumber(),
      shipment_id: shipmentId,
      container_id: containerId,
      type: 'EXPORT',
      move_type_v2: 'EXPORT_PICKUP',
      trip_execution_type: tripExecutionType,
      sequence_number: 2,
      status: 'PENDING',
      billing_status: 'UNBILLED',
      pickup_address: deliveryInfo?.address,
      pickup_city: deliveryInfo?.city,
      pickup_state: deliveryInfo?.state,
      pickup_zip: deliveryInfo?.zip,
    });
  }
}

// Get orders for dispatch board (order-centric view)
export async function getOrdersForDispatch(): Promise<OrderV2[]> {
  const { data, error } = await supabase
    .from('orders')
    .select(`
      *,
      container:containers(*),
      shipment:shipments(*),
      driver:drivers(*)
    `)
    .in('status', ['PENDING', 'READY', 'DISPATCHED', 'IN_PROGRESS'])
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching orders for dispatch:', error);
    return [];
  }

  return data || [];
}

// Get all orders for a shipment
export async function getOrdersForShipment(shipmentId: string): Promise<OrderV2[]> {
  const { data, error } = await supabase
    .from('orders')
    .select(`
      *,
      container:containers(*),
      driver:drivers(*)
    `)
    .eq('shipment_id', shipmentId)
    .is('deleted_at', null)
    .order('sequence_number');

  if (error) {
    console.error('Error fetching orders:', error);
    return [];
  }

  return data || [];
}

// Get orders for a container
export async function getOrdersForContainer(containerId: string): Promise<OrderV2[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('container_id', containerId)
    .is('deleted_at', null)
    .order('sequence_number');

  if (error) {
    console.error('Error fetching orders:', error);
    return [];
  }

  return data || [];
}

// Update order status
export async function updateOrderStatus(
  orderId: string,
  newStatus: OrderStatus,
  timestamps?: {
    dispatched_at?: string;
    picked_up_at?: string;
    delivered_at?: string;
    completed_at?: string;
  }
): Promise<boolean> {
  const updates: any = {
    status: newStatus,
    updated_at: new Date().toISOString(),
    ...timestamps
  };

  const { error } = await supabase
    .from('orders')
    .update(updates)
    .eq('id', orderId);

  if (error) {
    console.error('Error updating order status:', error);
    return false;
  }

  // Log activity
  await supabase.from('order_activity_log').insert({
    order_id: orderId,
    action: 'STATUS_CHANGE',
    to_value: newStatus,
    performed_by: 'SYSTEM',
    performer_type: 'SYSTEM',
  });

  return true;
}

// Assign order to driver
export async function assignOrderToDriver(
  orderId: string,
  driverId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('orders')
    .update({
      assigned_driver_id: driverId,
      status: 'DISPATCHED',
      dispatched_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId);

  if (error) {
    console.error('Error assigning order to driver:', error);
    return false;
  }

  return true;
}

// Dispatch order (create trip and assign)
export async function dispatchOrder(
  orderId: string,
  driverId: string,
  tractorId?: string,
  chassisNumber?: string,
  chassisPool?: string
): Promise<Trip | null> {
  // Get order details
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('*, container:containers(*), shipment:shipments(*)')
    .eq('id', orderId)
    .single();

  if (orderError || !order) {
    console.error('Error fetching order:', orderError);
    return null;
  }

  // Create trip
  const tripNumber = `TRP-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
  const { data: trip, error: tripError } = await supabase
    .from('trips')
    .insert({
      trip_number: tripNumber,
      type: order.trip_execution_type || 'LIVE_UNLOAD',
      status: 'DISPATCHED',
      driver_id: driverId,
      tractor_id: tractorId || null,
      chassis_number: chassisNumber || null,
      primary_order_id: orderId,
      shipment_id: order.shipment_id,
      container_id: order.container_id,
    })
    .select()
    .single();

  if (tripError || !trip) {
    console.error('Error creating trip:', tripError);
    return null;
  }

  // Update order
  await supabase.from('orders').update({
    assigned_driver_id: driverId,
    assigned_trip_id: trip.id,
    status: 'DISPATCHED',
    dispatched_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', orderId);

  // Create trip-order link
  await supabase.from('trip_orders').insert({
    trip_id: trip.id,
    order_id: orderId,
    sequence: 1,
    status: 'PENDING',
  });

  return trip;
}

// Update container lifecycle status
export async function updateContainerLifecycle(
  containerId: string,
  status: ContainerLifecycleStatus
): Promise<boolean> {
  const { error } = await supabase
    .from('containers')
    .update({
      lifecycle_status: status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', containerId);

  return !error;
}

// Get shipment with full details (containers + orders)
export async function getShipmentWithDetails(shipmentId: string): Promise<Shipment | null> {
  const { data, error } = await supabase
    .from('shipments')
    .select(`
      *,
      containers(
        *,
        orders:orders(*)
      )
    `)
    .eq('id', shipmentId)
    .single();

  if (error) {
    console.error('Error fetching shipment:', error);
    return null;
  }

  return data;
}

// ============================================================================
// WORKFLOW AUTOMATION FUNCTIONS
// ============================================================================

// Check and auto-advance loads to READY status
export async function checkAndAutoReadyLoads(): Promise<{ updated: number; errors: string[] }> {
  const errors: string[] = [];
  let updated = 0;

  try {
    // Find PENDING orders where container is ready (customs released, available at terminal)
    const { data: pendingOrders, error: fetchError } = await supabase
      .from('orders')
      .select(`
        id,
        order_number,
        status,
        container_id,
        container:containers(
          customs_status,
          terminal_available_date,
          lifecycle_status
        ),
        shipment:shipments(
          last_free_day
        )
      `)
      .eq('status', 'PENDING')
      .is('deleted_at', null);

    if (fetchError) {
      errors.push(`Fetch error: ${fetchError.message}`);
      return { updated, errors };
    }

    const today = new Date().toISOString().split('T')[0];

    for (const order of pendingOrders || []) {
      const container = order.container as any;

      // Check if ready: customs released AND (available at terminal OR terminal date passed)
      const customsReleased = container?.customs_status === 'RELEASED';
      const terminalAvailable = container?.terminal_available_date
        ? container.terminal_available_date <= today
        : false;

      if (customsReleased && terminalAvailable) {
        const { error: updateError } = await supabase
          .from('orders')
          .update({
            status: 'READY',
            updated_at: new Date().toISOString()
          })
          .eq('id', order.id);

        if (updateError) {
          errors.push(`Failed to update ${order.order_number}: ${updateError.message}`);
        } else {
          updated++;

          // Update container lifecycle to AVAILABLE
          if (container?.lifecycle_status === 'BOOKED') {
            await supabase
              .from('containers')
              .update({ lifecycle_status: 'AVAILABLE' })
              .eq('id', order.container_id);
          }
        }
      }
    }
  } catch (err: any) {
    errors.push(`Exception: ${err.message}`);
  }

  return { updated, errors };
}

// Manual status change for orders (workflow automation)
export async function updateOrderWorkflowStatus(
  orderId: string,
  newStatus: OrderStatus,
  notes?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const timestamps: any = { updated_at: new Date().toISOString() };

    // Add relevant timestamp based on status
    switch (newStatus) {
      case 'DISPATCHED':
        timestamps.dispatched_at = new Date().toISOString();
        break;
      case 'IN_PROGRESS':
        timestamps.picked_up_at = new Date().toISOString();
        break;
      case 'DELIVERED':
        timestamps.delivered_at = new Date().toISOString();
        break;
      case 'COMPLETED':
        timestamps.completed_at = new Date().toISOString();
        break;
    }

    const { error } = await supabase
      .from('orders')
      .update({ status: newStatus, ...timestamps })
      .eq('id', orderId);

    if (error) {
      return { success: false, error: error.message };
    }

    // Log the activity
    await supabase.from('order_activity_log').insert({
      order_id: orderId,
      action: 'STATUS_CHANGE',
      to_value: newStatus,
      details: notes,
      performed_by: 'DISPATCHER',
      performer_type: 'USER',
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// Get available status transitions for a load
export function getAvailableStatusTransitions(currentStatus: OrderStatus): OrderStatus[] {
  const transitions: Record<OrderStatus, OrderStatus[]> = {
    'PENDING': ['READY', 'HOLD', 'CANCELLED'],
    'READY': ['DISPATCHED', 'PENDING', 'HOLD', 'CANCELLED'],
    'DISPATCHED': ['IN_PROGRESS', 'READY', 'HOLD'],
    'IN_PROGRESS': ['DELIVERED', 'DISPATCHED', 'HOLD'],
    'DELIVERED': ['COMPLETED', 'IN_PROGRESS'],
    'COMPLETED': [],
    'HOLD': ['PENDING', 'READY', 'CANCELLED'],
    'CANCELLED': [],
    'FAILED': ['PENDING'],
  };

  return transitions[currentStatus] || [];
}
