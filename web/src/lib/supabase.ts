import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ============ TYPES ============

export interface Container {
  id: string;
  shipment_id: string;
  container_number: string;
  size: string;
  type: string;
  weight: number;
  seal_number: string;
  is_hazmat: boolean;
  hazmat_class: string;
  hazmat_un: string;
  is_overweight: boolean;
  is_reefer: boolean;
  reefer_temp: number;
  customs_status: string;
  state: string;
  terminal_available_date: string;
}

export interface Shipment {
  id: string;
  reference_number: string;
  type: 'IMPORT' | 'EXPORT';
  status: string;
  customer_name: string;
  steamship_line: string;
  booking_number: string;
  bill_of_lading: string;
  vessel: string;
  voyage: string;
  terminal_name: string;
  last_free_day: string;
  port_cutoff: string;
  earliest_return_date: string;
  pickup_address: string;
  pickup_city: string;
  pickup_state: string;
  pickup_zip: string;
  delivery_address: string;
  delivery_city: string;
  delivery_state: string;
  delivery_zip: string;
  delivery_appointment_required: boolean;
  trip_type: string;
  chassis_required: boolean;
  chassis_pool: string;
  chassis_size: string;
  special_instructions: string;
  created_at: string;
  updated_at: string;
  containers?: Container[];
}

export interface Driver {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  license_number: string;
  license_state: string;
  license_expiry: string;
  twic_number: string;
  twic_expiry: string;
  hazmat_endorsement: boolean;
  hazmat_expiry: string;
  status: string;
  home_terminal: string;
  hire_date: string;
  pay_rate: number;
  pay_type: string;
  notes: string;
  is_active: boolean;
  created_at: string;
}

export interface Tractor {
  id: string;
  unit_number: string;
  vin: string;
  make: string;
  model: string;
  year: number;
  license_plate: string;
  license_state: string;
  status: string;
  current_driver_id: string;
  current_location: string;
  last_service_date: string;
  next_service_date: string;
  fuel_type: string;
  notes: string;
  is_active: boolean;
}

export interface Chassis {
  id: string;
  chassis_number: string;
  pool: string;
  size: string;
  type: string;
  status: string;
  current_location: string;
  last_inspection_date: string;
  notes: string;
  is_active: boolean;
}

export interface Order {
  id: string;
  order_number: string;
  shipment_id: string;
  container_id: string;
  container_number: string;
  type: string;
  status: string;
  pickup_location: string;
  pickup_address: string;
  pickup_city: string;
  pickup_state: string;
  pickup_appointment: string;
  delivery_location: string;
  delivery_address: string;
  delivery_city: string;
  delivery_state: string;
  delivery_appointment: string;
  special_instructions: string;
  billing_status: string;
  rate: number;
  fuel_surcharge: number;
  accessorials: number;
  total_amount: number;
  created_at: string;
}

export interface Trip {
  id: string;
  trip_number: string;
  type: string;
  status: string;
  order_id: string;
  driver_id: string;
  tractor_id: string;
  chassis_id: string;
  container_number: string;
  planned_start: string;
  actual_start: string;
  planned_end: string;
  actual_end: string;
  pickup_location: string;
  pickup_arrival: string;
  pickup_departure: string;
  delivery_location: string;
  delivery_arrival: string;
  delivery_departure: string;
  estimated_miles: number;
  actual_miles: number;
  notes: string;
  driver?: Driver;
  tractor?: Tractor;
  chassis?: Chassis;
chassis_number: string;
  order?: Order;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  customer_name: string;
  customer_id: string;
  status: string;
  invoice_date: string;
  due_date: string;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total_amount: number;
  amount_paid: number;
  balance_due: number;
  notes: string;
  items?: InvoiceItem[];
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  order_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
}

export interface TripLeg {
  id: string;
  trip_id: string;
  leg_number: number;
  leg_type: string;
  status: string;
  driver_id: string;
  tractor_id: string;
  chassis_id: string;
  pickup_location: string;
  delivery_location: string;
  notes: string;
  driver?: Driver;
  tractor?: Tractor;
  chassis?: Chassis;
}

// ============ SHIPMENTS ============

export async function getShipments() {
  const { data, error } = await supabase
    .from('shipments')
    .select('*, containers (*)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function getShipment(id: string) {
  const { data, error } = await supabase
    .from('shipments')
    .select('*, containers (*)')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

export async function createShipment(shipment: any, containers: any[]) {
  const refNumber = `SHP-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
  const { data: shipmentData, error: shipmentError } = await supabase
    .from('shipments')
    .insert({ ...shipment, reference_number: refNumber })
    .select()
    .single();
  if (shipmentError) throw shipmentError;
  if (containers.length > 0) {
    const containersWithShipmentId = containers.map(c => ({ ...c, shipment_id: shipmentData.id }));
    const { error: containerError } = await supabase.from('containers').insert(containersWithShipmentId);
    if (containerError) throw containerError;
  }
  return shipmentData;
}

export async function updateShipment(id: string, shipment: Partial<Shipment>) {
  const { data, error } = await supabase
    .from('shipments')
    .update({ ...shipment, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteShipment(id: string) {
  const { error } = await supabase.from('shipments').delete().eq('id', id);
  if (error) throw error;
  return true;
}

export async function updateShipmentStatus(id: string, status: string) {
  return updateShipment(id, { status } as Partial<Shipment>);
}

// ============ CONTAINERS ============

export async function addContainer(container: Partial<Container>) {
  const { data, error } = await supabase.from('containers').insert(container).select().single();
  if (error) throw error;
  return data;
}

export async function updateContainer(id: string, container: Partial<Container>) {
  const { data, error } = await supabase.from('containers').update(container).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteContainer(id: string) {
  const { error } = await supabase.from('containers').delete().eq('id', id);
  if (error) throw error;
  return true;
}

// ============ DRIVERS ============

export async function getDrivers() {
  const { data, error } = await supabase.from('drivers').select('*').order('last_name', { ascending: true });
  if (error) throw error;
  return data;
}

export async function createDriver(driver: Partial<Driver>) {
  const { data, error } = await supabase.from('drivers').insert(driver).select().single();
  if (error) throw error;
  return data;
}

export async function updateDriver(id: string, driver: Partial<Driver>) {
  const { data, error } = await supabase.from('drivers').update(driver).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteDriver(id: string) {
  const { error } = await supabase.from('drivers').delete().eq('id', id);
  if (error) throw error;
  return true;
}

export async function updateDriverStatus(id: string, status: string) {
  return updateDriver(id, { status });
}


// ============ TRACTORS ============

export async function getTractors() {
  const { data, error } = await supabase.from('tractors').select('*').order('unit_number', { ascending: true });
  if (error) throw error;
  return data;
}

export async function createTractor(tractor: Partial<Tractor>) {
  const { data, error } = await supabase.from('tractors').insert(tractor).select().single();
  if (error) throw error;
  return data;
}

export async function updateTractor(id: string, tractor: Partial<Tractor>) {
  const { data, error } = await supabase.from('tractors').update(tractor).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteTractor(id: string) {
  const { error } = await supabase.from('tractors').delete().eq('id', id);
  if (error) throw error;
  return true;
}

// ============ CHASSIS ============

export async function getAllChassis() {
  const { data, error } = await supabase.from('chassis').select('*').order('chassis_number', { ascending: true });
  if (error) throw error;
  return data;
}

export async function createChassis(chassis: Partial<Chassis>) {
  const { data, error } = await supabase.from('chassis').insert(chassis).select().single();
  if (error) throw error;
  return data;
}

export async function updateChassis(id: string, chassis: Partial<Chassis>) {
  const { data, error } = await supabase.from('chassis').update(chassis).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteChassis(id: string) {
  const { error } = await supabase.from('chassis').delete().eq('id', id);
  if (error) throw error;
  return true;
}

// ============ ORDERS ============

export async function getOrders() {
  const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function createOrder(order: Partial<Order>) {
  const orderNumber = `ORD-${String(Date.now()).slice(-6)}`;
  const { data, error } = await supabase.from('orders').insert({ ...order, order_number: orderNumber }).select().single();
  if (error) throw error;
  return data;
}

export async function updateOrder(id: string, order: Partial<Order>) {
  const { data, error } = await supabase.from('orders').update(order).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteOrder(id: string) {
  const { error } = await supabase.from('orders').delete().eq('id', id);
  if (error) throw error;
  return true;
}

// ============ TRIPS ============

export async function getTrips() {
  const { data, error } = await supabase
    .from('trips')
    .select('*, driver:drivers(*), tractor:tractors(*), chassis:chassis(*), order:orders(*)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function createTrip(trip: Partial<Trip>) {
  const tripNumber = `TRP-${String(Date.now()).slice(-6)}`;
  const { data, error } = await supabase.from('trips').insert({ ...trip, trip_number: tripNumber }).select().single();
  if (error) throw error;
  return data;
}

export async function updateTrip(id: string, trip: Partial<Trip>) {
  const { data, error } = await supabase.from('trips').update(trip).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function updateTripStatus(id: string, status: string) {
  return updateTrip(id, { status });
}

export async function deleteTrip(id: string) {
  const { error } = await supabase.from('trips').delete().eq('id', id);
  if (error) throw error;
  return true;
}

export async function createMultiLegTrip(tripData: any, legs: Partial<TripLeg>[]) {
  const tripNumber = `TRP-${String(Date.now()).slice(-6)}`;
  const { data: trip, error: tripError } = await supabase
    .from('trips')
    .insert({ ...tripData, trip_number: tripNumber, is_multi_leg: legs.length > 1, total_legs: legs.length, current_leg: 1 })
    .select()
    .single();
  if (tripError) throw tripError;
  if (legs.length > 0) {
    const legsWithTripId = legs.map((leg, index) => ({ ...leg, trip_id: trip.id, leg_number: index + 1 }));
    const { error: legsError } = await supabase.from('trip_legs').insert(legsWithTripId);
    if (legsError) throw legsError;
  }
  return trip;
}

// ============ INVOICES ============

export async function getInvoices() {
  const { data, error } = await supabase.from('invoices').select('*, items:invoice_items(*)').order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function createInvoice(invoice: Partial<Invoice>, items: Partial<InvoiceItem>[]) {
  const invoiceNumber = `INV-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
  const { data: invoiceData, error: invoiceError } = await supabase.from('invoices').insert({ ...invoice, invoice_number: invoiceNumber }).select().single();
  if (invoiceError) throw invoiceError;
  if (items.length > 0) {
    const itemsWithInvoiceId = items.map(item => ({ ...item, invoice_id: invoiceData.id }));
    const { error: itemsError } = await supabase.from('invoice_items').insert(itemsWithInvoiceId);
    if (itemsError) throw itemsError;
  }
  return invoiceData;
}

export async function updateInvoice(id: string, invoice: Partial<Invoice>) {
  const { data, error } = await supabase.from('invoices').update(invoice).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteInvoice(id: string) {
  const { error } = await supabase.from('invoices').delete().eq('id', id);
  if (error) throw error;
  return true;
}

// ============ DASHBOARD STATS ============

export async function getDashboardStats() {
  const [shipments, orders, drivers, tractors] = await Promise.all([
    supabase.from('shipments').select('status, type'),
    supabase.from('orders').select('status, billing_status, total_amount'),
    supabase.from('drivers').select('status'),
    supabase.from('tractors').select('status'),
  ]);
  return {
    shipments: shipments.data || [],
    orders: orders.data || [],
    drivers: drivers.data || [],
    tractors: tractors.data || [],
  };
}