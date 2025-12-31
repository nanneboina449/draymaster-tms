// Enums
export type ShipmentType = 'IMPORT' | 'EXPORT';

export type ShipmentStatus = 
  | 'PENDING' 
  | 'CONFIRMED' 
  | 'IN_PROGRESS' 
  | 'DELIVERED' 
  | 'COMPLETED' 
  | 'CANCELLED';

export type ContainerSize = '20' | '40' | '45';

export type ContainerType = 
  | 'DRY' 
  | 'HIGH_CUBE' 
  | 'REEFER' 
  | 'TANK' 
  | 'FLAT_RACK' 
  | 'OPEN_TOP';

export type CustomsStatus = 'PENDING' | 'HOLD' | 'RELEASED';

export type ContainerState = 
  | 'LOADED' 
  | 'EMPTY' 
  | 'AT_TERMINAL' 
  | 'IN_TRANSIT' 
  | 'AT_CUSTOMER' 
  | 'RETURNED';

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

// Interfaces
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

export interface Container {
  id: string;
  containerNumber: string;
  size: ContainerSize;
  type: ContainerType;
  weight: number;
  sealNumber?: string;
  isHazmat: boolean;
  hazmatClass?: string;
  hazmatUN?: string;
  isOverweight: boolean;
  isReefer: boolean;
  reeferTemp?: number;
  customsStatus: CustomsStatus;
  customsHoldReason?: string;
  state: ContainerState;
  terminalAvailableDate?: string;
  lastFreeDay?: string;
  currentLocation?: string;
}

export interface Shipment {
  id: string;
  referenceNumber: string;
  type: ShipmentType;
  status: ShipmentStatus;
  customerId: string;
  customerName: string;
  steamshipLine: string;
  bookingNumber?: string;
  billOfLading?: string;
  vessel?: string;
  voyage?: string;
  terminalId: string;
  terminalName: string;
  vesselETA?: string;
  lastFreeDay?: string;
  portCutoff?: string;
  earliestReturnDate?: string;
  containers: Container[];
  pickupLocation?: Location;
  deliveryLocation?: Location;
  specialInstructions?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  shipmentId: string;
  containerId: string;
  containerNumber: string;
  type: ShipmentType;
  status: 'PENDING' | 'READY' | 'DISPATCHED' | 'IN_PROGRESS' | 'DELIVERED' | 'COMPLETED';
  pickupLocation: Location;
  deliveryLocation: Location;
  appointmentDate?: string;
  appointmentTime?: string;
  specialInstructions?: string;
  billingStatus: 'UNBILLED' | 'PENDING' | 'INVOICED' | 'PAID';
}

export interface Trip {
  id: string;
  tripNumber: string;
  type: TripType;
  status: TripStatus;
  orderId?: string;
  orders?: Order[];
  containerId?: string;
  containerNumber?: string;
  driverId?: string;
  driverName?: string;
  tractorId?: string;
  tractorNumber?: string;
  chassisId?: string;
  chassisNumber?: string;
  chassisPool?: ChassisPool;
  stops: TripStop[];
  plannedStartTime?: string;
  actualStartTime?: string;
  plannedEndTime?: string;
  actualEndTime?: string;
  estimatedMiles?: number;
  actualMiles?: number;
  isStreetTurn: boolean;
  linkedTripId?: string;
  isDualTransaction: boolean;
  notes?: string;
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
  firstName: string;
  lastName: string;
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