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
    company_name: string;
  };
}

interface Shipment {
  id: string;
  reference_number: string;
  type: string;
  status: string;
  customer_name: string;
  container_number: string;
  container_size: string;
  booking_number: string;
  bill_of_lading: string;
  vessel: string;
  terminal_name: string;
  last_free_day: string;
  pickup_location: string;
  pickup_city: string;
  delivery_location: string;
  delivery_city: string;
  delivered_at: string;
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

interface ContainerTracking {
  id: string;
  container_number: string;
  terminal_name: string;
  emodal_status: string;
  availability_status: string;
  has_customs_hold: boolean;
  has_freight_hold: boolean;
  last_free_day: string;
  last_checked_at: string;
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
  const [activeTab, setActiveTab] = useState<'overview' | 'shipments' | 'tracking' | 'invoices' | 'documents'>('overview');
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [containerTracking, setContainerTracking] = useState<ContainerTracking[]>([]);
  const [loading, setLoading] = useState(false);

  // Quote request
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const [quoteForm, setQuoteForm] = useState({
    shipment_type: 'IMPORT',
    container_size: '40',
    container_count: 1,
    pickup_location: '',
    pickup_city: '',
    pickup_state: '',
    delivery_location: '',
    delivery_city: '',
    delivery_state: '',
    requested_pickup_date: '',
    commodity: '',
    special_instructions: '',
  });

  useEffect(() => {
    const session = localStorage.getItem('portal_session');
    if (session) {
      const parsed = JSON.parse(session);
      setCurrentUser(parsed.user);
      setIsLoggedIn(true);
    }
    fetchCustomers();
  }, []);

  useEffect(() => {
    if (isLoggedIn || demoMode) {
      fetchPortalData();
    }
  }, [isLoggedIn, demoMode, demoCustomerId, currentUser]);

  const fetchCustomers = async () => {
    const { data } = await supabase
      .from('customers')
      .select('id, name, company_name')
      .eq('status', 'ACTIVE')
      .order('company_name');
    setCustomers(data || []);
  };

  const fetchPortalData = async () => {
    setLoading(true);
    const customerId = demoMode ? demoCustomerId : currentUser?.customer_id;

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
      
      if (shipError) console.error('Shipments error:', shipError);
      setShipments(shipmentsData || []);

      // Fetch invoices by customer_id
      const { data: invoicesData, error: invError } = await supabase
        .from('invoices')
        .select('*')
        .eq('customer_id', customerId)
        .order('invoice_date', { ascending: false })
        .limit(50);
      
      if (invError) console.error('Invoices error:', invError);
      setInvoices(invoicesData || []);

      // Fetch container tracking for shipments
      if (shipmentsData && shipmentsData.length > 0) {
        const containerNumbers = shipmentsData
          .map(s => s.container_number)
          .filter(cn => cn && cn !== 'EMPTY-TBD');
        
        if (containerNumbers.length > 0) {
          const { data: trackingData } = await supabase
            .from('container_tracking')
            .select('*')
            .in('container_number', containerNumbers)
            .order('last_checked_at', { ascending: false });
          
          setContainerTracking(trackingData || []);
        }
      }

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
      const { data: user, error } = await supabase
        .from('customer_portal_users')
        .select('*, customers(id, name, company_name)')
        .eq('email', loginEmail.toLowerCase().trim())
        .eq('status', 'ACTIVE')
        .single();

      if (error || !user) {
        setLoginError('Invalid email or account not found');
        setIsLoading(false);
        return;
      }

      setCurrentUser(user);
      setIsLoggedIn(true);
      localStorage.setItem('portal_session', JSON.stringify({ user, timestamp: Date.now() }));

      // Log activity
      await supabase.from('portal_activity_log').insert({
        user_id: user.id,
        customer_id: user.customer_id,
        action: 'LOGIN',
        details: { email: user.email },
      });

    } catch (err: any) {
      setLoginError('Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setCurrentUser(null);
    localStorage.removeItem('portal_session');
  };

  const handleDemoLogin = () => {
    if (demoCustomerId) {
      setDemoMode(true);
    }
  };

  const submitQuoteRequest = async () => {
    try {
      const customerId = demoMode ? demoCustomerId : currentUser?.customer_id;
      
      await supabase.from('quote_requests').insert({
        customer_id: customerId,
        portal_user_id: currentUser?.id,
        contact_email: currentUser?.email || 'nanneboina113@gmail.com',
        ...quoteForm,
        status: 'NEW',
      });

      alert('Quote request submitted! We will contact you shortly.');
      setShowQuoteModal(false);
    } catch (err: any) {
      alert('Error: ' + err.message);
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
      'NOT_AVAILABLE': 'bg-red-100 text-red-800',
      'ON_HOLD': 'bg-orange-100 text-orange-800',
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
                  placeholder="your@email.com"
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
                  placeholder="••••••••"
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
                    <option key={c.id} value={c.id}>{c.company_name || c.name}</option>
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
                <strong>Test Login:</strong> nanneboina113@gmail.com
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Portal Dashboard
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
              <span className="text-gray-600">
                {currentUser ? `${currentUser.first_name} ${currentUser.last_name}` : 
                  customers.find(c => c.id === demoCustomerId)?.company_name || 'Guest'}
              </span>
              <button
                onClick={() => { setDemoMode(false); handleLogout(); }}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
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
              {shipments.filter(s => isLfdUrgent(s.last_free_day) && s.status !== 'DELIVERED').length}
            </p>
          </div>
        </div>

        {/* LFD Warnings */}
        {shipments.filter(s => isLfdUrgent(s.last_free_day) && s.status !== 'DELIVERED').length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
            <h3 className="font-bold text-red-800 flex items-center gap-2">
              ⚠️ Last Free Day Alerts
            </h3>
            <div className="mt-2 space-y-2">
              {shipments.filter(s => isLfdUrgent(s.last_free_day) && s.status !== 'DELIVERED').map(s => (
                <div key={s.id} className="flex items-center justify-between bg-white rounded-lg p-3">
                  <div>
                    <span className="font-mono font-bold">{s.container_number}</span>
                    <span className="text-gray-500 ml-2">at {s.terminal_name}</span>
                  </div>
                  <div className="text-red-600 font-bold">
                    LFD: {formatDate(s.last_free_day)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Request Quote Button */}
        <div className="flex justify-end mb-4">
          <button
            onClick={() => setShowQuoteModal(true)}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700"
          >
            + Request Quote
          </button>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-xl shadow mb-6">
          <div className="border-b px-6">
            <div className="flex gap-4">
              {[
                { id: 'overview', label: 'Overview' },
                { id: 'shipments', label: `Shipments (${shipments.length})` },
                { id: 'tracking', label: 'Container Status' },
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
                        <p className="text-gray-500">No shipments found</p>
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
                                  <td className="px-4 py-3 font-mono">{shipment.container_number}</td>
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
                        <p className="text-gray-500">No invoices found</p>
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
                            <td className="px-4 py-3 font-mono font-semibold">{shipment.container_number}</td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-1 rounded text-xs ${shipment.type === 'IMPORT' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}`}>
                                {shipment.type} {shipment.container_size}'
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm">{shipment.bill_of_lading || '-'}</td>
                            <td className="px-4 py-3 text-sm">{shipment.vessel || '-'}</td>
                            <td className="px-4 py-3 text-sm">{shipment.terminal_name || '-'}</td>
                            <td className="px-4 py-3 text-sm">{shipment.delivery_city || shipment.delivery_location || '-'}</td>
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
                    {shipments.length === 0 && (
                      <div className="text-center py-12 text-gray-500">No shipments found</div>
                    )}
                  </div>
                )}

                {/* Container Tracking Tab */}
                {activeTab === 'tracking' && (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Container</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Terminal</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">eModal Status</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Availability</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Holds</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">LFD</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Updated</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {containerTracking.map(ct => (
                          <tr key={ct.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-mono font-bold">{ct.container_number}</td>
                            <td className="px-4 py-3">{ct.terminal_name}</td>
                            <td className="px-4 py-3">{ct.emodal_status || '-'}</td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-1 rounded-full text-xs ${getStatusColor(ct.availability_status || '')}`}>
                                {ct.availability_status || 'UNKNOWN'}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex gap-1">
                                {ct.has_customs_hold && <span className="px-1.5 py-0.5 bg-red-100 text-red-700 text-xs rounded">🛃 Customs</span>}
                                {ct.has_freight_hold && <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 text-xs rounded">📦 Freight</span>}
                                {!ct.has_customs_hold && !ct.has_freight_hold && <span className="text-green-600">✓ Clear</span>}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span className={isLfdUrgent(ct.last_free_day) ? 'text-red-600 font-bold' : ''}>
                                {formatDate(ct.last_free_day)}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-500">
                              {ct.last_checked_at ? new Date(ct.last_checked_at).toLocaleString() : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {containerTracking.length === 0 && (
                      <div className="text-center py-12 text-gray-500">No container tracking data available</div>
                    )}
                  </div>
                )}

                {/* Invoices Tab */}
                {activeTab === 'invoices' && (
                  <div className="overflow-x-auto">
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
                    {invoices.length === 0 && (
                      <div className="text-center py-12 text-gray-500">No invoices found</div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Quote Modal */}
      {showQuoteModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => setShowQuoteModal(false)}></div>
          <div className="relative min-h-screen flex items-center justify-center p-4">
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl">
              <div className="bg-blue-600 px-6 py-4 rounded-t-2xl">
                <h2 className="text-xl font-bold text-white">Request a Quote</h2>
              </div>
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Type</label>
                    <select
                      value={quoteForm.shipment_type}
                      onChange={e => setQuoteForm({ ...quoteForm, shipment_type: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                    >
                      <option value="IMPORT">Import</option>
                      <option value="EXPORT">Export</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Size</label>
                    <select
                      value={quoteForm.container_size}
                      onChange={e => setQuoteForm({ ...quoteForm, container_size: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                    >
                      <option value="20">20'</option>
                      <option value="40">40'</option>
                      <option value="40HC">40' HC</option>
                      <option value="45">45'</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Count</label>
                    <input
                      type="number"
                      min="1"
                      value={quoteForm.container_count}
                      onChange={e => setQuoteForm({ ...quoteForm, container_count: parseInt(e.target.value) })}
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Pickup Location</label>
                    <input
                      value={quoteForm.pickup_location}
                      onChange={e => setQuoteForm({ ...quoteForm, pickup_location: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                      placeholder="Port/Terminal name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Delivery Location</label>
                    <input
                      value={quoteForm.delivery_location}
                      onChange={e => setQuoteForm({ ...quoteForm, delivery_location: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                      placeholder="Warehouse/City"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Special Instructions</label>
                  <textarea
                    value={quoteForm.special_instructions}
                    onChange={e => setQuoteForm({ ...quoteForm, special_instructions: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                    rows={3}
                  />
                </div>
              </div>
              <div className="px-6 py-4 bg-gray-50 rounded-b-2xl flex justify-end gap-2">
                <button onClick={() => setShowQuoteModal(false)} className="px-4 py-2 border rounded-lg">Cancel</button>
                <button onClick={submitQuoteRequest} className="px-6 py-2 bg-blue-600 text-white rounded-lg">Submit</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
