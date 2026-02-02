'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

// =============================================================================
// SIMPLE DISPATCH BOARD - Clean Redesign
// =============================================================================
//
// Core Concept:
//   A LOAD (container) goes through MOVES until complete
//   IMPORT: Pick from terminal → Deliver to customer → Return empty
//   EXPORT: Pick empty → Load at customer → Deliver to terminal
//
// Dispatcher's Job:
//   1. See what needs dispatching (sorted by LFD urgency)
//   2. Click Dispatch → Select driver → Send message
//   3. Track active moves → Mark complete
//
// =============================================================================

// ===== TYPES =====

interface Load {
  id: string;
  container_number: string;
  size: string;
  shipment_id: string;
  shipment_type: 'IMPORT' | 'EXPORT';
  customer_name: string;
  terminal_name: string;
  steamship_line: string;
  booking_number?: string;
  last_free_day: string | null;
  delivery_address: string;
  delivery_city: string;
  is_hazmat: boolean;
  is_overweight: boolean;
  customs_status: string;
  // Current dispatch state
  active_move?: Move;
  completed_moves: Move[];
  journey_complete: boolean;
}

interface Move {
  id: string;
  type: string;
  status: 'PENDING' | 'DISPATCHED' | 'IN_PROGRESS' | 'COMPLETED';
  driver_id?: string;
  driver_name?: string;
  pickup: string;
  delivery: string;
  dispatched_at?: string;
  completed_at?: string;
}

interface Driver {
  id: string;
  name: string;
  phone: string;
  available: boolean;
  has_hazmat: boolean;
}

// ===== CONSTANTS =====

const JOURNEY = {
  IMPORT: [
    { type: 'PICKUP', label: 'Pick Up from Terminal', icon: '📥', fromKey: 'terminal', toKey: 'customer' },
    { type: 'EMPTY_RETURN', label: 'Return Empty', icon: '📤', fromKey: 'customer', toKey: 'terminal' },
  ],
  EXPORT: [
    { type: 'EMPTY_PICKUP', label: 'Pick Up Empty', icon: '📦', fromKey: 'terminal', toKey: 'customer' },
    { type: 'DELIVER', label: 'Deliver Loaded', icon: '🚢', fromKey: 'customer', toKey: 'terminal' },
  ],
};

// ===== HELPERS =====

function daysUntilLFD(lfd: string | null): number | null {
  if (!lfd) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((new Date(lfd).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function lfdBadge(days: number | null) {
  if (days === null) return null;
  if (days < 0) return { text: 'OVERDUE', color: 'bg-red-600 text-white' };
  if (days === 0) return { text: 'TODAY', color: 'bg-red-500 text-white' };
  if (days === 1) return { text: 'TOMORROW', color: 'bg-orange-500 text-white' };
  if (days <= 3) return { text: `${days} days`, color: 'bg-yellow-500 text-white' };
  return { text: `${days} days`, color: 'bg-gray-200 text-gray-700' };
}

// ===== LOAD CARD =====

function LoadCard({
  load,
  onDispatch,
  onComplete,
}: {
  load: Load;
  onDispatch: () => void;
  onComplete: () => void;
}) {
  const days = daysUntilLFD(load.last_free_day);
  const badge = lfdBadge(days);
  const journey = JOURNEY[load.shipment_type];

  // Which step are we on?
  const completedTypes = load.completed_moves.map(m => m.type);
  const stepIndex = completedTypes.length;
  const nextStep = journey[stepIndex];
  const isComplete = load.journey_complete;

  return (
    <div className={`bg-white rounded-lg border-2 p-4 transition-all ${
      load.active_move ? 'border-blue-400 shadow-md' :
      isComplete ? 'border-green-400 opacity-60' :
      days !== null && days <= 1 ? 'border-red-400 shadow-lg' :
      'border-gray-200 hover:border-gray-300'
    }`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xl font-bold">{load.container_number}</span>
            {load.is_hazmat && <span title="HAZMAT">☣️</span>}
            {load.is_overweight && <span title="Overweight">⚖️</span>}
          </div>
          <div className="text-sm text-gray-500">
            {load.size}' • {load.steamship_line}
          </div>
        </div>
        <div className="text-right">
          <span className={`inline-block px-2 py-1 text-xs font-medium rounded ${
            load.shipment_type === 'IMPORT' ? 'bg-purple-100 text-purple-700' : 'bg-orange-100 text-orange-700'
          }`}>
            {load.shipment_type}
          </span>
          {badge && (
            <div className={`mt-1 px-2 py-1 text-xs font-bold rounded ${badge.color}`}>
              LFD: {badge.text}
            </div>
          )}
        </div>
      </div>

      {/* Customer & Terminal */}
      <div className="text-sm mb-3">
        <div className="font-medium text-gray-900">{load.customer_name}</div>
        <div className="text-gray-500">{load.terminal_name}</div>
      </div>

      {/* Hold Warning */}
      {load.customs_status === 'HOLD' && (
        <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          ⛔ CUSTOMS HOLD - Cannot dispatch
        </div>
      )}

      {/* Journey Progress */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2">
          {journey.map((step, idx) => {
            const done = idx < stepIndex;
            const active = load.active_move?.type === step.type;
            const next = idx === stepIndex && !load.active_move;

            return (
              <div key={step.type} className="flex items-center flex-1">
                <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-lg ${
                  done ? 'bg-green-500 text-white' :
                  active ? 'bg-blue-500 text-white ring-4 ring-blue-200' :
                  next ? 'bg-gray-200 text-gray-600' :
                  'bg-gray-100 text-gray-400'
                }`}>
                  {done ? '✓' : active ? '→' : step.icon}
                </div>
                {idx < journey.length - 1 && (
                  <div className={`flex-1 h-1 mx-1 rounded ${done ? 'bg-green-500' : 'bg-gray-200'}`} />
                )}
              </div>
            );
          })}
        </div>
        <div className="text-xs text-gray-500 text-center">
          {journey.map((s, i) => (
            <span key={s.type}>
              {i > 0 && ' → '}
              <span className={i < stepIndex ? 'line-through' : i === stepIndex ? 'font-bold text-gray-700' : ''}>
                {s.label}
              </span>
            </span>
          ))}
        </div>
      </div>

      {/* Action Area */}
      <div className="pt-3 border-t">
        {isComplete ? (
          <div className="text-center text-green-600 font-medium">✓ Journey Complete</div>
        ) : load.active_move ? (
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">{load.active_move.driver_name || 'No driver'}</div>
              <div className="text-xs text-gray-500">
                {load.active_move.pickup} → {load.active_move.delivery}
              </div>
            </div>
            <button
              onClick={onComplete}
              className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700"
            >
              ✓ Mark Complete
            </button>
          </div>
        ) : (
          <button
            onClick={onDispatch}
            disabled={load.customs_status === 'HOLD'}
            className="w-full py-3 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition"
          >
            🚛 Dispatch: {nextStep?.label}
          </button>
        )}
      </div>
    </div>
  );
}

// ===== DISPATCH MODAL =====

function DispatchModal({
  load,
  drivers,
  onSend,
  onClose,
}: {
  load: Load;
  drivers: Driver[];
  onSend: (driverId: string) => void;
  onClose: () => void;
}) {
  const journey = JOURNEY[load.shipment_type];
  const stepIndex = load.completed_moves.length;
  const step = journey[stepIndex];

  const [selectedDriver, setSelectedDriver] = useState('');
  const [showPreview, setShowPreview] = useState(false);

  const driver = drivers.find(d => d.id === selectedDriver);

  // Get locations
  const pickup = step.fromKey === 'terminal' ? load.terminal_name : (load.delivery_city || load.delivery_address);
  const delivery = step.toKey === 'terminal' ? load.terminal_name : (load.delivery_city || load.delivery_address);

  // Build message
  const message = `🚛 DISPATCH

${step.icon} ${step.label.toUpperCase()}

Container: ${load.container_number} (${load.size}')
${load.is_hazmat ? '☣️ HAZMAT LOAD\n' : ''}${load.is_overweight ? '⚖️ OVERWEIGHT\n' : ''}
📍 PICKUP: ${pickup}
📍 DELIVER: ${delivery}

Customer: ${load.customer_name}
SSL: ${load.steamship_line}
${load.booking_number ? `Booking: ${load.booking_number}\n` : ''}${load.last_free_day ? `LFD: ${new Date(load.last_free_day).toLocaleDateString()}\n` : ''}
Reply YES to confirm.`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="bg-indigo-600 text-white px-6 py-4">
          <h2 className="text-lg font-semibold">Dispatch Load</h2>
          <p className="text-indigo-200 text-sm">{load.container_number} • {step.label}</p>
        </div>

        {!showPreview ? (
          <>
            {/* Route Info */}
            <div className="p-6 border-b">
              <div className="flex items-center text-sm mb-4">
                <div className="w-3 h-3 rounded-full bg-green-500 mr-2" />
                <span className="font-medium">{pickup}</span>
              </div>
              <div className="ml-1 border-l-2 border-dashed border-gray-300 h-6 mb-1" />
              <div className="flex items-center text-sm">
                <div className="w-3 h-3 rounded-full bg-red-500 mr-2" />
                <span className="font-medium">{delivery}</span>
              </div>
            </div>

            {/* Driver Selection */}
            <div className="p-6">
              <label className="block text-sm font-medium text-gray-700 mb-3">Select Driver</label>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {drivers.filter(d => d.available).map(d => (
                  <button
                    key={d.id}
                    onClick={() => setSelectedDriver(d.id)}
                    className={`w-full p-3 rounded-lg border-2 text-left transition ${
                      selectedDriver === d.id
                        ? 'border-indigo-500 bg-indigo-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">{d.name}</div>
                        <div className="text-sm text-gray-500">{d.phone}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        {d.has_hazmat && (
                          <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">HAZMAT</span>
                        )}
                        <div className="w-3 h-3 rounded-full bg-green-500" />
                      </div>
                    </div>
                  </button>
                ))}
                {drivers.filter(d => d.available).length === 0 && (
                  <p className="text-center text-gray-500 py-4">No drivers available</p>
                )}
              </div>
              {load.is_hazmat && driver && !driver.has_hazmat && (
                <p className="mt-3 text-sm text-red-600">⚠️ This load requires HAZMAT endorsement</p>
              )}
            </div>
          </>
        ) : (
          /* Message Preview */
          <div className="p-6">
            <p className="text-sm text-gray-500 mb-2">Message to {driver?.name}:</p>
            <div className="bg-gray-900 text-green-400 rounded-lg p-4 font-mono text-sm whitespace-pre-wrap">
              {message}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 flex justify-between">
          <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:text-gray-800">
            Cancel
          </button>
          {!showPreview ? (
            <button
              onClick={() => setShowPreview(true)}
              disabled={!selectedDriver}
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-300"
            >
              Preview Message →
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => setShowPreview(false)}
                className="px-4 py-2 border rounded-lg hover:bg-gray-100"
              >
                ← Back
              </button>
              <button
                onClick={() => onSend(selectedDriver)}
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                🚛 Send Dispatch
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ===== MAIN BOARD =====

export default function DispatchBoard() {
  const [loads, setLoads] = useState<Load[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [dispatchingLoad, setDispatchingLoad] = useState<Load | null>(null);
  const [view, setView] = useState<'dispatch' | 'active' | 'complete'>('dispatch');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Get containers with shipment data
      const { data: containers } = await supabase
        .from('containers')
        .select(`
          *,
          shipment:shipments!shipment_id(
            id, type, customer_name, terminal_name, steamship_line,
            booking_number, last_free_day, delivery_address, delivery_city
          )
        `)
        .order('created_at', { ascending: false });

      // Get all moves (orders) for these containers
      const { data: orders } = await supabase
        .from('orders')
        .select(`
          id, container_id, move_type_v2, status, assigned_driver_id,
          pickup_city, delivery_city, dispatched_at, completed_at,
          driver:drivers!assigned_driver_id(first_name, last_name)
        `)
        .is('deleted_at', null);

      // Group orders by container
      const orderMap = new Map<string, any[]>();
      (orders || []).forEach((o: any) => {
        const list = orderMap.get(o.container_id) || [];
        list.push(o);
        orderMap.set(o.container_id, list);
      });

      // Build loads
      const loadList: Load[] = (containers || []).map((c: any) => {
        const moves = orderMap.get(c.id) || [];
        const active = moves.find((m: any) => ['DISPATCHED', 'IN_PROGRESS'].includes(m.status));
        const completed = moves.filter((m: any) => m.status === 'COMPLETED');

        const journey = JOURNEY[c.shipment?.type as 'IMPORT' | 'EXPORT'] || JOURNEY.IMPORT;
        const completedTypes = completed.map((m: any) => m.move_type_v2);
        const journeyComplete = journey.every(step => completedTypes.includes(step.type));

        return {
          id: c.id,
          container_number: c.container_number,
          size: c.size,
          shipment_id: c.shipment?.id,
          shipment_type: c.shipment?.type || 'IMPORT',
          customer_name: c.shipment?.customer_name || 'N/A',
          terminal_name: c.shipment?.terminal_name || 'N/A',
          steamship_line: c.shipment?.steamship_line || '',
          booking_number: c.shipment?.booking_number,
          last_free_day: c.shipment?.last_free_day,
          delivery_address: c.shipment?.delivery_address || '',
          delivery_city: c.shipment?.delivery_city || '',
          is_hazmat: c.is_hazmat,
          is_overweight: c.is_overweight,
          customs_status: c.customs_status,
          active_move: active ? {
            id: active.id,
            type: active.move_type_v2,
            status: active.status,
            driver_id: active.assigned_driver_id,
            driver_name: active.driver ? `${active.driver.first_name} ${active.driver.last_name}` : undefined,
            pickup: active.pickup_city || '',
            delivery: active.delivery_city || '',
            dispatched_at: active.dispatched_at,
          } : undefined,
          completed_moves: completed.map((m: any) => ({
            id: m.id,
            type: m.move_type_v2,
            status: 'COMPLETED',
            pickup: m.pickup_city || '',
            delivery: m.delivery_city || '',
            completed_at: m.completed_at,
          })),
          journey_complete: journeyComplete,
        };
      });

      // Sort by LFD urgency
      loadList.sort((a, b) => {
        const da = daysUntilLFD(a.last_free_day) ?? 999;
        const db = daysUntilLFD(b.last_free_day) ?? 999;
        return da - db;
      });

      setLoads(loadList);

      // Get drivers
      const { data: driverData } = await supabase
        .from('drivers')
        .select('id, first_name, last_name, phone, status, has_hazmat_endorsement')
        .in('status', ['ACTIVE', 'AVAILABLE']);

      setDrivers((driverData || []).map((d: any) => ({
        id: d.id,
        name: `${d.first_name} ${d.last_name}`,
        phone: d.phone || '',
        available: true,
        has_hazmat: d.has_hazmat_endorsement || false,
      })));

    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Dispatch handler
  const handleDispatch = async (driverId: string) => {
    if (!dispatchingLoad) return;

    const journey = JOURNEY[dispatchingLoad.shipment_type];
    const stepIndex = dispatchingLoad.completed_moves.length;
    const step = journey[stepIndex];

    const pickup = step.fromKey === 'terminal'
      ? dispatchingLoad.terminal_name
      : dispatchingLoad.delivery_city;
    const delivery = step.toKey === 'terminal'
      ? dispatchingLoad.terminal_name
      : dispatchingLoad.delivery_city;

    try {
      await supabase.from('orders').insert({
        order_number: `ORD-${Date.now().toString(36).toUpperCase()}`,
        container_id: dispatchingLoad.id,
        shipment_id: dispatchingLoad.shipment_id,
        type: dispatchingLoad.shipment_type,
        move_type_v2: step.type,
        assigned_driver_id: driverId,
        pickup_city: pickup,
        delivery_city: delivery,
        status: 'DISPATCHED',
        dispatched_at: new Date().toISOString(),
      });

      setDispatchingLoad(null);
      fetchData();
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  // Complete handler
  const handleComplete = async (load: Load) => {
    if (!load.active_move) return;

    try {
      await supabase.from('orders').update({
        status: 'COMPLETED',
        completed_at: new Date().toISOString(),
      }).eq('id', load.active_move.id);

      fetchData();
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  // Filter loads by view
  const filtered = loads.filter(l => {
    if (view === 'dispatch') return !l.active_move && !l.journey_complete;
    if (view === 'active') return !!l.active_move;
    if (view === 'complete') return l.journey_complete;
    return true;
  });

  // Stats
  const needsDispatch = loads.filter(l => !l.active_move && !l.journey_complete).length;
  const active = loads.filter(l => l.active_move).length;
  const complete = loads.filter(l => l.journey_complete).length;
  const urgent = loads.filter(l => {
    const d = daysUntilLFD(l.last_free_day);
    return d !== null && d <= 2 && !l.journey_complete;
  }).length;

  if (loading && loads.length === 0) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-600 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold text-gray-900">Dispatch Board</h1>
            <button
              onClick={fetchData}
              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition"
            >
              ↻ Refresh
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-4">
            <button
              onClick={() => setView('dispatch')}
              className={`px-4 py-3 rounded-lg font-medium transition ${
                view === 'dispatch'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              🚛 Needs Dispatch ({needsDispatch})
            </button>
            <button
              onClick={() => setView('active')}
              className={`px-4 py-3 rounded-lg font-medium transition ${
                view === 'active'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              📍 Active ({active})
            </button>
            <button
              onClick={() => setView('complete')}
              className={`px-4 py-3 rounded-lg font-medium transition ${
                view === 'complete'
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              ✓ Complete ({complete})
            </button>
            {urgent > 0 && (
              <div className="ml-auto px-4 py-3 bg-red-100 text-red-700 rounded-lg font-medium">
                🔥 {urgent} Urgent (LFD ≤ 2 days)
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(load => (
            <LoadCard
              key={load.id}
              load={load}
              onDispatch={() => setDispatchingLoad(load)}
              onComplete={() => handleComplete(load)}
            />
          ))}
          {filtered.length === 0 && (
            <div className="col-span-full text-center py-16 text-gray-500">
              {view === 'dispatch' && 'All loads dispatched!'}
              {view === 'active' && 'No active dispatches'}
              {view === 'complete' && 'No completed loads yet'}
            </div>
          )}
        </div>
      </div>

      {/* Drivers Summary (bottom-right) */}
      <div className="fixed bottom-6 right-6 bg-white rounded-xl shadow-lg border p-4 w-64">
        <h3 className="font-semibold text-gray-900 mb-3">Available Drivers</h3>
        <div className="space-y-2">
          {drivers.filter(d => d.available).slice(0, 5).map(d => (
            <div key={d.id} className="flex items-center justify-between text-sm">
              <span>{d.name}</span>
              <div className="flex items-center gap-1">
                {d.has_hazmat && <span className="text-xs text-purple-600">HM</span>}
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
              </div>
            </div>
          ))}
          {drivers.filter(d => d.available).length === 0 && (
            <p className="text-sm text-gray-500">No drivers available</p>
          )}
        </div>
      </div>

      {/* Dispatch Modal */}
      {dispatchingLoad && (
        <DispatchModal
          load={dispatchingLoad}
          drivers={drivers}
          onSend={handleDispatch}
          onClose={() => setDispatchingLoad(null)}
        />
      )}
    </div>
  );
}
