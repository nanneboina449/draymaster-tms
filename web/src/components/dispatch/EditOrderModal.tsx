'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface EditOrderModalProps {
  order: {
    id: string;
    order_number: string;
    status: string;
    move_type: string;
    container_number: string;
    container_size?: string;
    is_hazmat?: boolean;
    is_overweight?: boolean;
    customs_status?: string;
    shipment_type?: string;
    terminal_name?: string;
    steamship_line?: string;
    last_free_day?: string;
    customer_name?: string;
    pickup_address?: string;
    pickup_city?: string;
    pickup_appointment?: string;
    delivery_address?: string;
    delivery_city?: string;
    delivery_state?: string;
    delivery_zip?: string;
    delivery_appointment?: string;
    assigned_driver_id?: string;
    assigned_driver_name?: string;
    chassis_number?: string;
  };
  onClose: () => void;
  onSave: () => void;
}

const MOVE_TYPES = [
  { value: 'IMPORT_DELIVERY', label: 'Import Delivery', icon: '📥' },
  { value: 'EXPORT_PICKUP', label: 'Export Pickup', icon: '📤' },
  { value: 'EMPTY_RETURN', label: 'Empty Return', icon: '🔄' },
  { value: 'EMPTY_PICKUP', label: 'Empty Pickup', icon: '📦' },
  { value: 'PRE_PULL', label: 'Pre-Pull', icon: '🏗️' },
  { value: 'YARD_MOVE', label: 'Yard Move', icon: '🅿️' },
  { value: 'CUSTOMS_EXAM', label: 'Customs Exam', icon: '🔍' },
  { value: 'TRANSLOAD', label: 'Transload', icon: '🔀' },
];

const TERMINALS = [
  'APM Terminals', 'LBCT', 'TraPac', 'Fenix Marine', 'YTI', 'PCT', 'ITS', 'SSA Terminals', 'Everport', 'Pier A'
];

export default function EditOrderModal({ order, onClose, onSave }: EditOrderModalProps) {
  const [activeTab, setActiveTab] = useState<'details' | 'location' | 'assignment'>('details');
  const [loading, setSaving] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    move_type: order.move_type || 'IMPORT_DELIVERY',
    status: order.status || 'PENDING',

    // Pickup
    pickup_terminal: order.terminal_name || '',
    pickup_address: order.pickup_address || '',
    pickup_city: order.pickup_city || '',
    pickup_appointment_date: order.pickup_appointment ? order.pickup_appointment.split('T')[0] : '',
    pickup_appointment_time: order.pickup_appointment ? order.pickup_appointment.split('T')[1]?.slice(0, 5) : '',

    // Delivery
    delivery_address: order.delivery_address || '',
    delivery_city: order.delivery_city || '',
    delivery_state: order.delivery_state || '',
    delivery_zip: order.delivery_zip || '',
    delivery_appointment_date: order.delivery_appointment ? order.delivery_appointment.split('T')[0] : '',
    delivery_appointment_time: order.delivery_appointment ? order.delivery_appointment.split('T')[1]?.slice(0, 5) : '',

    // Notes
    special_instructions: '',
  });

  const handleSave = async () => {
    setSaving(true);
    try {
      // Build pickup/delivery appointment timestamps
      const pickupAppointment = formData.pickup_appointment_date
        ? `${formData.pickup_appointment_date}T${formData.pickup_appointment_time || '08:00'}:00`
        : null;

      const deliveryAppointment = formData.delivery_appointment_date
        ? `${formData.delivery_appointment_date}T${formData.delivery_appointment_time || '08:00'}:00`
        : null;

      const { error } = await supabase
        .from('orders')
        .update({
          move_type_v2: formData.move_type,
          status: formData.status,
          pickup_address: formData.pickup_address || formData.pickup_terminal,
          pickup_city: formData.pickup_city,
          pickup_appointment: pickupAppointment,
          delivery_address: formData.delivery_address,
          delivery_city: formData.delivery_city,
          delivery_state: formData.delivery_state,
          delivery_zip: formData.delivery_zip,
          delivery_appointment: deliveryAppointment,
          special_instructions: formData.special_instructions || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', order.id);

      if (error) throw error;
      onSave();
    } catch (err: any) {
      alert('Error saving: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black bg-opacity-50" onClick={onClose}></div>
      <div className="relative min-h-screen flex items-center justify-center p-4">
        <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-bold text-white">Edit Order</h2>
                  <span className="px-2 py-0.5 bg-white/20 rounded text-white text-sm">
                    {order.order_number}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-indigo-100 text-sm font-mono">{order.container_number}</span>
                  {order.is_hazmat && <span title="Hazmat">☣️</span>}
                  {order.is_overweight && <span title="Overweight">⚖️</span>}
                </div>
              </div>
              <button onClick={onClose} className="text-white hover:text-indigo-200 text-2xl">
                &times;
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="border-b px-6">
            <div className="flex gap-1">
              {[
                { id: 'details', label: 'Movement Details', icon: '📋' },
                { id: 'location', label: 'Locations', icon: '📍' },
                { id: 'assignment', label: 'Assignment', icon: '🚛' },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`py-3 px-4 text-sm font-medium border-b-2 transition flex items-center gap-2 ${
                    activeTab === tab.id
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <span>{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto max-h-[55vh]">
            {/* Movement Details Tab */}
            {activeTab === 'details' && (
              <div className="space-y-6">
                {/* Current Info */}
                <div className="grid grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
                  <div>
                    <p className="text-xs text-gray-500">Container</p>
                    <p className="font-mono font-bold">{order.container_number}</p>
                    <p className="text-xs text-gray-500">{order.container_size}' {order.is_hazmat ? '• Hazmat' : ''}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Steamship Line</p>
                    <p className="font-medium">{order.steamship_line || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Last Free Day</p>
                    <p className="font-medium text-red-600">
                      {order.last_free_day ? new Date(order.last_free_day).toLocaleDateString() : '-'}
                    </p>
                  </div>
                </div>

                {/* Move Type Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Movement Type</label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {MOVE_TYPES.map(type => (
                      <button
                        key={type.value}
                        onClick={() => setFormData({ ...formData, move_type: type.value })}
                        className={`p-3 rounded-lg border text-left transition ${
                          formData.move_type === type.value
                            ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <span className="text-lg">{type.icon}</span>
                        <p className="text-sm font-medium mt-1">{type.label}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Status */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select
                    value={formData.status}
                    onChange={e => setFormData({ ...formData, status: e.target.value })}
                    className="w-full px-4 py-2 border rounded-lg"
                  >
                    <option value="PENDING">Pending - Ready to Dispatch</option>
                    <option value="READY">Ready - Cleared for Pickup</option>
                    <option value="DISPATCHED">Dispatched - Driver Assigned</option>
                    <option value="IN_PROGRESS">In Progress - En Route</option>
                    <option value="DELIVERED">Delivered - At Destination</option>
                    <option value="COMPLETED">Completed</option>
                    <option value="HOLD">On Hold</option>
                    <option value="CANCELLED">Cancelled</option>
                  </select>
                </div>

                {/* Special Instructions */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Special Instructions</label>
                  <textarea
                    value={formData.special_instructions}
                    onChange={e => setFormData({ ...formData, special_instructions: e.target.value })}
                    rows={3}
                    placeholder="Appointment numbers, delivery notes, gate codes, etc."
                    className="w-full px-4 py-2 border rounded-lg"
                  />
                </div>
              </div>
            )}

            {/* Locations Tab */}
            {activeTab === 'location' && (
              <div className="space-y-6">
                {/* Pickup Location */}
                <div className="p-4 border rounded-xl">
                  <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                    <span className="w-6 h-6 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-sm">A</span>
                    Pickup Location
                  </h4>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Terminal</label>
                      <select
                        value={formData.pickup_terminal}
                        onChange={e => setFormData({ ...formData, pickup_terminal: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg"
                      >
                        <option value="">Select Terminal</option>
                        {TERMINALS.map(t => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>

                    <div className="text-center text-gray-400 text-sm">— or custom address —</div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                        <input
                          type="text"
                          value={formData.pickup_address}
                          onChange={e => setFormData({ ...formData, pickup_address: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                        <input
                          type="text"
                          value={formData.pickup_city}
                          onChange={e => setFormData({ ...formData, pickup_city: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Appointment Date</label>
                        <input
                          type="date"
                          value={formData.pickup_appointment_date}
                          onChange={e => setFormData({ ...formData, pickup_appointment_date: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Time</label>
                        <input
                          type="time"
                          value={formData.pickup_appointment_time}
                          onChange={e => setFormData({ ...formData, pickup_appointment_time: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Delivery Location */}
                <div className="p-4 border rounded-xl">
                  <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                    <span className="w-6 h-6 bg-red-100 text-red-600 rounded-full flex items-center justify-center text-sm">B</span>
                    Delivery Location
                  </h4>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                      <input
                        type="text"
                        value={formData.delivery_address}
                        onChange={e => setFormData({ ...formData, delivery_address: e.target.value })}
                        placeholder="Street address"
                        className="w-full px-3 py-2 border rounded-lg"
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                        <input
                          type="text"
                          value={formData.delivery_city}
                          onChange={e => setFormData({ ...formData, delivery_city: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                        <input
                          type="text"
                          value={formData.delivery_state}
                          onChange={e => setFormData({ ...formData, delivery_state: e.target.value })}
                          maxLength={2}
                          className="w-full px-3 py-2 border rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">ZIP</label>
                        <input
                          type="text"
                          value={formData.delivery_zip}
                          onChange={e => setFormData({ ...formData, delivery_zip: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Appointment Date</label>
                        <input
                          type="date"
                          value={formData.delivery_appointment_date}
                          onChange={e => setFormData({ ...formData, delivery_appointment_date: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Time</label>
                        <input
                          type="time"
                          value={formData.delivery_appointment_time}
                          onChange={e => setFormData({ ...formData, delivery_appointment_time: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Assignment Tab */}
            {activeTab === 'assignment' && (
              <div className="space-y-6">
                {/* Current Assignment */}
                <div className="p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-medium text-gray-900 mb-3">Current Assignment</h4>

                  {order.assigned_driver_name ? (
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center">
                        <span className="text-lg font-medium text-indigo-700">
                          {order.assigned_driver_name.split(' ').map(n => n[0]).join('')}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium">{order.assigned_driver_name}</p>
                        <p className="text-sm text-gray-500">
                          {order.chassis_number && `Chassis: ${order.chassis_number}`}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-gray-500">No driver assigned yet</p>
                  )}
                </div>

                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-sm text-yellow-800">
                    <strong>Note:</strong> To change driver assignment, use the "Assign Driver" button on the dispatch board.
                    This allows you to select available drivers and assign equipment.
                  </p>
                </div>

                {/* Order Timeline */}
                <div>
                  <h4 className="font-medium text-gray-900 mb-3">Order Timeline</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-3">
                      <span className="w-2 h-2 bg-gray-400 rounded-full"></span>
                      <span className="text-gray-600">Created</span>
                      <span className="text-gray-400 ml-auto">-</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`w-2 h-2 rounded-full ${order.status !== 'PENDING' ? 'bg-blue-500' : 'bg-gray-300'}`}></span>
                      <span className="text-gray-600">Dispatched</span>
                      <span className="text-gray-400 ml-auto">-</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`w-2 h-2 rounded-full ${['IN_PROGRESS', 'COMPLETED'].includes(order.status) ? 'bg-yellow-500' : 'bg-gray-300'}`}></span>
                      <span className="text-gray-600">Picked Up</span>
                      <span className="text-gray-400 ml-auto">-</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`w-2 h-2 rounded-full ${order.status === 'COMPLETED' ? 'bg-green-500' : 'bg-gray-300'}`}></span>
                      <span className="text-gray-600">Completed</span>
                      <span className="text-gray-400 ml-auto">-</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
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
              onClick={handleSave}
              disabled={loading}
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
