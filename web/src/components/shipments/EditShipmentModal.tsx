'use client';

import { useState, useEffect } from 'react';
import { Shipment } from '../../lib/supabase';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: Partial<Shipment>) => void;
  shipment: Shipment;
}

export function EditShipmentModal({ isOpen, onClose, onSubmit, shipment }: Props) {
  const [formData, setFormData] = useState({
    type: shipment.type,
    status: shipment.status,
    customer_name: shipment.customer_name,
    steamship_line: shipment.steamship_line || '',
    booking_number: shipment.booking_number || '',
    bill_of_lading: shipment.bill_of_lading || '',
    vessel: shipment.vessel || '',
    voyage: shipment.voyage || '',
    terminal_name: shipment.terminal_name || '',
    last_free_day: shipment.last_free_day || '',
    trip_type: shipment.trip_type || '',
    special_instructions: shipment.special_instructions || '',
  });

  useEffect(() => {
    setFormData({
      type: shipment.type,
      status: shipment.status,
      customer_name: shipment.customer_name,
      steamship_line: shipment.steamship_line || '',
      booking_number: shipment.booking_number || '',
      bill_of_lading: shipment.bill_of_lading || '',
      vessel: shipment.vessel || '',
      voyage: shipment.voyage || '',
      terminal_name: shipment.terminal_name || '',
      last_free_day: shipment.last_free_day || '',
      trip_type: shipment.trip_type || '',
      special_instructions: shipment.special_instructions || '',
    });
  }, [shipment]);

  if (!isOpen) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black bg-opacity-50" onClick={onClose}></div>
      <div className="relative min-h-screen flex items-center justify-center p-4">
        <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl">
          <div className="bg-gradient-to-r from-green-600 to-green-700 px-6 py-4 rounded-t-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-white">Edit Shipment</h2>
                <p className="text-green-100">{shipment.reference_number}</p>
              </div>
              <button onClick={onClose} className="text-white text-2xl">×</button>
            </div>
          </div>
          <div className="p-6 max-h-[60vh] overflow-y-auto space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Type</label>
                <select name="type" value={formData.type} onChange={handleChange} className="w-full px-4 py-2 border rounded-lg">
                  <option value="IMPORT">Import</option>
                  <option value="EXPORT">Export</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Status</label>
                <select name="status" value={formData.status} onChange={handleChange} className="w-full px-4 py-2 border rounded-lg">
                  <option value="PENDING">Pending</option>
                  <option value="CONFIRMED">Confirmed</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="DELIVERED">Delivered</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Customer</label>
              <input name="customer_name" value={formData.customer_name} onChange={handleChange} className="w-full px-4 py-2 border rounded-lg" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">SSL</label>
                <select name="steamship_line" value={formData.steamship_line} onChange={handleChange} className="w-full px-4 py-2 border rounded-lg">
                  <option value="">Select</option>
                  <option value="Maersk">Maersk</option>
                  <option value="MSC">MSC</option>
                  <option value="COSCO">COSCO</option>
                  <option value="CMA CGM">CMA CGM</option>
                  <option value="Hapag-Lloyd">Hapag-Lloyd</option>
                  <option value="ONE">ONE</option>
                  <option value="Evergreen">Evergreen</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Terminal</label>
                <select name="terminal_name" value={formData.terminal_name} onChange={handleChange} className="w-full px-4 py-2 border rounded-lg">
                  <option value="">Select</option>
                  <option value="APM Terminals">APM Terminals</option>
                  <option value="LBCT">LBCT</option>
                  <option value="TraPac">TraPac</option>
                  <option value="Fenix Marine">Fenix Marine</option>
                  <option value="YTI">YTI</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Vessel</label>
                <input name="vessel" value={formData.vessel} onChange={handleChange} className="w-full px-4 py-2 border rounded-lg" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Voyage</label>
                <input name="voyage" value={formData.voyage} onChange={handleChange} className="w-full px-4 py-2 border rounded-lg" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Last Free Day</label>
                <input type="date" name="last_free_day" value={formData.last_free_day} onChange={handleChange} className="w-full px-4 py-2 border rounded-lg" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Trip Type</label>
                <select name="trip_type" value={formData.trip_type} onChange={handleChange} className="w-full px-4 py-2 border rounded-lg">
                  <option value="LIVE_LOAD">Live Load</option>
                  <option value="LIVE_UNLOAD">Live Unload</option>
                  <option value="DROP_HOOK_SAME">Drop & Hook (Same)</option>
                  <option value="DROP_HOOK_DIFF">Drop & Hook (Diff)</option>
                  <option value="STREET_TURN">Street Turn</option>
                  <option value="DUAL_TRANSACTION">Dual Transaction</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Special Instructions</label>
              <textarea name="special_instructions" value={formData.special_instructions} onChange={handleChange} rows={3} className="w-full px-4 py-2 border rounded-lg" />
            </div>
          </div>
          <div className="px-6 py-4 bg-gray-50 border-t rounded-b-2xl flex justify-between">
            <button onClick={onClose} className="px-6 py-2 border rounded-lg hover:bg-gray-100">Cancel</button>
            <button onClick={() => onSubmit(formData)} className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">Save Changes</button>
          </div>
        </div>
      </div>
    </div>
  );
}