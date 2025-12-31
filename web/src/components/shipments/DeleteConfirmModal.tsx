'use client';

import { Shipment } from '../../lib/supabase';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  shipment: Shipment;
}

export function DeleteConfirmModal({ isOpen, onClose, onConfirm, shipment }: Props) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black bg-opacity-50" onClick={onClose}></div>
      <div className="relative min-h-screen flex items-center justify-center p-4">
        <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md">
          <div className="bg-gradient-to-r from-red-600 to-red-700 px-6 py-4 rounded-t-2xl">
            <h2 className="text-xl font-bold text-white">Delete Shipment</h2>
          </div>
          <div className="p-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center text-2xl">⚠️</div>
              <div>
                <p className="font-semibold">Are you sure?</p>
                <p className="text-sm text-gray-500">This cannot be undone.</p>
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="font-mono font-semibold">{shipment.reference_number}</p>
              <p className="text-sm text-gray-500">{shipment.customer_name}</p>
              <p className="text-sm text-gray-500">{shipment.containers?.length || 0} container(s) will be deleted</p>
            </div>
          </div>
          <div className="px-6 py-4 bg-gray-50 border-t rounded-b-2xl flex justify-between">
            <button onClick={onClose} className="px-6 py-2 border rounded-lg hover:bg-gray-100">Cancel</button>
            <button onClick={onConfirm} className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">Delete</button>
          </div>
        </div>
      </div>
    </div>
  );
}