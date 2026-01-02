'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

interface PortalUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  customer_id: string;
  customers?: {
    id: string;
    name: string;
  };
}

interface Shipment {
  id: string;
  reference_number: string;
  type: string;
  status: string;
  customer_name: string;
  steamship_line: string;
  booking_number: string;
  bill_of_lading: string;
  vessel: string;
  terminal_name: string;
  last_free_day: string;
  pickup_city: string;
  delivery_city: string;
  special_instructions: string;
  created_at: string;
}

interface Invoice {
  id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  total_amount: number;
  amount_paid: number;
  balance_due: number;
  status: string;
}

export default function PortalPage() {
  // Auth state
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState<PortalUser | null>(null);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Demo mode
  const [demoMode, setDemoMode] = useState(false);
  const [demoCustomerId, setDemoCustomerId] = useState('');
  const [customers, setCustomers] = useState<any[]>([]);

  // Data state
  const [activeTab, setActiveTab] = useState<'overview' | 'shipments' | 'invoices'>('overview');
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);

  // Quote request
  const [showQuoteModal, setShowQuoteModal] = useState(false);

  useEffect(() => {
    const session = localStorage.getItem('portal_session');
    if (session) {
      try {
        const parsed = JSON.parse(session);
        setCurrentUser(parsed.user);
        setIsLoggedIn(true);
      } catch (e) {
        localStorage.removeItem('portal_session');
      }
    }
    fetchCustomers();
  }, []);

  useEffect(() => {
    if (isLoggedIn || demoMode) {
      fetchPortalData();
    }
  }, [isLoggedIn, demoMode, demoCustomerId, currentUser]);

  const fetchCustomers = async () => {
    // Use is_active = true (boolean) instead of status = 'ACTIVE'
    const { data, error } = await supabase
      .from('customers')
      .select('id, name')
      .eq('is_active', true)
      .order('name');
    
    console.log('Customers fetched:', data, error);
    setCustomers(data || []);
  };

  const fetchPortalData = async () => {
    setLoading(true);
    const customerId = demoMode ? demoCustomerId : currentUser?.customer_id;

    console.log('Fetching data for customer:', customerId);

    if (!customerId) {
      setLoading(false);
      return;
    }

    try {
      // Fetch shipments by customer_id
      const { data: shipmentsData, error: shipError } = await supabase
        .from('shipments')
        .select('*')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
        .limit(50);
      
      console.log('Shipments:', shipmentsData, shipError);
      setShipments(shipmentsData || []);

      // Fetch invoices by customer_id
      const { data: invoicesData, error: invError } = await supabase
        .from('invoices')
        .select('*')
        .eq('customer_id', customerId)
        .order('invoice_date', { ascending: false })
        .limit(50);
      
      console.log('Invoices:', invoicesData, invError);
      setInvoices(invoicesData || []);

    } catch (err) {
      console.error('Error fetching portal data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setLoginError('');

    try {
      console.log('Attempting login for:', loginEmail);
      
      const { data: user, error } = await supabase
        .from('customer_portal_users')
        .select('*, customers(id, name)')
        .eq('email', loginEmail.toLowerCase().trim())
        .eq('status', 'ACTIVE')
        .single();

      console.log('Login result:', user, error);

      if (error || !user) {
        setLoginError('Invalid email or account not found. Try: nanneboina113@gmail.com');
        setIsLoading(false);
        return;
      }

      setCurrentUser(user);
      setIsLoggedIn(true);
      localStorage.setItem('portal_session', JSON.stringify({ user, timestamp: Date.now() }));

    } catch (err: any) {
      console.error('Login error:', err);
      setLoginError('Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setCurrentUser(null);
    setDemoMode(false);
    setDemoCustomerId('');
    localStorage.removeItem('portal_session');
  };

  const handleDemoLogin = () => {
    if (demoCustomerId) {
      console.log('Entering demo mode for customer:', demoCustomerId);
      setDemoMode(true);
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      'PENDING': 'bg-yellow-100 text-yellow-800',
      'BOOKED': 'bg-blue-100 text-blue-800',
      'DISPATCHED': 'bg-indigo-100 text-indigo-800',
      'IN_TRANSIT': 'bg-purple-100 text-purple-800',
      'AVAILABLE': 'bg-green-100 text-green-800',
      'AT_TERMINAL': 'bg-cyan-100 text-cyan-800',
      'OUT_FOR_DELIVERY': 'bg-orange-100 text-orange-800',
      'DELIVERED': 'bg-green-100 text-green-800',
      'COMPLETED': 'bg-green-100 text-green-800',
      'CANCELLED': 'bg-red-100 text-red-800',
      'DRAFT': 'bg-gray-100 text-gray-800',
      'SENT': 'bg-blue-100 text-blue-800',
      'PAID': 'bg-green-100 text-green-800',
      'PARTIAL': 'bg-yellow-100 text-yellow-800',
      'OVERDUE': 'bg-red-100 text-red-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString();
  };

  const isLfdUrgent = (lfdDate: string) => {
    if (!lfdDate) return false;
    const lfd = new Date(lfdDate);
    const today = new Date();
    const diffDays = Math.ceil((lfd.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays <= 2;
  };

  // Extract container from special_instructions (temporary until proper field exists)
  const getContainer = (shipment: Shipment) => {
    const match = shipment.special_instructions?.match(/Container:\s*([A-Z]{4}\d{7}|TBD|EMPTY)/i);
    return match ? match[1] : '-';
  };

  // Login Page
  if (!isLoggedIn && !demoMode) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-blue-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-3 text-white">
              <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
              </svg>
              <div>
                <h1 className="text-3xl font-bold">DrayMaster</h1>
                <p className="text-blue-200 text-sm">Customer Portal</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-2xl p-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">Sign In</h2>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={loginEmail}
                  onChange={e => setLoginEmail(e.target.value)}
                  className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="nanneboina113@gmail.com"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <input
                  type="password"
                  value={loginPassword}
                  onChange={e => setLoginPassword(e.target.value)}
                  className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="any password (demo)"
                  required
                />
              </div>

              {loginError && (
                <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">
                  {loginError}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400"
              >
                {isLoading ? 'Signing in...' : 'Sign In'}
              </button>
            </form>

            <div className="mt-6 pt-6 border-t">
              <p className="text-sm text-gray-500 text-center mb-4">Or try demo mode</p>
              <div className="space-y-3">
                <select
                  value={demoCustomerId}
                  onChange={e => setDemoCustomerId(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg"
                >
                  <option value="">Select a customer...</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <button
                  onClick={handleDemoLogin}
                  disabled={!demoCustomerId}
                  className="w-full py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50"
                >
                  Enter Demo Mode
                </button>
              </div>
            </div>

            <div className="mt-4 p-3 bg-blue-50 rounded-lg">
              <p className="text-xs text-blue-800 text-center">
                <strong>Test Login:</strong> nanneboina113@gmail.com (any password)
              </p>
            </div>

            <div className="mt-2 text-center">
              <p className="text-xs text-gray-400">Customers in dropdown: {customers.length}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Portal Dashboard
  const customerName = currentUser?.customers?.name || 
    customers.find(c => c.id === demoCustomerId)?.name || 
    'Customer';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
              </svg>
              <div>
                <h1 className="text-xl font-bold text-gray-800">DrayMaster</h1>
                <p className="text-xs text-gray-500">Customer Portal</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {demoMode && (
                <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm">
                  Demo Mode
                </span>
              )}
              <span className="text-gray-600 font-medium">{customerName}</span>
              <button
                onClick={handleLogout}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Summary Cards */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-xl shadow p-6 border-l-4 border-blue-500">
            <p className="text-sm text-gray-500">Active Shipments</p>
            <p className="text-3xl font-bold text-blue-600">
              {shipments.filter(s => !['DELIVERED', 'COMPLETED', 'CANCELLED'].includes(s.status)).length}
            </p>
          </div>
          <div className="bg-white rounded-xl shadow p-6 border-l-4 border-green-500">
            <p className="text-sm text-gray-500">Ready for Pickup</p>
            <p className="text-3xl font-bold text-green-600">
              {shipments.filter(s => s.status === 'AVAILABLE').length}
            </p>
          </div>
          <div className="bg-white rounded-xl shadow p-6 border-l-4 border-yellow-500">
            <p className="text-sm text-gray-500">Open Invoices</p>
            <p className="text-3xl font-bold text-yellow-600">
              {invoices.filter(i => i.balance_due > 0).length}
            </p>
          </div>
          <div className="bg-white rounded-xl shadow p-6 border-l-4 border-red-500">
            <p className="text-sm text-gray-500">⚠️ LFD Alerts</p>
            <p className="text-3xl font-bold text-red-600">
              {shipments.filter(s => isLfdUrgent(s.last_free_day) && !['DELIVERED', 'COMPLETED'].includes(s.status)).length}
            </p>
          </div>
        </div>

        {/* LFD Warnings */}
        {shipments.filter(s => isLfdUrgent(s.last_free_day) && !['DELIVERED', 'COMPLETED'].includes(s.status)).length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
            <h3 className="font-bold text-red-800 flex items-center gap-2">
              ⚠️ Last Free Day Alerts - Action Required!
            </h3>
            <div className="mt-2 space-y-2">
              {shipments.filter(s => isLfdUrgent(s.last_free_day) && !['DELIVERED', 'COMPLETED'].includes(s.status)).map(s => (
                <div key={s.id} className="flex items-center justify-between bg-white rounded-lg p-3">
                  <div>
                    <span className="font-mono font-bold">{s.reference_number}</span>
                    <span className="text-gray-500 ml-2">at {s.terminal_name}</span>
                    <span className="text-gray-400 ml-2 text-sm">({getContainer(s)})</span>
                  </div>
                  <div className="text-red-600 font-bold">
                    LFD: {formatDate(s.last_free_day)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="bg-white rounded-xl shadow mb-6">
          <div className="border-b px-6">
            <div className="flex gap-4">
              {[
                { id: 'overview', label: 'Overview' },
                { id: 'shipments', label: `Shipments (${shipments.length})` },
                { id: 'invoices', label: `Invoices (${invoices.length})` },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`py-4 px-4 font-medium border-b-2 transition ${
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
            {loading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <p className="mt-2 text-gray-500">Loading...</p>
              </div>
            ) : (
              <>
                {/* Overview Tab */}
                {activeTab === 'overview' && (
                  <div className="space-y-6">
                    <div>
                      <h3 className="font-semibold text-lg mb-4">Recent Shipments</h3>
                      {shipments.length === 0 ? (
                        <p className="text-gray-500 py-8 text-center">No shipments found for this customer</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reference</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Container</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Terminal</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">LFD</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y">
                              {shipments.slice(0, 5).map(shipment => (
                                <tr key={shipment.id} className="hover:bg-gray-50">
                                  <td className="px-4 py-3 font-mono text-blue-600">{shipment.reference_number}</td>
                                  <td className="px-4 py-3 font-mono">{getContainer(shipment)}</td>
                                  <td className="px-4 py-3">
                                    <span className={`px-2 py-1 rounded text-xs ${shipment.type === 'IMPORT' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}`}>
                                      {shipment.type}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3">{shipment.terminal_name || '-'}</td>
                                  <td className="px-4 py-3">
                                    <span className={isLfdUrgent(shipment.last_free_day) ? 'text-red-600 font-bold' : ''}>
                                      {formatDate(shipment.last_free_day)}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3">
                                    <span className={`px-2 py-1 rounded-full text-xs ${getStatusColor(shipment.status)}`}>
                                      {shipment.status?.replace(/_/g, ' ')}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    <div>
                      <h3 className="font-semibold text-lg mb-4">Recent Invoices</h3>
                      {invoices.length === 0 ? (
                        <p className="text-gray-500 py-8 text-center">No invoices found for this customer</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice #</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Due Date</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Balance</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y">
                              {invoices.slice(0, 5).map(invoice => (
                                <tr key={invoice.id} className="hover:bg-gray-50">
                                  <td className="px-4 py-3 font-mono text-blue-600">{invoice.invoice_number}</td>
                                  <td className="px-4 py-3">{formatDate(invoice.invoice_date)}</td>
                                  <td className="px-4 py-3">{formatDate(invoice.due_date)}</td>
                                  <td className="px-4 py-3 text-right">${invoice.total_amount?.toFixed(2)}</td>
                                  <td className="px-4 py-3 text-right font-semibold">${invoice.balance_due?.toFixed(2)}</td>
                                  <td className="px-4 py-3">
                                    <span className={`px-2 py-1 rounded-full text-xs ${getStatusColor(invoice.status)}`}>
                                      {invoice.status}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Shipments Tab */}
                {activeTab === 'shipments' && (
                  <div className="overflow-x-auto">
                    {shipments.length === 0 ? (
                      <p className="text-gray-500 py-12 text-center">No shipments found</p>
                    ) : (
                      <table className="w-full">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reference</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Container</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">B/L</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vessel</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Terminal</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Delivery</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">LFD</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {shipments.map(shipment => (
                            <tr key={shipment.id} className="hover:bg-gray-50">
                              <td className="px-4 py-3 font-mono text-blue-600">{shipment.reference_number}</td>
                              <td className="px-4 py-3 font-mono font-semibold">{getContainer(shipment)}</td>
                              <td className="px-4 py-3">
                                <span className={`px-2 py-1 rounded text-xs ${shipment.type === 'IMPORT' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}`}>
                                  {shipment.type}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-sm">{shipment.bill_of_lading || '-'}</td>
                              <td className="px-4 py-3 text-sm">{shipment.vessel || '-'}</td>
                              <td className="px-4 py-3 text-sm">{shipment.terminal_name || '-'}</td>
                              <td className="px-4 py-3 text-sm">{shipment.delivery_city || '-'}</td>
                              <td className="px-4 py-3">
                                <span className={`font-semibold ${isLfdUrgent(shipment.last_free_day) ? 'text-red-600' : ''}`}>
                                  {formatDate(shipment.last_free_day)}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <span className={`px-2 py-1 rounded-full text-xs ${getStatusColor(shipment.status)}`}>
                                  {shipment.status?.replace(/_/g, ' ')}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}

                {/* Invoices Tab */}
                {activeTab === 'invoices' && (
                  <div className="overflow-x-auto">
                    {invoices.length === 0 ? (
                      <p className="text-gray-500 py-12 text-center">No invoices found</p>
                    ) : (
                      <table className="w-full">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice #</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Due Date</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Paid</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Balance</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {invoices.map(invoice => (
                            <tr key={invoice.id} className="hover:bg-gray-50">
                              <td className="px-4 py-3 font-mono text-blue-600">{invoice.invoice_number}</td>
                              <td className="px-4 py-3">{formatDate(invoice.invoice_date)}</td>
                              <td className="px-4 py-3">{formatDate(invoice.due_date)}</td>
                              <td className="px-4 py-3 text-right">${invoice.total_amount?.toFixed(2)}</td>
                              <td className="px-4 py-3 text-right text-green-600">${invoice.amount_paid?.toFixed(2)}</td>
                              <td className="px-4 py-3 text-right font-bold">${invoice.balance_due?.toFixed(2)}</td>
                              <td className="px-4 py-3">
                                <span className={`px-2 py-1 rounded-full text-xs ${getStatusColor(invoice.status)}`}>
                                  {invoice.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
