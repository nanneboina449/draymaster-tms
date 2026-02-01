'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

// ============================================================================
// TYPES
// ============================================================================

interface DispatchModalProps {
  // The container/load to dispatch
  container: {
    id: string;
    container_number: string;
    size?: string;
    type?: string;
    is_hazmat?: boolean;
    is_overweight?: boolean;
    weight_lbs?: number;
    customs_status?: string;
  };
  // Shipment info for auto-populating addresses
  shipment: {
    id: string;
    reference_number?: string;
    type: 'IMPORT' | 'EXPORT';
    customer_name?: string;
    terminal_name?: string;
    delivery_address?: string;
    delivery_city?: string;
    delivery_state?: string;
    booking_number?: string;
    bill_of_lading?: string;
    last_free_day?: string;
    steamship_line?: string;
  };
  // Existing leg to dispatch (if any)
  existingLeg?: {
    id: string;
    order_number: string;
    move_type: string;
    pickup_address?: string;
    pickup_city?: string;
    delivery_address?: string;
    delivery_city?: string;
  };
  onClose: () => void;
  onSuccess: () => void;
}

interface Driver {
  id: string;
  first_name: string;
  last_name: string;
  phone?: string;
  status: string;
  has_hazmat_endorsement?: boolean;
  current_tractor_id?: string;
}

interface Tractor {
  id: string;
  unit_number: string;
  make?: string;
  model?: string;
  status: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const LEG_TYPES = {
  IMPORT: [
    { value: 'IMPORT_DELIVERY', label: 'Import Delivery', icon: '📥', description: 'Pick up from terminal, deliver to customer' },
    { value: 'PRE_PULL', label: 'Pre-Pull', icon: '🏗️', description: 'Pull from terminal to yard for staging' },
    { value: 'YARD_DELIVERY', label: 'Yard Delivery', icon: '🏠', description: 'Deliver from yard to customer' },
    { value: 'EMPTY_RETURN', label: 'Empty Return', icon: '🔄', description: 'Return empty container to terminal' },
  ],
  EXPORT: [
    { value: 'EMPTY_PICKUP', label: 'Empty Pickup', icon: '📦', description: 'Pick up empty from terminal/depot' },
    { value: 'EXPORT_PICKUP', label: 'Export Pickup', icon: '📤', description: 'Pick up loaded from shipper, deliver to terminal' },
  ],
};

const CHASSIS_POOLS = ['DCLI', 'TRAC', 'FLEXI', 'SSL', 'OWN'];

// ============================================================================
// DISPATCH MODAL COMPONENT
// ============================================================================

export default function DispatchModal({
  container,
  shipment,
  existingLeg,
  onClose,
  onSuccess,
}: DispatchModalProps) {
  // Form state
  const [legType, setLegType] = useState(existingLeg?.move_type || '');
  const [pickupAddress, setPickupAddress] = useState(existingLeg?.pickup_address || '');
  const [pickupCity, setPickupCity] = useState(existingLeg?.pickup_city || '');
  const [deliveryAddress, setDeliveryAddress] = useState(existingLeg?.delivery_address || '');
  const [deliveryCity, setDeliveryCity] = useState(existingLeg?.delivery_city || '');
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [selectedTractorId, setSelectedTractorId] = useState('');
  const [chassisNumber, setChassisNumber] = useState('');
  const [chassisPool, setChassisPool] = useState('DCLI');
  const [specialInstructions, setSpecialInstructions] = useState('');

  // Data
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [tractors, setTractors] = useState<Tractor[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<'details' | 'preview'>('details');

  // Load drivers and tractors
  useEffect(() => {
    const loadResources = async () => {
      setLoading(true);
      try {
        const [driversRes, tractorsRes] = await Promise.all([
          supabase.from('drivers').select('*').in('status', ['ACTIVE', 'AVAILABLE']),
          supabase.from('tractors').select('*').in('status', ['ACTIVE', 'AVAILABLE']),
        ]);
        setDrivers(driversRes.data || []);
        setTractors(tractorsRes.data || []);
      } catch (err) {
        console.error('Error loading resources:', err);
      } finally {
        setLoading(false);
      }
    };
    loadResources();
  }, []);

  // Auto-populate addresses based on leg type
  useEffect(() => {
    if (!legType) return;

    switch (legType) {
      case 'IMPORT_DELIVERY':
        // Pickup from terminal, deliver to customer
        setPickupAddress(shipment.terminal_name || '');
        setPickupCity('Terminal');
        setDeliveryAddress(shipment.delivery_address || '');
        setDeliveryCity(shipment.delivery_city || '');
        break;
      case 'PRE_PULL':
        // Pickup from terminal, deliver to yard
        setPickupAddress(shipment.terminal_name || '');
        setPickupCity('Terminal');
        setDeliveryAddress('');
        setDeliveryCity('Yard');
        break;
      case 'YARD_DELIVERY':
        // Pickup from yard, deliver to customer
        setPickupAddress('');
        setPickupCity('Yard');
        setDeliveryAddress(shipment.delivery_address || '');
        setDeliveryCity(shipment.delivery_city || '');
        break;
      case 'EMPTY_RETURN':
        // Pickup from customer/yard, return to terminal
        setPickupAddress(shipment.delivery_address || '');
        setPickupCity(shipment.delivery_city || 'Customer');
        setDeliveryAddress(shipment.terminal_name || '');
        setDeliveryCity('Terminal');
        break;
      case 'EMPTY_PICKUP':
        // Pickup empty from depot, deliver to shipper
        setPickupAddress(shipment.terminal_name || '');
        setPickupCity('Empty Depot');
        setDeliveryAddress(shipment.delivery_address || '');
        setDeliveryCity(shipment.delivery_city || 'Shipper');
        break;
      case 'EXPORT_PICKUP':
        // Pickup loaded from shipper, deliver to terminal
        setPickupAddress(shipment.delivery_address || '');
        setPickupCity(shipment.delivery_city || 'Shipper');
        setDeliveryAddress(shipment.terminal_name || '');
        setDeliveryCity('Terminal');
        break;
    }
  }, [legType, shipment]);

  // Get selected driver info
  const selectedDriver = drivers.find(d => d.id === selectedDriverId);
  const selectedTractor = tractors.find(t => t.id === selectedTractorId);

  // Build dispatch message preview
  const buildDispatchMessage = () => {
    const legInfo = [...LEG_TYPES.IMPORT, ...LEG_TYPES.EXPORT].find(l => l.value === legType);

    return {
      header: `🚛 NEW DISPATCH - ${legInfo?.label || legType}`,
      containerInfo: `Container: ${container.container_number} (${container.size || '40'}'${container.type ? ` ${container.type}` : ''})`,
      flags: [
        container.is_hazmat && '☣️ HAZMAT',
        container.is_overweight && '⚖️ OVERWEIGHT',
        container.weight_lbs && `${container.weight_lbs.toLocaleString()} lbs`,
      ].filter(Boolean).join(' | '),
      route: {
        pickup: pickupCity || pickupAddress || 'TBD',
        delivery: deliveryCity || deliveryAddress || 'TBD',
      },
      reference: [
        shipment.booking_number && `BKG: ${shipment.booking_number}`,
        shipment.bill_of_lading && `B/L: ${shipment.bill_of_lading}`,
        shipment.reference_number && `REF: ${shipment.reference_number}`,
      ].filter(Boolean).join(' | '),
      customer: shipment.customer_name || 'N/A',
      equipment: [
        selectedTractor && `Truck: ${selectedTractor.unit_number}`,
        chassisNumber && `Chassis: ${chassisNumber}`,
        chassisPool && `Pool: ${chassisPool}`,
      ].filter(Boolean).join(' | '),
      lfd: shipment.last_free_day,
      ssl: shipment.steamship_line,
      instructions: specialInstructions || null,
    };
  };

  // Handle dispatch submission
  const handleDispatch = async () => {
    if (!selectedDriverId) {
      alert('Please select a driver');
      return;
    }
    if (!legType) {
      alert('Please select a leg type');
      return;
    }

    setSubmitting(true);
    try {
      if (existingLeg) {
        // Update existing leg and dispatch
        const { error } = await supabase
          .from('orders')
          .update({
            assigned_driver_id: selectedDriverId,
            assigned_tractor_id: selectedTractorId || null,
            chassis_number: chassisNumber || null,
            chassis_pool: chassisPool,
            pickup_address: pickupAddress,
            pickup_city: pickupCity,
            delivery_address: deliveryAddress,
            delivery_city: deliveryCity,
            special_instructions: specialInstructions || null,
            status: 'DISPATCHED',
            dispatched_at: new Date().toISOString(),
          })
          .eq('id', existingLeg.id);

        if (error) throw error;
      } else {
        // Create new leg and dispatch
        const orderNumber = `ORD-${Date.now().toString(36).toUpperCase()}`;

        const { error } = await supabase
          .from('orders')
          .insert({
            order_number: orderNumber,
            container_id: container.id,
            shipment_id: shipment.id,
            type: shipment.type,
            move_type_v2: legType,
            pickup_address: pickupAddress,
            pickup_city: pickupCity,
            delivery_address: deliveryAddress,
            delivery_city: deliveryCity,
            assigned_driver_id: selectedDriverId,
            assigned_tractor_id: selectedTractorId || null,
            chassis_number: chassisNumber || null,
            chassis_pool: chassisPool,
            special_instructions: specialInstructions || null,
            status: 'DISPATCHED',
            dispatched_at: new Date().toISOString(),
          });

        if (error) throw error;
      }

      onSuccess();
    } catch (err: any) {
      alert('Error dispatching: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const message = buildDispatchMessage();
  const availableLegTypes = LEG_TYPES[shipment.type] || LEG_TYPES.IMPORT;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black bg-opacity-50" onClick={onClose}></div>
      <div className="relative min-h-screen flex items-center justify-center p-4">
        <div className="relative bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">

          {/* Header */}
          <div className="px-6 py-4 border-b bg-gray-50">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {existingLeg ? 'Dispatch Leg' : 'Create & Dispatch Leg'}
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  {container.container_number} • {shipment.type} • {shipment.customer_name || 'No Customer'}
                </p>
              </div>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Step indicator */}
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setStep('details')}
                className={`flex-1 py-2 text-sm font-medium rounded-lg transition ${
                  step === 'details' ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-600'
                }`}
              >
                1. Dispatch Details
              </button>
              <button
                onClick={() => selectedDriverId && legType && setStep('preview')}
                disabled={!selectedDriverId || !legType}
                className={`flex-1 py-2 text-sm font-medium rounded-lg transition ${
                  step === 'preview' ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-600'
                } disabled:opacity-50`}
              >
                2. Preview & Send
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {step === 'details' ? (
              <div className="space-y-6">
                {/* Container Info Card */}
                <div className="p-4 bg-gray-50 rounded-lg border">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center">
                        <span className="text-2xl">📦</span>
                      </div>
                      <div>
                        <p className="font-mono font-bold text-lg">{container.container_number}</p>
                        <p className="text-sm text-gray-500">
                          {container.size}' {container.type || 'DRY'}
                          {container.is_hazmat && ' • ☣️ Hazmat'}
                          {container.is_overweight && ' • ⚖️ Overweight'}
                        </p>
                      </div>
                    </div>
                    {shipment.last_free_day && (
                      <div className="text-right">
                        <p className="text-xs text-gray-500">Last Free Day</p>
                        <p className="font-medium text-orange-600">
                          {new Date(shipment.last_free_day).toLocaleDateString()}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Leg Type Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Leg Type *
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {availableLegTypes.map((leg) => (
                      <button
                        key={leg.value}
                        onClick={() => setLegType(leg.value)}
                        className={`p-3 rounded-lg border text-left transition ${
                          legType === leg.value
                            ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-500'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{leg.icon}</span>
                          <span className="font-medium text-sm">{leg.label}</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">{leg.description}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Route - Auto-populated based on leg type */}
                {legType && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        <span className="text-green-600">●</span> Pickup Location
                      </label>
                      <input
                        type="text"
                        value={pickupAddress}
                        onChange={(e) => setPickupAddress(e.target.value)}
                        placeholder="Address or location name"
                        className="w-full px-3 py-2 border rounded-lg text-sm"
                      />
                      <input
                        type="text"
                        value={pickupCity}
                        onChange={(e) => setPickupCity(e.target.value)}
                        placeholder="City"
                        className="w-full px-3 py-2 border rounded-lg text-sm mt-1"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        <span className="text-red-600">●</span> Delivery Location
                      </label>
                      <input
                        type="text"
                        value={deliveryAddress}
                        onChange={(e) => setDeliveryAddress(e.target.value)}
                        placeholder="Address or location name"
                        className="w-full px-3 py-2 border rounded-lg text-sm"
                      />
                      <input
                        type="text"
                        value={deliveryCity}
                        onChange={(e) => setDeliveryCity(e.target.value)}
                        placeholder="City"
                        className="w-full px-3 py-2 border rounded-lg text-sm mt-1"
                      />
                    </div>
                  </div>
                )}

                {/* Driver Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Assign Driver *
                  </label>
                  <select
                    value={selectedDriverId}
                    onChange={(e) => setSelectedDriverId(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="">Select a driver...</option>
                    {drivers.map((driver) => (
                      <option key={driver.id} value={driver.id}>
                        {driver.first_name} {driver.last_name}
                        {driver.has_hazmat_endorsement && ' (HAZMAT)'}
                        {driver.status === 'AVAILABLE' && ' - Available'}
                      </option>
                    ))}
                  </select>
                  {container.is_hazmat && selectedDriver && !selectedDriver.has_hazmat_endorsement && (
                    <p className="text-xs text-red-600 mt-1">
                      ⚠️ This container requires HAZMAT endorsement
                    </p>
                  )}
                </div>

                {/* Equipment */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tractor</label>
                    <select
                      value={selectedTractorId}
                      onChange={(e) => setSelectedTractorId(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg text-sm"
                    >
                      <option value="">Select...</option>
                      {tractors.map((tractor) => (
                        <option key={tractor.id} value={tractor.id}>
                          {tractor.unit_number}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Chassis #</label>
                    <input
                      type="text"
                      value={chassisNumber}
                      onChange={(e) => setChassisNumber(e.target.value.toUpperCase())}
                      placeholder="DCLI-123456"
                      className="w-full px-3 py-2 border rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Pool</label>
                    <select
                      value={chassisPool}
                      onChange={(e) => setChassisPool(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg text-sm"
                    >
                      {CHASSIS_POOLS.map((pool) => (
                        <option key={pool} value={pool}>{pool}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Special Instructions */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Special Instructions
                  </label>
                  <textarea
                    value={specialInstructions}
                    onChange={(e) => setSpecialInstructions(e.target.value)}
                    rows={2}
                    placeholder="Any special instructions for the driver..."
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
              </div>
            ) : (
              /* Preview Step */
              <div className="space-y-4">
                <div className="bg-gray-900 text-gray-100 rounded-lg p-4 font-mono text-sm">
                  {/* Simulated SMS/App notification preview */}
                  <div className="text-center mb-4 pb-2 border-b border-gray-700">
                    <p className="text-xs text-gray-400">Driver will receive this message:</p>
                    <p className="text-green-400 font-bold mt-1">
                      📱 {selectedDriver?.first_name} {selectedDriver?.last_name}
                    </p>
                  </div>

                  <div className="space-y-3">
                    <p className="text-yellow-400 font-bold text-lg">{message.header}</p>

                    <div className="bg-gray-800 rounded p-2">
                      <p className="text-white font-bold">{message.containerInfo}</p>
                      {message.flags && <p className="text-orange-400 text-xs">{message.flags}</p>}
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-green-400">📍</span>
                      <span>{message.route.pickup}</span>
                    </div>
                    <div className="flex items-center gap-2 ml-4 text-gray-500">
                      <span>↓</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-red-400">📍</span>
                      <span>{message.route.delivery}</span>
                    </div>

                    {message.reference && (
                      <p className="text-gray-400 text-xs">{message.reference}</p>
                    )}

                    <div className="border-t border-gray-700 pt-2 mt-2">
                      <p className="text-gray-400">Customer: <span className="text-white">{message.customer}</span></p>
                      {message.ssl && <p className="text-gray-400">SSL: <span className="text-white">{message.ssl}</span></p>}
                      {message.lfd && (
                        <p className="text-gray-400">
                          LFD: <span className="text-orange-400 font-bold">{new Date(message.lfd).toLocaleDateString()}</span>
                        </p>
                      )}
                    </div>

                    {message.equipment && (
                      <div className="bg-gray-800 rounded p-2 text-xs">
                        <p className="text-gray-400">Equipment: <span className="text-white">{message.equipment}</span></p>
                      </div>
                    )}

                    {message.instructions && (
                      <div className="bg-yellow-900/50 rounded p-2 text-xs">
                        <p className="text-yellow-400">📝 {message.instructions}</p>
                      </div>
                    )}

                    <p className="text-center text-gray-500 text-xs mt-4">
                      — Reply YES to confirm —
                    </p>
                  </div>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-sm text-blue-800">
                    <strong>What happens next:</strong>
                  </p>
                  <ul className="text-sm text-blue-700 mt-1 space-y-1">
                    <li>• Driver receives push notification + SMS</li>
                    <li>• Load status changes to DISPATCHED</li>
                    <li>• You can track progress on the dispatch board</li>
                  </ul>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t bg-gray-50 flex items-center justify-between">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:text-gray-800"
            >
              Cancel
            </button>
            <div className="flex gap-2">
              {step === 'preview' && (
                <button
                  onClick={() => setStep('details')}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-100"
                >
                  ← Back
                </button>
              )}
              {step === 'details' ? (
                <button
                  onClick={() => setStep('preview')}
                  disabled={!selectedDriverId || !legType}
                  className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Preview Dispatch →
                </button>
              ) : (
                <button
                  onClick={handleDispatch}
                  disabled={submitting}
                  className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {submitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Dispatching...
                    </>
                  ) : (
                    <>
                      🚛 Send Dispatch
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
