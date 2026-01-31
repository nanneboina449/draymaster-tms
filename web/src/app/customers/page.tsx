'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { SkeletonTable, SkeletonCard } from '../../components/ui/LoadingState';
import { ErrorAlert, EmptyState, parseError, showToast } from '../../components/ui/ErrorState';

interface Customer {
  id: string;
  name: string;
  code: string;
  city: string;
  state: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  payment_terms: number;
  is_active: boolean;
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [formData, setFormData] = useState({
    name: '', code: '', city: '', state: '',
    contact_name: '', contact_phone: '', contact_email: '',
    payment_terms: '30', is_active: true
  });

  useEffect(() => { fetchCustomers(); }, []);

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      setError(null);
      const { data, error } = await supabase.from('customers').select('*').order('name');
      if (error) throw error;
      setCustomers(data || []);
    } catch (err: unknown) {
      console.error('Error:', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    try {
      const payload = { ...formData, payment_terms: parseInt(formData.payment_terms) || 30 };
      if (editingCustomer) {
        const { error } = await supabase.from('customers').update(payload).eq('id', editingCustomer.id);
        if (error) throw error;
        showToast.success('Customer updated successfully');
      } else {
        const { error } = await supabase.from('customers').insert(payload);
        if (error) throw error;
        showToast.success('Customer created successfully');
      }
      await fetchCustomers();
      closeModal();
    } catch (err: any) {
      showToast.error(parseError(err).message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this customer?')) return;
    try {
      const { error } = await supabase.from('customers').delete().eq('id', id);
      if (error) throw error;
      showToast.success('Customer deleted successfully');
      await fetchCustomers();
    } catch (err: any) {
      showToast.error(parseError(err).message);
    }
  };

  const openModal = (customer?: Customer) => {
    if (customer) {
      setEditingCustomer(customer);
      setFormData({
        name: customer.name, code: customer.code || '', city: customer.city || '', state: customer.state || '',
        contact_name: customer.contact_name || '', contact_phone: customer.contact_phone || '',
        contact_email: customer.contact_email || '', payment_terms: String(customer.payment_terms || 30),
        is_active: customer.is_active
      });
    } else {
      setEditingCustomer(null);
      setFormData({ name: '', code: '', city: '', state: '', contact_name: '', contact_phone: '', contact_email: '', payment_terms: '30', is_active: true });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => { setIsModalOpen(false); setEditingCustomer(null); };

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.code?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Customers</h1>
          <p className="text-gray-500 mt-1">Manage your customer base</p>
        </div>
        <button onClick={() => openModal()} className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2">
          <span className="text-xl">+</span> Add Customer
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-3 gap-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-xl shadow p-4"><p className="text-sm text-gray-500">Total</p><p className="text-2xl font-bold">{customers.length}</p></div>
          <div className="bg-white rounded-xl shadow p-4"><p className="text-sm text-gray-500">Active</p><p className="text-2xl font-bold text-green-600">{customers.filter(c => c.is_active).length}</p></div>
          <div className="bg-white rounded-xl shadow p-4"><p className="text-sm text-gray-500">Inactive</p><p className="text-2xl font-bold text-gray-600">{customers.filter(c => !c.is_active).length}</p></div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow p-4">
        <input type="text" placeholder="Search customers..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full px-4 py-2 border rounded-lg" />
      </div>

      {error && (
        <ErrorAlert
          error={error}
          onRetry={fetchCustomers}
        />
      )}

      {loading ? (
        <SkeletonTable rows={5} columns={7} />
      ) : filteredCustomers.length === 0 ? (
        <EmptyState
          title="No customers found"
          description={searchTerm ? "Try adjusting your search terms" : "Get started by adding your first customer"}
          action={!searchTerm ? { label: "Add Customer", onClick: () => openModal() } : undefined}
        />
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
                  <td className="px-6 py-4 font-medium">{customer.name}</td>
                  <td className="px-6 py-4"><span className="px-2 py-1 bg-gray-100 rounded font-mono text-sm">{customer.code || '-'}</span></td>
                  <td className="px-6 py-4 text-gray-500">{customer.city}, {customer.state}</td>
                  <td className="px-6 py-4"><div className="text-sm">{customer.contact_name || '-'}</div><div className="text-xs text-gray-500">{customer.contact_phone}</div></td>
                  <td className="px-6 py-4 text-gray-500">Net {customer.payment_terms || 30}</td>
                  <td className="px-6 py-4"><span className={`px-2 py-1 text-xs rounded-full ${customer.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>{customer.is_active ? 'Active' : 'Inactive'}</span></td>
                  <td className="px-6 py-4 text-sm">
                    <button onClick={() => openModal(customer)} className="text-blue-600 hover:text-blue-800 mr-2">Edit</button>
                    <button onClick={() => handleDelete(customer.id)} className="text-red-600 hover:text-red-800">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-black bg-opacity-50" onClick={closeModal}></div>
          <div className="relative min-h-screen flex items-center justify-center p-4">
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg">
              <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 rounded-t-2xl">
                <h2 className="text-xl font-bold text-white">{editingCustomer ? 'Edit' : 'Add'} Customer</h2>
              </div>
              <div className="p-6 space-y-4">
                <div><label className="block text-sm font-medium mb-1">Company Name *</label><input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full px-4 py-2 border rounded-lg" /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-sm font-medium mb-1">Code</label><input value={formData.code} onChange={e => setFormData({...formData, code: e.target.value.toUpperCase()})} className="w-full px-4 py-2 border rounded-lg font-mono" maxLength={10} /></div>
                  <div><label className="block text-sm font-medium mb-1">Payment Terms</label><select value={formData.payment_terms} onChange={e => setFormData({...formData, payment_terms: e.target.value})} className="w-full px-4 py-2 border rounded-lg">
                    <option value="15">Net 15</option><option value="30">Net 30</option><option value="45">Net 45</option><option value="60">Net 60</option>
                  </select></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-sm font-medium mb-1">City</label><input value={formData.city} onChange={e => setFormData({...formData, city: e.target.value})} className="w-full px-4 py-2 border rounded-lg" /></div>
                  <div><label className="block text-sm font-medium mb-1">State</label><input value={formData.state} onChange={e => setFormData({...formData, state: e.target.value})} className="w-full px-4 py-2 border rounded-lg" maxLength={2} /></div>
                </div>
                <div><label className="block text-sm font-medium mb-1">Contact Name</label><input value={formData.contact_name} onChange={e => setFormData({...formData, contact_name: e.target.value})} className="w-full px-4 py-2 border rounded-lg" /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-sm font-medium mb-1">Phone</label><input value={formData.contact_phone} onChange={e => setFormData({...formData, contact_phone: e.target.value})} className="w-full px-4 py-2 border rounded-lg" /></div>
                  <div><label className="block text-sm font-medium mb-1">Email</label><input type="email" value={formData.contact_email} onChange={e => setFormData({...formData, contact_email: e.target.value})} className="w-full px-4 py-2 border rounded-lg" /></div>
                </div>
              </div>
              <div className="px-6 py-4 bg-gray-50 border-t rounded-b-2xl flex justify-between">
                <button onClick={closeModal} className="px-6 py-2 border rounded-lg hover:bg-gray-100">Cancel</button>
                <button onClick={handleSubmit} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">{editingCustomer ? 'Save' : 'Add'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}