'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase, checkAndAutoReadyLoads, updateLoadStatus, getAvailableStatusTransitions, OrderStatus } from '../../lib/supabase';

interface LoadItem {
  id: string;
  container_id: string;
  container_number: string;
  container_size: string;
  container_type: string;
  lifecycle_status: string;
  customs_status: string;
  is_hazmat: boolean;
  is_overweight: boolean;
  order_id: string;
  order_number: string;
  order_status: string;
  move_type: string;
  trip_execution_type: string;
  shipment_id: string;
  reference_number: string;
  shipment_type: string;
  customer_name: string;
  terminal_name: string;
  booking_number: string;
  bill_of_lading: string;
  last_free_day: string | null;
  port_cutoff: string | null;
  terminal_appointment: string | null;
  pickup_appointment: string | null;
  delivery_appointment: string | null;
  assigned_driver_id: string | null;
  driver_name: string | null;
}

const getMoveTypeLabel = (moveType: string) => {
  switch (moveType) {
    case 'IMPORT_DELIVERY': return 'Import Delivery';
    case 'EXPORT_PICKUP': return 'Export Pickup';
    case 'EMPTY_RETURN': return 'Empty Return';
    case 'EMPTY_PICKUP': return 'Empty Pickup';
    case 'YARD_PULL': return 'Yard Pull';
    case 'YARD_DELIVERY': return 'Yard Delivery';
    case 'REPO': return 'Reposition';
    default: return moveType || '-';
  }
};

const getStatusColor = (status: string) => {
  switch (status) {
    case 'COMPLETED': return 'bg-green-100 text-green-800';
    case 'DELIVERED': return 'bg-blue-100 text-blue-800';
    case 'IN_PROGRESS': return 'bg-yellow-100 text-yellow-800';
    case 'DISPATCHED': return 'bg-purple-100 text-purple-800';
    case 'READY': return 'bg-cyan-100 text-cyan-800';
    case 'PENDING': return 'bg-gray-100 text-gray-800';
    case 'HOLD': return 'bg-red-100 text-red-800';
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

const getCustomsStatusColor = (status: string) => {
  switch (status) {
    case 'RELEASED': return 'bg-green-100 text-green-800';
    case 'HOLD': return 'bg-red-100 text-red-800';
    case 'PENDING': return 'bg-yellow-100 text-yellow-800';
    default: return 'bg-gray-100 text-gray-800';
  }
};

export default function LoadsPage() {
  const router = useRouter();
  const [loads, setLoads] = useState<LoadItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLoad, setSelectedLoad] = useState<LoadItem | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [autoReadyLoading, setAutoReadyLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchLoads();
  }, []);

  const fetchLoads = async () => {
    try {
      setLoading(true);
      // Fetch orders with container and shipment details
      const { data, error: fetchError } = await supabase
        .from('orders')
        .select(`
          id,
          order_number,
          status,
          move_type_v2,
          trip_execution_type,
          pickup_appointment,
          delivery_appointment,
          assigned_driver_id,
          container:containers(
            id,
            container_number,
            size,
            type,
            lifecycle_status,
            customs_status,
            is_hazmat,
            is_overweight,
            terminal_appointment
          ),
          shipment:shipments(
            id,
            reference_number,
            type,
            customer_name,
            terminal_name,
            booking_number,
            bill_of_lading,
            last_free_day,
            port_cutoff
          ),
          driver:drivers(
            first_name,
            last_name
          )
        `)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      // Transform data to flat structure
      const transformedLoads: LoadItem[] = (data || []).map((order: any) => ({
        id: order.id,
        container_id: order.container?.id,
        container_number: order.container?.container_number || '-',
        container_size: order.container?.size || '-',
        container_type: order.container?.type || '-',
        lifecycle_status: order.container?.lifecycle_status || 'BOOKED',
        customs_status: order.container?.customs_status || 'PENDING',
        is_hazmat: order.container?.is_hazmat || false,
        is_overweight: order.container?.is_overweight || false,
        order_id: order.id,
        order_number: order.order_number,
        order_status: order.status,
        move_type: order.move_type_v2,
        trip_execution_type: order.trip_execution_type,
        shipment_id: order.shipment?.id,
        reference_number: order.shipment?.reference_number || '-',
        shipment_type: order.shipment?.type || '-',
        customer_name: order.shipment?.customer_name || '-',
        terminal_name: order.shipment?.terminal_name || '-',
        booking_number: order.shipment?.booking_number || '-',
        bill_of_lading: order.shipment?.bill_of_lading || '-',
        last_free_day: order.shipment?.last_free_day,
        port_cutoff: order.shipment?.port_cutoff,
        terminal_appointment: order.container?.terminal_appointment,
        pickup_appointment: order.pickup_appointment,
        delivery_appointment: order.delivery_appointment,
        assigned_driver_id: order.assigned_driver_id,
        driver_name: order.driver ? `${order.driver.first_name} ${order.driver.last_name}` : null,
      }));

      setLoads(transformedLoads);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const isLFDUrgent = (lfd: string | null) => {
    if (!lfd) return { urgent: false, overdue: false };
    const diff = Math.ceil((new Date(lfd).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return {
      overdue: diff < 0,
      urgent: diff >= 0 && diff <= 2
    };
  };

  const formatDate = (date: string | null) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString();
  };

  const formatDateTime = (date: string | null) => {
    if (!date) return '-';
    return new Date(date).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleDispatch = (load: LoadItem) => {
    // Navigate to dispatch page with the order pre-selected
    router.push(`/dispatch?order=${load.order_id}`);
  };

  const handleAutoReady = async () => {
    try {
      setAutoReadyLoading(true);
      setStatusMessage(null);
      const result = await checkAndAutoReadyLoads();
      if (result.updated > 0) {
        setStatusMessage({ type: 'success', text: `${result.updated} load(s) moved to READY status` });
        fetchLoads();
      } else {
        setStatusMessage({ type: 'success', text: 'No loads eligible for auto-ready' });
      }
      if (result.errors.length > 0) {
        setStatusMessage({ type: 'error', text: result.errors.join(', ') });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    } finally {
      setAutoReadyLoading(false);
      setTimeout(() => setStatusMessage(null), 5000);
    }
  };

  const handleStatusChange = async (orderId: string, newStatus: OrderStatus) => {
    try {
      setStatusMessage(null);
      const result = await updateLoadStatus(orderId, newStatus);
      if (result.success) {
        setStatusMessage({ type: 'success', text: `Status updated to ${newStatus}` });
        // Update local state
        setLoads(prev => prev.map(l =>
          l.id === orderId ? { ...l, order_status: newStatus } : l
        ));
      } else {
        setStatusMessage({ type: 'error', text: result.error || 'Failed to update status' });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    } finally {
      setTimeout(() => setStatusMessage(null), 5000);
    }
  };

  const filteredLoads = loads.filter(l => {
    if (statusFilter && l.order_status !== statusFilter) return false;
    if (typeFilter && l.shipment_type !== typeFilter) return false;
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      return l.container_number.toLowerCase().includes(search) ||
        l.order_number.toLowerCase().includes(search) ||
        l.reference_number.toLowerCase().includes(search) ||
        l.customer_name.toLowerCase().includes(search) ||
        l.booking_number?.toLowerCase().includes(search) ||
        l.bill_of_lading?.toLowerCase().includes(search);
    }
    return true;
  });

  const stats = {
    total: loads.length,
    pending: loads.filter(l => l.order_status === 'PENDING').length,
    ready: loads.filter(l => l.order_status === 'READY').length,
    dispatched: loads.filter(l => l.order_status === 'DISPATCHED').length,
    inProgress: loads.filter(l => l.order_status === 'IN_PROGRESS').length,
    completed: loads.filter(l => l.order_status === 'COMPLETED').length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Loads</h1>
          <p className="text-gray-500 mt-1">Container-level dispatch board</p>
        </div>
        <button
          onClick={() => router.push('/orders')}
          className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 font-medium"
        >
          <span className="text-xl">+</span> New Order
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">Error: {error}</div>}

      {/* Status Message */}
      {statusMessage && (
        <div className={`px-4 py-3 rounded-lg ${statusMessage.type === 'success' ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
          {statusMessage.text}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <div className="bg-white rounded-xl shadow p-4">
          <p className="text-sm text-gray-500">Total Loads</p>
          <p className="text-2xl font-bold">{stats.total}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4">
          <p className="text-sm text-gray-500">Pending</p>
          <p className="text-2xl font-bold text-gray-600">{stats.pending}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4">
          <p className="text-sm text-gray-500">Ready</p>
          <p className="text-2xl font-bold text-cyan-600">{stats.ready}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4">
          <p className="text-sm text-gray-500">Dispatched</p>
          <p className="text-2xl font-bold text-purple-600">{stats.dispatched}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4">
          <p className="text-sm text-gray-500">In Progress</p>
          <p className="text-2xl font-bold text-yellow-600">{stats.inProgress}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4">
          <p className="text-sm text-gray-500">Completed</p>
          <p className="text-2xl font-bold text-green-600">{stats.completed}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow p-4 flex flex-wrap gap-4">
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="px-3 py-1.5 border rounded-lg text-sm"
        >
          <option value="">All Types</option>
          <option value="IMPORT">Import</option>
          <option value="EXPORT">Export</option>
        </select>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-1.5 border rounded-lg text-sm"
        >
          <option value="">All Status</option>
          <option value="PENDING">Pending</option>
          <option value="READY">Ready</option>
          <option value="DISPATCHED">Dispatched</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="COMPLETED">Completed</option>
        </select>
        <input
          type="text"
          placeholder="Search container, order, BOL..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="px-4 py-1.5 border rounded-lg text-sm w-72"
        />
        <button onClick={fetchLoads} className="px-4 py-1.5 bg-gray-100 rounded-lg hover:bg-gray-200 text-sm">
          Refresh
        </button>
        <button
          onClick={handleAutoReady}
          disabled={autoReadyLoading}
          className="px-4 py-1.5 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 text-sm disabled:opacity-50 flex items-center gap-2"
        >
          {autoReadyLoading ? (
            <>
              <span className="animate-spin">&#9696;</span>
              Checking...
            </>
          ) : (
            'Auto-Ready'
          )}
        </button>
        <a
          href="/settings/workflow"
          className="px-4 py-1.5 bg-gray-100 rounded-lg hover:bg-gray-200 text-sm text-gray-700"
        >
          Workflow Rules
        </a>
      </div>

      {/* Loads Table */}
      {loading ? (
        <div className="bg-white rounded-xl shadow p-12 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-500">Loading loads...</p>
        </div>
      ) : filteredLoads.length === 0 ? (
        <div className="bg-white rounded-xl shadow p-12 text-center">
          <div className="text-6xl mb-4">📦</div>
          <h3 className="text-xl font-semibold text-gray-900">No loads found</h3>
          <p className="text-gray-500 mt-2">Create a new order to generate loads</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Container</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Move Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Bill of Lading / Booking</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">LFD</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cutoff</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Appt</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customs</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Driver</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredLoads.map((load) => {
                  const lfdStatus = isLFDUrgent(load.last_free_day);
                  return (
                    <tr key={load.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div>
                            <div className="font-mono font-semibold text-blue-600">{load.container_number}</div>
                            <div className="text-xs text-gray-500">{load.container_size}' {load.container_type}</div>
                          </div>
                          <div className="flex gap-0.5">
                            {load.is_hazmat && <span title="Hazmat" className="text-xs">☣️</span>}
                            {load.is_overweight && <span title="Overweight" className="text-xs">⚖️</span>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium">{getMoveTypeLabel(load.move_type)}</div>
                        <div className="text-xs text-gray-500">{load.order_number}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm">{load.bill_of_lading || '-'}</div>
                        <div className="text-xs text-gray-500">{load.booking_number || '-'}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium">{load.customer_name}</div>
                        <div className="text-xs text-gray-500">{load.terminal_name || '-'}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-sm font-medium ${
                          lfdStatus.overdue ? 'text-red-600' :
                          lfdStatus.urgent ? 'text-orange-600' :
                          'text-gray-600'
                        }`}>
                          {formatDate(load.last_free_day)}
                          {lfdStatus.overdue && ' !'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {formatDate(load.port_cutoff)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-xs">
                          {load.delivery_appointment && (
                            <div className="text-green-600">Del: {formatDateTime(load.delivery_appointment)}</div>
                          )}
                          {load.pickup_appointment && (
                            <div className="text-blue-600">PU: {formatDateTime(load.pickup_appointment)}</div>
                          )}
                          {!load.delivery_appointment && !load.pickup_appointment && '-'}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${getCustomsStatusColor(load.customs_status)}`}>
                          {load.customs_status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={load.order_status}
                          onChange={(e) => handleStatusChange(load.id, e.target.value as OrderStatus)}
                          className={`px-2 py-0.5 rounded text-xs font-medium border-0 cursor-pointer ${getStatusColor(load.order_status)}`}
                        >
                          <option value={load.order_status}>{load.order_status}</option>
                          {getAvailableStatusTransitions(load.order_status as OrderStatus)
                            .filter(s => s !== load.order_status)
                            .map(status => (
                              <option key={status} value={status}>{status}</option>
                            ))
                          }
                        </select>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {load.driver_name || <span className="text-gray-400">-</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button
                            onClick={() => { setSelectedLoad(load); setShowDetailModal(true); }}
                            className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                          >
                            View
                          </button>
                          {(load.order_status === 'PENDING' || load.order_status === 'READY') && (
                            <button
                              onClick={() => handleDispatch(load)}
                              className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                            >
                              Dispatch
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Load Detail Modal */}
      {showDetailModal && selectedLoad && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => setShowDetailModal(false)}></div>
          <div className="relative min-h-screen flex items-center justify-center p-4">
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl">
              <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 rounded-t-2xl">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-white">Load Details</h2>
                    <p className="text-blue-100">{selectedLoad.container_number}</p>
                  </div>
                  <button onClick={() => setShowDetailModal(false)} className="text-white text-2xl hover:text-blue-200">x</button>
                </div>
              </div>
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="text-sm text-gray-500">Container</div>
                    <div className="font-mono font-bold text-lg">{selectedLoad.container_number}</div>
                    <div className="text-sm text-gray-600">{selectedLoad.container_size}' {selectedLoad.container_type}</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="text-sm text-gray-500">Move Type</div>
                    <div className="font-semibold">{getMoveTypeLabel(selectedLoad.move_type)}</div>
                    <div className="text-sm text-gray-600">{selectedLoad.trip_execution_type}</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="text-sm text-gray-500">Order</div>
                    <div className="font-mono">{selectedLoad.order_number}</div>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(selectedLoad.order_status)}`}>
                      {selectedLoad.order_status}
                    </span>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="text-sm text-gray-500">Shipment</div>
                    <div className="font-mono">{selectedLoad.reference_number}</div>
                    <div className="text-sm text-gray-600">{selectedLoad.shipment_type}</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="text-sm text-gray-500">Customer</div>
                    <div className="font-semibold">{selectedLoad.customer_name}</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="text-sm text-gray-500">Terminal</div>
                    <div className="font-semibold">{selectedLoad.terminal_name || '-'}</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="text-sm text-gray-500">Bill of Lading / Booking</div>
                    <div className="font-medium">{selectedLoad.bill_of_lading || '-'}</div>
                    <div className="text-sm text-gray-600">Booking: {selectedLoad.booking_number || '-'}</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="text-sm text-gray-500">Customs Status</div>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${getCustomsStatusColor(selectedLoad.customs_status)}`}>
                      {selectedLoad.customs_status}
                    </span>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="text-sm text-gray-500">Last Free Day</div>
                    <div className={`font-semibold ${isLFDUrgent(selectedLoad.last_free_day).overdue ? 'text-red-600' : ''}`}>
                      {formatDate(selectedLoad.last_free_day)}
                    </div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="text-sm text-gray-500">Port Cutoff</div>
                    <div className="font-semibold">{formatDate(selectedLoad.port_cutoff)}</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="text-sm text-gray-500">Delivery Appointment</div>
                    <div className="font-semibold">{formatDateTime(selectedLoad.delivery_appointment)}</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="text-sm text-gray-500">Assigned Driver</div>
                    <div className="font-semibold">{selectedLoad.driver_name || 'Not Assigned'}</div>
                  </div>
                </div>
              </div>
              <div className="px-6 py-4 bg-gray-50 rounded-b-2xl flex justify-between">
                <button
                  onClick={() => setShowDetailModal(false)}
                  className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300"
                >
                  Close
                </button>
                {(selectedLoad.order_status === 'PENDING' || selectedLoad.order_status === 'READY') && (
                  <button
                    onClick={() => { setShowDetailModal(false); handleDispatch(selectedLoad); }}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Dispatch This Load
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
