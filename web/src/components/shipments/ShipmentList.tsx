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
      'COMPLETED': 'bg-green-100 text-green-800',
      'CANCELLED': 'bg-red-100 text-red-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const isLFDUrgent = (lfd: string | null) => {
    if (!lfd) return { urgent: false, overdue: false };
    const diff = Math.ceil((new Date(lfd).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return {
      overdue: diff < 0,
      urgent: diff >= 0 && diff <= 2
    };
  };

  // Calculate progress from containers/orders
  const getProgress = (shipment: Shipment) => {
    const containers = shipment.containers || [];
    let totalOrders = 0;
    let completedOrders = 0;

    containers.forEach((c: any) => {
      if (c.orders) {
        totalOrders += c.orders.length;
        completedOrders += c.orders.filter((o: any) => o.status === 'COMPLETED').length;
      }
    });

    // Also check if shipment has direct counts (from view)
    if ((shipment as any).total_orders) {
      totalOrders = (shipment as any).total_orders;
      completedOrders = (shipment as any).completed_orders || 0;
    }

    const percent = totalOrders > 0 ? Math.round((completedOrders / totalOrders) * 100) : 0;
    return { totalOrders, completedOrders, percent, totalContainers: containers.length };
  };

  if (shipments.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow p-12 text-center">
        <div className="text-6xl mb-4">📦</div>
        <h3 className="text-xl font-semibold text-gray-900">No shipments found</h3>
        <p className="text-gray-500 mt-2">Create a new shipment to get started</p>
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
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Terminal</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Containers</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Progress</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">LFD</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {shipments.map((shipment) => {
              const lfdStatus = isLFDUrgent(shipment.last_free_day);
              const progress = getProgress(shipment);

              return (
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
                  <td className="px-6 py-4 whitespace-nowrap text-gray-500">{shipment.terminal_name || '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="bg-gray-100 px-2 py-1 rounded text-sm font-medium">
                      {progress.totalContainers}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {progress.totalOrders > 0 ? (
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${
                              progress.percent === 100 ? 'bg-green-500' :
                              progress.percent > 50 ? 'bg-blue-500' :
                              progress.percent > 0 ? 'bg-yellow-500' :
                              'bg-gray-300'
                            }`}
                            style={{ width: `${progress.percent}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-600">
                          {progress.completedOrders}/{progress.totalOrders}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">No orders</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {shipment.last_free_day ? (
                      <span className={`font-medium ${
                        lfdStatus.overdue ? 'text-red-600' :
                        lfdStatus.urgent ? 'text-orange-600' :
                        'text-gray-600'
                      }`}>
                        {new Date(shipment.last_free_day).toLocaleDateString()}
                        {lfdStatus.overdue && ' (OVERDUE)'}
                        {lfdStatus.urgent && !lfdStatus.overdue && ' !'}
                      </span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
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
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
