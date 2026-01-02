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
  trip_type: string;
  scheduled_date: string;
  pickup_location: string;
  pickup_address: string;
  pickup_city: string;
  pickup_state: string;
  pickup_appointment: string;
  pickup_actual: string;
  delivery_location: string;
  delivery_address: string;
  delivery_city: string;
  delivery_state: string;
  delivery_appointment: string;
  delivery_actual: string;
  container_number: string;
  seal_number: string;
  weight: number;
  miles: number;
  rate: number;
  fuel_surcharge: number;
  accessorials: number;
  total_pay: number;
  notes: string;
  created_at: string;
  drivers?: { first_name: string; last_name: string };
  equipment?: { unit_number: string };
  shipments?: { reference_number: string; customer_name: string };
}

interface TripLeg {
  id: string;
  trip_id: string;
  leg_number: number;
  leg_type: string;
  location_name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  appointment_time: string;
  arrival_time: string;
  departure_time: string;
  status: string;
  notes: string;
}

export default function TripsPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0]);
  const [searchTerm, setSearchTerm] = useState('');

  // Edit modal
  const [editingTrip, setEditingTrip] = useState<Trip | null>(null);
  const [tripLegs, setTripLegs] = useState<TripLeg[]>([]);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // Drivers and equipment for dropdowns
  const [drivers, setDrivers] = useState<any[]>([]);
  const [equipment, setEquipment] = useState<any[]>([]);
  const [chassis, setChassis] = useState<any[]>([]);

  useEffect(() => {
    fetchTrips();
    fetchDriversAndEquipment();
  }, [filterStatus, filterDate]);

  const fetchTrips = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('trips')
        .select(`
          *,
          drivers(first_name, last_name),
          equipment(unit_number),
          shipments(reference_number, customer_name)
        `)
        .order('scheduled_date', { ascending: false })
        .limit(100);

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

  const fetchDriversAndEquipment = async () => {
    const [driversRes, equipmentRes, chassisRes] = await Promise.all([
      supabase.from('drivers').select('id, first_name, last_name').eq('status', 'ACTIVE'),
      supabase.from('equipment').select('id, unit_number, type').eq('status', 'ACTIVE'),
      supabase.from('chassis').select('id, chassis_number, pool').eq('status', 'AVAILABLE'),
    ]);
    setDrivers(driversRes.data || []);
    setEquipment(equipmentRes.data || []);
    setChassis(chassisRes.data || []);
  };

  const fetchTripLegs = async (tripId: string) => {
    const { data } = await supabase
      .from('trip_legs')
      .select('*')
      .eq('trip_id', tripId)
      .order('leg_number');
    setTripLegs(data || []);
  };

  const openEditModal = async (trip: Trip) => {
    setEditingTrip(trip);
    await fetchTripLegs(trip.id);
    setIsEditModalOpen(true);
  };

  const updateTrip = async () => {
    if (!editingTrip) return;

    try {
      const { error } = await supabase
        .from('trips')
        .update({
          driver_id: editingTrip.driver_id,
          truck_id: editingTrip.truck_id,
          chassis_id: editingTrip.chassis_id,
          status: editingTrip.status,
          scheduled_date: editingTrip.scheduled_date,
          pickup_appointment: editingTrip.pickup_appointment,
          pickup_actual: editingTrip.pickup_actual,
          delivery_appointment: editingTrip.delivery_appointment,
          delivery_actual: editingTrip.delivery_actual,
          container_number: editingTrip.container_number,
          seal_number: editingTrip.seal_number,
          weight: editingTrip.weight,
          miles: editingTrip.miles,
          rate: editingTrip.rate,
          fuel_surcharge: editingTrip.fuel_surcharge,
          accessorials: editingTrip.accessorials,
          notes: editingTrip.notes,
        })
        .eq('id', editingTrip.id);

      if (error) throw error;

      // Update shipment status if trip completed
      if (editingTrip.status === 'DELIVERED' && editingTrip.shipment_id) {
        await supabase
          .from('shipments')
          .update({ status: 'DELIVERED' })
          .eq('id', editingTrip.shipment_id);
      }

      alert('Trip updated successfully!');
      setIsEditModalOpen(false);
      fetchTrips();
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const updateTripStatus = async (tripId: string, newStatus: string) => {
    try {
      const updates: any = { status: newStatus };
      
      // Auto-set timestamps based on status
      if (newStatus === 'EN_ROUTE_PICKUP') {
        updates.departed_at = new Date().toISOString();
      } else if (newStatus === 'AT_PICKUP') {
        updates.pickup_arrival = new Date().toISOString();
      } else if (newStatus === 'LOADED') {
        updates.pickup_actual = new Date().toISOString();
      } else if (newStatus === 'EN_ROUTE_DELIVERY') {
        updates.pickup_departure = new Date().toISOString();
      } else if (newStatus === 'AT_DELIVERY') {
        updates.delivery_arrival = new Date().toISOString();
      } else if (newStatus === 'DELIVERED') {
        updates.delivery_actual = new Date().toISOString();
      }

      await supabase.from('trips').update(updates).eq('id', tripId);
      fetchTrips();
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const updateLegStatus = async (legId: string, status: string, timeField?: string) => {
    try {
      const updates: any = { status };
      if (timeField) {
        updates[timeField] = new Date().toISOString();
      }
      await supabase.from('trip_legs').update(updates).eq('id', legId);
      if (editingTrip) {
        await fetchTripLegs(editingTrip.id);
      }
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      'PENDING': 'bg-gray-100 text-gray-800',
      'ASSIGNED': 'bg-blue-100 text-blue-800',
      'DISPATCHED': 'bg-indigo-100 text-indigo-800',
      'EN_ROUTE_PICKUP': 'bg-purple-100 text-purple-800',
      'AT_PICKUP': 'bg-yellow-100 text-yellow-800',
      'LOADED': 'bg-orange-100 text-orange-800',
      'EN_ROUTE_DELIVERY': 'bg-cyan-100 text-cyan-800',
      'AT_DELIVERY': 'bg-teal-100 text-teal-800',
      'DELIVERED': 'bg-green-100 text-green-800',
      'COMPLETED': 'bg-green-100 text-green-800',
      'CANCELLED': 'bg-red-100 text-red-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const statusOptions = [
    'PENDING', 'ASSIGNED', 'DISPATCHED', 'EN_ROUTE_PICKUP', 'AT_PICKUP',
    'LOADED', 'EN_ROUTE_DELIVERY', 'AT_DELIVERY', 'DELIVERED', 'COMPLETED', 'CANCELLED'
  ];

  const filteredTrips = trips.filter(trip => {
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      return (
        trip.trip_number?.toLowerCase().includes(search) ||
        trip.container_number?.toLowerCase().includes(search) ||
        trip.shipments?.reference_number?.toLowerCase().includes(search) ||
        trip.shipments?.customer_name?.toLowerCase().includes(search) ||
        trip.drivers?.first_name?.toLowerCase().includes(search) ||
        trip.drivers?.last_name?.toLowerCase().includes(search)
      );
    }
    return true;
  });

  // Stats
  const stats = {
    total: trips.length,
    dispatched: trips.filter(t => t.status === 'DISPATCHED').length,
    enRoute: trips.filter(t => ['EN_ROUTE_PICKUP', 'EN_ROUTE_DELIVERY'].includes(t.status)).length,
    delivered: trips.filter(t => t.status === 'DELIVERED').length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Trips</h1>
          <p className="text-gray-500 mt-1">Manage dispatched loads and update trip status</p>
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

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow p-4 border-l-4 border-blue-500">
          <p className="text-sm text-gray-500">Total Trips</p>
          <p className="text-2xl font-bold text-blue-600">{stats.total}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4 border-l-4 border-indigo-500">
          <p className="text-sm text-gray-500">Dispatched</p>
          <p className="text-2xl font-bold text-indigo-600">{stats.dispatched}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4 border-l-4 border-purple-500">
          <p className="text-sm text-gray-500">En Route</p>
          <p className="text-2xl font-bold text-purple-600">{stats.enRoute}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4 border-l-4 border-green-500">
          <p className="text-sm text-gray-500">Delivered Today</p>
          <p className="text-2xl font-bold text-green-600">{stats.delivered}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow p-4">
        <div className="flex gap-4 items-center">
          <div className="flex-1">
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
            {statusOptions.map(s => (
              <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
            ))}
          </select>
          <button
            onClick={() => { setFilterDate(''); setFilterStatus(''); setSearchTerm(''); }}
            className="px-4 py-2 text-gray-600 hover:text-gray-800"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Trips Table */}
      <div className="bg-white rounded-xl shadow overflow-hidden">
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Trip #</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Container</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Driver</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Pickup</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Delivery</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Quick Update</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredTrips.map(trip => (
                  <tr key={trip.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <span className="font-mono font-semibold text-blue-600">{trip.trip_number}</span>
                      <br/>
                      <span className="text-xs text-gray-500">{trip.shipments?.reference_number}</span>
                    </td>
                    <td className="px-4 py-3 font-mono">{trip.container_number || '-'}</td>
                    <td className="px-4 py-3">{trip.shipments?.customer_name || '-'}</td>
                    <td className="px-4 py-3">
                      {trip.drivers ? `${trip.drivers.first_name} ${trip.drivers.last_name}` : '-'}
                      <br/>
                      <span className="text-xs text-gray-500">{trip.equipment?.unit_number}</span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <p>{trip.pickup_location || trip.pickup_city}</p>
                      <p className="text-xs text-gray-500">
                        {trip.pickup_appointment ? new Date(trip.pickup_appointment).toLocaleString() : '-'}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <p>{trip.delivery_location || trip.delivery_city}</p>
                      <p className="text-xs text-gray-500">
                        {trip.delivery_appointment ? new Date(trip.delivery_appointment).toLocaleString() : '-'}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs ${getStatusColor(trip.status)}`}>
                        {trip.status?.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={trip.status}
                        onChange={e => updateTripStatus(trip.id, e.target.value)}
                        className="text-xs px-2 py-1 border rounded"
                      >
                        {statusOptions.map(s => (
                          <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => openEditModal(trip)}
                        className="text-blue-600 hover:underline text-sm"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
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

      {/* Edit Trip Modal */}
      {isEditModalOpen && editingTrip && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => setIsEditModalOpen(false)}></div>
          <div className="relative min-h-screen flex items-center justify-center p-4">
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
              <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-white">Edit Trip {editingTrip.trip_number}</h2>
                    <p className="text-blue-200">{editingTrip.container_number}</p>
                  </div>
                  <button onClick={() => setIsEditModalOpen(false)} className="text-white text-2xl">&times;</button>
                </div>
              </div>

              <div className="p-6 overflow-y-auto max-h-[70vh]">
                {/* Status */}
                <div className="mb-6">
                  <label className="block text-sm font-medium mb-2">Status</label>
                  <div className="flex flex-wrap gap-2">
                    {statusOptions.map(s => (
                      <button
                        key={s}
                        onClick={() => setEditingTrip({ ...editingTrip, status: s })}
                        className={`px-3 py-1 rounded-full text-sm transition ${
                          editingTrip.status === s
                            ? getStatusColor(s) + ' ring-2 ring-offset-2 ring-blue-500'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {s.replace(/_/g, ' ')}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Assignment */}
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div>
                    <label className="block text-sm font-medium mb-1">Driver</label>
                    <select
                      value={editingTrip.driver_id || ''}
                      onChange={e => setEditingTrip({ ...editingTrip, driver_id: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                    >
                      <option value="">Select Driver</option>
                      {drivers.map(d => (
                        <option key={d.id} value={d.id}>{d.first_name} {d.last_name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Truck</label>
                    <select
                      value={editingTrip.truck_id || ''}
                      onChange={e => setEditingTrip({ ...editingTrip, truck_id: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                    >
                      <option value="">Select Truck</option>
                      {equipment.filter(e => e.type === 'TRUCK').map(t => (
                        <option key={t.id} value={t.id}>{t.unit_number}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Chassis</label>
                    <select
                      value={editingTrip.chassis_id || ''}
                      onChange={e => setEditingTrip({ ...editingTrip, chassis_id: e.target.value })}
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
                    <label className="block text-sm font-medium mb-1">Container #</label>
                    <input
                      value={editingTrip.container_number || ''}
                      onChange={e => setEditingTrip({ ...editingTrip, container_number: e.target.value.toUpperCase() })}
                      className="w-full px-3 py-2 border rounded-lg font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Seal #</label>
                    <input
                      value={editingTrip.seal_number || ''}
                      onChange={e => setEditingTrip({ ...editingTrip, seal_number: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Weight (lbs)</label>
                    <input
                      type="number"
                      value={editingTrip.weight || ''}
                      onChange={e => setEditingTrip({ ...editingTrip, weight: parseInt(e.target.value) })}
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </div>
                </div>

                {/* Appointments */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="border rounded-lg p-4">
                    <h4 className="font-medium mb-3">📍 Pickup</h4>
                    <p className="text-sm text-gray-600 mb-2">{editingTrip.pickup_location}</p>
                    <div className="space-y-2">
                      <div>
                        <label className="block text-xs text-gray-500">Appointment</label>
                        <input
                          type="datetime-local"
                          value={editingTrip.pickup_appointment?.slice(0, 16) || ''}
                          onChange={e => setEditingTrip({ ...editingTrip, pickup_appointment: e.target.value })}
                          className="w-full px-2 py-1 border rounded text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500">Actual Pickup</label>
                        <input
                          type="datetime-local"
                          value={editingTrip.pickup_actual?.slice(0, 16) || ''}
                          onChange={e => setEditingTrip({ ...editingTrip, pickup_actual: e.target.value })}
                          className="w-full px-2 py-1 border rounded text-sm"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="border rounded-lg p-4">
                    <h4 className="font-medium mb-3">📍 Delivery</h4>
                    <p className="text-sm text-gray-600 mb-2">{editingTrip.delivery_location}</p>
                    <div className="space-y-2">
                      <div>
                        <label className="block text-xs text-gray-500">Appointment</label>
                        <input
                          type="datetime-local"
                          value={editingTrip.delivery_appointment?.slice(0, 16) || ''}
                          onChange={e => setEditingTrip({ ...editingTrip, delivery_appointment: e.target.value })}
                          className="w-full px-2 py-1 border rounded text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500">Actual Delivery</label>
                        <input
                          type="datetime-local"
                          value={editingTrip.delivery_actual?.slice(0, 16) || ''}
                          onChange={e => setEditingTrip({ ...editingTrip, delivery_actual: e.target.value })}
                          className="w-full px-2 py-1 border rounded text-sm"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Trip Legs */}
                {tripLegs.length > 0 && (
                  <div className="mb-6">
                    <h4 className="font-medium mb-3">Trip Legs</h4>
                    <div className="space-y-2">
                      {tripLegs.map((leg, idx) => (
                        <div key={leg.id} className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
                          <span className="w-8 h-8 bg-blue-100 text-blue-800 rounded-full flex items-center justify-center font-bold">
                            {leg.leg_number}
                          </span>
                          <div className="flex-1">
                            <p className="font-medium">{leg.leg_type}: {leg.location_name}</p>
                            <p className="text-sm text-gray-500">{leg.address}, {leg.city}, {leg.state}</p>
                          </div>
                          <div className="text-sm">
                            <span className={`px-2 py-1 rounded text-xs ${getStatusColor(leg.status)}`}>
                              {leg.status}
                            </span>
                          </div>
                          <div className="flex gap-1">
                            {leg.status === 'PENDING' && (
                              <button
                                onClick={() => updateLegStatus(leg.id, 'ARRIVED', 'arrival_time')}
                                className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs"
                              >
                                Arrived
                              </button>
                            )}
                            {leg.status === 'ARRIVED' && (
                              <button
                                onClick={() => updateLegStatus(leg.id, 'COMPLETED', 'departure_time')}
                                className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs"
                              >
                                Complete
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Rates */}
                <div className="grid grid-cols-4 gap-4 mb-6">
                  <div>
                    <label className="block text-sm font-medium mb-1">Miles</label>
                    <input
                      type="number"
                      value={editingTrip.miles || ''}
                      onChange={e => setEditingTrip({ ...editingTrip, miles: parseInt(e.target.value) })}
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Rate ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={editingTrip.rate || ''}
                      onChange={e => setEditingTrip({ ...editingTrip, rate: parseFloat(e.target.value) })}
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Fuel Surcharge ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={editingTrip.fuel_surcharge || ''}
                      onChange={e => setEditingTrip({ ...editingTrip, fuel_surcharge: parseFloat(e.target.value) })}
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Accessorials ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={editingTrip.accessorials || ''}
                      onChange={e => setEditingTrip({ ...editingTrip, accessorials: parseFloat(e.target.value) })}
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </div>
                </div>

                {/* Notes */}
                <div className="mb-6">
                  <label className="block text-sm font-medium mb-1">Notes</label>
                  <textarea
                    value={editingTrip.notes || ''}
                    onChange={e => setEditingTrip({ ...editingTrip, notes: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                    rows={3}
                  />
                </div>
              </div>

              <div className="px-6 py-4 bg-gray-50 border-t flex justify-between">
                <div className="text-sm text-gray-500">
                  Total: ${((editingTrip.rate || 0) + (editingTrip.fuel_surcharge || 0) + (editingTrip.accessorials || 0)).toFixed(2)}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setIsEditModalOpen(false)}
                    className="px-4 py-2 border rounded-lg hover:bg-gray-100"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={updateTrip}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Save Changes
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
