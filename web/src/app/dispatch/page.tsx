'use client';

import { useState, useEffect } from 'react';
import { getOrders, getDrivers, getTractors, getAllChassis, createTrip, Order, Driver, Tractor, Chassis } from '../../lib/supabase';

export default function DispatchPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [tractors, setTractors] = useState<Tractor[]>([]);
  const [chassisList, setChassisList] = useState<Chassis[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDispatchModalOpen, setIsDispatchModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [dispatchForm, setDispatchForm] = useState({
    driver_id: '', tractor_id: '', chassis_id: '', planned_start: '', notes: ''
  });

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [ordersData, driversData, tractorsData, chassisData] = await Promise.all([
        getOrders(), getDrivers(), getTractors(), getAllChassis()
      ]);
      setOrders(ordersData || []);
      setDrivers(driversData || []);
      setTractors(tractorsData || []);
      setChassisList(chassisData || []);
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const openDispatchModal = (order: Order) => {
    setSelectedOrder(order);
    setDispatchForm({ driver_id: '', tractor_id: '', chassis_id: '', planned_start: '', notes: '' });
    setIsDispatchModalOpen(true);
  };

  const handleDispatch = async () => {
    if (!selectedOrder || !dispatchForm.driver_id || !dispatchForm.tractor_id) {
      alert('Please select driver and tractor');
      return;
    }
    try {
      await createTrip({
        type: selectedOrder.type === 'IMPORT' ? 'LIVE_UNLOAD' : 'LIVE_LOAD',
        status: 'DISPATCHED',
        order_id: selectedOrder.id,
        driver_id: dispatchForm.driver_id,
        tractor_id: dispatchForm.tractor_id,
        chassis_id: dispatchForm.chassis_id || null,
        container_number: selectedOrder.container_number,
        pickup_location: selectedOrder.pickup_location,
        delivery_location: selectedOrder.delivery_location,
        planned_start: dispatchForm.planned_start || null,
        notes: dispatchForm.notes,
      });
      await fetchData();
      setIsDispatchModalOpen(false);
      alert('Order dispatched successfully!');
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      'PENDING': 'bg-yellow-100 text-yellow-800 border-yellow-300',
      'READY': 'bg-blue-100 text-blue-800 border-blue-300',
      'DISPATCHED': 'bg-purple-100 text-purple-800 border-purple-300',
      'IN_PROGRESS': 'bg-indigo-100 text-indigo-800 border-indigo-300',
      'DELIVERED': 'bg-green-100 text-green-800 border-green-300',
      'COMPLETED': 'bg-gray-100 text-gray-800 border-gray-300',
    };
    return colors[status] || 'bg-gray-100 text-gray-800 border-gray-300';
  };

  const pendingOrders = orders.filter(o => o.status === 'PENDING');
  const dispatchedOrders = orders.filter(o => o.status === 'DISPATCHED' || o.status === 'IN_PROGRESS');
  const completedOrders = orders.filter(o => o.status === 'DELIVERED' || o.status === 'COMPLETED');
  const availableDrivers = drivers.filter(d => d.status === 'AVAILABLE');
  const availableTractors = tractors.filter(t => t.status === 'AVAILABLE');
  const availableChassis = chassisList.filter(c => c.status === 'AVAILABLE');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dispatch Board</h1>
          <p className="text-gray-500 mt-1">Assign drivers and equipment to orders</p>
        </div>
        <button onClick={fetchData} className="px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200">🔄 Refresh</button>
      </div>

      {/* Resource Summary */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow p-4">
          <p className="text-sm text-gray-500">Pending Orders</p>
          <p className="text-2xl font-bold text-yellow-600">{pendingOrders.length}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4">
          <p className="text-sm text-gray-500">Available Drivers</p>
          <p className="text-2xl font-bold text-green-600">{availableDrivers.length}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4">
          <p className="text-sm text-gray-500">Available Tractors</p>
          <p className="text-2xl font-bold text-blue-600">{availableTractors.length}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4">
          <p className="text-sm text-gray-500">Available Chassis</p>
          <p className="text-2xl font-bold text-purple-600">{availableChassis.length}</p>
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl shadow p-12 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        </div>
      ) : (
        /* Kanban Board */
        <div className="grid grid-cols-3 gap-6">
          {/* Pending Column */}
          <div className="bg-gray-50 rounded-xl p-4">
            <h3 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <span className="w-3 h-3 bg-yellow-500 rounded-full"></span>
              Pending ({pendingOrders.length})
            </h3>
            <div className="space-y-3">
              {pendingOrders.map((order) => (
                <div key={order.id} className={`bg-white rounded-lg p-4 border-l-4 ${getStatusColor(order.status)} shadow-sm`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono font-semibold text-blue-600">{order.order_number}</span>
                    <span className={`px-2 py-0.5 text-xs rounded ${order.type === 'IMPORT' ? 'bg-purple-100 text-purple-800' : 'bg-orange-100 text-orange-800'}`}>
                      {order.type}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600 mb-2">
                    <div>📦 {order.container_number || 'No container'}</div>
                    <div>📍 {order.pickup_location} → {order.delivery_location}</div>
                  </div>
                  <button onClick={() => openDispatchModal(order)} className="w-full mt-2 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
                    Dispatch
                  </button>
                </div>
              ))}
              {pendingOrders.length === 0 && <p className="text-gray-400 text-center py-8">No pending orders</p>}
            </div>
          </div>

          {/* Dispatched Column */}
          <div className="bg-gray-50 rounded-xl p-4">
            <h3 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <span className="w-3 h-3 bg-purple-500 rounded-full"></span>
              In Transit ({dispatchedOrders.length})
            </h3>
            <div className="space-y-3">
              {dispatchedOrders.map((order) => (
                <div key={order.id} className={`bg-white rounded-lg p-4 border-l-4 ${getStatusColor(order.status)} shadow-sm`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono font-semibold text-blue-600">{order.order_number}</span>
                    <span className="px-2 py-0.5 text-xs rounded bg-purple-100 text-purple-800">{order.status}</span>
                  </div>
                  <div className="text-sm text-gray-600">
                    <div>📦 {order.container_number || 'No container'}</div>
                    <div>📍 {order.pickup_location} → {order.delivery_location}</div>
                  </div>
                </div>
              ))}
              {dispatchedOrders.length === 0 && <p className="text-gray-400 text-center py-8">No active trips</p>}
            </div>
          </div>

          {/* Completed Column */}
          <div className="bg-gray-50 rounded-xl p-4">
            <h3 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <span className="w-3 h-3 bg-green-500 rounded-full"></span>
              Completed ({completedOrders.length})
            </h3>
            <div className="space-y-3">
              {completedOrders.slice(0, 5).map((order) => (
                <div key={order.id} className={`bg-white rounded-lg p-4 border-l-4 ${getStatusColor(order.status)} shadow-sm`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono font-semibold text-gray-600">{order.order_number}</span>
                    <span className="px-2 py-0.5 text-xs rounded bg-green-100 text-green-800">✓</span>
                  </div>
                  <div className="text-sm text-gray-500">
                    <div>📦 {order.container_number || '-'}</div>
                    <div>💰 ${order.total_amount || 0}</div>
                  </div>
                </div>
              ))}
              {completedOrders.length === 0 && <p className="text-gray-400 text-center py-8">No completed orders</p>}
            </div>
          </div>
        </div>
      )}

      {/* Dispatch Modal */}
      {isDispatchModalOpen && selectedOrder && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => setIsDispatchModalOpen(false)}></div>
          <div className="relative min-h-screen flex items-center justify-center p-4">
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg">
              <div className="bg-gradient-to-r from-purple-600 to-purple-700 px-6 py-4 rounded-t-2xl">
                <h2 className="text-xl font-bold text-white">Dispatch Order</h2>
                <p className="text-purple-100">{selectedOrder.order_number}</p>
              </div>
              <div className="p-6 space-y-4">
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-sm"><strong>Container:</strong> {selectedOrder.container_number || '-'}</div>
                  <div className="text-sm"><strong>Route:</strong> {selectedOrder.pickup_location} → {selectedOrder.delivery_location}</div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Driver *</label>
                  <select value={dispatchForm.driver_id} onChange={e => setDispatchForm({...dispatchForm, driver_id: e.target.value})} className="w-full px-4 py-2 border rounded-lg">
                    <option value="">Select Driver</option>
                    {availableDrivers.map(d => (
                      <option key={d.id} value={d.id}>{d.first_name} {d.last_name} {d.hazmat_endorsement && '☣️'}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Tractor *</label>
                  <select value={dispatchForm.tractor_id} onChange={e => setDispatchForm({...dispatchForm, tractor_id: e.target.value})} className="w-full px-4 py-2 border rounded-lg">
                    <option value="">Select Tractor</option>
                    {availableTractors.map(t => (
                      <option key={t.id} value={t.id}>{t.unit_number} - {t.make} {t.model}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Chassis</label>
                  <select value={dispatchForm.chassis_id} onChange={e => setDispatchForm({...dispatchForm, chassis_id: e.target.value})} className="w-full px-4 py-2 border rounded-lg">
                    <option value="">Select Chassis (Optional)</option>
                    {availableChassis.map(c => (
                      <option key={c.id} value={c.id}>{c.chassis_number} - {c.pool} {c.size}'</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Planned Start</label>
                  <input type="datetime-local" value={dispatchForm.planned_start} onChange={e => setDispatchForm({...dispatchForm, planned_start: e.target.value})} className="w-full px-4 py-2 border rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Notes</label>
                  <textarea value={dispatchForm.notes} onChange={e => setDispatchForm({...dispatchForm, notes: e.target.value})} rows={2} className="w-full px-4 py-2 border rounded-lg" />
                </div>
              </div>
              <div className="px-6 py-4 bg-gray-50 border-t rounded-b-2xl flex justify-between">
                <button onClick={() => setIsDispatchModalOpen(false)} className="px-6 py-2 border rounded-lg hover:bg-gray-100">Cancel</button>
                <button onClick={handleDispatch} className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700">Dispatch</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}