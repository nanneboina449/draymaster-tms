'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

interface Terminal {
  id: string;
  code: string;
  name: string;
  port: string;
  emodal_enabled: boolean;
  default_free_days: number;
}

interface ContainerTracking {
  id: string;
  container_number: string;
  shipment_id: string;
  terminal_code: string;
  terminal_name: string;
  emodal_status: string;
  availability_status: string;
  has_freight_hold: boolean;
  has_customs_hold: boolean;
  has_usda_hold: boolean;
  has_tmf_hold: boolean;
  hold_details: string;
  yard_location: string;
  vessel_name: string;
  voyage_number: string;
  vessel_eta: string;
  discharge_date: string;
  last_free_day: string;
  outgate_date: string;
  appointment_date: string;
  appointment_number: string;
  appointment_status: string;
  container_size: string;
  container_type: string;
  estimated_demurrage: number;
  estimated_per_diem: number;
  last_checked_at: string;
}

interface EmodalConfig {
  id: string;
  username: string;
  auto_refresh_enabled: boolean;
  refresh_interval_minutes: number;
  last_sync_at: string;
  last_sync_status: string;
}

export default function TrackingPage() {
  const [activeTab, setActiveTab] = useState<'containers' | 'terminals' | 'settings' | 'history'>('containers');
  const [containers, setContainers] = useState<ContainerTracking[]>([]);
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [config, setConfig] = useState<EmodalConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  // Filters
  const [filterTerminal, setFilterTerminal] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterHolds, setFilterHolds] = useState(false);
  const [searchContainer, setSearchContainer] = useState('');

  // Add container modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newContainer, setNewContainer] = useState({
    container_number: '',
    terminal_code: '',
    vessel_name: '',
    voyage_number: '',
    last_free_day: '',
    container_size: '40',
    container_type: 'DRY',
  });

  // Edit modal
  const [editingContainer, setEditingContainer] = useState<ContainerTracking | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: containersData } = await supabase
        .from('container_tracking')
        .select('*')
        .order('last_checked_at', { ascending: false });
      setContainers(containersData || []);

      const { data: terminalsData } = await supabase
        .from('terminal_configs')
        .select('*')
        .eq('is_active', true)
        .order('port, name');
      setTerminals(terminalsData || []);

      const { data: configData } = await supabase
        .from('emodal_config')
        .select('*')
        .limit(1)
        .single();
      setConfig(configData);

    } catch (err) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const addContainer = async () => {
    if (!newContainer.container_number || !newContainer.terminal_code) {
      alert('Please enter container number and select terminal');
      return;
    }

    try {
      const terminal = terminals.find(t => t.code === newContainer.terminal_code);
      
      const { error } = await supabase.from('container_tracking').insert({
        ...newContainer,
        terminal_name: terminal?.name,
        availability_status: 'UNKNOWN',
        last_checked_at: new Date().toISOString(),
      });

      if (error) throw error;

      alert('Container added successfully!');
      setShowAddModal(false);
      setNewContainer({
        container_number: '',
        terminal_code: '',
        vessel_name: '',
        voyage_number: '',
        last_free_day: '',
        container_size: '40',
        container_type: 'DRY',
      });
      fetchData();
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const updateContainer = async () => {
    if (!editingContainer) return;

    try {
      const { error } = await supabase
        .from('container_tracking')
        .update({
          emodal_status: editingContainer.emodal_status,
          availability_status: editingContainer.availability_status,
          has_customs_hold: editingContainer.has_customs_hold,
          has_freight_hold: editingContainer.has_freight_hold,
          has_usda_hold: editingContainer.has_usda_hold,
          has_tmf_hold: editingContainer.has_tmf_hold,
          hold_details: editingContainer.hold_details,
          yard_location: editingContainer.yard_location,
          last_free_day: editingContainer.last_free_day,
          appointment_date: editingContainer.appointment_date,
          appointment_number: editingContainer.appointment_number,
          appointment_status: editingContainer.appointment_status,
          estimated_demurrage: editingContainer.estimated_demurrage,
          last_checked_at: new Date().toISOString(),
        })
        .eq('id', editingContainer.id);

      if (error) throw error;

      // Log history
      await supabase.from('container_tracking_history').insert({
        container_number: editingContainer.container_number,
        tracking_id: editingContainer.id,
        status: editingContainer.emodal_status,
        availability_status: editingContainer.availability_status,
        holds: {
          customs: editingContainer.has_customs_hold,
          freight: editingContainer.has_freight_hold,
          usda: editingContainer.has_usda_hold,
          tmf: editingContainer.has_tmf_hold,
        },
        yard_location: editingContainer.yard_location,
        source: 'MANUAL',
      });

      setEditingContainer(null);
      fetchData();
      alert('Container updated!');
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const simulateEmodalSync = async () => {
    setSyncing(true);
    
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 2000));

    try {
      // In production, this would call eModal API
      // For demo, we'll update containers with simulated data
      const updates = containers.slice(0, 5).map(async (container) => {
        const statuses = ['AVAILABLE', 'NOT_AVAILABLE', 'ON_HOLD', 'DISCHARGED'];
        const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
        
        await supabase
          .from('container_tracking')
          .update({
            availability_status: randomStatus,
            emodal_status: randomStatus === 'AVAILABLE' ? 'READY FOR PICKUP' : randomStatus,
            has_customs_hold: Math.random() > 0.8,
            has_freight_hold: Math.random() > 0.9,
            last_checked_at: new Date().toISOString(),
          })
          .eq('id', container.id);

        // Log history
        await supabase.from('container_tracking_history').insert({
          container_number: container.container_number,
          tracking_id: container.id,
          status: randomStatus,
          availability_status: randomStatus,
          source: 'EMODAL',
        });
      });

      await Promise.all(updates);

      // Update config
      await supabase
        .from('emodal_config')
        .update({
          last_sync_at: new Date().toISOString(),
          last_sync_status: 'SUCCESS',
        })
        .eq('id', config?.id);

      alert('eModal sync completed! (Simulated)');
      fetchData();
    } catch (err: any) {
      alert('Sync error: ' + err.message);
    } finally {
      setSyncing(false);
    }
  };

  const updateEmodalConfig = async (updates: Partial<EmodalConfig>) => {
    if (!config) return;

    try {
      await supabase
        .from('emodal_config')
        .update(updates)
        .eq('id', config.id);
      
      setConfig({ ...config, ...updates });
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      'AVAILABLE': 'bg-green-100 text-green-800',
      'READY FOR PICKUP': 'bg-green-100 text-green-800',
      'NOT_AVAILABLE': 'bg-red-100 text-red-800',
      'ON_HOLD': 'bg-orange-100 text-orange-800',
      'DISCHARGED': 'bg-blue-100 text-blue-800',
      'INBOUND': 'bg-purple-100 text-purple-800',
      'DEPARTED': 'bg-gray-100 text-gray-800',
      'UNKNOWN': 'bg-gray-100 text-gray-600',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const filteredContainers = containers.filter(c => {
    if (filterTerminal && c.terminal_code !== filterTerminal) return false;
    if (filterStatus && c.availability_status !== filterStatus) return false;
    if (filterHolds && !c.has_customs_hold && !c.has_freight_hold && !c.has_usda_hold) return false;
    if (searchContainer && !c.container_number.toLowerCase().includes(searchContainer.toLowerCase())) return false;
    return true;
  });

  // Stats
  const stats = {
    total: containers.length,
    available: containers.filter(c => c.availability_status === 'AVAILABLE').length,
    onHold: containers.filter(c => c.has_customs_hold || c.has_freight_hold).length,
    pastLFD: containers.filter(c => c.last_free_day && new Date(c.last_free_day) < new Date()).length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Container Tracking</h1>
          <p className="text-gray-500 mt-1">Track container status, holds, and availability via eModal</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={simulateEmodalSync}
            disabled={syncing}
            className="px-4 py-2 border rounded-lg hover:bg-gray-50 flex items-center gap-2"
          >
            {syncing ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                Syncing...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Sync eModal
              </>
            )}
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            + Add Container
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow p-4 border-l-4 border-blue-500">
          <p className="text-sm text-gray-500">Total Tracking</p>
          <p className="text-2xl font-bold text-blue-600">{stats.total}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4 border-l-4 border-green-500">
          <p className="text-sm text-gray-500">Available</p>
          <p className="text-2xl font-bold text-green-600">{stats.available}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4 border-l-4 border-orange-500">
          <p className="text-sm text-gray-500">On Hold</p>
          <p className="text-2xl font-bold text-orange-600">{stats.onHold}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4 border-l-4 border-red-500">
          <p className="text-sm text-gray-500">Past LFD</p>
          <p className="text-2xl font-bold text-red-600">{stats.pastLFD}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow">
        <div className="border-b px-6">
          <div className="flex gap-4">
            {[
              { id: 'containers', label: 'Containers' },
              { id: 'terminals', label: 'Terminals' },
              { id: 'settings', label: 'eModal Settings' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`py-3 px-4 font-medium border-b-2 transition ${
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
            </div>
          ) : (
            <>
              {/* Containers Tab */}
              {activeTab === 'containers' && (
                <div>
                  {/* Filters */}
                  <div className="flex gap-4 mb-6">
                    <input
                      placeholder="Search container #..."
                      value={searchContainer}
                      onChange={e => setSearchContainer(e.target.value)}
                      className="flex-1 px-4 py-2 border rounded-lg"
                    />
                    <select
                      value={filterTerminal}
                      onChange={e => setFilterTerminal(e.target.value)}
                      className="px-4 py-2 border rounded-lg"
                    >
                      <option value="">All Terminals</option>
                      {terminals.map(t => (
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
                      <option value="DISCHARGED">Discharged</option>
                    </select>
                    <label className="flex items-center gap-2 px-4 py-2 border rounded-lg cursor-pointer">
                      <input
                        type="checkbox"
                        checked={filterHolds}
                        onChange={e => setFilterHolds(e.target.checked)}
                      />
                      <span>With Holds Only</span>
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
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Appointment</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Check</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {filteredContainers.map(ct => (
                          <tr key={ct.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3">
                              <span className="font-mono font-bold">{ct.container_number}</span>
                              <br/>
                              <span className="text-xs text-gray-500">{ct.container_size}' {ct.container_type}</span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="font-medium">{ct.terminal_code}</span>
                              <br/>
                              <span className="text-xs text-gray-500">{ct.yard_location || '-'}</span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-1 rounded-full text-xs ${getStatusColor(ct.availability_status || '')}`}>
                                {ct.availability_status || 'UNKNOWN'}
                              </span>
                              {ct.emodal_status && ct.emodal_status !== ct.availability_status && (
                                <p className="text-xs text-gray-500 mt-1">{ct.emodal_status}</p>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap gap-1">
                                {ct.has_customs_hold && (
                                  <span className="px-1.5 py-0.5 bg-red-100 text-red-700 text-xs rounded">🛃 Customs</span>
                                )}
                                {ct.has_freight_hold && (
                                  <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 text-xs rounded">📦 Freight</span>
                                )}
                                {ct.has_usda_hold && (
                                  <span className="px-1.5 py-0.5 bg-yellow-100 text-yellow-700 text-xs rounded">🌿 USDA</span>
                                )}
                                {ct.has_tmf_hold && (
                                  <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 text-xs rounded">TMF</span>
                                )}
                                {!ct.has_customs_hold && !ct.has_freight_hold && !ct.has_usda_hold && !ct.has_tmf_hold && (
                                  <span className="text-green-600 text-sm">✓ Clear</span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm">
                              {ct.vessel_name || '-'}
                              {ct.voyage_number && <span className="text-gray-500"> / {ct.voyage_number}</span>}
                            </td>
                            <td className="px-4 py-3">
                              {ct.last_free_day ? (
                                <span className={`font-semibold ${new Date(ct.last_free_day) < new Date() ? 'text-red-600' : ''}`}>
                                  {new Date(ct.last_free_day).toLocaleDateString()}
                                </span>
                              ) : '-'}
                              {ct.estimated_demurrage > 0 && (
                                <p className="text-xs text-red-500">${ct.estimated_demurrage} est.</p>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm">
                              {ct.appointment_date ? (
                                <>
                                  {new Date(ct.appointment_date).toLocaleDateString()}
                                  <br/>
                                  <span className="text-xs text-gray-500">{ct.appointment_number}</span>
                                </>
                              ) : (
                                <span className="text-gray-400">Not scheduled</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-500">
                              {ct.last_checked_at ? new Date(ct.last_checked_at).toLocaleString() : '-'}
                            </td>
                            <td className="px-4 py-3">
                              <button
                                onClick={() => setEditingContainer(ct)}
                                className="text-blue-600 hover:underline text-sm"
                              >
                                Edit
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {filteredContainers.length === 0 && (
                      <div className="text-center py-12 text-gray-500">
                        No containers found. Add containers to track or sync with eModal.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Terminals Tab */}
              {activeTab === 'terminals' && (
                <div className="grid grid-cols-3 gap-4">
                  {terminals.map(terminal => (
                    <div key={terminal.id} className="border rounded-lg p-4 hover:shadow-md transition">
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="font-bold text-lg">{terminal.code}</h3>
                        <span className={`px-2 py-0.5 rounded text-xs ${terminal.emodal_enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                          {terminal.emodal_enabled ? 'eModal Enabled' : 'Manual'}
                        </span>
                      </div>
                      <p className="text-gray-600">{terminal.name}</p>
                      <p className="text-sm text-gray-500 mt-1">{terminal.port}</p>
                      <div className="mt-3 pt-3 border-t flex justify-between text-sm">
                        <span className="text-gray-500">Free Days:</span>
                        <span className="font-semibold">{terminal.default_free_days}</span>
                      </div>
                      <div className="flex justify-between text-sm mt-1">
                        <span className="text-gray-500">Containers:</span>
                        <span className="font-semibold">
                          {containers.filter(c => c.terminal_code === terminal.code).length}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Settings Tab */}
              {activeTab === 'settings' && (
                <div className="max-w-2xl space-y-6">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h3 className="font-semibold text-blue-800 flex items-center gap-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      About eModal Integration
                    </h3>
                    <p className="text-sm text-blue-700 mt-2">
                      eModal provides container tracking for major US ports. Configure your credentials below to enable automatic container status updates, hold information, and appointment scheduling.
                    </p>
                  </div>

                  <div className="border rounded-lg p-6 space-y-4">
                    <h3 className="font-semibold text-lg">eModal API Credentials</h3>
                    
                    <div>
                      <label className="block text-sm font-medium mb-1">Username</label>
                      <input
                        type="text"
                        value={config?.username || ''}
                        onChange={e => setConfig(config ? { ...config, username: e.target.value } : null)}
                        className="w-full px-4 py-2 border rounded-lg"
                        placeholder="eModal username"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-1">Password</label>
                      <input
                        type="password"
                        className="w-full px-4 py-2 border rounded-lg"
                        placeholder="••••••••"
                      />
                      <p className="text-xs text-gray-500 mt-1">Password is encrypted before storage</p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-1">API Key (if applicable)</label>
                      <input
                        type="password"
                        className="w-full px-4 py-2 border rounded-lg"
                        placeholder="••••••••"
                      />
                    </div>

                    <button
                      onClick={() => alert('Credentials saved! (Demo)')}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      Save Credentials
                    </button>
                  </div>

                  <div className="border rounded-lg p-6 space-y-4">
                    <h3 className="font-semibold text-lg">Auto-Refresh Settings</h3>

                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                      <div>
                        <p className="font-medium">Enable Auto-Refresh</p>
                        <p className="text-sm text-gray-500">Automatically sync container status at set intervals</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={config?.auto_refresh_enabled || false}
                          onChange={e => updateEmodalConfig({ auto_refresh_enabled: e.target.checked })}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-1">Refresh Interval (minutes)</label>
                      <select
                        value={config?.refresh_interval_minutes || 60}
                        onChange={e => updateEmodalConfig({ refresh_interval_minutes: parseInt(e.target.value) })}
                        className="w-full px-4 py-2 border rounded-lg"
                      >
                        <option value={15}>Every 15 minutes</option>
                        <option value={30}>Every 30 minutes</option>
                        <option value={60}>Every hour</option>
                        <option value={120}>Every 2 hours</option>
                        <option value={360}>Every 6 hours</option>
                      </select>
                    </div>
                  </div>

                  <div className="border rounded-lg p-6">
                    <h3 className="font-semibold text-lg mb-4">Sync Status</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-500">Last Sync</p>
                        <p className="font-semibold">
                          {config?.last_sync_at ? new Date(config.last_sync_at).toLocaleString() : 'Never'}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Status</p>
                        <p className={`font-semibold ${config?.last_sync_status === 'SUCCESS' ? 'text-green-600' : 'text-gray-600'}`}>
                          {config?.last_sync_status || 'N/A'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Add Container Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => setShowAddModal(false)}></div>
          <div className="relative min-h-screen flex items-center justify-center p-4">
            <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg">
              <div className="bg-blue-600 px-6 py-4 rounded-t-xl">
                <h2 className="text-xl font-bold text-white">Add Container to Track</h2>
              </div>

              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Container Number *</label>
                  <input
                    value={newContainer.container_number}
                    onChange={e => setNewContainer({ ...newContainer, container_number: e.target.value.toUpperCase() })}
                    className="w-full px-4 py-2 border rounded-lg font-mono"
                    placeholder="ABCD1234567"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Terminal *</label>
                  <select
                    value={newContainer.terminal_code}
                    onChange={e => setNewContainer({ ...newContainer, terminal_code: e.target.value })}
                    className="w-full px-4 py-2 border rounded-lg"
                  >
                    <option value="">Select terminal...</option>
                    {terminals.map(t => (
                      <option key={t.code} value={t.code}>{t.code} - {t.name}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Container Size</label>
                    <select
                      value={newContainer.container_size}
                      onChange={e => setNewContainer({ ...newContainer, container_size: e.target.value })}
                      className="w-full px-4 py-2 border rounded-lg"
                    >
                      <option value="20">20'</option>
                      <option value="40">40'</option>
                      <option value="40HC">40' HC</option>
                      <option value="45">45'</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Container Type</label>
                    <select
                      value={newContainer.container_type}
                      onChange={e => setNewContainer({ ...newContainer, container_type: e.target.value })}
                      className="w-full px-4 py-2 border rounded-lg"
                    >
                      <option value="DRY">Dry</option>
                      <option value="REEFER">Reefer</option>
                      <option value="FLAT">Flat Rack</option>
                      <option value="TANK">Tank</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Vessel</label>
                    <input
                      value={newContainer.vessel_name}
                      onChange={e => setNewContainer({ ...newContainer, vessel_name: e.target.value })}
                      className="w-full px-4 py-2 border rounded-lg"
                      placeholder="Vessel name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Voyage</label>
                    <input
                      value={newContainer.voyage_number}
                      onChange={e => setNewContainer({ ...newContainer, voyage_number: e.target.value })}
                      className="w-full px-4 py-2 border rounded-lg"
                      placeholder="Voyage #"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Last Free Day</label>
                  <input
                    type="date"
                    value={newContainer.last_free_day}
                    onChange={e => setNewContainer({ ...newContainer, last_free_day: e.target.value })}
                    className="w-full px-4 py-2 border rounded-lg"
                  />
                </div>
              </div>

              <div className="px-6 py-4 bg-gray-50 border-t flex justify-end gap-2 rounded-b-xl">
                <button
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  onClick={addContainer}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Add Container
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Container Modal */}
      {editingContainer && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => setEditingContainer(null)}></div>
          <div className="relative min-h-screen flex items-center justify-center p-4">
            <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-hidden">
              <div className="bg-blue-600 px-6 py-4">
                <h2 className="text-xl font-bold text-white">Update Container Status</h2>
                <p className="text-blue-200">{editingContainer.container_number}</p>
              </div>

              <div className="p-6 space-y-4 overflow-y-auto max-h-[60vh]">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Status</label>
                    <select
                      value={editingContainer.emodal_status || ''}
                      onChange={e => setEditingContainer({ ...editingContainer, emodal_status: e.target.value })}
                      className="w-full px-4 py-2 border rounded-lg"
                    >
                      <option value="">Select...</option>
                      <option value="INBOUND">Inbound</option>
                      <option value="DISCHARGED">Discharged</option>
                      <option value="AVAILABLE">Available</option>
                      <option value="NOT_AVAILABLE">Not Available</option>
                      <option value="ON_HOLD">On Hold</option>
                      <option value="DEPARTED">Departed</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Availability</label>
                    <select
                      value={editingContainer.availability_status || ''}
                      onChange={e => setEditingContainer({ ...editingContainer, availability_status: e.target.value })}
                      className="w-full px-4 py-2 border rounded-lg"
                    >
                      <option value="UNKNOWN">Unknown</option>
                      <option value="AVAILABLE">Available</option>
                      <option value="NOT_AVAILABLE">Not Available</option>
                      <option value="ON_HOLD">On Hold</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Holds</label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex items-center gap-2 p-2 border rounded-lg cursor-pointer hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={editingContainer.has_customs_hold}
                        onChange={e => setEditingContainer({ ...editingContainer, has_customs_hold: e.target.checked })}
                      />
                      <span>🛃 Customs Hold</span>
                    </label>
                    <label className="flex items-center gap-2 p-2 border rounded-lg cursor-pointer hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={editingContainer.has_freight_hold}
                        onChange={e => setEditingContainer({ ...editingContainer, has_freight_hold: e.target.checked })}
                      />
                      <span>📦 Freight Hold</span>
                    </label>
                    <label className="flex items-center gap-2 p-2 border rounded-lg cursor-pointer hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={editingContainer.has_usda_hold}
                        onChange={e => setEditingContainer({ ...editingContainer, has_usda_hold: e.target.checked })}
                      />
                      <span>🌿 USDA Hold</span>
                    </label>
                    <label className="flex items-center gap-2 p-2 border rounded-lg cursor-pointer hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={editingContainer.has_tmf_hold}
                        onChange={e => setEditingContainer({ ...editingContainer, has_tmf_hold: e.target.checked })}
                      />
                      <span>TMF Hold</span>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Yard Location</label>
                  <input
                    value={editingContainer.yard_location || ''}
                    onChange={e => setEditingContainer({ ...editingContainer, yard_location: e.target.value })}
                    className="w-full px-4 py-2 border rounded-lg"
                    placeholder="e.g., Block A, Row 5"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Last Free Day</label>
                  <input
                    type="date"
                    value={editingContainer.last_free_day?.split('T')[0] || ''}
                    onChange={e => setEditingContainer({ ...editingContainer, last_free_day: e.target.value })}
                    className="w-full px-4 py-2 border rounded-lg"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Appointment Date</label>
                    <input
                      type="datetime-local"
                      value={editingContainer.appointment_date?.slice(0, 16) || ''}
                      onChange={e => setEditingContainer({ ...editingContainer, appointment_date: e.target.value })}
                      className="w-full px-4 py-2 border rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Appointment #</label>
                    <input
                      value={editingContainer.appointment_number || ''}
                      onChange={e => setEditingContainer({ ...editingContainer, appointment_number: e.target.value })}
                      className="w-full px-4 py-2 border rounded-lg"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Estimated Demurrage ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editingContainer.estimated_demurrage || 0}
                    onChange={e => setEditingContainer({ ...editingContainer, estimated_demurrage: parseFloat(e.target.value) })}
                    className="w-full px-4 py-2 border rounded-lg"
                  />
                </div>
              </div>

              <div className="px-6 py-4 bg-gray-50 border-t flex justify-end gap-2">
                <button
                  onClick={() => setEditingContainer(null)}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  onClick={updateContainer}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Update Container
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
