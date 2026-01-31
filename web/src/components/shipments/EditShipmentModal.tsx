'use client';

import { useState, useEffect } from 'react';
import { Shipment, Container, updateShipment, addContainer, updateContainer, deleteContainer } from '../../lib/supabase';

interface EditShipmentModalProps {
  isOpen: boolean;
  shipment: Shipment;
  onClose: () => void;
  onSave: () => void;
}

export function EditShipmentModal({ isOpen, shipment, onClose, onSave }: EditShipmentModalProps) {
  if (!isOpen) return null;
  const [activeTab, setActiveTab] = useState<'details' | 'containers'>('details');
  const [loading, setLoading] = useState(false);
  const [containers, setContainers] = useState<Container[]>(shipment.containers || []);
  const [editingContainer, setEditingContainer] = useState<Container | null>(null);
  const [isAddingContainer, setIsAddingContainer] = useState(false);

  const [formData, setFormData] = useState({
    type: shipment.type,
    status: shipment.status,
    customer_name: shipment.customer_name || '',
    steamship_line: shipment.steamship_line || '',
    booking_number: shipment.booking_number || '',
    bill_of_lading: shipment.bill_of_lading || '',
    vessel: shipment.vessel || '',
    voyage: shipment.voyage || '',
    terminal_name: shipment.terminal_name || '',
    last_free_day: shipment.last_free_day || '',
    port_cutoff: shipment.port_cutoff || '',
    trip_type: shipment.trip_type || '',
    special_instructions: shipment.special_instructions || '',
  });

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

  const handleSaveShipment = async () => {
    try {
      setLoading(true);
      await updateShipment(shipment.id, formData);
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

  const startAddContainer = () => {
    setEditingContainer(null);
    resetContainerForm();
    setIsAddingContainer(true);
  };

  const cancelContainerEdit = () => {
    setEditingContainer(null);
    setIsAddingContainer(false);
    resetContainerForm();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black bg-opacity-50" onClick={onClose}></div>
      <div className="relative min-h-screen flex items-center justify-center p-4">
        <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
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
            <div className="flex gap-4">
              <button
                onClick={() => setActiveTab('details')}
                className={`py-3 px-4 font-medium border-b-2 transition ${
                  activeTab === 'details'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                📋 Shipment Details
              </button>
              <button
                onClick={() => setActiveTab('containers')}
                className={`py-3 px-4 font-medium border-b-2 transition ${
                  activeTab === 'containers'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                📦 Containers ({containers.length})
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto max-h-[60vh]">
            {activeTab === 'details' ? (
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
                      <option value="MSC">MSC</option>
                      <option value="MAERSK">Maersk</option>
                      <option value="COSCO">COSCO</option>
                      <option value="CMA-CGM">CMA CGM</option>
                      <option value="EVERGREEN">Evergreen</option>
                      <option value="HAPAG">Hapag-Lloyd</option>
                      <option value="ONE">ONE</option>
                      <option value="YANG MING">Yang Ming</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Terminal</label>
                    <select value={formData.terminal_name} onChange={e => setFormData({...formData, terminal_name: e.target.value})} className="w-full px-4 py-2 border rounded-lg">
                      <option value="">Select Terminal</option>
                      <option value="APM Terminals">APM Terminals</option>
                      <option value="LBCT">LBCT</option>
                      <option value="TraPac">TraPac</option>
                      <option value="Fenix Marine">Fenix Marine</option>
                      <option value="YTI">YTI</option>
                      <option value="PCT">PCT</option>
                      <option value="ITS">ITS</option>
                      <option value="SSA">SSA</option>
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
                  <label className="block text-sm font-medium mb-1">Trip Type</label>
                  <select value={formData.trip_type} onChange={e => setFormData({...formData, trip_type: e.target.value})} className="w-full px-4 py-2 border rounded-lg">
                    <option value="">Select Trip Type</option>
                    <option value="LIVE_UNLOAD">Live Unload</option>
                    <option value="LIVE_LOAD">Live Load</option>
                    <option value="DROP_AND_PICK">Drop & Pick</option>
                    <option value="DROP_AND_HOOK">Drop & Hook</option>
                    <option value="YARD_PULL">Yard Pull</option>
                    <option value="SHUTTLE">Shuttle</option>
                    <option value="TRANSLOAD">Transload</option>
                    <option value="CROSS_DOCK">Cross Dock</option>
                    <option value="STREET_TURN">Street Turn</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Special Instructions</label>
                  <textarea value={formData.special_instructions} onChange={e => setFormData({...formData, special_instructions: e.target.value})} rows={3} className="w-full px-4 py-2 border rounded-lg" />
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Add Container Button */}
                {!isAddingContainer && !editingContainer && (
                  <button
                    onClick={startAddContainer}
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
                        <input
                          type="number"
                          value={containerForm.weight}
                          onChange={e => setContainerForm({...containerForm, weight: e.target.value})}
                          className="w-full px-3 py-2 border rounded-lg"
                          placeholder="40000"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Seal #</label>
                        <input
                          value={containerForm.seal_number}
                          onChange={e => setContainerForm({...containerForm, seal_number: e.target.value})}
                          className="w-full px-3 py-2 border rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Customs Status</label>
                        <select value={containerForm.customs_status} onChange={e => setContainerForm({...containerForm, customs_status: e.target.value})} className="w-full px-3 py-2 border rounded-lg">
                          <option value="PENDING">Pending</option>
                          <option value="HOLD">Hold</option>
                          <option value="EXAM">Exam Required</option>
                          <option value="RELEASED">Released</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={containerForm.is_hazmat}
                          onChange={e => setContainerForm({...containerForm, is_hazmat: e.target.checked})}
                          className="w-4 h-4"
                        />
                        <span>☣️ Hazmat</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={containerForm.is_overweight}
                          onChange={e => setContainerForm({...containerForm, is_overweight: e.target.checked})}
                          className="w-4 h-4"
                        />
                        <span>⚖️ Overweight</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={containerForm.is_reefer}
                          onChange={e => setContainerForm({...containerForm, is_reefer: e.target.checked})}
                          className="w-4 h-4"
                        />
                        <span>❄️ Reefer</span>
                      </label>
                    </div>

                    {containerForm.is_hazmat && (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium mb-1">Hazmat Class</label>
                          <input
                            value={containerForm.hazmat_class}
                            onChange={e => setContainerForm({...containerForm, hazmat_class: e.target.value})}
                            className="w-full px-3 py-2 border rounded-lg"
                            placeholder="3"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1">UN Number</label>
                          <input
                            value={containerForm.hazmat_un}
                            onChange={e => setContainerForm({...containerForm, hazmat_un: e.target.value})}
                            className="w-full px-3 py-2 border rounded-lg"
                            placeholder="UN1234"
                          />
                        </div>
                      </div>
                    )}

                    {containerForm.is_reefer && (
                      <div>
                        <label className="block text-sm font-medium mb-1">Temperature (°F)</label>
                        <input
                          type="number"
                          value={containerForm.reefer_temp}
                          onChange={e => setContainerForm({...containerForm, reefer_temp: e.target.value})}
                          className="w-full px-3 py-2 border rounded-lg"
                          placeholder="35"
                        />
                      </div>
                    )}

                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={cancelContainerEdit}
                        className="px-4 py-2 border rounded-lg hover:bg-gray-100"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={editingContainer ? handleUpdateContainer : handleAddContainer}
                        disabled={!containerForm.container_number || loading}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                      >
                        {loading ? 'Saving...' : editingContainer ? 'Update Container' : 'Add Container'}
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
                            {container.is_hazmat && <span className="text-orange-500" title="Hazmat">☣️</span>}
                            {container.is_reefer && <span className="text-blue-500" title="Reefer">❄️</span>}
                            {container.is_overweight && <span className="text-red-500" title="Overweight">⚖️</span>}
                          </div>
                          <div className="grid grid-cols-3 gap-4 text-sm text-gray-600">
                            <div>Weight: {container.weight_lbs?.toLocaleString() || '-'} lbs</div>
                            <div>Seal: {container.seal_number || '-'}</div>
                            <div>
                              Customs: 
                              <span className={`ml-1 px-1.5 py-0.5 rounded text-xs ${
                                container.customs_status === 'RELEASED' ? 'bg-green-100 text-green-800' :
                                container.customs_status === 'HOLD' ? 'bg-red-100 text-red-800' :
                                container.customs_status === 'EXAM' ? 'bg-orange-100 text-orange-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {container.customs_status}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => startEditContainer(container)}
                            className="px-3 py-1 text-blue-600 hover:bg-blue-50 rounded"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteContainer(container.id)}
                            className="px-3 py-1 text-red-600 hover:bg-red-50 rounded"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {containers.length === 0 && !isAddingContainer && (
                    <div className="text-center py-8 text-gray-500">
                      <div className="text-4xl mb-2">📦</div>
                      <p>No containers yet</p>
                      <p className="text-sm">Click "Add Container" to add one</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-gray-50 border-t flex justify-between">
            <button onClick={onClose} className="px-6 py-2 border rounded-lg hover:bg-gray-100">
              Cancel
            </button>
            {activeTab === 'details' && (
              <button
                onClick={handleSaveShipment}
                disabled={loading}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'Saving...' : 'Save Changes'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default EditShipmentModal;