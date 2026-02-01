'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Driver, Tractor } from '@/lib/types';
import EditOrderModal from './EditOrderModal';
import CreateTripModal from './CreateTripModal';
import EmptyReadyPanel from './EmptyReadyPanel';

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

  // Container info
  container_id: string;
  container_number: string;
  container_size?: string;
  is_hazmat?: boolean;
  is_overweight?: boolean;
  customs_status?: string;

  // Shipment info
  shipment_id: string;
  shipment_reference?: string;
  shipment_type?: string;
  terminal_name?: string;
  steamship_line?: string;
  last_free_day?: string;
  customer_name?: string;

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
            container_number, size, type, is_hazmat, is_overweight, customs_status
          ),
          shipment:shipments!shipment_id(
            reference_number, type, terminal_name, steamship_line, last_free_day, customer_name
          ),
          driver:drivers!assigned_driver_id(
            id, first_name, last_name
          )
        `)
        .is('deleted_at', null)
        .in('status', ['PENDING', 'READY', 'DISPATCHED', 'IN_PROGRESS', 'COMPLETED'])
        .order('created_at', { ascending: false });

      if (ordersError) throw ordersError;

      // Transform orders
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
        is_hazmat: o.container?.is_hazmat,
        is_overweight: o.container?.is_overweight,
        customs_status: o.container?.customs_status,
        shipment_id: o.shipment_id,
        shipment_reference: o.shipment?.reference_number,
        shipment_type: o.shipment?.type,
        terminal_name: o.shipment?.terminal_name,
        steamship_line: o.shipment?.steamship_line,
        last_free_day: o.shipment?.last_free_day,
        customer_name: o.shipment?.customer_name,
        pickup_address: o.pickup_address,
        pickup_city: o.pickup_city,
        delivery_address: o.delivery_address,
        delivery_city: o.delivery_city,
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
            {filteredOrders.length} orders
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
        {/* Kanban Columns */}
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
    </div>
  );
}
