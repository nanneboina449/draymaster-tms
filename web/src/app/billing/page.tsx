'use client';

import { useState, useEffect } from 'react';
import { getInvoices, getOrders, createInvoice, updateInvoice, deleteInvoice, Invoice, Order } from '../../lib/supabase';

export default function BillingPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    customer_name: '', invoice_date: new Date().toISOString().split('T')[0],
    due_date: '', subtotal: '0', tax_rate: '0', notes: ''
  });
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [invoiceData, orderData] = await Promise.all([getInvoices(), getOrders()]);
      setInvoices(invoiceData || []);
      setOrders(orderData || []);
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const unbilledOrders = orders.filter(o => o.billing_status === 'UNBILLED' && (o.status === 'DELIVERED' || o.status === 'COMPLETED'));

  const handleCreateInvoice = async () => {
    try {
      const subtotal = parseFloat(formData.subtotal) || 0;
      const taxRate = parseFloat(formData.tax_rate) || 0;
      const taxAmount = subtotal * (taxRate / 100);
      const total = subtotal + taxAmount;

      const items = selectedOrders.map(orderId => {
        const order = orders.find(o => o.id === orderId);
        return {
          order_id: orderId,
          description: `Delivery - ${order?.container_number || 'Container'}`,
          quantity: 1,
          unit_price: order?.total_amount || 0,
          amount: order?.total_amount || 0,
        };
      });

      await createInvoice({
        customer_name: formData.customer_name,
        invoice_date: formData.invoice_date,
        due_date: formData.due_date,
        subtotal: subtotal,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        total_amount: total,
        balance_due: total,
        notes: formData.notes,
        status: 'DRAFT',
      }, items);

      await fetchData();
      setIsModalOpen(false);
      setSelectedOrders([]);
      setFormData({ customer_name: '', invoice_date: new Date().toISOString().split('T')[0], due_date: '', subtotal: '0', tax_rate: '0', notes: '' });
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await updateInvoice(id, { status });
      await fetchData();
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this invoice?')) return;
    try {
      await deleteInvoice(id);
      await fetchData();
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      'DRAFT': 'bg-gray-100 text-gray-800',
      'SENT': 'bg-blue-100 text-blue-800',
      'PAID': 'bg-green-100 text-green-800',
      'OVERDUE': 'bg-red-100 text-red-800',
      'CANCELLED': 'bg-red-100 text-red-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const stats = {
    total: invoices.length,
    draft: invoices.filter(i => i.status === 'DRAFT').length,
    sent: invoices.filter(i => i.status === 'SENT').length,
    paid: invoices.filter(i => i.status === 'PAID').length,
    totalRevenue: invoices.filter(i => i.status === 'PAID').reduce((sum, i) => sum + (i.total_amount || 0), 0),
    outstanding: invoices.filter(i => i.status === 'SENT').reduce((sum, i) => sum + (i.balance_due || 0), 0),
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Billing</h1>
          <p className="text-gray-500 mt-1">Manage invoices and payments</p>
        </div>
        <button onClick={() => setIsModalOpen(true)} className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 font-medium">
          <span className="text-xl">+</span> Create Invoice
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <div className="bg-white rounded-xl shadow p-4"><p className="text-sm text-gray-500">Total Invoices</p><p className="text-2xl font-bold">{stats.total}</p></div>
        <div className="bg-white rounded-xl shadow p-4"><p className="text-sm text-gray-500">Draft</p><p className="text-2xl font-bold text-gray-600">{stats.draft}</p></div>
        <div className="bg-white rounded-xl shadow p-4"><p className="text-sm text-gray-500">Sent</p><p className="text-2xl font-bold text-blue-600">{stats.sent}</p></div>
        <div className="bg-white rounded-xl shadow p-4"><p className="text-sm text-gray-500">Paid</p><p className="text-2xl font-bold text-green-600">{stats.paid}</p></div>
        <div className="bg-white rounded-xl shadow p-4"><p className="text-sm text-gray-500">Revenue</p><p className="text-2xl font-bold text-green-600">${stats.totalRevenue.toLocaleString()}</p></div>
        <div className="bg-white rounded-xl shadow p-4"><p className="text-sm text-gray-500">Outstanding</p><p className="text-2xl font-bold text-orange-600">${stats.outstanding.toLocaleString()}</p></div>
      </div>

      {/* Unbilled Orders Alert */}
      {unbilledOrders.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="font-semibold text-yellow-800">⚠️ {unbilledOrders.length} Unbilled Orders</p>
            <p className="text-sm text-yellow-600">Completed orders ready to be invoiced</p>
          </div>
          <button onClick={() => setIsModalOpen(true)} className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700">Create Invoice</button>
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-xl shadow p-12 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice #</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Due Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Balance</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {invoices.map((invoice) => (
                <tr key={invoice.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-mono font-semibold text-blue-600">{invoice.invoice_number}</td>
                  <td className="px-6 py-4">{invoice.customer_name}</td>
                  <td className="px-6 py-4 text-gray-500">{invoice.invoice_date}</td>
                  <td className="px-6 py-4 text-gray-500">{invoice.due_date || '-'}</td>
                  <td className="px-6 py-4 font-semibold">${(invoice.total_amount || 0).toLocaleString()}</td>
                  <td className="px-6 py-4 font-semibold text-orange-600">${(invoice.balance_due || 0).toLocaleString()}</td>
                  <td className="px-6 py-4">
                    <select
                      value={invoice.status}
                      onChange={(e) => handleStatusChange(invoice.id, e.target.value)}
                      className={`px-2 py-1 text-xs font-medium rounded-full border-0 cursor-pointer ${getStatusColor(invoice.status)}`}
                    >
                      <option value="DRAFT">DRAFT</option>
                      <option value="SENT">SENT</option>
                      <option value="PAID">PAID</option>
                      <option value="OVERDUE">OVERDUE</option>
                      <option value="CANCELLED">CANCELLED</option>
                    </select>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <button className="text-blue-600 hover:text-blue-800 mr-2">View</button>
                    <button onClick={() => handleDelete(invoice.id)} className="text-red-600 hover:text-red-800">Delete</button>
                  </td>
                </tr>
              ))}
              {invoices.length === 0 && (
                <tr><td colSpan={8} className="px-6 py-12 text-center text-gray-500">No invoices yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Invoice Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => setIsModalOpen(false)}></div>
          <div className="relative min-h-screen flex items-center justify-center p-4">
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl">
              <div className="bg-gradient-to-r from-green-600 to-green-700 px-6 py-4 rounded-t-2xl">
                <h2 className="text-xl font-bold text-white">Create Invoice</h2>
              </div>
              <div className="p-6 max-h-[60vh] overflow-y-auto space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Customer Name *</label>
                  <input value={formData.customer_name} onChange={e => setFormData({...formData, customer_name: e.target.value})} className="w-full px-4 py-2 border rounded-lg" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Invoice Date</label>
                    <input type="date" value={formData.invoice_date} onChange={e => setFormData({...formData, invoice_date: e.target.value})} className="w-full px-4 py-2 border rounded-lg" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Due Date</label>
                    <input type="date" value={formData.due_date} onChange={e => setFormData({...formData, due_date: e.target.value})} className="w-full px-4 py-2 border rounded-lg" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Subtotal ($)</label>
                    <input type="number" value={formData.subtotal} onChange={e => setFormData({...formData, subtotal: e.target.value})} className="w-full px-4 py-2 border rounded-lg" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Tax Rate (%)</label>
                    <input type="number" value={formData.tax_rate} onChange={e => setFormData({...formData, tax_rate: e.target.value})} className="w-full px-4 py-2 border rounded-lg" />
                  </div>
                </div>
                {unbilledOrders.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium mb-2">Select Orders to Include</label>
                    <div className="max-h-40 overflow-y-auto border rounded-lg p-2 space-y-2">
                      {unbilledOrders.map(order => (
                        <label key={order.id} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedOrders.includes(order.id)}
                            onChange={e => {
                              if (e.target.checked) {
                                setSelectedOrders([...selectedOrders, order.id]);
                                setFormData({...formData, subtotal: String((parseFloat(formData.subtotal) || 0) + (order.total_amount || 0))});
                              } else {
                                setSelectedOrders(selectedOrders.filter(id => id !== order.id));
                                setFormData({...formData, subtotal: String((parseFloat(formData.subtotal) || 0) - (order.total_amount || 0))});
                              }
                            }}
                            className="w-4 h-4"
                          />
                          <span className="font-mono text-sm">{order.order_number}</span>
                          <span className="text-gray-500 text-sm">{order.container_number}</span>
                          <span className="ml-auto font-semibold">${order.total_amount || 0}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium mb-1">Notes</label>
                  <textarea value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} rows={2} className="w-full px-4 py-2 border rounded-lg" />
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex justify-between text-sm"><span>Subtotal:</span><span>${parseFloat(formData.subtotal || '0').toFixed(2)}</span></div>
                  <div className="flex justify-between text-sm"><span>Tax ({formData.tax_rate}%):</span><span>${(parseFloat(formData.subtotal || '0') * parseFloat(formData.tax_rate || '0') / 100).toFixed(2)}</span></div>
                  <div className="flex justify-between font-bold text-lg border-t mt-2 pt-2">
                    <span>Total:</span>
                    <span>${(parseFloat(formData.subtotal || '0') * (1 + parseFloat(formData.tax_rate || '0') / 100)).toFixed(2)}</span>
                  </div>
                </div>
              </div>
              <div className="px-6 py-4 bg-gray-50 border-t rounded-b-2xl flex justify-between">
                <button onClick={() => setIsModalOpen(false)} className="px-6 py-2 border rounded-lg hover:bg-gray-100">Cancel</button>
                <button onClick={handleCreateInvoice} className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">Create Invoice</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}