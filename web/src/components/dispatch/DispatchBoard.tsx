'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';

// =============================================================================
// ENHANCED DISPATCH BOARD - Trip-Based Model
// =============================================================================
//
// Based on Unified Dispatch Model:
//   - Trip Classification (Standard, Complex, Exception, Crisis)
//   - Risk Assessment (LFD, customs, appointments, etc.)
//   - Smart Driver Matching
//   - Optimization Opportunities
//
// Core Concept:
//   A LOAD (container) goes through MOVES until complete
//   IMPORT: Pick from terminal → Deliver to customer → Return empty
//   EXPORT: Pick empty → Load at customer → Deliver to terminal
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
  // Dispatch state
  active_move?: Move;
  completed_moves: Move[];
  journey_complete: boolean;
  // Classification & Risk
  classification: 'STANDARD' | 'COMPLEX' | 'EXCEPTION' | 'CRISIS';
  riskScore: number;
  riskFactors: string[];
  optimizations: Optimization[];
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
  has_twic?: boolean;
  experience_level?: 'NEW' | 'STANDARD' | 'EXPERIENCED';
  active_loads: number;
}

interface Optimization {
  type: 'STREET_TURN' | 'CONSOLIDATION' | 'DROP_AND_HOOK' | 'BACKHAUL';
  description: string;
  savings?: string;
}

// ===== CONSTANTS =====

const JOURNEY = {
  IMPORT: [
    { type: 'IMPORT_DELIVERY', label: 'Import Delivery', icon: '📥', fromKey: 'terminal', toKey: 'customer' },
    { type: 'EMPTY_RETURN', label: 'Empty Return', icon: '📤', fromKey: 'customer', toKey: 'terminal' },
  ],
  EXPORT: [
    { type: 'EMPTY_PICKUP', label: 'Empty Pickup', icon: '📦', fromKey: 'terminal', toKey: 'customer' },
    { type: 'EXPORT_PICKUP', label: 'Export Delivery', icon: '🚢', fromKey: 'customer', toKey: 'terminal' },
  ],
};

const CLASSIFICATION_COLORS = {
  STANDARD: 'bg-green-100 text-green-800',
  COMPLEX: 'bg-blue-100 text-blue-800',
  EXCEPTION: 'bg-orange-100 text-orange-800',
  CRISIS: 'bg-red-100 text-red-800',
};

// ===== RISK & CLASSIFICATION FUNCTIONS =====

function calculateRiskScore(load: Partial<Load>, daysToLFD: number | null): { score: number; factors: string[] } {
  let score = 0;
  const factors: string[] = [];

  // Time Risk (0-40 pts)
  if (daysToLFD !== null) {
    if (daysToLFD < 0) {
      score += 40;
      factors.push('LFD OVERDUE');
    } else if (daysToLFD === 0) {
      score += 35;
      factors.push('LFD TODAY');
    } else if (daysToLFD === 1) {
      score += 25;
      factors.push('LFD Tomorrow');
    } else if (daysToLFD <= 3) {
      score += 15;
      factors.push('LFD within 3 days');
    }
  }

  // Customs Risk (0-30 pts)
  if (load.customs_status === 'HOLD') {
    score += 30;
    factors.push('Customs HOLD');
  } else if (load.customs_status === 'PENDING') {
    score += 10;
    factors.push('Customs pending');
  }

  // Special handling (0-15 pts)
  if (load.is_hazmat) {
    score += 10;
    factors.push('HAZMAT');
  }
  if (load.is_overweight) {
    score += 5;
    factors.push('Overweight');
  }

  return { score, factors };
}

function classifyLoad(load: Partial<Load>, riskScore: number): 'STANDARD' | 'COMPLEX' | 'EXCEPTION' | 'CRISIS' {
  // Crisis: Customs hold + urgent LFD, or risk > 80
  if (riskScore >= 80 || (load.customs_status === 'HOLD' && riskScore >= 50)) {
    return 'CRISIS';
  }
  // Exception: High risk or customs issues
  if (riskScore >= 60 || load.customs_status === 'HOLD') {
    return 'EXCEPTION';
  }
  // Complex: Special handling required
  if (load.is_hazmat || load.is_overweight || riskScore >= 30) {
    return 'COMPLEX';
  }
  return 'STANDARD';
}

function findOptimizations(load: Partial<Load>, allLoads: Partial<Load>[]): Optimization[] {
  const opts: Optimization[] = [];

  // Check for street turn opportunity (import near export customer)
  if (load.shipment_type === 'IMPORT' && load.delivery_city) {
    const nearbyExports = allLoads.filter(l =>
      l.shipment_type === 'EXPORT' &&
      l.delivery_city === load.delivery_city &&
      !l.journey_complete
    );
    if (nearbyExports.length > 0) {
      opts.push({
        type: 'STREET_TURN',
        description: `${nearbyExports.length} export(s) near ${load.delivery_city}`,
        savings: '+$150-300',
      });
    }
  }

  // Check for consolidation (multiple loads to same area)
  const sameArea = allLoads.filter(l =>
    l.id !== load.id &&
    l.delivery_city === load.delivery_city &&
    !l.journey_complete
  );
  if (sameArea.length >= 2) {
    opts.push({
      type: 'CONSOLIDATION',
      description: `${sameArea.length} other loads to ${load.delivery_city}`,
      savings: '$100-200',
    });
  }

  return opts;
}

// ===== HELPERS =====

function daysUntilLFD(lfd: string | null): number | null {
  if (!lfd) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((new Date(lfd).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function lfdBadge(days: number | null) {
  if (days === null) return null;
  if (days < 0) return { text: 'OVERDUE', color: 'bg-red-600 text-white animate-pulse' };
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
  expanded,
  onToggleExpand,
}: {
  load: Load;
  onDispatch: () => void;
  onComplete: () => void;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const days = daysUntilLFD(load.last_free_day);
  const badge = lfdBadge(days);
  const journey = JOURNEY[load.shipment_type];

  // Journey progress
  const completedTypes = load.completed_moves.map(m => m.type);
  const stepIndex = completedTypes.length;
  const nextStep = journey[stepIndex];
  const isComplete = load.journey_complete;

  return (
    <div className={`bg-white rounded-lg border-2 overflow-hidden transition-all ${
      load.classification === 'CRISIS' ? 'border-red-500 shadow-lg ring-2 ring-red-200' :
      load.classification === 'EXCEPTION' ? 'border-orange-400 shadow-md' :
      load.active_move ? 'border-blue-400 shadow-md' :
      isComplete ? 'border-green-400 opacity-70' :
      days !== null && days <= 1 ? 'border-red-400 shadow-lg' :
      'border-gray-200 hover:border-gray-300'
    }`}>
      {/* Header */}
      <div className={`px-4 py-3 ${
        load.classification === 'CRISIS' ? 'bg-red-50' :
        load.classification === 'EXCEPTION' ? 'bg-orange-50' :
        load.active_move ? 'bg-blue-50' :
        'bg-gray-50'
      }`}>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-lg font-bold">{load.container_number}</span>
              {load.is_hazmat && <span title="HAZMAT" className="text-lg">☣️</span>}
              {load.is_overweight && <span title="Overweight" className="text-lg">⚖️</span>}
            </div>
            <div className="text-sm text-gray-500">
              {load.size}' • {load.steamship_line || 'No SSL'}
            </div>
          </div>
          <div className="text-right space-y-1">
            <div className="flex items-center gap-2 justify-end">
              <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded ${
                load.shipment_type === 'IMPORT' ? 'bg-purple-100 text-purple-700' : 'bg-teal-100 text-teal-700'
              }`}>
                {load.shipment_type}
              </span>
              <span className={`px-2 py-0.5 text-xs font-medium rounded ${CLASSIFICATION_COLORS[load.classification]}`}>
                {load.classification}
              </span>
            </div>
            {badge && (
              <div className={`px-2 py-1 text-xs font-bold rounded ${badge.color}`}>
                LFD: {badge.text}
              </div>
            )}
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between text-sm">
          <span className="text-gray-700 font-medium">{load.customer_name}</span>
          <span className="text-gray-500">{load.terminal_name}</span>
        </div>
      </div>

      {/* Risk & Optimization Alerts */}
      {(load.riskFactors.length > 0 || load.optimizations.length > 0) && (
        <div className="px-4 py-2 border-t bg-gray-50 space-y-1">
          {load.riskFactors.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-500">Risk:</span>
              {load.riskFactors.map((f, i) => (
                <span key={i} className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full">{f}</span>
              ))}
            </div>
          )}
          {load.optimizations.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-500">Opportunity:</span>
              {load.optimizations.map((o, i) => (
                <span key={i} className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full" title={o.description}>
                  {o.type.replace('_', ' ')} {o.savings}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Hold Warning */}
      {load.customs_status === 'HOLD' && (
        <div className="px-4 py-2 bg-red-50 border-t border-red-200 text-sm text-red-700 font-medium">
          ⛔ CUSTOMS HOLD - Cannot dispatch until released
        </div>
      )}

      {/* Journey Progress - Compact */}
      <div className="px-4 py-3 border-t">
        <div className="flex items-center gap-1">
          {journey.map((step, idx) => {
            const done = idx < stepIndex;
            const active = load.active_move?.type === step.type;
            const next = idx === stepIndex && !load.active_move;

            return (
              <div key={step.type} className="flex items-center flex-1">
                <div
                  className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm ${
                    done ? 'bg-green-500 text-white' :
                    active ? 'bg-blue-500 text-white ring-2 ring-blue-200' :
                    next ? 'bg-indigo-100 text-indigo-600' :
                    'bg-gray-100 text-gray-400'
                  }`}
                  title={step.label}
                >
                  {done ? '✓' : active ? '→' : step.icon}
                </div>
                {idx < journey.length - 1 && (
                  <div className={`flex-1 h-1 mx-1 rounded ${done ? 'bg-green-500' : 'bg-gray-200'}`} />
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-2 text-xs text-center text-gray-500">
          {isComplete ? (
            <span className="text-green-600 font-medium">✓ Journey Complete</span>
          ) : load.active_move ? (
            <span className="text-blue-600">
              In Progress: {journey.find(j => j.type === load.active_move?.type)?.label}
              {load.active_move.driver_name && ` (${load.active_move.driver_name})`}
            </span>
          ) : (
            <span className="text-gray-600">Next: {nextStep?.label}</span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="px-4 py-3 border-t bg-gray-50">
        {isComplete ? (
          <div className="text-center text-green-600 font-medium text-sm">✓ All moves completed</div>
        ) : load.active_move ? (
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm">
              <span className="font-medium">{load.active_move.driver_name || 'Driver assigned'}</span>
              <span className="text-gray-400 mx-1">•</span>
              <span className="text-gray-500">{load.active_move.pickup} → {load.active_move.delivery}</span>
            </div>
            <button
              onClick={onComplete}
              className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition"
            >
              ✓ Complete
            </button>
          </div>
        ) : (
          <button
            onClick={onDispatch}
            disabled={load.customs_status === 'HOLD'}
            className="w-full py-2.5 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
          >
            <span>🚛</span>
            <span>Dispatch: {nextStep?.label}</span>
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
  onSend: (driverId: string, notes?: string) => void;
  onClose: () => void;
}) {
  const journey = JOURNEY[load.shipment_type];
  const stepIndex = load.completed_moves.length;
  const step = journey[stepIndex];

  const [selectedDriver, setSelectedDriver] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [notes, setNotes] = useState('');

  const driver = drivers.find(d => d.id === selectedDriver);

  // Get locations
  const pickup = step.fromKey === 'terminal' ? load.terminal_name : (load.delivery_city || load.delivery_address);
  const delivery = step.toKey === 'terminal' ? load.terminal_name : (load.delivery_city || load.delivery_address);

  // Driver recommendations based on load classification
  const recommendedDrivers = useMemo(() => {
    const eligible = drivers.filter(d => {
      if (!d.available) return false;
      if (load.is_hazmat && !d.has_hazmat) return false;
      return true;
    });

    // Sort by suitability
    return eligible.sort((a, b) => {
      // Experienced drivers for complex/exception loads
      if (load.classification !== 'STANDARD') {
        if (a.experience_level === 'EXPERIENCED' && b.experience_level !== 'EXPERIENCED') return -1;
        if (b.experience_level === 'EXPERIENCED' && a.experience_level !== 'EXPERIENCED') return 1;
      }
      // Less active loads = more available
      return (a.active_loads || 0) - (b.active_loads || 0);
    });
  }, [drivers, load]);

  // Build message
  const message = `🚛 DISPATCH

${step.icon} ${step.label.toUpperCase()}

Container: ${load.container_number} (${load.size}')
${load.is_hazmat ? '☣️ HAZMAT LOAD\n' : ''}${load.is_overweight ? '⚖️ OVERWEIGHT\n' : ''}
📍 PICKUP: ${pickup}
📍 DELIVER: ${delivery}

Customer: ${load.customer_name}
SSL: ${load.steamship_line || 'N/A'}
${load.booking_number ? `Booking: ${load.booking_number}\n` : ''}${load.last_free_day ? `LFD: ${new Date(load.last_free_day).toLocaleDateString()}\n` : ''}${notes ? `\nNOTES: ${notes}\n` : ''}
Reply YES to confirm.`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className={`px-6 py-4 ${
          load.classification === 'CRISIS' ? 'bg-red-600' :
          load.classification === 'EXCEPTION' ? 'bg-orange-500' :
          'bg-indigo-600'
        } text-white`}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Dispatch Load</h2>
              <p className="text-white/80 text-sm">{load.container_number} • {step.label}</p>
            </div>
            {load.classification !== 'STANDARD' && (
              <span className="px-3 py-1 bg-white/20 rounded-full text-sm font-medium">
                {load.classification}
              </span>
            )}
          </div>
        </div>

        {!showPreview ? (
          <>
            {/* Route Info */}
            <div className="p-6 border-b">
              <div className="flex items-center text-sm mb-3">
                <div className="w-3 h-3 rounded-full bg-green-500 mr-3" />
                <div>
                  <span className="font-medium">{pickup}</span>
                  <span className="text-gray-400 ml-2">Pickup</span>
                </div>
              </div>
              <div className="ml-1.5 border-l-2 border-dashed border-gray-300 h-4" />
              <div className="flex items-center text-sm">
                <div className="w-3 h-3 rounded-full bg-red-500 mr-3" />
                <div>
                  <span className="font-medium">{delivery}</span>
                  <span className="text-gray-400 ml-2">Delivery</span>
                </div>
              </div>
            </div>

            {/* Driver Selection */}
            <div className="p-6">
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium text-gray-700">Select Driver</label>
                {load.is_hazmat && (
                  <span className="text-xs text-purple-600 font-medium">HAZMAT certification required</span>
                )}
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {recommendedDrivers.map((d, idx) => (
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
                        <div className="font-medium flex items-center gap-2">
                          {d.name}
                          {idx === 0 && load.classification !== 'STANDARD' && (
                            <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded">Recommended</span>
                          )}
                        </div>
                        <div className="text-sm text-gray-500">{d.phone}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        {d.has_hazmat && (
                          <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">HAZMAT</span>
                        )}
                        {d.has_twic && (
                          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">TWIC</span>
                        )}
                        <div className="w-3 h-3 rounded-full bg-green-500" title="Available" />
                      </div>
                    </div>
                  </button>
                ))}
                {recommendedDrivers.length === 0 && (
                  <p className="text-center text-gray-500 py-4">No eligible drivers available</p>
                )}
              </div>

              {/* Hazmat Warning */}
              {load.is_hazmat && driver && !driver.has_hazmat && (
                <p className="mt-3 text-sm text-red-600 font-medium">
                  ⚠️ Selected driver lacks HAZMAT endorsement
                </p>
              )}

              {/* Notes */}
              <div className="mt-4">
                <label className="text-sm font-medium text-gray-700 mb-1 block">Dispatch Notes (optional)</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                  rows={2}
                  placeholder="Special instructions for driver..."
                />
              </div>
            </div>
          </>
        ) : (
          /* Message Preview */
          <div className="p-6">
            <p className="text-sm text-gray-500 mb-2">Message to {driver?.name}:</p>
            <div className="bg-gray-900 text-green-400 rounded-lg p-4 font-mono text-sm whitespace-pre-wrap max-h-64 overflow-y-auto">
              {message}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 flex justify-between border-t">
          <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:text-gray-800">
            Cancel
          </button>
          {!showPreview ? (
            <button
              onClick={() => setShowPreview(true)}
              disabled={!selectedDriver}
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-300 transition"
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
                onClick={() => onSend(selectedDriver, notes)}
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

// ===== STATS PANEL =====

function StatsPanel({ loads }: { loads: Load[] }) {
  const stats = useMemo(() => {
    const needsDispatch = loads.filter(l => !l.active_move && !l.journey_complete && l.customs_status !== 'HOLD');
    const active = loads.filter(l => l.active_move);
    const complete = loads.filter(l => l.journey_complete);
    const onHold = loads.filter(l => l.customs_status === 'HOLD' && !l.journey_complete);
    const urgent = loads.filter(l => {
      const d = daysUntilLFD(l.last_free_day);
      return d !== null && d <= 2 && !l.journey_complete;
    });
    const byClass = {
      CRISIS: loads.filter(l => l.classification === 'CRISIS').length,
      EXCEPTION: loads.filter(l => l.classification === 'EXCEPTION').length,
      COMPLEX: loads.filter(l => l.classification === 'COMPLEX').length,
      STANDARD: loads.filter(l => l.classification === 'STANDARD').length,
    };
    return { needsDispatch: needsDispatch.length, active: active.length, complete: complete.length, onHold: onHold.length, urgent: urgent.length, byClass };
  }, [loads]);

  return (
    <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
      <div className="bg-white rounded-lg p-3 border shadow-sm">
        <p className="text-xs text-gray-500 uppercase">Needs Dispatch</p>
        <p className="text-2xl font-bold text-indigo-600">{stats.needsDispatch}</p>
      </div>
      <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
        <p className="text-xs text-blue-600 uppercase">Active</p>
        <p className="text-2xl font-bold text-blue-700">{stats.active}</p>
      </div>
      <div className="bg-green-50 rounded-lg p-3 border border-green-200">
        <p className="text-xs text-green-600 uppercase">Complete</p>
        <p className="text-2xl font-bold text-green-700">{stats.complete}</p>
      </div>
      {stats.urgent > 0 && (
        <div className="bg-red-50 rounded-lg p-3 border border-red-200">
          <p className="text-xs text-red-600 uppercase">🔥 Urgent</p>
          <p className="text-2xl font-bold text-red-700">{stats.urgent}</p>
        </div>
      )}
      {stats.onHold > 0 && (
        <div className="bg-orange-50 rounded-lg p-3 border border-orange-200">
          <p className="text-xs text-orange-600 uppercase">On Hold</p>
          <p className="text-2xl font-bold text-orange-700">{stats.onHold}</p>
        </div>
      )}
      {stats.byClass.CRISIS > 0 && (
        <div className="bg-red-100 rounded-lg p-3 border border-red-300">
          <p className="text-xs text-red-700 uppercase">Crisis</p>
          <p className="text-2xl font-bold text-red-800">{stats.byClass.CRISIS}</p>
        </div>
      )}
    </div>
  );
}

// ===== MAIN BOARD =====

export default function DispatchBoard() {
  const [loads, setLoads] = useState<Load[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [dispatchingLoad, setDispatchingLoad] = useState<Load | null>(null);
  const [view, setView] = useState<'dispatch' | 'active' | 'complete' | 'hold'>('dispatch');
  const [expandedLoad, setExpandedLoad] = useState<string | null>(null);

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

      // Build partial loads first (for optimization detection)
      const partialLoads: Partial<Load>[] = (containers || []).map((c: any) => ({
        id: c.id,
        shipment_type: c.shipment?.type || 'IMPORT',
        delivery_city: c.shipment?.delivery_city || '',
        is_hazmat: c.is_hazmat,
        is_overweight: c.is_overweight,
        customs_status: c.customs_status,
        last_free_day: c.shipment?.last_free_day,
      }));

      // Build full loads
      const loadList: Load[] = (containers || []).map((c: any) => {
        const moves = orderMap.get(c.id) || [];
        const active = moves.find((m: any) => ['DISPATCHED', 'IN_PROGRESS'].includes(m.status));
        const completed = moves.filter((m: any) => m.status === 'COMPLETED');

        const journey = JOURNEY[c.shipment?.type as 'IMPORT' | 'EXPORT'] || JOURNEY.IMPORT;
        const completedTypes = completed.map((m: any) => m.move_type_v2);
        const journeyComplete = journey.every(step => completedTypes.includes(step.type));

        const days = daysUntilLFD(c.shipment?.last_free_day);
        const { score: riskScore, factors: riskFactors } = calculateRiskScore({
          customs_status: c.customs_status,
          is_hazmat: c.is_hazmat,
          is_overweight: c.is_overweight,
        }, days);

        const classification = classifyLoad({
          customs_status: c.customs_status,
          is_hazmat: c.is_hazmat,
          is_overweight: c.is_overweight,
        }, riskScore);

        const optimizations = journeyComplete ? [] : findOptimizations({
          id: c.id,
          shipment_type: c.shipment?.type,
          delivery_city: c.shipment?.delivery_city,
          journey_complete: journeyComplete,
        }, partialLoads);

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
            status: 'COMPLETED' as const,
            pickup: m.pickup_city || '',
            delivery: m.delivery_city || '',
            completed_at: m.completed_at,
          })),
          journey_complete: journeyComplete,
          classification,
          riskScore,
          riskFactors,
          optimizations,
        };
      });

      // Sort: Crisis first, then by risk score, then LFD
      loadList.sort((a, b) => {
        // Classification priority
        const classOrder = { CRISIS: 0, EXCEPTION: 1, COMPLEX: 2, STANDARD: 3 };
        if (classOrder[a.classification] !== classOrder[b.classification]) {
          return classOrder[a.classification] - classOrder[b.classification];
        }
        // Then by risk score
        if (a.riskScore !== b.riskScore) {
          return b.riskScore - a.riskScore;
        }
        // Then by LFD
        const da = daysUntilLFD(a.last_free_day) ?? 999;
        const db = daysUntilLFD(b.last_free_day) ?? 999;
        return da - db;
      });

      setLoads(loadList);

      // Get drivers with availability info
      const { data: driverData } = await supabase
        .from('drivers')
        .select('id, first_name, last_name, phone, status, has_hazmat_endorsement, has_twic')
        .in('status', ['ACTIVE', 'AVAILABLE']);

      // Count active loads per driver
      const driverLoadCounts = new Map<string, number>();
      orders?.forEach((o: any) => {
        if (['DISPATCHED', 'IN_PROGRESS'].includes(o.status) && o.assigned_driver_id) {
          driverLoadCounts.set(o.assigned_driver_id, (driverLoadCounts.get(o.assigned_driver_id) || 0) + 1);
        }
      });

      setDrivers((driverData || []).map((d: any) => ({
        id: d.id,
        name: `${d.first_name} ${d.last_name}`,
        phone: d.phone || '',
        available: true,
        has_hazmat: d.has_hazmat_endorsement || false,
        has_twic: d.has_twic || false,
        experience_level: 'STANDARD',
        active_loads: driverLoadCounts.get(d.id) || 0,
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
  const handleDispatch = async (driverId: string, notes?: string) => {
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
        special_instructions: notes || null,
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
    if (view === 'dispatch') return !l.active_move && !l.journey_complete && l.customs_status !== 'HOLD';
    if (view === 'active') return !!l.active_move;
    if (view === 'complete') return l.journey_complete;
    if (view === 'hold') return l.customs_status === 'HOLD' && !l.journey_complete;
    return true;
  });

  // Tab counts
  const counts = useMemo(() => ({
    dispatch: loads.filter(l => !l.active_move && !l.journey_complete && l.customs_status !== 'HOLD').length,
    active: loads.filter(l => l.active_move).length,
    complete: loads.filter(l => l.journey_complete).length,
    hold: loads.filter(l => l.customs_status === 'HOLD' && !l.journey_complete).length,
  }), [loads]);

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
              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition flex items-center gap-2"
            >
              <span>↻</span> Refresh
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setView('dispatch')}
              className={`px-4 py-2.5 rounded-lg font-medium transition ${
                view === 'dispatch'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              🚛 Needs Dispatch ({counts.dispatch})
            </button>
            <button
              onClick={() => setView('active')}
              className={`px-4 py-2.5 rounded-lg font-medium transition ${
                view === 'active'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              📍 Active ({counts.active})
            </button>
            <button
              onClick={() => setView('complete')}
              className={`px-4 py-2.5 rounded-lg font-medium transition ${
                view === 'complete'
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              ✓ Complete ({counts.complete})
            </button>
            {counts.hold > 0 && (
              <button
                onClick={() => setView('hold')}
                className={`px-4 py-2.5 rounded-lg font-medium transition ${
                  view === 'hold'
                    ? 'bg-orange-600 text-white'
                    : 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                }`}
              >
                ⛔ On Hold ({counts.hold})
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Stats */}
        <StatsPanel loads={loads} />

        {/* Load Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(load => (
            <LoadCard
              key={load.id}
              load={load}
              onDispatch={() => setDispatchingLoad(load)}
              onComplete={() => handleComplete(load)}
              expanded={expandedLoad === load.id}
              onToggleExpand={() => setExpandedLoad(expandedLoad === load.id ? null : load.id)}
            />
          ))}
          {filtered.length === 0 && (
            <div className="col-span-full text-center py-16 text-gray-500">
              {view === 'dispatch' && 'All loads dispatched!'}
              {view === 'active' && 'No active dispatches'}
              {view === 'complete' && 'No completed loads yet'}
              {view === 'hold' && 'No loads on hold'}
            </div>
          )}
        </div>
      </div>

      {/* Available Drivers Panel */}
      <div className="fixed bottom-6 right-6 bg-white rounded-xl shadow-lg border p-4 w-72 max-h-80 overflow-hidden">
        <h3 className="font-semibold text-gray-900 mb-3 flex items-center justify-between">
          <span>Available Drivers</span>
          <span className="text-sm font-normal text-gray-500">{drivers.filter(d => d.available).length}</span>
        </h3>
        <div className="space-y-2 overflow-y-auto max-h-56">
          {drivers.filter(d => d.available).map(d => (
            <div key={d.id} className="flex items-center justify-between text-sm p-2 bg-gray-50 rounded-lg">
              <div>
                <span className="font-medium">{d.name}</span>
                {d.active_loads > 0 && (
                  <span className="ml-2 text-xs text-gray-400">({d.active_loads} active)</span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {d.has_hazmat && <span className="text-xs text-purple-600" title="HAZMAT">HM</span>}
                {d.has_twic && <span className="text-xs text-blue-600" title="TWIC">TW</span>}
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
              </div>
            </div>
          ))}
          {drivers.filter(d => d.available).length === 0 && (
            <p className="text-sm text-gray-500 text-center py-4">No drivers available</p>
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
