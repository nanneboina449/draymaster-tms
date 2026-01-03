'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

interface Trip {
  id: string;
  trip_number: string;
  shipment_id: string;
  driver_id: string;
  truck_id: string;
  chassis_id: string;
  status: string;
  scheduled_date: string;
  container_number: string;
  seal_number: string;
  weight: number;
  pickup_location: string;
  pickup_city: string;
  pickup_state: string;
  pickup_appointment_date: string;
  pickup_appointment_time: string;
  pickup_arrival: string;
  pickup_departure: string;
  delivery_location: string;
  delivery_city: string;
  delivery_state: string;
  delivery_appointment_date: string;
  delivery_appointment_time: string;
  delivery_arrival: string;
  delivery_actual: string;
  rate: number;
  fuel_surcharge: number;
  accessorials: number;
  notes: string;
  created_at: string;
  updated_at: string;
  drivers?: { id: string; first_name: string; last_name: string; phone: string };
  equipment?: { id: string; unit_number: string };
  shipments?: { reference_number: string; customer_name: string; type: string };
}

const STATUS_FLOW = [
  { status: 'PENDING', label: 'Pending', icon: '⏳', color: 'bg-gray-100 text-gray-800' },
  { status: 'ASSIGNED', label: 'Assigned', icon: '👤', color: 'bg-blue-100 text-blue-800' },
  { status: 'DISPATCHED', label: 'Dispatched', icon: '📤', color: 'bg-indigo-100 text-indigo-800' },
  { status: 'EN_ROUTE_PICKUP', label: 'En Route to Pickup', icon: '🚛', color: 'bg-purple-100 text-purple-800' },
  { status: 'AT_PICKUP', label: 'At Pickup', icon: '📍', color: 'bg-yellow-100 text-yellow-800' },
  { status: 'LOADED', label: 'Loaded', icon: '📦', color: 'bg-orange-100 text-orange-800' },
  { status: 'EN_ROUTE_DELIVERY', label: 'En Route to Delivery', icon: '🚚', color: 'bg-cyan-100 text-cyan-800' },
  { status: 'AT_DELIVERY', label: 'At Delivery', icon: '📍', color: 'bg-teal-100 text-teal-800' },
  { status: 'DELIVERED', label: 'Delivered', icon: '✅', color: 'bg-green-100 text-green-800' },
  { status: 'COMPLETED', label: 'Completed', icon: '🏁', color: 'bg-green-200 text-green-900' },
];

export default function TripsPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterDate, setFilterDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [updating, setUpdating] = useState(false);

  // Resources for dropdowns
  const [drivers, setDrivers] = useState<any[]>([]);
  const [equipment, setEquipment] = useState<any[]>([]);
  const [chassis, setChassis] = useState<any[]>([]);

  useEffect(() => {
    fetchTrips();
    fetchResources();
  }, [filterStatus, filterDate]);

  const fetchTrips = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('trips')
        .select(`
          *,
          drivers(id, first_name, last_name, phone),
          equipment(id, unit_number),
          shipments(reference_number, customer_name, type)
        `)
        .order('scheduled_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(200);

      if (filterStatus) {
        query = query.eq('status', filterStatus);
      }

      if (filterDate) {
        query = query.gte('scheduled_date', filterDate);
        query = query.lte('scheduled_date', filterDate + 'T23:59:59');
      }

      const { data, error } = await query;
      if (error) throw error;
      setTrips(data || []);
    } catch (err) {
      console.error('Error fetching trips:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchResources = async () => {
    const [driversRes, equipmentRes, chassisRes] = await Promise.all([
      supabase.from('drivers').select('id, first_name, last_name, phone').eq('status', 'ACTIVE'),
      supabase.from('equipment').select('id, unit_number, type').eq('status', 'ACTIVE'),
      supabase.from('chassis').select('id, chassis_number, pool, size'),
    ]);
    setDrivers(driversRes.data || []);
    setEquipment(equipmentRes.data || []);
    setChassis(chassisRes.data || []);
  };

  const updateTripStatus = async (tripId: string, newStatus: string, additionalData?: any) => {
    setUpdating(true);
    try {
      const updates: any = { 
        status: newStatus,
        updated_at: new Date().toISOString(),
        ...additionalData
      };

      // Auto-set timestamps
      const now = new Date().toISOString();
      switch (newStatus) {
        case 'DISPATCHED':
          updates.dispatched_at = now;
          break;
        case 'AT_PICKUP':
          updates.pickup_arrival = now;
          break;
        case 'LOADED':
          updates.pickup_departure = now;
          break;
        case 'AT_DELIVERY':
          updates.delivery_arrival = now;
          break;
        case 'DELIVERED':
          updates.delivery_actual = now;
          break;
      }

      const { error } = await supabase
        .from('trips')
        .update(updates)
        .eq('id', tripId);

      if (error) throw error;

      // If delivered, update shipment status too
      if (newStatus === 'DELIVERED') {
        const trip = trips.find(t => t.id === tripId);
        if (trip?.shipment_id) {
          await supabase
            .from('shipments')
            .update({ status: 'DELIVERED' })
            .eq('id', trip.shipment_id);

          // Send notification
          try {
            await fetch('/api/notify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'status-change',
                shipmentId: trip.shipment_id,
                newStatus: 'DELIVERED',
                oldStatus: 'IN_TRANSIT',
              }),
            });
          } catch (e) {
            console.error('Failed to send notification:', e);
          }
        }
      }

      await fetchTrips();
      setIsModalOpen(false);
    } catch (err: any) {
      alert('Error updating trip: ' + err.message);
    } finally {
      setUpdating(false);
    }
  };

  const quickStatusUpdate = async (tripId: string, newStatus: string) => {
    await updateTripStatus(tripId, newStatus);
  };

  const getNextStatus = (currentStatus: string): string | null => {
    const currentIndex = STATUS_FLOW.findIndex(s => s.status === currentStatus);
    if (currentIndex < STATUS_FLOW.length - 1) {
      return STATUS_FLOW[currentIndex + 1].status;
    }
    return null;
  };

  const getStatusInfo = (status: string) => {
    return STATUS_FLOW.find(s => s.status === status) || STATUS_FLOW[0];
  };

  const filteredTrips = trips.filter(trip => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      trip.trip_number?.toLowerCase().includes(search) ||
      trip.container_number?.toLowerCase().includes(search) ||
      trip.shipments?.reference_number?.toLowerCase().includes(search) ||
      trip.shipments?.customer_name?.toLowerCase().includes(search) ||
      trip.drivers?.first_name?.toLowerCase().includes(search) ||
      trip.drivers?.last_name?.toLowerCase().includes(search)
    );
  });

  // Stats
  const stats = {
    total: trips.length,
    pending: trips.filter(t => t.status === 'PENDING' || t.status === 'ASSIGNED').length,
    inProgress: trips.filter(t => ['DISPATCHED', 'EN_ROUTE_PICKUP', 'AT_PICKUP', 'LOADED', 'EN_ROUTE_DELIVERY', 'AT_DELIVERY'].includes(t.status)).length,
    delivered: trips.filter(t => t.status === 'DELIVERED' || t.status === 'COMPLETED').length,
  };

  const openTripModal = (trip: Trip) => {
    setSelectedTrip(trip);
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Trip Management</h1>
          <p className="text-gray-500 mt-1">Track and update trip status in real-time</p>
        </div>
        <button
          onClick={fetchTrips}
          className="px-4 py-2 border rounded-lg hover:bg-gray-50 flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div 
          onClick={() => { setFilterStatus(''); setFilterDate(''); }}
          className="bg-white rounded-xl shadow p-4 cursor-pointer hover:shadow-md transition border-l-4 border-blue-500"
        >
          <p className="text-sm text-gray-500">Total Trips</p>
          <p className="text-2xl font-bold text-blue-600">{stats.total}</p>
        </div>
        <div 
          onClick={() => setFilterStatus('PENDING')}
          className="bg-white rounded-xl shadow p-4 cursor-pointer hover:shadow-md transition border-l-4 border-yellow-500"
        >
          <p className="text-sm text-gray-500">Pending/Assigned</p>
          <p className="text-2xl font-bold text-yellow-600">{stats.pending}</p>
        </div>
        <div 
          onClick={() => setFilterStatus('EN_ROUTE_PICKUP')}
          className="bg-white rounded-xl shadow p-4 cursor-pointer hover:shadow-md transition border-l-4 border-purple-500"
        >
          <p className="text-sm text-gray-500">In Progress</p>
          <p className="text-2xl font-bold text-purple-600">{stats.inProgress}</p>
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
              placeholder="Search trip #, container, customer, driver..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg"
            />
          </div>
          <div>
            <input
              type="date"
              value={filterDate}
              onChange={e => setFilterDate(e.target.value)}
              className="px-4 py-2 border rounded-lg"
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
          <button
            onClick={() => { setFilterDate(''); setFilterStatus(''); setSearchTerm(''); }}
            className="px-4 py-2 text-gray-600 hover:text-gray-800"
          >
            Clear Filters
          </button>
        </div>
      </div>

      {/* Trips Table */}
      <div className="bg-white rounded-xl shadow overflow-hidden">
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-gray-500">Loading trips...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Trip</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Container</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Driver / Truck</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Route</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Quick Update</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredTrips.map(trip => {
                  const statusInfo = getStatusInfo(trip.status);
                  const nextStatus = getNextStatus(trip.status);
                  const nextStatusInfo = nextStatus ? getStatusInfo(nextStatus) : null;

                  return (
                    <tr key={trip.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="font-mono font-semibold text-blue-600">{trip.trip_number || '-'}</div>
                        <div className="text-xs text-gray-500">{trip.shipments?.reference_number}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-mono font-semibold">{trip.container_number || '-'}</div>
                        <div className="text-xs text-gray-500">
                          {trip.shipments?.type === 'IMPORT' ? '📥 Import' : '📤 Export'}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{trip.shipments?.customer_name || '-'}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium">
                          {trip.drivers ? `${trip.drivers.first_name} ${trip.drivers.last_name}` : <span className="text-red-500">Unassigned</span>}
                        </div>
                        <div className="text-xs text-gray-500">{trip.equipment?.unit_number || '-'}</div>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div>{trip.pickup_city || trip.pickup_location || '-'}</div>
                        <div className="text-gray-400">↓</div>
                        <div>{trip.delivery_city || trip.delivery_location || '-'}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusInfo.color}`}>
                          {statusInfo.icon} {statusInfo.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {nextStatusInfo && trip.status !== 'DELIVERED' && trip.status !== 'COMPLETED' ? (
                          <button
                            onClick={() => quickStatusUpdate(trip.id, nextStatus!)}
                            disabled={updating}
                            className={`px-3 py-1 rounded text-xs font-medium ${nextStatusInfo.color} hover:opacity-80 transition`}
                          >
                            → {nextStatusInfo.icon} {nextStatusInfo.label}
                          </button>
                        ) : (
                          <span className="text-gray-400 text-sm">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => openTripModal(trip)}
                          className="text-blue-600 hover:underline text-sm font-medium"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredTrips.length === 0 && (
              <div className="text-center py-12 text-gray-500">
                No trips found for the selected filters
              </div>
            )}
          </div>
        )}
      </div>

      {/* Trip Detail Modal */}
      {isModalOpen && selectedTrip && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => setIsModalOpen(false)}></div>
          <div className="relative min-h-screen flex items-center justify-center p-4">
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
              {/* Modal Header */}
              <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-white">
                      Trip {selectedTrip.trip_number || 'Details'}
                    </h2>
                    <p className="text-blue-200">
                      {selectedTrip.container_number} • {selectedTrip.shipments?.customer_name}
                    </p>
                  </div>
                  <button 
                    onClick={() => setIsModalOpen(false)}
                    className="text-white text-2xl hover:opacity-80"
                  >
                    ×
                  </button>
                </div>
              </div>

              <div className="p-6 overflow-y-auto max-h-[70vh]">
                {/* Status Progress */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-3">Trip Status</label>
                  <div className="flex flex-wrap gap-2">
                    {STATUS_FLOW.map((s, idx) => {
                      const currentIdx = STATUS_FLOW.findIndex(st => st.status === selectedTrip.status);
                      const isActive = s.status === selectedTrip.status;
                      const isCompleted = idx < currentIdx;
                      const isClickable = idx <= currentIdx + 1;

                      return (
                        <button
                          key={s.status}
                          onClick={() => isClickable && updateTripStatus(selectedTrip.id, s.status)}
                          disabled={!isClickable || updating}
                          className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                            isActive 
                              ? s.color + ' ring-2 ring-offset-2 ring-blue-500' 
                              : isCompleted
                                ? 'bg-green-100 text-green-800'
                                : isClickable
                                  ? 'bg-gray-100 text-gray-600 hover:bg-gray-200 cursor-pointer'
                                  : 'bg-gray-50 text-gray-400 cursor-not-allowed'
                          }`}
                        >
                          {s.icon} {s.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Assignment */}
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Driver</label>
                    <select
                      value={selectedTrip.driver_id || ''}
                      onChange={e => setSelectedTrip({ ...selectedTrip, driver_id: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                    >
                      <option value="">Select Driver</option>
                      {drivers.map(d => (
                        <option key={d.id} value={d.id}>{d.first_name} {d.last_name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Truck</label>
                    <select
                      value={selectedTrip.truck_id || ''}
                      onChange={e => setSelectedTrip({ ...selectedTrip, truck_id: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                    >
                      <option value="">Select Truck</option>
                      {equipment.filter(e => e.type === 'TRUCK').map(t => (
                        <option key={t.id} value={t.id}>{t.unit_number}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Chassis</label>
                    <select
                      value={selectedTrip.chassis_id || ''}
                      onChange={e => setSelectedTrip({ ...selectedTrip, chassis_id: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                    >
                      <option value="">Select Chassis</option>
                      {chassis.map(c => (
                        <option key={c.id} value={c.id}>{c.chassis_number} ({c.pool})</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Container Info */}
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Container #</label>
                    <input
                      value={selectedTrip.container_number || ''}
                      onChange={e => setSelectedTrip({ ...selectedTrip, container_number: e.target.value.toUpperCase() })}
                      className="w-full px-3 py-2 border rounded-lg font-mono"
                      placeholder="ABCD1234567"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Seal #</label>
                    <input
                      value={selectedTrip.seal_number || ''}
                      onChange={e => setSelectedTrip({ ...selectedTrip, seal_number: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Weight (lbs)</label>
                    <input
                      type="number"
                      value={selectedTrip.weight || ''}
                      onChange={e => setSelectedTrip({ ...selectedTrip, weight: parseInt(e.target.value) })}
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </div>
                </div>

                {/* Pickup & Delivery */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="border rounded-lg p-4 bg-blue-50">
                    <h4 className="font-semibold text-blue-800 mb-3">📍 Pickup</h4>
                    <div className="space-y-2 text-sm">
                      <div>
                        <span className="text-gray-600">Location:</span>
                        <span className="ml-2 font-medium">{selectedTrip.pickup_location || selectedTrip.pickup_city || '-'}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Appointment:</span>
                        <span className="ml-2">{selectedTrip.pickup_appointment_date} {selectedTrip.pickup_appointment_time}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Arrival:</span>
                        <span className="ml-2">{selectedTrip.pickup_arrival ? new Date(selectedTrip.pickup_arrival).toLocaleString() : '-'}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Departure:</span>
                        <span className="ml-2">{selectedTrip.pickup_departure ? new Date(selectedTrip.pickup_departure).toLocaleString() : '-'}</span>
                      </div>
                    </div>
                  </div>
                  <div className="border rounded-lg p-4 bg-green-50">
                    <h4 className="font-semibold text-green-800 mb-3">📍 Delivery</h4>
                    <div className="space-y-2 text-sm">
                      <div>
                        <span className="text-gray-600">Location:</span>
                        <span className="ml-2 font-medium">{selectedTrip.delivery_location || selectedTrip.delivery_city || '-'}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Appointment:</span>
                        <span className="ml-2">{selectedTrip.delivery_appointment_date} {selectedTrip.delivery_appointment_time}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Arrival:</span>
                        <span className="ml-2">{selectedTrip.delivery_arrival ? new Date(selectedTrip.delivery_arrival).toLocaleString() : '-'}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Delivered:</span>
                        <span className="ml-2">{selectedTrip.delivery_actual ? new Date(selectedTrip.delivery_actual).toLocaleString() : '-'}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Notes */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                  <textarea
                    value={selectedTrip.notes || ''}
                    onChange={e => setSelectedTrip({ ...selectedTrip, notes: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                    rows={3}
                    placeholder="Add any notes about this trip..."
                  />
                </div>
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-4 bg-gray-50 border-t flex justify-between">
                <div className="text-sm text-gray-500">
                  Last updated: {selectedTrip.updated_at ? new Date(selectedTrip.updated_at).toLocaleString() : '-'}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 border rounded-lg hover:bg-gray-100"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => updateTripStatus(selectedTrip.id, selectedTrip.status, {
                      driver_id: selectedTrip.driver_id,
                      truck_id: selectedTrip.truck_id,
                      chassis_id: selectedTrip.chassis_id,
                      container_number: selectedTrip.container_number,
                      seal_number: selectedTrip.seal_number,
                      weight: selectedTrip.weight,
                      notes: selectedTrip.notes,
                    })}
                    disabled={updating}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
                  >
                    {updating ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
