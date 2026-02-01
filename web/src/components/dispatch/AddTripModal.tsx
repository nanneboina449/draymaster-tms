'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Driver, Tractor,
  getDrivers, getTractors, createContainerTrip
} from '../../lib/supabase';
import { supabase } from '../../lib/supabase';

interface AddTripModalProps {
  containerId?: string;
  shipmentId?: string;
  loadId?: string;
  containerNumber?: string;
  terminalName?: string;  // Pre-fill from shipment
  deliveryAddress?: string;  // Pre-fill from shipment
  onClose: () => void;
  onSuccess: () => void;
}

interface LocationOption {
  id: string;
  name: string;
  type: 'TERMINAL' | 'YARD' | 'CUSTOMER' | 'CUSTOM';
  address?: string;
  city?: string;
  state?: string;
}

const TRIP_TYPES = [
  { value: 'PRE_PULL', label: 'Pre-Pull', icon: '🏗️', description: 'Terminal to Yard', from: 'TERMINAL', to: 'YARD' },
  { value: 'LIVE_LOAD', label: 'Live Load/Unload', icon: '🚛', description: 'Wait at customer', from: 'TERMINAL', to: 'CUSTOMER' },
  { value: 'DROP_ONLY', label: 'Drop', icon: '📦', description: 'Drop & leave', from: 'TERMINAL', to: 'CUSTOMER' },
  { value: 'YARD_TO_CUSTOMER', label: 'Yard to Customer', icon: '🏭', description: 'Deliver from yard', from: 'YARD', to: 'CUSTOMER' },
  { value: 'CUSTOMER_TO_YARD', label: 'Customer to Yard', icon: '🔙', description: 'Return to yard', from: 'CUSTOMER', to: 'YARD' },
  { value: 'RETURN_EMPTY', label: 'Return Empty', icon: '📤', description: 'Return to terminal', from: 'CUSTOMER', to: 'TERMINAL' },
  { value: 'YARD_TO_TERMINAL', label: 'Yard to Terminal', icon: '🏁', description: 'Yard back to port', from: 'YARD', to: 'TERMINAL' },
  { value: 'CUSTOMS_EXAM', label: 'Customs Exam', icon: '🔍', description: 'To exam site', from: 'TERMINAL', to: 'CUSTOM' },
];

// LA/LB Terminals
const TERMINALS: LocationOption[] = [
  { id: 't1', name: 'APM Terminals', type: 'TERMINAL', address: '2500 Navy Way', city: 'San Pedro', state: 'CA' },
  { id: 't2', name: 'LBCT', type: 'TERMINAL', address: '1171 Pier F Ave', city: 'Long Beach', state: 'CA' },
  { id: 't3', name: 'TraPac', type: 'TERMINAL', address: '630 Terminal Way', city: 'San Pedro', state: 'CA' },
  { id: 't4', name: 'Fenix Marine', type: 'TERMINAL', address: '2201 Blinn Ave', city: 'Wilmington', state: 'CA' },
  { id: 't5', name: 'YTI', type: 'TERMINAL', address: '701 New Dock St', city: 'Terminal Island', state: 'CA' },
  { id: 't6', name: 'PCT', type: 'TERMINAL', address: '631 Terminal Way', city: 'Long Beach', state: 'CA' },
  { id: 't7', name: 'ITS', type: 'TERMINAL', address: '1265 Harbor Ave', city: 'Long Beach', state: 'CA' },
  { id: 't8', name: 'SSA Terminals', type: 'TERMINAL', address: '1 World Trade Center Dr', city: 'Long Beach', state: 'CA' },
  { id: 't9', name: 'Pier A', type: 'TERMINAL', address: 'Pier A St', city: 'Long Beach', state: 'CA' },
  { id: 't10', name: 'Everport', type: 'TERMINAL', address: '1281 Pier G Way', city: 'Long Beach', state: 'CA' },
];

// Common Yards
const YARDS: LocationOption[] = [
  { id: 'y1', name: 'DCLI Yard - Carson', type: 'YARD', address: '20601 S Main St', city: 'Carson', state: 'CA' },
  { id: 'y2', name: 'TRAC Yard - Long Beach', type: 'YARD', address: '2085 W Cowles St', city: 'Long Beach', state: 'CA' },
  { id: 'y3', name: 'Flexivan Yard', type: 'YARD', address: '1200 E 223rd St', city: 'Carson', state: 'CA' },
  { id: 'y4', name: 'Company Yard', type: 'YARD', address: '2500 E Del Amo Blvd', city: 'Compton', state: 'CA' },
];

// Location Search Component
function LocationSearch({
  label,
  value,
  onChange,
  locationType,
  deliveryLocations,
  placeholder = 'Search or enter location...'
}: {
  label: string;
  value: LocationOption | null;
  onChange: (loc: LocationOption | null) => void;
  locationType: 'from' | 'to';
  deliveryLocations: LocationOption[];
  placeholder?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'TERMINAL' | 'DELIVERY' | 'CUSTOM'>('TERMINAL');
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const allTerminals = [...TERMINALS, ...YARDS];
  const filteredTerminals = allTerminals.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.city?.toLowerCase().includes(search.toLowerCase())
  );

  const filteredDelivery = deliveryLocations.filter(d =>
    d.name.toLowerCase().includes(search.toLowerCase()) ||
    d.address?.toLowerCase().includes(search.toLowerCase()) ||
    d.city?.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelect = (loc: LocationOption) => {
    onChange(loc);
    setSearch('');
    setIsOpen(false);
  };

  const handleCustomEntry = () => {
    if (search.trim()) {
      onChange({
        id: `custom-${Date.now()}`,
        name: search,
        type: 'CUSTOM',
      });
      setSearch('');
      setIsOpen(false);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>

      {/* Selected Value Display */}
      {value ? (
        <div className="flex items-center gap-2 p-3 border rounded-lg bg-gray-50">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className={`text-xs px-2 py-0.5 rounded ${
                value.type === 'TERMINAL' ? 'bg-blue-100 text-blue-800' :
                value.type === 'YARD' ? 'bg-orange-100 text-orange-800' :
                value.type === 'CUSTOMER' ? 'bg-green-100 text-green-800' :
                'bg-gray-100 text-gray-800'
              }`}>
                {value.type}
              </span>
              <span className="font-medium">{value.name}</span>
            </div>
            {value.address && (
              <p className="text-xs text-gray-500 mt-1">
                {value.address}{value.city ? `, ${value.city}` : ''}{value.state ? `, ${value.state}` : ''}
              </p>
            )}
          </div>
          <button
            onClick={() => onChange(null)}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ) : (
        <div>
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onFocus={() => setIsOpen(true)}
            placeholder={placeholder}
            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
          />

          {/* Dropdown */}
          {isOpen && (
            <div className="absolute z-50 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-80 overflow-hidden">
              {/* Tabs */}
              <div className="flex border-b bg-gray-50">
                <button
                  onClick={() => setActiveTab('TERMINAL')}
                  className={`flex-1 px-3 py-2 text-sm font-medium ${
                    activeTab === 'TERMINAL' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-white' : 'text-gray-500'
                  }`}
                >
                  Terminals & Yards
                </button>
                <button
                  onClick={() => setActiveTab('DELIVERY')}
                  className={`flex-1 px-3 py-2 text-sm font-medium ${
                    activeTab === 'DELIVERY' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-white' : 'text-gray-500'
                  }`}
                >
                  Delivery Locations
                </button>
                <button
                  onClick={() => setActiveTab('CUSTOM')}
                  className={`flex-1 px-3 py-2 text-sm font-medium ${
                    activeTab === 'CUSTOM' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-white' : 'text-gray-500'
                  }`}
                >
                  Custom
                </button>
              </div>

              <div className="max-h-60 overflow-y-auto">
                {/* Terminals & Yards Tab */}
                {activeTab === 'TERMINAL' && (
                  <div className="p-2">
                    {filteredTerminals.length > 0 ? (
                      <>
                        {/* Terminals Section */}
                        <p className="text-xs text-gray-500 px-2 py-1 font-medium">TERMINALS</p>
                        {filteredTerminals.filter(t => t.type === 'TERMINAL').map(loc => (
                          <button
                            key={loc.id}
                            onClick={() => handleSelect(loc)}
                            className="w-full text-left px-3 py-2 hover:bg-indigo-50 rounded-lg"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-blue-600">🏭</span>
                              <span className="font-medium">{loc.name}</span>
                            </div>
                            <p className="text-xs text-gray-500 ml-6">
                              {loc.address}, {loc.city}, {loc.state}
                            </p>
                          </button>
                        ))}

                        {/* Yards Section */}
                        <p className="text-xs text-gray-500 px-2 py-1 font-medium mt-2">YARDS</p>
                        {filteredTerminals.filter(t => t.type === 'YARD').map(loc => (
                          <button
                            key={loc.id}
                            onClick={() => handleSelect(loc)}
                            className="w-full text-left px-3 py-2 hover:bg-orange-50 rounded-lg"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-orange-600">🅿️</span>
                              <span className="font-medium">{loc.name}</span>
                            </div>
                            <p className="text-xs text-gray-500 ml-6">
                              {loc.address}, {loc.city}, {loc.state}
                            </p>
                          </button>
                        ))}
                      </>
                    ) : (
                      <p className="text-sm text-gray-500 p-4 text-center">No terminals found</p>
                    )}
                  </div>
                )}

                {/* Delivery Locations Tab */}
                {activeTab === 'DELIVERY' && (
                  <div className="p-2">
                    {filteredDelivery.length > 0 ? (
                      filteredDelivery.map(loc => (
                        <button
                          key={loc.id}
                          onClick={() => handleSelect(loc)}
                          className="w-full text-left px-3 py-2 hover:bg-green-50 rounded-lg"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-green-600">📍</span>
                            <span className="font-medium">{loc.name}</span>
                          </div>
                          <p className="text-xs text-gray-500 ml-6">
                            {loc.address}{loc.city ? `, ${loc.city}` : ''}{loc.state ? `, ${loc.state}` : ''}
                          </p>
                        </button>
                      ))
                    ) : (
                      <div className="p-4 text-center">
                        <p className="text-sm text-gray-500">No delivery locations found</p>
                        <p className="text-xs text-gray-400 mt-1">Past delivery addresses will appear here</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Custom Entry Tab */}
                {activeTab === 'CUSTOM' && (
                  <div className="p-4">
                    <p className="text-sm text-gray-600 mb-3">Enter a custom location (e.g., customs exam site, transload facility)</p>
                    <div className="space-y-3">
                      <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Location name"
                        className="w-full px-3 py-2 border rounded-lg text-sm"
                        autoFocus
                      />
                      <button
                        onClick={handleCustomEntry}
                        disabled={!search.trim()}
                        className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                      >
                        Use "{search || '...'}" as location
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function AddTripModal({
  containerId,
  shipmentId,
  loadId,
  containerNumber,
  terminalName,
  deliveryAddress,
  onClose,
  onSuccess
}: AddTripModalProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [tractors, setTractors] = useState<Tractor[]>([]);
  const [deliveryLocations, setDeliveryLocations] = useState<LocationOption[]>([]);

  const [formData, setFormData] = useState({
    driverId: '',
    tractorId: '',
    chassisNumber: '',
    chassisPool: 'DCLI',
    tripType: 'LIVE_LOAD',
    scheduledDate: '',
    notes: '',
  });

  const [fromLocation, setFromLocation] = useState<LocationOption | null>(null);
  const [toLocation, setToLocation] = useState<LocationOption | null>(null);

  useEffect(() => {
    loadResources();
  }, []);

  // Pre-fill terminal if provided
  useEffect(() => {
    if (terminalName && !fromLocation) {
      const terminal = TERMINALS.find(t => t.name === terminalName);
      if (terminal) {
        setFromLocation(terminal);
      }
    }
  }, [terminalName]);

  const loadResources = async () => {
    setLoading(true);
    try {
      const [driversData, tractorsData] = await Promise.all([
        getDrivers(),
        getTractors(),
      ]);
      setDrivers(driversData.filter(d => d.status === 'AVAILABLE' || d.status === 'ACTIVE'));
      setTractors(tractorsData.filter(t => t.status === 'AVAILABLE' || t.status === 'ACTIVE'));

      // Load recent delivery locations from orders
      const { data: orders } = await supabase
        .from('orders')
        .select('delivery_address, delivery_city, delivery_state, delivery_zip')
        .not('delivery_address', 'is', null)
        .order('created_at', { ascending: false })
        .limit(20);

      if (orders) {
        const uniqueLocations = new Map<string, LocationOption>();
        orders.forEach((order, idx) => {
          if (order.delivery_address) {
            const key = `${order.delivery_address}-${order.delivery_city}`;
            if (!uniqueLocations.has(key)) {
              uniqueLocations.set(key, {
                id: `del-${idx}`,
                name: order.delivery_city ? `${order.delivery_city} Location` : order.delivery_address.slice(0, 30),
                type: 'CUSTOMER',
                address: order.delivery_address,
                city: order.delivery_city || '',
                state: order.delivery_state || '',
              });
            }
          }
        });
        setDeliveryLocations(Array.from(uniqueLocations.values()));
      }
    } catch (err) {
      console.error('Error loading resources:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleTripTypeChange = (tripType: string) => {
    const type = TRIP_TYPES.find(t => t.value === tripType);
    if (type) {
      // Auto-set from/to based on trip type
      if (type.from === 'TERMINAL' && terminalName) {
        const terminal = TERMINALS.find(t => t.name === terminalName);
        if (terminal) setFromLocation(terminal);
      } else {
        setFromLocation(null);
      }
      setToLocation(null);
    }
    setFormData({ ...formData, tripType });
  };

  const handleSubmit = async () => {
    if (!formData.driverId) {
      alert('Please select a driver');
      return;
    }
    if (!fromLocation) {
      alert('Please select a From location');
      return;
    }
    if (!toLocation) {
      alert('Please select a To location');
      return;
    }

    setSaving(true);
    try {
      const result = await createContainerTrip({
        containerId,
        shipmentId,
        loadId,
        driverId: formData.driverId,
        tractorId: formData.tractorId || undefined,
        chassisNumber: formData.chassisNumber || undefined,
        chassisPool: formData.chassisPool || undefined,
        tripType: formData.tripType,
        fromLocationType: fromLocation.type,
        fromLocationName: fromLocation.name,
        fromLocationAddress: fromLocation.address || undefined,
        toLocationType: toLocation.type,
        toLocationName: toLocation.name,
        toLocationAddress: toLocation.address || undefined,
        scheduledDate: formData.scheduledDate || undefined,
        notes: formData.notes || undefined,
      });

      if (result) {
        onSuccess();
      } else {
        alert('Failed to create trip');
      }
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
        <div className="bg-white rounded-lg p-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  const selectedTripType = TRIP_TYPES.find(t => t.value === formData.tripType);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black bg-opacity-50" onClick={onClose}></div>
      <div className="relative min-h-screen flex items-center justify-center p-4">
        <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-white">Add Trip Leg</h2>
                {containerNumber && (
                  <p className="text-indigo-100 text-sm">Container: {containerNumber}</p>
                )}
              </div>
              <button onClick={onClose} className="text-white hover:text-indigo-200 text-2xl">
                &times;
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto max-h-[65vh] space-y-6">
            {/* Trip Type Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Trip Type</label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {TRIP_TYPES.map(type => (
                  <button
                    key={type.value}
                    onClick={() => handleTripTypeChange(type.value)}
                    className={`p-3 rounded-lg border text-left transition ${
                      formData.tripType === type.value
                        ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{type.icon}</span>
                      <span className="font-medium text-sm">{type.label}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{type.description}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Route Summary */}
            {selectedTripType && (
              <div className="p-3 bg-gray-50 rounded-lg flex items-center gap-4 text-sm">
                <span className="text-2xl">{selectedTripType.icon}</span>
                <span className="font-medium">{selectedTripType.from}</span>
                <span className="text-gray-400">→</span>
                <span className="font-medium">{selectedTripType.to}</span>
              </div>
            )}

            {/* From/To Location Selection */}
            <div className="grid grid-cols-2 gap-4">
              <LocationSearch
                label="From Location"
                value={fromLocation}
                onChange={setFromLocation}
                locationType="from"
                deliveryLocations={deliveryLocations}
                placeholder="Search terminals, yards..."
              />
              <LocationSearch
                label="To Location"
                value={toLocation}
                onChange={setToLocation}
                locationType="to"
                deliveryLocations={deliveryLocations}
                placeholder="Search locations..."
              />
            </div>

            {/* Driver & Tractor */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Driver *</label>
                <select
                  value={formData.driverId}
                  onChange={e => setFormData({ ...formData, driverId: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                  required
                >
                  <option value="">Select Driver</option>
                  {drivers.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.first_name} {d.last_name}
                      {d.hazmat_endorsement ? ' (HAZMAT)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tractor</label>
                <select
                  value={formData.tractorId}
                  onChange={e => setFormData({ ...formData, tractorId: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="">Select Tractor</option>
                  {tractors.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.unit_number} - {t.make} {t.model}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Chassis */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Chassis #</label>
                <input
                  type="text"
                  value={formData.chassisNumber}
                  onChange={e => setFormData({ ...formData, chassisNumber: e.target.value.toUpperCase() })}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="DCLI-123456"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Chassis Pool</label>
                <select
                  value={formData.chassisPool}
                  onChange={e => setFormData({ ...formData, chassisPool: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="DCLI">DCLI</option>
                  <option value="TRAC">TRAC</option>
                  <option value="FLEXI">Flexivan</option>
                  <option value="DIRECT">SSL Direct</option>
                </select>
              </div>
            </div>

            {/* Scheduled Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Scheduled Date/Time</label>
              <input
                type="datetime-local"
                value={formData.scheduledDate}
                onChange={e => setFormData({ ...formData, scheduledDate: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea
                value={formData.notes}
                onChange={e => setFormData({ ...formData, notes: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 border rounded-lg"
                placeholder="Special instructions, appointment numbers, etc."
              />
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-gray-50 border-t flex justify-between">
            <button
              onClick={onClose}
              className="px-6 py-2 border rounded-lg hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving || !fromLocation || !toLocation || !formData.driverId}
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? 'Creating...' : 'Create Trip'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AddTripModal;
