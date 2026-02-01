'use client';

import { useState, useEffect } from 'react';
import {
  Driver, Tractor, Location,
  getDrivers, getTractors, getAllDispatchLocations, createContainerTrip
} from '../../lib/supabase';

interface AddTripModalProps {
  containerId?: string;
  shipmentId?: string;
  loadId?: string;
  containerNumber?: string;
  onClose: () => void;
  onSuccess: () => void;
}

const TRIP_TYPES = [
  { value: 'PRE_PULL', label: 'Pre-Pull', description: 'Terminal to Yard' },
  { value: 'LIVE_LOAD', label: 'Live Load', description: 'Terminal to Customer (wait)' },
  { value: 'DROP_ONLY', label: 'Drop', description: 'Drop container at destination' },
  { value: 'YARD_TO_CUSTOMER', label: 'Yard to Customer', description: 'From yard to delivery' },
  { value: 'CUSTOMER_TO_YARD', label: 'Customer to Yard', description: 'Pickup from customer to yard' },
  { value: 'RETURN_EMPTY', label: 'Return Empty', description: 'Return empty container' },
  { value: 'YARD_TO_TERMINAL', label: 'Yard to Terminal', description: 'From yard back to terminal' },
];

export function AddTripModal({
  containerId,
  shipmentId,
  loadId,
  containerNumber,
  onClose,
  onSuccess
}: AddTripModalProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [tractors, setTractors] = useState<Tractor[]>([]);
  const [locations, setLocations] = useState<{
    terminals: Location[];
    yards: Location[];
    customers: Location[];
  }>({ terminals: [], yards: [], customers: [] });

  const [formData, setFormData] = useState({
    driverId: '',
    tractorId: '',
    chassisNumber: '',
    chassisPool: 'DCLI',
    tripType: 'LIVE_LOAD',
    fromLocationType: 'TERMINAL',
    fromLocationName: '',
    fromLocationAddress: '',
    toLocationType: 'CUSTOMER',
    toLocationName: '',
    toLocationAddress: '',
    scheduledDate: '',
    notes: '',
  });

  useEffect(() => {
    loadResources();
  }, []);

  const loadResources = async () => {
    setLoading(true);
    try {
      const [driversData, tractorsData, locationsData] = await Promise.all([
        getDrivers(),
        getTractors(),
        getAllDispatchLocations(),
      ]);
      setDrivers(driversData.filter(d => d.status === 'AVAILABLE' || d.status === 'ACTIVE'));
      setTractors(tractorsData.filter(t => t.status === 'AVAILABLE' || t.status === 'ACTIVE'));
      setLocations(locationsData);
    } catch (err) {
      console.error('Error loading resources:', err);
    } finally {
      setLoading(false);
    }
  };

  const getLocationsByType = (type: string): Location[] => {
    switch (type) {
      case 'TERMINAL': return locations.terminals;
      case 'YARD': return locations.yards;
      case 'CUSTOMER': return locations.customers;
      default: return [];
    }
  };

  const handleTripTypeChange = (tripType: string) => {
    // Auto-set from/to location types based on trip type
    let fromType = 'TERMINAL';
    let toType = 'CUSTOMER';

    switch (tripType) {
      case 'PRE_PULL':
        fromType = 'TERMINAL';
        toType = 'YARD';
        break;
      case 'LIVE_LOAD':
      case 'DROP_ONLY':
        fromType = 'TERMINAL';
        toType = 'CUSTOMER';
        break;
      case 'YARD_TO_CUSTOMER':
        fromType = 'YARD';
        toType = 'CUSTOMER';
        break;
      case 'CUSTOMER_TO_YARD':
        fromType = 'CUSTOMER';
        toType = 'YARD';
        break;
      case 'RETURN_EMPTY':
        fromType = 'CUSTOMER';
        toType = 'TERMINAL';
        break;
      case 'YARD_TO_TERMINAL':
        fromType = 'YARD';
        toType = 'TERMINAL';
        break;
    }

    setFormData({
      ...formData,
      tripType,
      fromLocationType: fromType,
      toLocationType: toType,
      fromLocationName: '',
      toLocationName: '',
    });
  };

  const handleSubmit = async () => {
    if (!formData.driverId) {
      alert('Please select a driver');
      return;
    }
    if (!formData.fromLocationName) {
      alert('Please select a From location');
      return;
    }
    if (!formData.toLocationName) {
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
        fromLocationType: formData.fromLocationType,
        fromLocationName: formData.fromLocationName,
        fromLocationAddress: formData.fromLocationAddress || undefined,
        toLocationType: formData.toLocationType,
        toLocationName: formData.toLocationName,
        toLocationAddress: formData.toLocationAddress || undefined,
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
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black bg-opacity-50" onClick={onClose}></div>
      <div className="relative min-h-screen flex items-center justify-center p-4">
        <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
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
          <div className="p-6 overflow-y-auto max-h-[60vh] space-y-6">
            {/* Trip Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Trip Type</label>
              <div className="grid grid-cols-2 gap-2">
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
                    <p className="font-medium text-sm">{type.label}</p>
                    <p className="text-xs text-gray-500">{type.description}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* From/To Locations */}
            <div className="grid grid-cols-2 gap-4">
              {/* From Location */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">From</label>
                <select
                  value={formData.fromLocationType}
                  onChange={e => setFormData({ ...formData, fromLocationType: e.target.value, fromLocationName: '' })}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                >
                  <option value="TERMINAL">Terminal</option>
                  <option value="YARD">Yard</option>
                  <option value="CUSTOMER">Customer</option>
                </select>
                <select
                  value={formData.fromLocationName}
                  onChange={e => setFormData({ ...formData, fromLocationName: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                >
                  <option value="">Select location...</option>
                  {getLocationsByType(formData.fromLocationType).map(loc => (
                    <option key={loc.id} value={loc.name}>{loc.name}</option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Or enter custom location"
                  value={formData.fromLocationName}
                  onChange={e => setFormData({ ...formData, fromLocationName: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>

              {/* To Location */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">To</label>
                <select
                  value={formData.toLocationType}
                  onChange={e => setFormData({ ...formData, toLocationType: e.target.value, toLocationName: '' })}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                >
                  <option value="TERMINAL">Terminal</option>
                  <option value="YARD">Yard</option>
                  <option value="CUSTOMER">Customer</option>
                </select>
                <select
                  value={formData.toLocationName}
                  onChange={e => setFormData({ ...formData, toLocationName: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                >
                  <option value="">Select location...</option>
                  {getLocationsByType(formData.toLocationType).map(loc => (
                    <option key={loc.id} value={loc.name}>{loc.name}</option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Or enter custom location"
                  value={formData.toLocationName}
                  onChange={e => setFormData({ ...formData, toLocationName: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>
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
                placeholder="Special instructions, delivery notes, etc."
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
              disabled={saving}
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
