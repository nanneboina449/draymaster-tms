'use client';

import { useState, useEffect } from 'react';
import { getDrivers, createDriver, updateDriver, deleteDriver, updateDriverStatus, Driver } from '../../lib/supabase';
import { SkeletonTable, SkeletonCard } from '../../components/ui/LoadingState';
import { ErrorAlert, EmptyState, parseError, showToast } from '../../components/ui/ErrorState';

export default function DriversPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
  const [formData, setFormData] = useState({
    first_name: '', last_name: '', phone: '', email: '',
    license_number: '', license_state: 'CA', license_expiry: '',
    twic_expiry: '', hazmat_endorsement: false, status: 'AVAILABLE',
    pay_rate: '', pay_type: 'PER_MILE'
  });

  useEffect(() => { fetchDrivers(); }, []);

  const fetchDrivers = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getDrivers();
      setDrivers(data || []);
    } catch (err: unknown) {
      console.error('Error:', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    try {
      if (editingDriver) {
        await updateDriver(editingDriver.id, formData);
        showToast.success('Driver updated successfully');
      } else {
        await createDriver(formData);
        showToast.success('Driver created successfully');
      }
      await fetchDrivers();
      closeModal();
    } catch (err: any) {
      showToast.error(parseError(err).message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this driver?')) return;
    try {
      await deleteDriver(id);
      showToast.success('Driver deleted successfully');
      await fetchDrivers();
    } catch (err: any) {
      showToast.error(parseError(err).message);
    }
  };

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await updateDriverStatus(id, status);
      showToast.success('Status updated');
      await fetchDrivers();
    } catch (err: any) {
      showToast.error(parseError(err).message);
    }
  };

  const openModal = (driver?: Driver) => {
    if (driver) {
      setEditingDriver(driver);
      setFormData({
        first_name: driver.first_name, last_name: driver.last_name,
        phone: driver.phone || '', email: driver.email || '',
        license_number: driver.license_number || '', license_state: driver.license_state || 'CA',
        license_expiry: driver.license_expiry || '', twic_expiry: driver.twic_expiry || '',
        hazmat_endorsement: driver.hazmat_endorsement, status: driver.status,
        pay_rate: String(driver.pay_rate || ''), pay_type: driver.pay_type || 'PER_MILE'
      });
    } else {
      setEditingDriver(null);
      setFormData({
        first_name: '', last_name: '', phone: '', email: '',
        license_number: '', license_state: 'CA', license_expiry: '',
        twic_expiry: '', hazmat_endorsement: false, status: 'AVAILABLE',
        pay_rate: '', pay_type: 'PER_MILE'
      });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingDriver(null);
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      'AVAILABLE': 'bg-green-100 text-green-800',
      'ON_DUTY': 'bg-blue-100 text-blue-800',
      'DRIVING': 'bg-purple-100 text-purple-800',
      'OFF_DUTY': 'bg-gray-100 text-gray-800',
      'INACTIVE': 'bg-red-100 text-red-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const isExpiringSoon = (date: string) => {
    if (!date) return false;
    const diff = Math.ceil((new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return diff <= 30 && diff >= 0;
  };

  const stats = {
    total: drivers.length,
    available: drivers.filter(d => d.status === 'AVAILABLE').length,
    driving: drivers.filter(d => d.status === 'DRIVING').length,
    offDuty: drivers.filter(d => d.status === 'OFF_DUTY').length,
    hazmat: drivers.filter(d => d.hazmat_endorsement).length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Drivers</h1>
          <p className="text-gray-500 mt-1">Manage your driver fleet</p>
        </div>
        <button onClick={() => openModal()} className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 font-medium">
          <span className="text-xl">+</span> Add Driver
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-white rounded-xl shadow p-4"><p className="text-sm text-gray-500">Total Drivers</p><p className="text-2xl font-bold">{stats.total}</p></div>
          <div className="bg-white rounded-xl shadow p-4"><p className="text-sm text-gray-500">Available</p><p className="text-2xl font-bold text-green-600">{stats.available}</p></div>
          <div className="bg-white rounded-xl shadow p-4"><p className="text-sm text-gray-500">Driving</p><p className="text-2xl font-bold text-purple-600">{stats.driving}</p></div>
          <div className="bg-white rounded-xl shadow p-4"><p className="text-sm text-gray-500">Off Duty</p><p className="text-2xl font-bold text-gray-600">{stats.offDuty}</p></div>
          <div className="bg-white rounded-xl shadow p-4"><p className="text-sm text-gray-500">Hazmat Certified</p><p className="text-2xl font-bold text-orange-600">{stats.hazmat}</p></div>
        </div>
      )}

      {error && (
        <ErrorAlert error={error} onRetry={fetchDrivers} />
      )}

      {loading ? (
        <SkeletonTable rows={5} columns={7} />
      ) : drivers.length === 0 ? (
        <EmptyState
          title="No drivers found"
          description="Get started by adding your first driver"
          action={{ label: "Add Driver", onClick: () => openModal() }}
        />
      ) : (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Driver</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contact</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">License</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">TWIC</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Hazmat</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {drivers.map((driver) => (
                <tr key={driver.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-semibold">
                        {driver.first_name[0]}{driver.last_name[0]}
                      </div>
                      <div>
                        <div className="font-medium">{driver.first_name} {driver.last_name}</div>
                        <div className="text-sm text-gray-500">${driver.pay_rate}/{driver.pay_type === 'PER_MILE' ? 'mi' : 'hr'}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">{driver.phone}</td>
                  <td className="px-6 py-4">
                    <div className="text-sm">{driver.license_number}</div>
                    <div className={`text-xs ${isExpiringSoon(driver.license_expiry || '') ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                      Exp: {driver.license_expiry || '-'} {isExpiringSoon(driver.license_expiry || '') && '⚠️'}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-sm ${isExpiringSoon(driver.twic_expiry || '') ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                      {driver.twic_expiry || '-'} {isExpiringSoon(driver.twic_expiry || '') && '⚠️'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {driver.hazmat_endorsement ? (
                      <span className="px-2 py-1 bg-orange-100 text-orange-800 text-xs rounded-full">☣️ Yes</span>
                    ) : (
                      <span className="text-gray-400 text-sm">No</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <select
                      value={driver.status}
                      onChange={(e) => handleStatusChange(driver.id, e.target.value)}
                      className={`px-2 py-1 text-xs font-medium rounded-full border-0 cursor-pointer ${getStatusColor(driver.status)}`}
                    >
                      <option value="AVAILABLE">AVAILABLE</option>
                      <option value="ON_DUTY">ON DUTY</option>
                      <option value="DRIVING">DRIVING</option>
                      <option value="OFF_DUTY">OFF DUTY</option>
                      <option value="INACTIVE">INACTIVE</option>
                    </select>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <button onClick={() => openModal(driver)} className="text-blue-600 hover:text-blue-800 mr-2">Edit</button>
                    <button onClick={() => handleDelete(driver.id)} className="text-red-600 hover:text-red-800">Delete</button>
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
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl">
              <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 rounded-t-2xl">
                <h2 className="text-xl font-bold text-white">{editingDriver ? 'Edit Driver' : 'Add Driver'}</h2>
              </div>
              <div className="p-6 max-h-[60vh] overflow-y-auto space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">First Name *</label>
                    <input value={formData.first_name} onChange={e => setFormData({...formData, first_name: e.target.value})} className="w-full px-4 py-2 border rounded-lg" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Last Name *</label>
                    <input value={formData.last_name} onChange={e => setFormData({...formData, last_name: e.target.value})} className="w-full px-4 py-2 border rounded-lg" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Phone</label>
                    <input value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full px-4 py-2 border rounded-lg" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Email</label>
                    <input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full px-4 py-2 border rounded-lg" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">License #</label>
                    <input value={formData.license_number} onChange={e => setFormData({...formData, license_number: e.target.value})} className="w-full px-4 py-2 border rounded-lg" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">State</label>
                    <input value={formData.license_state} onChange={e => setFormData({...formData, license_state: e.target.value})} className="w-full px-4 py-2 border rounded-lg" maxLength={2} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">License Expiry</label>
                    <input type="date" value={formData.license_expiry} onChange={e => setFormData({...formData, license_expiry: e.target.value})} className="w-full px-4 py-2 border rounded-lg" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">TWIC Expiry</label>
                    <input type="date" value={formData.twic_expiry} onChange={e => setFormData({...formData, twic_expiry: e.target.value})} className="w-full px-4 py-2 border rounded-lg" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Status</label>
                    <select value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})} className="w-full px-4 py-2 border rounded-lg">
                      <option value="AVAILABLE">Available</option>
                      <option value="ON_DUTY">On Duty</option>
                      <option value="OFF_DUTY">Off Duty</option>
                      <option value="INACTIVE">Inactive</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Pay Rate</label>
                    <input type="number" step="0.01" value={formData.pay_rate} onChange={e => setFormData({...formData, pay_rate: e.target.value})} className="w-full px-4 py-2 border rounded-lg" placeholder="0.55" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Pay Type</label>
                    <select value={formData.pay_type} onChange={e => setFormData({...formData, pay_type: e.target.value})} className="w-full px-4 py-2 border rounded-lg">
                      <option value="PER_MILE">Per Mile</option>
                      <option value="HOURLY">Hourly</option>
                      <option value="PERCENTAGE">Percentage</option>
                    </select>
                  </div>
                  <div className="flex items-center pt-6">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={formData.hazmat_endorsement} onChange={e => setFormData({...formData, hazmat_endorsement: e.target.checked})} className="w-4 h-4" />
                      <span className="text-sm">☣️ Hazmat Endorsed</span>
                    </label>
                  </div>
                </div>
              </div>
              <div className="px-6 py-4 bg-gray-50 border-t rounded-b-2xl flex justify-between">
                <button onClick={closeModal} className="px-6 py-2 border rounded-lg hover:bg-gray-100">Cancel</button>
                <button onClick={handleSubmit} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                  {editingDriver ? 'Save Changes' : 'Add Driver'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}