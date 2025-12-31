'use client';

import { Shipment } from '../../lib/supabase';

interface ShipmentListProps {
  shipments: Shipment[];
  onView: (shipment: Shipment) => void;
  onEdit: (shipment: Shipment) => void;
  onDelete: (shipment: Shipment) => void;
  onStatusChange: (id: string, status: string) => void;
}

export function ShipmentList({ shipments, onView, onEdit, onDelete, onStatusChange }: ShipmentListProps) {
  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      'PENDING': 'bg-yellow-100 text-yellow-800',
      'CONFIRMED': 'bg-blue-100 text-blue-800',
      'IN_PROGRESS': 'bg-indigo-100 text-indigo-800',
      'DELIVERED': 'bg-green-100 text-green-800',
      'COMPLETED': 'bg-gray-100 text-gray-800',
      'CANCELLED': 'bg-red-100 text-red-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const isLFDUrgent = (lfd: string | null) => {
    if (!lfd) return false;
    const diff = Math.ceil((new Date(lfd).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return diff <= 2 && diff >= 0;
  };

  if (shipments.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow p-12 text-center">
        <div className="text-6xl mb-4">📦</div>
        <h3 className="text-xl font-semibold text-gray-900">No shipments found</h3>
        <p className="text-gray-500 mt-2">Create a new load to get started</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">All Shipments ({shipments.length})</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reference</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vessel</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Terminal</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Containers</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">LFD</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {shipments.map((shipment) => (
              <tr key={shipment.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <span 
                    className="font-mono font-medium text-blue-600 cursor-pointer hover:underline"
                    onClick={() => onView(shipment)}
                  >
                    {shipment.reference_number}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                    shipment.type === 'IMPORT' ? 'bg-purple-100 text-purple-800' : 'bg-orange-100 text-orange-800'
                  }`}>
                    {shipment.type}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-gray-900">{shipment.customer_name}</td>
                <td className="px-6 py-4 whitespace-nowrap text-gray-500">
                  <div>{shipment.vessel || '-'}</div>
                  <div className="text-xs">{shipment.voyage || ''}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-gray-500">{shipment.terminal_name || '-'}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="bg-gray-100 px-2 py-1 rounded text-sm">{shipment.containers?.length || 0}</span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={isLFDUrgent(shipment.last_free_day) ? 'text-red-600 font-semibold' : 'text-gray-500'}>
                    {shipment.last_free_day ? new Date(shipment.last_free_day).toLocaleDateString() : '-'}
                    {isLFDUrgent(shipment.last_free_day) && ' ⚠️'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <select
                    value={shipment.status}
                    onChange={(e) => onStatusChange(shipment.id, e.target.value)}
                    className={`px-2 py-1 text-xs font-medium rounded-full border-0 cursor-pointer ${getStatusColor(shipment.status)}`}
                  >
                    <option value="PENDING">PENDING</option>
                    <option value="CONFIRMED">CONFIRMED</option>
                    <option value="IN_PROGRESS">IN PROGRESS</option>
                    <option value="DELIVERED">DELIVERED</option>
                    <option value="COMPLETED">COMPLETED</option>
                    <option value="CANCELLED">CANCELLED</option>
                  </select>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <button onClick={() => onView(shipment)} className="text-blue-600 hover:text-blue-800 mr-2">View</button>
                  <button onClick={() => onEdit(shipment)} className="text-gray-600 hover:text-gray-800 mr-2">Edit</button>
                  <button onClick={() => onDelete(shipment)} className="text-red-600 hover:text-red-800">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}