// ==============================================================================
// DrayMaster TMS - TypeScript Types (Order-Centric Model)
// ==============================================================================

// ─── Core Enums ──────────────────────────────────────────────────────────────

export type ShipmentType = 'IMPORT' | 'EXPORT';

export type ShipmentStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'IN_PROGRESS'
  | 'DELIVERED'
  | 'COMPLETED'
  | 'CANCELLED';

export type ContainerSize = '20' | '40' | '40HC' | '45';

export type ContainerType =
  | 'DRY'
  | 'HIGH_CUBE'
  | 'REEFER'
  | 'TANK'
  | 'FLAT_RACK'
  | 'OPEN_TOP';

export type CustomsStatus = 'PENDING' | 'HOLD' | 'RELEASED';

// Container lifecycle status (tracks where container is in the process)
export type ContainerLifecycleStatus =
  | 'BOOKED'        // Container on booking, not yet available
  | 'AVAILABLE'     // Available at terminal for pickup
  | 'PICKED_UP'     // Picked up, in transit
  | 'DELIVERED'     // Delivered to customer (loaded)
  | 'DROPPED'       // Dropped at customer location
  | 'EMPTY_PICKED'  // Empty picked up from customer
  | 'RETURNED'      // Empty returned to terminal
  | 'COMPLETED';    // All movements complete

// ─── Order Enums ─────────────────────────────────────────────────────────────

// Order type (what kind of movement)
export type OrderType = 'IMPORT' | 'EXPORT' | 'REPO' | 'EMPTY_RETURN';

// Order move type (more specific classification)
export type OrderMoveType =
  | 'IMPORT_DELIVERY'   // Terminal → Customer (deliver import)
  | 'EXPORT_PICKUP'     // Customer → Terminal (pick up export)
  | 'EMPTY_RETURN'      // Customer → Terminal (return empty)
  | 'EMPTY_PICKUP'      // Terminal → Customer (pick up empty for loading)
  | 'YARD_PULL'         // Terminal → Yard (prepull to company yard)
  | 'YARD_DELIVERY'     // Yard → Customer (deliver from yard)
  | 'REPO';             // Any location → Any location (reposition)

// How the physical movement is executed
export type TripExecutionType =
  | 'LIVE_UNLOAD'     // Driver waits while container is unloaded
  | 'LIVE_LOAD'       // Driver waits while container is loaded
  | 'DROP'            // Drop container, leave
  | 'DROP_AND_HOOK'   // Drop one container, pick up another
  | 'STREET_TURN'     // Import container reused for export
  | 'PREPULL'         // Pull from terminal to yard before delivery
  | 'REPO';           // Reposition container

// Order status
export type OrderStatus =
  | 'PENDING'       // Order created, not ready
  | 'READY'         // Ready for dispatch (customs cleared, appointment set)
  | 'DISPATCHED'    // Assigned to driver/trip
  | 'IN_PROGRESS'   // Driver is working on it
  | 'DELIVERED'     // Delivered (for import) or picked up (for export)
  | 'COMPLETED'     // All done
  | 'HOLD'          // On hold (customs, appointment, etc.)
  | 'CANCELLED'     // Cancelled
  | 'FAILED';       // Failed, needs retry

export type BillingStatus = 'UNBILLED' | 'INVOICED' | 'PAID';

// ─── Trip Enums ──────────────────────────────────────────────────────────────

export type TripType =
  | 'LIVE_LOAD'
  | 'LIVE_UNLOAD'
  | 'DROP_HOOK_SAME'
  | 'DROP_HOOK_DIFF'
  | 'DROP_ONLY'
  | 'STREET_TURN'
  | 'DUAL_TRANSACTION'
  | 'BOBTAIL'
  | 'EMPTY_PICKUP'
  | 'EMPTY_RETURN'
  | 'PRE_PULL'
  | 'TRANSLOAD';

export type TripStatus =
  | 'DRAFT'
  | 'PLANNED'
  | 'ASSIGNED'
  | 'DISPATCHED'
  | 'EN_ROUTE'
  | 'AT_PICKUP'
  | 'LOADED'
  | 'AT_DELIVERY'
  | 'DELIVERED'
  | 'COMPLETED'
  | 'CANCELLED';

export type ChassisPool = 'DCLI' | 'TRAC' | 'FLEXI' | 'COMPANY' | 'OTHER';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface Location {
  id: string;
  name: string;
  type: 'TERMINAL' | 'PORT' | 'WAREHOUSE' | 'CUSTOMER' | 'YARD' | 'RAIL_RAMP';
  address: string;
  city: string;
  state: string;
  zip: string;
  latitude?: number;
  longitude?: number;
  contactName?: string;
  contactPhone?: string;
  appointmentRequired: boolean;
  operatingHours?: string;
}

// Container: Physical shipping container
export interface Container {
  id: string;
  shipmentId: string;
  containerNumber: string;
  size: ContainerSize;
  type: ContainerType;
  weight?: number;
  sealNumber?: string;
  isHazmat: boolean;
  hazmatClass?: string;
  hazmatUN?: string;
  isOverweight: boolean;
  isReefer: boolean;
  reeferTemp?: number;
  customsStatus: CustomsStatus;
  customsHoldReason?: string;
  lifecycleStatus: ContainerLifecycleStatus;
  terminalAvailableDate?: string;
  terminalAppointment?: string;
  // Related data (populated when fetching)
  orders?: Order[];
}

// Shipment: Customer booking (top level entity)
export interface Shipment {
  id: string;
  referenceNumber: string;
  type: ShipmentType;
  status: ShipmentStatus;
  // Customer
  customerId?: string;
  customerName: string;
  // Vessel/Carrier info
  steamshipLine: string;
  bookingNumber?: string;
  billOfLading?: string;
  vessel?: string;
  voyage?: string;
  // Terminal
  terminalId?: string;
  terminalName: string;
  // Dates
  vesselETA?: string;
  lastFreeDay?: string;        // Import: last free day at terminal
  portCutoff?: string;         // Export: cargo cutoff time
  earliestReturnDate?: string; // Export: earliest empty return
  // Related data
  containers: Container[];
  // Delivery info (for simple single-destination shipments)
  deliveryAddress?: string;
  deliveryCity?: string;
  deliveryState?: string;
  deliveryZip?: string;
  deliveryContactName?: string;
  deliveryContactPhone?: string;
  // Additional
  tripType?: TripExecutionType;
  specialInstructions?: string;
  chassisRequired?: boolean;
  chassisPool?: string;
  chassisSize?: string;
  // Timestamps
  createdAt: string;
  updatedAt: string;
}

// Order: Work order for a specific container movement
export interface Order {
  id: string;
  orderNumber: string;
  shipmentId: string;
  containerId: string;
  // Type classification
  type: OrderType;
  moveType?: OrderMoveType;
  tripExecutionType: TripExecutionType;
  // Sequence (for multi-order containers)
  sequenceNumber: number;
  // Status
  status: OrderStatus;
  billingStatus: BillingStatus;
  // Pickup location
  pickupLocationId?: string;
  pickupAddress?: string;
  pickupCity?: string;
  pickupState?: string;
  pickupZip?: string;
  pickupContactName?: string;
  pickupContactPhone?: string;
  pickupAppointment?: string;
  pickupAppointmentRequired?: boolean;
  // Delivery location
  deliveryLocationId?: string;
  deliveryAddress?: string;
  deliveryCity?: string;
  deliveryState?: string;
  deliveryZip?: string;
  deliveryContactName?: string;
  deliveryContactPhone?: string;
  deliveryAppointment?: string;
  deliveryAppointmentRequired?: boolean;
  // Assignment
  assignedDriverId?: string;
  assignedDriverName?: string;
  assignedTripId?: string;
  assignedTripNumber?: string;
  // Timestamps
  dispatchedAt?: string;
  pickedUpAt?: string;
  deliveredAt?: string;
  completedAt?: string;
  // Billing
  baseRate?: number;
  fuelSurcharge?: number;
  totalCharges?: number;
  // Notes
  specialInstructions?: string;
  // Related data (populated when fetching)
  container?: Container;
  shipment?: Shipment;
  createdAt?: string;
  updatedAt?: string;
}

// Trip: Driver assignment (execution of orders)
export interface Trip {
  id: string;
  tripNumber: string;
  type: TripType;
  status: TripStatus;
  // Primary order (for simple single-order trips)
  primaryOrderId?: string;
  // Related orders (for multi-order trips)
  orders?: Order[];
  // Assignment
  driverId?: string;
  driverName?: string;
  tractorId?: string;
  tractorNumber?: string;
  chassisId?: string;
  chassisNumber?: string;
  chassisPool?: ChassisPool;
  // Stops
  stops: TripStop[];
  // Timing
  plannedStartTime?: string;
  actualStartTime?: string;
  plannedEndTime?: string;
  actualEndTime?: string;
  // Distance
  estimatedMiles?: number;
  actualMiles?: number;
  // Special flags
  isStreetTurn: boolean;
  linkedTripId?: string;
  isDualTransaction: boolean;
  // Notes
  notes?: string;
  // Timestamps
  createdAt?: string;
  updatedAt?: string;
}

export interface TripStop {
  id: string;
  sequence: number;
  type: 'PICKUP' | 'DELIVERY' | 'DROP' | 'HOOK' | 'FUEL' | 'SCALE';
  locationId: string;
  locationName: string;
  address: string;
  appointmentTime?: string;
  arrivalTime?: string;
  departureTime?: string;
  status: 'PENDING' | 'EN_ROUTE' | 'ARRIVED' | 'COMPLETED' | 'SKIPPED';
  detentionMinutes?: number;
}

export interface Driver {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  phone: string;
  email?: string;
  licenseNumber: string;
  licenseState: string;
  licenseExpiry: string;
  twicExpiry?: string;
  hazmatEndorsement: boolean;
  hazmatExpiry?: string;
  status: 'AVAILABLE' | 'ON_DUTY' | 'DRIVING' | 'OFF_DUTY' | 'INACTIVE';
  currentTripId?: string;
  homeTerminal?: string;
  hosAvailableMinutes?: number;
}

export interface Chassis {
  id: string;
  chassisNumber: string;
  pool: ChassisPool;
  size: '20' | '40' | '45' | 'COMBO';
  type: 'STANDARD' | 'EXTENDABLE' | 'TRI_AXLE' | 'GOOSENECK';
  status: 'AVAILABLE' | 'IN_USE' | 'MAINTENANCE' | 'OUT_OF_SERVICE';
  currentLocation?: string;
  dailyRate?: number;
}

export interface StreetTurnOpportunity {
  id: string;
  importContainer: Container;
  exportShipment: Shipment;
  importDeliveryLocation: Location;
  exportPickupLocation: Location;
  distanceMiles: number;
  savingsEstimate: number;
  validUntil: string;
  status: 'AVAILABLE' | 'MATCHED' | 'EXPIRED';
}

// ─── Dispatch Board Types ────────────────────────────────────────────────────

// Dispatch board item (order view for dispatch)
export interface DispatchBoardItem {
  orderId: string;
  orderNumber: string;
  orderStatus: OrderStatus;
  moveType: OrderMoveType;
  tripExecutionType: TripExecutionType;
  pickupAppointment?: string;
  deliveryAppointment?: string;
  sequenceNumber: number;
  // Container info
  containerId: string;
  containerNumber: string;
  containerSize: ContainerSize;
  containerType: ContainerType;
  isHazmat: boolean;
  isOverweight: boolean;
  customsStatus: CustomsStatus;
  lifecycleStatus: ContainerLifecycleStatus;
  // Shipment info
  shipmentId: string;
  shipmentReference: string;
  shipmentType: ShipmentType;
  customerName: string;
  terminalName: string;
  lastFreeDay?: string;
  portCutoff?: string;
  // Assignment
  assignedDriverId?: string;
  driverName?: string;
  assignedTripId?: string;
  tripNumber?: string;
}

// ─── Display Info ────────────────────────────────────────────────────────────

// Trip Type Display Info
export const TRIP_TYPE_INFO: Record<TripType, { label: string; description: string; icon: string; color: string }> = {
  LIVE_LOAD: {
    label: 'Live Load',
    description: 'Wait while container is loaded at shipper',
    icon: '📦',
    color: 'bg-blue-100 text-blue-800',
  },
  LIVE_UNLOAD: {
    label: 'Live Unload',
    description: 'Wait while container is unloaded at consignee',
    icon: '📭',
    color: 'bg-green-100 text-green-800',
  },
  DROP_HOOK_SAME: {
    label: 'Drop & Hook (Same)',
    description: 'Drop loaded, pick up empty at same location',
    icon: '🔄',
    color: 'bg-purple-100 text-purple-800',
  },
  DROP_HOOK_DIFF: {
    label: 'Drop & Hook (Different)',
    description: 'Drop at one location, hook at another',
    icon: '↔️',
    color: 'bg-indigo-100 text-indigo-800',
  },
  DROP_ONLY: {
    label: 'Drop Only',
    description: 'Drop container and leave',
    icon: '⬇️',
    color: 'bg-yellow-100 text-yellow-800',
  },
  STREET_TURN: {
    label: 'Street Turn',
    description: 'Deliver import, reload with export without returning empty',
    icon: '🔃',
    color: 'bg-pink-100 text-pink-800',
  },
  DUAL_TRANSACTION: {
    label: 'Dual Transaction',
    description: 'Drop loaded + pick up loaded at terminal (same trip)',
    icon: '⚡',
    color: 'bg-orange-100 text-orange-800',
  },
  BOBTAIL: {
    label: 'Bobtail',
    description: 'Tractor only, no container',
    icon: '🚛',
    color: 'bg-gray-100 text-gray-800',
  },
  EMPTY_PICKUP: {
    label: 'Empty Pickup',
    description: 'Pick up empty container from terminal/yard',
    icon: '📤',
    color: 'bg-cyan-100 text-cyan-800',
  },
  EMPTY_RETURN: {
    label: 'Empty Return',
    description: 'Return empty container to terminal/yard',
    icon: '📥',
    color: 'bg-teal-100 text-teal-800',
  },
  PRE_PULL: {
    label: 'Pre-Pull',
    description: 'Pick up container before LFD, store at yard',
    icon: '⏰',
    color: 'bg-red-100 text-red-800',
  },
  TRANSLOAD: {
    label: 'Transload',
    description: 'Transfer cargo between containers',
    icon: '🔀',
    color: 'bg-amber-100 text-amber-800',
  },
};

// Trip Execution Type Display Info
export const TRIP_EXECUTION_INFO: Record<TripExecutionType, { label: string; description: string }> = {
  LIVE_UNLOAD: {
    label: 'Live Unload',
    description: 'Driver waits while container is unloaded',
  },
  LIVE_LOAD: {
    label: 'Live Load',
    description: 'Driver waits while container is loaded',
  },
  DROP: {
    label: 'Drop',
    description: 'Drop container and leave (pick up later)',
  },
  DROP_AND_HOOK: {
    label: 'Drop & Hook',
    description: 'Drop loaded, pick up empty (or vice versa)',
  },
  STREET_TURN: {
    label: 'Street Turn',
    description: 'Reuse import container for export',
  },
  PREPULL: {
    label: 'Pre-Pull',
    description: 'Pull to yard before delivery date',
  },
  REPO: {
    label: 'Reposition',
    description: 'Move container between locations',
  },
};

// Order Move Type Display Info
export const ORDER_MOVE_INFO: Record<OrderMoveType, { label: string; icon: string }> = {
  IMPORT_DELIVERY: { label: 'Import Delivery', icon: '📥' },
  EXPORT_PICKUP: { label: 'Export Pickup', icon: '📤' },
  EMPTY_RETURN: { label: 'Empty Return', icon: '🔙' },
  EMPTY_PICKUP: { label: 'Empty Pickup', icon: '📦' },
  YARD_PULL: { label: 'Yard Pull', icon: '🏭' },
  YARD_DELIVERY: { label: 'Yard Delivery', icon: '🚚' },
  REPO: { label: 'Reposition', icon: '↔️' },
};

// Order Status Display Info
export const ORDER_STATUS_INFO: Record<OrderStatus, { label: string; color: string }> = {
  PENDING: { label: 'Pending', color: 'bg-gray-100 text-gray-800' },
  READY: { label: 'Ready', color: 'bg-green-100 text-green-800' },
  DISPATCHED: { label: 'Dispatched', color: 'bg-blue-100 text-blue-800' },
  IN_PROGRESS: { label: 'In Progress', color: 'bg-yellow-100 text-yellow-800' },
  DELIVERED: { label: 'Delivered', color: 'bg-purple-100 text-purple-800' },
  COMPLETED: { label: 'Completed', color: 'bg-green-100 text-green-800' },
  HOLD: { label: 'On Hold', color: 'bg-red-100 text-red-800' },
  CANCELLED: { label: 'Cancelled', color: 'bg-gray-100 text-gray-500' },
  FAILED: { label: 'Failed', color: 'bg-red-100 text-red-800' },
};
