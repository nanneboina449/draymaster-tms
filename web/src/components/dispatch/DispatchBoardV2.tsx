'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Driver, Tractor } from '@/lib/types';
import EditOrderModal from './EditOrderModal';
import CreateTripModal from './CreateTripModal';
import EmptyReadyPanel from './EmptyReadyPanel';
import DispatchModal from './DispatchModal';

// ============================================================================
// TYPES
// ============================================================================

interface DispatchOrder {
  id: string;
  order_number: string;
  status: string;
  move_type: string;
  trip_execution_type?: string;
  sequence_number?: number;

  // Container info (Load)
  container_id: string;
  container_number: string;
  container_size?: string;
  container_type?: string;
  is_hazmat?: boolean;
  is_overweight?: boolean;
  weight_lbs?: number;
  customs_status?: string;

  // Shipment info (Order/Booking)
  shipment_id: string;
  shipment_reference?: string;
  shipment_type?: string;
  terminal_name?: string;
  steamship_line?: string;
  last_free_day?: string;
  customer_name?: string;
  booking_number?: string;
  bill_of_lading?: string;

  // Locations
  pickup_address?: string;
  pickup_city?: string;
  delivery_address?: string;
  delivery_city?: string;

  // Appointments
  pickup_appointment?: string;
  delivery_appointment?: string;

  // Assignment
  assigned_driver_id?: string;
  assigned_driver_name?: string;
  assigned_tractor_id?: string;
  assigned_tractor_number?: string;
  chassis_number?: string;

  // Timestamps
  dispatched_at?: string;
  picked_up_at?: string;
  delivered_at?: string;
  completed_at?: string;
  created_at: string;
}

interface DriverWithLoad {
  id: string;
  name: string;
  first_name: string;
  last_name: string;
  phone?: string;
  status: string;
  hazmat_endorsement?: boolean;
  current_orders: DispatchOrder[];
  tractor?: {
    id: string;
    unit_number: string;
  };
}

// ============================================================================
// CONSTANTS
// ============================================================================

const MOVE_TYPE_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  'IMPORT_DELIVERY': { label: 'Import Delivery', icon: '📥', color: 'bg-purple-100 text-purple-800' },
  'EXPORT_PICKUP': { label: 'Export Pickup', icon: '📤', color: 'bg-orange-100 text-orange-800' },
  'EMPTY_RETURN': { label: 'Empty Return', icon: '🔄', color: 'bg-blue-100 text-blue-800' },
  'EMPTY_PICKUP': { label: 'Empty Pickup', icon: '📦', color: 'bg-gray-100 text-gray-800' },
  'PRE_PULL': { label: 'Pre-Pull', icon: '🏗️', color: 'bg-yellow-100 text-yellow-800' },
  'YARD_MOVE': { label: 'Yard Move', icon: '🅿️', color: 'bg-indigo-100 text-indigo-800' },
};

const STATUS_COLUMNS = [
  { id: 'PENDING', label: 'Pending', color: 'bg-gray-100', description: 'Ready to dispatch' },
  { id: 'DISPATCHED', label: 'Dispatched', color: 'bg-blue-100', description: 'Driver assigned' },
  { id: 'IN_PROGRESS', label: 'In Progress', color: 'bg-yellow-100', description: 'Driver en route' },
  { id: 'COMPLETED', label: 'Completed', color: 'bg-green-100', description: 'Done today' },
];

// Load lifecycle - group legs by container (Load = Container in drayage)
interface LoadJourney {
  container_id: string;
  container_number: string;
  container_size?: string;
  shipment_id: string;
  shipment_type?: string;
  customer_name?: string;
  terminal_name?: string;
  delivery_address?: string;
  delivery_city?: string;
  booking_number?: string;
  bill_of_lading?: string;
  last_free_day?: string;
  steamship_line?: string;
  is_hazmat?: boolean;
  is_overweight?: boolean;
  weight_lbs?: number;
  legs: DispatchOrder[];  // Renamed from orders → legs
  currentStep: number;
  totalSteps: number;
  nextAction?: string;
  nextLegType?: string;
  isComplete: boolean;
}

// For dispatch modal
interface DispatchTarget {
  container: {
    id: string;
    container_number: string;
    size?: string;
    type?: string;
    is_hazmat?: boolean;
    is_overweight?: boolean;
    weight_lbs?: number;
    customs_status?: string;
  };
  shipment: {
    id: string;
    reference_number?: string;
    type: 'IMPORT' | 'EXPORT';
    customer_name?: string;
    terminal_name?: string;
    delivery_address?: string;
    delivery_city?: string;
    delivery_state?: string;
    booking_number?: string;
    bill_of_lading?: string;
    last_free_day?: string;
    steamship_line?: string;
  };
  existingLeg?: {
    id: string;
    order_number: string;
    move_type: string;
    pickup_address?: string;
    pickup_city?: string;
    delivery_address?: string;
    delivery_city?: string;
  };
}

// Define expected leg sequences for each shipment type
const IMPORT_JOURNEY = ['IMPORT_DELIVERY', 'EMPTY_RETURN'];
const EXPORT_JOURNEY = ['EMPTY_PICKUP', 'EXPORT_PICKUP'];

// Function to group legs by container (Load) and calculate journey progress
function groupLegsByLoad(legs: DispatchOrder[]): LoadJourney[] {
  const loadMap = new Map<string, DispatchOrder[]>();

  // Group legs by container_id (each container = 1 load)
  legs.forEach(leg => {
    if (!leg.container_id) return;
    const existing = loadMap.get(leg.container_id) || [];
    existing.push(leg);
    loadMap.set(leg.container_id, existing);
  });

  // Build LoadJourney objects
  const journeys: LoadJourney[] = [];

  loadMap.forEach((loadLegs, containerId) => {
    // Sort by sequence_number or created_at
    loadLegs.sort((a, b) => {
      if (a.sequence_number && b.sequence_number) {
        return a.sequence_number - b.sequence_number;
      }
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

    const firstLeg = loadLegs[0];
    const shipmentType = firstLeg.shipment_type || 'IMPORT';
    const expectedJourney = shipmentType === 'EXPORT' ? EXPORT_JOURNEY : IMPORT_JOURNEY;

    // Calculate current step and next action
    const completedLegs = loadLegs.filter(l => l.status === 'COMPLETED');
    const inProgressLegs = loadLegs.filter(l => ['DISPATCHED', 'IN_PROGRESS'].includes(l.status));
    const pendingLegs = loadLegs.filter(l => ['PENDING', 'READY'].includes(l.status));

    // Find where we are in the journey
    let currentStep = completedLegs.length;
    if (inProgressLegs.length > 0) currentStep += 0.5; // Halfway through a step

    // Determine what's next
    let nextAction: string | undefined;
    let nextLegType: string | undefined;

    if (inProgressLegs.length > 0) {
      const inProg = inProgressLegs[0];
      nextAction = `Complete ${MOVE_TYPE_LABELS[inProg.move_type]?.label || inProg.move_type}`;
      nextLegType = inProg.move_type;
    } else if (pendingLegs.length > 0) {
      const pending = pendingLegs[0];
      nextAction = `Dispatch ${MOVE_TYPE_LABELS[pending.move_type]?.label || pending.move_type}`;
      nextLegType = pending.move_type;
    } else {
      // Check if we need more legs based on expected journey
      const completedMoveTypes = completedLegs.map(l => l.move_type);
      const missingSteps = expectedJourney.filter(step => !completedMoveTypes.includes(step));
      if (missingSteps.length > 0) {
        nextAction = `Create ${MOVE_TYPE_LABELS[missingSteps[0]]?.label || missingSteps[0]} leg`;
        nextLegType = missingSteps[0];
      }
    }

    // Determine if journey is complete
    const completedMoveTypes = completedLegs.map(l => l.move_type);
    const isComplete = expectedJourney.every(step => completedMoveTypes.includes(step));

    journeys.push({
      container_id: containerId,
      container_number: firstLeg.container_number,
      container_size: firstLeg.container_size,
      shipment_id: firstLeg.shipment_id,
      shipment_type: shipmentType,
      customer_name: firstLeg.customer_name,
      terminal_name: firstLeg.terminal_name,
      delivery_address: firstLeg.delivery_address,
      delivery_city: firstLeg.delivery_city,
      last_free_day: firstLeg.last_free_day,
      steamship_line: firstLeg.steamship_line,
      is_hazmat: firstLeg.is_hazmat,
      is_overweight: firstLeg.is_overweight,
      legs: loadLegs,
      currentStep,
      totalSteps: expectedJourney.length,
      nextAction,
      nextLegType,
      isComplete,
    });
  });

  // Sort: incomplete first (with urgent at top), then complete
  journeys.sort((a, b) => {
    if (a.isComplete !== b.isComplete) return a.isComplete ? 1 : -1;
    // Sort by LFD urgency
    if (a.last_free_day && b.last_free_day) {
      return new Date(a.last_free_day).getTime() - new Date(b.last_free_day).getTime();
    }
    if (a.last_free_day) return -1;
    if (b.last_free_day) return 1;
    return 0;
  });

  return journeys;
}

// ============================================================================
// ORDER CARD COMPONENT
// ============================================================================

function OrderCard({
  order,
  onEdit,
  onAssignDriver,
  onCreateTrip,
  onStatusChange,
  isDragging
}: {
  order: DispatchOrder;
  onEdit: () => void;
  onAssignDriver: () => void;
  onCreateTrip?: () => void;
  onStatusChange: (status: string) => void;
  isDragging?: boolean;
}) {
  const moveTypeInfo = MOVE_TYPE_LABELS[order.move_type] || {
    label: order.move_type,
    icon: '📋',
    color: 'bg-gray-100 text-gray-800'
  };

  // Calculate LFD urgency
  const getLFDUrgency = () => {
    if (!order.last_free_day) return null;
    const lfd = new Date(order.last_free_day);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = Math.ceil((lfd.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diff < 0) return { text: 'OVERDUE', class: 'bg-red-600 text-white' };
    if (diff === 0) return { text: 'TODAY', class: 'bg-red-500 text-white' };
    if (diff === 1) return { text: 'TOMORROW', class: 'bg-orange-500 text-white' };
    if (diff <= 3) return { text: `${diff}d`, class: 'bg-yellow-500 text-white' };
    return { text: `${diff}d`, class: 'bg-gray-200 text-gray-600' };
  };

  const lfdUrgency = getLFDUrgency();

  return (
    <div
      className={`bg-white rounded-lg shadow-sm border p-3 cursor-pointer hover:shadow-md transition ${
        isDragging ? 'opacity-50 ring-2 ring-indigo-500' : ''
      }`}
      onClick={onEdit}
    >
      {/* Header: Container + Move Type */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold text-sm">{order.container_number}</span>
          {order.is_hazmat && <span title="Hazmat">☣️</span>}
          {order.is_overweight && <span title="Overweight">⚖️</span>}
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full ${moveTypeInfo.color}`}>
          {moveTypeInfo.icon} {moveTypeInfo.label}
        </span>
      </div>

      {/* Route */}
      <div className="text-xs text-gray-600 mb-2">
        <div className="flex items-center gap-1">
          <span className="text-green-600">●</span>
          <span>{order.terminal_name || order.pickup_city || 'Terminal'}</span>
        </div>
        <div className="flex items-center gap-1 ml-2">
          <span className="text-gray-400">↓</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-red-600">●</span>
          <span>{order.delivery_city || order.delivery_address?.slice(0, 25) || 'Destination'}</span>
        </div>
      </div>

      {/* Info Row */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <span className="text-gray-500">{order.steamship_line}</span>
          {lfdUrgency && (
            <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${lfdUrgency.class}`}>
              LFD: {lfdUrgency.text}
            </span>
          )}
        </div>
        {order.customs_status === 'HOLD' && (
          <span className="px-1.5 py-0.5 bg-red-100 text-red-700 rounded text-xs">HOLD</span>
        )}
      </div>

      {/* Driver Assignment */}
      <div className="mt-2 pt-2 border-t">
        {order.assigned_driver_name ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-indigo-100 rounded-full flex items-center justify-center">
                <span className="text-xs font-medium text-indigo-700">
                  {order.assigned_driver_name.split(' ').map(n => n[0]).join('')}
                </span>
              </div>
              <span className="text-sm font-medium">{order.assigned_driver_name}</span>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); onAssignDriver(); }}
              className="text-xs text-indigo-600 hover:text-indigo-800"
            >
              Change
            </button>
          </div>
        ) : (
          <div className="space-y-1">
            {/* For delivery orders, show Create Trip (which handles SWAP scenarios) */}
            {['IMPORT_DELIVERY', 'YARD_DELIVERY'].includes(order.move_type) && onCreateTrip ? (
              <button
                onClick={(e) => { e.stopPropagation(); onCreateTrip(); }}
                className="w-full py-1.5 bg-indigo-600 text-white rounded text-xs font-medium hover:bg-indigo-700 transition"
              >
                🚛 Create Trip
              </button>
            ) : (
              <button
                onClick={(e) => { e.stopPropagation(); onAssignDriver(); }}
                className="w-full py-1.5 border-2 border-dashed border-gray-300 rounded text-xs text-gray-500 hover:border-indigo-400 hover:text-indigo-600 transition"
              >
                + Assign Driver
              </button>
            )}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      {order.status === 'DISPATCHED' && (
        <div className="mt-2 flex gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); onStatusChange('IN_PROGRESS'); }}
            className="flex-1 py-1 bg-yellow-100 text-yellow-700 rounded text-xs hover:bg-yellow-200"
          >
            Start Trip
          </button>
        </div>
      )}
      {order.status === 'IN_PROGRESS' && (
        <div className="mt-2 flex gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); onStatusChange('COMPLETED'); }}
            className="flex-1 py-1 bg-green-100 text-green-700 rounded text-xs hover:bg-green-200"
          >
            Complete
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// LOAD CARD COMPONENT (Shows container/load with all its legs)
// ============================================================================

function LoadCard({
  load,
  onLegClick,
  onDispatch,
  onStatusChange,
}: {
  load: LoadJourney;
  onLegClick: (leg: DispatchOrder) => void;
  onDispatch: (load: LoadJourney, existingLeg?: DispatchOrder) => void;
  onStatusChange: (legId: string, status: string) => void;
}) {
  const shipmentType = load.shipment_type || 'IMPORT';
  const expectedJourney = shipmentType === 'EXPORT' ? EXPORT_JOURNEY : IMPORT_JOURNEY;

  // Calculate LFD urgency
  const getLFDUrgency = () => {
    if (!load.last_free_day) return null;
    const lfd = new Date(load.last_free_day);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = Math.ceil((lfd.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diff < 0) return { text: 'OVERDUE', class: 'bg-red-600 text-white', urgent: true };
    if (diff === 0) return { text: 'TODAY', class: 'bg-red-500 text-white', urgent: true };
    if (diff === 1) return { text: 'TOMORROW', class: 'bg-orange-500 text-white', urgent: true };
    if (diff <= 3) return { text: `${diff} days`, class: 'bg-yellow-500 text-white', urgent: true };
    return { text: `${diff} days`, class: 'bg-gray-200 text-gray-600', urgent: false };
  };

  const lfdUrgency = getLFDUrgency();

  // Get leg for a specific move type
  const getLegForMoveType = (moveType: string): DispatchOrder | undefined => {
    return load.legs.find(l => l.move_type === moveType);
  };

  // Render status indicator for each step (leg)
  const renderLegStatus = (moveType: string, stepIndex: number) => {
    const leg = getLegForMoveType(moveType);
    const moveInfo = MOVE_TYPE_LABELS[moveType] || { label: moveType, icon: '📋', color: 'bg-gray-100' };

    if (!leg) {
      // Leg doesn't exist yet - needs to be created & dispatched
      return (
        <div className="flex items-center gap-2 p-2 bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg">
          <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-400">
            {stepIndex + 1}
          </div>
          <div className="flex-1">
            <p className="text-sm text-gray-400">{moveInfo.label}</p>
            <p className="text-xs text-gray-400">Not created yet</p>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDispatch(load, undefined); // Create new leg
            }}
            className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 font-medium"
          >
            + Create & Dispatch
          </button>
        </div>
      );
    }

    // Determine status
    let statusColor = 'bg-gray-200';
    let statusText = 'Pending';
    let statusIcon = '○';

    if (leg.status === 'COMPLETED') {
      statusColor = 'bg-green-500';
      statusText = 'Done';
      statusIcon = '✓';
    } else if (leg.status === 'IN_PROGRESS') {
      statusColor = 'bg-yellow-500';
      statusText = 'In Progress';
      statusIcon = '►';
    } else if (leg.status === 'DISPATCHED') {
      statusColor = 'bg-blue-500';
      statusText = 'Dispatched';
      statusIcon = '→';
    }

    return (
      <div
        className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer hover:shadow-sm transition ${
          leg.status === 'COMPLETED' ? 'bg-green-50 border-green-200' :
          leg.status === 'IN_PROGRESS' ? 'bg-yellow-50 border-yellow-200' :
          leg.status === 'DISPATCHED' ? 'bg-blue-50 border-blue-200' :
          'bg-white border-gray-200'
        }`}
        onClick={() => onLegClick(leg)}
      >
        <div className={`w-8 h-8 rounded-full ${statusColor} flex items-center justify-center text-white text-sm font-medium`}>
          {statusIcon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">{moveInfo.label}</p>
            <span className="text-xs text-gray-400">#{leg.order_number}</span>
          </div>
          <p className="text-xs text-gray-500 truncate">
            {leg.status === 'COMPLETED' ? (
              `Completed ${leg.completed_at ? new Date(leg.completed_at).toLocaleDateString() : ''}`
            ) : leg.assigned_driver_name ? (
              `Driver: ${leg.assigned_driver_name}`
            ) : (
              `${leg.pickup_city || 'Pickup'} → ${leg.delivery_city || 'Delivery'}`
            )}
          </p>
        </div>

        {/* Quick Actions */}
        {leg.status === 'PENDING' && !leg.assigned_driver_id && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDispatch(load, leg); // Dispatch existing leg
            }}
            className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 font-medium"
          >
            Dispatch
          </button>
        )}
        {leg.status === 'DISPATCHED' && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onStatusChange(leg.id, 'IN_PROGRESS');
            }}
            className="px-2 py-1 text-xs bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200"
          >
            Start
          </button>
        )}
        {leg.status === 'IN_PROGRESS' && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onStatusChange(leg.id, 'COMPLETED');
            }}
            className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200"
          >
            Complete
          </button>
        )}
      </div>
    );
  };

  return (
    <div className={`bg-white rounded-xl shadow-sm border overflow-hidden ${
      load.isComplete ? 'border-green-300' : lfdUrgency?.urgent ? 'border-orange-300' : 'border-gray-200'
    }`}>
      {/* Header */}
      <div className={`px-4 py-3 ${
        load.isComplete ? 'bg-green-50' :
        lfdUrgency?.urgent ? 'bg-orange-50' :
        'bg-gray-50'
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-lg">{load.container_number}</span>
              {load.is_hazmat && <span title="Hazmat" className="text-lg">☣️</span>}
              {load.is_overweight && <span title="Overweight" className="text-lg">⚖️</span>}
            </div>
            <span className={`text-xs px-2 py-1 rounded-full ${
              shipmentType === 'IMPORT' ? 'bg-purple-100 text-purple-700' : 'bg-orange-100 text-orange-700'
            }`}>
              {shipmentType}
            </span>
            {load.container_size && (
              <span className="text-xs text-gray-500">{load.container_size}'</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {lfdUrgency && (
              <span className={`px-2 py-1 rounded text-xs font-medium ${lfdUrgency.class}`}>
                LFD: {lfdUrgency.text}
              </span>
            )}
            {load.isComplete && (
              <span className="px-2 py-1 bg-green-600 text-white rounded text-xs font-medium">
                ✓ Complete
              </span>
            )}
          </div>
        </div>
        <div className="mt-1 flex items-center gap-4 text-sm text-gray-600">
          <span>{load.customer_name || 'No Customer'}</span>
          <span className="text-gray-300">|</span>
          <span>{load.terminal_name || 'No Terminal'}</span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="px-4 py-2 bg-gray-100">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Load Progress</span>
          <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${load.isComplete ? 'bg-green-500' : 'bg-indigo-500'}`}
              style={{ width: `${(load.currentStep / load.totalSteps) * 100}%` }}
            />
          </div>
          <span className="text-xs font-medium text-gray-600">
            {Math.floor(load.currentStep)}/{load.totalSteps} legs
          </span>
        </div>
      </div>

      {/* Legs (journey steps) */}
      <div className="p-4">
        <div className="space-y-2">
          {expectedJourney.map((moveType, index) => (
            <div key={moveType}>
              {renderLegStatus(moveType, index)}
              {index < expectedJourney.length - 1 && (
                <div className="flex items-center ml-4 my-1">
                  <div className="w-px h-4 bg-gray-300"></div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Next Action Callout */}
        {load.nextAction && !load.isComplete && (
          <div className="mt-4 p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-indigo-600">👉</span>
                <span className="text-sm font-medium text-indigo-700">Next: {load.nextAction}</span>
              </div>
              {load.nextLegType && !load.legs.find(l => l.move_type === load.nextLegType && l.status === 'PENDING') && (
                <button
                  onClick={() => onDispatch(load, undefined)}
                  className="px-3 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 font-medium"
                >
                  Create Leg
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// DRIVER PANEL COMPONENT
// ============================================================================

function DriverPanel({
  drivers,
  onAssignOrder
}: {
  drivers: DriverWithLoad[];
  onAssignOrder: (driverId: string, orderId: string) => void;
}) {
  const availableDrivers = drivers.filter(d => d.current_orders.length === 0);
  const busyDrivers = drivers.filter(d => d.current_orders.length > 0);

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
        <span>🚛</span> Drivers
      </h3>

      {/* Available Drivers */}
      <div className="mb-4">
        <p className="text-xs text-gray-500 mb-2">AVAILABLE ({availableDrivers.length})</p>
        <div className="space-y-2">
          {availableDrivers.map(driver => (
            <div
              key={driver.id}
              className="p-2 bg-green-50 border border-green-200 rounded-lg"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">{driver.name}</p>
                  <p className="text-xs text-gray-500">
                    {driver.tractor?.unit_number || 'No truck assigned'}
                    {driver.hazmat_endorsement && ' • HAZMAT'}
                  </p>
                </div>
                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
              </div>
            </div>
          ))}
          {availableDrivers.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-2">No available drivers</p>
          )}
        </div>
      </div>

      {/* Busy Drivers */}
      <div>
        <p className="text-xs text-gray-500 mb-2">ON ASSIGNMENT ({busyDrivers.length})</p>
        <div className="space-y-2">
          {busyDrivers.map(driver => (
            <div
              key={driver.id}
              className="p-2 bg-gray-50 border rounded-lg"
            >
              <div className="flex items-center justify-between mb-1">
                <p className="font-medium text-sm">{driver.name}</p>
                <span className="text-xs text-gray-500">{driver.current_orders.length} order(s)</span>
              </div>
              <div className="space-y-1">
                {driver.current_orders.map(order => (
                  <div key={order.id} className="text-xs text-gray-600 flex items-center gap-1">
                    <span className="font-mono">{order.container_number}</span>
                    <span className="text-gray-400">•</span>
                    <span>{MOVE_TYPE_LABELS[order.move_type]?.label || order.move_type}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// ASSIGN DRIVER MODAL
// ============================================================================

function AssignDriverModal({
  order,
  drivers,
  tractors,
  onAssign,
  onClose
}: {
  order: DispatchOrder;
  drivers: DriverWithLoad[];
  tractors: Tractor[];
  onAssign: (driverId: string, tractorId?: string, chassisNumber?: string) => void;
  onClose: () => void;
}) {
  const [selectedDriver, setSelectedDriver] = useState(order.assigned_driver_id || '');
  const [selectedTractor, setSelectedTractor] = useState(order.assigned_tractor_id || '');
  const [chassisNumber, setChassisNumber] = useState(order.chassis_number || '');
  const [chassisPool, setChassisPool] = useState('DCLI');

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black bg-opacity-50" onClick={onClose}></div>
      <div className="relative min-h-screen flex items-center justify-center p-4">
        <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md">
          <div className="p-6">
            <h3 className="text-lg font-semibold mb-4">Assign Driver</h3>

            {/* Order Info */}
            <div className="p-3 bg-gray-50 rounded-lg mb-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono font-bold">{order.container_number}</span>
                <span className={`text-xs px-2 py-0.5 rounded ${MOVE_TYPE_LABELS[order.move_type]?.color || 'bg-gray-100'}`}>
                  {MOVE_TYPE_LABELS[order.move_type]?.label || order.move_type}
                </span>
              </div>
              <p className="text-sm text-gray-600">
                {order.terminal_name || order.pickup_city} → {order.delivery_city || 'Destination'}
              </p>
            </div>

            {/* Driver Selection */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Driver *</label>
              <select
                value={selectedDriver}
                onChange={e => setSelectedDriver(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg"
              >
                <option value="">Select Driver</option>
                {drivers.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.name} {d.current_orders.length > 0 ? `(${d.current_orders.length} orders)` : '(Available)'}
                    {d.hazmat_endorsement ? ' - HAZMAT' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Tractor Selection */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Tractor</label>
              <select
                value={selectedTractor}
                onChange={e => setSelectedTractor(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg"
              >
                <option value="">Select Tractor</option>
                {tractors.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.unit_number} - {t.make} {t.model}
                  </option>
                ))}
              </select>
            </div>

            {/* Chassis */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Chassis #</label>
                <input
                  type="text"
                  value={chassisNumber}
                  onChange={e => setChassisNumber(e.target.value.toUpperCase())}
                  placeholder="DCLI-123456"
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Pool</label>
                <select
                  value={chassisPool}
                  onChange={e => setChassisPool(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="DCLI">DCLI</option>
                  <option value="TRAC">TRAC</option>
                  <option value="FLEXI">Flexivan</option>
                  <option value="SSL">SSL Direct</option>
                </select>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => onAssign(selectedDriver, selectedTractor, chassisNumber)}
                disabled={!selectedDriver}
                className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {order.assigned_driver_id ? 'Update Assignment' : 'Assign & Dispatch'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN DISPATCH BOARD COMPONENT
// ============================================================================

export default function DispatchBoardV2() {
  const [orders, setOrders] = useState<DispatchOrder[]>([]);
  const [drivers, setDrivers] = useState<DriverWithLoad[]>([]);
  const [tractors, setTractors] = useState<Tractor[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<DispatchOrder | null>(null);
  const [assigningOrder, setAssigningOrder] = useState<DispatchOrder | null>(null);
  const [creatingTripFor, setCreatingTripFor] = useState<DispatchOrder | null>(null);
  const [filter, setFilter] = useState<'ALL' | 'IMPORT' | 'EXPORT' | 'URGENT' | 'EMPTY_RETURN'>('ALL');
  const [showEmptyPanel, setShowEmptyPanel] = useState(true);
  const [viewMode, setViewMode] = useState<'orders' | 'loads'>('loads'); // Default to load view
  const [dispatchTarget, setDispatchTarget] = useState<DispatchTarget | null>(null); // For dispatch modal

  // Load data
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch orders with related data
      const { data: ordersData, error: ordersError } = await supabase
        .from('orders')
        .select(`
          *,
          container:containers!container_id(
            container_number, size, type, is_hazmat, is_overweight, customs_status, weight_lbs
          ),
          shipment:shipments!shipment_id(
            reference_number, type, terminal_name, steamship_line, last_free_day, customer_name,
            booking_number, bill_of_lading, delivery_address, delivery_city, delivery_state
          ),
          driver:drivers!assigned_driver_id(
            id, first_name, last_name
          )
        `)
        .is('deleted_at', null)
        .in('status', ['PENDING', 'READY', 'DISPATCHED', 'IN_PROGRESS', 'COMPLETED'])
        .order('created_at', { ascending: false });

      if (ordersError) throw ordersError;

      // Transform orders (legs)
      const transformedOrders: DispatchOrder[] = (ordersData || []).map((o: any) => ({
        id: o.id,
        order_number: o.order_number,
        status: o.status,
        move_type: o.move_type_v2 || o.type,
        trip_execution_type: o.trip_execution_type,
        sequence_number: o.sequence_number,
        container_id: o.container_id,
        container_number: o.container?.container_number || 'N/A',
        container_size: o.container?.size,
        container_type: o.container?.type,
        is_hazmat: o.container?.is_hazmat,
        is_overweight: o.container?.is_overweight,
        weight_lbs: o.container?.weight_lbs,
        customs_status: o.container?.customs_status,
        shipment_id: o.shipment_id,
        shipment_reference: o.shipment?.reference_number,
        shipment_type: o.shipment?.type,
        terminal_name: o.shipment?.terminal_name,
        steamship_line: o.shipment?.steamship_line,
        last_free_day: o.shipment?.last_free_day,
        customer_name: o.shipment?.customer_name,
        booking_number: o.shipment?.booking_number,
        bill_of_lading: o.shipment?.bill_of_lading,
        pickup_address: o.pickup_address,
        pickup_city: o.pickup_city,
        delivery_address: o.delivery_address || o.shipment?.delivery_address,
        delivery_city: o.delivery_city || o.shipment?.delivery_city,
        pickup_appointment: o.pickup_appointment,
        delivery_appointment: o.delivery_appointment,
        assigned_driver_id: o.assigned_driver_id,
        assigned_driver_name: o.driver ? `${o.driver.first_name} ${o.driver.last_name}` : null,
        assigned_tractor_id: o.assigned_tractor_id,
        chassis_number: o.chassis_number,
        dispatched_at: o.dispatched_at,
        picked_up_at: o.picked_up_at,
        delivered_at: o.delivered_at,
        completed_at: o.completed_at,
        created_at: o.created_at,
      }));

      setOrders(transformedOrders);

      // Fetch drivers
      const { data: driversData } = await supabase
        .from('drivers')
        .select('*')
        .in('status', ['ACTIVE', 'AVAILABLE']);

      // Build driver list with their current orders
      const driversWithLoads: DriverWithLoad[] = (driversData || []).map((d: any) => ({
        id: d.id,
        name: `${d.first_name} ${d.last_name}`,
        first_name: d.first_name,
        last_name: d.last_name,
        phone: d.phone,
        status: d.status,
        hazmat_endorsement: d.hazmat_endorsement,
        current_orders: transformedOrders.filter(
          o => o.assigned_driver_id === d.id && ['DISPATCHED', 'IN_PROGRESS'].includes(o.status)
        ),
      }));

      setDrivers(driversWithLoads);

      // Fetch tractors
      const { data: tractorsData } = await supabase
        .from('tractors')
        .select('*')
        .in('status', ['ACTIVE', 'AVAILABLE']);

      setTractors(tractorsData || []);

    } catch (err) {
      console.error('Error loading dispatch data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    // Refresh every 30 seconds
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Filter orders
  const filteredOrders = orders.filter(o => {
    if (filter === 'IMPORT') return o.shipment_type === 'IMPORT';
    if (filter === 'EXPORT') return o.shipment_type === 'EXPORT';
    if (filter === 'EMPTY_RETURN') return o.move_type === 'EMPTY_RETURN';
    if (filter === 'URGENT') {
      if (!o.last_free_day) return false;
      const lfd = new Date(o.last_free_day);
      const today = new Date();
      const diff = Math.ceil((lfd.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return diff <= 2;
    }
    return true;
  });

  // Group orders by status
  const ordersByStatus = STATUS_COLUMNS.reduce((acc, col) => {
    acc[col.id] = filteredOrders.filter(o => {
      if (col.id === 'PENDING') return ['PENDING', 'READY'].includes(o.status);
      return o.status === col.id;
    });
    return acc;
  }, {} as Record<string, DispatchOrder[]>);

  // Handle driver assignment
  const handleAssignDriver = async (driverId: string, tractorId?: string, chassisNumber?: string) => {
    if (!assigningOrder) return;

    try {
      const updates: any = {
        assigned_driver_id: driverId,
        status: 'DISPATCHED',
        dispatched_at: new Date().toISOString(),
      };

      if (tractorId) updates.assigned_tractor_id = tractorId;
      if (chassisNumber) updates.chassis_number = chassisNumber;

      const { error } = await supabase
        .from('orders')
        .update(updates)
        .eq('id', assigningOrder.id);

      if (error) throw error;

      setAssigningOrder(null);
      loadData();
    } catch (err: any) {
      alert('Error assigning driver: ' + err.message);
    }
  };

  // Handle status change
  const handleStatusChange = async (orderId: string, newStatus: string) => {
    try {
      const updates: any = { status: newStatus };

      if (newStatus === 'IN_PROGRESS') {
        updates.picked_up_at = new Date().toISOString();
      } else if (newStatus === 'COMPLETED') {
        updates.completed_at = new Date().toISOString();
        updates.delivered_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('orders')
        .update(updates)
        .eq('id', orderId);

      if (error) throw error;
      loadData();
    } catch (err: any) {
      alert('Error updating status: ' + err.message);
    }
  };

  if (loading && orders.length === 0) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-500">Loading dispatch board...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="bg-white border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="font-semibold text-gray-900">Dispatch Board</h2>

          {/* View Mode Toggle */}
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('loads')}
              className={`px-3 py-1.5 text-sm rounded-md transition font-medium ${
                viewMode === 'loads'
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              📦 Loads View
            </button>
            <button
              onClick={() => setViewMode('orders')}
              className={`px-3 py-1.5 text-sm rounded-md transition font-medium ${
                viewMode === 'orders'
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              📋 Legs Board
            </button>
          </div>

          {/* Filters */}
          <div className="flex gap-1">
            {(['ALL', 'IMPORT', 'EXPORT', 'EMPTY_RETURN', 'URGENT'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 text-sm rounded-full transition ${
                  filter === f
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {f === 'URGENT' ? '🔥 Urgent' : f === 'EMPTY_RETURN' ? '📤 Empties' : f}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">
            {viewMode === 'loads'
              ? `${groupLegsByLoad(filteredOrders).length} loads`
              : `${filteredOrders.length} legs`
            }
          </span>
          <button
            onClick={loadData}
            className="p-2 hover:bg-gray-100 rounded-lg"
            title="Refresh"
          >
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Loads View */}
        {viewMode === 'loads' ? (
          <div className="flex-1 p-4 overflow-y-auto">
            {/* Summary Stats */}
            <div className="mb-4 grid grid-cols-4 gap-4">
              {(() => {
                const loads = groupLegsByLoad(filteredOrders);
                const complete = loads.filter(l => l.isComplete).length;
                const inProgress = loads.filter(l => !l.isComplete && l.legs.some(leg => ['DISPATCHED', 'IN_PROGRESS'].includes(leg.status))).length;
                const pending = loads.filter(l => !l.isComplete && l.legs.every(leg => ['PENDING', 'READY'].includes(leg.status))).length;
                const urgent = loads.filter(l => {
                  if (l.isComplete || !l.last_free_day) return false;
                  const lfd = new Date(l.last_free_day);
                  const today = new Date();
                  const diff = Math.ceil((lfd.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                  return diff <= 2;
                }).length;
                return (
                  <>
                    <div className="bg-white rounded-lg p-3 border shadow-sm">
                      <p className="text-xs text-gray-500 uppercase">Total Loads</p>
                      <p className="text-2xl font-bold text-gray-900">{loads.length}</p>
                    </div>
                    <div className="bg-yellow-50 rounded-lg p-3 border border-yellow-200 shadow-sm">
                      <p className="text-xs text-yellow-600 uppercase">In Progress</p>
                      <p className="text-2xl font-bold text-yellow-700">{inProgress}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3 border shadow-sm">
                      <p className="text-xs text-gray-500 uppercase">Pending Start</p>
                      <p className="text-2xl font-bold text-gray-700">{pending}</p>
                    </div>
                    <div className="bg-green-50 rounded-lg p-3 border border-green-200 shadow-sm">
                      <p className="text-xs text-green-600 uppercase">Complete</p>
                      <p className="text-2xl font-bold text-green-700">{complete}</p>
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Load Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
              {groupLegsByLoad(filteredOrders).map(load => (
                <LoadCard
                  key={load.container_id}
                  load={load}
                  onLegClick={(leg) => setSelectedOrder(leg)}
                  onDispatch={(loadData, existingLeg) => {
                    // Build dispatch target for the modal
                    setDispatchTarget({
                      container: {
                        id: loadData.container_id,
                        container_number: loadData.container_number,
                        size: loadData.container_size,
                        is_hazmat: loadData.is_hazmat,
                        is_overweight: loadData.is_overweight,
                        weight_lbs: loadData.weight_lbs,
                      },
                      shipment: {
                        id: loadData.shipment_id,
                        type: (loadData.shipment_type || 'IMPORT') as 'IMPORT' | 'EXPORT',
                        customer_name: loadData.customer_name,
                        terminal_name: loadData.terminal_name,
                        delivery_address: loadData.delivery_address,
                        delivery_city: loadData.delivery_city,
                        last_free_day: loadData.last_free_day,
                        steamship_line: loadData.steamship_line,
                        booking_number: loadData.booking_number,
                        bill_of_lading: loadData.bill_of_lading,
                      },
                      existingLeg: existingLeg ? {
                        id: existingLeg.id,
                        order_number: existingLeg.order_number,
                        move_type: existingLeg.move_type,
                        pickup_address: existingLeg.pickup_address,
                        pickup_city: existingLeg.pickup_city,
                        delivery_address: existingLeg.delivery_address,
                        delivery_city: existingLeg.delivery_city,
                      } : undefined,
                    });
                  }}
                  onStatusChange={handleStatusChange}
                />
              ))}
              {groupLegsByLoad(filteredOrders).length === 0 && (
                <div className="col-span-full text-center py-12 text-gray-400">
                  No loads found
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Kanban Order View */
          <div className="flex-1 flex gap-4 p-4 overflow-x-auto">
            {STATUS_COLUMNS.map(column => (
              <div key={column.id} className="flex-1 min-w-[280px] max-w-[350px] flex flex-col">
                {/* Column Header */}
                <div className={`${column.color} rounded-t-lg px-3 py-2 flex items-center justify-between`}>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{column.label}</span>
                    <span className="bg-white/50 px-2 py-0.5 rounded-full text-xs">
                      {ordersByStatus[column.id]?.length || 0}
                    </span>
                  </div>
                </div>

                {/* Column Content */}
                <div className="flex-1 bg-gray-50 rounded-b-lg p-2 overflow-y-auto space-y-2">
                  {ordersByStatus[column.id]?.length > 0 ? (
                    ordersByStatus[column.id].map(order => (
                      <OrderCard
                        key={order.id}
                        order={order}
                        onEdit={() => setSelectedOrder(order)}
                        onAssignDriver={() => setAssigningOrder(order)}
                        onCreateTrip={() => setCreatingTripFor(order)}
                        onStatusChange={(status) => handleStatusChange(order.id, status)}
                      />
                    ))
                  ) : (
                    <div className="text-center py-8 text-gray-400 text-sm">
                      No orders
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Right Sidebar */}
        <div className="w-80 border-l bg-gray-50 p-4 overflow-y-auto space-y-4">
          {/* Toggle for Empty Panel */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => setShowEmptyPanel(!showEmptyPanel)}
              className="text-sm text-gray-600 hover:text-gray-800"
            >
              {showEmptyPanel ? '📦 Hide Dropped' : '📦 Show Dropped'}
            </button>
          </div>

          {/* Empty Ready Panel - Dropped containers waiting for empty confirmation */}
          {showEmptyPanel && (
            <EmptyReadyPanel onRefresh={loadData} />
          )}

          {/* Driver Panel */}
          <DriverPanel
            drivers={drivers}
            onAssignOrder={(driverId, orderId) => {
              // Handle drag-drop assignment
            }}
          />
        </div>
      </div>

      {/* Assign Driver Modal */}
      {assigningOrder && (
        <AssignDriverModal
          order={assigningOrder}
          drivers={drivers}
          tractors={tractors}
          onAssign={handleAssignDriver}
          onClose={() => setAssigningOrder(null)}
        />
      )}

      {/* Create Trip Modal - For complex trip creation with SWAP support */}
      {creatingTripFor && (
        <CreateTripModal
          deliveryOrder={creatingTripFor}
          onClose={() => setCreatingTripFor(null)}
          onSuccess={() => {
            setCreatingTripFor(null);
            loadData();
          }}
        />
      )}

      {/* Edit Order Modal */}
      {selectedOrder && (
        <EditOrderModal
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onSave={() => {
            setSelectedOrder(null);
            loadData();
          }}
        />
      )}

      {/* Dispatch Modal */}
      {dispatchTarget && (
        <DispatchModal
          container={dispatchTarget.container}
          shipment={dispatchTarget.shipment}
          existingLeg={dispatchTarget.existingLeg}
          onClose={() => setDispatchTarget(null)}
          onSuccess={() => {
            setDispatchTarget(null);
            loadData();
          }}
        />
      )}
    </div>
  );
}
