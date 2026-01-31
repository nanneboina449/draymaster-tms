'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import Link from 'next/link';

interface ShipmentDetail {
  id: string;
  load_number: string;
  customer_name: string;
  container_number: string;
  container_size: string;
  container_type: string;
  move_type: string;
  terminal: string;
  status: string;
  last_free_day: string | null;
  is_hazmat: boolean;
  is_overweight: boolean;
  emodal_status: string | null;
  availability_status: string | null;
  has_customs_hold: boolean;
  has_freight_hold: boolean;
  has_usda_hold: boolean;
  yard_location: string | null;
  last_checked_at: string | null;
  trip_id: string | null;
  trip_number: string | null;
  trip_status: string | null;
  driver_name: string | null;
  tractor_number: string | null;
  appointment_id: string | null;
  appointment_date: string | null;
  appointment_status: string | null;
  appointment_slot: string | null;
}

export default function ShipmentsPage() {
  const [shipments, setShipments] = useState<ShipmentDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => { fetchShipments(); }, []);

  const fetchShipments = async () => {
    try {
      setLoading(true);

      const [loadsRes, trackRes, tripsRes, apptRes] = await Promise.all([
        supabase.from('loads').select('*, customer:customers(company_name)').order('created_at', { ascending: false }),
        supabase.from('container_tracking').select('*'),
        supabase.from('trips').select('*, driver:drivers(first_name, last_name), tractor:tractors(unit_number)'),
        supabase.from('terminal_appointments').select('*'),
      ]);

      const loads = loadsRes.data || [];
      const tracking = trackRes.data || [];
      const trips = tripsRes.data || [];
      const appointments = apptRes.data || [];

      const trackingMap: Record<string, any> = {};
      tracking.forEach((t: any) => { if (t.container_number) trackingMap[t.container_number] = t; });

      const tripMap: Record<string, any> = {};
      trips.forEach((t: any) => { if (t.load_id) tripMap[t.load_id] = t; });

      const apptMap: Record<string, any> = {};
      appointments.forEach((a: any) => { if (a.container_number) apptMap[a.container_number] = a; });

      const details: ShipmentDetail[] = loads.map((load: any) => {
        const track = trackingMap[load.container_number] || {};
        const trip = tripMap[load.id] || {};
        const appt = apptMap[load.container_number] || {};
        return {
          id: load.id,
          load_number: load.load_number,
          customer_name: load.customer?.company_name || '',
          container_number: load.container_number || '',
          container_size: load.container_size || '',
          container_type: load.container_type || '',
          move_type: load.move_type || '',
          terminal: load.terminal || '',
          status: load.status,
          last_free_day: load.last_free_day || null,
          is_hazmat: load.is_hazmat || false,
          is_overweight: load.is_overweight || false,
          emodal_status: track.emodal_status || null,
          availability_status: track.availability_status || null,
          has_customs_hold: track.has_customs_hold || load.hold_customs || false,
          has_freight_hold: track.has_freight_hold || load.hold_freight || false,
          has_usda_hold: track.has_usda_hold || load.hold_usda || false,
          yard_location: track.yard_location || null,
          last_checked_at: track.last_checked_at || null,
          trip_id: trip.id || null,
          trip_number: trip.trip_number || null,
          trip_status: trip.status || null,
          driver_name: trip.driver ? `${trip.driver.first_name} ${trip.driver.last_name}` : null,
          tractor_number: trip.tractor?.unit_number || null,
          appointment_id: appt.id || null,
          appointment_date: appt.appointment_date || null,
          appointment_status: appt.status || null,
          appointment_slot: appt.time_slot || null,
        };
      });

      setShipments(details);
    } catch (err: any) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const filtered = shipments.filter(s => {
    if (statusFilter && s.status !== statusFilter) return false;
    if (searchTerm) {
      const t = searchTerm.toLowerCase();
      return s.load_number?.toLowerCase().includes(t) ||
        s.container_number?.toLowerCase().includes(t) ||
        s.customer_name?.toLowerCase().includes(t) ||
        (s.trip_number?.toLowerCase().includes(t) || false);
    }
    return true;
  });

  const getStatusColor = (status: string) => {
    const map: Record<string, string> = {
      TRACKING: 'bg-gray-100 text-gray-700', AVAILABLE: 'bg-green-100 text-green-800',
      HOLD: 'bg-red-100 text-red-800', APPOINTMENT_NEEDED: 'bg-yellow-100 text-yellow-800',
      READY_FOR_DISPATCH: 'bg-blue-100 text-blue-800', DISPATCHED: 'bg-blue-200 text-blue-900',
      IN_YARD: 'bg-indigo-100 text-indigo-800', IN_TRANSIT: 'bg-purple-100 text-purple-800',
      AT_PICKUP: 'bg-orange-100 text-orange-800', AT_DELIVERY: 'bg-orange-200 text-orange-900',
      COMPLETED: 'bg-emerald-100 text-emerald-800', INVOICED: 'bg-teal-100 text-teal-800',
      CANCELLED: 'bg-gray-200 text-gray-600',
    };
    return map[status] || 'bg-gray-100 text-gray-700';
  };

  const getTripStatusColor = (status: string) => {
    const map: Record<string, string> = {
      PLANNED: 'bg-gray-100 text-gray-700', DISPATCHED: 'bg-blue-100 text-blue-800',
      EN_ROUTE: 'bg-purple-100 text-purple-800', AT_PICKUP: 'bg-yellow-100 text-yellow-800',
      LOADED: 'bg-indigo-100 text-indigo-800', AT_DELIVERY: 'bg-orange-100 text-orange-800',
      DELIVERED: 'bg-green-100 text-green-800', COMPLETED: 'bg-emerald-100 text-emerald-800',
    };
    return map[status] || 'bg-gray-100 text-gray-700';
  };

  const getLfdUrgency = (lfd: string | null) => {
    if (!lfd) return { color: 'text-gray-500', label: '—' };
    const days = Math.ceil((new Date(lfd).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (days < 0) return { color: 'text-red-700 font-bold', label: `Overdue ${Math.abs(days)}d` };
    if (days === 0) return { color: 'text-red-600 font-bold', label: 'TODAY' };
    if (days <= 2) return { color: 'text-orange-600 font-semibold', label: `${days} days` };
    if (days <= 5) return { color: 'text-yellow-600', label: `${days} days` };
    return { color: 'text-green-600', label: `${days} days` };
  };

  const stats = {
    total: shipments.length,
    synced: shipments.filter(s => s.emodal_status).length,
    withTrips: shipments.filter(s => s.trip_id).length,
    onHold: shipments.filter(s => s.has_customs_hold || s.has_freight_hold || s.has_usda_hold).length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Shipments</h1>
          <p className="text-gray-500 mt-1">Container-level detail — status, appointments, and dispatch activity</p>
        </div>
        <Link href="/loads" className="px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 text-sm text-gray-700 font-medium">
          Manage Loads →
        </Link>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow p-4"><p className="text-sm text-gray-500">Total</p><p className="text-2xl font-bold">{stats.total}</p></div>
        <div className="bg-white rounded-xl shadow p-4"><p className="text-sm text-gray-500">eModal Synced</p><p className="text-2xl font-bold text-blue-600">{stats.synced}</p></div>
        <div className="bg-white rounded-xl shadow p-4 border-l-4 border-red-500"><p className="text-sm text-gray-500">On Hold</p><p className="text-2xl font-bold text-red-600">{stats.onHold}</p></div>
        <div className="bg-white rounded-xl shadow p-4"><p className="text-sm text-gray-500">With Trips</p><p className="text-2xl font-bold text-purple-600">{stats.withTrips}</p></div>
      </div>

      <div className="bg-white rounded-xl shadow p-4 flex flex-wrap gap-3">
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-3 py-1.5 border rounded-lg text-sm">
          <option value="">All Status</option>
          <option value="TRACKING">Tracking</option>
          <option value="AVAILABLE">Available</option>
          <option value="HOLD">On Hold</option>
          <option value="DISPATCHED">Dispatched</option>
          <option value="IN_TRANSIT">In Transit</option>
          <option value="COMPLETED">Completed</option>
        </select>
        <input type="text" placeholder="Search load, container, customer, trip..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="px-4 py-1.5 border rounded-lg text-sm flex-1 min-w-0" />
        <button onClick={fetchShipments} className="px-4 py-1.5 bg-gray-100 rounded-lg hover:bg-gray-200 text-sm">Refresh</button>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl shadow p-12 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-500">Loading...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl shadow p-12 text-center">
          <p className="text-gray-500">No shipments match your filters</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(s => {
            const isExpanded = expandedId === s.id;
            const lfd = getLfdUrgency(s.last_free_day);
            const holds = [
              s.has_customs_hold && 'Customs',
              s.has_freight_hold && 'Freight',
              s.has_usda_hold && 'USDA',
            ].filter(Boolean);

            return (
              <div key={s.id} className="bg-white rounded-xl shadow overflow-hidden">
                <div
                  className="p-4 cursor-pointer hover:bg-gray-50 transition"
                  onClick={() => setExpandedId(isExpanded ? null : s.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-semibold text-blue-600">{s.load_number}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(s.status)}`}>
                          {s.status.replace(/_/g, ' ')}
                        </span>
                        {holds.map(h => <span key={h} className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded">{h}</span>)}
                      </div>
                      <div className="text-sm text-gray-600 mt-0.5">
                        <span className="font-medium">{s.customer_name}</span>
                        <span className="mx-2 text-gray-300">|</span>
                        <span className="font-mono">{s.container_number || '—'}</span>
                        <span className="mx-2 text-gray-300">|</span>
                        <span>{s.container_size}' {s.container_type}</span>
                        {s.terminal && <><span className="mx-2 text-gray-300">|</span><span>{s.terminal}</span></>}
                      </div>
                    </div>
                    <div className="flex items-center gap-6 shrink-0">
                      <div className="text-right">
                        <p className="text-xs text-gray-500">LFD</p>
                        <p className={`text-sm ${lfd.color}`}>{lfd.label}</p>
                      </div>
                      {s.trip_status && (
                        <div className="text-right">
                          <p className="text-xs text-gray-500">Trip</p>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getTripStatusColor(s.trip_status)}`}>
                            {s.trip_status.replace(/_/g, ' ')}
                          </span>
                        </div>
                      )}
                      <span className="text-gray-400 text-sm">{isExpanded ? '▲' : '▼'}</span>
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t bg-gray-50">
                    <div className="p-4 grid grid-cols-3 gap-4">
                      {/* Container Status */}
                      <div className="bg-white rounded-lg p-4 shadow-sm">
                        <h4 className="text-xs font-semibold text-gray-500 uppercase mb-3">Container Status</h4>
                        {s.emodal_status ? (
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between"><span className="text-gray-500">eModal:</span><span className="font-medium">{s.emodal_status}</span></div>
                            <div className="flex justify-between">
                              <span className="text-gray-500">Availability:</span>
                              <span className={`font-medium ${s.availability_status === 'AVAILABLE' ? 'text-green-600' : 'text-orange-600'}`}>{s.availability_status}</span>
                            </div>
                            {s.yard_location && <div className="flex justify-between"><span className="text-gray-500">Yard:</span><span className="font-mono text-sm">{s.yard_location}</span></div>}
                            <div className="flex justify-between"><span className="text-gray-500">Checked:</span><span className="text-xs text-gray-400">{s.last_checked_at ? new Date(s.last_checked_at).toLocaleString() : '—'}</span></div>
                          </div>
                        ) : (
                          <p className="text-sm text-gray-400 italic">Not synced with eModal</p>
                        )}
                      </div>

                      {/* Appointment */}
                      <div className="bg-white rounded-lg p-4 shadow-sm">
                        <h4 className="text-xs font-semibold text-gray-500 uppercase mb-3">Appointment</h4>
                        {s.appointment_id ? (
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between"><span className="text-gray-500">Date:</span><span className="font-medium">{s.appointment_date ? new Date(s.appointment_date).toLocaleDateString() : '—'}</span></div>
                            <div className="flex justify-between"><span className="text-gray-500">Slot:</span><span className="font-medium">{s.appointment_slot || '—'}</span></div>
                            <div className="flex justify-between">
                              <span className="text-gray-500">Status:</span>
                              <span className={`font-medium ${s.appointment_status === 'CONFIRMED' ? 'text-green-600' : 'text-yellow-600'}`}>{s.appointment_status}</span>
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm text-gray-400 italic">No appointment</p>
                        )}
                      </div>

                      {/* Dispatch Activity */}
                      <div className="bg-white rounded-lg p-4 shadow-sm">
                        <h4 className="text-xs font-semibold text-gray-500 uppercase mb-3">Dispatch Activity</h4>
                        {s.trip_id ? (
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between"><span className="text-gray-500">Trip #:</span><span className="font-mono font-semibold">{s.trip_number}</span></div>
                            <div className="flex justify-between">
                              <span className="text-gray-500">Status:</span>
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getTripStatusColor(s.trip_status || '')}`}>
                                {s.trip_status?.replace(/_/g, ' ')}
                              </span>
                            </div>
                            <div className="flex justify-between"><span className="text-gray-500">Driver:</span><span className="font-medium">{s.driver_name || '—'}</span></div>
                            <div className="flex justify-between"><span className="text-gray-500">Tractor:</span><span className="font-mono">{s.tractor_number || '—'}</span></div>
                          </div>
                        ) : (
                          <p className="text-sm text-gray-400 italic">No trip assigned</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
