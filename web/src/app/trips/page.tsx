'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

// ============================================================================
// TYPES
// ============================================================================

interface ActiveTrip {
  // Trip info (if exists)
  trip_id?: string;
  trip_number?: string;
  is_multi_container?: boolean;

  // Primary order info
  order_id: string;
  order_number: string;
  order_status: string;
  move_type: string;
  trip_execution_type?: string;
  return_type?: string;

  // Container info
  container_id: string;
  container_number: string;
  container_size?: string;
  is_hazmat?: boolean;
  is_overweight?: boolean;
  lifecycle_status?: string;

  // Secondary container (for SWAP)
  secondary_container_id?: string;
  secondary_container_number?: string;

  // Shipment info
  shipment_id: string;
  shipment_reference?: string;
  shipment_type?: string;
  customer_name?: string;
  terminal_name?: string;
  steamship_line?: string;
  last_free_day?: string;

  // Route
  pickup_location?: string;
  pickup_city?: string;
  delivery_location?: string;
  delivery_city?: string;
  pickup_appointment?: string;
  delivery_appointment?: string;

  // Assignment
  driver_id?: string;
  driver_name?: string;
  driver_phone?: string;
  tractor_number?: string;
  chassis_number?: string;

  // Timestamps
  dispatched_at?: string;
  picked_up_at?: string;
  delivered_at?: string;
  completed_at?: string;
  created_at: string;

  // Linked orders (for multi-order trips)
  linked_orders?: {
    id: string;
    order_number: string;
    move_type: string;
    container_number: string;
    status: string;
  }[];
}

// ============================================================================
// STATUS CONFIGURATION
// ============================================================================

const STATUS_FLOW = [
  { status: 'DISPATCHED', label: 'Dispatched', icon: '📤', color: 'bg-blue-100 text-blue-800', description: 'Driver assigned, ready to go' },
  { status: 'EN_ROUTE_PICKUP', label: 'En Route to Pickup', icon: '🚛', color: 'bg-purple-100 text-purple-800', description: 'Heading to terminal/pickup' },
  { status: 'AT_PICKUP', label: 'At Pickup', icon: '📍', color: 'bg-yellow-100 text-yellow-800', description: 'Arrived at pickup location' },
  { status: 'LOADED', label: 'Loaded', icon: '📦', color: 'bg-orange-100 text-orange-800', description: 'Container loaded on chassis' },
  { status: 'IN_PROGRESS', label: 'In Transit', icon: '🚚', color: 'bg-cyan-100 text-cyan-800', description: 'En route to delivery' },
  { status: 'AT_DELIVERY', label: 'At Delivery', icon: '📍', color: 'bg-teal-100 text-teal-800', description: 'Arrived at delivery location' },
  { status: 'DELIVERED', label: 'Delivered', icon: '✅', color: 'bg-green-100 text-green-800', description: 'Container dropped/unloaded' },
  { status: 'COMPLETED', label: 'Completed', icon: '🏁', color: 'bg-green-200 text-green-900', description: 'Trip fully complete' },
];

const MOVE_TYPE_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  'IMPORT_DELIVERY': { label: 'Import Delivery', icon: '📥', color: 'bg-purple-100 text-purple-800' },
  'EXPORT_PICKUP': { label: 'Export Pickup', icon: '📤', color: 'bg-orange-100 text-orange-800' },
  'EMPTY_RETURN': { label: 'Empty Return', icon: '🔄', color: 'bg-blue-100 text-blue-800' },
  'EMPTY_PICKUP': { label: 'Empty Pickup', icon: '📦', color: 'bg-gray-100 text-gray-800' },
  'YARD_PULL': { label: 'Yard Pull', icon: '🏗️', color: 'bg-yellow-100 text-yellow-800' },
  'YARD_DELIVERY': { label: 'Yard Delivery', icon: '🏭', color: 'bg-indigo-100 text-indigo-800' },
};

const EXECUTION_TYPE_LABELS: Record<string, string> = {
  'LIVE_UNLOAD': 'Live Unload',
  'LIVE_LOAD': 'Live Load',
  'DROP': 'Drop & Go',
  'DROP_AND_HOOK': 'Drop & Hook',
  'STREET_TURN': 'Street Turn',
  'PREPULL': 'Pre-Pull',
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function TripsPage() {
  const [trips, setTrips] = useState<ActiveTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterMoveType, setFilterMoveType] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTrip, setSelectedTrip] = useState<ActiveTrip | null>(null);
  const [updating, setUpdating] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('cards');

  // Load active trips (dispatched orders)
  const loadTrips = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch all dispatched/in-progress orders
      const { data: ordersData, error } = await supabase
        .from('orders')
        .select(`
          *,
          container:containers!container_id(
            id, container_number, size, type, is_hazmat, is_overweight, lifecycle_status
          ),
          shipment:shipments!shipment_id(
            id, reference_number, type, customer_name, terminal_name, steamship_line, last_free_day
          ),
          driver:drivers!assigned_driver_id(
            id, first_name, last_name, phone
          ),
          trip:trips!assigned_trip_id(
            id, trip_number, is_multi_container, secondary_container_id, chassis_number
          )
        `)
        .is('deleted_at', null)
        .in('status', ['DISPATCHED', 'EN_ROUTE_PICKUP', 'AT_PICKUP', 'LOADED', 'IN_PROGRESS', 'AT_DELIVERY', 'DELIVERED'])
        .order('dispatched_at', { ascending: false });

      if (error) throw error;

      // Transform to ActiveTrip format
      const activeTrips: ActiveTrip[] = (ordersData || []).map((o: any) => ({
        trip_id: o.trip?.id,
        trip_number: o.trip?.trip_number,
        is_multi_container: o.trip?.is_multi_container,
        order_id: o.id,
        order_number: o.order_number,
        order_status: o.status,
        move_type: o.move_type_v2 || o.type || 'IMPORT_DELIVERY',
        trip_execution_type: o.trip_execution_type,
        return_type: o.return_type,
        container_id: o.container_id,
        container_number: o.container?.container_number || 'N/A',
        container_size: o.container?.size,
        is_hazmat: o.container?.is_hazmat,
        is_overweight: o.container?.is_overweight,
        lifecycle_status: o.container?.lifecycle_status,
        shipment_id: o.shipment_id,
        shipment_reference: o.shipment?.reference_number,
        shipment_type: o.shipment?.type,
        customer_name: o.shipment?.customer_name,
        terminal_name: o.shipment?.terminal_name,
        steamship_line: o.shipment?.steamship_line,
        last_free_day: o.shipment?.last_free_day,
        pickup_location: o.pickup_address,
        pickup_city: o.pickup_city || o.shipment?.terminal_name,
        delivery_location: o.delivery_address,
        delivery_city: o.delivery_city,
        pickup_appointment: o.pickup_appointment,
        delivery_appointment: o.delivery_appointment,
        driver_id: o.assigned_driver_id,
        driver_name: o.driver ? `${o.driver.first_name} ${o.driver.last_name}` : undefined,
        driver_phone: o.driver?.phone,
        chassis_number: o.chassis_number || o.trip?.chassis_number,
        dispatched_at: o.dispatched_at,
        picked_up_at: o.picked_up_at,
        delivered_at: o.delivered_at,
        completed_at: o.completed_at,
        created_at: o.created_at,
      }));

      setTrips(activeTrips);
    } catch (err) {
      console.error('Error loading trips:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTrips();
    // Auto-refresh every 30 seconds
    const interval = setInterval(loadTrips, 30000);
    return () => clearInterval(interval);
  }, [loadTrips]);

  // Update order status
  const updateStatus = async (orderId: string, newStatus: string) => {
    setUpdating(true);
    try {
      const updates: any = {
        status: newStatus,
        updated_at: new Date().toISOString(),
      };

      // Set timestamps based on status
      const now = new Date().toISOString();
      switch (newStatus) {
        case 'EN_ROUTE_PICKUP':
        case 'AT_PICKUP':
        case 'LOADED':
          break;
        case 'IN_PROGRESS':
          updates.picked_up_at = now;
          break;
        case 'AT_DELIVERY':
          break;
        case 'DELIVERED':
          updates.delivered_at = now;
          break;
        case 'COMPLETED':
          updates.completed_at = now;
          break;
      }

      const { error } = await supabase
        .from('orders')
        .update(updates)
        .eq('id', orderId);

      if (error) throw error;

      // If completed, update container lifecycle
      if (newStatus === 'COMPLETED') {
        const trip = trips.find(t => t.order_id === orderId);
        if (trip?.container_id) {
          // Determine new lifecycle status based on move type
          let newLifecycle = 'COMPLETED';
          if (trip.move_type === 'IMPORT_DELIVERY') {
            newLifecycle = trip.trip_execution_type === 'DROP' ? 'DROPPED' : 'DELIVERED';
          } else if (trip.move_type === 'EMPTY_RETURN') {
            newLifecycle = 'RETURNED';
          }

          await supabase
            .from('containers')
            .update({ lifecycle_status: newLifecycle, updated_at: now })
            .eq('id', trip.container_id);
        }
      }

      await loadTrips();
      setSelectedTrip(null);
    } catch (err: any) {
      alert('Error updating status: ' + err.message);
    } finally {
      setUpdating(false);
    }
  };

  // Get next status in flow
  const getNextStatus = (currentStatus: string): string | null => {
    const idx = STATUS_FLOW.findIndex(s => s.status === currentStatus);
    if (idx >= 0 && idx < STATUS_FLOW.length - 1) {
      return STATUS_FLOW[idx + 1].status;
    }
    return null;
  };

  const getStatusInfo = (status: string) => {
    return STATUS_FLOW.find(s => s.status === status) || STATUS_FLOW[0];
  };

  const getMoveTypeInfo = (moveType: string) => {
    return MOVE_TYPE_LABELS[moveType] || { label: moveType, icon: '📋', color: 'bg-gray-100 text-gray-800' };
  };

  // Filter trips
  const filteredTrips = trips.filter(trip => {
    if (filterStatus && trip.order_status !== filterStatus) return false;
    if (filterMoveType && trip.move_type !== filterMoveType) return false;
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      return (
        trip.container_number?.toLowerCase().includes(search) ||
        trip.order_number?.toLowerCase().includes(search) ||
        trip.driver_name?.toLowerCase().includes(search) ||
        trip.customer_name?.toLowerCase().includes(search) ||
        trip.shipment_reference?.toLowerCase().includes(search)
      );
    }
    return true;
  });

  // Stats
  const stats = {
    total: trips.length,
    dispatched: trips.filter(t => t.order_status === 'DISPATCHED').length,
    enRoute: trips.filter(t => ['EN_ROUTE_PICKUP', 'IN_PROGRESS'].includes(t.order_status)).length,
    atLocation: trips.filter(t => ['AT_PICKUP', 'AT_DELIVERY', 'LOADED'].includes(t.order_status)).length,
    delivered: trips.filter(t => ['DELIVERED', 'COMPLETED'].includes(t.order_status)).length,
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Active Trips</h1>
          <p className="text-gray-500 mt-1">Real-time tracking of all dispatched movements</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('cards')}
              className={`px-3 py-1.5 rounded text-sm font-medium ${viewMode === 'cards' ? 'bg-white shadow' : ''}`}
            >
              Cards
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 rounded text-sm font-medium ${viewMode === 'table' ? 'bg-white shadow' : ''}`}
            >
              Table
            </button>
          </div>
          <button
            onClick={loadTrips}
            className="px-4 py-2 border rounded-lg hover:bg-gray-50 flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-5 gap-4">
        <div
          onClick={() => { setFilterStatus(''); setFilterMoveType(''); }}
          className="bg-white rounded-xl shadow p-4 cursor-pointer hover:shadow-md transition border-l-4 border-blue-500"
        >
          <p className="text-sm text-gray-500">Active Trips</p>
          <p className="text-2xl font-bold text-blue-600">{stats.total}</p>
        </div>
        <div
          onClick={() => setFilterStatus('DISPATCHED')}
          className="bg-white rounded-xl shadow p-4 cursor-pointer hover:shadow-md transition border-l-4 border-indigo-500"
        >
          <p className="text-sm text-gray-500">Dispatched</p>
          <p className="text-2xl font-bold text-indigo-600">{stats.dispatched}</p>
        </div>
        <div
          onClick={() => setFilterStatus('IN_PROGRESS')}
          className="bg-white rounded-xl shadow p-4 cursor-pointer hover:shadow-md transition border-l-4 border-purple-500"
        >
          <p className="text-sm text-gray-500">En Route</p>
          <p className="text-2xl font-bold text-purple-600">{stats.enRoute}</p>
        </div>
        <div
          onClick={() => setFilterStatus('AT_PICKUP')}
          className="bg-white rounded-xl shadow p-4 cursor-pointer hover:shadow-md transition border-l-4 border-yellow-500"
        >
          <p className="text-sm text-gray-500">At Location</p>
          <p className="text-2xl font-bold text-yellow-600">{stats.atLocation}</p>
        </div>
        <div
          onClick={() => setFilterStatus('DELIVERED')}
          className="bg-white rounded-xl shadow p-4 cursor-pointer hover:shadow-md transition border-l-4 border-green-500"
        >
          <p className="text-sm text-gray-500">Delivered</p>
          <p className="text-2xl font-bold text-green-600">{stats.delivered}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow p-4">
        <div className="flex gap-4 items-center flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              placeholder="Search container, driver, customer..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg"
            />
          </div>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="px-4 py-2 border rounded-lg"
          >
            <option value="">All Status</option>
            {STATUS_FLOW.map(s => (
              <option key={s.status} value={s.status}>{s.icon} {s.label}</option>
            ))}
          </select>
          <select
            value={filterMoveType}
            onChange={e => setFilterMoveType(e.target.value)}
            className="px-4 py-2 border rounded-lg"
          >
            <option value="">All Move Types</option>
            {Object.entries(MOVE_TYPE_LABELS).map(([key, val]) => (
              <option key={key} value={key}>{val.icon} {val.label}</option>
            ))}
          </select>
          <button
            onClick={() => { setFilterStatus(''); setFilterMoveType(''); setSearchTerm(''); }}
            className="px-4 py-2 text-gray-600 hover:text-gray-800"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Trip List */}
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-500">Loading active trips...</p>
        </div>
      ) : viewMode === 'cards' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTrips.map(trip => {
            const statusInfo = getStatusInfo(trip.order_status);
            const moveTypeInfo = getMoveTypeInfo(trip.move_type);
            const nextStatus = getNextStatus(trip.order_status);
            const nextStatusInfo = nextStatus ? getStatusInfo(nextStatus) : null;

            return (
              <div
                key={trip.order_id}
                className="bg-white rounded-xl shadow hover:shadow-lg transition cursor-pointer overflow-hidden"
                onClick={() => setSelectedTrip(trip)}
              >
                {/* Card Header */}
                <div className={`px-4 py-3 ${statusInfo.color}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{statusInfo.icon} {statusInfo.label}</span>
                    <span className={`px-2 py-0.5 rounded text-xs ${moveTypeInfo.color}`}>
                      {moveTypeInfo.icon} {moveTypeInfo.label}
                    </span>
                  </div>
                </div>

                {/* Card Body */}
                <div className="p-4">
                  {/* Container & Driver */}
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <span className="font-mono font-bold text-lg">{trip.container_number}</span>
                      {trip.is_hazmat && <span className="ml-1" title="Hazmat">☣️</span>}
                      {trip.is_overweight && <span className="ml-1" title="Overweight">⚖️</span>}
                      <p className="text-xs text-gray-500">{trip.container_size}' • {trip.steamship_line}</p>
                    </div>
                    {trip.driver_name && (
                      <div className="text-right">
                        <p className="font-medium text-sm">{trip.driver_name}</p>
                        <p className="text-xs text-gray-500">{trip.driver_phone}</p>
                      </div>
                    )}
                  </div>

                  {/* Route */}
                  <div className="bg-gray-50 rounded-lg p-3 mb-3">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-green-600 font-bold">A</span>
                      <span>{trip.pickup_city || trip.terminal_name || 'Terminal'}</span>
                    </div>
                    <div className="ml-3 text-gray-400 text-xs">↓</div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-red-600 font-bold">B</span>
                      <span>{trip.delivery_city || 'Destination'}</span>
                    </div>
                  </div>

                  {/* Customer & LFD */}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">{trip.customer_name}</span>
                    {trip.last_free_day && (
                      <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">
                        LFD: {new Date(trip.last_free_day).toLocaleDateString()}
                      </span>
                    )}
                  </div>

                  {/* Execution Type */}
                  {trip.trip_execution_type && (
                    <div className="mt-2 text-xs text-gray-500">
                      {EXECUTION_TYPE_LABELS[trip.trip_execution_type] || trip.trip_execution_type}
                      {trip.return_type === 'HOOK_OTHER' && ' • SWAP'}
                    </div>
                  )}
                </div>

                {/* Quick Action */}
                {nextStatusInfo && trip.order_status !== 'COMPLETED' && (
                  <div className="px-4 pb-4">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        updateStatus(trip.order_id, nextStatus!);
                      }}
                      disabled={updating}
                      className={`w-full py-2 rounded-lg text-sm font-medium ${nextStatusInfo.color} hover:opacity-80 transition`}
                    >
                      → {nextStatusInfo.icon} {nextStatusInfo.label}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {filteredTrips.length === 0 && (
            <div className="col-span-full text-center py-12 text-gray-500">
              No active trips found
            </div>
          )}
        </div>
      ) : (
        /* Table View */
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Container</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Move Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Driver</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Route</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Next Step</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredTrips.map(trip => {
                  const statusInfo = getStatusInfo(trip.order_status);
                  const moveTypeInfo = getMoveTypeInfo(trip.move_type);
                  const nextStatus = getNextStatus(trip.order_status);
                  const nextStatusInfo = nextStatus ? getStatusInfo(nextStatus) : null;

                  return (
                    <tr
                      key={trip.order_id}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => setSelectedTrip(trip)}
                    >
                      <td className="px-4 py-3">
                        <div className="font-mono font-bold">{trip.container_number}</div>
                        <div className="text-xs text-gray-500">{trip.container_size}' • {trip.steamship_line}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${moveTypeInfo.color}`}>
                          {moveTypeInfo.icon} {moveTypeInfo.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{trip.customer_name}</div>
                        <div className="text-xs text-gray-500">{trip.shipment_reference}</div>
                      </td>
                      <td className="px-4 py-3">
                        {trip.driver_name ? (
                          <>
                            <div className="font-medium">{trip.driver_name}</div>
                            <div className="text-xs text-gray-500">{trip.driver_phone}</div>
                          </>
                        ) : (
                          <span className="text-red-500">Unassigned</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div>{trip.pickup_city || trip.terminal_name}</div>
                        <div className="text-gray-400">↓</div>
                        <div>{trip.delivery_city}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusInfo.color}`}>
                          {statusInfo.icon} {statusInfo.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {nextStatusInfo && trip.order_status !== 'COMPLETED' ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              updateStatus(trip.order_id, nextStatus!);
                            }}
                            disabled={updating}
                            className={`px-3 py-1 rounded text-xs font-medium ${nextStatusInfo.color} hover:opacity-80`}
                          >
                            → {nextStatusInfo.label}
                          </button>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredTrips.length === 0 && (
              <div className="text-center py-12 text-gray-500">
                No active trips found
              </div>
            )}
          </div>
        </div>
      )}

      {/* Trip Detail Modal */}
      {selectedTrip && (
        <TripDetailModal
          trip={selectedTrip}
          onClose={() => setSelectedTrip(null)}
          onUpdateStatus={updateStatus}
          updating={updating}
        />
      )}
    </div>
  );
}

// ============================================================================
// TRIP DETAIL MODAL
// ============================================================================

function TripDetailModal({
  trip,
  onClose,
  onUpdateStatus,
  updating,
}: {
  trip: ActiveTrip;
  onClose: () => void;
  onUpdateStatus: (orderId: string, status: string) => void;
  updating: boolean;
}) {
  const statusInfo = STATUS_FLOW.find(s => s.status === trip.order_status) || STATUS_FLOW[0];
  const moveTypeInfo = MOVE_TYPE_LABELS[trip.move_type] || { label: trip.move_type, icon: '📋', color: 'bg-gray-100' };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black bg-opacity-50" onClick={onClose}></div>
      <div className="relative min-h-screen flex items-center justify-center p-4">
        <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-bold text-white">{trip.container_number}</h2>
                  <span className={`px-2 py-0.5 rounded text-xs ${moveTypeInfo.color}`}>
                    {moveTypeInfo.icon} {moveTypeInfo.label}
                  </span>
                </div>
                <p className="text-indigo-200 text-sm mt-1">
                  {trip.customer_name} • {trip.shipment_reference}
                </p>
              </div>
              <button onClick={onClose} className="text-white text-2xl hover:opacity-80">×</button>
            </div>
          </div>

          <div className="p-6 overflow-y-auto max-h-[65vh]">
            {/* Status Timeline */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-3">Trip Progress</label>
              <div className="flex flex-wrap gap-2">
                {STATUS_FLOW.map((s, idx) => {
                  const currentIdx = STATUS_FLOW.findIndex(st => st.status === trip.order_status);
                  const isActive = s.status === trip.order_status;
                  const isCompleted = idx < currentIdx;
                  const isNext = idx === currentIdx + 1;

                  return (
                    <button
                      key={s.status}
                      onClick={() => isNext && onUpdateStatus(trip.order_id, s.status)}
                      disabled={!isNext || updating}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                        isActive
                          ? s.color + ' ring-2 ring-offset-2 ring-indigo-500'
                          : isCompleted
                          ? 'bg-green-100 text-green-800'
                          : isNext
                          ? 'bg-gray-100 text-gray-800 hover:bg-gray-200 cursor-pointer'
                          : 'bg-gray-50 text-gray-400 cursor-not-allowed'
                      }`}
                    >
                      {s.icon} {s.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Trip Details Grid */}
            <div className="grid grid-cols-2 gap-6 mb-6">
              {/* Driver & Equipment */}
              <div className="bg-gray-50 rounded-xl p-4">
                <h4 className="font-semibold text-gray-700 mb-3">🚛 Assignment</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Driver:</span>
                    <span className="font-medium">{trip.driver_name || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Phone:</span>
                    <span>{trip.driver_phone || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Chassis:</span>
                    <span className="font-mono">{trip.chassis_number || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Execution:</span>
                    <span>{EXECUTION_TYPE_LABELS[trip.trip_execution_type || ''] || '-'}</span>
                  </div>
                </div>
              </div>

              {/* Container Info */}
              <div className="bg-gray-50 rounded-xl p-4">
                <h4 className="font-semibold text-gray-700 mb-3">📦 Container</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Number:</span>
                    <span className="font-mono font-bold">{trip.container_number}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Size:</span>
                    <span>{trip.container_size}'</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">SSL:</span>
                    <span>{trip.steamship_line || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Status:</span>
                    <span>{trip.lifecycle_status}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Route */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="border rounded-xl p-4 bg-blue-50">
                <h4 className="font-semibold text-blue-800 mb-2 flex items-center gap-2">
                  <span className="w-6 h-6 bg-green-500 text-white rounded-full flex items-center justify-center text-xs">A</span>
                  Pickup
                </h4>
                <p className="font-medium">{trip.terminal_name || trip.pickup_city || '-'}</p>
                <p className="text-sm text-gray-600">{trip.pickup_location || '-'}</p>
                {trip.pickup_appointment && (
                  <p className="text-xs text-gray-500 mt-2">
                    Appt: {new Date(trip.pickup_appointment).toLocaleString()}
                  </p>
                )}
              </div>
              <div className="border rounded-xl p-4 bg-green-50">
                <h4 className="font-semibold text-green-800 mb-2 flex items-center gap-2">
                  <span className="w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs">B</span>
                  Delivery
                </h4>
                <p className="font-medium">{trip.delivery_city || '-'}</p>
                <p className="text-sm text-gray-600">{trip.delivery_location || '-'}</p>
                {trip.delivery_appointment && (
                  <p className="text-xs text-gray-500 mt-2">
                    Appt: {new Date(trip.delivery_appointment).toLocaleString()}
                  </p>
                )}
              </div>
            </div>

            {/* Timestamps */}
            <div className="bg-gray-50 rounded-xl p-4">
              <h4 className="font-semibold text-gray-700 mb-3">⏱️ Timeline</h4>
              <div className="grid grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">Dispatched</p>
                  <p className="font-medium">
                    {trip.dispatched_at ? new Date(trip.dispatched_at).toLocaleString() : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">Picked Up</p>
                  <p className="font-medium">
                    {trip.picked_up_at ? new Date(trip.picked_up_at).toLocaleString() : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">Delivered</p>
                  <p className="font-medium">
                    {trip.delivered_at ? new Date(trip.delivered_at).toLocaleString() : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">Completed</p>
                  <p className="font-medium">
                    {trip.completed_at ? new Date(trip.completed_at).toLocaleString() : '-'}
                  </p>
                </div>
              </div>
            </div>

            {/* SWAP Info */}
            {trip.return_type === 'HOOK_OTHER' && (
              <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-xl">
                <h4 className="font-semibold text-yellow-800 mb-2">🔀 SWAP Trip</h4>
                <p className="text-sm text-yellow-700">
                  This is a multi-container trip. After delivery, driver will pick up an empty container.
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-gray-50 border-t flex justify-end">
            <button
              onClick={onClose}
              className="px-6 py-2 border rounded-lg hover:bg-gray-100"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
