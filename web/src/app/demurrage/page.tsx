'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface ContainerWithDemurrage {
  id: string;
  container_number: string;
  size: string;
  shipment_id: string;
  shipment_ref: string;
  customer_name: string;
  steamship_line: string;
  gate_out_at: string;
  gate_in_at: string;
  free_time_expires_at: string;
  demurrage_status: string;
  estimated_demurrage: number;
  lifecycle_status: string;
  last_free_day: string;
  hours_remaining?: number;
  percent_used?: number;
}

interface CarrierRule {
  id: string;
  carrier_code: string;
  carrier_name: string;
  import_free_days: number;
  export_free_days: number;
  detention_free_days: number;
  demurrage_rate_day1_4: number;
  demurrage_rate_day5_7: number;
  demurrage_rate_day8_plus: number;
  detention_rate_per_day: number;
  exclude_weekends: boolean;
  exclude_holidays: boolean;
  is_active: boolean;
}

interface ContainerCharge {
  id: string;
  container_id: string;
  container_number?: string;
  charge_type: string;
  free_time_start: string;
  free_time_end: string;
  actual_return: string;
  free_days_allowed: number;
  days_used: number;
  days_over: number;
  daily_rate: number;
  total_charge: number;
  status: string;
  waiver_reason?: string;
  dispute_status?: string;
}

export default function DemurragePage() {
  const [activeTab, setActiveTab] = useState<'monitoring' | 'charges' | 'rules' | 'disputes'>('monitoring');
  const [containers, setContainers] = useState<ContainerWithDemurrage[]>([]);
  const [carrierRules, setCarrierRules] = useState<CarrierRule[]>([]);
  const [charges, setCharges] = useState<ContainerCharge[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('ALL');

  // Modal states
  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<CarrierRule | null>(null);
  const [ruleForm, setRuleForm] = useState({
    carrier_code: '',
    carrier_name: '',
    import_free_days: 5,
    export_free_days: 7,
    detention_free_days: 3,
    demurrage_rate_day1_4: 75,
    demurrage_rate_day5_7: 100,
    demurrage_rate_day8_plus: 150,
    detention_rate_per_day: 50,
    exclude_weekends: true,
    exclude_holidays: true,
  });

  useEffect(() => {
    fetchData();
  }, [filterStatus]);

  const fetchData = async () => {
    try {
      setLoading(true);

      // Fetch containers with demurrage info
      const { data: containersData, error: containersError } = await supabase
        .from('containers')
        .select(`
          id,
          container_number,
          size,
          shipment_id,
          gate_out_at,
          gate_in_at,
          free_time_expires_at,
          demurrage_status,
          estimated_demurrage,
          lifecycle_status,
          shipment:shipments!shipment_id(
            reference_number,
            customer_name,
            steamship_line,
            last_free_day
          )
        `)
        .not('gate_out_at', 'is', null)
        .is('gate_in_at', null)
        .order('gate_out_at', { ascending: true });

      if (containersError) throw containersError;

      // Calculate free time for each container
      const processedContainers = (containersData || []).map((c: any) => {
        const gateOut = new Date(c.gate_out_at);
        const freeDays = 5; // Default, should come from carrier rules
        const expiresAt = new Date(gateOut.getTime() + freeDays * 24 * 60 * 60 * 1000);
        const now = new Date();
        const hoursRemaining = Math.max(0, (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60));
        const totalHours = freeDays * 24;
        const percentUsed = Math.min(100, Math.round(((totalHours - hoursRemaining) / totalHours) * 100));

        let status = 'OK';
        if (hoursRemaining <= 0) status = 'OVERDUE';
        else if (percentUsed >= 90) status = 'CRITICAL';
        else if (percentUsed >= 80) status = 'WARNING';

        return {
          id: c.id,
          container_number: c.container_number,
          size: c.size,
          shipment_id: c.shipment_id,
          shipment_ref: c.shipment?.reference_number || '',
          customer_name: c.shipment?.customer_name || '',
          steamship_line: c.shipment?.steamship_line || '',
          gate_out_at: c.gate_out_at,
          gate_in_at: c.gate_in_at,
          free_time_expires_at: expiresAt.toISOString(),
          demurrage_status: status,
          estimated_demurrage: c.estimated_demurrage || 0,
          lifecycle_status: c.lifecycle_status,
          last_free_day: c.shipment?.last_free_day,
          hours_remaining: Math.round(hoursRemaining),
          percent_used: percentUsed,
        };
      });

      // Filter by status
      let filtered = processedContainers;
      if (filterStatus !== 'ALL') {
        filtered = processedContainers.filter(c => c.demurrage_status === filterStatus);
      }

      setContainers(filtered);

      // Fetch carrier rules
      const { data: rulesData } = await supabase
        .from('carrier_free_time_rules')
        .select('*')
        .order('carrier_name');
      setCarrierRules(rulesData || []);

      // Fetch charges
      const { data: chargesData } = await supabase
        .from('container_charges')
        .select('*, container:containers(container_number)')
        .order('created_at', { ascending: false })
        .limit(100);
      setCharges((chargesData || []).map((ch: any) => ({
        ...ch,
        container_number: ch.container?.container_number,
      })));

    } catch (err: any) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const openRuleModal = (rule?: CarrierRule) => {
    if (rule) {
      setEditingRule(rule);
      setRuleForm({
        carrier_code: rule.carrier_code,
        carrier_name: rule.carrier_name,
        import_free_days: rule.import_free_days,
        export_free_days: rule.export_free_days,
        detention_free_days: rule.detention_free_days,
        demurrage_rate_day1_4: rule.demurrage_rate_day1_4,
        demurrage_rate_day5_7: rule.demurrage_rate_day5_7,
        demurrage_rate_day8_plus: rule.demurrage_rate_day8_plus,
        detention_rate_per_day: rule.detention_rate_per_day,
        exclude_weekends: rule.exclude_weekends,
        exclude_holidays: rule.exclude_holidays,
      });
    } else {
      setEditingRule(null);
      setRuleForm({
        carrier_code: '',
        carrier_name: '',
        import_free_days: 5,
        export_free_days: 7,
        detention_free_days: 3,
        demurrage_rate_day1_4: 75,
        demurrage_rate_day5_7: 100,
        demurrage_rate_day8_plus: 150,
        detention_rate_per_day: 50,
        exclude_weekends: true,
        exclude_holidays: true,
      });
    }
    setIsRuleModalOpen(true);
  };

  const saveRule = async () => {
    try {
      if (editingRule) {
        await supabase.from('carrier_free_time_rules').update(ruleForm).eq('id', editingRule.id);
      } else {
        await supabase.from('carrier_free_time_rules').insert({ ...ruleForm, is_active: true });
      }
      setIsRuleModalOpen(false);
      fetchData();
    } catch (err: any) {
      alert('Error saving rule: ' + err.message);
    }
  };

  const deleteRule = async (id: string) => {
    if (!confirm('Delete this carrier rule?')) return;
    await supabase.from('carrier_free_time_rules').delete().eq('id', id);
    fetchData();
  };

  const handleWaiveCharge = async (chargeId: string) => {
    const reason = prompt('Enter waiver reason:');
    if (!reason) return;
    await supabase.from('container_charges').update({
      status: 'WAIVED',
      waiver_reason: reason,
      waiver_approved_by: 'Dispatcher',
      waiver_approved_at: new Date().toISOString(),
    }).eq('id', chargeId);
    fetchData();
  };

  const handleDisputeCharge = async (chargeId: string) => {
    const reason = prompt('Enter dispute reason:');
    if (!reason) return;
    await supabase.from('container_charges').update({
      status: 'DISPUTED',
      dispute_filed_at: new Date().toISOString(),
      dispute_reason: reason,
      dispute_status: 'PENDING',
    }).eq('id', chargeId);
    fetchData();
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      'OK': 'bg-green-100 text-green-800',
      'WARNING': 'bg-yellow-100 text-yellow-800',
      'CRITICAL': 'bg-orange-100 text-orange-800',
      'OVERDUE': 'bg-red-100 text-red-800',
    };
    return styles[status] || 'bg-gray-100 text-gray-800';
  };

  const getProgressColor = (percent: number) => {
    if (percent >= 100) return 'bg-red-500';
    if (percent >= 90) return 'bg-orange-500';
    if (percent >= 80) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  // Stats
  const stats = {
    total: containers.length,
    ok: containers.filter(c => c.demurrage_status === 'OK').length,
    warning: containers.filter(c => c.demurrage_status === 'WARNING').length,
    critical: containers.filter(c => c.demurrage_status === 'CRITICAL').length,
    overdue: containers.filter(c => c.demurrage_status === 'OVERDUE').length,
    totalEstimatedCharges: containers.filter(c => c.demurrage_status === 'OVERDUE').reduce((sum, c) => sum + (c.estimated_demurrage || 0), 0),
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Demurrage & Detention</h1>
          <p className="text-gray-500 mt-1">Monitor free time, track charges, manage carrier rules</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-6 gap-4">
        <div className="bg-white rounded-xl shadow p-4 border-l-4 border-blue-500">
          <p className="text-sm text-gray-500">Active Containers</p>
          <p className="text-2xl font-bold">{stats.total}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4 border-l-4 border-green-500 cursor-pointer hover:shadow-lg" onClick={() => setFilterStatus('OK')}>
          <p className="text-sm text-gray-500">OK</p>
          <p className="text-2xl font-bold text-green-600">{stats.ok}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4 border-l-4 border-yellow-500 cursor-pointer hover:shadow-lg" onClick={() => setFilterStatus('WARNING')}>
          <p className="text-sm text-gray-500">Warning (80%+)</p>
          <p className="text-2xl font-bold text-yellow-600">{stats.warning}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4 border-l-4 border-orange-500 cursor-pointer hover:shadow-lg" onClick={() => setFilterStatus('CRITICAL')}>
          <p className="text-sm text-gray-500">Critical (90%+)</p>
          <p className="text-2xl font-bold text-orange-600">{stats.critical}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4 border-l-4 border-red-500 cursor-pointer hover:shadow-lg" onClick={() => setFilterStatus('OVERDUE')}>
          <p className="text-sm text-gray-500">Overdue</p>
          <p className="text-2xl font-bold text-red-600">{stats.overdue}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4 border-l-4 border-red-700">
          <p className="text-sm text-gray-500">Est. Charges</p>
          <p className="text-2xl font-bold text-red-700">${stats.totalEstimatedCharges.toLocaleString()}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow">
        <div className="border-b px-6">
          <div className="flex gap-4">
            {[
              { id: 'monitoring', label: 'Free Time Monitoring', icon: '⏱️' },
              { id: 'charges', label: 'Charges', icon: '💰' },
              { id: 'rules', label: 'Carrier Rules', icon: '📋' },
              { id: 'disputes', label: 'Disputes', icon: '⚖️' },
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
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6">
          {/* Monitoring Tab */}
          {activeTab === 'monitoring' && (
            <>
              <div className="flex gap-4 mb-4">
                <select
                  value={filterStatus}
                  onChange={e => setFilterStatus(e.target.value)}
                  className="px-4 py-2 border rounded-lg"
                >
                  <option value="ALL">All Status</option>
                  <option value="OK">OK</option>
                  <option value="WARNING">Warning</option>
                  <option value="CRITICAL">Critical</option>
                  <option value="OVERDUE">Overdue</option>
                </select>
                <button onClick={fetchData} className="px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200">
                  Refresh
                </button>
              </div>

              {loading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                </div>
              ) : containers.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No containers currently out with free time tracking
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Container</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Line</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Gate Out</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">LFD</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Free Time Used</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Est. Charge</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {containers.map(container => (
                        <tr key={container.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <span className="font-mono font-semibold">{container.container_number}</span>
                            <span className="text-xs text-gray-500 ml-2">{container.size}'</span>
                          </td>
                          <td className="px-4 py-3">{container.customer_name}</td>
                          <td className="px-4 py-3">
                            <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                              {container.steamship_line || 'N/A'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {container.gate_out_at ? new Date(container.gate_out_at).toLocaleDateString() : '-'}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {container.last_free_day ? new Date(container.last_free_day).toLocaleDateString() : (
                              container.free_time_expires_at ? new Date(container.free_time_expires_at).toLocaleDateString() : '-'
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="w-32">
                              <div className="flex justify-between text-xs mb-1">
                                <span>{container.percent_used}%</span>
                                <span>{container.hours_remaining}h left</span>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-2">
                                <div
                                  className={`h-2 rounded-full ${getProgressColor(container.percent_used || 0)}`}
                                  style={{ width: `${Math.min(100, container.percent_used || 0)}%` }}
                                ></div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadge(container.demurrage_status)}`}>
                              {container.demurrage_status}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {container.demurrage_status === 'OVERDUE' ? (
                              <span className="text-red-600 font-semibold">${container.estimated_demurrage.toFixed(2)}</span>
                            ) : (
                              <span className="text-gray-400">$0.00</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* Charges Tab */}
          {activeTab === 'charges' && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Container</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Free Time</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Days Over</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rate</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {charges.map(charge => (
                    <tr key={charge.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono">{charge.container_number}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs ${
                          charge.charge_type === 'DEMURRAGE' ? 'bg-red-100 text-red-800' :
                          charge.charge_type === 'DETENTION' ? 'bg-orange-100 text-orange-800' :
                          'bg-blue-100 text-blue-800'
                        }`}>
                          {charge.charge_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {new Date(charge.free_time_start).toLocaleDateString()} - {new Date(charge.free_time_end).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-semibold text-red-600">{charge.days_over} days</span>
                      </td>
                      <td className="px-4 py-3">${charge.daily_rate}/day</td>
                      <td className="px-4 py-3 font-bold text-red-600">${charge.total_charge.toFixed(2)}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs ${
                          charge.status === 'ACCRUING' ? 'bg-yellow-100 text-yellow-800' :
                          charge.status === 'CLOSED' ? 'bg-gray-100 text-gray-800' :
                          charge.status === 'WAIVED' ? 'bg-green-100 text-green-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {charge.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {charge.status === 'ACCRUING' && (
                          <div className="flex gap-1">
                            <button
                              onClick={() => handleWaiveCharge(charge.id)}
                              className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200"
                            >
                              Waive
                            </button>
                            <button
                              onClick={() => handleDisputeCharge(charge.id)}
                              className="px-2 py-1 text-xs bg-orange-100 text-orange-700 rounded hover:bg-orange-200"
                            >
                              Dispute
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {charges.length === 0 && (
                <div className="text-center py-8 text-gray-500">No charges recorded</div>
              )}
            </div>
          )}

          {/* Carrier Rules Tab */}
          {activeTab === 'rules' && (
            <>
              <div className="flex justify-between items-center mb-4">
                <p className="text-gray-600">Configure free time and demurrage rates by carrier</p>
                <button
                  onClick={() => openRuleModal()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  + Add Carrier Rule
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {carrierRules.map(rule => (
                  <div key={rule.id} className="border rounded-lg p-4 hover:shadow-md">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h3 className="font-semibold text-lg">{rule.carrier_name}</h3>
                        <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                          {rule.carrier_code}
                        </span>
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => openRuleModal(rule)} className="text-gray-500 hover:text-blue-600">
                          Edit
                        </button>
                        <button onClick={() => deleteRule(rule.id)} className="text-gray-500 hover:text-red-600">
                          Delete
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3 text-sm">
                      <div>
                        <p className="text-gray-500">Import Free Days</p>
                        <p className="font-semibold">{rule.import_free_days} days</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Export Free Days</p>
                        <p className="font-semibold">{rule.export_free_days} days</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Detention Free</p>
                        <p className="font-semibold">{rule.detention_free_days} days</p>
                      </div>
                    </div>

                    <div className="mt-3 pt-3 border-t">
                      <p className="text-xs text-gray-500 mb-1">Demurrage Rates (per day)</p>
                      <div className="flex gap-2 text-xs">
                        <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
                          Days 1-4: ${rule.demurrage_rate_day1_4}
                        </span>
                        <span className="bg-orange-100 text-orange-800 px-2 py-1 rounded">
                          Days 5-7: ${rule.demurrage_rate_day5_7}
                        </span>
                        <span className="bg-red-100 text-red-800 px-2 py-1 rounded">
                          Days 8+: ${rule.demurrage_rate_day8_plus}
                        </span>
                      </div>
                    </div>

                    <div className="mt-2 text-xs text-gray-500">
                      {rule.exclude_weekends && <span className="mr-2">Excludes weekends</span>}
                      {rule.exclude_holidays && <span>Excludes holidays</span>}
                    </div>
                  </div>
                ))}
                {carrierRules.length === 0 && (
                  <div className="col-span-2 text-center py-8 text-gray-500">
                    No carrier rules configured. Add rules to enable automatic demurrage calculations.
                  </div>
                )}
              </div>
            </>
          )}

          {/* Disputes Tab */}
          {activeTab === 'disputes' && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Container</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Charge Type</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Dispute Reason</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Filed Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {charges.filter(c => c.status === 'DISPUTED').map(charge => (
                    <tr key={charge.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono">{charge.container_number}</td>
                      <td className="px-4 py-3">{charge.charge_type}</td>
                      <td className="px-4 py-3 font-semibold">${charge.total_charge.toFixed(2)}</td>
                      <td className="px-4 py-3 text-sm">{charge.waiver_reason || '-'}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs ${
                          charge.dispute_status === 'PENDING' ? 'bg-yellow-100 text-yellow-800' :
                          charge.dispute_status === 'APPROVED' ? 'bg-green-100 text-green-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {charge.dispute_status || 'PENDING'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {/* {charge.dispute_filed_at ? new Date(charge.dispute_filed_at).toLocaleDateString() : '-'} */}
                        -
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {charges.filter(c => c.status === 'DISPUTED').length === 0 && (
                <div className="text-center py-8 text-gray-500">No active disputes</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Carrier Rule Modal */}
      {isRuleModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => setIsRuleModalOpen(false)}></div>
          <div className="relative min-h-screen flex items-center justify-center p-4">
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl">
              <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 rounded-t-2xl">
                <h2 className="text-xl font-bold text-white">
                  {editingRule ? 'Edit Carrier Rule' : 'Add Carrier Rule'}
                </h2>
              </div>

              <div className="p-6 max-h-[60vh] overflow-y-auto space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Carrier Code *</label>
                    <input
                      value={ruleForm.carrier_code}
                      onChange={e => setRuleForm({ ...ruleForm, carrier_code: e.target.value.toUpperCase() })}
                      className="w-full px-4 py-2 border rounded-lg"
                      placeholder="MAERSK"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Carrier Name *</label>
                    <input
                      value={ruleForm.carrier_name}
                      onChange={e => setRuleForm({ ...ruleForm, carrier_name: e.target.value })}
                      className="w-full px-4 py-2 border rounded-lg"
                      placeholder="Maersk Line"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Import Free Days</label>
                    <input
                      type="number"
                      value={ruleForm.import_free_days}
                      onChange={e => setRuleForm({ ...ruleForm, import_free_days: parseInt(e.target.value) })}
                      className="w-full px-4 py-2 border rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Export Free Days</label>
                    <input
                      type="number"
                      value={ruleForm.export_free_days}
                      onChange={e => setRuleForm({ ...ruleForm, export_free_days: parseInt(e.target.value) })}
                      className="w-full px-4 py-2 border rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Detention Free Days</label>
                    <input
                      type="number"
                      value={ruleForm.detention_free_days}
                      onChange={e => setRuleForm({ ...ruleForm, detention_free_days: parseInt(e.target.value) })}
                      className="w-full px-4 py-2 border rounded-lg"
                    />
                  </div>
                </div>

                <hr />
                <h4 className="font-semibold">Demurrage Rates (Per Day)</h4>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Days 1-4 ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={ruleForm.demurrage_rate_day1_4}
                      onChange={e => setRuleForm({ ...ruleForm, demurrage_rate_day1_4: parseFloat(e.target.value) })}
                      className="w-full px-4 py-2 border rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Days 5-7 ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={ruleForm.demurrage_rate_day5_7}
                      onChange={e => setRuleForm({ ...ruleForm, demurrage_rate_day5_7: parseFloat(e.target.value) })}
                      className="w-full px-4 py-2 border rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Days 8+ ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={ruleForm.demurrage_rate_day8_plus}
                      onChange={e => setRuleForm({ ...ruleForm, demurrage_rate_day8_plus: parseFloat(e.target.value) })}
                      className="w-full px-4 py-2 border rounded-lg"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Detention Rate ($/day)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={ruleForm.detention_rate_per_day}
                    onChange={e => setRuleForm({ ...ruleForm, detention_rate_per_day: parseFloat(e.target.value) })}
                    className="w-full px-4 py-2 border rounded-lg"
                  />
                </div>

                <div className="flex gap-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={ruleForm.exclude_weekends}
                      onChange={e => setRuleForm({ ...ruleForm, exclude_weekends: e.target.checked })}
                    />
                    <span className="text-sm">Exclude weekends from free time</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={ruleForm.exclude_holidays}
                      onChange={e => setRuleForm({ ...ruleForm, exclude_holidays: e.target.checked })}
                    />
                    <span className="text-sm">Exclude holidays from free time</span>
                  </label>
                </div>
              </div>

              <div className="px-6 py-4 bg-gray-50 border-t rounded-b-2xl flex justify-between">
                <button onClick={() => setIsRuleModalOpen(false)} className="px-6 py-2 border rounded-lg hover:bg-gray-100">
                  Cancel
                </button>
                <button onClick={saveRule} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                  {editingRule ? 'Save Changes' : 'Add Rule'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
