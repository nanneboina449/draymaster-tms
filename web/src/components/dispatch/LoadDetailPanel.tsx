'use client';

import { useState, useEffect } from 'react';
import { 
  Load, LoadCharge, LoadNote, LoadActivityLog, Driver, Equipment,
  LoadStatus, MoveType, ChargeType, LOAD_STATUS_LABELS, TERMINAL_LABELS, SHIPPING_LINE_LABELS
} from '@/lib/types';
import { 
  getLoadDetails, updateLoad, updateLoadStatus, addLoadNote, 
  addLoadCharge, autoCalculateCharges, createTrip, generateInvoiceFromLoad,
  getAvailableDrivers, logLoadActivity
} from '@/lib/supabase';
import { supabase } from '@/lib/supabase';

interface LoadDetailPanelProps {
  loadId: string;
  onClose: () => void;
  onUpdate: () => void;
}

type Tab = 'details' | 'routing' | 'charges' | 'notes' | 'activity';

export default function LoadDetailPanel({ loadId, onClose, onUpdate }: LoadDetailPanelProps) {
  const [load, setLoad] = useState<Load | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('details');
  const [availableDrivers, setAvailableDrivers] = useState<Driver[]>([]);
  const [tractors, setTractors] = useState<Equipment[]>([]);
  
  // Form states
  const [newNote, setNewNote] = useState('');
  const [noteVisibleToCustomer, setNoteVisibleToCustomer] = useState(false);
  const [dispatchForm, setDispatchForm] = useState({
    driver_id: '',
    tractor_id: '',
    chassis_number: '',
    chassis_pool: 'DCLI',
    move_type: 'LIVE' as MoveType,
  });
  const [newCharge, setNewCharge] = useState({
    charge_type: 'OTHER' as ChargeType,
    description: '',
    quantity: 1,
    unit_rate: 0,
  });

  useEffect(() => {
    loadData();
    loadResources();
  }, [loadId]);

  const loadData = async () => {
    setLoading(true);
    const data = await getLoadDetails(loadId);
    setLoad(data);
    if (data) {
      setDispatchForm(prev => ({
        ...prev,
        move_type: data.move_type || 'LIVE',
      }));
    }
    setLoading(false);
  };

  const loadResources = async () => {
    const drivers = await getAvailableDrivers();
    setAvailableDrivers(drivers);

    const { data: equipment } = await supabase
      .from('equipment')
      .select('*')
      .eq('equipment_type', 'TRACTOR')
      .eq('status', 'ACTIVE');
    setTractors(equipment || []);
  };

  // Status actions
  const handleStatusChange = async (newStatus: LoadStatus) => {
    const success = await updateLoadStatus(loadId, newStatus, 'Dispatcher');
    if (success) {
      loadData();
      onUpdate();
    }
  };

  // Add note
  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    
    await addLoadNote(loadId, newNote, 'Dispatcher', 'INTERNAL', noteVisibleToCustomer);
    setNewNote('');
    setNoteVisibleToCustomer(false);
    loadData();
  };

  // Add charge
  const handleAddCharge = async () => {
    if (!newCharge.description || newCharge.unit_rate <= 0) return;
    
    await addLoadCharge({
      load_id: loadId,
      charge_type: newCharge.charge_type,
      description: newCharge.description,
      quantity: newCharge.quantity,
      unit_rate: newCharge.unit_rate,
      amount: newCharge.quantity * newCharge.unit_rate,
      billable_to: 'CUSTOMER',
      auto_calculated: false,
    });
    
    setNewCharge({ charge_type: 'OTHER', description: '', quantity: 1, unit_rate: 0 });
    loadData();
  };

  // Auto calculate charges
  const handleAutoCalculate = async () => {
    await autoCalculateCharges(loadId);
    loadData();
  };

  // Dispatch load
  const handleDispatch = async () => {
    if (!dispatchForm.driver_id || !dispatchForm.tractor_id) {
      alert('Please select driver and truck');
      return;
    }

    // Create default legs based on move type
    const legs = [];
    
    // Pickup leg
    legs.push({
      leg_type: 'PICKUP',
      location_type: 'TERMINAL',
      location_name: load?.terminal ? TERMINAL_LABELS[load.terminal] : 'Terminal',
      scheduled_time: load?.terminal_appointment_date 
        ? `${load.terminal_appointment_date}T${load.terminal_appointment_time || '08:00'}:00`
        : undefined,
    });

    // Delivery leg
    legs.push({
      leg_type: 'DELIVERY',
      location_type: 'WAREHOUSE',
      location_name: load?.order?.location_name || 'Customer Location',
      location_address: load?.order?.location_address,
      location_city: load?.order?.location_city,
      location_state: load?.order?.location_state,
      scheduled_time: load?.delivery_appointment_date
        ? `${load.delivery_appointment_date}T${load.delivery_appointment_time || '14:00'}:00`
        : undefined,
    });

    // Return empty leg (unless drop or prepull)
    if (dispatchForm.move_type === 'LIVE') {
      legs.push({
        leg_type: 'RETURN_EMPTY',
        location_type: 'DEPOT',
        location_name: load?.empty_return_location || 'Empty Return Depot',
      });
    }

    const trip = await createTrip(
      loadId,
      dispatchForm.driver_id,
      dispatchForm.tractor_id,
      dispatchForm.chassis_number,
      dispatchForm.chassis_pool,
      dispatchForm.move_type,
      legs
    );

    if (trip) {
      loadData();
      onUpdate();
    }
  };

  // Generate invoice
  const handleGenerateInvoice = async () => {
    const invoiceId = await generateInvoiceFromLoad(loadId);
    if (invoiceId) {
      alert('Invoice generated successfully!');
      loadData();
      onUpdate();
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-y-0 right-0 w-[600px] bg-white shadow-2xl border-l z-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!load) return null;

  const hasHolds = load.hold_customs || load.hold_freight || load.hold_usda || load.hold_tmf || load.hold_other;

  return (
    <div className="fixed inset-y-0 right-0 w-[600px] bg-white shadow-2xl border-l z-50 flex flex-col">
      {/* Header */}
      <div className="bg-gray-900 text-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold font-mono">{load.container_number || load.load_number}</h2>
            <p className="text-gray-400 text-sm">{load.customer?.company_name}</p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-gray-800 rounded-lg transition"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {/* Status bar */}
        <div className="mt-3 flex items-center gap-2">
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${
            load.status === 'COMPLETED' ? 'bg-green-500' :
            load.status === 'DISPATCHED' || load.status === 'IN_TRANSIT' ? 'bg-blue-500' :
            load.status === 'HOLD' ? 'bg-red-500' :
            load.status === 'AVAILABLE' ? 'bg-green-400' :
            'bg-gray-500'
          }`}>
            {LOAD_STATUS_LABELS[load.status] || load.status}
          </span>
          <span className={`px-2 py-1 rounded text-xs ${
            load.move_type === 'LIVE' ? 'bg-blue-600' :
            load.move_type === 'DROP' ? 'bg-purple-600' :
            load.move_type === 'PREPULL' ? 'bg-orange-600' :
            'bg-gray-600'
          }`}>
            {load.move_type}
          </span>
          {load.in_yard && (
            <span className="px-2 py-1 rounded text-xs bg-purple-600">IN YARD</span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b bg-gray-50">
        <div className="flex">
          {(['details', 'routing', 'charges', 'notes', 'activity'] as Tab[]).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 text-sm font-medium capitalize transition ${
                activeTab === tab
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-white'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Details Tab */}
        {activeTab === 'details' && (
          <div className="space-y-6">
            {/* Container Info */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-semibold text-gray-900 mb-3">Container Info</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-gray-500">Container:</span>
                  <span className="ml-2 font-mono">{load.container_number}</span>
                </div>
                <div>
                  <span className="text-gray-500">Size:</span>
                  <span className="ml-2">{load.container_size || '40'}</span>
                </div>
                <div>
                  <span className="text-gray-500">Type:</span>
                  <span className="ml-2">{load.container_type}</span>
                </div>
                <div>
                  <span className="text-gray-500">Weight:</span>
                  <span className="ml-2">{load.weight_lbs?.toLocaleString()} lbs</span>
                </div>
                {load.seal_number && (
                  <div>
                    <span className="text-gray-500">Seal:</span>
                    <span className="ml-2">{load.seal_number}</span>
                  </div>
                )}
                {load.is_hazmat && (
                  <div className="col-span-2">
                    <span className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs">
                      ⚠️ HAZMAT - {load.hazmat_class}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Terminal Status */}
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-900">Terminal Status</h3>
                <button className="text-xs text-blue-600 hover:underline">🔄 Sync eModal</button>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Terminal:</span>
                  <span>{TERMINAL_LABELS[load.terminal || ''] || load.terminal}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Status:</span>
                  <span className={`font-medium ${
                    load.terminal_status === 'AVAILABLE' ? 'text-green-600' :
                    load.terminal_status === 'PICKED_UP' ? 'text-blue-600' :
                    'text-gray-700'
                  }`}>
                    {load.terminal_status}
                  </span>
                </div>
                {load.last_free_day && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Last Free Day:</span>
                    <span className={`font-medium ${
                      new Date(load.last_free_day) <= new Date() ? 'text-red-600' :
                      new Date(load.last_free_day) <= new Date(Date.now() + 2 * 24 * 60 * 60 * 1000) ? 'text-orange-600' :
                      'text-gray-700'
                    }`}>
                      {new Date(load.last_free_day).toLocaleDateString()}
                    </span>
                  </div>
                )}
                {load.empty_return_location && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Empty Return:</span>
                    <span className="text-xs">{load.empty_return_location}</span>
                  </div>
                )}
              </div>
              
              {/* Holds */}
              {hasHolds && (
                <div className="mt-3 p-2 bg-red-50 rounded border border-red-200">
                  <p className="text-xs font-semibold text-red-700 mb-1">⛔ HOLDS DETECTED</p>
                  <div className="flex flex-wrap gap-1">
                    {load.hold_customs && <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs">Customs</span>}
                    {load.hold_freight && <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs">Freight</span>}
                    {load.hold_usda && <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs">USDA</span>}
                    {load.hold_tmf && <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs">TMF</span>}
                  </div>
                </div>
              )}
            </div>

            {/* Appointments */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-semibold text-gray-900 mb-3">Appointments</h3>
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between p-2 bg-white rounded border">
                  <div>
                    <p className="text-xs text-gray-500">Terminal Pickup</p>
                    <p className="font-medium">
                      {load.terminal_appointment_date 
                        ? `${new Date(load.terminal_appointment_date).toLocaleDateString()} ${load.terminal_appointment_time || ''}`
                        : 'Not scheduled'
                      }
                    </p>
                  </div>
                  {load.terminal_appointment_number && (
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                      {load.terminal_appointment_number}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between p-2 bg-white rounded border">
                  <div>
                    <p className="text-xs text-gray-500">Delivery</p>
                    <p className="font-medium">
                      {load.delivery_appointment_date 
                        ? `${new Date(load.delivery_appointment_date).toLocaleDateString()} ${load.delivery_appointment_time || ''}`
                        : 'Not scheduled'
                      }
                    </p>
                  </div>
                </div>
                {load.gate_fee_paid && (
                  <div className="text-xs text-gray-500">
                    Gate Fee: ${load.gate_fee_amount} ({load.gate_fee_paid_by})
                  </div>
                )}
              </div>
            </div>

            {/* Dispatch Form (if not yet dispatched) */}
            {!['DISPATCHED', 'IN_TRANSIT', 'COMPLETED', 'INVOICED'].includes(load.status) && (
              <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                <h3 className="font-semibold text-gray-900 mb-3">🚀 Dispatch</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Driver</label>
                    <select
                      value={dispatchForm.driver_id}
                      onChange={(e) => setDispatchForm(prev => ({ ...prev, driver_id: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-lg text-sm"
                    >
                      <option value="">Select driver...</option>
                      {availableDrivers.map(driver => (
                        <option key={driver.id} value={driver.id}>{driver.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Truck</label>
                    <select
                      value={dispatchForm.tractor_id}
                      onChange={(e) => setDispatchForm(prev => ({ ...prev, tractor_id: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-lg text-sm"
                    >
                      <option value="">Select truck...</option>
                      {tractors.map(truck => (
                        <option key={truck.id} value={truck.id}>{truck.unit_number}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Chassis #</label>
                      <input
                        type="text"
                        value={dispatchForm.chassis_number}
                        onChange={(e) => setDispatchForm(prev => ({ ...prev, chassis_number: e.target.value }))}
                        className="w-full px-3 py-2 border rounded-lg text-sm"
                        placeholder="DCLI-123456"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Pool</label>
                      <select
                        value={dispatchForm.chassis_pool}
                        onChange={(e) => setDispatchForm(prev => ({ ...prev, chassis_pool: e.target.value }))}
                        className="w-full px-3 py-2 border rounded-lg text-sm"
                      >
                        <option value="DCLI">DCLI</option>
                        <option value="TRAC">TRAC</option>
                        <option value="FLEXI">Flexivan</option>
                        <option value="DIRECT">SSL Direct</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Move Type</label>
                    <div className="flex gap-2">
                      {(['LIVE', 'DROP', 'PREPULL'] as MoveType[]).map(type => (
                        <button
                          key={type}
                          onClick={() => setDispatchForm(prev => ({ ...prev, move_type: type }))}
                          className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition ${
                            dispatchForm.move_type === type
                              ? 'bg-blue-600 text-white'
                              : 'bg-white border text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={handleDispatch}
                    disabled={!dispatchForm.driver_id || !dispatchForm.tractor_id}
                    className="w-full py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                  >
                    🚀 Dispatch Load
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Routing Tab */}
        {activeTab === 'routing' && (
          <div className="space-y-4">
            {load.trip?.legs && load.trip.legs.length > 0 ? (
              <div className="space-y-3">
                {load.trip.legs.map((leg, index) => (
                  <div 
                    key={leg.id} 
                    className={`p-4 rounded-lg border-2 ${
                      leg.status === 'COMPLETED' ? 'bg-green-50 border-green-300' :
                      leg.status === 'ARRIVED' ? 'bg-blue-50 border-blue-300' :
                      leg.status === 'EN_ROUTE' ? 'bg-yellow-50 border-yellow-300' :
                      'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-gray-900 text-white text-xs flex items-center justify-center font-bold">
                          {index + 1}
                        </span>
                        <span className="font-medium">{leg.leg_type.replace('_', ' ')}</span>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded ${
                        leg.status === 'COMPLETED' ? 'bg-green-200 text-green-800' :
                        leg.status === 'ARRIVED' ? 'bg-blue-200 text-blue-800' :
                        leg.status === 'EN_ROUTE' ? 'bg-yellow-200 text-yellow-800' :
                        'bg-gray-200 text-gray-800'
                      }`}>
                        {leg.status}
                      </span>
                    </div>
                    <p className="text-sm font-medium">{leg.location_name}</p>
                    {leg.location_address && (
                      <p className="text-xs text-gray-500">{leg.location_address}</p>
                    )}
                    {leg.scheduled_time && (
                      <p className="text-xs text-gray-600 mt-1">
                        Scheduled: {new Date(leg.scheduled_time).toLocaleString()}
                      </p>
                    )}
                    {leg.actual_arrival && (
                      <p className="text-xs text-green-600">
                        Arrived: {new Date(leg.actual_arrival).toLocaleString()}
                      </p>
                    )}
                    {leg.waiting_time_minutes > 0 && (
                      <p className="text-xs text-orange-600">
                        Waiting: {leg.waiting_time_minutes} min
                      </p>
                    )}
                    {leg.pod_captured && (
                      <span className="text-xs text-green-600">✓ POD Captured</span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <p>No routing configured yet.</p>
                <p className="text-sm">Dispatch the load to create routing.</p>
              </div>
            )}
          </div>
        )}

        {/* Charges Tab */}
        {activeTab === 'charges' && (
          <div className="space-y-4">
            {/* Existing charges */}
            {load.charges && load.charges.length > 0 ? (
              <div className="space-y-2">
                {load.charges.map(charge => (
                  <div key={charge.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-medium text-sm">{charge.description}</p>
                      <p className="text-xs text-gray-500">
                        {charge.charge_type} • {charge.auto_calculated ? 'Auto' : 'Manual'}
                      </p>
                    </div>
                    <span className="font-mono font-bold">
                      ${charge.amount.toFixed(2)}
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border-2 border-blue-200">
                  <span className="font-bold">Total Revenue</span>
                  <span className="font-mono font-bold text-lg">
                    ${load.total_charges.toFixed(2)}
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-center py-4 text-gray-500">
                No charges yet
              </div>
            )}

            {/* Auto calculate button */}
            <button
              onClick={handleAutoCalculate}
              className="w-full py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200"
            >
              🔄 Auto Calculate Charges
            </button>

            {/* Add manual charge */}
            <div className="border-t pt-4">
              <h4 className="font-medium text-sm mb-3">Add Charge</h4>
              <div className="space-y-2">
                <select
                  value={newCharge.charge_type}
                  onChange={(e) => setNewCharge(prev => ({ ...prev, charge_type: e.target.value as ChargeType }))}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                >
                  <option value="DETENTION">Detention</option>
                  <option value="WAITING_TIME">Waiting Time</option>
                  <option value="STORAGE">Storage</option>
                  <option value="CHASSIS_SPLIT">Chassis Split</option>
                  <option value="STOP_OFF">Stop Off</option>
                  <option value="OTHER">Other</option>
                </select>
                <input
                  type="text"
                  placeholder="Description"
                  value={newCharge.description}
                  onChange={(e) => setNewCharge(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    placeholder="Qty"
                    value={newCharge.quantity}
                    onChange={(e) => setNewCharge(prev => ({ ...prev, quantity: Number(e.target.value) }))}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                  <input
                    type="number"
                    placeholder="Rate"
                    value={newCharge.unit_rate || ''}
                    onChange={(e) => setNewCharge(prev => ({ ...prev, unit_rate: Number(e.target.value) }))}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
                <button
                  onClick={handleAddCharge}
                  className="w-full py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700"
                >
                  + Add Charge
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Notes Tab */}
        {activeTab === 'notes' && (
          <div className="space-y-4">
            {/* Existing notes */}
            {load.notes && load.notes.length > 0 ? (
              <div className="space-y-2">
                {load.notes.map(note => (
                  <div key={note.id} className={`p-3 rounded-lg ${
                    note.author_type === 'CUSTOMER' ? 'bg-blue-50 border-l-4 border-blue-400' :
                    note.author_type === 'SYSTEM' ? 'bg-gray-50 border-l-4 border-gray-400' :
                    'bg-yellow-50 border-l-4 border-yellow-400'
                  }`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium">
                        {note.author_name}
                        {note.visible_to_customer && (
                          <span className="ml-2 px-1 py-0.5 bg-blue-100 text-blue-600 rounded text-xs">
                            👁️ Customer visible
                          </span>
                        )}
                      </span>
                      <span className="text-xs text-gray-400">
                        {new Date(note.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm">{note.message}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4 text-gray-500">
                No notes yet
              </div>
            )}

            {/* Add note */}
            <div className="border-t pt-4">
              <textarea
                placeholder="Add a note..."
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm resize-none"
                rows={3}
              />
              <div className="flex items-center justify-between mt-2">
                <label className="flex items-center gap-2 text-sm text-gray-600">
                  <input
                    type="checkbox"
                    checked={noteVisibleToCustomer}
                    onChange={(e) => setNoteVisibleToCustomer(e.target.checked)}
                  />
                  Visible to customer
                </label>
                <button
                  onClick={handleAddNote}
                  disabled={!newNote.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:bg-gray-300"
                >
                  Add Note
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Activity Tab */}
        {activeTab === 'activity' && (
          <div className="space-y-2">
            {load.activity_log && load.activity_log.length > 0 ? (
              load.activity_log.map(activity => (
                <div key={activity.id} className="flex gap-3 p-2 hover:bg-gray-50 rounded">
                  <div className="w-2 h-2 rounded-full bg-blue-500 mt-2"></div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{activity.action.replace(/_/g, ' ')}</span>
                      <span className="text-xs text-gray-400">
                        {new Date(activity.created_at).toLocaleString()}
                      </span>
                    </div>
                    {(activity.from_value || activity.to_value) && (
                      <p className="text-xs text-gray-600">
                        {activity.from_value && <span className="text-red-500 line-through">{activity.from_value}</span>}
                        {activity.from_value && activity.to_value && ' → '}
                        {activity.to_value && <span className="text-green-600">{activity.to_value}</span>}
                      </p>
                    )}
                    {activity.details && (
                      <p className="text-xs text-gray-500">{activity.details}</p>
                    )}
                    <p className="text-xs text-gray-400">by {activity.performed_by}</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-4 text-gray-500">
                No activity yet
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="border-t p-4 bg-gray-50">
        <div className="flex gap-2">
          {load.status === 'COMPLETED' && !load.invoice_id && (
            <button
              onClick={handleGenerateInvoice}
              className="flex-1 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700"
            >
              💰 Generate Invoice
            </button>
          )}
          {load.invoice_id && (
            <button
              className="flex-1 py-2 bg-gray-200 text-gray-700 rounded-lg font-medium"
              disabled
            >
              ✓ Invoiced
            </button>
          )}
          {!['COMPLETED', 'INVOICED'].includes(load.status) && (
            <select
              onChange={(e) => e.target.value && handleStatusChange(e.target.value as LoadStatus)}
              className="flex-1 py-2 px-3 border rounded-lg text-sm"
              defaultValue=""
            >
              <option value="" disabled>Change Status...</option>
              {Object.entries(LOAD_STATUS_LABELS).map(([status, label]) => (
                <option key={status} value={status}>{label}</option>
              ))}
            </select>
          )}
        </div>
      </div>
    </div>
  );
}
