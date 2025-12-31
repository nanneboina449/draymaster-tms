'use client';

interface Shipment {
  id: string;
  referenceNumber: string;
  type: string;
  status: string;
  customer: string;
  steamshipLine: string;
  vessel: string;
  voyage: string;
  terminal: string;
  containerCount: number;
  lastFreeDay: string;
  createdAt: string;
}

interface ShipmentListProps {
  shipments: Shipment[];
}

export function ShipmentList({ shipments }: ShipmentListProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PENDING': return 'bg-yellow-100 text-yellow-800';
      case 'IN_PROGRESS': return 'bg-blue-100 text-blue-800';
      case 'DELIVERED': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getTypeColor = (type: string) => {
    return type === 'IMPORT' ? 'bg-purple-100 text-purple-800' : 'bg-orange-100 text-orange-800';
  };

  const isLFDUrgent = (lfd: string) => {
    const lfdDate = new Date(lfd);
    const today = new Date();
    const diffDays = Math.ceil((lfdDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays <= 2;
  };

  return (
    <div className="bg-white rounded-xl shadow overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">All Shipments</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reference</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vessel / Voyage</th>
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
                  <span className="font-mono font-medium text-blue-600">{shipment.referenceNumber}</span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${getTypeColor(shipment.type)}`}>
                    {shipment.type}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-gray-900">{shipment.customer}</td>
                <td className="px-6 py-4 whitespace-nowrap text-gray-500">
                  <div>{shipment.vessel}</div>
                  <div className="text-xs">{shipment.voyage}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-gray-500">{shipment.terminal}</td>
                <td className="px-6 py-4 whitespace-nowrap text-gray-900">{shipment.containerCount}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={isLFDUrgent(shipment.lastFreeDay) ? 'text-red-600 font-semibold' : 'text-gray-500'}>
                    {shipment.lastFreeDay} {isLFDUrgent(shipment.lastFreeDay) && '⚠️'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(shipment.status)}`}>
                    {shipment.status.replace('_', ' ')}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <button className="text-blue-600 hover:text-blue-800 mr-3">View</button>
                  <button className="text-gray-600 hover:text-gray-800">Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}