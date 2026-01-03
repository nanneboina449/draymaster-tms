'use client';

import { useState, useEffect } from 'react';
import { getTrips, updateTripStatus, Trip } from '../../lib/supabase';

export default function TrackingPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [filterStatus, setFilterStatus] = useState('');

  useEffect(() => { fetchTrips(); }, []);

  const fetchTrips = async () => {
    try {
      setLoading(true);
      const data = await getTrips();
      setTrips(data || []);
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusUpdate = async (tripId: string, newStatus: string) => {
    try {
      await updateTripStatus(tripId, newStatus);
      await fetchTrips();
      if (selectedTrip?.id === tripId) {
        setSelectedTrip({ ...selectedTrip, status: newStatus });
      }
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      'PLANNED': 'bg-gray-100 text-gray-800',
      'DISPATCHED': 'bg-blue-100 text-blue-800',
      'EN_ROUTE': 'bg-purple-100 text-purple-800',
      'AT_PICKUP': 'bg-yellow-100 text-yellow-800',
      'LOADED': 'bg-indigo-100 text-indigo-800',
      'AT_DELIVERY': 'bg-orange-100 text-orange-800',
      'DELIVERED': 'bg-green-100 text-green-800',
      'COMPLETED': 'bg-gray-100 text-gray-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getStatusIcon = (status: string) => {
    const icons: Record<string, string> = {
      'PLANNED': '📋',
      'DISPATCHED': '📤',
      'EN_ROUTE': '🚛',
      'AT_PICKUP': '📍',
      'LOADED': '📦',
      'AT_DELIVERY': '🎯',
      'DELIVERED': '✅',
      'COMPLETED': '🏁',
    };
    return icons[status] || '📋';
  };

  const activeTrips = trips.filter(t => !['COMPLETED', 'CANCELLED'].includes(t.status));
  const filteredTrips = filterStatus ? trips.filter(t => t.status === filterStatus) : trips;

  const stats = {
    total: trips.length,
    active: activeTrips.length,
    enRoute: trips.filter(t => t.status === 'EN_ROUTE').length,
    atPickup: trips.filter(t => t.status === 'AT_PICKUP').length,
    atDelivery: trips.filter(t => t.status === 'AT_DELIVERY').length,
    completed: trips.filter(t => t.status === 'COMPLETED').length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Live Tracking</h1>
          <p className="text-gray-500 mt-1">Monitor all trips in real-time</p>
        </div>
        <button onClick={fetchTrips} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2">
          🔄 Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <div className="bg-white rounded-xl shadow p-4">
          <p className="text-sm text-gray-500">Total Trips</p>
          <p className="text-2xl font-bold">{stats.total}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4 border-l-4 border-blue-500">
          <p className="text-sm text-gray-500">Active</p>
          <p className="text-2xl font-bold text-blue-600">{stats.active}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4">
          <p className="text-sm text-gray-500">🚛 En Route</p>
          <p className="text-2xl font-bold text-purple-600">{stats.enRoute}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4">
          <p className="text-sm text-gray-500">📍 At Pickup</p>
          <p className="text-2xl font-bold text-yellow-600">{stats.atPickup}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4">
          <p className="text-sm text-gray-500">🎯 At Delivery</p>
          <p className="text-2xl font-bold text-orange-600">{stats.atDelivery}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4">
          <p className="text-sm text-gray-500">✅ Completed</p>
          <p className="text-2xl font-bold text-green-600">{stats.completed}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Trip List */}
        <div className="lg:col-span-1 bg-white rounded-xl shadow overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
            <h3 className="font-semibold">All Trips</h3>
            <select 
              value={filterStatus} 
              onChange={(e) => setFilterStatus(e.target.value)}
              className="text-sm border rounded-lg px-2 py-1"
            >
              <option value="">All Status</option>
              <option value="DISPATCHED">Dispatched</option>
              <option value="EN_ROUTE">En Route</option>
              <option value="AT_PICKUP">At Pickup</option>
              <option value="LOADED">Loaded</option>
              <option value="AT_DELIVERY">At Delivery</option>
              <option value="DELIVERED">Delivered</option>
              <option value="COMPLETED">Completed</option>
            </select>
          </div>
          <div className="max-h-[600px] overflow-y-auto">
            {loading ? (
              <div className="p-8 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              </div>
            ) : filteredTrips.length === 0 ? (
              <div className="p-8 text-center text-gray-500">No trips found</div>
            ) : (
              <div className="divide-y">
                {filteredTrips.map((trip) => (
                  <div
                    key={trip.id}
                    onClick={() => setSelectedTrip(trip)}
                    className={`p-4 cursor-pointer hover:bg-gray-50 transition ${selectedTrip?.id === trip.id ? 'bg-blue-50 border-l-4 border-blue-500' : ''}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono font-semibold text-blue-600">{trip.trip_number}</span>
                      <span className={`px-2 py-0.5 text-xs rounded-full ${getStatusColor(trip.status)}`}>
                        {getStatusIcon(trip.status)} {trip.status}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600">
                      <div>📦 {trip.container_number || 'No container'}</div>
                      <div>👤 {trip.driver?.first_name} {trip.driver?.last_name || 'Unassigned'}</div>
                      <div className="text-xs text-gray-400 mt-1">
                        {trip.pickup_location} → {trip.delivery_location}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Map & Details */}
        <div className="lg:col-span-2 space-y-4">
          {/* Placeholder Map */}
          <div className="bg-white rounded-xl shadow overflow-hidden">
            <div className="bg-gradient-to-br from-blue-100 to-blue-200 h-64 flex items-center justify-center relative">
              <div className="text-center">
                <div className="text-6xl mb-2">🗺️</div>
                <p className="text-gray-600">Map Integration</p>
                <p className="text-sm text-gray-500">Google Maps / Mapbox can be integrated here</p>
              </div>
              {/* Simulated truck markers */}
              {activeTrips.slice(0, 3).map((trip, i) => (
                <div 
                  key={trip.id}
                  className="absolute bg-blue-600 text-white px-2 py-1 rounded-full text-xs flex items-center gap-1 shadow-lg"
                  style={{ top: `${20 + i * 25}%`, left: `${30 + i * 20}%` }}
                >
                  🚛 {trip.trip_number}
                </div>
              ))}
            </div>
          </div>

          {/* Selected Trip Details */}
          {selectedTrip ? (
            <div className="bg-white rounded-xl shadow p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-xl font-bold text-gray-900">{selectedTrip.trip_number}</h3>
                  <p className="text-gray-500">{selectedTrip.type}</p>
                </div>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(selectedTrip.status)}`}>
                  {getStatusIcon(selectedTrip.status)} {selectedTrip.status}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">Container</p>
                  <p className="font-mono font-semibold">{selectedTrip.container_number || '-'}</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">Driver</p>
                  <p className="font-semibold">{selectedTrip.driver?.first_name} {selectedTrip.driver?.last_name || 'Unassigned'}</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">Tractor</p>
                  <p className="font-semibold">{selectedTrip.tractor?.unit_number || '-'}</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">Chassis</p>
                  <p className="font-semibold">{selectedTrip.chassis?.chassis_number || '-'}</p>
                </div>
              </div>

              {/* Route */}
              <div className="mb-6">
                <h4 className="font-semibold mb-3">Route</h4>
                <div className="flex items-center gap-4">
                  <div className="flex-1 p-3 bg-green-50 rounded-lg border border-green-200">
                    <p className="text-xs text-green-600 font-medium">PICKUP</p>
                    <p className="font-semibold">{selectedTrip.pickup_location || '-'}</p>
                  </div>
                  <div className="text-2xl text-gray-400">→</div>
                  <div className="flex-1 p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <p className="text-xs text-blue-600 font-medium">DELIVERY</p>
                    <p className="font-semibold">{selectedTrip.delivery_location || '-'}</p>
                  </div>
                </div>
              </div>

              {/* Status Update Buttons */}
              <div>
                <h4 className="font-semibold mb-3">Update Status</h4>
                <div className="flex flex-wrap gap-2">
                  {['DISPATCHED', 'EN_ROUTE', 'AT_PICKUP', 'LOADED', 'AT_DELIVERY', 'DELIVERED', 'COMPLETED'].map((status) => (
                    <button
                      key={status}
                      onClick={() => handleStatusUpdate(selectedTrip.id, status)}
                      disabled={selectedTrip.status === status}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                        selectedTrip.status === status
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {getStatusIcon(status)} {status}
                    </button>
                  ))}
                </div>
              </div>

              {/* Timeline */}
              <div className="mt-6">
                <h4 className="font-semibold mb-3">Timeline</h4>
                <div className="space-y-3">
                  {selectedTrip.actual_start && (
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                      <div className="text-sm">
                        <span className="font-medium">Started</span>
                        <span className="text-gray-500 ml-2">{new Date(selectedTrip.actual_start).toLocaleString()}</span>
                      </div>
                    </div>
                  )}
                  {selectedTrip.pickup_arrival && (
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                      <div className="text-sm">
                        <span className="font-medium">Arrived at Pickup</span>
                        <span className="text-gray-500 ml-2">{new Date(selectedTrip.pickup_arrival).toLocaleString()}</span>
                      </div>
                    </div>
                  )}
                  {selectedTrip.pickup_departure && (
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                      <div className="text-sm">
                        <span className="font-medium">Left Pickup</span>
                        <span className="text-gray-500 ml-2">{new Date(selectedTrip.pickup_departure).toLocaleString()}</span>
                      </div>
                    </div>
                  )}
                  {selectedTrip.delivery_arrival && (
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
                      <div className="text-sm">
                        <span className="font-medium">Arrived at Delivery</span>
                        <span className="text-gray-500 ml-2">{new Date(selectedTrip.delivery_arrival).toLocaleString()}</span>
                      </div>
                    </div>
                  )}
                  {selectedTrip.actual_end && (
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 bg-green-600 rounded-full"></div>
                      <div className="text-sm">
                        <span className="font-medium">Completed</span>
                        <span className="text-gray-500 ml-2">{new Date(selectedTrip.actual_end).toLocaleString()}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow p-12 text-center">
              <div className="text-6xl mb-4">👆</div>
              <p className="text-gray-500">Select a trip to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
