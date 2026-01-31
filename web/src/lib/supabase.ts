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
  phone?: string;
  email?: string;
  license_number?: string;
  license_expiry?: string;
  hazmat_endorsement?: boolean;
  twic_card?: boolean;
  status: string;
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
  created_at?: string;
}

export interface Order {
  id: string;
  order_number: string;
  customer_id?: string;
  type: string;
  status: string;
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
  type?: string;
  status: string;
  order_id?: string;
  load_id?: string;
  driver_id?: string;
  tractor_id?: string;
  chassis_id?: string;
  chassis_number?: string;
  container_number?: string;
  pickup_location?: string;
  delivery_location?: string;
  planned_start?: string;
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
  shipment_id?: string;
  subtotal: number;
  tax: number;
  total: number;
  status: string;
  due_date?: string;
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

export async function createTrip(trip: Partial<Trip>): Promise<Trip | null> {
  const { data, error } = await supabase.from('trips').insert(trip).select().single();
  if (error) { console.error('Error:', error); return null; }
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

// SHIPMENTS
export async function getShipments(): Promise<Shipment[]> {
  const { data, error } = await supabase
    .from('shipments')
    .select(`*, containers(*)`)
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

export async function addContainer(container: any): Promise<Container | null> {
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
    })
    .select()
    .single();
  if (error) { console.error('Error:', error); return null; }
  return data;
}

export async function updateContainer(id: string, updates: any): Promise<Container | null> {
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
  if (error) { console.error('Error:', error); return null; }
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

export async function createInvoice(invoice: Partial<Invoice>): Promise<Invoice | null> {
  const invoiceNumber = `INV-${Date.now().toString().slice(-8)}`;
  const { data, error } = await supabase
    .from('invoices')
    .insert({ ...invoice, invoice_number: invoiceNumber })
    .select()
    .single();
  if (error) { console.error('Error:', error); return null; }
  return data;
}

export async function updateInvoice(id: string, updates: Partial<Invoice>): Promise<boolean> {
  const { error } = await supabase.from('invoices').update(updates).eq('id', id);
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
export type TerminalStatus = 'ON_VESSEL' | 'DISCHARGED' | 'AVAILABLE' | 'PICKED_UP' | 'RETURNED';
export type LoadStatus = 'TRACKING' | 'AVAILABLE' | 'HOLD' | 'APPOINTMENT_NEEDED' | 'READY_FOR_DISPATCH' | 'DISPATCHED' | 'IN_YARD' | 'IN_TRANSIT' | 'AT_PICKUP' | 'AT_DELIVERY' | 'RETURNING' | 'COMPLETED' | 'INVOICED' | 'CANCELLED';
export type ChargeType = 'LINE_HAUL' | 'FUEL_SURCHARGE' | 'PREPULL' | 'DETENTION' | 'STORAGE' | 'CHASSIS_SPLIT' | 'DEMURRAGE' | 'GATE_FEE' | 'HAZMAT' | 'OVERWEIGHT' | 'TRIAXLE' | 'WAITING_TIME' | 'STOP_OFF' | 'OTHER';
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

// Fallback function if view doesn't exist
async function getLoadsForDispatch(): Promise<DispatchBoardItem[]> {
  const { data, error } = await supabase
    .from('loads')
    .select(`
      *,
      customer:customers(company_name),
      order:orders(location_city)
    `)
    .order('last_free_day', { ascending: true, nullsFirst: false });
  
  if (error) { console.error('Error:', error); return []; }
  
  return (data || []).map(load => ({
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
  }));
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
  const { error } = await supabase
    .from('loads')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', loadId);
  if (error) { console.error('Error:', error); return false; }
  
  // Log activity
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
  
  const busyIds = busyDriverIds?.map(t => t.driver_id).filter(Boolean) || [];
  
  let query = supabase.from('drivers').select('*').eq('status', 'ACTIVE');
  if (busyIds.length > 0) {
    query = query.not('id', 'in', `(${busyIds.join(',')})`);
  }
  
  const { data } = await query;
  return data || [];
}
