'use client';

import { Shipment } from '../../lib/supabase';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  shipment: Shipment;
}

export function ViewShipmentModal({ isOpen, onClose, shipment }: Props) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black bg-opacity-50" onClick={onClose}></div>
      <div className="relative min-h-screen flex items-center justify-center p-4">
        <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-white">Shipment Details</h2>
                <p className="text-blue-100">{shipment.reference_number}</p>
              </div>
              <button onClick={onClose} className="text-white text-2xl">×</button>
            </div>
          </div>
          <div className="p-6 overflow-y-auto max-h-[70vh]">
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-4">
                <h3 className="font-semibold border-b pb-2">Shipment Info</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-gray-500">Type:</span><span className="font-medium">{shipment.type}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Status:</span><span className="font-medium">{shipment.status}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Customer:</span><span className="font-medium">{shipment.customer_name}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">SSL:</span><span className="font-medium">{shipment.steamship_line || '-'}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Vessel:</span><span className="font-medium">{shipment.vessel || '-'}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Terminal:</span><span className="font-medium">{shipment.terminal_name || '-'}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">LFD:</span><span className="font-medium text-red-600">{shipment.last_free_day || '-'}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Trip Type:</span><span className="font-medium">{shipment.trip_type || '-'}</span></div>
                </div>
              </div>
              <div className="space-y-4">
                <h3 className="font-semibold border-b pb-2">Containers ({shipment.containers?.length || 0})</h3>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {shipment.containers?.map((c, i) => (
                    <div key={i} className="p-3 bg-gray-50 rounded-lg">
                      <div className="flex justify-between">
                        <span className="font-mono font-semibold text-blue-600">{c.container_number}</span>
                        <div className="flex gap-1">
                          {c.is_hazmat && <span>☣️</span>}
                          {c.is_reefer && <span>❄️</span>}
                          {c.is_overweight && <span>⚖️</span>}
                        </div>
                      </div>
                      <div className="text-sm text-gray-500">{c.size}' {c.type} • {c.weight || 0} lbs</div>
                      <div className={`text-xs ${c.customs_status === 'HOLD' ? 'text-red-600' : c.customs_status === 'RELEASED' ? 'text-green-600' : 'text-yellow-600'}`}>
                        Customs: {c.customs_status}
                      </div>
                    </div>
                  )) || <p className="text-gray-500">No containers</p>}
                </div>
              </div>
            </div>
            {shipment.special_instructions && (
              <div className="mt-6">
                <h3 className="font-semibold border-b pb-2">Special Instructions</h3>
                <p className="mt-2 text-sm text-gray-600">{shipment.special_instructions}</p>
              </div>
            )}
          </div>
          <div className="px-6 py-4 bg-gray-50 border-t flex justify-end">
            <button onClick={onClose} className="px-6 py-2 bg-gray-200 rounded-lg hover:bg-gray-300">Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}