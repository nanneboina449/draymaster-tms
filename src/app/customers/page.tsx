'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

interface Customer {
  id: string;
  name: string;
  code: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  billing_email: string;
  payment_terms: number;
  credit_limit: number;
  is_active: boolean;
  created_at: string;
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [formData, setFormData] = useState({
    name: '', code: '', address: '', city: '', state: '', zip: '',
    contact_name: '', contact_phone: '', contact_email: '', billing_email: '',
    payment_terms: '30', credit_limit: '', is_active: true
  });

  useEffect(() => { fetchCustomers(); }, []);

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.from('customers').select('*').order('name');
      if (error) throw error;
      setCustomers(data || []);
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    try {
      const payload = {
        ...formData,
        payment_terms: parseInt(formData.payment_terms) || 30,
        credit_limit: parseFloat(formData.credit_limit) || null,
      };

      if (editingCustomer) {
        const { error } = await supabase.from('customers').update(payload).eq('id', editingCustomer.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('customers').insert(payload);
        if (error) throw error;
      }
      await fetchCustomers();
      closeModal();
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this customer?')) return;
    try {
      const { error } = await supabase.from('customers').delete().eq('id', id);
      if (error) throw error;
      await fetchCustomers();
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const toggleActive = async (customer: Customer) => {
    try {
      const { error } = await supabase.from('customers').update({ is_active: !customer.is_active }).eq('id', customer.id);
      if (error) throw error;
      await fetchCustomers();
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const openModal = (customer?: Customer) => {
    if (customer) {
      setEditingCustomer(customer);
      setFormData({
        name: customer.name, code: customer.code || '', address: customer.address || '',
        city: customer.city || '', state: customer.state || '', zip: customer.zip || '',
        contact_name: customer.contact_name || '', contact_phone: customer.contact_phone || '',
        contact_email: customer.contact_email || '', billing_email: customer.billing_email || '',
        payment_terms: String(customer.payment_terms || 30), credit_limit: String(customer.credit_limit || ''),
        is_active: customer.is_active
      });
    } else {
      setEditingCustomer(null);
      setFormData({
        name: '', code: '', address: '', city: '', state: '', zip: '',
        contact_name: '', contact_phone: '', contact_email: '', billing_email: '',
        payment_terms: '30', credit_limit: '', is_active: true
      });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => { setIsModalOpen(false); setEditingCustomer(null); };

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.city?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const stats = {
    total: customers.length,
    active: customers.filter(c => c.is_active).length,
    inactive: customers.filter(c => !c.is_active).length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Customers</h1>
          <p className="text-gray-500 mt-1">Manage your customer base</p>
        </div>
        <button onClick={() => openModal()} className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 font-medium">
          <span className="text-xl">+</span> Add Customer
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow p-4"><p className="text-sm text-gray-500">Total Customers</p><p className="text-2xl font-bold">{stats.total}</p></div>
        <div className="bg-white rounded-xl shadow p-4"><p className="text-sm text-gray-500">Active</p><p className="text-2xl font-bold text-green-600">{stats.active}</p></div>
        <div className="bg-white rounded-xl shadow p-4"><p className="text-sm text-gray-500">Inactive</p><p className="text-2xl font-bold text-gray-600">{stats.inactive}</p></div>
      </div>

      <div className="bg-white rounded-xl shadow p-4">
        <input
          type="text"
          placeholder="Search customers..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-4 py-2 border rounded-lg"
        />
      </div>

      {loading ? (
        <div className="bg-white rounded-xl shadow p-12 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Location</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contact</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Terms</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredCustomers.map((customer) => (
                <tr key={customer.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">{customer.name}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 bg-gray-100 rounded font-mono text-sm">{customer.code || '-'}</span>
                  </td>
                  <td className="px-6 py-4 text-gray-500">
                    {customer.city}, {customer.state}
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm">{customer.contact_name || '-'}</div>
                    <div className="text-xs text-gray-500">{customer.contact_phone}</div>
                  </td>
                  <td className="px-6 py-4 text-gray-500">Net {customer.payment_terms || 30}</td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => toggleActive(customer)}
                      className={`px-2 py-1 text-xs rounded-full ${customer.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}
                    >
                      {customer.is_active ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <button onClick={() => openModal(customer)} className="text-blue-600 hover:text-blue-800 mr-2">Edit</button>
                    <button onClick={() => handleDelete(customer.id)} className="text-red-600 hover:text-red-800">Delete</button>
                  </td>
                </tr>
              ))}
              {filteredCustomers.length === 0 && (
                <tr><td colSpan={7} className="px-6 py-12 text-center text-gray-500">No customers found</td></tr>
              )}
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
                <h2 className="text-xl font-bold text-white">{editingCustomer ? 'Edit Customer' : 'Add Customer'}</h2>
              </div>
              <div className="p-6 max-h-[60vh] overflow-y-auto space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 md:col-span-1">
                    <label className="block text-sm font-medium mb-1">Company Name *</label>
                    <input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full px-4 py-2 border rounded-lg" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Customer Code</label>
                    <input value={formData.code} onChange={e => setFormData({...formData, code: e.target.value.toUpperCase()})} className="w-full px-4 py-2 border rounded-lg font-mono" maxLength={10} placeholder="ABC" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Address</label>
                  <input value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} className="w-full px-4 py-2 border rounded-lg" />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">City</label>
                    <input value={formData.city} onChange={e => setFormData({...formData, city: e.target.value})} className="w-full px-4 py-2 border rounded-lg" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">State</label>
                    <input value={formData.state} onChange={e => setFormData({...formData, state: e.target.value})} className="w-full px-4 py-2 border rounded-lg" maxLength={2} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">ZIP</label>
                    <input value={formData.zip} onChange={e => setFormData({...formData, zip: e.target.value})} className="w-full px-4 py-2 border rounded-lg" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Contact Name</label>
                    <input value={formData.contact_name} onChange={e => setFormData({...formData, contact_name: e.target.value})} className="w-full px-4 py-2 border rounded-lg" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Contact Phone</label>
                    <input value={formData.contact_phone} onChange={e => setFormData({...formData, contact_phone: e.target.value})} className="w-full px-4 py-2 border rounded-lg" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Contact Email</label>
                    <input type="email" value={formData.contact_email} onChange={e => setFormData({...formData, contact_email: e.target.value})} className="w-full px-4 py-2 border rounded-lg" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Billing Email</label>
                    <input type="email" value={formData.billing_email} onChange={e => setFormData({...formData, billing_email: e.target.value})} className="w-full px-4 py-2 border rounded-lg" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Payment Terms (Days)</label>
                    <select value={formData.payment_terms} onChange={e => setFormData({...formData, payment_terms: e.target.value})} className="w-full px-4 py-2 border rounded-lg">
                      <option value="15">Net 15</option>
                      <option value="30">Net 30</option>
                      <option value="45">Net 45</option>
                      <option value="60">Net 60</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Credit Limit ($)</label>
                    <input type="number" value={formData.credit_limit} onChange={e => setFormData({...formData, credit_limit: e.target.value})} className="w-full px-4 py-2 border rounded-lg" placeholder="10000" />
                  </div>
                </div>
              </div>
              <div className="px-6 py-4 bg-gray-50 border-t rounded-b-2xl flex justify-between">
                <button onClick={closeModal} className="px-6 py-2 border rounded-lg hover:bg-gray-100">Cancel</button>
                <button onClick={handleSubmit} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                  {editingCustomer ? 'Save Changes' : 'Add Customer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}