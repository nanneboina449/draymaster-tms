'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

interface ContainerStatus {
  id: string;
  container_number: string;
  shipment_id: string;
  terminal_code: string;
  terminal_name: string;
  emodal_status: string;
  availability_status: string;
  has_customs_hold: boolean;
  has_freight_hold: boolean;
  has_usda_hold: boolean;
  has_tmf_hold: boolean;
  vessel_name: string;
  voyage_number: string;
  last_free_day: string;
  demurrage_amount: number;
  yard_location: string;
  appointment_date: string;
  appointment_time: string;
  gate_status: string;
  last_checked_at: string;
  shipments?: {
    reference_number: string;
    customer_name: string;
    type: string;
    delivery_city: string;
  };
}

interface EmodalConfig {
  id: string;
  provider: string;
  api_username: string;
  api_password_encrypted: string;
  api_key: string;
  is_active: boolean;
  auto_refresh_enabled: boolean;
  refresh_interval_minutes: number;
  last_sync_at: string;
  sync_status: string;
  containers_synced: number;
  errors_count: number;
}

interface SyncLog {
  id: string;
  synced_at: string;
  containers_updated: number;
  containers_failed: number;
  duration_ms: number;
  status: string;
  error_message: string;
}

const TERMINALS = [
  { code: 'APM', name: 'APM Terminals', port: 'Los Angeles' },
  { code: 'WBCT', name: 'West Basin Container Terminal', port: 'Los Angeles' },
  { code: 'TRAPAC-LA', name: 'TraPac Los Angeles', port: 'Los Angeles' },
  { code: 'YTI', name: 'Yusen Terminals', port: 'Los Angeles' },
  { code: 'EVERPORT', name: 'Everport Terminal', port: 'Los Angeles' },
  { code: 'LBCT', name: 'Long Beach Container Terminal', port: 'Long Beach' },
  { code: 'PCT', name: 'Pacific Container Terminal', port: 'Long Beach' },
  { code: 'ITS', name: 'International Transportation Service', port: 'Long Beach' },
  { code: 'SSA-PL', name: 'SSA Pier A', port: 'Long Beach' },
  { code: 'TRAPAC-LB', name: 'TraPac Long Beach', port: 'Long Beach' },
  { code: 'TTI', name: 'Total Terminals International', port: 'Long Beach' },
  { code: 'OICT', name: 'Oakland International Container Terminal', port: 'Oakland' },
  { code: 'SSA-OAK', name: 'SSA Oakland', port: 'Oakland' },
];

export default function TrackingPage() {
  const [activeTab, setActiveTab] = useState<'containers' | 'settings' | 'logs'>('containers');
  const [containers, setContainers] = useState<ContainerStatus[]>([]);
  const [config, setConfig] = useState<EmodalConfig | null>(null);
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);

  // Filters
  const [filterTerminal, setFilterTerminal] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterHoldsOnly, setFilterHoldsOnly] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Config form
  const [configForm, setConfigForm] = useState({
    api_username: '',
    api_password: '',
    api_key: '',
    auto_refresh_enabled: true,
    refresh_interval_minutes: 30,
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch containers with shipment info
      const { data: containerData } = await supabase
        .from('container_tracking')
        .select(`
          *,
          shipments(reference_number, customer_name, type, delivery_city)
        `)
        .order('last_checked_at', { ascending: false });
      
      setContainers(containerData || []);

      // Fetch eModal config
      const { data: configData } = await supabase
        .from('emodal_config')
        .select('*')
        .eq('is_active', true)
        .single();
      
      if (configData) {
        setConfig(configData);
        setConfigForm({
          api_username: configData.api_username || '',
          api_password: '', // Don't show password
          api_key: configData.api_key || '',
          auto_refresh_enabled: configData.auto_refresh_enabled ?? true,
          refresh_interval_minutes: configData.refresh_interval_minutes || 30,
        });
      }

      // Fetch sync logs
      const { data: logsData } = await supabase
        .from('emodal_sync_log')
        .select('*')
        .order('synced_at', { ascending: false })
        .limit(20);
      
      setSyncLogs(logsData || []);

    } catch (err) {
      console.error('Error fetching tracking data:', err);
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async () => {
    setSavingConfig(true);
    try {
      const updateData: any = {
        api_username: configForm.api_username,
        api_key: configForm.api_key,
        auto_refresh_enabled: configForm.auto_refresh_enabled,
        refresh_interval_minutes: configForm.refresh_interval_minutes,
        updated_at: new Date().toISOString(),
      };

      // Only update password if provided
      if (configForm.api_password) {
        updateData.api_password_encrypted = configForm.api_password; // In production, encrypt this
      }

      if (config?.id) {
        await supabase
          .from('emodal_config')
          .update(updateData)
          .eq('id', config.id);
      } else {
        await supabase
          .from('emodal_config')
          .insert({
            ...updateData,
            provider: 'EMODAL',
            is_active: true,
          });
      }

      alert('Configuration saved successfully!');
      await fetchData();
    } catch (err: any) {
      alert('Error saving configuration: ' + err.message);
    } finally {
      setSavingConfig(false);
    }
  };

  const triggerSync = async () => {
    setSyncing(true);
    try {
      const response = await fetch('/api/emodal-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      
      const result = await response.json();
      
      if (result.success) {
        alert(`Sync completed!\nContainers updated: ${result.containersUpdated || 0}\nTime: ${result.duration || 0}ms`);
        await fetchData();
      } else {
        alert('Sync failed: ' + (result.error || 'Unknown error'));
      }
    } catch (err: any) {
      alert('Sync error: ' + err.message);
    } finally {
      setSyncing(false);
    }
  };

  const addContainerToTracking = async (containerNumber: string, terminalCode: string) => {
    try {
      await supabase.from('container_tracking').insert({
        container_number: containerNumber.toUpperCase(),
        terminal_code: terminalCode,
        terminal_name: TERMINALS.find(t => t.code === terminalCode)?.name || terminalCode,
        availability_status: 'UNKNOWN',
        last_checked_at: new Date().toISOString(),
      });
      await fetchData();
      alert('Container added to tracking!');
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      'AVAILABLE': 'bg-green-100 text-green-800',
      'NOT_AVAILABLE': 'bg-yellow-100 text-yellow-800',
      'ON_HOLD': 'bg-red-100 text-red-800',
      'IN_YARD': 'bg-blue-100 text-blue-800',
      'DISCHARGED': 'bg-cyan-100 text-cyan-800',
      'GATED_OUT': 'bg-gray-100 text-gray-800',
      'UNKNOWN': 'bg-gray-100 text-gray-600',
    };
    return colors[status] || 'bg-gray-100 text-gray-600';
  };

  const isLfdUrgent = (lfdDate: string) => {
    if (!lfdDate) return false;
    const lfd = new Date(lfdDate);
    const diffDays = Math.ceil((lfd.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return diffDays <= 2;
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString();
  };

  const formatDateTime = (dateStr: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString();
  };

  // Apply filters
  const filteredContainers = containers.filter(c => {
    if (filterTerminal && c.terminal_code !== filterTerminal) return false;
    if (filterStatus && c.availability_status !== filterStatus) return false;
    if (filterHoldsOnly && !c.has_customs_hold && !c.has_freight_hold && !c.has_usda_hold && !c.has_tmf_hold) return false;
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      return (
        c.container_number?.toLowerCase().includes(search) ||
        c.shipments?.reference_number?.toLowerCase().includes(search) ||
        c.shipments?.customer_name?.toLowerCase().includes(search)
      );
    }
    return true;
  });

  // Stats
  const stats = {
    total: containers.length,
    available: containers.filter(c => c.availability_status === 'AVAILABLE').length,
    onHold: containers.filter(c => c.has_customs_hold || c.has_freight_hold || c.has_usda_hold || c.has_tmf_hold).length,
    lfdAlert: containers.filter(c => isLfdUrgent(c.last_free_day)).length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Container Tracking</h1>
          <p className="text-gray-500 mt-1">Real-time container status from eModal</p>
        </div>
        <div className="flex items-center gap-4">
          {config?.last_sync_at && (
            <span className="text-sm text-gray-500">
              Last sync: {formatDateTime(config.last_sync_at)}
            </span>
          )}
          <button
            onClick={triggerSync}
            disabled={syncing}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 flex items-center gap-2"
          >
            {syncing ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                Syncing...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Sync Now
              </>
            )}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow p-4 border-l-4 border-blue-500">
          <p className="text-sm text-gray-500">Total Tracking</p>
          <p className="text-2xl font-bold text-blue-600">{stats.total}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4 border-l-4 border-green-500">
          <p className="text-sm text-gray-500">Available</p>
          <p className="text-2xl font-bold text-green-600">{stats.available}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4 border-l-4 border-red-500">
          <p className="text-sm text-gray-500">On Hold</p>
          <p className="text-2xl font-bold text-red-600">{stats.onHold}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4 border-l-4 border-orange-500">
          <p className="text-sm text-gray-500">LFD Alert</p>
          <p className="text-2xl font-bold text-orange-600">{stats.lfdAlert}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow">
        <div className="border-b px-6">
          <div className="flex gap-4">
            {[
              { id: 'containers', label: `Containers (${containers.length})` },
              { id: 'settings', label: '⚙️ eModal Settings' },
              { id: 'logs', label: '📋 Sync Logs' },
            ].map(tab => (
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
          {/* Containers Tab */}
          {activeTab === 'containers' && (
            <>
              {/* Filters */}
              <div className="flex gap-4 items-center mb-6 flex-wrap">
                <input
                  type="text"
                  placeholder="Search container, reference..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="px-4 py-2 border rounded-lg w-64"
                />
                <select
                  value={filterTerminal}
                  onChange={e => setFilterTerminal(e.target.value)}
                  className="px-4 py-2 border rounded-lg"
                >
                  <option value="">All Terminals</option>
                  {TERMINALS.map(t => (
                    <option key={t.code} value={t.code}>{t.name}</option>
                  ))}
                </select>
                <select
                  value={filterStatus}
                  onChange={e => setFilterStatus(e.target.value)}
                  className="px-4 py-2 border rounded-lg"
                >
                  <option value="">All Status</option>
                  <option value="AVAILABLE">Available</option>
                  <option value="NOT_AVAILABLE">Not Available</option>
                  <option value="ON_HOLD">On Hold</option>
                  <option value="IN_YARD">In Yard</option>
                </select>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={filterHoldsOnly}
                    onChange={e => setFilterHoldsOnly(e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-sm">Holds Only</span>
                </label>
              </div>

              {/* Container Table */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Container</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Terminal</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Holds</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vessel</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">LFD</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Check</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredContainers.map(container => (
                      <tr key={container.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="font-mono font-bold">{container.container_number}</div>
                          <div className="text-xs text-gray-500">{container.shipments?.reference_number}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium">{container.terminal_name}</div>
                          <div className="text-xs text-gray-500">{container.yard_location}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(container.availability_status)}`}>
                            {container.availability_status || 'UNKNOWN'}
                          </span>
                          {container.emodal_status && (
                            <div className="text-xs text-gray-500 mt-1">{container.emodal_status}</div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {container.has_customs_hold && (
                              <span className="px-1.5 py-0.5 bg-red-100 text-red-700 text-xs rounded">🛃 Customs</span>
                            )}
                            {container.has_freight_hold && (
                              <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 text-xs rounded">📦 Freight</span>
                            )}
                            {container.has_usda_hold && (
                              <span className="px-1.5 py-0.5 bg-yellow-100 text-yellow-700 text-xs rounded">🌿 USDA</span>
                            )}
                            {container.has_tmf_hold && (
                              <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 text-xs rounded">💰 TMF</span>
                            )}
                            {!container.has_customs_hold && !container.has_freight_hold && !container.has_usda_hold && !container.has_tmf_hold && (
                              <span className="text-green-600 text-sm">✓ Clear</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {container.vessel_name || '-'}
                          {container.voyage_number && <span className="text-gray-500 ml-1">/ {container.voyage_number}</span>}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`font-semibold ${isLfdUrgent(container.last_free_day) ? 'text-red-600' : ''}`}>
                            {formatDate(container.last_free_day)}
                          </span>
                          {container.demurrage_amount > 0 && (
                            <div className="text-xs text-red-600">${container.demurrage_amount} demurrage</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <div>{container.shipments?.customer_name || '-'}</div>
                          <div className="text-xs text-gray-500">→ {container.shipments?.delivery_city}</div>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">
                          {formatDateTime(container.last_checked_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredContainers.length === 0 && (
                  <div className="text-center py-12 text-gray-500">
                    No containers found
                  </div>
                )}
              </div>
            </>
          )}

          {/* Settings Tab */}
          {activeTab === 'settings' && (
            <div className="max-w-2xl">
              <h3 className="text-lg font-semibold mb-6">eModal API Configuration</h3>
              
              <div className="space-y-6">
                <div className="p-4 bg-blue-50 rounded-lg">
                  <h4 className="font-medium text-blue-800 mb-2">📡 About eModal Integration</h4>
                  <p className="text-sm text-blue-700">
                    eModal provides real-time container availability, holds status, and appointment information 
                    from LA/LB and Oakland terminals. Configure your API credentials below to enable automatic sync.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">API Username</label>
                    <input
                      type="text"
                      value={configForm.api_username}
                      onChange={e => setConfigForm({ ...configForm, api_username: e.target.value })}
                      className="w-full px-4 py-2 border rounded-lg"
                      placeholder="Your eModal username"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">API Password</label>
                    <input
                      type="password"
                      value={configForm.api_password}
                      onChange={e => setConfigForm({ ...configForm, api_password: e.target.value })}
                      className="w-full px-4 py-2 border rounded-lg"
                      placeholder={config?.api_password_encrypted ? '••••••••' : 'Enter password'}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">API Key (if applicable)</label>
                  <input
                    type="text"
                    value={configForm.api_key}
                    onChange={e => setConfigForm({ ...configForm, api_key: e.target.value })}
                    className="w-full px-4 py-2 border rounded-lg font-mono text-sm"
                    placeholder="Optional API key"
                  />
                </div>

                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={configForm.auto_refresh_enabled}
                      onChange={e => setConfigForm({ ...configForm, auto_refresh_enabled: e.target.checked })}
                      className="rounded"
                    />
                    <span>Enable Auto-Refresh</span>
                  </label>
                </div>

                {configForm.auto_refresh_enabled && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Refresh Interval</label>
                    <select
                      value={configForm.refresh_interval_minutes}
                      onChange={e => setConfigForm({ ...configForm, refresh_interval_minutes: parseInt(e.target.value) })}
                      className="px-4 py-2 border rounded-lg"
                    >
                      <option value={15}>Every 15 minutes</option>
                      <option value={30}>Every 30 minutes</option>
                      <option value={60}>Every hour</option>
                      <option value={120}>Every 2 hours</option>
                      <option value={360}>Every 6 hours</option>
                    </select>
                  </div>
                )}

                <div className="flex gap-4">
                  <button
                    onClick={saveConfig}
                    disabled={savingConfig}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
                  >
                    {savingConfig ? 'Saving...' : 'Save Configuration'}
                  </button>
                  <button
                    onClick={triggerSync}
                    disabled={syncing}
                    className="px-6 py-2 border rounded-lg hover:bg-gray-50"
                  >
                    Test Connection
                  </button>
                </div>

                {config && (
                  <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                    <h4 className="font-medium mb-2">Current Status</h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-500">Last Sync:</span>
                        <span className="ml-2">{config.last_sync_at ? formatDateTime(config.last_sync_at) : 'Never'}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Status:</span>
                        <span className={`ml-2 ${config.sync_status === 'SUCCESS' ? 'text-green-600' : 'text-red-600'}`}>
                          {config.sync_status || 'Unknown'}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Containers Synced:</span>
                        <span className="ml-2">{config.containers_synced || 0}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Errors:</span>
                        <span className="ml-2">{config.errors_count || 0}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Logs Tab */}
          {activeTab === 'logs' && (
            <div>
              <h3 className="text-lg font-semibold mb-4">Sync History</h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Updated</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Failed</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Duration</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Error</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {syncLogs.map(log => (
                      <tr key={log.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm">{formatDateTime(log.synced_at)}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded-full text-xs ${
                            log.status === 'SUCCESS' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {log.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">{log.containers_updated}</td>
                        <td className="px-4 py-3 text-sm text-red-600">{log.containers_failed || 0}</td>
                        <td className="px-4 py-3 text-sm">{log.duration_ms}ms</td>
                        <td className="px-4 py-3 text-sm text-red-600">{log.error_message || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {syncLogs.length === 0 && (
                  <div className="text-center py-12 text-gray-500">No sync logs yet</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
