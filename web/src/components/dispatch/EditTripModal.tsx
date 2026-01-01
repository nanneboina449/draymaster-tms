'use client';

import { useState, useEffect } from 'react';
import { Trip, Driver, Tractor, Chassis, updateTrip, getDrivers, getTractors, getAllChassis } from '../../lib/supabase';

interface EditTripModalProps {
  trip: Trip;
  onClose: () => void;
  onSave: () => void;
}

export function EditTripModal({ trip, onClose, onSave }: EditTripModalProps) {
  const [loading, setLoading] = useState(false);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [tractors, setTractors] = useState<Tractor[]>([]);
  const [chassisList, setChassisList] = useState<Chassis[]>([]);

  const [formData, setFormData] = useState({
    driver_id: trip.driver_id || '',
    tractor_id: trip.tractor_id || '',
    chassis_id: trip.chassis_id || '',
    chassis_number: trip.chassis_number || '',
    container_number: trip.container_number || '',
    status: trip.status || 'DISPATCHED',
    pickup_location: trip.pickup_location || '',
    delivery_location: trip.delivery_location || '',
    planned_start: trip.planned_start ? trip.planned_start.slice(0, 16) : '',
    notes: trip.notes || '',
    priority: (trip as any).priority || 'NORMAL',
  });

  useEffect(() => {
    fetchResources();
  }, []);

  const fetchResources = async () => {
    try {
      const [driversData, tractorsData, chassisData] = await Promise.all([
        getDrivers(),
        getTractors(),
        getAllChassis(),
      ]);
      setDrivers(driversData || []);
      setTractors(tractorsData || []);
      setChassisList(chassisData || []);
    } catch (err) {
      console.error('Error fetching resources:', err);
    }
  };

  const handleChassisChange = (chassisId: string) => {
    const selectedChassis = chassisList.find(c => c.id === chassisId);
    setFormData({
      ...formData,
      chassis_id: chassisId,
      chassis_number: selectedChassis?.chassis_number || '',
    });
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      await updateTrip(trip.id, {
        driver_id: formData.driver_id || null,
        tractor_id: formData.tractor_id || null,
        chassis_id: formData.chassis_id || null,
        chassis_number: formData.chassis_number || null,
        container_number: formData.container_number,
        status: formData.status,
        pickup_location: formData.pickup_location,
        delivery_location: formData.delivery_location,
        planned_start: formData.planned_start || null,
        notes: formData.notes,
      } as any);
      onSave();
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setLoading(false);
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
      'CANCELLED': 'bg-red-100 text-red-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const availableDrivers = drivers.filter(d => d.status === 'AVAILABLE' || d.id === trip.driver_id);
  const availableTractors = tractors.filter(t => t.status === 'AVAILABLE' || t.id === trip.tractor_id);
  const availableChassis = chassisList.filter(c => c.status === 'AVAILABLE' || c.id === trip.chassis_id);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black bg-opacity-50" onClick={onClose}></div>
      <div className="relative min-h-screen flex items-center justify-center p-4">
        <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-white">Edit Trip</h2>
                <p className="text-blue-100">{trip.trip_number}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-3 py-1 rounded-full text-sm ${getStatusColor(formData.status)}`}>
                  {formData.status}
                </span>
                <button onClick={onClose} className="text-white hover:text-blue-200 text-2xl">&times;</button>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto max-h-[60vh] space-y-4">
            {/* Current Trip Info */}
            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><strong>Type:</strong> {trip.type}</div>
                <div><strong>Container:</strong> {trip.container_number || '-'}</div>
              </div>
            </div>

            {/* Status */}
            <div>
              <label className="block text-sm font-medium mb-1">Status</label>
              <select
                value={formData.status}
                onChange={e => setFormData({ ...formData, status: e.target.value })}
                className="w-full px-4 py-2 border rounded-lg"
              >
                <option value="PLANNED">Planned</option>
                <option value="DISPATCHED">Dispatched</option>
                <option value="EN_ROUTE">En Route</option>
                <option value="AT_PICKUP">At Pickup</option>
                <option value="LOADED">Loaded</option>
                <option value="AT_DELIVERY">At Delivery</option>
                <option value="DELIVERED">Delivered</option>
                <option value="COMPLETED">Completed</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>

            {/* Driver */}
            <div>
              <label className="block text-sm font-medium mb-1">Driver</label>
              <select
                value={formData.driver_id}
                onChange={e => setFormData({ ...formData, driver_id: e.target.value })}
                className="w-full px-4 py-2 border rounded-lg"
              >
                <option value="">Select Driver</option>
                {availableDrivers.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.first_name} {d.last_name} {d.hazmat_endorsement ? '☣️' : ''} 
                    {d.id === trip.driver_id ? ' (Current)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Tractor */}
            <div>
              <label className="block text-sm font-medium mb-1">Tractor</label>
              <select
                value={formData.tractor_id}
                onChange={e => setFormData({ ...formData, tractor_id: e.target.value })}
                className="w-full px-4 py-2 border rounded-lg"
              >
                <option value="">Select Tractor</option>
                {availableTractors.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.unit_number} - {t.make} {t.model}
                    {t.id === trip.tractor_id ? ' (Current)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Chassis */}
            <div>
              <label className="block text-sm font-medium mb-1">Chassis</label>
              <select
                value={formData.chassis_id}
                onChange={e => handleChassisChange(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg"
              >
                <option value="">Select Chassis</option>
                {availableChassis.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.chassis_number} - {c.pool} {c.size}'
                    {c.id === trip.chassis_id ? ' (Current)' : ''}
                  </option>
                ))}
              </select>
              {formData.chassis_number && (
                <p className="text-sm text-gray-500 mt-1">Chassis #: {formData.chassis_number}</p>
              )}
            </div>

            {/* Container Number */}
            <div>
              <label className="block text-sm font-medium mb-1">Container Number</label>
              <input
                value={formData.container_number}
                onChange={e => setFormData({ ...formData, container_number: e.target.value.toUpperCase() })}
                className="w-full px-4 py-2 border rounded-lg font-mono"
                placeholder="MSCU1234567"
              />
            </div>

            {/* Locations */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Pickup Location</label>
                <input
                  value={formData.pickup_location}
                  onChange={e => setFormData({ ...formData, pickup_location: e.target.value })}
                  className="w-full px-4 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Delivery Location</label>
                <input
                  value={formData.delivery_location}
                  onChange={e => setFormData({ ...formData, delivery_location: e.target.value })}
                  className="w-full px-4 py-2 border rounded-lg"
                />
              </div>
            </div>

            {/* Planned Start */}
            <div>
              <label className="block text-sm font-medium mb-1">Planned Start</label>
              <input
                type="datetime-local"
                value={formData.planned_start}
                onChange={e => setFormData({ ...formData, planned_start: e.target.value })}
                className="w-full px-4 py-2 border rounded-lg"
              />
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium mb-1">Notes</label>
              <textarea
                value={formData.notes}
                onChange={e => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
                className="w-full px-4 py-2 border rounded-lg"
                placeholder="Add notes about changes, delays, issues..."
              />
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-gray-50 border-t flex justify-between">
            <button onClick={onClose} className="px-6 py-2 border rounded-lg hover:bg-gray-100">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={loading}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default EditTripModal;