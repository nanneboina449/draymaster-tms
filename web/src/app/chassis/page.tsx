'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';

interface ChassisUsage {
  id: string;
  chassis_number: string;
  chassis_pool: string;
  is_company_owned: boolean;
  container_number: string;
  customer_name: string;
  booking_reference: string;
  pickup_date: string;
  pickup_location: string;
  pickup_terminal: string;
  picked_up_by: string;
  return_date: string;
  return_location: string;
  returned_by: string;
  free_days: number;
  daily_rate: number;
  days_out: number;
  billable_days: number;
  per_diem_amount: number;
  billed_to_customer: boolean;
  pool_invoice_number: string;
  reconciled: boolean;
  is_street_turn: boolean;
  status: string;
  notes: string;
}

interface ChassisPool {
  id: string;
  name: string;
  code: string;
  free_days: number;
  daily_rate: number;
}

export default function ChassisManagementPage() {
  const [activeTab, setActiveTab] = useState<'usage' | 'pools' | 'audit'>('usage');
  const [chassisUsage, setChassisUsage] = useState<ChassisUsage[]>([]);
  const [chassisPools, setChassisPools] = useState<ChassisPool[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('OUT');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUsage, setEditingUsage] = useState<ChassisUsage | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [auditResults, setAuditResults] = useState<{
    matched: { chassis_number: string; invoice_amount: number; usage_amount: number; diff: number; usage_id: string }[];
    unmatched: { chassis_number: string; invoice_amount: number }[];
  } | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);

  const [formData, setFormData] = useState({
    chassis_number: '',
    chassis_pool: 'DCLI',
    is_company_owned: false,
    container_number: '',
    customer_name: '',
    booking_reference: '',
    pickup_date: '',
    pickup_location: '',
    pickup_terminal: '',
    picked_up_by: '',
    return_date: '',
    return_location: '',
    returned_by: '',
    free_days: 4,
    daily_rate: 30,
    notes: '',
  });

  useEffect(() => { fetchData(); }, [filterStatus]);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      let query = supabase.from('chassis_usage').select('*').order('pickup_date', { ascending: false });
      
      if (filterStatus && filterStatus !== 'ALL') {
        query = query.eq('status', filterStatus);
      }
      
      const { data: usageData, error: usageError } = await query;
      if (usageError) throw usageError;
      setChassisUsage(usageData || []);

      const { data: poolsData, error: poolsError } = await supabase
        .from('chassis_pools')
        .select('*')
        .order('name');
      if (poolsError) throw poolsError;
      setChassisPools(poolsData || []);
    } catch (err: any) {
      console.error('Error:', err);
      alert('Error fetching data: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePoolChange = (poolCode: string) => {
    const pool = chassisPools.find(p => p.code === poolCode);
    setFormData({
      ...formData,
      chassis_pool: poolCode,
      is_company_owned: poolCode === 'OWN',
      free_days: pool?.free_days || 4,
      daily_rate: pool?.daily_rate || 30,
    });
  };

  const openAddModal = () => {
    setEditingUsage(null);
    setFormData({
      chassis_number: '',
      chassis_pool: 'DCLI',
      is_company_owned: false,
      container_number: '',
      customer_name: '',
      booking_reference: '',
      pickup_date: new Date().toISOString().slice(0, 16),
      pickup_location: '',
      pickup_terminal: '',
      picked_up_by: '',
      return_date: '',
      return_location: '',
      returned_by: '',
      free_days: 4,
      daily_rate: 30,
      notes: '',
    });
    setIsModalOpen(true);
  };

  const openEditModal = (usage: ChassisUsage) => {
    setEditingUsage(usage);
    setFormData({
      chassis_number: usage.chassis_number || '',
      chassis_pool: usage.chassis_pool || 'DCLI',
      is_company_owned: usage.is_company_owned || false,
      container_number: usage.container_number || '',
      customer_name: usage.customer_name || '',
      booking_reference: usage.booking_reference || '',
      pickup_date: usage.pickup_date ? usage.pickup_date.slice(0, 16) : '',
      pickup_location: usage.pickup_location || '',
      pickup_terminal: usage.pickup_terminal || '',
      picked_up_by: usage.picked_up_by || '',
      return_date: usage.return_date ? usage.return_date.slice(0, 16) : '',
      return_location: usage.return_location || '',
      returned_by: usage.returned_by || '',
      free_days: usage.free_days || 4,
      daily_rate: usage.daily_rate || 30,
      notes: usage.notes || '',
    });
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    try {
      if (editingUsage) {
        const { error } = await supabase
          .from('chassis_usage')
          .update(formData)
          .eq('id', editingUsage.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('chassis_usage')
          .insert({ ...formData, status: 'OUT' });
        if (error) throw error;
      }
      setIsModalOpen(false);
      fetchData();
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const handleReturn = async (usage: ChassisUsage) => {
    const returnDate = prompt('Enter return date/time (YYYY-MM-DD HH:MM):', new Date().toISOString().slice(0, 16));
    if (!returnDate) return;
    
    const returnLocation = prompt('Return location:', usage.pickup_terminal);
    const returnedBy = prompt('Returned by (driver name):', usage.picked_up_by);
    
    try {
      const { error } = await supabase
        .from('chassis_usage')
        .update({
          return_date: returnDate,
          return_location: returnLocation,
          returned_by: returnedBy,
          status: 'RETURNED',
        })
        .eq('id', usage.id);
      if (error) throw error;
      fetchData();
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const handleStreetTurn = async (usage: ChassisUsage) => {
    const newContainer = prompt('New container number for street turn:');
    if (!newContainer) return;
    
    const newCustomer = prompt('New customer name:');
    const newBooking = prompt('New booking reference:');
    
    try {
      // Close current usage
      await supabase
        .from('chassis_usage')
        .update({ status: 'STREET_TURNED', return_date: new Date().toISOString() })
        .eq('id', usage.id);
      
      // Create new usage for street turn
      const { error } = await supabase
        .from('chassis_usage')
        .insert({
          chassis_number: usage.chassis_number,
          chassis_pool: usage.chassis_pool,
          is_company_owned: usage.is_company_owned,
          container_number: newContainer,
          customer_name: newCustomer,
          booking_reference: newBooking,
          pickup_date: new Date().toISOString(),
          pickup_location: usage.pickup_location,
          picked_up_by: usage.picked_up_by,
          free_days: usage.free_days,
          daily_rate: usage.daily_rate,
          is_street_turn: true,
          street_turn_from_usage_id: usage.id,
          status: 'OUT',
        });
      if (error) throw error;
      fetchData();
      alert('Street turn recorded successfully!');
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const handleAuditUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAuditLoading(true);
    setAuditResults(null);
    try {
      const text = await file.text();
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) { alert('CSV must have a header row and at least one data row.'); return; }

      // Parse: expect chassis_number and amount columns (flexible header detection)
      const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim().toLowerCase());
      const chassisCol = headers.findIndex(h => h.includes('chassis'));
      const amountCol = headers.findIndex(h => h.includes('amount') || h.includes('charge') || h.includes('total'));
      if (chassisCol < 0 || amountCol < 0) { alert('CSV must contain chassis number and amount columns.'); return; }

      const invoiceRows = lines.slice(1).map(line => {
        const cols = line.split(',').map(c => c.replace(/"/g, '').trim());
        return { chassis_number: cols[chassisCol]?.toUpperCase() || '', amount: parseFloat(cols[amountCol]) || 0 };
      }).filter(r => r.chassis_number);

      // Fetch all chassis usage records for matching
      const { data: usageData } = await supabase.from('chassis_usage').select('*');
      const usageMap = new Map<string, any[]>();
      (usageData || []).forEach((u: any) => {
        const key = u.chassis_number?.toUpperCase();
        if (key) usageMap.set(key, [...(usageMap.get(key) || []), u]);
      });

      const matched: typeof auditResults extends { matched: infer M } | null ? M : never = [];
      const unmatched: { chassis_number: string; invoice_amount: number }[] = [];

      invoiceRows.forEach(inv => {
        const usages = usageMap.get(inv.chassis_number);
        if (usages && usages.length > 0) {
          // Match against most recent usage record
          const usage = usages.sort((a: any, b: any) => new Date(b.pickup_date).getTime() - new Date(a.pickup_date).getTime())[0];
          const usageAmount = usage.per_diem_amount || 0;
          matched.push({
            chassis_number: inv.chassis_number,
            invoice_amount: inv.amount,
            usage_amount: usageAmount,
            diff: inv.amount - usageAmount,
            usage_id: usage.id,
          });
        } else {
          unmatched.push({ chassis_number: inv.chassis_number, invoice_amount: inv.amount });
        }
      });

      setAuditResults({ matched, unmatched });
    } catch (err: any) {
      console.error('Audit error:', err);
      alert('Error processing CSV: ' + err.message);
    } finally {
      setAuditLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      'OUT': 'bg-yellow-100 text-yellow-800',
      'RETURNED': 'bg-green-100 text-green-800',
      'INVOICED': 'bg-blue-100 text-blue-800',
      'RECONCILED': 'bg-gray-100 text-gray-800',
      'STREET_TURNED': 'bg-purple-100 text-purple-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getPerDiemColor = (billableDays: number) => {
    if (billableDays <= 0) return 'text-green-600';
    if (billableDays <= 3) return 'text-yellow-600';
    return 'text-red-600';
  };

  // Stats
  const stats = {
    totalOut: chassisUsage.filter(u => u.status === 'OUT').length,
    totalPerDiem: chassisUsage.filter(u => u.status === 'OUT').reduce((sum, u) => sum + (u.per_diem_amount || 0), 0),
    pendingReconciliation: chassisUsage.filter(u => u.status === 'RETURNED' && !u.reconciled).length,
    streetTurns: chassisUsage.filter(u => u.is_street_turn).length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Chassis Management</h1>
          <p className="text-gray-500 mt-1">Track chassis usage, per diem, and reconcile pool invoices</p>
        </div>
        <button onClick={openAddModal} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          + Record Chassis Pickup
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow p-4 border-l-4 border-yellow-500">
          <p className="text-sm text-gray-500">Chassis Out</p>
          <p className="text-2xl font-bold text-yellow-600">{stats.totalOut}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4 border-l-4 border-red-500">
          <p className="text-sm text-gray-500">Accrued Per Diem</p>
          <p className="text-2xl font-bold text-red-600">${stats.totalPerDiem.toFixed(2)}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4 border-l-4 border-blue-500">
          <p className="text-sm text-gray-500">Pending Reconciliation</p>
          <p className="text-2xl font-bold text-blue-600">{stats.pendingReconciliation}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4 border-l-4 border-purple-500">
          <p className="text-sm text-gray-500">Street Turns (Savings)</p>
          <p className="text-2xl font-bold text-purple-600">{stats.streetTurns}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow">
        <div className="border-b px-6">
          <div className="flex gap-4">
            {['usage', 'pools', 'audit'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as any)}
                className={`py-3 px-4 font-medium border-b-2 transition capitalize ${
                  activeTab === tab
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab === 'usage' ? '📦 Chassis Usage' : tab === 'pools' ? '🏢 Pool Rates' : '📋 Invoice Audit'}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6">
          {activeTab === 'usage' && (
            <>
              {/* Filters */}
              <div className="flex gap-4 mb-4">
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="px-4 py-2 border rounded-lg"
                >
                  <option value="ALL">All Status</option>
                  <option value="OUT">Out</option>
                  <option value="RETURNED">Returned</option>
                  <option value="INVOICED">Invoiced</option>
                  <option value="RECONCILED">Reconciled</option>
                </select>
                <button onClick={fetchData} className="px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200">
                  🔄 Refresh
                </button>
              </div>

              {/* Usage Table */}
              {loading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                </div>
              ) : chassisUsage.length === 0 ? (
                <div className="text-center py-8 text-gray-500">No chassis usage records found</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Chassis</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Pool</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Container</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Pickup</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Days Out</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Per Diem</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {chassisUsage.map((usage) => (
                        <tr key={usage.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <span className="font-mono font-semibold">{usage.chassis_number}</span>
                            {usage.is_street_turn && (
                              <span className="ml-2 text-xs bg-purple-100 text-purple-700 px-1 rounded">ST</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded text-xs ${
                              usage.is_company_owned ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
                            }`}>
                              {usage.chassis_pool}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-mono">{usage.container_number || '-'}</td>
                          <td className="px-4 py-3">
                            <div>{usage.customer_name || '-'}</div>
                            <div className="text-xs text-gray-500">{usage.booking_reference}</div>
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {usage.pickup_date ? new Date(usage.pickup_date).toLocaleDateString() : '-'}
                            <div className="text-xs text-gray-500">{usage.pickup_terminal}</div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`font-semibold ${getPerDiemColor(usage.billable_days)}`}>
                              {usage.days_out || 0} days
                            </span>
                            <div className="text-xs text-gray-500">
                              ({usage.free_days} free)
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {usage.billable_days > 0 ? (
                              <span className="text-red-600 font-semibold">
                                ${usage.per_diem_amount?.toFixed(2) || '0.00'}
                              </span>
                            ) : (
                              <span className="text-green-600">$0.00</span>
                            )}
                            <div className="text-xs text-gray-500">
                              ${usage.daily_rate}/day
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded-full text-xs ${getStatusColor(usage.status)}`}>
                              {usage.status}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1">
                              <button
                                onClick={() => openEditModal(usage)}
                                className="px-2 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200"
                              >
                                Edit
                              </button>
                              {usage.status === 'OUT' && (
                                <>
                                  <button
                                    onClick={() => handleReturn(usage)}
                                    className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200"
                                  >
                                    Return
                                  </button>
                                  <button
                                    onClick={() => handleStreetTurn(usage)}
                                    className="px-2 py-1 text-xs bg-purple-100 text-purple-700 rounded hover:bg-purple-200"
                                  >
                                    ST
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {activeTab === 'pools' && (
            <div className="grid grid-cols-2 gap-4">
              {chassisPools.map((pool) => (
                <div key={pool.id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-lg">{pool.name}</h3>
                    <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm">{pool.code}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Free Days:</span>
                      <span className="ml-2 font-semibold">{pool.free_days || 4}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Daily Rate:</span>
                      <span className="ml-2 font-semibold">${pool.daily_rate || 30}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'audit' && (
            <>
              <div className="flex justify-between items-center mb-4">
                <p className="text-gray-600">Upload pool invoices to reconcile against usage records</p>
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handleAuditUpload}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={auditLoading}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {auditLoading ? 'Processing...' : 'Upload Invoice CSV'}
                  </button>
                </div>
              </div>

              <div className="mb-4 p-3 bg-gray-50 rounded-lg border text-sm text-gray-600">
                <strong>Expected CSV format:</strong> Headers must include a chassis number column and an amount/charge column.
                Example: <code className="bg-white px-1 rounded border">chassis_number,amount</code> or <code className="bg-white px-1 rounded border">Chassis #,Total Charge</code>
              </div>

              {!auditResults && !auditLoading && (
                <div className="text-center py-12 text-gray-400">
                  <div className="text-5xl mb-3">📋</div>
                  <p>Upload an invoice CSV to begin reconciliation</p>
                </div>
              )}

              {auditLoading && (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="text-sm text-gray-500 mt-2">Processing invoice...</p>
                </div>
              )}

              {auditResults && (
                <>
                  {/* Summary */}
                  <div className="grid grid-cols-4 gap-4 mb-6">
                    <div className="bg-blue-50 rounded-lg p-4 text-center">
                      <p className="text-2xl font-bold text-blue-600">{auditResults.matched.length + auditResults.unmatched.length}</p>
                      <p className="text-xs text-gray-500">Total Invoice Lines</p>
                    </div>
                    <div className="bg-green-50 rounded-lg p-4 text-center">
                      <p className="text-2xl font-bold text-green-600">{auditResults.matched.length}</p>
                      <p className="text-xs text-gray-500">Matched</p>
                    </div>
                    <div className="bg-red-50 rounded-lg p-4 text-center">
                      <p className="text-2xl font-bold text-red-600">{auditResults.unmatched.length}</p>
                      <p className="text-xs text-gray-500">Unmatched</p>
                    </div>
                    <div className={`rounded-lg p-4 text-center ${auditResults.matched.reduce((s, m) => s + m.diff, 0) === 0 ? 'bg-green-50' : 'bg-orange-50'}`}>
                      <p className={`text-2xl font-bold ${auditResults.matched.reduce((s, m) => s + m.diff, 0) === 0 ? 'text-green-600' : 'text-orange-600'}`}>
                        ${Math.abs(auditResults.matched.reduce((s, m) => s + m.diff, 0)).toFixed(2)}
                      </p>
                      <p className="text-xs text-gray-500">Total Variance</p>
                    </div>
                  </div>

                  {/* Matched */}
                  {auditResults.matched.length > 0 && (
                    <div className="mb-6">
                      <h4 className="font-semibold text-gray-700 mb-2">Matched Records</h4>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Chassis</th>
                              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Invoice Amt</th>
                              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Usage Amt</th>
                              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Variance</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {auditResults.matched.map((row, i) => (
                              <tr key={i} className="hover:bg-gray-50">
                                <td className="px-4 py-2 font-mono">{row.chassis_number}</td>
                                <td className="px-4 py-2 text-right">${row.invoice_amount.toFixed(2)}</td>
                                <td className="px-4 py-2 text-right">${row.usage_amount.toFixed(2)}</td>
                                <td className={`px-4 py-2 text-right font-semibold ${row.diff === 0 ? 'text-green-600' : row.diff > 0 ? 'text-red-600' : 'text-orange-600'}`}>
                                  {row.diff > 0 ? '+' : ''}{row.diff.toFixed(2)}
                                </td>
                                <td className="px-4 py-2">
                                  <span className={`px-2 py-1 rounded-full text-xs ${row.diff === 0 ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'}`}>
                                    {row.diff === 0 ? 'Exact Match' : 'Variance'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Unmatched */}
                  {auditResults.unmatched.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-red-700 mb-2">Unmatched Invoice Lines</h4>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-red-50">
                            <tr>
                              <th className="px-4 py-2 text-left text-xs font-medium text-red-600 uppercase">Chassis</th>
                              <th className="px-4 py-2 text-right text-xs font-medium text-red-600 uppercase">Invoice Amount</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-red-600 uppercase">Note</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {auditResults.unmatched.map((row, i) => (
                              <tr key={i} className="bg-red-50 hover:bg-red-100">
                                <td className="px-4 py-2 font-mono">{row.chassis_number}</td>
                                <td className="px-4 py-2 text-right font-semibold text-red-600">${row.invoice_amount.toFixed(2)}</td>
                                <td className="px-4 py-2 text-xs text-red-500">No matching usage record found</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => setIsModalOpen(false)}></div>
          <div className="relative min-h-screen flex items-center justify-center p-4">
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
              <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold text-white">
                    {editingUsage ? 'Edit Chassis Usage' : 'Record Chassis Pickup'}
                  </h2>
                  <button onClick={() => setIsModalOpen(false)} className="text-white text-2xl">&times;</button>
                </div>
              </div>

              <div className="p-6 overflow-y-auto max-h-[60vh] space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Chassis Number *</label>
                    <input
                      value={formData.chassis_number}
                      onChange={e => setFormData({ ...formData, chassis_number: e.target.value.toUpperCase() })}
                      className="w-full px-4 py-2 border rounded-lg font-mono"
                      placeholder="DCLI-40-001"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Chassis Pool *</label>
                    <select
                      value={formData.chassis_pool}
                      onChange={e => handlePoolChange(e.target.value)}
                      className="w-full px-4 py-2 border rounded-lg"
                    >
                      {chassisPools.map(p => (
                        <option key={p.code} value={p.code}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Container Number</label>
                    <input
                      value={formData.container_number}
                      onChange={e => setFormData({ ...formData, container_number: e.target.value.toUpperCase() })}
                      className="w-full px-4 py-2 border rounded-lg font-mono"
                      placeholder="MSCU1234567"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Customer Name</label>
                    <input
                      value={formData.customer_name}
                      onChange={e => setFormData({ ...formData, customer_name: e.target.value })}
                      className="w-full px-4 py-2 border rounded-lg"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Booking Reference</label>
                  <input
                    value={formData.booking_reference}
                    onChange={e => setFormData({ ...formData, booking_reference: e.target.value })}
                    className="w-full px-4 py-2 border rounded-lg"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Pickup Date/Time *</label>
                    <input
                      type="datetime-local"
                      value={formData.pickup_date}
                      onChange={e => setFormData({ ...formData, pickup_date: e.target.value })}
                      className="w-full px-4 py-2 border rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Pickup Terminal</label>
                    <input
                      value={formData.pickup_terminal}
                      onChange={e => setFormData({ ...formData, pickup_terminal: e.target.value })}
                      className="w-full px-4 py-2 border rounded-lg"
                      placeholder="APM, LBCT, TraPac..."
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Picked Up By (Driver)</label>
                  <input
                    value={formData.picked_up_by}
                    onChange={e => setFormData({ ...formData, picked_up_by: e.target.value })}
                    className="w-full px-4 py-2 border rounded-lg"
                  />
                </div>

                {editingUsage && (
                  <>
                    <hr />
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Return Date/Time</label>
                        <input
                          type="datetime-local"
                          value={formData.return_date}
                          onChange={e => setFormData({ ...formData, return_date: e.target.value })}
                          className="w-full px-4 py-2 border rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Return Location</label>
                        <input
                          value={formData.return_location}
                          onChange={e => setFormData({ ...formData, return_location: e.target.value })}
                          className="w-full px-4 py-2 border rounded-lg"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Returned By</label>
                      <input
                        value={formData.returned_by}
                        onChange={e => setFormData({ ...formData, returned_by: e.target.value })}
                        className="w-full px-4 py-2 border rounded-lg"
                      />
                    </div>
                  </>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Free Days</label>
                    <input
                      type="number"
                      value={formData.free_days}
                      onChange={e => setFormData({ ...formData, free_days: parseInt(e.target.value) })}
                      className="w-full px-4 py-2 border rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Daily Rate ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.daily_rate}
                      onChange={e => setFormData({ ...formData, daily_rate: parseFloat(e.target.value) })}
                      className="w-full px-4 py-2 border rounded-lg"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Notes</label>
                  <textarea
                    value={formData.notes}
                    onChange={e => setFormData({ ...formData, notes: e.target.value })}
                    rows={2}
                    className="w-full px-4 py-2 border rounded-lg"
                  />
                </div>
              </div>

              <div className="px-6 py-4 bg-gray-50 border-t flex justify-between">
                <button onClick={() => setIsModalOpen(false)} className="px-6 py-2 border rounded-lg hover:bg-gray-100">
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  {editingUsage ? 'Save Changes' : 'Record Pickup'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}