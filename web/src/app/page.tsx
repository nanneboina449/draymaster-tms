'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface DashboardStats {
  totalShipments: number;
  availableContainers: number;
  lfdAlerts: number;
  tripsToday: number;
  tripsInProgress: number;
  pendingDispatch: number;
  perDiemAlerts: number;
  deliveredToday: number;
}

interface LfdAlert {
  id: string;
  reference_number: string;
  container_number: string;
  terminal_name: string;
  last_free_day: string;
  days_until_lfd: number;
  has_holds: boolean;
  status: string;
}

interface TodayAppointment {
  id: string;
  trip_number: string;
  container_number: string;
  type: 'PICKUP' | 'DELIVERY';
  location: string;
  appointment_time: string;
  driver_name: string;
  truck_number: string;
  status: string;
}

interface TripInProgress {
  id: string;
  trip_number: string;
  container_number: string;
  driver_name: string;
  truck_number: string;
  status: string;
  current_leg: string;
  pickup_location: string;
  delivery_location: string;
  updated_at: string;
}

interface AvailableContainer {
  id: string;
  reference_number: string;
  container_number: string;
  terminal_name: string;
  last_free_day: string;
  days_until_lfd: number;
  customer_name: string;
  delivery_city: string;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    totalShipments: 0,
    availableContainers: 0,
    lfdAlerts: 0,
    tripsToday: 0,
    tripsInProgress: 0,
    pendingDispatch: 0,
    perDiemAlerts: 0,
    deliveredToday: 0,
  });
  const [lfdAlerts, setLfdAlerts] = useState<LfdAlert[]>([]);
  const [todayAppointments, setTodayAppointments] = useState<TodayAppointment[]>([]);
  const [tripsInProgress, setTripsInProgress] = useState<TripInProgress[]>([]);
  const [availableContainers, setAvailableContainers] = useState<AvailableContainer[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    fetchDashboardData();
    // Refresh every 5 minutes
    const interval = setInterval(fetchDashboardData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    const today = new Date().toISOString().split('T')[0];
    const twoDaysFromNow = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    try {
      // Fetch all shipments
      const { data: shipments } = await supabase
        .from('shipments')
        .select('*')
        .not('status', 'in', '("CANCELLED")');

      // Fetch all trips
      const { data: trips } = await supabase
        .from('trips')
        .select('*, drivers(first_name, last_name), equipment(unit_number)')
        .order('created_at', { ascending: false });

      // Fetch chassis for per-diem
      const { data: chassisOut } = await supabase
        .from('chassis')
        .select('*')
        .eq('status', 'OUT');

      // Calculate stats
      const availableShipments = shipments?.filter(s => s.status === 'AVAILABLE') || [];
      const lfdShipments = shipments?.filter(s => {
        if (!s.last_free_day || ['DELIVERED', 'COMPLETED', 'CANCELLED'].includes(s.status)) return false;
        const lfd = new Date(s.last_free_day);
        const diffDays = Math.ceil((lfd.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        return diffDays <= 2;
      }) || [];

      const todayTrips = trips?.filter(t => {
        const tripDate = t.scheduled_date || t.created_at;
        return tripDate?.startsWith(today);
      }) || [];

      const inProgressTrips = trips?.filter(t => 
        ['DISPATCHED', 'EN_ROUTE_PICKUP', 'AT_PICKUP', 'LOADED', 'EN_ROUTE_DELIVERY', 'AT_DELIVERY'].includes(t.status)
      ) || [];

      const pendingTrips = trips?.filter(t => t.status === 'PENDING' || t.status === 'ASSIGNED') || [];
      
      const deliveredToday = trips?.filter(t => {
        if (t.status !== 'DELIVERED' && t.status !== 'COMPLETED') return false;
        const deliveredDate = t.delivery_actual || t.updated_at;
        return deliveredDate?.startsWith(today);
      }) || [];

      // Per-diem alerts (chassis out more than 4 days)
      const perDiemChassis = chassisOut?.filter(c => {
        if (!c.out_date) return false;
        const daysOut = Math.ceil((Date.now() - new Date(c.out_date).getTime()) / (1000 * 60 * 60 * 24));
        return daysOut > 4;
      }) || [];

      setStats({
        totalShipments: shipments?.length || 0,
        availableContainers: availableShipments.length,
        lfdAlerts: lfdShipments.length,
        tripsToday: todayTrips.length,
        tripsInProgress: inProgressTrips.length,
        pendingDispatch: pendingTrips.length,
        perDiemAlerts: perDiemChassis.length,
        deliveredToday: deliveredToday.length,
      });

      // LFD Alerts detail
      setLfdAlerts(lfdShipments.map(s => {
        const lfd = new Date(s.last_free_day);
        const diffDays = Math.ceil((lfd.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        return {
          id: s.id,
          reference_number: s.reference_number,
          container_number: extractContainer(s.special_instructions) || 'N/A',
          terminal_name: s.terminal_name || 'Unknown',
          last_free_day: s.last_free_day,
          days_until_lfd: diffDays,
          has_holds: s.special_instructions?.toLowerCase().includes('hold') || false,
          status: s.status,
        };
      }).sort((a, b) => a.days_until_lfd - b.days_until_lfd));

      // Available containers
      setAvailableContainers(availableShipments.map(s => {
        const lfd = s.last_free_day ? new Date(s.last_free_day) : null;
        const diffDays = lfd ? Math.ceil((lfd.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : 99;
        return {
          id: s.id,
          reference_number: s.reference_number,
          container_number: extractContainer(s.special_instructions) || 'N/A',
          terminal_name: s.terminal_name || 'Unknown',
          last_free_day: s.last_free_day,
          days_until_lfd: diffDays,
          customer_name: s.customer_name,
          delivery_city: s.delivery_city,
        };
      }).sort((a, b) => a.days_until_lfd - b.days_until_lfd));

      // Trips in progress
      setTripsInProgress(inProgressTrips.slice(0, 10).map(t => ({
        id: t.id,
        trip_number: t.trip_number || 'N/A',
        container_number: t.container_number || 'N/A',
        driver_name: t.drivers ? `${t.drivers.first_name} ${t.drivers.last_name}` : 'Unassigned',
        truck_number: t.equipment?.unit_number || 'N/A',
        status: t.status,
        current_leg: getStatusDescription(t.status),
        pickup_location: t.pickup_location || t.pickup_city || 'N/A',
        delivery_location: t.delivery_location || t.delivery_city || 'N/A',
        updated_at: t.updated_at,
      })));

      // Today's appointments
      const appointments: TodayAppointment[] = [];
      todayTrips.forEach(t => {
        if (t.pickup_appointment_time) {
          appointments.push({
            id: t.id + '-pickup',
            trip_number: t.trip_number,
            container_number: t.container_number || 'N/A',
            type: 'PICKUP',
            location: t.pickup_location || t.pickup_city || 'N/A',
            appointment_time: t.pickup_appointment_time,
            driver_name: t.drivers ? `${t.drivers.first_name} ${t.drivers.last_name}` : 'Unassigned',
            truck_number: t.equipment?.unit_number || 'N/A',
            status: t.status,
          });
        }
        if (t.delivery_appointment_time) {
          appointments.push({
            id: t.id + '-delivery',
            trip_number: t.trip_number,
            container_number: t.container_number || 'N/A',
            type: 'DELIVERY',
            location: t.delivery_location || t.delivery_city || 'N/A',
            appointment_time: t.delivery_appointment_time,
            driver_name: t.drivers ? `${t.drivers.first_name} ${t.drivers.last_name}` : 'Unassigned',
            truck_number: t.equipment?.unit_number || 'N/A',
            status: t.status,
          });
        }
      });
      setTodayAppointments(appointments.sort((a, b) => 
        a.appointment_time.localeCompare(b.appointment_time)
      ));

      // Get last sync time
      const { data: syncLog } = await supabase
        .from('emodal_sync_log')
        .select('synced_at')
        .order('synced_at', { ascending: false })
        .limit(1)
        .single();
      
      if (syncLog) {
        setLastSync(syncLog.synced_at);
      }

    } catch (err) {
      console.error('Error fetching dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  const extractContainer = (instructions: string | null): string | null => {
    if (!instructions) return null;
    const match = instructions.match(/Container:\s*([A-Z]{4}\d{7})/i);
    return match ? match[1] : null;
  };

  const getStatusDescription = (status: string): string => {
    const descriptions: Record<string, string> = {
      'DISPATCHED': '📤 Dispatched',
      'EN_ROUTE_PICKUP': '🚛 En Route to Pickup',
      'AT_PICKUP': '📍 At Pickup Location',
      'LOADED': '📦 Loaded',
      'EN_ROUTE_DELIVERY': '🚚 En Route to Delivery',
      'AT_DELIVERY': '📍 At Delivery Location',
    };
    return descriptions[status] || status;
  };

  const getStatusColor = (status: string): string => {
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
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const triggerEmodalSync = async () => {
    setSyncing(true);
    try {
      const response = await fetch('/api/emodal-sync', { method: 'POST' });
      const result = await response.json();
      if (result.success) {
        await fetchDashboardData();
        alert(`Sync complete! Updated ${result.containersUpdated || 0} containers.`);
      } else {
        alert('Sync failed: ' + (result.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Sync failed: Network error');
    } finally {
      setSyncing(false);
    }
  };

  const formatTime = (timeStr: string) => {
    if (!timeStr) return '-';
    try {
      return new Date(`2000-01-01T${timeStr}`).toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
      });
    } catch {
      return timeStr;
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString();
  };

  const today = new Date().toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Operations Dashboard</h1>
          <p className="text-gray-500 mt-1">{today}</p>
        </div>
        <div className="flex items-center gap-4">
          {lastSync && (
            <span className="text-sm text-gray-500">
              Last sync: {new Date(lastSync).toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={triggerEmodalSync}
            disabled={syncing}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 flex items-center gap-2"
          >
            {syncing ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                Syncing...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Sync eModal
              </>
            )}
          </button>
          <button
            onClick={fetchDashboardData}
            className="px-4 py-2 border rounded-lg hover:bg-gray-50"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow p-5 border-l-4 border-blue-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Today's Trips</p>
              <p className="text-3xl font-bold text-blue-600">{stats.tripsToday}</p>
            </div>
            <div className="text-4xl">📅</div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow p-5 border-l-4 border-green-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Available Now</p>
              <p className="text-3xl font-bold text-green-600">{stats.availableContainers}</p>
            </div>
            <div className="text-4xl">✅</div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow p-5 border-l-4 border-red-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">⚠️ LFD Alerts</p>
              <p className="text-3xl font-bold text-red-600">{stats.lfdAlerts}</p>
            </div>
            <div className="text-4xl">🚨</div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow p-5 border-l-4 border-orange-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Per-Diem Alerts</p>
              <p className="text-3xl font-bold text-orange-600">{stats.perDiemAlerts}</p>
            </div>
            <div className="text-4xl">💰</div>
          </div>
        </div>
      </div>

      {/* Second Row Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow p-4">
          <p className="text-sm text-gray-500">In Progress</p>
          <p className="text-2xl font-bold text-purple-600">{stats.tripsInProgress}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4">
          <p className="text-sm text-gray-500">Pending Dispatch</p>
          <p className="text-2xl font-bold text-indigo-600">{stats.pendingDispatch}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4">
          <p className="text-sm text-gray-500">Delivered Today</p>
          <p className="text-2xl font-bold text-green-600">{stats.deliveredToday}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4">
          <p className="text-sm text-gray-500">Total Active</p>
          <p className="text-2xl font-bold text-gray-600">{stats.totalShipments}</p>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-2 gap-6">
        {/* LFD Alerts - URGENT */}
        <div className="bg-white rounded-xl shadow">
          <div className="px-6 py-4 border-b bg-red-50 rounded-t-xl">
            <h2 className="font-bold text-red-800 flex items-center gap-2">
              🚨 LFD ALERTS - Action Required
            </h2>
          </div>
          <div className="p-4 max-h-80 overflow-y-auto">
            {lfdAlerts.length === 0 ? (
              <p className="text-center text-gray-500 py-8">✅ No LFD alerts</p>
            ) : (
              <div className="space-y-3">
                {lfdAlerts.map(alert => (
                  <div 
                    key={alert.id} 
                    className={`p-3 rounded-lg border-l-4 ${
                      alert.days_until_lfd <= 0 ? 'bg-red-100 border-red-600' :
                      alert.days_until_lfd === 1 ? 'bg-orange-100 border-orange-500' :
                      'bg-yellow-50 border-yellow-500'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-mono font-bold">{alert.container_number}</span>
                        {alert.has_holds && <span className="ml-2 px-2 py-0.5 bg-red-200 text-red-800 text-xs rounded">HOLD</span>}
                      </div>
                      <span className={`font-bold ${
                        alert.days_until_lfd <= 0 ? 'text-red-700' :
                        alert.days_until_lfd === 1 ? 'text-orange-700' :
                        'text-yellow-700'
                      }`}>
                        {alert.days_until_lfd <= 0 ? '⚠️ PAST DUE' :
                         alert.days_until_lfd === 1 ? '⚠️ TOMORROW' :
                         `${alert.days_until_lfd} days`}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600 mt-1">
                      {alert.terminal_name} • LFD: {formatDate(alert.last_free_day)}
                    </div>
                    <div className="text-xs text-gray-500">{alert.reference_number}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Available Containers */}
        <div className="bg-white rounded-xl shadow">
          <div className="px-6 py-4 border-b bg-green-50 rounded-t-xl">
            <h2 className="font-bold text-green-800 flex items-center gap-2">
              ✅ Available for Pickup
            </h2>
          </div>
          <div className="p-4 max-h-80 overflow-y-auto">
            {availableContainers.length === 0 ? (
              <p className="text-center text-gray-500 py-8">No containers available</p>
            ) : (
              <div className="space-y-3">
                {availableContainers.map(container => (
                  <div key={container.id} className="p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-green-700">{container.container_number}</span>
                      <span className={`text-sm ${
                        container.days_until_lfd <= 1 ? 'text-red-600 font-bold' :
                        container.days_until_lfd <= 2 ? 'text-orange-600' :
                        'text-gray-500'
                      }`}>
                        LFD: {formatDate(container.last_free_day)}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600">{container.terminal_name}</div>
                    <div className="text-xs text-gray-500 flex justify-between mt-1">
                      <span>{container.customer_name}</span>
                      <span>→ {container.delivery_city}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Today's Appointments */}
        <div className="bg-white rounded-xl shadow">
          <div className="px-6 py-4 border-b">
            <h2 className="font-bold text-gray-800 flex items-center gap-2">
              📅 Today's Appointments
            </h2>
          </div>
          <div className="p-4 max-h-80 overflow-y-auto">
            {todayAppointments.length === 0 ? (
              <p className="text-center text-gray-500 py-8">No appointments scheduled for today</p>
            ) : (
              <div className="space-y-2">
                {todayAppointments.map(apt => (
                  <div key={apt.id} className="p-3 bg-gray-50 rounded-lg flex items-center gap-4">
                    <div className="text-center min-w-[60px]">
                      <div className="text-lg font-bold text-blue-600">{formatTime(apt.appointment_time)}</div>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-xs ${
                          apt.type === 'PICKUP' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                        }`}>
                          {apt.type}
                        </span>
                        <span className="font-mono font-semibold">{apt.container_number}</span>
                      </div>
                      <div className="text-sm text-gray-600">{apt.location}</div>
                    </div>
                    <div className="text-right text-sm">
                      <div className="font-medium">{apt.driver_name}</div>
                      <div className="text-gray-500">{apt.truck_number}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Trips In Progress */}
        <div className="bg-white rounded-xl shadow">
          <div className="px-6 py-4 border-b">
            <h2 className="font-bold text-gray-800 flex items-center gap-2">
              🚛 Trips In Progress
            </h2>
          </div>
          <div className="p-4 max-h-80 overflow-y-auto">
            {tripsInProgress.length === 0 ? (
              <p className="text-center text-gray-500 py-8">No trips in progress</p>
            ) : (
              <div className="space-y-2">
                {tripsInProgress.map(trip => (
                  <div key={trip.id} className="p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold text-blue-600">{trip.trip_number}</span>
                        <span className="font-mono text-sm">{trip.container_number}</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-xs ${getStatusColor(trip.status)}`}>
                        {trip.current_leg}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600">
                      {trip.pickup_location} → {trip.delivery_location}
                    </div>
                    <div className="text-xs text-gray-500 flex justify-between mt-1">
                      <span>🚛 {trip.driver_name} • {trip.truck_number}</span>
                      <span>{new Date(trip.updated_at).toLocaleTimeString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-xl shadow p-6">
        <h2 className="font-bold text-gray-800 mb-4">Quick Actions</h2>
        <div className="flex gap-4">
          <a href="/dispatch" className="flex-1 p-4 bg-blue-50 rounded-lg hover:bg-blue-100 text-center">
            <div className="text-2xl mb-2">📤</div>
            <div className="font-medium text-blue-800">Dispatch Board</div>
            <div className="text-sm text-blue-600">{stats.pendingDispatch} pending</div>
          </a>
          <a href="/trips" className="flex-1 p-4 bg-purple-50 rounded-lg hover:bg-purple-100 text-center">
            <div className="text-2xl mb-2">🚛</div>
            <div className="font-medium text-purple-800">Manage Trips</div>
            <div className="text-sm text-purple-600">{stats.tripsInProgress} in progress</div>
          </a>
          <a href="/shipments" className="flex-1 p-4 bg-green-50 rounded-lg hover:bg-green-100 text-center">
            <div className="text-2xl mb-2">📦</div>
            <div className="font-medium text-green-800">Shipments</div>
            <div className="text-sm text-green-600">{stats.totalShipments} active</div>
          </a>
          <a href="/tracking" className="flex-1 p-4 bg-cyan-50 rounded-lg hover:bg-cyan-100 text-center">
            <div className="text-2xl mb-2">📡</div>
            <div className="font-medium text-cyan-800">Container Tracking</div>
            <div className="text-sm text-cyan-600">eModal Status</div>
          </a>
          <a href="/chassis" className="flex-1 p-4 bg-orange-50 rounded-lg hover:bg-orange-100 text-center">
            <div className="text-2xl mb-2">🔗</div>
            <div className="font-medium text-orange-800">Chassis</div>
            <div className="text-sm text-orange-600">{stats.perDiemAlerts} per-diem alerts</div>
          </a>
        </div>
      </div>
    </div>
  );
}
