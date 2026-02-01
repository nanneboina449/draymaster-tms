'use client';

import { useState, useEffect } from 'react';
import { Shipment, Container, updateShipment, addContainer, updateContainer, deleteContainer } from '../../lib/supabase';
import { supabase } from '../../lib/supabase';
import { TRIP_TYPE_INFO, TripType } from '../../types';

interface EditShipmentModalProps {
  isOpen: boolean;
  shipment: Shipment;
  onClose: () => void;
  onSave: () => void;
}

export function EditShipmentModal({ isOpen, shipment, onClose, onSave }: EditShipmentModalProps) {
  const [activeTab, setActiveTab] = useState<'details' | 'containers' | 'location' | 'trip'>('details');
  const [loading, setLoading] = useState(false);
  const [containers, setContainers] = useState<Container[]>(shipment.containers || []);
  const [editingContainer, setEditingContainer] = useState<Container | null>(null);
  const [isAddingContainer, setIsAddingContainer] = useState(false);

  // Shipment details
  const [formData, setFormData] = useState({
    type: shipment.type || 'IMPORT',
    status: shipment.status || 'PENDING',
    customer_name: shipment.customer_name || '',
    steamship_line: shipment.steamship_line || '',
    booking_number: shipment.booking_number || '',
    bill_of_lading: shipment.bill_of_lading || '',
    vessel: shipment.vessel || '',
    voyage: shipment.voyage || '',
    terminal_name: shipment.terminal_name || '',
    last_free_day: shipment.last_free_day || '',
    port_cutoff: shipment.port_cutoff || '',
    special_instructions: shipment.special_instructions || '',
  });

  // Location data
  const [locationData, setLocationData] = useState({
    delivery_address: (shipment as any).delivery_address || '',
    delivery_city: (shipment as any).delivery_city || '',
    delivery_state: (shipment as any).delivery_state || '',
    delivery_zip: (shipment as any).delivery_zip || '',
    delivery_contact_name: '',
    delivery_contact_phone: '',
    appointment_required: false,
    appointment_date: '',
    appointment_time: '',
  });

  // Trip & Chassis data
  const [tripData, setTripData] = useState({
    trip_type: (shipment as any).trip_type || 'LIVE_UNLOAD',
    chassis_required: (shipment as any).chassis_required ?? true,
    chassis_pool: (shipment as any).chassis_pool || 'DCLI',
    chassis_size: (shipment as any).chassis_size || '40',
    empty_return_terminal: (shipment as any).empty_return_terminal || '',
  });

  // Container form
  const [containerForm, setContainerForm] = useState({
    container_number: '',
    size: '40',
    type: 'DRY',
    weight: '',
    seal_number: '',
    is_hazmat: false,
    hazmat_class: '',
    hazmat_un: '',
    is_overweight: false,
    is_reefer: false,
    reefer_temp: '',
    customs_status: 'PENDING',
  });

  // Load order data for appointments
  useEffect(() => {
    if (isOpen && containers.length > 0) {
      loadOrderData();
    }
  }, [isOpen, containers]);

  const loadOrderData = async () => {
    // Get first container's order to populate appointment info
    if (containers[0]?.id) {
      const { data: order } = await supabase
        .from('orders')
        .select('*')
        .eq('container_id', containers[0].id)
        .order('sequence_number', { ascending: true })
        .limit(1)
        .single();

      if (order) {
        // Parse delivery appointment
        if (order.delivery_appointment) {
          const dt = new Date(order.delivery_appointment);
          setLocationData(prev => ({
            ...prev,
            delivery_contact_name: order.delivery_contact_name || '',
            delivery_contact_phone: order.delivery_contact_phone || '',
            appointment_required: order.delivery_appointment_required || false,
            appointment_date: dt.toISOString().split('T')[0],
            appointment_time: dt.toTimeString().slice(0, 5),
          }));
        }
      }
    }
  };

  if (!isOpen) return null;

  const resetContainerForm = () => {
    setContainerForm({
      container_number: '',
      size: '40',
      type: 'DRY',
      weight: '',
      seal_number: '',
      is_hazmat: false,
      hazmat_class: '',
      hazmat_un: '',
      is_overweight: false,
      is_reefer: false,
      reefer_temp: '',
      customs_status: 'PENDING',
    });
  };

  const handleSaveAll = async () => {
    try {
      setLoading(true);

      // Update shipment with all data
      await updateShipment(shipment.id, {
        ...formData,
        ...locationData,
        ...tripData,
      });

      // Update orders with appointment data if we have containers
      if (containers.length > 0 && locationData.appointment_date) {
        const appointmentTimestamp = `${locationData.appointment_date}T${locationData.appointment_time || '08:00'}:00`;

        for (const container of containers) {
          await supabase
            .from('orders')
            .update({
              delivery_address: locationData.delivery_address,
              delivery_city: locationData.delivery_city,
              delivery_state: locationData.delivery_state,
              delivery_zip: locationData.delivery_zip,
              delivery_contact_name: locationData.delivery_contact_name,
              delivery_contact_phone: locationData.delivery_contact_phone,
              delivery_appointment: appointmentTimestamp,
              delivery_appointment_required: locationData.appointment_required,
            })
            .eq('container_id', container.id);
        }
      }

      onSave();
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddContainer = async () => {
    try {
      setLoading(true);
      const newContainer = await addContainer({
        ...containerForm,
        shipment_id: shipment.id,
        weight: parseInt(containerForm.weight) || 0,
        reefer_temp: containerForm.is_reefer ? parseInt(containerForm.reefer_temp) || 0 : null,
      });
      setContainers([...containers, newContainer]);
      resetContainerForm();
      setIsAddingContainer(false);
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateContainer = async () => {
    if (!editingContainer) return;
    try {
      setLoading(true);
      const updated = await updateContainer(editingContainer.id, {
        ...containerForm,
        weight: parseInt(containerForm.weight) || 0,
        reefer_temp: containerForm.is_reefer ? parseInt(containerForm.reefer_temp) || 0 : null,
      });
      setContainers(containers.map(c => c.id === updated.id ? updated : c));
      setEditingContainer(null);
      resetContainerForm();
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteContainer = async (id: string) => {
    if (!confirm('Delete this container?')) return;
    try {
      setLoading(true);
      await deleteContainer(id);
      setContainers(containers.filter(c => c.id !== id));
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const startEditContainer = (container: Container) => {
    setEditingContainer(container);
    setContainerForm({
      container_number: container.container_number || '',
      size: container.size || '40',
      type: container.type || 'DRY',
      weight: String(container.weight_lbs || ''),
      seal_number: container.seal_number || '',
      is_hazmat: container.is_hazmat || false,
      hazmat_class: container.hazmat_class || '',
      hazmat_un: container.un_number || '',
      is_overweight: container.is_overweight || false,
      is_reefer: container.is_reefer || false,
      reefer_temp: String(container.reefer_temp_setpoint || ''),
      customs_status: container.customs_status || 'PENDING',
    });
    setIsAddingContainer(false);
  };

  const tabs = [
    { id: 'details', label: 'Shipment Info', icon: '📋' },
    { id: 'containers', label: `Containers (${containers.length})`, icon: '📦' },
    { id: 'location', label: 'Location', icon: '📍' },
    { id: 'trip', label: 'Trip & Chassis', icon: '🚛' },
  ];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black bg-opacity-50" onClick={onClose}></div>
      <div className="relative min-h-screen flex items-center justify-center p-4">
        <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-5xl max-h-[90vh] overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-white">Edit Shipment</h2>
                <p className="text-blue-100">{shipment.reference_number}</p>
              </div>
              <button onClick={onClose} className="text-white hover:text-blue-200 text-2xl">&times;</button>
            </div>
          </div>

          {/* Tabs */}
          <div className="border-b px-6">
            <div className="flex gap-1">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`py-3 px-4 font-medium border-b-2 transition flex items-center gap-2 ${
                    activeTab === tab.id
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <span>{tab.icon}</span>
                  <span className="text-sm">{tab.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto max-h-[55vh]">
            {/* Tab 1: Shipment Details */}
            {activeTab === 'details' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Type</label>
                    <select value={formData.type} onChange={e => setFormData({...formData, type: e.target.value as 'IMPORT' | 'EXPORT'})} className="w-full px-4 py-2 border rounded-lg">
                      <option value="IMPORT">Import</option>
                      <option value="EXPORT">Export</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Status</label>
                    <select value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})} className="w-full px-4 py-2 border rounded-lg">
                      <option value="PENDING">Pending</option>
                      <option value="CONFIRMED">Confirmed</option>
                      <option value="IN_PROGRESS">In Progress</option>
                      <option value="DELIVERED">Delivered</option>
                      <option value="COMPLETED">Completed</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Customer</label>
                  <input value={formData.customer_name} onChange={e => setFormData({...formData, customer_name: e.target.value})} className="w-full px-4 py-2 border rounded-lg" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Steamship Line</label>
                    <select value={formData.steamship_line} onChange={e => setFormData({...formData, steamship_line: e.target.value})} className="w-full px-4 py-2 border rounded-lg">
                      <option value="">Select SSL</option>
                      <option value="Maersk">Maersk</option>
                      <option value="MSC">MSC</option>
                      <option value="COSCO">COSCO</option>
                      <option value="CMA CGM">CMA CGM</option>
                      <option value="Hapag-Lloyd">Hapag-Lloyd</option>
                      <option value="ONE">ONE</option>
                      <option value="Evergreen">Evergreen</option>
                      <option value="Yang Ming">Yang Ming</option>
                      <option value="HMM">HMM</option>
                      <option value="ZIM">ZIM</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Terminal</label>
                    <select value={formData.terminal_name} onChange={e => setFormData({...formData, terminal_name: e.target.value})} className="w-full px-4 py-2 border rounded-lg">
                      <option value="">Select Terminal</option>
                      <option value="APM Terminals">APM Terminals - Pier 400</option>
                      <option value="LBCT">LBCT - Long Beach</option>
                      <option value="TraPac">TraPac - Terminal Island</option>
                      <option value="PCT">PCT - Pacific Container</option>
                      <option value="Fenix Marine">Fenix Marine Services</option>
                      <option value="YTI">YTI - Yusen Terminals</option>
                      <option value="ITS">ITS - Int'l Transportation</option>
                      <option value="SSA Terminals">SSA Terminals</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Booking #</label>
                    <input value={formData.booking_number} onChange={e => setFormData({...formData, booking_number: e.target.value})} className="w-full px-4 py-2 border rounded-lg" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Bill of Lading</label>
                    <input value={formData.bill_of_lading} onChange={e => setFormData({...formData, bill_of_lading: e.target.value})} className="w-full px-4 py-2 border rounded-lg" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Vessel</label>
                    <input value={formData.vessel} onChange={e => setFormData({...formData, vessel: e.target.value})} className="w-full px-4 py-2 border rounded-lg" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Voyage</label>
                    <input value={formData.voyage} onChange={e => setFormData({...formData, voyage: e.target.value})} className="w-full px-4 py-2 border rounded-lg" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Last Free Day</label>
                    <input type="date" value={formData.last_free_day} onChange={e => setFormData({...formData, last_free_day: e.target.value})} className="w-full px-4 py-2 border rounded-lg" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Port Cutoff</label>
                    <input type="datetime-local" value={formData.port_cutoff} onChange={e => setFormData({...formData, port_cutoff: e.target.value})} className="w-full px-4 py-2 border rounded-lg" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Special Instructions</label>
                  <textarea value={formData.special_instructions} onChange={e => setFormData({...formData, special_instructions: e.target.value})} rows={3} className="w-full px-4 py-2 border rounded-lg" />
                </div>
              </div>
            )}

            {/* Tab 2: Containers */}
            {activeTab === 'containers' && (
              <div className="space-y-4">
                {/* Add Container Button */}
                {!isAddingContainer && !editingContainer && (
                  <button
                    onClick={() => { setIsAddingContainer(true); resetContainerForm(); }}
                    className="w-full py-3 border-2 border-dashed border-blue-300 rounded-lg text-blue-600 hover:bg-blue-50 flex items-center justify-center gap-2"
                  >
                    <span className="text-xl">+</span> Add Container
                  </button>
                )}

                {/* Container Form (Add/Edit) */}
                {(isAddingContainer || editingContainer) && (
                  <div className="bg-gray-50 rounded-xl p-4 space-y-4">
                    <h4 className="font-semibold">{editingContainer ? 'Edit Container' : 'Add Container'}</h4>

                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Container # *</label>
                        <input
                          value={containerForm.container_number}
                          onChange={e => setContainerForm({...containerForm, container_number: e.target.value.toUpperCase()})}
                          className="w-full px-3 py-2 border rounded-lg font-mono"
                          placeholder="MSCU1234567"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Size</label>
                        <select value={containerForm.size} onChange={e => setContainerForm({...containerForm, size: e.target.value})} className="w-full px-3 py-2 border rounded-lg">
                          <option value="20">20'</option>
                          <option value="40">40'</option>
                          <option value="40HC">40' HC</option>
                          <option value="45">45'</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Type</label>
                        <select value={containerForm.type} onChange={e => setContainerForm({...containerForm, type: e.target.value})} className="w-full px-3 py-2 border rounded-lg">
                          <option value="DRY">Dry</option>
                          <option value="HIGH_CUBE">High Cube</option>
                          <option value="REEFER">Reefer</option>
                          <option value="FLAT_RACK">Flat Rack</option>
                          <option value="OPEN_TOP">Open Top</option>
                          <option value="TANK">Tank</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Weight (lbs)</label>
                        <input type="number" value={containerForm.weight} onChange={e => setContainerForm({...containerForm, weight: e.target.value})} className="w-full px-3 py-2 border rounded-lg" placeholder="40000" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Seal #</label>
                        <input value={containerForm.seal_number} onChange={e => setContainerForm({...containerForm, seal_number: e.target.value})} className="w-full px-3 py-2 border rounded-lg" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Customs Status</label>
                        <select value={containerForm.customs_status} onChange={e => setContainerForm({...containerForm, customs_status: e.target.value})} className="w-full px-3 py-2 border rounded-lg">
                          <option value="PENDING">Pending</option>
                          <option value="HOLD">Hold</option>
                          <option value="RELEASED">Released</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={containerForm.is_hazmat} onChange={e => setContainerForm({...containerForm, is_hazmat: e.target.checked})} className="w-4 h-4" />
                        <span>Hazmat</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={containerForm.is_overweight} onChange={e => setContainerForm({...containerForm, is_overweight: e.target.checked})} className="w-4 h-4" />
                        <span>Overweight</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={containerForm.is_reefer} onChange={e => setContainerForm({...containerForm, is_reefer: e.target.checked})} className="w-4 h-4" />
                        <span>Reefer</span>
                      </label>
                    </div>

                    {containerForm.is_hazmat && (
                      <div className="grid grid-cols-2 gap-4 p-3 bg-red-50 rounded-lg">
                        <div>
                          <label className="block text-sm font-medium text-red-700 mb-1">Hazmat Class</label>
                          <input value={containerForm.hazmat_class} onChange={e => setContainerForm({...containerForm, hazmat_class: e.target.value})} className="w-full px-3 py-2 border border-red-300 rounded-lg" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-red-700 mb-1">UN Number</label>
                          <input value={containerForm.hazmat_un} onChange={e => setContainerForm({...containerForm, hazmat_un: e.target.value})} className="w-full px-3 py-2 border border-red-300 rounded-lg" placeholder="UN1234" />
                        </div>
                      </div>
                    )}

                    {containerForm.is_reefer && (
                      <div className="p-3 bg-blue-50 rounded-lg">
                        <label className="block text-sm font-medium text-blue-700 mb-1">Temperature (F)</label>
                        <input type="number" value={containerForm.reefer_temp} onChange={e => setContainerForm({...containerForm, reefer_temp: e.target.value})} className="w-32 px-3 py-2 border border-blue-300 rounded-lg" placeholder="35" />
                      </div>
                    )}

                    <div className="flex gap-2 pt-2">
                      <button onClick={() => { setEditingContainer(null); setIsAddingContainer(false); resetContainerForm(); }} className="px-4 py-2 border rounded-lg hover:bg-gray-100">Cancel</button>
                      <button onClick={editingContainer ? handleUpdateContainer : handleAddContainer} disabled={!containerForm.container_number || loading} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                        {loading ? 'Saving...' : editingContainer ? 'Update' : 'Add'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Container List */}
                <div className="space-y-3">
                  {containers.map((container) => (
                    <div key={container.id} className="bg-white border rounded-lg p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <span className="font-mono font-bold text-lg">{container.container_number}</span>
                            <span className="px-2 py-0.5 bg-gray-100 rounded text-sm">{container.size}'</span>
                            <span className="px-2 py-0.5 bg-gray-100 rounded text-sm">{container.type}</span>
                            {container.is_hazmat && <span title="Hazmat">☣️</span>}
                            {container.is_reefer && <span title="Reefer">❄️</span>}
                            {container.is_overweight && <span title="Overweight">⚖️</span>}
                          </div>
                          <div className="grid grid-cols-3 gap-4 text-sm text-gray-600">
                            <div>Weight: {container.weight_lbs?.toLocaleString() || '-'} lbs</div>
                            <div>Seal: {container.seal_number || '-'}</div>
                            <div>Customs: <span className={`ml-1 px-1.5 py-0.5 rounded text-xs ${container.customs_status === 'RELEASED' ? 'bg-green-100 text-green-800' : container.customs_status === 'HOLD' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'}`}>{container.customs_status}</span></div>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => startEditContainer(container)} className="px-3 py-1 text-blue-600 hover:bg-blue-50 rounded">Edit</button>
                          <button onClick={() => handleDeleteContainer(container.id)} className="px-3 py-1 text-red-600 hover:bg-red-50 rounded">Delete</button>
                        </div>
                      </div>
                    </div>
                  ))}

                  {containers.length === 0 && !isAddingContainer && (
                    <div className="text-center py-8 text-gray-500">
                      <div className="text-4xl mb-2">📦</div>
                      <p>No containers yet</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Tab 3: Location */}
            {activeTab === 'location' && (
              <div className="space-y-6">
                <div className="p-4 border border-gray-200 rounded-xl">
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <span className="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center">📍</span>
                    {formData.type === 'IMPORT' ? 'Delivery Location' : 'Pickup Location'}
                  </h3>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                      <input
                        type="text"
                        value={locationData.delivery_address}
                        onChange={e => setLocationData({...locationData, delivery_address: e.target.value})}
                        placeholder="Street address"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                      <input
                        type="text"
                        value={locationData.delivery_city}
                        onChange={e => setLocationData({...locationData, delivery_city: e.target.value})}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                        <input
                          type="text"
                          value={locationData.delivery_state}
                          onChange={e => setLocationData({...locationData, delivery_state: e.target.value})}
                          maxLength={2}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">ZIP</label>
                        <input
                          type="text"
                          value={locationData.delivery_zip}
                          onChange={e => setLocationData({...locationData, delivery_zip: e.target.value})}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Contact Name</label>
                      <input
                        type="text"
                        value={locationData.delivery_contact_name}
                        onChange={e => setLocationData({...locationData, delivery_contact_name: e.target.value})}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Contact Phone</label>
                      <input
                        type="tel"
                        value={locationData.delivery_contact_phone}
                        onChange={e => setLocationData({...locationData, delivery_contact_phone: e.target.value})}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Appointment Section */}
                <div className="p-4 border border-gray-200 rounded-xl">
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <span className="w-8 h-8 bg-green-100 text-green-600 rounded-full flex items-center justify-center">📅</span>
                    Appointment
                  </h3>

                  <div className="space-y-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={locationData.appointment_required}
                        onChange={e => setLocationData({...locationData, appointment_required: e.target.checked})}
                        className="w-4 h-4 text-blue-600 rounded"
                      />
                      <span className="text-sm font-medium">Appointment Required</span>
                    </label>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Appointment Date</label>
                        <input
                          type="date"
                          value={locationData.appointment_date}
                          onChange={e => setLocationData({...locationData, appointment_date: e.target.value})}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Appointment Time</label>
                        <input
                          type="time"
                          value={locationData.appointment_time}
                          onChange={e => setLocationData({...locationData, appointment_time: e.target.value})}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 4: Trip & Chassis */}
            {activeTab === 'trip' && (
              <div className="space-y-6">
                {/* Trip Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">Trip Type</label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {(Object.keys(TRIP_TYPE_INFO) as TripType[])
                      .filter(type => {
                        if (formData.type === 'IMPORT') {
                          return ['LIVE_UNLOAD', 'DROP_HOOK_SAME', 'DROP_HOOK_DIFF', 'DROP_ONLY', 'PRE_PULL', 'STREET_TURN', 'DUAL_TRANSACTION'].includes(type);
                        } else {
                          return ['LIVE_LOAD', 'DROP_HOOK_SAME', 'DROP_HOOK_DIFF', 'EMPTY_PICKUP', 'STREET_TURN', 'DUAL_TRANSACTION'].includes(type);
                        }
                      })
                      .map((type) => {
                        const info = TRIP_TYPE_INFO[type];
                        return (
                          <button
                            key={type}
                            type="button"
                            onClick={() => setTripData({...tripData, trip_type: type})}
                            className={`p-3 rounded-xl border-2 text-left transition ${
                              tripData.trip_type === type
                                ? 'border-blue-500 bg-blue-50'
                                : 'border-gray-200 hover:border-gray-300'
                            }`}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xl">{info.icon}</span>
                              <span className="font-medium text-sm">{info.label}</span>
                            </div>
                            <p className="text-xs text-gray-500">{info.description}</p>
                          </button>
                        );
                      })}
                  </div>
                </div>

                {/* Chassis Info */}
                <div className="p-4 border border-gray-200 rounded-xl">
                  <h3 className="text-lg font-semibold mb-4">Chassis Information</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="flex items-center gap-2 cursor-pointer mb-3">
                        <input
                          type="checkbox"
                          checked={tripData.chassis_required}
                          onChange={e => setTripData({...tripData, chassis_required: e.target.checked})}
                          className="w-4 h-4 text-blue-600 rounded"
                        />
                        <span className="text-sm font-medium">Chassis Required</span>
                      </label>
                    </div>
                    {tripData.chassis_required && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Chassis Pool</label>
                          <select
                            value={tripData.chassis_pool}
                            onChange={e => setTripData({...tripData, chassis_pool: e.target.value})}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                          >
                            <option value="DCLI">DCLI</option>
                            <option value="TRAC">TRAC</option>
                            <option value="FLEXI">Flexi-Van</option>
                            <option value="COMPANY">Company Owned</option>
                            <option value="OTHER">Other</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Preferred Size</label>
                          <select
                            value={tripData.chassis_size}
                            onChange={e => setTripData({...tripData, chassis_size: e.target.value})}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                          >
                            <option value="20">20'</option>
                            <option value="40">40'</option>
                            <option value="45">45'</option>
                            <option value="COMBO">Combo (Extendable)</option>
                          </select>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Empty Return Terminal (for imports) */}
                {formData.type === 'IMPORT' && (
                  <div className="p-4 bg-orange-50 border border-orange-200 rounded-xl">
                    <label className="block text-sm font-medium text-orange-800 mb-2">
                      Empty Return Terminal
                      <span className="ml-2 text-xs text-orange-600 font-normal">(Where to return empty container)</span>
                    </label>
                    <select
                      value={tripData.empty_return_terminal}
                      onChange={e => setTripData({...tripData, empty_return_terminal: e.target.value})}
                      className="w-full px-4 py-2 border border-orange-300 rounded-lg focus:ring-2 focus:ring-orange-500 bg-white"
                    >
                      <option value="">Same as pickup terminal</option>
                      <option value="APM Terminals">APM Terminals - Pier 400</option>
                      <option value="LBCT">LBCT - Long Beach</option>
                      <option value="TraPac">TraPac - Terminal Island</option>
                      <option value="PCT">PCT - Pacific Container</option>
                      <option value="Fenix Marine">Fenix Marine Services</option>
                      <option value="YTI">YTI - Yusen Terminals</option>
                      <option value="ITS">ITS - Int'l Transportation</option>
                      <option value="SSA Terminals">SSA Terminals</option>
                      <option value="DCLI Yard">DCLI Yard - Carson</option>
                      <option value="TRAC Yard">TRAC Yard - Long Beach</option>
                    </select>
                    <p className="text-xs text-orange-600 mt-1">
                      If different from pickup terminal, select the return location
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-gray-50 border-t flex justify-between">
            <button onClick={onClose} className="px-6 py-2 border rounded-lg hover:bg-gray-100">
              Cancel
            </button>
            <button
              onClick={handleSaveAll}
              disabled={loading}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save All Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default EditShipmentModal;
