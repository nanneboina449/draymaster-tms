'use client';

import { useState, useEffect } from 'react';
import { Shipment, getShipmentWithDetails } from '../../lib/supabase';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  shipment: Shipment;
}

// Status color helpers
const getOrderStatusColor = (status: string) => {
  switch (status) {
    case 'COMPLETED': return 'bg-green-100 text-green-800';
    case 'DELIVERED': return 'bg-blue-100 text-blue-800';
    case 'IN_PROGRESS': return 'bg-yellow-100 text-yellow-800';
    case 'DISPATCHED': return 'bg-purple-100 text-purple-800';
    case 'READY': return 'bg-cyan-100 text-cyan-800';
    case 'PENDING': return 'bg-gray-100 text-gray-800';
    case 'HOLD': return 'bg-red-100 text-red-800';
    case 'CANCELLED': return 'bg-red-100 text-red-800';
    default: return 'bg-gray-100 text-gray-800';
  }
};

const getContainerStatusColor = (status: string) => {
  switch (status) {
    case 'COMPLETED': return 'bg-green-100 text-green-800';
    case 'RETURNED': return 'bg-green-100 text-green-800';
    case 'DELIVERED': return 'bg-blue-100 text-blue-800';
    case 'DROPPED': return 'bg-blue-100 text-blue-800';
    case 'PICKED_UP': return 'bg-yellow-100 text-yellow-800';
    case 'AVAILABLE': return 'bg-cyan-100 text-cyan-800';
    case 'BOOKED': return 'bg-gray-100 text-gray-800';
    default: return 'bg-gray-100 text-gray-800';
  }
};

const getMoveTypeLabel = (moveType: string) => {
  switch (moveType) {
    case 'IMPORT_DELIVERY': return 'Import Delivery';
    case 'EXPORT_PICKUP': return 'Export Pickup';
    case 'EMPTY_RETURN': return 'Empty Return';
    case 'EMPTY_PICKUP': return 'Empty Pickup';
    case 'YARD_PULL': return 'Yard Pull';
    case 'YARD_DELIVERY': return 'Yard Delivery';
    case 'REPO': return 'Reposition';
    default: return moveType || 'Unknown';
  }
};

const getTripTypeLabel = (tripType: string) => {
  switch (tripType) {
    case 'LIVE_UNLOAD': return 'Live Unload';
    case 'LIVE_LOAD': return 'Live Load';
    case 'DROP': return 'Drop';
    case 'DROP_AND_HOOK': return 'Drop & Hook';
    case 'STREET_TURN': return 'Street Turn';
    case 'PREPULL': return 'Prepull';
    case 'REPO': return 'Repo';
    default: return tripType || '-';
  }
};

export function ViewShipmentModal({ isOpen, onClose, shipment }: Props) {
  const [detailedShipment, setDetailedShipment] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [expandedContainers, setExpandedContainers] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (isOpen && shipment?.id) {
      fetchDetails();
    }
  }, [isOpen, shipment?.id]);

  const fetchDetails = async () => {
    setLoading(true);
    try {
      const data = await getShipmentWithDetails(shipment.id);
      setDetailedShipment(data);
      // Auto-expand all containers
      if (data?.containers) {
        const expanded: Record<string, boolean> = {};
        data.containers.forEach((c: any) => {
          expanded[c.id] = true;
        });
        setExpandedContainers(expanded);
      }
    } catch (err) {
      console.error('Error fetching shipment details:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleContainer = (containerId: string) => {
    setExpandedContainers(prev => ({
      ...prev,
      [containerId]: !prev[containerId]
    }));
  };

  if (!isOpen) return null;

  const data = detailedShipment || shipment;
  const containers = data?.containers || [];

  // Calculate progress
  const totalOrders = containers.reduce((sum: number, c: any) => sum + (c.orders?.length || 0), 0);
  const completedOrders = containers.reduce((sum: number, c: any) =>
    sum + (c.orders?.filter((o: any) => o.status === 'COMPLETED').length || 0), 0);
  const progressPercent = totalOrders > 0 ? Math.round((completedOrders / totalOrders) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black bg-opacity-50" onClick={onClose}></div>
      <div className="relative min-h-screen flex items-center justify-center p-4">
        <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-white">Shipment Details</h2>
                <p className="text-blue-100">{data.reference_number}</p>
              </div>
              <div className="flex items-center gap-4">
                {/* Progress indicator */}
                <div className="text-right">
                  <div className="text-white text-sm font-medium">
                    {completedOrders} / {totalOrders} Orders Complete
                  </div>
                  <div className="w-32 h-2 bg-blue-800 rounded-full mt-1">
                    <div
                      className="h-full bg-green-400 rounded-full transition-all duration-300"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
                <button onClick={onClose} className="text-white text-2xl hover:text-blue-200">x</button>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto max-h-[70vh]">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : (
              <>
                {/* Shipment Info */}
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="text-sm text-gray-500">Type</div>
                    <div className="font-semibold">{data.type}</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="text-sm text-gray-500">Customer</div>
                    <div className="font-semibold">{data.customer_name}</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="text-sm text-gray-500">Terminal</div>
                    <div className="font-semibold">{data.terminal_name || '-'}</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="text-sm text-gray-500">SSL / Vessel</div>
                    <div className="font-semibold">{data.steamship_line || '-'} / {data.vessel || '-'}</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="text-sm text-gray-500">Last Free Day</div>
                    <div className="font-semibold text-red-600">{data.last_free_day || '-'}</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="text-sm text-gray-500">Port Cutoff</div>
                    <div className="font-semibold text-orange-600">{data.port_cutoff || '-'}</div>
                  </div>
                </div>

                {/* Containers Section */}
                <div className="mb-4">
                  <h3 className="text-lg font-semibold mb-3">
                    Containers ({containers.length})
                  </h3>
                </div>

                <div className="space-y-3">
                  {containers.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      No containers yet
                    </div>
                  ) : (
                    containers.map((container: any) => (
                      <div key={container.id} className="border rounded-lg overflow-hidden">
                        {/* Container Header */}
                        <div
                          className="flex items-center justify-between p-4 bg-gray-50 cursor-pointer hover:bg-gray-100"
                          onClick={() => toggleContainer(container.id)}
                        >
                          <div className="flex items-center gap-4">
                            <span className="text-lg">{expandedContainers[container.id] ? '▼' : '▶'}</span>
                            <div>
                              <div className="font-mono font-bold text-blue-600">
                                {container.container_number}
                              </div>
                              <div className="text-sm text-gray-500">
                                {container.size}' {container.type}
                                {container.weight_lbs ? ` - ${container.weight_lbs} lbs` : ''}
                              </div>
                            </div>
                            <div className="flex gap-1">
                              {container.is_hazmat && <span title="Hazmat">☣️</span>}
                              {container.is_reefer && <span title="Reefer">❄️</span>}
                              {container.is_overweight && <span title="Overweight">⚖️</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              container.customs_status === 'RELEASED' ? 'bg-green-100 text-green-800' :
                              container.customs_status === 'HOLD' ? 'bg-red-100 text-red-800' :
                              'bg-yellow-100 text-yellow-800'
                            }`}>
                              {container.customs_status || 'PENDING'}
                            </span>
                            <span className={`px-2 py-1 rounded text-xs font-medium ${getContainerStatusColor(container.lifecycle_status)}`}>
                              {container.lifecycle_status || 'BOOKED'}
                            </span>
                          </div>
                        </div>

                        {/* Orders for this Container */}
                        {expandedContainers[container.id] && (
                          <div className="p-4 bg-white border-t">
                            <div className="text-sm font-medium text-gray-500 mb-2">
                              Orders ({container.orders?.length || 0})
                            </div>
                            {container.orders?.length > 0 ? (
                              <div className="space-y-2">
                                {container.orders
                                  .sort((a: any, b: any) => (a.sequence_number || 0) - (b.sequence_number || 0))
                                  .map((order: any) => (
                                  <div
                                    key={order.id}
                                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                                  >
                                    <div className="flex items-center gap-4">
                                      <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">
                                        {order.sequence_number || 1}
                                      </div>
                                      <div>
                                        <div className="font-medium text-sm">
                                          {getMoveTypeLabel(order.move_type_v2)}
                                        </div>
                                        <div className="text-xs text-gray-500">
                                          {order.order_number} - {getTripTypeLabel(order.trip_execution_type)}
                                        </div>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                      {order.delivery_city && (
                                        <div className="text-sm text-gray-600">
                                          {order.delivery_city}, {order.delivery_state}
                                        </div>
                                      )}
                                      {order.pickup_city && !order.delivery_city && (
                                        <div className="text-sm text-gray-600">
                                          From: {order.pickup_city}, {order.pickup_state}
                                        </div>
                                      )}
                                      <span className={`px-2 py-1 rounded text-xs font-medium ${getOrderStatusColor(order.status)}`}>
                                        {order.status}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="text-sm text-gray-400 italic">No orders created yet</div>
                            )}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>

                {/* Special Instructions */}
                {data.special_instructions && (
                  <div className="mt-6 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                    <h4 className="font-semibold text-yellow-800 mb-2">Special Instructions</h4>
                    <p className="text-sm text-yellow-700">{data.special_instructions}</p>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-gray-50 border-t flex justify-between">
            <div className="text-sm text-gray-500">
              Status: <span className={`font-medium ${
                data.status === 'COMPLETED' ? 'text-green-600' :
                data.status === 'IN_PROGRESS' ? 'text-blue-600' :
                'text-gray-600'
              }`}>{data.status}</span>
            </div>
            <button onClick={onClose} className="px-6 py-2 bg-gray-200 rounded-lg hover:bg-gray-300">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
