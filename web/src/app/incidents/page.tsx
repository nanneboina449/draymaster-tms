'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface IncidentType {
  id: string;
  code: string;
  name: string;
  severity: string;
  requires_report: boolean;
  auto_notify: boolean;
}

interface Incident {
  id: string;
  incident_number: string;
  incident_type_code: string;
  incident_type?: IncidentType;
  order_id?: string;
  trip_id?: string;
  container_id?: string;
  driver_id?: string;
  title: string;
  description: string;
  location: string;
  occurred_at: string;
  reported_at: string;
  reported_by: string;
  severity: string;
  status: string;
  resolution_notes?: string;
  resolved_at?: string;
  resolved_by?: string;
  estimated_cost?: number;
  actual_cost?: number;
  insurance_claim_number?: string;
  // Related data
  order_number?: string;
  container_number?: string;
  driver_name?: string;
}

interface ExceptionAlert {
  id: string;
  alert_type: string;
  severity: string;
  order_id?: string;
  container_id?: string;
  driver_id?: string;
  title: string;
  message: string;
  status: string;
  acknowledged_by?: string;
  acknowledged_at?: string;
  created_at: string;
}

export default function IncidentsPage() {
  const [activeTab, setActiveTab] = useState<'incidents' | 'alerts' | 'types'>('incidents');
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [incidentTypes, setIncidentTypes] = useState<IncidentType[]>([]);
  const [alerts, setAlerts] = useState<ExceptionAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('OPEN');
  const [filterSeverity, setFilterSeverity] = useState('ALL');

  // Modal states
  const [isIncidentModalOpen, setIsIncidentModalOpen] = useState(false);
  const [viewingIncident, setViewingIncident] = useState<Incident | null>(null);
  const [incidentForm, setIncidentForm] = useState({
    incident_type_code: '',
    title: '',
    description: '',
    location: '',
    occurred_at: new Date().toISOString().slice(0, 16),
    reported_by: 'Dispatcher',
    severity: 'MEDIUM',
    order_id: '',
    container_id: '',
    driver_id: '',
    estimated_cost: '',
  });

  // Related entities for dropdowns
  const [orders, setOrders] = useState<any[]>([]);
  const [containers, setContainers] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);

  useEffect(() => {
    fetchData();
    fetchRelatedEntities();
  }, [filterStatus, filterSeverity]);

  const fetchData = async () => {
    try {
      setLoading(true);

      // Fetch incidents
      let query = supabase
        .from('incidents')
        .select(`
          *,
          order:orders(order_number),
          container:containers(container_number),
          driver:drivers(first_name, last_name)
        `)
        .order('occurred_at', { ascending: false })
        .limit(100);

      if (filterStatus !== 'ALL') {
        query = query.eq('status', filterStatus);
      }
      if (filterSeverity !== 'ALL') {
        query = query.eq('severity', filterSeverity);
      }

      const { data: incidentsData, error: incidentsError } = await query;
      if (incidentsError) throw incidentsError;

      setIncidents((incidentsData || []).map((inc: any) => ({
        ...inc,
        order_number: inc.order?.order_number,
        container_number: inc.container?.container_number,
        driver_name: inc.driver ? `${inc.driver.first_name} ${inc.driver.last_name}` : null,
      })));

      // Fetch incident types
      const { data: typesData } = await supabase.from('incident_types').select('*').order('severity');
      setIncidentTypes(typesData || []);

      // Fetch alerts
      const { data: alertsData } = await supabase
        .from('exception_alerts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      setAlerts(alertsData || []);

    } catch (err: any) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchRelatedEntities = async () => {
    // Fetch recent orders
    const { data: ordersData } = await supabase
      .from('orders')
      .select('id, order_number')
      .order('created_at', { ascending: false })
      .limit(50);
    setOrders(ordersData || []);

    // Fetch containers
    const { data: containersData } = await supabase
      .from('containers')
      .select('id, container_number')
      .order('created_at', { ascending: false })
      .limit(50);
    setContainers(containersData || []);

    // Fetch drivers
    const { data: driversData } = await supabase
      .from('drivers')
      .select('id, first_name, last_name')
      .eq('status', 'ACTIVE');
    setDrivers(driversData || []);
  };

  const openCreateModal = () => {
    setIncidentForm({
      incident_type_code: '',
      title: '',
      description: '',
      location: '',
      occurred_at: new Date().toISOString().slice(0, 16),
      reported_by: 'Dispatcher',
      severity: 'MEDIUM',
      order_id: '',
      container_id: '',
      driver_id: '',
      estimated_cost: '',
    });
    setIsIncidentModalOpen(true);
  };

  const createIncident = async () => {
    try {
      const type = incidentTypes.find(t => t.code === incidentForm.incident_type_code);

      const { error } = await supabase.from('incidents').insert({
        incident_type_code: incidentForm.incident_type_code,
        title: incidentForm.title || type?.name || 'Incident',
        description: incidentForm.description,
        location: incidentForm.location,
        occurred_at: incidentForm.occurred_at,
        reported_by: incidentForm.reported_by,
        severity: type?.severity || incidentForm.severity,
        status: 'OPEN',
        order_id: incidentForm.order_id || null,
        container_id: incidentForm.container_id || null,
        driver_id: incidentForm.driver_id || null,
        estimated_cost: incidentForm.estimated_cost ? parseFloat(incidentForm.estimated_cost) : null,
      });

      if (error) throw error;

      setIsIncidentModalOpen(false);
      fetchData();
    } catch (err: any) {
      alert('Error creating incident: ' + err.message);
    }
  };

  const updateIncidentStatus = async (incidentId: string, status: string) => {
    try {
      const updates: any = { status, updated_at: new Date().toISOString() };
      if (status === 'RESOLVED' || status === 'CLOSED') {
        updates.resolved_at = new Date().toISOString();
        updates.resolved_by = 'Dispatcher';
      }
      await supabase.from('incidents').update(updates).eq('id', incidentId);
      fetchData();
      if (viewingIncident?.id === incidentId) {
        setViewingIncident({ ...viewingIncident, status, ...updates });
      }
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const addResolutionNotes = async (incidentId: string) => {
    const notes = prompt('Enter resolution notes:');
    if (!notes) return;
    await supabase.from('incidents').update({
      resolution_notes: notes,
      updated_at: new Date().toISOString(),
    }).eq('id', incidentId);
    fetchData();
  };

  const acknowledgeAlert = async (alertId: string) => {
    await supabase.from('exception_alerts').update({
      status: 'ACKNOWLEDGED',
      acknowledged_by: 'Dispatcher',
      acknowledged_at: new Date().toISOString(),
    }).eq('id', alertId);
    fetchData();
  };

  const resolveAlert = async (alertId: string) => {
    await supabase.from('exception_alerts').update({
      status: 'RESOLVED',
      resolved_at: new Date().toISOString(),
    }).eq('id', alertId);
    fetchData();
  };

  const dismissAlert = async (alertId: string) => {
    await supabase.from('exception_alerts').update({
      status: 'DISMISSED',
    }).eq('id', alertId);
    fetchData();
  };

  const getSeverityBadge = (severity: string) => {
    const styles: Record<string, string> = {
      'LOW': 'bg-gray-100 text-gray-800',
      'MEDIUM': 'bg-yellow-100 text-yellow-800',
      'HIGH': 'bg-orange-100 text-orange-800',
      'CRITICAL': 'bg-red-100 text-red-800',
    };
    return styles[severity] || 'bg-gray-100 text-gray-800';
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      'OPEN': 'bg-red-100 text-red-800',
      'INVESTIGATING': 'bg-yellow-100 text-yellow-800',
      'RESOLVED': 'bg-green-100 text-green-800',
      'CLOSED': 'bg-gray-100 text-gray-800',
      'NEW': 'bg-blue-100 text-blue-800',
      'ACKNOWLEDGED': 'bg-yellow-100 text-yellow-800',
      'IN_PROGRESS': 'bg-purple-100 text-purple-800',
      'DISMISSED': 'bg-gray-100 text-gray-500',
    };
    return styles[status] || 'bg-gray-100 text-gray-800';
  };

  // Stats
  const stats = {
    open: incidents.filter(i => i.status === 'OPEN').length,
    investigating: incidents.filter(i => i.status === 'INVESTIGATING').length,
    critical: incidents.filter(i => i.severity === 'CRITICAL' && i.status !== 'CLOSED').length,
    newAlerts: alerts.filter(a => a.status === 'NEW').length,
    totalCost: incidents.reduce((sum, i) => sum + (i.estimated_cost || 0), 0),
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Incidents & Exceptions</h1>
          <p className="text-gray-500 mt-1">Track incidents, manage alerts, resolve exceptions</p>
        </div>
        <button
          onClick={openCreateModal}
          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
        >
          + Report Incident
        </button>
      </div>

      {/* Alert Banner */}
      {stats.newAlerts > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">!</span>
            <div>
              <p className="font-semibold text-red-800">{stats.newAlerts} New Alerts Require Attention</p>
              <p className="text-sm text-red-600">Review and acknowledge to continue operations</p>
            </div>
          </div>
          <button
            onClick={() => setActiveTab('alerts')}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            View Alerts
          </button>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-5 gap-4">
        <div className="bg-white rounded-xl shadow p-4 border-l-4 border-red-500">
          <p className="text-sm text-gray-500">Open Incidents</p>
          <p className="text-2xl font-bold text-red-600">{stats.open}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4 border-l-4 border-yellow-500">
          <p className="text-sm text-gray-500">Investigating</p>
          <p className="text-2xl font-bold text-yellow-600">{stats.investigating}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4 border-l-4 border-red-700">
          <p className="text-sm text-gray-500">Critical</p>
          <p className="text-2xl font-bold text-red-700">{stats.critical}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4 border-l-4 border-blue-500">
          <p className="text-sm text-gray-500">New Alerts</p>
          <p className="text-2xl font-bold text-blue-600">{stats.newAlerts}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4 border-l-4 border-orange-500">
          <p className="text-sm text-gray-500">Est. Cost Impact</p>
          <p className="text-2xl font-bold text-orange-600">${stats.totalCost.toLocaleString()}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow">
        <div className="border-b px-6">
          <div className="flex gap-4">
            {[
              { id: 'incidents', label: 'Incidents', icon: '!' },
              { id: 'alerts', label: 'Exception Alerts', icon: '!' },
              { id: 'types', label: 'Incident Types', icon: '!' },
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
                {tab.label}
                {tab.id === 'alerts' && stats.newAlerts > 0 && (
                  <span className="ml-2 px-2 py-0.5 bg-red-500 text-white text-xs rounded-full">
                    {stats.newAlerts}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6">
          {/* Incidents Tab */}
          {activeTab === 'incidents' && (
            <>
              <div className="flex gap-4 mb-4">
                <select
                  value={filterStatus}
                  onChange={e => setFilterStatus(e.target.value)}
                  className="px-4 py-2 border rounded-lg"
                >
                  <option value="ALL">All Status</option>
                  <option value="OPEN">Open</option>
                  <option value="INVESTIGATING">Investigating</option>
                  <option value="RESOLVED">Resolved</option>
                  <option value="CLOSED">Closed</option>
                </select>
                <select
                  value={filterSeverity}
                  onChange={e => setFilterSeverity(e.target.value)}
                  className="px-4 py-2 border rounded-lg"
                >
                  <option value="ALL">All Severity</option>
                  <option value="CRITICAL">Critical</option>
                  <option value="HIGH">High</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="LOW">Low</option>
                </select>
              </div>

              {loading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                </div>
              ) : incidents.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No incidents found
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Incident #</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Title</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Severity</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Related</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Occurred</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {incidents.map(incident => (
                        <tr key={incident.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-mono text-sm text-blue-600">
                            {incident.incident_number}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {incident.incident_type_code}
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-medium">{incident.title}</p>
                            {incident.location && (
                              <p className="text-xs text-gray-500">@ {incident.location}</p>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded-full text-xs ${getSeverityBadge(incident.severity)}`}>
                              {incident.severity}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {incident.container_number && (
                              <p className="font-mono">{incident.container_number}</p>
                            )}
                            {incident.driver_name && (
                              <p className="text-gray-500">{incident.driver_name}</p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {new Date(incident.occurred_at).toLocaleString()}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded-full text-xs ${getStatusBadge(incident.status)}`}>
                              {incident.status}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1">
                              <button
                                onClick={() => setViewingIncident(incident)}
                                className="px-2 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200"
                              >
                                View
                              </button>
                              {incident.status === 'OPEN' && (
                                <button
                                  onClick={() => updateIncidentStatus(incident.id, 'INVESTIGATING')}
                                  className="px-2 py-1 text-xs bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200"
                                >
                                  Investigate
                                </button>
                              )}
                              {(incident.status === 'OPEN' || incident.status === 'INVESTIGATING') && (
                                <button
                                  onClick={() => updateIncidentStatus(incident.id, 'RESOLVED')}
                                  className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200"
                                >
                                  Resolve
                                </button>
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

          {/* Alerts Tab */}
          {activeTab === 'alerts' && (
            <div className="space-y-4">
              {alerts.length === 0 ? (
                <div className="text-center py-8 text-gray-500">No alerts</div>
              ) : (
                alerts.map(alert => (
                  <div
                    key={alert.id}
                    className={`p-4 rounded-lg border ${
                      alert.status === 'NEW' ? 'border-red-300 bg-red-50' :
                      alert.status === 'ACKNOWLEDGED' ? 'border-yellow-300 bg-yellow-50' :
                      'border-gray-200 bg-gray-50'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <span className={`text-2xl ${
                          alert.severity === 'CRITICAL' ? 'text-red-600' :
                          alert.severity === 'HIGH' ? 'text-orange-600' :
                          'text-yellow-600'
                        }`}>!</span>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-semibold">{alert.title}</h4>
                            <span className={`px-2 py-0.5 rounded text-xs ${getSeverityBadge(alert.severity)}`}>
                              {alert.severity}
                            </span>
                            <span className={`px-2 py-0.5 rounded text-xs ${getStatusBadge(alert.status)}`}>
                              {alert.status}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600 mt-1">{alert.message}</p>
                          <p className="text-xs text-gray-400 mt-2">
                            {new Date(alert.created_at).toLocaleString()}
                            {alert.acknowledged_by && ` • Acknowledged by ${alert.acknowledged_by}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {alert.status === 'NEW' && (
                          <>
                            <button
                              onClick={() => acknowledgeAlert(alert.id)}
                              className="px-3 py-1 bg-yellow-500 text-white rounded hover:bg-yellow-600"
                            >
                              Acknowledge
                            </button>
                            <button
                              onClick={() => dismissAlert(alert.id)}
                              className="px-3 py-1 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
                            >
                              Dismiss
                            </button>
                          </>
                        )}
                        {alert.status === 'ACKNOWLEDGED' && (
                          <button
                            onClick={() => resolveAlert(alert.id)}
                            className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600"
                          >
                            Resolve
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Incident Types Tab */}
          {activeTab === 'types' && (
            <div className="grid grid-cols-3 gap-4">
              {incidentTypes.map(type => (
                <div key={type.id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className={`px-2 py-1 rounded text-xs ${getSeverityBadge(type.severity)}`}>
                      {type.severity}
                    </span>
                    <span className="text-xs text-gray-500">{type.code}</span>
                  </div>
                  <h4 className="font-semibold">{type.name}</h4>
                  <div className="flex gap-2 mt-2 text-xs text-gray-500">
                    {type.requires_report && (
                      <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded">Requires Report</span>
                    )}
                    {type.auto_notify && (
                      <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded">Auto Notify</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create Incident Modal */}
      {isIncidentModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => setIsIncidentModalOpen(false)}></div>
          <div className="relative min-h-screen flex items-center justify-center p-4">
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl">
              <div className="bg-gradient-to-r from-red-600 to-red-700 px-6 py-4 rounded-t-2xl">
                <h2 className="text-xl font-bold text-white">Report Incident</h2>
              </div>

              <div className="p-6 max-h-[60vh] overflow-y-auto space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Incident Type *</label>
                  <select
                    value={incidentForm.incident_type_code}
                    onChange={e => {
                      const type = incidentTypes.find(t => t.code === e.target.value);
                      setIncidentForm({
                        ...incidentForm,
                        incident_type_code: e.target.value,
                        title: type?.name || '',
                        severity: type?.severity || 'MEDIUM',
                      });
                    }}
                    className="w-full px-4 py-2 border rounded-lg"
                  >
                    <option value="">Select incident type...</option>
                    {incidentTypes.map(type => (
                      <option key={type.code} value={type.code}>
                        [{type.severity}] {type.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Title *</label>
                  <input
                    value={incidentForm.title}
                    onChange={e => setIncidentForm({ ...incidentForm, title: e.target.value })}
                    className="w-full px-4 py-2 border rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Description</label>
                  <textarea
                    value={incidentForm.description}
                    onChange={e => setIncidentForm({ ...incidentForm, description: e.target.value })}
                    rows={3}
                    className="w-full px-4 py-2 border rounded-lg"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Location</label>
                    <input
                      value={incidentForm.location}
                      onChange={e => setIncidentForm({ ...incidentForm, location: e.target.value })}
                      className="w-full px-4 py-2 border rounded-lg"
                      placeholder="Where did it happen?"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Occurred At *</label>
                    <input
                      type="datetime-local"
                      value={incidentForm.occurred_at}
                      onChange={e => setIncidentForm({ ...incidentForm, occurred_at: e.target.value })}
                      className="w-full px-4 py-2 border rounded-lg"
                    />
                  </div>
                </div>

                <hr />
                <h4 className="font-medium">Related Entities (Optional)</h4>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Order</label>
                    <select
                      value={incidentForm.order_id}
                      onChange={e => setIncidentForm({ ...incidentForm, order_id: e.target.value })}
                      className="w-full px-4 py-2 border rounded-lg"
                    >
                      <option value="">None</option>
                      {orders.map(o => (
                        <option key={o.id} value={o.id}>{o.order_number}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Container</label>
                    <select
                      value={incidentForm.container_id}
                      onChange={e => setIncidentForm({ ...incidentForm, container_id: e.target.value })}
                      className="w-full px-4 py-2 border rounded-lg"
                    >
                      <option value="">None</option>
                      {containers.map(c => (
                        <option key={c.id} value={c.id}>{c.container_number}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Driver</label>
                    <select
                      value={incidentForm.driver_id}
                      onChange={e => setIncidentForm({ ...incidentForm, driver_id: e.target.value })}
                      className="w-full px-4 py-2 border rounded-lg"
                    >
                      <option value="">None</option>
                      {drivers.map(d => (
                        <option key={d.id} value={d.id}>{d.first_name} {d.last_name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Reported By</label>
                    <input
                      value={incidentForm.reported_by}
                      onChange={e => setIncidentForm({ ...incidentForm, reported_by: e.target.value })}
                      className="w-full px-4 py-2 border rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Estimated Cost ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={incidentForm.estimated_cost}
                      onChange={e => setIncidentForm({ ...incidentForm, estimated_cost: e.target.value })}
                      className="w-full px-4 py-2 border rounded-lg"
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </div>

              <div className="px-6 py-4 bg-gray-50 border-t rounded-b-2xl flex justify-between">
                <button onClick={() => setIsIncidentModalOpen(false)} className="px-6 py-2 border rounded-lg hover:bg-gray-100">
                  Cancel
                </button>
                <button
                  onClick={createIncident}
                  disabled={!incidentForm.incident_type_code}
                  className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                >
                  Report Incident
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View Incident Modal */}
      {viewingIncident && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => setViewingIncident(null)}></div>
          <div className="relative min-h-screen flex items-center justify-center p-4">
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl">
              <div className={`px-6 py-4 rounded-t-2xl ${
                viewingIncident.severity === 'CRITICAL' ? 'bg-red-600' :
                viewingIncident.severity === 'HIGH' ? 'bg-orange-600' :
                'bg-yellow-600'
              }`}>
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-white">{viewingIncident.title}</h2>
                    <p className="text-white/80">{viewingIncident.incident_number}</p>
                  </div>
                  <button onClick={() => setViewingIncident(null)} className="text-white text-2xl">&times;</button>
                </div>
              </div>

              <div className="p-6 space-y-4">
                <div className="flex gap-4">
                  <span className={`px-3 py-1 rounded-full text-sm ${getSeverityBadge(viewingIncident.severity)}`}>
                    {viewingIncident.severity}
                  </span>
                  <span className={`px-3 py-1 rounded-full text-sm ${getStatusBadge(viewingIncident.status)}`}>
                    {viewingIncident.status}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500">Type</p>
                    <p className="font-medium">{viewingIncident.incident_type_code}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Location</p>
                    <p className="font-medium">{viewingIncident.location || '-'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Occurred At</p>
                    <p className="font-medium">{new Date(viewingIncident.occurred_at).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Reported By</p>
                    <p className="font-medium">{viewingIncident.reported_by}</p>
                  </div>
                </div>

                {viewingIncident.description && (
                  <div>
                    <p className="text-gray-500 text-sm">Description</p>
                    <p className="mt-1">{viewingIncident.description}</p>
                  </div>
                )}

                <hr />

                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500">Container</p>
                    <p className="font-mono font-medium">{viewingIncident.container_number || '-'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Driver</p>
                    <p className="font-medium">{viewingIncident.driver_name || '-'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Order</p>
                    <p className="font-mono font-medium">{viewingIncident.order_number || '-'}</p>
                  </div>
                </div>

                {viewingIncident.estimated_cost && (
                  <div className="bg-orange-50 p-3 rounded-lg">
                    <p className="text-sm text-orange-800">Estimated Cost Impact</p>
                    <p className="text-xl font-bold text-orange-600">${viewingIncident.estimated_cost.toFixed(2)}</p>
                  </div>
                )}

                {viewingIncident.resolution_notes && (
                  <div className="bg-green-50 p-3 rounded-lg">
                    <p className="text-sm text-green-800">Resolution Notes</p>
                    <p className="mt-1">{viewingIncident.resolution_notes}</p>
                  </div>
                )}
              </div>

              <div className="px-6 py-4 bg-gray-50 border-t rounded-b-2xl flex justify-between">
                <div className="flex gap-2">
                  {viewingIncident.status !== 'CLOSED' && (
                    <button
                      onClick={() => addResolutionNotes(viewingIncident.id)}
                      className="px-4 py-2 border rounded-lg hover:bg-gray-100"
                    >
                      Add Notes
                    </button>
                  )}
                </div>
                <div className="flex gap-2">
                  {viewingIncident.status === 'OPEN' && (
                    <button
                      onClick={() => updateIncidentStatus(viewingIncident.id, 'INVESTIGATING')}
                      className="px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600"
                    >
                      Start Investigation
                    </button>
                  )}
                  {viewingIncident.status !== 'RESOLVED' && viewingIncident.status !== 'CLOSED' && (
                    <button
                      onClick={() => updateIncidentStatus(viewingIncident.id, 'RESOLVED')}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                    >
                      Mark Resolved
                    </button>
                  )}
                  {viewingIncident.status === 'RESOLVED' && (
                    <button
                      onClick={() => updateIncidentStatus(viewingIncident.id, 'CLOSED')}
                      className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
                    >
                      Close Incident
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
