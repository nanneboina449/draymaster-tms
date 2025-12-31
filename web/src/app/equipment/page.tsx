'use client';

import { useState, useEffect } from 'react';
import { getTractors, createTractor, updateTractor, deleteTractor, getAllChassis, createChassis, updateChassis, deleteChassis, Tractor, Chassis } from '../../lib/supabase';

export default function EquipmentPage() {
  const [activeTab, setActiveTab] = useState<'tractors' | 'chassis'>('tractors');
  const [tractors, setTractors] = useState<Tractor[]>([]);
  const [chassisList, setChassisList] = useState<Chassis[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);

  const [tractorForm, setTractorForm] = useState({
    unit_number: '', make: '', model: '', year: '', license_plate: '', license_state: 'CA', status: 'AVAILABLE'
  });

  const [chassisForm, setChassisForm] = useState({
    chassis_number: '', pool: 'DCLI', size: '40', type: 'STANDARD', status: 'AVAILABLE', current_location: ''
  });

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [tractorData, chassisData] = await Promise.all([getTractors(), getAllChassis()]);
      setTractors(tractorData || []);
      setChassisList(chassisData || []);
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTractorSubmit = async () => {
    try {
      if (editingItem) {
        await updateTractor(editingItem.id, { ...tractorForm, year: parseInt(tractorForm.year) || null });
      } else {
        await createTractor({ ...tractorForm, year: parseInt(tractorForm.year) || null });
      }
      await fetchData();
      closeModal();
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const handleChassisSubmit = async () => {
    try {
      if (editingItem) {
        await updateChassis(editingItem.id, chassisForm);
      } else {
        await createChassis(chassisForm);
      }
      await fetchData();
      closeModal();
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const handleDelete = async (type: 'tractor' | 'chassis', id: string) => {
    if (!confirm('Delete this item?')) return;
    try {
      if (type === 'tractor') await deleteTractor(id);
      else await deleteChassis(id);
      await fetchData();
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const openModal = (item?: any) => {
    if (item) {
      setEditingItem(item);
      if (activeTab === 'tractors') {
        setTractorForm({
          unit_number: item.unit_number, make: item.make || '', model: item.model || '',
          year: String(item.year || ''), license_plate: item.license_plate || '',
          license_state: item.license_state || 'CA', status: item.status
        });
      } else {
        setChassisForm({
          chassis_number: item.chassis_number, pool: item.pool, size: item.size,
          type: item.type, status: item.status, current_location: item.current_location || ''
        });
      }
    } else {
      setEditingItem(null);
      setTractorForm({ unit_number: '', make: '', model: '', year: '', license_plate: '', license_state: 'CA', status: 'AVAILABLE' });
      setChassisForm({ chassis_number: '', pool: 'DCLI', size: '40', type: 'STANDARD', status: 'AVAILABLE', current_location: '' });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => { setIsModalOpen(false); setEditingItem(null); };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      'AVAILABLE': 'bg-green-100 text-green-800',
      'IN_USE': 'bg-blue-100 text-blue-800',
      'MAINTENANCE': 'bg-yellow-100 text-yellow-800',
      'OUT_OF_SERVICE': 'bg-red-100 text-red-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const tractorStats = {
    total: tractors.length,
    available: tractors.filter(t => t.status === 'AVAILABLE').length,
    inUse: tractors.filter(t => t.status === 'IN_USE').length,
    maintenance: tractors.filter(t => t.status === 'MAINTENANCE').length,
  };

  const chassisStats = {
    total: chassisList.length,
    available: chassisList.filter(c => c.status === 'AVAILABLE').length,
    inUse: chassisList.filter(c => c.status === 'IN_USE').length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Equipment</h1>
          <p className="text-gray-500 mt-1">Manage tractors and chassis</p>
        </div>
        <button onClick={() => openModal()} className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 font-medium">
          <span className="text-xl">+</span> Add {activeTab === 'tractors' ? 'Tractor' : 'Chassis'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button onClick={() => setActiveTab('tractors')} className={`px-6 py-2 rounded-lg font-medium ${activeTab === 'tractors' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
          🚛 Tractors ({tractors.length})
        </button>
        <button onClick={() => setActiveTab('chassis')} className={`px-6 py-2 rounded-lg font-medium ${activeTab === 'chassis' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
          🔗 Chassis ({chassisList.length})
        </button>
      </div>

      {/* Stats */}
      {activeTab === 'tractors' ? (
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-white rounded-xl shadow p-4"><p className="text-sm text-gray-500">Total</p><p className="text-2xl font-bold">{tractorStats.total}</p></div>
          <div className="bg-white rounded-xl shadow p-4"><p className="text-sm text-gray-500">Available</p><p className="text-2xl font-bold text-green-600">{tractorStats.available}</p></div>
          <div className="bg-white rounded-xl shadow p-4"><p className="text-sm text-gray-500">In Use</p><p className="text-2xl font-bold text-blue-600">{tractorStats.inUse}</p></div>
          <div className="bg-white rounded-xl shadow p-4"><p className="text-sm text-gray-500">Maintenance</p><p className="text-2xl font-bold text-yellow-600">{tractorStats.maintenance}</p></div>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-xl shadow p-4"><p className="text-sm text-gray-500">Total</p><p className="text-2xl font-bold">{chassisStats.total}</p></div>
          <div className="bg-white rounded-xl shadow p-4"><p className="text-sm text-gray-500">Available</p><p className="text-2xl font-bold text-green-600">{chassisStats.available}</p></div>
          <div className="bg-white rounded-xl shadow p-4"><p className="text-sm text-gray-500">In Use</p><p className="text-2xl font-bold text-blue-600">{chassisStats.inUse}</p></div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="bg-white rounded-xl shadow p-12 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        </div>
      ) : activeTab === 'tractors' ? (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Unit #</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Make/Model</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Year</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">License</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {tractors.map((tractor) => (
                <tr key={tractor.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-semibold text-blue-600">{tractor.unit_number}</td>
                  <td className="px-6 py-4">{tractor.make} {tractor.model}</td>
                  <td className="px-6 py-4 text-gray-500">{tractor.year || '-'}</td>
                  <td className="px-6 py-4 text-gray-500">{tractor.license_plate} ({tractor.license_state})</td>
                  <td className="px-6 py-4"><span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(tractor.status)}`}>{tractor.status}</span></td>
                  <td className="px-6 py-4 text-sm">
                    <button onClick={() => openModal(tractor)} className="text-blue-600 hover:text-blue-800 mr-2">Edit</button>
                    <button onClick={() => handleDelete('tractor', tractor.id)} className="text-red-600 hover:text-red-800">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Chassis #</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Pool</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Size</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Location</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {chassisList.map((chassis) => (
                <tr key={chassis.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-mono font-semibold">{chassis.chassis_number}</td>
                  <td className="px-6 py-4"><span className="px-2 py-1 bg-gray-100 rounded text-sm">{chassis.pool}</span></td>
                  <td className="px-6 py-4">{chassis.size}'</td>
                  <td className="px-6 py-4 text-gray-500">{chassis.type}</td>
                  <td className="px-6 py-4 text-gray-500">{chassis.current_location || '-'}</td>
                  <td className="px-6 py-4"><span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(chassis.status)}`}>{chassis.status}</span></td>
                  <td className="px-6 py-4 text-sm">
                    <button onClick={() => openModal(chassis)} className="text-blue-600 hover:text-blue-800 mr-2">Edit</button>
                    <button onClick={() => handleDelete('chassis', chassis.id)} className="text-red-600 hover:text-red-800">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-black bg-opacity-50" onClick={closeModal}></div>
          <div className="relative min-h-screen flex items-center justify-center p-4">
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg">
              <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 rounded-t-2xl">
                <h2 className="text-xl font-bold text-white">
                  {editingItem ? 'Edit' : 'Add'} {activeTab === 'tractors' ? 'Tractor' : 'Chassis'}
                </h2>
              </div>
              <div className="p-6 space-y-4">
                {activeTab === 'tractors' ? (
                  <>
                    <div>
                      <label className="block text-sm font-medium mb-1">Unit Number *</label>
                      <input value={tractorForm.unit_number} onChange={e => setTractorForm({...tractorForm, unit_number: e.target.value})} className="w-full px-4 py-2 border rounded-lg" placeholder="T-106" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Make</label>
                        <input value={tractorForm.make} onChange={e => setTractorForm({...tractorForm, make: e.target.value})} className="w-full px-4 py-2 border rounded-lg" placeholder="Freightliner" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Model</label>
                        <input value={tractorForm.model} onChange={e => setTractorForm({...tractorForm, model: e.target.value})} className="w-full px-4 py-2 border rounded-lg" placeholder="Cascadia" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Year</label>
                        <input type="number" value={tractorForm.year} onChange={e => setTractorForm({...tractorForm, year: e.target.value})} className="w-full px-4 py-2 border rounded-lg" placeholder="2023" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">License Plate</label>
                        <input value={tractorForm.license_plate} onChange={e => setTractorForm({...tractorForm, license_plate: e.target.value})} className="w-full px-4 py-2 border rounded-lg" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">State</label>
                        <input value={tractorForm.license_state} onChange={e => setTractorForm({...tractorForm, license_state: e.target.value})} className="w-full px-4 py-2 border rounded-lg" maxLength={2} />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Status</label>
                      <select value={tractorForm.status} onChange={e => setTractorForm({...tractorForm, status: e.target.value})} className="w-full px-4 py-2 border rounded-lg">
                        <option value="AVAILABLE">Available</option>
                        <option value="IN_USE">In Use</option>
                        <option value="MAINTENANCE">Maintenance</option>
                        <option value="OUT_OF_SERVICE">Out of Service</option>
                      </select>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="block text-sm font-medium mb-1">Chassis Number *</label>
                      <input value={chassisForm.chassis_number} onChange={e => setChassisForm({...chassisForm, chassis_number: e.target.value})} className="w-full px-4 py-2 border rounded-lg" placeholder="DCLI-40-007" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Pool</label>
                        <select value={chassisForm.pool} onChange={e => setChassisForm({...chassisForm, pool: e.target.value})} className="w-full px-4 py-2 border rounded-lg">
                          <option value="DCLI">DCLI</option>
                          <option value="TRAC">TRAC</option>
                          <option value="FLEXI">Flexi-Van</option>
                          <option value="COMPANY">Company</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Size</label>
                        <select value={chassisForm.size} onChange={e => setChassisForm({...chassisForm, size: e.target.value})} className="w-full px-4 py-2 border rounded-lg">
                          <option value="20">20'</option>
                          <option value="40">40'</option>
                          <option value="45">45'</option>
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Type</label>
                        <select value={chassisForm.type} onChange={e => setChassisForm({...chassisForm, type: e.target.value})} className="w-full px-4 py-2 border rounded-lg">
                          <option value="STANDARD">Standard</option>
                          <option value="EXTENDABLE">Extendable</option>
                          <option value="TRI_AXLE">Tri-Axle</option>
                          <option value="GOOSENECK">Gooseneck</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Status</label>
                        <select value={chassisForm.status} onChange={e => setChassisForm({...chassisForm, status: e.target.value})} className="w-full px-4 py-2 border rounded-lg">
                          <option value="AVAILABLE">Available</option>
                          <option value="IN_USE">In Use</option>
                          <option value="MAINTENANCE">Maintenance</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Current Location</label>
                      <input value={chassisForm.current_location} onChange={e => setChassisForm({...chassisForm, current_location: e.target.value})} className="w-full px-4 py-2 border rounded-lg" placeholder="APM Terminals" />
                    </div>
                  </>
                )}
              </div>
              <div className="px-6 py-4 bg-gray-50 border-t rounded-b-2xl flex justify-between">
                <button onClick={closeModal} className="px-6 py-2 border rounded-lg hover:bg-gray-100">Cancel</button>
                <button onClick={activeTab === 'tractors' ? handleTractorSubmit : handleChassisSubmit} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                  {editingItem ? 'Save' : 'Add'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}