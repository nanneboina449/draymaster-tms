'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface Tractor {
  id: string;
  unit_number: string;
  make: string;
  model: string;
  year: number;
  license_plate: string;
  license_state: string;
  status: string;
  current_driver_id?: string;
  driver_name?: string;
}

interface ChassisEquipment {
  id: string;
  chassis_number: string;
  pool: string;
  owner: string;
  chassis_type: string;
  size_compatibility: string;
  weight_capacity_lbs: number;
  condition: string;
  last_inspection_date: string;
  next_inspection_due: string;
  current_location_type: string;
  current_location_name: string;
  current_container_id: string;
  current_container_number?: string;
  assigned_driver_id: string;
  assigned_driver_name?: string;
  status: string;
  is_rental: boolean;
  rental_rate_per_day: number;
}

export default function EquipmentPage() {
  const [activeTab, setActiveTab] = useState<'tractors' | 'chassis' | 'maintenance'>('tractors');
  const [tractors, setTractors] = useState<Tractor[]>([]);
  const [chassisList, setChassisList] = useState<ChassisEquipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('ALL');

  // Modal states
  const [isTractorModalOpen, setIsTractorModalOpen] = useState(false);
  const [isChassisModalOpen, setIsChassisModalOpen] = useState(false);
  const [editingTractor, setEditingTractor] = useState<Tractor | null>(null);
  const [editingChassis, setEditingChassis] = useState<ChassisEquipment | null>(null);

  const [tractorForm, setTractorForm] = useState({
    unit_number: '', make: '', model: '', year: '', license_plate: '', license_state: 'CA', status: 'AVAILABLE'
  });

  const [chassisForm, setChassisForm] = useState({
    chassis_number: '',
    pool: 'DCLI',
    owner: '',
    chassis_type: 'STANDARD',
    size_compatibility: '40FT',
    weight_capacity_lbs: 44000,
    condition: 'GOOD',
    last_inspection_date: '',
    next_inspection_due: '',
    status: 'AVAILABLE',
    is_rental: false,
    rental_rate_per_day: 25,
  });

  const [drivers, setDrivers] = useState<any[]>([]);

  useEffect(() => {
    fetchData();
  }, [filterStatus]);

  const fetchData = async () => {
    try {
      setLoading(true);

      // Fetch tractors
      let tractorQuery = supabase
        .from('tractors')
        .select('*, driver:drivers!current_driver_id(first_name, last_name)')
        .order('unit_number');

      if (filterStatus !== 'ALL') {
        tractorQuery = tractorQuery.eq('status', filterStatus);
      }

      const { data: tractorData } = await tractorQuery;
      setTractors((tractorData || []).map((t: any) => ({
        ...t,
        driver_name: t.driver ? `${t.driver.first_name} ${t.driver.last_name}` : null,
      })));

      // Fetch chassis from new table if exists, fallback to old table
      let chassisData: any[] = [];
      const { data: newChassisData, error: newChassisError } = await supabase
        .from('chassis_inventory')
        .select(`
          *,
          container:containers!current_container_id(container_number),
          driver:drivers!assigned_driver_id(first_name, last_name)
        `)
        .order('chassis_number');

      if (!newChassisError && newChassisData) {
        chassisData = newChassisData.map((c: any) => ({
          ...c,
          current_container_number: c.container?.container_number,
          assigned_driver_name: c.driver ? `${c.driver.first_name} ${c.driver.last_name}` : null,
        }));
      } else {
        // Fallback to old chassis table
        const { data: oldChassisData } = await supabase
          .from('chassis')
          .select('*')
          .order('chassis_number');
        chassisData = (oldChassisData || []).map((c: any) => ({
          id: c.id,
          chassis_number: c.chassis_number,
          pool: c.pool || 'DCLI',
          chassis_type: c.type || 'STANDARD',
          size_compatibility: c.size ? `${c.size}FT` : '40FT',
          condition: 'GOOD',
          status: c.status || 'AVAILABLE',
          current_location_name: c.current_location,
        }));
      }

      setChassisList(chassisData);

      // Fetch drivers
      const { data: driversData } = await supabase
        .from('drivers')
        .select('id, first_name, last_name')
        .eq('status', 'ACTIVE');
      setDrivers(driversData || []);

    } catch (err: any) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Tractor functions
  const openTractorModal = (tractor?: Tractor) => {
    if (tractor) {
      setEditingTractor(tractor);
      setTractorForm({
        unit_number: tractor.unit_number,
        make: tractor.make || '',
        model: tractor.model || '',
        year: tractor.year?.toString() || '',
        license_plate: tractor.license_plate || '',
        license_state: tractor.license_state || 'CA',
        status: tractor.status,
      });
    } else {
      setEditingTractor(null);
      setTractorForm({
        unit_number: '', make: '', model: '', year: '', license_plate: '', license_state: 'CA', status: 'AVAILABLE'
      });
    }
    setIsTractorModalOpen(true);
  };

  const saveTractor = async () => {
    try {
      const data = {
        ...tractorForm,
        year: tractorForm.year ? parseInt(tractorForm.year) : null,
      };
      if (editingTractor) {
        await supabase.from('tractors').update(data).eq('id', editingTractor.id);
      } else {
        await supabase.from('tractors').insert(data);
      }
      setIsTractorModalOpen(false);
      fetchData();
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const deleteTractor = async (id: string) => {
    if (!confirm('Delete this tractor?')) return;
    await supabase.from('tractors').delete().eq('id', id);
    fetchData();
  };

  // Chassis functions
  const openChassisModal = (chassis?: ChassisEquipment) => {
    if (chassis) {
      setEditingChassis(chassis);
      setChassisForm({
        chassis_number: chassis.chassis_number,
        pool: chassis.pool || 'DCLI',
        owner: chassis.owner || '',
        chassis_type: chassis.chassis_type || 'STANDARD',
        size_compatibility: chassis.size_compatibility || '40FT',
        weight_capacity_lbs: chassis.weight_capacity_lbs || 44000,
        condition: chassis.condition || 'GOOD',
        last_inspection_date: chassis.last_inspection_date || '',
        next_inspection_due: chassis.next_inspection_due || '',
        status: chassis.status || 'AVAILABLE',
        is_rental: chassis.is_rental || false,
        rental_rate_per_day: chassis.rental_rate_per_day || 25,
      });
    } else {
      setEditingChassis(null);
      setChassisForm({
        chassis_number: '',
        pool: 'DCLI',
        owner: '',
        chassis_type: 'STANDARD',
        size_compatibility: '40FT',
        weight_capacity_lbs: 44000,
        condition: 'GOOD',
        last_inspection_date: '',
        next_inspection_due: '',
        status: 'AVAILABLE',
        is_rental: false,
        rental_rate_per_day: 25,
      });
    }
    setIsChassisModalOpen(true);
  };

  const saveChassis = async () => {
    try {
      // Try new table first
      if (editingChassis) {
        const { error } = await supabase.from('chassis_inventory').update({
          ...chassisForm,
          updated_at: new Date().toISOString(),
        }).eq('id', editingChassis.id);
        if (error) {
          // Fallback to old table
          await supabase.from('chassis').update({
            chassis_number: chassisForm.chassis_number,
            pool: chassisForm.pool,
            type: chassisForm.chassis_type,
            size: chassisForm.size_compatibility.replace('FT', ''),
            status: chassisForm.status,
          }).eq('id', editingChassis.id);
        }
      } else {
        const { error } = await supabase.from('chassis_inventory').insert(chassisForm);
        if (error) {
          // Fallback to old table
          await supabase.from('chassis').insert({
            chassis_number: chassisForm.chassis_number,
            pool: chassisForm.pool,
            type: chassisForm.chassis_type,
            size: chassisForm.size_compatibility.replace('FT', ''),
            status: chassisForm.status,
          });
        }
      }
      setIsChassisModalOpen(false);
      fetchData();
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const deleteChassis = async (id: string) => {
    if (!confirm('Delete this chassis?')) return;
    await supabase.from('chassis_inventory').delete().eq('id', id);
    await supabase.from('chassis').delete().eq('id', id);
    fetchData();
  };

  const assignDriverToChassis = async (chassisId: string, driverId: string | null) => {
    await supabase.from('chassis_inventory').update({
      assigned_driver_id: driverId,
      assigned_at: driverId ? new Date().toISOString() : null,
      status: driverId ? 'IN_USE' : 'AVAILABLE',
      updated_at: new Date().toISOString(),
    }).eq('id', chassisId);
    fetchData();
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      'AVAILABLE': 'bg-green-100 text-green-800',
      'IN_USE': 'bg-blue-100 text-blue-800',
      'ACTIVE': 'bg-green-100 text-green-800',
      'RESERVED': 'bg-yellow-100 text-yellow-800',
      'MAINTENANCE': 'bg-orange-100 text-orange-800',
      'OUT_OF_SERVICE': 'bg-red-100 text-red-800',
    };
    return styles[status] || 'bg-gray-100 text-gray-800';
  };

  const getConditionBadge = (condition: string) => {
    const styles: Record<string, string> = {
      'GOOD': 'bg-green-100 text-green-800',
      'FAIR': 'bg-yellow-100 text-yellow-800',
      'NEEDS_REPAIR': 'bg-orange-100 text-orange-800',
      'OUT_OF_SERVICE': 'bg-red-100 text-red-800',
    };
    return styles[condition] || 'bg-gray-100 text-gray-800';
  };

  // Stats
  const tractorStats = {
    total: tractors.length,
    available: tractors.filter(t => t.status === 'AVAILABLE').length,
    inUse: tractors.filter(t => t.status === 'IN_USE' || t.status === 'ACTIVE').length,
    maintenance: tractors.filter(t => t.status === 'MAINTENANCE').length,
  };

  const chassisStats = {
    total: chassisList.length,
    available: chassisList.filter(c => c.status === 'AVAILABLE').length,
    inUse: chassisList.filter(c => c.status === 'IN_USE').length,
    maintenance: chassisList.filter(c => c.status === 'MAINTENANCE').length,
    inspectionDue: chassisList.filter(c => c.next_inspection_due && new Date(c.next_inspection_due) <= new Date()).length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Equipment Management</h1>
          <p className="text-gray-500 mt-1">Manage tractors, chassis, and maintenance schedules</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => openTractorModal()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            + Add Tractor
          </button>
          <button
            onClick={() => openChassisModal()}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            + Add Chassis
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-8 gap-4">
        <div className="bg-white rounded-xl shadow p-4 border-l-4 border-blue-500">
          <p className="text-xs text-gray-500">Tractors</p>
          <p className="text-2xl font-bold">{tractorStats.total}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4 border-l-4 border-green-500">
          <p className="text-xs text-gray-500">Available</p>
          <p className="text-2xl font-bold text-green-600">{tractorStats.available}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4 border-l-4 border-blue-400">
          <p className="text-xs text-gray-500">In Use</p>
          <p className="text-2xl font-bold text-blue-600">{tractorStats.inUse}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4 border-l-4 border-orange-500">
          <p className="text-xs text-gray-500">Maint</p>
          <p className="text-2xl font-bold text-orange-600">{tractorStats.maintenance}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4 border-l-4 border-purple-500">
          <p className="text-xs text-gray-500">Chassis</p>
          <p className="text-2xl font-bold">{chassisStats.total}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4 border-l-4 border-green-400">
          <p className="text-xs text-gray-500">Avail</p>
          <p className="text-2xl font-bold text-green-600">{chassisStats.available}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4 border-l-4 border-blue-300">
          <p className="text-xs text-gray-500">In Use</p>
          <p className="text-2xl font-bold text-blue-600">{chassisStats.inUse}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4 border-l-4 border-red-500">
          <p className="text-xs text-gray-500">Insp Due</p>
          <p className="text-2xl font-bold text-red-600">{chassisStats.inspectionDue}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow">
        <div className="border-b px-6">
          <div className="flex gap-4">
            {[
              { id: 'tractors', label: 'Tractors' },
              { id: 'chassis', label: 'Chassis' },
              { id: 'maintenance', label: 'Maintenance' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`py-3 px-4 font-medium border-b-2 transition ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6">
          {/* Tractors Tab */}
          {activeTab === 'tractors' && (
            <>
              <div className="flex gap-4 mb-4">
                <select
                  value={filterStatus}
                  onChange={e => setFilterStatus(e.target.value)}
                  className="px-4 py-2 border rounded-lg"
                >
                  <option value="ALL">All Status</option>
                  <option value="AVAILABLE">Available</option>
                  <option value="ACTIVE">Active/In Use</option>
                  <option value="MAINTENANCE">Maintenance</option>
                  <option value="OUT_OF_SERVICE">Out of Service</option>
                </select>
              </div>

              {loading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Unit #</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Make/Model</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Year</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">License</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Driver</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {tractors.map(tractor => (
                        <tr key={tractor.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-mono font-semibold">{tractor.unit_number}</td>
                          <td className="px-4 py-3">
                            {tractor.make} {tractor.model}
                          </td>
                          <td className="px-4 py-3">{tractor.year || '-'}</td>
                          <td className="px-4 py-3 text-sm">
                            {tractor.license_plate} {tractor.license_state}
                          </td>
                          <td className="px-4 py-3">{tractor.driver_name || '-'}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded-full text-xs ${getStatusBadge(tractor.status)}`}>
                              {tractor.status}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1">
                              <button
                                onClick={() => openTractorModal(tractor)}
                                className="px-2 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => deleteTractor(tractor.id)}
                                className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {tractors.length === 0 && (
                    <div className="text-center py-8 text-gray-500">No tractors found</div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Chassis Tab */}
          {activeTab === 'chassis' && (
            <>
              <div className="flex gap-4 mb-4">
                <select
                  value={filterStatus}
                  onChange={e => setFilterStatus(e.target.value)}
                  className="px-4 py-2 border rounded-lg"
                >
                  <option value="ALL">All Status</option>
                  <option value="AVAILABLE">Available</option>
                  <option value="IN_USE">In Use</option>
                  <option value="MAINTENANCE">Maintenance</option>
                </select>
              </div>

              {loading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Chassis #</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Pool</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Size</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Condition</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Location</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Assigned To</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {chassisList.map(chassis => (
                        <tr key={chassis.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-mono font-semibold">{chassis.chassis_number}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded text-xs ${
                              chassis.pool === 'COMPANY' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                            }`}>
                              {chassis.pool}
                            </span>
                          </td>
                          <td className="px-4 py-3">{chassis.chassis_type}</td>
                          <td className="px-4 py-3">{chassis.size_compatibility}</td>
                          <td className="px-4 py-3">
                            {chassis.condition && (
                              <span className={`px-2 py-1 rounded text-xs ${getConditionBadge(chassis.condition)}`}>
                                {chassis.condition}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {chassis.current_location_name || '-'}
                          </td>
                          <td className="px-4 py-3">
                            {chassis.assigned_driver_name || (
                              <select
                                className="text-sm border rounded px-2 py-1"
                                value=""
                                onChange={e => assignDriverToChassis(chassis.id, e.target.value)}
                              >
                                <option value="">Assign...</option>
                                {drivers.map(d => (
                                  <option key={d.id} value={d.id}>{d.first_name} {d.last_name}</option>
                                ))}
                              </select>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded-full text-xs ${getStatusBadge(chassis.status)}`}>
                              {chassis.status}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1">
                              <button
                                onClick={() => openChassisModal(chassis)}
                                className="px-2 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => deleteChassis(chassis.id)}
                                className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {chassisList.length === 0 && (
                    <div className="text-center py-8 text-gray-500">No chassis found</div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Maintenance Tab */}
          {activeTab === 'maintenance' && (
            <div className="space-y-6">
              <div>
                <h3 className="font-semibold mb-3">Equipment In Maintenance</h3>
                <div className="grid grid-cols-4 gap-4">
                  {[...tractors.filter(t => t.status === 'MAINTENANCE'), ...chassisList.filter(c => c.status === 'MAINTENANCE')].map((item: any) => (
                    <div key={item.id} className="border rounded-lg p-4 bg-orange-50">
                      <div className="font-mono font-bold">{item.unit_number || item.chassis_number}</div>
                      <p className="text-sm text-gray-600">{item.make ? 'Tractor' : 'Chassis'}</p>
                    </div>
                  ))}
                  {tractors.filter(t => t.status === 'MAINTENANCE').length === 0 &&
                   chassisList.filter(c => c.status === 'MAINTENANCE').length === 0 && (
                    <div className="col-span-4 text-center py-4 text-gray-500">
                      No equipment in maintenance
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-3">Inspection Due</h3>
                <div className="grid grid-cols-4 gap-4">
                  {chassisList.filter(c => c.next_inspection_due && new Date(c.next_inspection_due) <= new Date()).map(chassis => (
                    <div key={chassis.id} className="border rounded-lg p-4 bg-red-50">
                      <div className="font-mono font-bold">{chassis.chassis_number}</div>
                      <p className="text-sm text-gray-600">Pool: {chassis.pool}</p>
                      <p className="text-xs text-red-600 mt-1">
                        Due: {new Date(chassis.next_inspection_due).toLocaleDateString()}
                      </p>
                    </div>
                  ))}
                  {chassisList.filter(c => c.next_inspection_due && new Date(c.next_inspection_due) <= new Date()).length === 0 && (
                    <div className="col-span-4 text-center py-4 text-gray-500">
                      No inspections due
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tractor Modal */}
      {isTractorModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => setIsTractorModalOpen(false)}></div>
          <div className="relative min-h-screen flex items-center justify-center p-4">
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg">
              <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 rounded-t-2xl">
                <h2 className="text-xl font-bold text-white">
                  {editingTractor ? 'Edit Tractor' : 'Add Tractor'}
                </h2>
              </div>

              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Unit Number *</label>
                  <input
                    value={tractorForm.unit_number}
                    onChange={e => setTractorForm({ ...tractorForm, unit_number: e.target.value })}
                    className="w-full px-4 py-2 border rounded-lg"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Make</label>
                    <input
                      value={tractorForm.make}
                      onChange={e => setTractorForm({ ...tractorForm, make: e.target.value })}
                      className="w-full px-4 py-2 border rounded-lg"
                      placeholder="Freightliner"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Model</label>
                    <input
                      value={tractorForm.model}
                      onChange={e => setTractorForm({ ...tractorForm, model: e.target.value })}
                      className="w-full px-4 py-2 border rounded-lg"
                      placeholder="Cascadia"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Year</label>
                    <input
                      value={tractorForm.year}
                      onChange={e => setTractorForm({ ...tractorForm, year: e.target.value })}
                      className="w-full px-4 py-2 border rounded-lg"
                      placeholder="2022"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">License Plate</label>
                    <input
                      value={tractorForm.license_plate}
                      onChange={e => setTractorForm({ ...tractorForm, license_plate: e.target.value })}
                      className="w-full px-4 py-2 border rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">State</label>
                    <input
                      value={tractorForm.license_state}
                      onChange={e => setTractorForm({ ...tractorForm, license_state: e.target.value })}
                      className="w-full px-4 py-2 border rounded-lg"
                      maxLength={2}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Status</label>
                  <select
                    value={tractorForm.status}
                    onChange={e => setTractorForm({ ...tractorForm, status: e.target.value })}
                    className="w-full px-4 py-2 border rounded-lg"
                  >
                    <option value="AVAILABLE">Available</option>
                    <option value="ACTIVE">Active/In Use</option>
                    <option value="MAINTENANCE">Maintenance</option>
                    <option value="OUT_OF_SERVICE">Out of Service</option>
                  </select>
                </div>
              </div>

              <div className="px-6 py-4 bg-gray-50 border-t rounded-b-2xl flex justify-between">
                <button onClick={() => setIsTractorModalOpen(false)} className="px-6 py-2 border rounded-lg hover:bg-gray-100">
                  Cancel
                </button>
                <button onClick={saveTractor} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                  {editingTractor ? 'Save Changes' : 'Add Tractor'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Chassis Modal */}
      {isChassisModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => setIsChassisModalOpen(false)}></div>
          <div className="relative min-h-screen flex items-center justify-center p-4">
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg">
              <div className="bg-gradient-to-r from-green-600 to-green-700 px-6 py-4 rounded-t-2xl">
                <h2 className="text-xl font-bold text-white">
                  {editingChassis ? 'Edit Chassis' : 'Add Chassis'}
                </h2>
              </div>

              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Chassis Number *</label>
                  <input
                    value={chassisForm.chassis_number}
                    onChange={e => setChassisForm({ ...chassisForm, chassis_number: e.target.value.toUpperCase() })}
                    className="w-full px-4 py-2 border rounded-lg font-mono"
                    placeholder="DCLI-40-001234"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Pool</label>
                    <select
                      value={chassisForm.pool}
                      onChange={e => setChassisForm({ ...chassisForm, pool: e.target.value })}
                      className="w-full px-4 py-2 border rounded-lg"
                    >
                      <option value="DCLI">DCLI</option>
                      <option value="TRAC">TRAC</option>
                      <option value="FLEXI">Flexi-Van</option>
                      <option value="DIRECT">Direct Chassis</option>
                      <option value="COMPANY">Company Owned</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Type</label>
                    <select
                      value={chassisForm.chassis_type}
                      onChange={e => setChassisForm({ ...chassisForm, chassis_type: e.target.value })}
                      className="w-full px-4 py-2 border rounded-lg"
                    >
                      <option value="STANDARD">Standard</option>
                      <option value="TRIAXLE">Tri-Axle</option>
                      <option value="SLIDER">Slider</option>
                      <option value="EXTENDABLE">Extendable</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Size</label>
                    <select
                      value={chassisForm.size_compatibility}
                      onChange={e => setChassisForm({ ...chassisForm, size_compatibility: e.target.value })}
                      className="w-full px-4 py-2 border rounded-lg"
                    >
                      <option value="20FT">20ft</option>
                      <option value="40FT">40ft</option>
                      <option value="40HC">40ft HC</option>
                      <option value="45FT">45ft</option>
                      <option value="COMBO">Combo</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Condition</label>
                    <select
                      value={chassisForm.condition}
                      onChange={e => setChassisForm({ ...chassisForm, condition: e.target.value })}
                      className="w-full px-4 py-2 border rounded-lg"
                    >
                      <option value="GOOD">Good</option>
                      <option value="FAIR">Fair</option>
                      <option value="NEEDS_REPAIR">Needs Repair</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Last Inspection</label>
                    <input
                      type="date"
                      value={chassisForm.last_inspection_date}
                      onChange={e => setChassisForm({ ...chassisForm, last_inspection_date: e.target.value })}
                      className="w-full px-4 py-2 border rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Next Due</label>
                    <input
                      type="date"
                      value={chassisForm.next_inspection_due}
                      onChange={e => setChassisForm({ ...chassisForm, next_inspection_due: e.target.value })}
                      className="w-full px-4 py-2 border rounded-lg"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Status</label>
                  <select
                    value={chassisForm.status}
                    onChange={e => setChassisForm({ ...chassisForm, status: e.target.value })}
                    className="w-full px-4 py-2 border rounded-lg"
                  >
                    <option value="AVAILABLE">Available</option>
                    <option value="IN_USE">In Use</option>
                    <option value="MAINTENANCE">Maintenance</option>
                    <option value="OUT_OF_SERVICE">Out of Service</option>
                  </select>
                </div>
              </div>

              <div className="px-6 py-4 bg-gray-50 border-t rounded-b-2xl flex justify-between">
                <button onClick={() => setIsChassisModalOpen(false)} className="px-6 py-2 border rounded-lg hover:bg-gray-100">
                  Cancel
                </button>
                <button onClick={saveChassis} className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
                  {editingChassis ? 'Save Changes' : 'Add Chassis'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
