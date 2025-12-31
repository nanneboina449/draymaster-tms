import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Types
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
  pickup_contact_name: string;
  pickup_contact_phone: string;
  delivery_address: string;
  delivery_city: string;
  delivery_state: string;
  delivery_zip: string;
  delivery_contact_name: string;
  delivery_contact_phone: string;
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

// GET all shipments
export async function getShipments() {
  const { data, error } = await supabase
    .from('shipments')
    .select(`*, containers (*)`)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

// GET single shipment
export async function getShipment(id: string) {
  const { data, error } = await supabase
    .from('shipments')
    .select(`*, containers (*)`)
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

// CREATE shipment
export async function createShipment(shipment: any, containers: any[]) {
  const refNumber = `SHP-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
  
  const { data: shipmentData, error: shipmentError } = await supabase
    .from('shipments')
    .insert({ ...shipment, reference_number: refNumber })
    .select()
    .single();

  if (shipmentError) throw shipmentError;

  if (containers.length > 0) {
    const containersWithShipmentId = containers.map(c => ({
      ...c,
      shipment_id: shipmentData.id,
    }));
    const { error: containerError } = await supabase
      .from('containers')
      .insert(containersWithShipmentId);
    if (containerError) throw containerError;
  }

  return shipmentData;
}

// UPDATE shipment
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

// DELETE shipment
export async function deleteShipment(id: string) {
  const { error } = await supabase
    .from('shipments')
    .delete()
    .eq('id', id);
  if (error) throw error;
  return true;
}

// UPDATE status
export async function updateShipmentStatus(id: string, status: string) {
  return updateShipment(id, { status } as Partial<Shipment>);
}

// Container CRUD
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