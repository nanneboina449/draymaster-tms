// ============================================================================
// DRAYMASTER TMS - TypeScript Types v2.0
// ============================================================================

// ============================================================================
// ENUMS & CONSTANTS
// ============================================================================

export type OrderType = 'IMPORT' | 'EXPORT';

export type MoveType = 'LIVE' | 'DROP' | 'PREPULL' | 'STREET_TURN' | 'RETURN_EMPTY';

export type ContainerSize = '20' | '40' | '40HC' | '45';

export type ContainerType = 'DRY' | 'REEFER' | 'FLAT' | 'OPEN_TOP' | 'TANK';

export type TerminalStatus = 
  | 'ON_VESSEL' 
  | 'DISCHARGED' 
  | 'AVAILABLE' 
  | 'PICKED_UP' 
  | 'RETURNED';

export type LoadStatus = 
  | 'TRACKING'
  | 'AVAILABLE'
  | 'HOLD'
  | 'APPOINTMENT_NEEDED'
  | 'READY_FOR_DISPATCH'
  | 'DISPATCHED'
  | 'IN_YARD'
  | 'IN_TRANSIT'
  | 'AT_PICKUP'
  | 'AT_DELIVERY'
  | 'RETURNING'
  | 'COMPLETED'
  | 'INVOICED'
  | 'CANCELLED';

export type TripStatus = 
  | 'PLANNED'
  | 'DISPATCHED'
  | 'EN_ROUTE'
  | 'AT_PICKUP'
  | 'LOADED'
  | 'AT_DELIVERY'
  | 'DELIVERED'
  | 'RETURNING'
  | 'COMPLETED';

export type LegStatus = 'PENDING' | 'EN_ROUTE' | 'ARRIVED' | 'COMPLETED' | 'SKIPPED';

export type LegType = 'PICKUP' | 'DELIVERY' | 'RETURN_EMPTY' | 'YARD_DROP' | 'YARD_PICKUP';

export type LocationType = 'TERMINAL' | 'WAREHOUSE' | 'DEPOT' | 'YARD' | 'RAIL';

export type ChargeType = 
  | 'LINE_HAUL'
  | 'FUEL_SURCHARGE'
  | 'PREPULL'
  | 'DETENTION'
  | 'STORAGE'
  | 'CHASSIS_SPLIT'
  | 'CHASSIS_RENTAL'
  | 'DEMURRAGE'
  | 'GATE_FEE'
  | 'HAZMAT'
  | 'OVERWEIGHT'
  | 'TRIAXLE'
  | 'WAITING_TIME'
  | 'STOP_OFF'
  | 'OTHER';

export type PaymentTerms = 'NET_30' | 'NET_15' | 'NET_7' | 'COD' | 'PREPAID';

export type Responsibility = 'CUSTOMER' | 'CARRIER' | 'PREPAID' | 'SPLIT';

export type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type NotificationChannel = 'DASHBOARD' | 'EMAIL' | 'SMS';

export type StreetTurnStatus = 'POTENTIAL' | 'APPROVED' | 'LINKED' | 'COMPLETED' | 'REJECTED';

// Shipping lines
export type ShippingLine = 
  | 'MAERSK' | 'MSC' | 'CMA_CGM' | 'COSCO' | 'EVERGREEN' 
  | 'ONE' | 'HAPAG' | 'YANG_MING' | 'HMM' | 'ZIM' | 'OTHER';

// Terminals
export type Terminal = 
  | 'APM_LA' | 'PIER_400' | 'TRAPAC' | 'YTI' | 'PCT' 
  | 'LBCT' | 'ITS' | 'SSA_A' | 'WBCT' | 'OTHER';

// Chassis pools
export type ChassisPool = 'DCLI' | 'TRAC' | 'FLEXI' | 'DIRECT' | 'OTHER';

// ============================================================================
// CUSTOMER TYPES
// ============================================================================

export interface CustomerBillingSettings {
  id: string;
  customer_id: string;
  payment_terms: PaymentTerms;
  payment_terms_days: number;
  auto_invoice: boolean;
  invoice_consolidation: 'DAILY' | 'WEEKLY' | 'PER_LOAD';
  gate_fee_responsibility: Responsibility;
  demurrage_responsibility: Responsibility;
  detention_responsibility: Responsibility;
  default_move_type: 'LIVE' | 'DROP';
  prepull_authorization: 'AUTO' | 'REQUIRES_APPROVAL';
  yard_storage_free_days: number;
  appointment_lead_time_hours: number;
}

export interface CustomerChassisPreferences {
  id: string;
  customer_id: string;
  primary_pool: ChassisPool;
  secondary_pool?: ChassisPool;
  allow_flexivan: boolean;
  allow_direct_chassis: boolean;
}

export interface CustomerNotificationPreferences {
  id: string;
  customer_id: string;
  email_on_available: boolean;
  email_on_lfd_warning: boolean;
  email_on_dispatched: boolean;
  email_on_delivered: boolean;
  email_on_invoice: boolean;
  email_on_hold_detected: boolean;
  sms_enabled: boolean;
  sms_phone?: string;
}

export interface CustomerFull extends Customer {
  billing_settings?: CustomerBillingSettings;
  chassis_preferences?: CustomerChassisPreferences;
  notification_preferences?: CustomerNotificationPreferences;
  rate_agreements?: RateAgreement[];
}

// ============================================================================
// RATE TYPES
// ============================================================================

export interface RateAgreement {
  id: string;
  customer_id: string;
  agreement_name: string;
  rate_type: 'PER_LANE' | 'PER_LOAD' | 'SPOT';
  effective_date: string;
  expiry_date?: string;
  fuel_surcharge_pct: number;
  is_active: boolean;
  notes?: string;
  lane_rates?: LaneRate[];
  accessorial_rates?: AccessorialRate[];
}

export interface LaneRate {
  id: string;
  rate_agreement_id: string;
  origin_terminal: string;
  origin_type: 'TERMINAL' | 'RAIL' | 'DEPOT';
  destination_city: string;
  destination_state: string;
  destination_zip_start?: string;
  destination_zip_end?: string;
  rate_20: number;
  rate_40: number;
  rate_40hc: number;
  rate_45: number;
  is_round_trip: boolean;
  notes?: string;
}

export interface AccessorialRate {
  id: string;
  rate_agreement_id: string;
  charge_type: ChargeType;
  description: string;
  rate_amount: number;
  rate_unit: 'FLAT' | 'PER_HOUR' | 'PER_DAY' | 'PER_MILE';
  free_time_value?: number;
  free_time_unit?: 'HOURS' | 'DAYS';
}

// ============================================================================
// ORDER TYPES
// ============================================================================

export interface Order {
  id: string;
  order_number: string;
  order_type: OrderType;
  customer_id: string;
  
  // Document source
  source_type?: 'EMAIL' | 'UPLOAD' | 'MANUAL' | 'EDI';
  source_document_url?: string;
  parsed_data?: Record<string, any>;
  
  // Import fields
  bill_of_lading?: string;
  master_bol?: string;
  
  // Export fields
  booking_number?: string;
  
  // Common fields
  shipping_line?: ShippingLine;
  vessel_name?: string;
  voyage_number?: string;
  
  // Terminal info
  port?: string;
  terminal?: Terminal;
  
  // Dates
  eta_date?: string;
  cutoff_date?: string;
  
  // Delivery/Pickup location
  location_name: string;
  location_address: string;
  location_city: string;
  location_state: string;
  location_zip: string;
  location_contact_name?: string;
  location_contact_phone?: string;
  location_contact_email?: string;
  appointment_required: boolean;
  dock_hours?: string;
  special_instructions?: string;
  
  // Status
  status: 'RECEIVED' | 'PROCESSING' | 'READY' | 'DISPATCHED' | 'COMPLETED' | 'CANCELLED';
  
  // Audit
  created_by?: string;
  created_at: string;
  updated_at: string;
  
  // Relations
  customer?: Customer;
  loads?: Load[];
}

// ============================================================================
// LOAD TYPES
// ============================================================================

export interface Load {
  id: string;
  load_number: string;
  order_id?: string;
  customer_id: string;
  
  // Container info
  container_number?: string;
  container_size?: ContainerSize;
  container_type: ContainerType;
  weight_lbs?: number;
  seal_number?: string;
  is_hazmat: boolean;
  hazmat_class?: string;
  is_overweight: boolean;
  requires_triaxle: boolean;
  
  // Move type
  move_type: MoveType;
  
  // Terminal status (from eModal)
  terminal?: string;
  terminal_status: TerminalStatus;
  vessel_eta?: string;
  actual_discharge?: string;
  available_date?: string;
  last_free_day?: string;
  demurrage_start_date?: string;
  empty_return_location?: string;
  
  // Holds
  hold_customs: boolean;
  hold_freight: boolean;
  hold_usda: boolean;
  hold_tmf: boolean;
  hold_other: boolean;
  hold_details?: string;
  
  // Appointments
  terminal_appointment_date?: string;
  terminal_appointment_time?: string;
  terminal_appointment_number?: string;
  gate_fee_paid: boolean;
  gate_fee_amount?: number;
  gate_fee_paid_by?: 'CARRIER' | 'CUSTOMER';
  delivery_appointment_date?: string;
  delivery_appointment_time?: string;
  
  // Yard info
  in_yard: boolean;
  yard_location?: string;
  yard_in_date?: string;
  yard_out_date?: string;
  on_chassis: boolean;
  
  // Status
  status: LoadStatus;
  
  // Billing
  total_charges: number;
  invoice_id?: string;
  
  // Street turn
  street_turn_id?: string;
  linked_export_load_id?: string;
  
  // Audit
  last_emodal_sync?: string;
  created_at: string;
  updated_at: string;
  
  // Relations
  customer?: Customer;
  order?: Order;
  charges?: LoadCharge[];
  notes?: LoadNote[];
  activity_log?: LoadActivityLog[];
  alerts?: LoadAlert[];
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
  billable_to: 'CUSTOMER' | 'CARRIER';
  auto_calculated: boolean;
  created_at: string;
}

export interface LoadNote {
  id: string;
  load_id: string;
  author_id?: string;
  author_name: string;
  author_type: 'INTERNAL' | 'CUSTOMER' | 'DRIVER' | 'SYSTEM';
  message: string;
  visible_to_customer: boolean;
  created_at: string;
}

export interface LoadActivityLog {
  id: string;
  load_id: string;
  action: string;
  from_value?: string;
  to_value?: string;
  performed_by: string;
  performer_type: 'USER' | 'SYSTEM' | 'DRIVER' | 'CUSTOMER';
  details?: string;
  created_at: string;
}

export interface LoadAlert {
  id: string;
  load_id: string;
  alert_type: string;
  severity: Severity;
  message: string;
  acknowledged: boolean;
  acknowledged_by?: string;
  acknowledged_at?: string;
  created_at: string;
}

// ============================================================================
// TRIP TYPES
// ============================================================================

export interface Trip {
  id: string;
  trip_number: string;
  load_id: string;
  
  // Assignment
  driver_id?: string;
  tractor_id?: string;
  chassis_id?: string;
  chassis_number?: string;
  chassis_pool?: ChassisPool;
  chassis_type?: 'STANDARD' | 'TRIAXLE' | 'SLIDER';
  
  // Move type
  move_type: MoveType;
  status: TripStatus;
  
  // Driver pay
  driver_pay_type: 'FLAT' | 'PERCENTAGE' | 'PER_MILE';
  driver_base_pay?: number;
  driver_accessorial_pay: number;
  driver_total_pay?: number;
  
  // Dates
  scheduled_date?: string;
  started_at?: string;
  completed_at?: string;
  
  created_at: string;
  updated_at: string;
  
  // Relations
  load?: Load;
  driver?: Driver;
  tractor?: Equipment;
  legs?: TripLeg[];
  driver_updates?: DriverUpdate[];
}

export interface TripLeg {
  id: string;
  trip_id: string;
  leg_number: number;
  leg_type: LegType;
  
  // Location
  location_type: LocationType;
  location_name: string;
  location_address?: string;
  location_city?: string;
  location_state?: string;
  location_zip?: string;
  location_lat?: number;
  location_lng?: number;
  
  // Schedule
  scheduled_time?: string;
  actual_arrival?: string;
  actual_departure?: string;
  
  // Status
  status: LegStatus;
  
  // Additional info
  waiting_time_minutes: number;
  detention_charged: boolean;
  notes?: string;
  
  // POD
  pod_captured: boolean;
  pod_signature?: string;
  pod_signer_name?: string;
  pod_photos?: string[];
  
  created_at: string;
  updated_at: string;
}

export interface DriverUpdate {
  id: string;
  trip_id: string;
  trip_leg_id?: string;
  driver_id: string;
  
  update_type: 'STATUS_CHANGE' | 'LOCATION' | 'PHOTO' | 'NOTE' | 'ISSUE';
  status?: string;
  
  // Location
  location_lat?: number;
  location_lng?: number;
  location_address?: string;
  
  // Verification
  container_verified?: string;
  chassis_number_entered?: string;
  seal_verified?: string;
  
  photos?: string[];
  notes?: string;
  
  created_at: string;
}

// ============================================================================
// STREET TURN TYPES
// ============================================================================

export interface StreetTurn {
  id: string;
  street_turn_number: string;
  status: StreetTurnStatus;
  
  // Import side
  import_load_id?: string;
  import_container?: string;
  import_shipping_line?: ShippingLine;
  import_delivery_location?: string;
  import_empty_available_date?: string;
  import_customer_id?: string;
  
  // Export side
  export_load_id?: string;
  export_booking_number?: string;
  export_shipping_line?: ShippingLine;
  export_pickup_location?: string;
  export_cutoff_date?: string;
  export_customer_id?: string;
  
  // Match scoring
  match_score: number;
  same_ssl: boolean;
  same_size: boolean;
  location_distance_miles?: number;
  timing_compatible: boolean;
  chassis_compatible: boolean;
  
  // Savings
  estimated_savings?: number;
  
  // Approval
  approved_by?: string;
  approved_at?: string;
  rejection_reason?: string;
  
  created_at: string;
  updated_at: string;
  
  // Relations
  import_load?: Load;
  export_load?: Load;
  import_customer?: Customer;
  export_customer?: Customer;
}

// ============================================================================
// YARD TYPES
// ============================================================================

export interface YardLocation {
  id: string;
  yard_name: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  capacity: number;
  is_active: boolean;
  created_at: string;
}

export interface YardInventory {
  id: string;
  yard_location_id: string;
  load_id?: string;
  container_number: string;
  
  // Position
  row_number?: string;
  bay_number?: string;
  slot_number?: string;
  
  // Status
  on_chassis: boolean;
  chassis_number?: string;
  chassis_pool?: ChassisPool;
  
  // Dates
  in_date: string;
  out_date?: string;
  expected_out_date?: string;
  
  // Charges
  storage_rate_per_day: number;
  storage_free_days: number;
  
  status: 'IN_YARD' | 'SCHEDULED_OUT' | 'OUT';
  notes?: string;
  
  created_at: string;
  updated_at: string;
  
  // Relations
  yard_location?: YardLocation;
  load?: Load;
}

// ============================================================================
// NOTIFICATION TYPES
// ============================================================================

export interface NotificationRule {
  id: string;
  rule_name: string;
  rule_code: string;
  trigger_type: 'SCHEDULE' | 'EVENT' | 'CONDITION';
  trigger_config?: Record<string, any>;
  
  notify_dispatcher: boolean;
  notify_customer: boolean;
  notify_driver: boolean;
  
  channel_dashboard: boolean;
  channel_email: boolean;
  channel_sms: boolean;
  
  message_template: string;
  severity: Severity;
  is_active: boolean;
  
  created_at: string;
}

export interface Notification {
  id: string;
  rule_id?: string;
  
  target_type: 'LOAD' | 'ORDER' | 'TRIP' | 'CUSTOMER';
  target_id: string;
  
  recipient_type: 'DISPATCHER' | 'CUSTOMER' | 'DRIVER';
  recipient_id?: string;
  recipient_email?: string;
  
  title: string;
  message: string;
  severity: Severity;
  
  channel: NotificationChannel;
  status: 'PENDING' | 'SENT' | 'READ' | 'FAILED';
  sent_at?: string;
  read_at?: string;
  
  action_url?: string;
  action_label?: string;
  
  created_at: string;
}

// ============================================================================
// DISPATCH BOARD TYPES (Derived/View Types)
// ============================================================================

export interface DispatchBoardItem {
  id: string;
  load_number: string;
  container_number?: string;
  container_size?: ContainerSize;
  status: LoadStatus;
  terminal_status: TerminalStatus;
  terminal?: string;
  last_free_day?: string;
  move_type: MoveType;
  
  // Holds
  hold_customs: boolean;
  hold_freight: boolean;
  hold_usda: boolean;
  hold_tmf: boolean;
  has_holds: boolean;
  
  // Appointments
  terminal_appointment_date?: string;
  terminal_appointment_time?: string;
  delivery_appointment_date?: string;
  delivery_appointment_time?: string;
  
  in_yard: boolean;
  
  // Customer
  customer_name?: string;
  delivery_location?: string;
  delivery_city?: string;
  
  // Trip & Driver
  trip_id?: string;
  trip_status?: TripStatus;
  driver_id?: string;
  driver_name?: string;
  truck_number?: string;
  
  // LFD urgency
  lfd_urgency: 'OVERDUE' | 'TOMORROW' | 'SOON' | 'OK';
  days_until_lfd?: number;
}

export interface StreetTurnOpportunity {
  import_load_id: string;
  import_container?: string;
  import_ssl?: ShippingLine;
  import_size?: ContainerSize;
  import_customer?: string;
  import_delivery_city?: string;
  
  export_load_id: string;
  export_container?: string;
  export_ssl?: ShippingLine;
  export_size?: ContainerSize;
  export_customer?: string;
  export_pickup_city?: string;
  
  match_score: number;
}

// ============================================================================
// KANBAN COLUMN DEFINITIONS
// ============================================================================

export const DISPATCH_COLUMNS: { id: LoadStatus; label: string; color: string }[] = [
  { id: 'TRACKING', label: 'Tracking', color: 'gray' },
  { id: 'AVAILABLE', label: 'Available', color: 'green' },
  { id: 'HOLD', label: 'On Hold', color: 'yellow' },
  { id: 'APPOINTMENT_NEEDED', label: 'Needs Appt', color: 'orange' },
  { id: 'READY_FOR_DISPATCH', label: 'Ready', color: 'blue' },
  { id: 'DISPATCHED', label: 'Dispatched', color: 'indigo' },
  { id: 'IN_TRANSIT', label: 'In Transit', color: 'purple' },
  { id: 'COMPLETED', label: 'Completed', color: 'emerald' },
];

export const LOAD_STATUS_LABELS: Record<LoadStatus, string> = {
  TRACKING: 'Tracking',
  AVAILABLE: 'Available',
  HOLD: 'On Hold',
  APPOINTMENT_NEEDED: 'Needs Appointment',
  READY_FOR_DISPATCH: 'Ready for Dispatch',
  DISPATCHED: 'Dispatched',
  IN_YARD: 'In Yard',
  IN_TRANSIT: 'In Transit',
  AT_PICKUP: 'At Pickup',
  AT_DELIVERY: 'At Delivery',
  RETURNING: 'Returning Empty',
  COMPLETED: 'Completed',
  INVOICED: 'Invoiced',
  CANCELLED: 'Cancelled',
};

export const TERMINAL_LABELS: Record<string, string> = {
  APM_LA: 'APM Terminals - LA',
  PIER_400: 'Pier 400',
  TRAPAC: 'TraPac',
  YTI: 'Yusen Terminals',
  PCT: 'Pacific Container Terminal',
  LBCT: 'Long Beach Container Terminal',
  ITS: 'ITS',
  SSA_A: 'SSA Marine',
  WBCT: 'West Basin CT',
};

export const SHIPPING_LINE_LABELS: Record<ShippingLine, string> = {
  MAERSK: 'Maersk',
  MSC: 'MSC',
  CMA_CGM: 'CMA CGM',
  COSCO: 'COSCO',
  EVERGREEN: 'Evergreen',
  ONE: 'ONE',
  HAPAG: 'Hapag-Lloyd',
  YANG_MING: 'Yang Ming',
  HMM: 'HMM',
  ZIM: 'ZIM',
  OTHER: 'Other',
};

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
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Driver {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  license_number?: string;
  license_expiry?: string;
  status: 'ACTIVE' | 'INACTIVE' | 'ON_LEAVE';
  pay_type: 'FLAT' | 'PERCENTAGE' | 'PER_MILE';
  pay_rate?: number;
  created_at: string;
  updated_at: string;
}

export interface Equipment {
  id: string;
  unit_number: string;
  equipment_type: 'TRACTOR' | 'TRAILER' | 'CHASSIS';
  make?: string;
  model?: string;
  year?: number;
  vin?: string;
  license_plate?: string;
  status: 'ACTIVE' | 'MAINTENANCE' | 'OUT_OF_SERVICE';
  created_at: string;
  updated_at: string;
}
