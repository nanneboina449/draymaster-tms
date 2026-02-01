'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

// ============================================================================
// TYPES
// ============================================================================

interface DispatchOrder {
  id: string;
  order_number: string;
  status: string;
  move_type: string;
  container_id: string;
  container_number: string;
  container_size?: string;
  shipment_type?: string;
  terminal_name?: string;
  customer_name?: string;
  pickup_city?: string;
  delivery_city?: string;
  delivery_address?: string;
  last_free_day?: string;
  empty_ready_at?: string;
}

interface Driver {
  id: string;
  name: string;
  first_name: string;
  last_name: string;
  status: string;
  hazmat_endorsement?: boolean;
}

interface SwapOpportunity {
  delivery_order: DispatchOrder;
  empty_order: DispatchOrder;
  match_score: number;
}

interface CreateTripModalProps {
  deliveryOrder: DispatchOrder;
  onClose: () => void;
  onSuccess: () => void;
}

// ============================================================================
// TRIP EXECUTION TYPES
// ============================================================================

const TRIP_TYPES = [
  {
    id: 'LIVE_UNLOAD',
    label: 'Live Unload',
    description: 'Driver waits while customer unloads',
    returnType: 'BOBTAIL',
    icon: '⏱️',
  },
  {
    id: 'DROP',
    label: 'Drop & Go',
    description: 'Drop container, return bobtail',
    returnType: 'BOBTAIL',
    icon: '📦',
  },
  {
    id: 'DROP_AND_HOOK',
    label: 'Drop & Hook (Same Container)',
    description: 'Drop loaded, pick up this empty later',
    returnType: 'HOOK_SAME',
    icon: '🔄',
  },
  {
    id: 'SWAP',
    label: 'Swap (Different Container)',
    description: 'Drop loaded, pick up a different empty',
    returnType: 'HOOK_OTHER',
    icon: '🔀',
  },
];

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function CreateTripModal({
  deliveryOrder,
  onClose,
  onSuccess,
}: CreateTripModalProps) {
  const [step, setStep] = useState<'type' | 'swap' | 'driver' | 'confirm'>('type');
  const [tripType, setTripType] = useState('DROP');
  const [selectedEmpty, setSelectedEmpty] = useState<DispatchOrder | null>(null);
  const [availableEmpties, setAvailableEmpties] = useState<DispatchOrder[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [selectedDriver, setSelectedDriver] = useState('');
  const [chassisNumber, setChassis] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingEmpties, setLoadingEmpties] = useState(false);

  // Load drivers
  useEffect(() => {
    const loadDrivers = async () => {
      const { data } = await supabase
        .from('drivers')
        .select('*')
        .in('status', ['ACTIVE', 'AVAILABLE']);

      if (data) {
        setDrivers(data.map((d: any) => ({
          id: d.id,
          name: `${d.first_name} ${d.last_name}`,
          first_name: d.first_name,
          last_name: d.last_name,
          status: d.status,
          hazmat_endorsement: d.hazmat_endorsement,
        })));
      }
    };
    loadDrivers();
  }, []);

  // Load available empties when SWAP is selected
  useEffect(() => {
    if (tripType === 'SWAP') {
      loadAvailableEmpties();
    }
  }, [tripType]);

  const loadAvailableEmpties = async () => {
    setLoadingEmpties(true);
    try {
      // Find empty return orders at the same delivery location
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          container:containers!container_id(
            container_number, size, type, empty_ready_at, lifecycle_status
          ),
          shipment:shipments!shipment_id(
            customer_name
          )
        `)
        .eq('move_type_v2', 'EMPTY_RETURN')
        .in('status', ['PENDING', 'READY'])
        .is('deleted_at', null)
        .is('assigned_driver_id', null);

      if (error) throw error;

      // Filter to same city and transform
      const empties: DispatchOrder[] = (data || [])
        .filter((o: any) => {
          // Same city match
          const sameCity = o.pickup_city?.toLowerCase() === deliveryOrder.delivery_city?.toLowerCase();
          // Container is empty and ready
          const isReady = o.container?.empty_ready_at || o.container?.lifecycle_status === 'DROPPED';
          return sameCity || isReady;
        })
        .map((o: any) => ({
          id: o.id,
          order_number: o.order_number,
          status: o.status,
          move_type: o.move_type_v2,
          container_id: o.container_id,
          container_number: o.container?.container_number || 'N/A',
          container_size: o.container?.size,
          customer_name: o.shipment?.customer_name,
          pickup_city: o.pickup_city,
          empty_ready_at: o.container?.empty_ready_at,
        }));

      // Sort by match (same city first, then by empty ready date)
      empties.sort((a, b) => {
        const aMatch = a.pickup_city?.toLowerCase() === deliveryOrder.delivery_city?.toLowerCase();
        const bMatch = b.pickup_city?.toLowerCase() === deliveryOrder.delivery_city?.toLowerCase();
        if (aMatch && !bMatch) return -1;
        if (!aMatch && bMatch) return 1;
        return 0;
      });

      setAvailableEmpties(empties);
    } catch (err) {
      console.error('Error loading empties:', err);
    } finally {
      setLoadingEmpties(false);
    }
  };

  const handleCreateTrip = async () => {
    if (!selectedDriver) {
      alert('Please select a driver');
      return;
    }

    setLoading(true);
    try {
      if (tripType === 'SWAP' && selectedEmpty) {
        // Use the create_swap_trip function
        const { data, error } = await supabase.rpc('create_swap_trip', {
          p_delivery_order_id: deliveryOrder.id,
          p_empty_order_id: selectedEmpty.id,
          p_driver_id: selectedDriver,
          p_chassis_number: chassisNumber || null,
        });

        if (error) throw error;
      } else {
        // Standard single-order dispatch
        const updates: any = {
          assigned_driver_id: selectedDriver,
          status: 'DISPATCHED',
          dispatched_at: new Date().toISOString(),
          trip_execution_type: tripType,
          return_type: TRIP_TYPES.find(t => t.id === tripType)?.returnType || 'BOBTAIL',
        };

        if (chassisNumber) updates.chassis_number = chassisNumber;

        const { error } = await supabase
          .from('orders')
          .update(updates)
          .eq('id', deliveryOrder.id);

        if (error) throw error;
      }

      onSuccess();
    } catch (err: any) {
      alert('Error creating trip: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const renderStepContent = () => {
    switch (step) {
      case 'type':
        return (
          <div className="space-y-4">
            <h4 className="font-medium text-gray-900">How will this delivery be executed?</h4>
            <div className="grid grid-cols-2 gap-3">
              {TRIP_TYPES.map(type => (
                <button
                  key={type.id}
                  onClick={() => {
                    setTripType(type.id);
                    if (type.id === 'SWAP') {
                      setStep('swap');
                    } else {
                      setStep('driver');
                    }
                  }}
                  className={`p-4 border rounded-xl text-left hover:border-indigo-400 hover:bg-indigo-50 transition ${
                    tripType === type.id ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200'
                  }`}
                >
                  <span className="text-2xl">{type.icon}</span>
                  <p className="font-medium mt-2">{type.label}</p>
                  <p className="text-xs text-gray-500 mt-1">{type.description}</p>
                </button>
              ))}
            </div>
          </div>
        );

      case 'swap':
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-gray-900">Select Empty to Pick Up</h4>
              <button onClick={() => setStep('type')} className="text-sm text-indigo-600">
                ← Back
              </button>
            </div>

            {loadingEmpties ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
                <p className="text-sm text-gray-500 mt-2">Finding available empties...</p>
              </div>
            ) : availableEmpties.length === 0 ? (
              <div className="text-center py-8 bg-yellow-50 rounded-lg">
                <p className="text-yellow-800">No empties available at {deliveryOrder.delivery_city}</p>
                <p className="text-sm text-yellow-600 mt-1">Try DROP & Go instead</p>
                <button
                  onClick={() => {
                    setTripType('DROP');
                    setStep('driver');
                  }}
                  className="mt-3 text-sm text-indigo-600 hover:underline"
                >
                  Switch to Drop & Go
                </button>
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {availableEmpties.map(empty => {
                  const isSameCity = empty.pickup_city?.toLowerCase() === deliveryOrder.delivery_city?.toLowerCase();
                  return (
                    <button
                      key={empty.id}
                      onClick={() => {
                        setSelectedEmpty(empty);
                        setStep('driver');
                      }}
                      className={`w-full p-3 border rounded-lg text-left hover:border-indigo-400 transition ${
                        selectedEmpty?.id === empty.id ? 'border-indigo-500 bg-indigo-50' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold">{empty.container_number}</span>
                          <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">
                            {empty.container_size}'
                          </span>
                          {isSameCity && (
                            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
                              Same Location
                            </span>
                          )}
                        </div>
                        {empty.empty_ready_at && (
                          <span className="text-xs text-green-600">✓ Empty Ready</span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 mt-1">
                        {empty.customer_name} • {empty.pickup_city}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );

      case 'driver':
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-gray-900">Assign Driver</h4>
              <button onClick={() => setStep(tripType === 'SWAP' ? 'swap' : 'type')} className="text-sm text-indigo-600">
                ← Back
              </button>
            </div>

            {/* Trip Summary */}
            <div className="p-3 bg-gray-50 rounded-lg text-sm">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">{TRIP_TYPES.find(t => t.id === tripType)?.icon}</span>
                <span className="font-medium">{TRIP_TYPES.find(t => t.id === tripType)?.label}</span>
              </div>
              <div className="space-y-1 text-gray-600">
                <p>📦 Deliver: <span className="font-mono">{deliveryOrder.container_number}</span> → {deliveryOrder.delivery_city}</p>
                {tripType === 'SWAP' && selectedEmpty && (
                  <p>📤 Pickup: <span className="font-mono">{selectedEmpty.container_number}</span> (empty)</p>
                )}
              </div>
            </div>

            {/* Driver Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Driver *</label>
              <select
                value={selectedDriver}
                onChange={e => setSelectedDriver(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg"
              >
                <option value="">Select Driver</option>
                {drivers.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.name} {d.hazmat_endorsement ? '(HAZMAT)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Chassis */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Chassis #</label>
              <input
                type="text"
                value={chassisNumber}
                onChange={e => setChassis(e.target.value.toUpperCase())}
                placeholder="DCLI-123456"
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>

            {/* Dispatch Button */}
            <button
              onClick={handleCreateTrip}
              disabled={!selectedDriver || loading}
              className="w-full py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 font-medium"
            >
              {loading ? 'Creating Trip...' : 'Dispatch Trip'}
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black bg-opacity-50" onClick={onClose}></div>
      <div className="relative min-h-screen flex items-center justify-center p-4">
        <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg">
          {/* Header */}
          <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 px-6 py-4 rounded-t-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-white">Create Trip</h3>
                <p className="text-indigo-100 text-sm">
                  {deliveryOrder.container_number} • {deliveryOrder.move_type}
                </p>
              </div>
              <button onClick={onClose} className="text-white hover:text-indigo-200 text-2xl">
                &times;
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-6">
            {/* Progress Steps */}
            <div className="flex items-center justify-center gap-2 mb-6">
              {['type', 'swap', 'driver'].map((s, i) => {
                if (s === 'swap' && tripType !== 'SWAP') return null;
                const isActive = step === s;
                const isPast = ['type', 'swap', 'driver'].indexOf(step) > ['type', 'swap', 'driver'].indexOf(s);
                return (
                  <div key={s} className="flex items-center">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                        isActive
                          ? 'bg-indigo-600 text-white'
                          : isPast
                          ? 'bg-green-100 text-green-600'
                          : 'bg-gray-100 text-gray-400'
                      }`}
                    >
                      {isPast ? '✓' : i + 1}
                    </div>
                    {i < 2 && <div className="w-8 h-0.5 bg-gray-200 mx-1"></div>}
                  </div>
                );
              })}
            </div>

            {renderStepContent()}
          </div>
        </div>
      </div>
    </div>
  );
}
