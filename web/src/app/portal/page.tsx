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
  booking_number: string;
  bill_of_lading: string;
  vessel: string;
  terminal_name: string;
  last_free_day: string;
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

interface Document {
  id: string;
  document_type: string;
  document_name: string;
  original_filename: string;
  file_url: string;
  uploaded_at: string;
  entity_type: string;
  entity_id: string;
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
  appointment_date: string;
  appointment_status: string;
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

  // Demo mode (for testing without real auth)
  const [demoMode, setDemoMode] = useState(false);
  const [demoCustomerId, setDemoCustomerId] = useState('');
  const [customers, setCustomers] = useState<any[]>([]);

  // Data state
  const [activeTab, setActiveTab] = useState<'overview' | 'shipments' | 'tracking' | 'invoices' | 'documents' | 'quotes'>('overview');
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
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
    pickup_zip: '',
    delivery_location: '',
    delivery_city: '',
    delivery_state: '',
    delivery_zip: '',
    requested_pickup_date: '',
    commodity: '',
    special_instructions: '',
    is_hazmat: false,
    is_overweight: false,
  });

  useEffect(() => {
    // Check for existing session
    const session = localStorage.getItem('portal_session');
    if (session) {
      const parsed = JSON.parse(session);
      setCurrentUser(parsed.user);
      setIsLoggedIn(true);
    }

    // Fetch customers for demo mode
    fetchCustomers();
  }, []);

  useEffect(() => {
    if (isLoggedIn || demoMode) {
      fetchPortalData();
    }
  }, [isLoggedIn, demoMode, demoCustomerId]);

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
      // Fetch shipments for this customer
      const { data: shipmentsData } = await supabase
        .from('shipments')
        .select('*')
        .or(`customer_name.ilike.%${customerId}%,customer_id.eq.${customerId}`)
        .order('created_at', { ascending: false })
        .limit(50);
      setShipments(shipmentsData || []);

      // Fetch invoices for this customer
      const { data: invoicesData } = await supabase
        .from('invoices')
        .select('*')
        .eq('customer_id', customerId)
        .order('invoice_date', { ascending: false })
        .limit(50);
      setInvoices(invoicesData || []);

      // Fetch documents
      const { data: documentsData } = await supabase
        .from('documents')
        .select('*')
        .eq('status', 'ACTIVE')
        .order('uploaded_at', { ascending: false })
        .limit(100);
      setDocuments(documentsData || []);

      // Fetch container tracking
      const { data: trackingData } = await supabase
        .from('container_tracking')
        .select('*')
        .order('last_checked_at', { ascending: false })
        .limit(50);
      setContainerTracking(trackingData || []);

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
      // Check portal users
      const { data: user, error } = await supabase
        .from('customer_portal_users')
        .select('*, customers(id, name, company_name)')
        .eq('email', loginEmail)
        .eq('status', 'ACTIVE')
        .single();

      if (error || !user) {
        setLoginError('Invalid email or account not found');
        setIsLoading(false);
        return;
      }

      // In production, verify password hash here
      // For demo, we'll accept any password
      
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
      
      const { error } = await supabase.from('quote_requests').insert({
        customer_id: customerId,
        portal_user_id: currentUser?.id,
        ...quoteForm,
        status: 'NEW',
      });

      if (error) throw error;

      alert('Quote request submitted! We will contact you shortly.');
      setShowQuoteModal(false);
      setQuoteForm({
        shipment_type: 'IMPORT',
        container_size: '40',
        container_count: 1,
        pickup_location: '',
        pickup_city: '',
        pickup_state: '',
        pickup_zip: '',
        delivery_location: '',
        delivery_city: '',
        delivery_state: '',
        delivery_zip: '',
        requested_pickup_date: '',
        commodity: '',
        special_instructions: '',
        is_hazmat: false,
        is_overweight: false,
      });
    } catch (err: any) {
      alert('Error submitting quote: ' + err.message);
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      'PENDING': 'bg-yellow-100 text-yellow-800',
      'BOOKED': 'bg-blue-100 text-blue-800',
      'IN_TRANSIT': 'bg-purple-100 text-purple-800',
      'DELIVERED': 'bg-green-100 text-green-800',
      'COMPLETED': 'bg-green-100 text-green-800',
      'CANCELLED': 'bg-red-100 text-red-800',
      'DRAFT': 'bg-gray-100 text-gray-800',
      'SENT': 'bg-blue-100 text-blue-800',
      'PAID': 'bg-green-100 text-green-800',
      'PARTIAL': 'bg-yellow-100 text-yellow-800',
      'OVERDUE': 'bg-red-100 text-red-800',
      'AVAILABLE': 'bg-green-100 text-green-800',
      'NOT_AVAILABLE': 'bg-red-100 text-red-800',
      'ON_HOLD': 'bg-orange-100 text-orange-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  // Login Page
  if (!isLoggedIn && !demoMode) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-blue-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          {/* Logo */}
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

          {/* Login Card */}
          <div className="bg-white rounded-2xl shadow-2xl p-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">Sign In</h2>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={loginEmail}
                  onChange={e => setLoginEmail(e.target.value)}
                  className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                  className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                className="w-full py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400 transition"
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
                  className="w-full py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition"
                >
                  Enter Demo Mode
                </button>
              </div>
            </div>

            <div className="mt-6 text-center">
              <a href="#" className="text-sm text-blue-600 hover:underline">Forgot password?</a>
              <span className="mx-2 text-gray-300">|</span>
              <a href="#" className="text-sm text-blue-600 hover:underline">Request access</a>
            </div>
          </div>

          <p className="text-center text-blue-200 text-sm mt-6">
            © 2025 DrayMaster TMS. All rights reserved.
          </p>
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
                {currentUser ? `${currentUser.first_name} ${currentUser.last_name}` : 'Guest User'}
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
        {/* Quick Actions */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-xl shadow p-6 border-l-4 border-blue-500">
            <p className="text-sm text-gray-500">Active Shipments</p>
            <p className="text-3xl font-bold text-blue-600">{shipments.filter(s => s.status !== 'DELIVERED').length}</p>
          </div>
          <div className="bg-white rounded-xl shadow p-6 border-l-4 border-green-500">
            <p className="text-sm text-gray-500">Containers Available</p>
            <p className="text-3xl font-bold text-green-600">
              {containerTracking.filter(c => c.availability_status === 'AVAILABLE').length}
            </p>
          </div>
          <div className="bg-white rounded-xl shadow p-6 border-l-4 border-yellow-500">
            <p className="text-sm text-gray-500">Pending Invoices</p>
            <p className="text-3xl font-bold text-yellow-600">
              {invoices.filter(i => i.balance_due > 0).length}
            </p>
          </div>
          <div className="bg-white rounded-xl shadow p-6 border-l-4 border-red-500">
            <p className="text-sm text-gray-500">Containers on Hold</p>
            <p className="text-3xl font-bold text-red-600">
              {containerTracking.filter(c => c.has_customs_hold || c.has_freight_hold).length}
            </p>
          </div>
        </div>

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
                { id: 'shipments', label: 'Shipments' },
                { id: 'tracking', label: 'Container Tracking' },
                { id: 'invoices', label: 'Invoices' },
                { id: 'documents', label: 'Documents' },
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
                    {/* Recent Shipments */}
                    <div>
                      <h3 className="font-semibold text-lg mb-4">Recent Shipments</h3>
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reference</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">B/L</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Terminal</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">LFD</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {shipments.slice(0, 5).map(shipment => (
                              <tr key={shipment.id} className="hover:bg-gray-50">
                                <td className="px-4 py-3 font-mono text-blue-600">{shipment.reference_number}</td>
                                <td className="px-4 py-3">{shipment.type}</td>
                                <td className="px-4 py-3">{shipment.bill_of_lading || '-'}</td>
                                <td className="px-4 py-3">{shipment.terminal_name || '-'}</td>
                                <td className="px-4 py-3">
                                  {shipment.last_free_day ? new Date(shipment.last_free_day).toLocaleDateString() : '-'}
                                </td>
                                <td className="px-4 py-3">
                                  <span className={`px-2 py-1 rounded-full text-xs ${getStatusColor(shipment.status)}`}>
                                    {shipment.status}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Recent Invoices */}
                    <div>
                      <h3 className="font-semibold text-lg mb-4">Recent Invoices</h3>
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
                                <td className="px-4 py-3">{new Date(invoice.invoice_date).toLocaleDateString()}</td>
                                <td className="px-4 py-3">{new Date(invoice.due_date).toLocaleDateString()}</td>
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
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Booking #</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">B/L</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vessel</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Terminal</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">LFD</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {shipments.map(shipment => (
                          <tr key={shipment.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-mono text-blue-600">{shipment.reference_number}</td>
                            <td className="px-4 py-3">{shipment.type}</td>
                            <td className="px-4 py-3">{shipment.booking_number || '-'}</td>
                            <td className="px-4 py-3">{shipment.bill_of_lading || '-'}</td>
                            <td className="px-4 py-3">{shipment.vessel || '-'}</td>
                            <td className="px-4 py-3">{shipment.terminal_name || '-'}</td>
                            <td className="px-4 py-3">
                              {shipment.last_free_day ? (
                                <span className={`font-semibold ${new Date(shipment.last_free_day) < new Date() ? 'text-red-600' : ''}`}>
                                  {new Date(shipment.last_free_day).toLocaleDateString()}
                                </span>
                              ) : '-'}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-1 rounded-full text-xs ${getStatusColor(shipment.status)}`}>
                                {shipment.status}
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
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Availability</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Holds</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">LFD</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Appointment</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Updated</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {containerTracking.map(ct => (
                          <tr key={ct.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-mono font-semibold">{ct.container_number}</td>
                            <td className="px-4 py-3">{ct.terminal_name || '-'}</td>
                            <td className="px-4 py-3">{ct.emodal_status || '-'}</td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-1 rounded-full text-xs ${getStatusColor(ct.availability_status || '')}`}>
                                {ct.availability_status || 'UNKNOWN'}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex gap-1">
                                {ct.has_customs_hold && <span className="px-1 py-0.5 bg-red-100 text-red-700 text-xs rounded">Customs</span>}
                                {ct.has_freight_hold && <span className="px-1 py-0.5 bg-orange-100 text-orange-700 text-xs rounded">Freight</span>}
                                {!ct.has_customs_hold && !ct.has_freight_hold && <span className="text-green-600 text-sm">Clear</span>}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              {ct.last_free_day ? new Date(ct.last_free_day).toLocaleDateString() : '-'}
                            </td>
                            <td className="px-4 py-3 text-sm">
                              {ct.appointment_date ? (
                                <>
                                  {new Date(ct.appointment_date).toLocaleString()}
                                  <span className={`ml-2 px-1 py-0.5 rounded text-xs ${getStatusColor(ct.appointment_status || '')}`}>
                                    {ct.appointment_status || ''}
                                  </span>
                                </>
                              ) : 'Not scheduled'}
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
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {invoices.map(invoice => (
                          <tr key={invoice.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-mono text-blue-600">{invoice.invoice_number}</td>
                            <td className="px-4 py-3">{new Date(invoice.invoice_date).toLocaleDateString()}</td>
                            <td className="px-4 py-3">{new Date(invoice.due_date).toLocaleDateString()}</td>
                            <td className="px-4 py-3 text-right">${invoice.total_amount?.toFixed(2)}</td>
                            <td className="px-4 py-3 text-right text-green-600">${invoice.amount_paid?.toFixed(2)}</td>
                            <td className="px-4 py-3 text-right font-bold">${invoice.balance_due?.toFixed(2)}</td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-1 rounded-full text-xs ${getStatusColor(invoice.status)}`}>
                                {invoice.status}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <button className="text-blue-600 hover:underline text-sm">
                                View PDF
                              </button>
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

                {/* Documents Tab */}
                {activeTab === 'documents' && (
                  <div className="grid grid-cols-4 gap-4">
                    {documents.map(doc => (
                      <div key={doc.id} className="border rounded-lg p-4 hover:shadow-md transition">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-2xl">
                            {doc.document_type === 'POD' ? '✅' : doc.document_type === 'BOL' ? '📄' : '📎'}
                          </span>
                          <span className="px-2 py-0.5 bg-gray-100 rounded text-xs">{doc.document_type}</span>
                        </div>
                        <h4 className="font-medium text-sm truncate">{doc.document_name}</h4>
                        <p className="text-xs text-gray-500 mt-1">
                          {new Date(doc.uploaded_at).toLocaleDateString()}
                        </p>
                        <a
                          href={doc.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 inline-block text-blue-600 hover:underline text-sm"
                        >
                          Download
                        </a>
                      </div>
                    ))}
                    {documents.length === 0 && (
                      <div className="col-span-4 text-center py-12 text-gray-500">No documents available</div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Quote Request Modal */}
      {showQuoteModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => setShowQuoteModal(false)}></div>
          <div className="relative min-h-screen flex items-center justify-center p-4">
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
              <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold text-white">Request a Quote</h2>
                  <button onClick={() => setShowQuoteModal(false)} className="text-white text-2xl">&times;</button>
                </div>
              </div>

              <div className="p-6 overflow-y-auto max-h-[60vh] space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Shipment Type *</label>
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
                    <label className="block text-sm font-medium mb-1">Container Size *</label>
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
                    <label className="block text-sm font-medium mb-1">Container Count *</label>
                    <input
                      type="number"
                      min="1"
                      value={quoteForm.container_count}
                      onChange={e => setQuoteForm({ ...quoteForm, container_count: parseInt(e.target.value) })}
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </div>
                </div>

                <div className="border-t pt-4">
                  <h4 className="font-medium mb-3">Pickup Location</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <input
                      placeholder="Location Name (Port, Terminal)"
                      value={quoteForm.pickup_location}
                      onChange={e => setQuoteForm({ ...quoteForm, pickup_location: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                    <input
                      placeholder="City"
                      value={quoteForm.pickup_city}
                      onChange={e => setQuoteForm({ ...quoteForm, pickup_city: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                    <input
                      placeholder="State"
                      value={quoteForm.pickup_state}
                      onChange={e => setQuoteForm({ ...quoteForm, pickup_state: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                    <input
                      placeholder="ZIP"
                      value={quoteForm.pickup_zip}
                      onChange={e => setQuoteForm({ ...quoteForm, pickup_zip: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </div>
                </div>

                <div className="border-t pt-4">
                  <h4 className="font-medium mb-3">Delivery Location</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <input
                      placeholder="Location Name (Warehouse, Facility)"
                      value={quoteForm.delivery_location}
                      onChange={e => setQuoteForm({ ...quoteForm, delivery_location: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                    <input
                      placeholder="City"
                      value={quoteForm.delivery_city}
                      onChange={e => setQuoteForm({ ...quoteForm, delivery_city: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                    <input
                      placeholder="State"
                      value={quoteForm.delivery_state}
                      onChange={e => setQuoteForm({ ...quoteForm, delivery_state: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                    <input
                      placeholder="ZIP"
                      value={quoteForm.delivery_zip}
                      onChange={e => setQuoteForm({ ...quoteForm, delivery_zip: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Requested Pickup Date</label>
                    <input
                      type="date"
                      value={quoteForm.requested_pickup_date}
                      onChange={e => setQuoteForm({ ...quoteForm, requested_pickup_date: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Commodity</label>
                    <input
                      value={quoteForm.commodity}
                      onChange={e => setQuoteForm({ ...quoteForm, commodity: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                      placeholder="e.g., Electronics, Food, etc."
                    />
                  </div>
                </div>

                <div className="flex gap-6">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={quoteForm.is_hazmat}
                      onChange={e => setQuoteForm({ ...quoteForm, is_hazmat: e.target.checked })}
                    />
                    <span>Hazmat</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={quoteForm.is_overweight}
                      onChange={e => setQuoteForm({ ...quoteForm, is_overweight: e.target.checked })}
                    />
                    <span>Overweight</span>
                  </label>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Special Instructions</label>
                  <textarea
                    value={quoteForm.special_instructions}
                    onChange={e => setQuoteForm({ ...quoteForm, special_instructions: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                    rows={3}
                    placeholder="Any special requirements..."
                  />
                </div>
              </div>

              <div className="px-6 py-4 bg-gray-50 border-t flex justify-end gap-2">
                <button
                  onClick={() => setShowQuoteModal(false)}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  onClick={submitQuoteRequest}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Submit Request
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
