'use client';

import { useState, useEffect } from 'react';
import { 
  getOrders, getDrivers, getTractors, getAllChassis, 
  createTrip, createMultiLegTrip, updateOrder,
  Order, Driver, Tractor, Chassis 
} from '../../lib/supabase';

const LEG_TYPES = [
  { value: 'PICKUP', label: 'Pickup (Get Container)', icon: '📍' },
  { value: 'DELIVERY', label: 'Delivery', icon: '🎯' },
  { value: 'EMPTY_RETURN', label: 'Empty Return', icon: '📤' },
  { value: 'CHASSIS_PICKUP', label: 'Chassis Pickup', icon: '🔗' },
  { value: 'CHASSIS_RETURN', label: 'Chassis Return', icon: '↩️' },
  { value: 'RELAY_HANDOFF', label: 'Relay Handoff', icon: '🔄' },
  { value: 'STREET_TURN', label: 'Street Turn', icon: '♻️' },
];

const TRIP_TEMPLATES = [
  {
    name: 'Standard Import (Live Unload)',
    description: 'Pickup from terminal, deliver to customer, return empty',
    legs: [
      { leg_type: 'PICKUP', pickup_location: 'Terminal', delivery_location: 'Terminal Gate' },
      { leg_type: 'DELIVERY', pickup_location: 'Terminal', delivery_location: 'Customer' },
      { leg_type: 'EMPTY_RETURN', pickup_location: 'Customer', delivery_location: 'Terminal' },
    ]
  },
  {
    name: 'Drop & Pick',
    description: 'Drop loaded, pick up empty/another load',
    legs: [
      { leg_type: 'DELIVERY', pickup_location: 'Terminal', delivery_location: 'Customer' },
      { leg_type: 'PICKUP', pickup_location: 'Customer', delivery_location: 'Customer Yard' },
    ]
  },
  {
    name: 'Street Turn',
    description: 'Import delivery → Export pickup (same container)',
    legs: [
      { leg_type: 'DELIVERY', pickup_location: 'Terminal', delivery_location: 'Import Customer' },
      { leg_type: 'STREET_TURN', pickup_location: 'Import Customer', delivery_location: 'Export Customer' },
      { leg_type: 'DELIVERY', pickup_location: 'Export Customer', delivery_location: 'Terminal' },
    ]
  },
  {
    name: 'Relay (2 Drivers)',
    description: 'First driver to midpoint, second driver completes',
    legs: [
      { leg_type: 'DELIVERY', pickup_location: 'Terminal', delivery_location: 'Relay Point' },
      { leg_type: 'RELAY_HANDOFF', pickup_location: 'Relay Point', delivery_location: 'Relay Point' },
      { leg_type: 'DELIVERY', pickup_location: 'Relay Point', delivery_location: 'Customer' },
    ]
  },
];

export default function DispatchPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [tractors, setTractors] = useState<Tractor[]>([]);
  const [chassisList, setChassisList] = useState<Chassis[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modal states
  const [isDispatchModalOpen, setIsDispatchModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [dispatchMode, setDispatchMode] = useState<'simple' | 'advanced'>('simple');
  
  // Simple dispatch form
  const [simpleForm, setSimpleForm] = useState({
    driver_id: '',
    tractor_id: '',
    chassis_id: '',
    planned_start: '',
    notes: '',
  });

  // Advanced multi-leg form
  const [advancedForm, setAdvancedForm] = useState({
    trip_type: 'IMPORT_DELIVERY',
    priority: 'NORMAL',
    is_team_driver: false,
    dispatch_notes: '',
  });

  const [legs, setLegs] = useState<any[]>([
    { leg_type: 'DELIVERY', driver_id: '', pickup_location: '', delivery_location: '', notes: '' }
  ]);

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
    setSimpleForm({ driver_id: '', tractor_id: '', chassis_id: '', planned_start: '', notes: '' });
    setLegs([{ leg_type: 'DELIVERY', driver_id: '', pickup_location: order.pickup_location || '', delivery_location: order.delivery_location || '', notes: '' }]);
    setDispatchMode('simple');
    setIsDispatchModalOpen(true);
  };

  const applyTemplate = (template: typeof TRIP_TEMPLATES[0]) => {
    const newLegs = template.legs.map(leg => ({
      ...leg,
      driver_id: '',
      notes: '',
      pickup_location: leg.pickup_location === 'Terminal' ? selectedOrder?.pickup_location : leg.pickup_location === 'Customer' ? selectedOrder?.delivery_location : leg.pickup_location,
      delivery_location: leg.delivery_location === 'Terminal' ? selectedOrder?.pickup_location : leg.delivery_location === 'Customer' ? selectedOrder?.delivery_location : leg.delivery_location,
    }));
    setLegs(newLegs);
  };

  const addLeg = () => {
    setLegs([...legs, { leg_type: 'DELIVERY', driver_id: '', pickup_location: '', delivery_location: '', notes: '' }]);
  };

  const removeLeg = (index: number) => {
    if (legs.length > 1) {
      setLegs(legs.filter((_, i) => i !== index));
    }
  };

  const updateLeg = (index: number, field: string, value: any) => {
    const newLegs = [...legs];
    newLegs[index] = { ...newLegs[index], [field]: value };
    setLegs(newLegs);
  };

  const handleSimpleDispatch = async () => {
    if (!selectedOrder || !simpleForm.driver_id || !simpleForm.tractor_id) {
      alert('Please select driver and tractor');
      return;
    }
    try {
    // Get selected chassis number
const selectedChassis = chassisList.find(c => c.id === simpleForm.chassis_id);

await createTrip({
  type: selectedOrder.type === 'IMPORT' ? 'IMPORT_DELIVERY' : 'EXPORT_PICKUP',
  status: 'DISPATCHED',
  order_id: selectedOrder.id,
  driver_id: simpleForm.driver_id,
  tractor_id: simpleForm.tractor_id,
  chassis_id: simpleForm.chassis_id || null,
  chassis_number: selectedChassis?.chassis_number || null,
  container_number: selectedOrder.container_number,
  pickup_location: selectedOrder.pickup_location,
  delivery_location: selectedOrder.delivery_location,
  planned_start: simpleForm.planned_start || null,
  notes: simpleForm.notes,
});
      
      await updateOrder(selectedOrder.id, { status: 'DISPATCHED' });
      await fetchData();
      setIsDispatchModalOpen(false);
      alert('Order dispatched successfully!');
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const handleAdvancedDispatch = async () => {
    if (!selectedOrder) return;
    
    // Validate at least first leg has a driver
    if (!legs[0].driver_id) {
      alert('Please assign a driver to at least the first leg');
      return;
    }

    try {
      const tripData = {
        type: advancedForm.trip_type,
        status: 'DISPATCHED',
        order_id: selectedOrder.id,
        container_number: selectedOrder.container_number,
        pickup_location: legs[0].pickup_location,
        delivery_location: legs[legs.length - 1].delivery_location,
        driver_id: legs[0].driver_id,
        priority: advancedForm.priority,
        is_team_driver: advancedForm.is_team_driver,
        dispatch_notes: advancedForm.dispatch_notes,
      };

      const tripLegs = legs.map((leg, index) => ({
        leg_number: index + 1,
        leg_type: leg.leg_type,
        status: index === 0 ? 'DISPATCHED' : 'PENDING',
        driver_id: leg.driver_id || null,
        pickup_location: leg.pickup_location,
        delivery_location: leg.delivery_location,
        notes: leg.notes,
      }));

      await createMultiLegTrip(tripData, tripLegs);
      await updateOrder(selectedOrder.id, { status: 'DISPATCHED' });
      await fetchData();
      setIsDispatchModalOpen(false);
      alert(`Multi-leg trip created with ${legs.length} legs!`);
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      'PENDING': 'bg-yellow-100 text-yellow-800 border-yellow-300',
      'DISPATCHED': 'bg-blue-100 text-blue-800 border-blue-300',
      'IN_PROGRESS': 'bg-purple-100 text-purple-800 border-purple-300',
      'COMPLETED': 'bg-green-100 text-green-800 border-green-300',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const pendingOrders = orders.filter(o => o.status === 'PENDING');
  const dispatchedOrders = orders.filter(o => ['DISPATCHED', 'IN_PROGRESS'].includes(o.status));
  const completedOrders = orders.filter(o => ['COMPLETED', 'DELIVERED'].includes(o.status));
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
            <div className="space-y-3 max-h-[600px] overflow-y-auto">
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
                    <div className="text-xs mt-1">📍 {order.pickup_location}</div>
                    <div className="text-xs">🎯 {order.delivery_location}</div>
                  </div>
                  <button 
                    onClick={() => openDispatchModal(order)} 
                    className="w-full mt-2 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
                  >
                    🚚 Dispatch
                  </button>
                </div>
              ))}
              {pendingOrders.length === 0 && <p className="text-gray-400 text-center py-8">No pending orders</p>}
            </div>
          </div>

          {/* Dispatched Column */}
          <div className="bg-gray-50 rounded-xl p-4">
            <h3 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <span className="w-3 h-3 bg-blue-500 rounded-full"></span>
              In Transit ({dispatchedOrders.length})
            </h3>
            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {dispatchedOrders.map((order) => (
                <div key={order.id} className={`bg-white rounded-lg p-4 border-l-4 ${getStatusColor(order.status)} shadow-sm`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono font-semibold text-blue-600">{order.order_number}</span>
                    <span className="px-2 py-0.5 text-xs rounded bg-blue-100 text-blue-800">{order.status}</span>
                  </div>
                  <div className="text-sm text-gray-600">
                    <div>📦 {order.container_number || 'No container'}</div>
                    <div className="text-xs mt-1">📍 {order.pickup_location}</div>
                    <div className="text-xs">🎯 {order.delivery_location}</div>
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
            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {completedOrders.slice(0, 10).map((order) => (
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

      {/* Enhanced Dispatch Modal */}
      {isDispatchModalOpen && selectedOrder && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => setIsDispatchModalOpen(false)}></div>
          <div className="relative min-h-screen flex items-center justify-center p-4">
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
              {/* Header */}
              <div className="bg-gradient-to-r from-purple-600 to-purple-700 px-6 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-white">Dispatch Order</h2>
                    <p className="text-purple-100">{selectedOrder.order_number} • {selectedOrder.container_number}</p>
                  </div>
                  <button onClick={() => setIsDispatchModalOpen(false)} className="text-white hover:text-purple-200 text-2xl">&times;</button>
                </div>
              </div>

              {/* Mode Toggle */}
              <div className="px-6 py-3 border-b bg-gray-50">
                <div className="flex gap-2">
                  <button
                    onClick={() => setDispatchMode('simple')}
                    className={`px-4 py-2 rounded-lg font-medium transition ${
                      dispatchMode === 'simple' ? 'bg-purple-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    🚚 Simple Dispatch
                  </button>
                  <button
                    onClick={() => setDispatchMode('advanced')}
                    className={`px-4 py-2 rounded-lg font-medium transition ${
                      dispatchMode === 'advanced' ? 'bg-purple-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    🔧 Multi-Leg / Advanced
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="p-6 overflow-y-auto max-h-[60vh]">
                {/* Order Summary */}
                <div className="bg-gray-50 rounded-lg p-4 mb-6">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div><strong>Type:</strong> {selectedOrder.type}</div>
                    <div><strong>Container:</strong> {selectedOrder.container_number || '-'}</div>
                    <div><strong>Pickup:</strong> {selectedOrder.pickup_location}</div>
                    <div><strong>Delivery:</strong> {selectedOrder.delivery_location}</div>
                  </div>
                </div>

                {dispatchMode === 'simple' ? (
                  /* Simple Dispatch Form */
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Driver *</label>
                      <select 
                        value={simpleForm.driver_id} 
                        onChange={e => setSimpleForm({...simpleForm, driver_id: e.target.value})} 
                        className="w-full px-4 py-2 border rounded-lg"
                      >
                        <option value="">Select Driver</option>
                        {availableDrivers.map(d => (
                          <option key={d.id} value={d.id}>
                            {d.first_name} {d.last_name} {d.hazmat_endorsement && '☣️'}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Tractor *</label>
                      <select 
                        value={simpleForm.tractor_id} 
                        onChange={e => setSimpleForm({...simpleForm, tractor_id: e.target.value})} 
                        className="w-full px-4 py-2 border rounded-lg"
                      >
                        <option value="">Select Tractor</option>
                        {availableTractors.map(t => (
                          <option key={t.id} value={t.id}>{t.unit_number} - {t.make} {t.model}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Chassis</label>
                      <select 
                        value={simpleForm.chassis_id} 
                        onChange={e => setSimpleForm({...simpleForm, chassis_id: e.target.value})} 
                        className="w-full px-4 py-2 border rounded-lg"
                      >
                        <option value="">Select Chassis (Optional)</option>
                        {availableChassis.map(c => (
                          <option key={c.id} value={c.id}>{c.chassis_number} - {c.pool} {c.size}'</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Planned Start</label>
                      <input 
                        type="datetime-local" 
                        value={simpleForm.planned_start} 
                        onChange={e => setSimpleForm({...simpleForm, planned_start: e.target.value})} 
                        className="w-full px-4 py-2 border rounded-lg" 
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Notes</label>
                      <textarea 
                        value={simpleForm.notes} 
                        onChange={e => setSimpleForm({...simpleForm, notes: e.target.value})} 
                        rows={2} 
                        className="w-full px-4 py-2 border rounded-lg" 
                      />
                    </div>
                  </div>
                ) : (
                  /* Advanced Multi-Leg Form */
                  <div className="space-y-6">
                    {/* Templates */}
                    <div>
                      <label className="block text-sm font-medium mb-2">Quick Templates</label>
                      <div className="grid grid-cols-2 gap-2">
                        {TRIP_TEMPLATES.map((template, idx) => (
                          <button
                            key={idx}
                            onClick={() => applyTemplate(template)}
                            className="p-3 border rounded-lg text-left hover:bg-purple-50 hover:border-purple-300 transition"
                          >
                            <div className="font-medium text-sm">{template.name}</div>
                            <div className="text-xs text-gray-500">{template.description}</div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Trip Settings */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Priority</label>
                        <select 
                          value={advancedForm.priority} 
                          onChange={e => setAdvancedForm({...advancedForm, priority: e.target.value})}
                          className="w-full px-4 py-2 border rounded-lg"
                        >
                          <option value="LOW">Low</option>
                          <option value="NORMAL">Normal</option>
                          <option value="HIGH">High</option>
                          <option value="URGENT">Urgent</option>
                        </select>
                      </div>
                      <div className="flex items-center pt-6">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={advancedForm.is_team_driver}
                            onChange={e => setAdvancedForm({...advancedForm, is_team_driver: e.target.checked})}
                            className="w-4 h-4"
                          />
                          <span>👥 Team Drivers</span>
                        </label>
                      </div>
                    </div>

                    {/* Legs */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <label className="text-sm font-medium">Trip Legs ({legs.length})</label>
                        <button
                          onClick={addLeg}
                          className="px-3 py-1 text-sm bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200"
                        >
                          + Add Leg
                        </button>
                      </div>
                      <div className="space-y-4">
                        {legs.map((leg, index) => (
                          <div key={index} className="border rounded-lg p-4 bg-gray-50">
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <span className="w-6 h-6 bg-purple-600 text-white rounded-full flex items-center justify-center text-sm font-bold">
                                  {index + 1}
                                </span>
                                <span className="font-medium">Leg {index + 1}</span>
                              </div>
                              {legs.length > 1 && (
                                <button
                                  onClick={() => removeLeg(index)}
                                  className="text-red-500 hover:text-red-700 text-sm"
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="block text-xs font-medium mb-1">Leg Type</label>
                                <select
                                  value={leg.leg_type}
                                  onChange={e => updateLeg(index, 'leg_type', e.target.value)}
                                  className="w-full px-3 py-2 border rounded-lg text-sm"
                                >
                                  {LEG_TYPES.map(lt => (
                                    <option key={lt.value} value={lt.value}>{lt.icon} {lt.label}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs font-medium mb-1">Driver</label>
                                <select
                                  value={leg.driver_id}
                                  onChange={e => updateLeg(index, 'driver_id', e.target.value)}
                                  className="w-full px-3 py-2 border rounded-lg text-sm"
                                >
                                  <option value="">Select Driver</option>
                                  {availableDrivers.map(d => (
                                    <option key={d.id} value={d.id}>{d.first_name} {d.last_name}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs font-medium mb-1">From</label>
                                <input
                                  value={leg.pickup_location}
                                  onChange={e => updateLeg(index, 'pickup_location', e.target.value)}
                                  className="w-full px-3 py-2 border rounded-lg text-sm"
                                  placeholder="Pickup location"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium mb-1">To</label>
                                <input
                                  value={leg.delivery_location}
                                  onChange={e => updateLeg(index, 'delivery_location', e.target.value)}
                                  className="w-full px-3 py-2 border rounded-lg text-sm"
                                  placeholder="Delivery location"
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Notes */}
                    <div>
                      <label className="block text-sm font-medium mb-1">Dispatch Notes</label>
                      <textarea
                        value={advancedForm.dispatch_notes}
                        onChange={e => setAdvancedForm({...advancedForm, dispatch_notes: e.target.value})}
                        rows={2}
                        className="w-full px-4 py-2 border rounded-lg"
                        placeholder="Special instructions for this dispatch..."
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-6 py-4 bg-gray-50 border-t flex justify-between">
                <button 
                  onClick={() => setIsDispatchModalOpen(false)} 
                  className="px-6 py-2 border rounded-lg hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button 
                  onClick={dispatchMode === 'simple' ? handleSimpleDispatch : handleAdvancedDispatch} 
                  className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                >
                  {dispatchMode === 'simple' ? '🚚 Dispatch' : `🚚 Create ${legs.length}-Leg Trip`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}