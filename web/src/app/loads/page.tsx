'use client';

import { useState, useEffect } from 'react';
import { supabase, Load, createLoad, updateLoad } from '../../lib/supabase';

export default function LoadsPage() {
  const [loads, setLoads] = useState<Load[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [moveTypeFilter, setMoveTypeFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingLoad, setEditingLoad] = useState<Load | null>(null);

  const [form, setForm] = useState({
    customer_id: '',
    container_number: '',
    container_size: '40',
    container_type: 'DRY',
    weight_lbs: '',
    is_hazmat: false,
    is_overweight: false,
    requires_triaxle: false,
    move_type: 'LIVE',
    terminal: '',
    last_free_day: '',
  });

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [loadsRes, custRes] = await Promise.all([
        supabase.from('loads').select('*, customer:customers(*)').order('created_at', { ascending: false }),
        supabase.from('customers').select('id, company_name').order('company_name'),
      ]);
      setLoads(loadsRes.data || []);
      setCustomers(custRes.data || []);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredLoads = loads.filter(l => {
    if (statusFilter && l.status !== statusFilter) return false;
    if (moveTypeFilter && l.move_type !== moveTypeFilter) return false;
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      return (l.load_number?.toLowerCase().includes(s)) ||
        (l.container_number?.toLowerCase().includes(s)) ||
        ((l.customer as any)?.company_name?.toLowerCase().includes(s)) ||
        (l.terminal?.toLowerCase().includes(s));
    }
    return true;
  });

  const stats = {
    total: loads.length,
    available: loads.filter(l => l.status === 'AVAILABLE').length,
    onHold: loads.filter(l => l.hold_customs || l.hold_freight || l.hold_usda || l.hold_tmf).length,
    dispatched: loads.filter(l => ['DISPATCHED', 'IN_TRANSIT', 'AT_PICKUP', 'AT_DELIVERY'].includes(l.status)).length,
    completed: loads.filter(l => l.status === 'COMPLETED' || l.status === 'INVOICED').length,
  };

  const openModal = (load?: Load) => {
    if (load) {
      setEditingLoad(load);
      setForm({
        customer_id: load.customer_id || '',
        container_number: load.container_number || '',
        container_size: load.container_size || '40',
        container_type: load.container_type || 'DRY',
        weight_lbs: load.weight_lbs?.toString() || '',
        is_hazmat: load.is_hazmat || false,
        is_overweight: load.is_overweight || false,
        requires_triaxle: load.requires_triaxle || false,
        move_type: load.move_type || 'LIVE',
        terminal: load.terminal || '',
        last_free_day: load.last_free_day || '',
      });
    } else {
      setEditingLoad(null);
      setForm({
        customer_id: '', container_number: '', container_size: '40',
        container_type: 'DRY', weight_lbs: '', is_hazmat: false,
        is_overweight: false, requires_triaxle: false, move_type: 'LIVE',
        terminal: '', last_free_day: '',
      });
    }
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const payload: any = {
        ...form,
        weight_lbs: form.weight_lbs ? parseInt(form.weight_lbs) : null,
      };
      const result = editingLoad
        ? await updateLoad(editingLoad.id, payload)
        : await createLoad(payload);
      if (!result) throw new Error('Save failed — check the browser console for details');
      setIsModalOpen(false);
      await fetchData();
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this load?')) return;
    try {
      await supabase.from('loads').delete().eq('id', id);
      await fetchData();
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const getLfdUrgency = (lfd: string | null | undefined) => {
    if (!lfd) return { color: 'text-gray-500', label: '—' };
    const days = Math.ceil((new Date(lfd).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (days < 0) return { color: 'text-red-700 font-bold', label: `${days}d OVERDUE` };
    if (days === 0) return { color: 'text-red-600 font-bold', label: 'TODAY' };
    if (days <= 2) return { color: 'text-orange-600 font-semibold', label: `${days}d` };
    if (days <= 5) return { color: 'text-yellow-600', label: `${days}d` };
    return { color: 'text-green-600', label: `${days}d` };
  };

  const getStatusColor = (status: string) => {
    const map: Record<string, string> = {
      TRACKING: 'bg-gray-100 text-gray-700', AVAILABLE: 'bg-green-100 text-green-800',
      HOLD: 'bg-red-100 text-red-800', APPOINTMENT_NEEDED: 'bg-yellow-100 text-yellow-800',
      READY_FOR_DISPATCH: 'bg-blue-100 text-blue-800', DISPATCHED: 'bg-blue-200 text-blue-900',
      IN_YARD: 'bg-indigo-100 text-indigo-800', IN_TRANSIT: 'bg-purple-100 text-purple-800',
      AT_PICKUP: 'bg-orange-100 text-orange-800', AT_DELIVERY: 'bg-orange-200 text-orange-900',
      RETURNING: 'bg-cyan-100 text-cyan-800', COMPLETED: 'bg-emerald-100 text-emerald-800',
      INVOICED: 'bg-teal-100 text-teal-800', CANCELLED: 'bg-gray-200 text-gray-600',
    };
    return map[status] || 'bg-gray-100 text-gray-700';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Loads</h1>
          <p className="text-gray-500 mt-1">Manage loads and update container assignments</p>
        </div>
        <button onClick={() => openModal()} className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 font-medium">
          <span className="text-xl">+</span> New Load
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">Error: {error}</div>}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-xl shadow p-4"><p className="text-sm text-gray-500">Total Loads</p><p className="text-2xl font-bold">{stats.total}</p></div>
        <div className="bg-white rounded-xl shadow p-4"><p className="text-sm text-gray-500">Available</p><p className="text-2xl font-bold text-green-600">{stats.available}</p></div>
        <div className="bg-white rounded-xl shadow p-4 border-l-4 border-red-500"><p className="text-sm text-gray-500">On Hold</p><p className="text-2xl font-bold text-red-600">{stats.onHold}</p></div>
        <div className="bg-white rounded-xl shadow p-4"><p className="text-sm text-gray-500">Dispatched</p><p className="text-2xl font-bold text-blue-600">{stats.dispatched}</p></div>
        <div className="bg-white rounded-xl shadow p-4"><p className="text-sm text-gray-500">Completed</p><p className="text-2xl font-bold text-emerald-600">{stats.completed}</p></div>
      </div>

      <div className="bg-white rounded-xl shadow p-4 flex flex-wrap gap-3">
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-3 py-1.5 border rounded-lg text-sm">
          <option value="">All Status</option>
          <option value="TRACKING">Tracking</option>
          <option value="AVAILABLE">Available</option>
          <option value="HOLD">On Hold</option>
          <option value="APPOINTMENT_NEEDED">Appt Needed</option>
          <option value="READY_FOR_DISPATCH">Ready</option>
          <option value="DISPATCHED">Dispatched</option>
          <option value="IN_TRANSIT">In Transit</option>
          <option value="COMPLETED">Completed</option>
        </select>
        <select value={moveTypeFilter} onChange={e => setMoveTypeFilter(e.target.value)} className="px-3 py-1.5 border rounded-lg text-sm">
          <option value="">All Move Types</option>
          <option value="LIVE">Live</option>
          <option value="DROP">Drop</option>
          <option value="PREPULL">Prepull</option>
          <option value="STREET_TURN">Street Turn</option>
          <option value="RETURN_EMPTY">Return Empty</option>
        </select>
        <input type="text" placeholder="Search load #, container, customer..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="px-4 py-1.5 border rounded-lg text-sm flex-1 min-w-0" />
        <button onClick={fetchData} className="px-4 py-1.5 bg-gray-100 rounded-lg hover:bg-gray-200 text-sm">Refresh</button>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl shadow p-12 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-500">Loading...</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Load #</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Container</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Move</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Terminal</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">LFD</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Charges</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredLoads.length === 0 ? (
                  <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-500">No loads found</td></tr>
                ) : filteredLoads.map(load => {
                  const lfd = getLfdUrgency(load.last_free_day);
                  const holds = [
                    load.hold_customs && 'Customs', load.hold_freight && 'Freight',
                    load.hold_usda && 'USDA', load.hold_tmf && 'TMF',
                  ].filter(Boolean);
                  return (
                    <tr key={load.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3"><span className="font-mono font-semibold text-blue-600">{load.load_number}</span></td>
                      <td className="px-4 py-3 font-medium">{(load.customer as any)?.company_name || '—'}</td>
                      <td className="px-4 py-3">
                        <span className="font-mono">{load.container_number || '—'}</span>
                        <div className="text-xs text-gray-500">{load.container_size}' {load.container_type}</div>
                        {holds.length > 0 && (
                          <div className="flex gap-1 mt-1">
                            {holds.map(h => <span key={h} className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded">{h}</span>)}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm">{load.move_type?.replace(/_/g, ' ')}</span>
                        {load.is_hazmat && <span className="ml-2 text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">HAZ</span>}
                        {load.is_overweight && <span className="ml-1 text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded">OVW</span>}
                      </td>
                      <td className="px-4 py-3 text-sm">{load.terminal || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={lfd.color}>{lfd.label}</span>
                        {load.last_free_day && <div className="text-xs text-gray-400">{new Date(load.last_free_day).toLocaleDateString()}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(load.status)}`}>
                          {load.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold">{load.total_charges ? `$${load.total_charges.toFixed(2)}` : '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <button onClick={() => openModal(load)} className="px-2 py-1 text-xs bg-blue-50 text-blue-600 rounded hover:bg-blue-100">Edit</button>
                          <button onClick={() => handleDelete(load.id)} className="px-2 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100">Delete</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => setIsModalOpen(false)}></div>
          <div className="relative min-h-screen flex items-center justify-center p-4">
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl">
              <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold text-white">{editingLoad ? 'Edit Load' : 'New Load'}</h2>
                  <button onClick={() => setIsModalOpen(false)} className="text-white text-2xl">&times;</button>
                </div>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Customer *</label>
                  <select value={form.customer_id} onChange={e => setForm({ ...form, customer_id: e.target.value })} className="w-full px-4 py-2 border rounded-lg">
                    <option value="">Select customer...</option>
                    {customers.map((c: any) => <option key={c.id} value={c.id}>{c.company_name}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Container Number</label>
                    <input value={form.container_number} onChange={e => setForm({ ...form, container_number: e.target.value.toUpperCase() })} className="w-full px-4 py-2 border rounded-lg font-mono" placeholder="MSCU1234567" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Size</label>
                    <select value={form.container_size} onChange={e => setForm({ ...form, container_size: e.target.value })} className="w-full px-4 py-2 border rounded-lg">
                      <option value="20">20'</option>
                      <option value="40">40'</option>
                      <option value="40HC">40' HC</option>
                      <option value="45">45'</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Type</label>
                    <select value={form.container_type} onChange={e => setForm({ ...form, container_type: e.target.value })} className="w-full px-4 py-2 border rounded-lg">
                      <option value="DRY">Dry</option>
                      <option value="REEFER">Reefer</option>
                      <option value="TANK">Tank</option>
                      <option value="FLATRACK">Flat Rack</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Weight (lbs)</label>
                    <input type="number" value={form.weight_lbs} onChange={e => setForm({ ...form, weight_lbs: e.target.value })} className="w-full px-4 py-2 border rounded-lg" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Move Type *</label>
                    <select value={form.move_type} onChange={e => setForm({ ...form, move_type: e.target.value })} className="w-full px-4 py-2 border rounded-lg">
                      <option value="LIVE">Live</option>
                      <option value="DROP">Drop</option>
                      <option value="PREPULL">Prepull</option>
                      <option value="STREET_TURN">Street Turn</option>
                      <option value="RETURN_EMPTY">Return Empty</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Terminal</label>
                    <input value={form.terminal} onChange={e => setForm({ ...form, terminal: e.target.value })} className="w-full px-4 py-2 border rounded-lg" placeholder="APM, LBCT..." />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Last Free Day</label>
                    <input type="date" value={form.last_free_day} onChange={e => setForm({ ...form, last_free_day: e.target.value })} className="w-full px-4 py-2 border rounded-lg" />
                  </div>
                </div>
                <div className="flex gap-6 pt-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.is_hazmat} onChange={e => setForm({ ...form, is_hazmat: e.target.checked })} className="rounded" />
                    <span className="text-sm">Hazmat</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.is_overweight} onChange={e => setForm({ ...form, is_overweight: e.target.checked })} className="rounded" />
                    <span className="text-sm">Overweight</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.requires_triaxle} onChange={e => setForm({ ...form, requires_triaxle: e.target.checked })} className="rounded" />
                    <span className="text-sm">Triaxle</span>
                  </label>
                </div>
              </div>
              <div className="px-6 py-4 bg-gray-50 border-t flex justify-between">
                <button onClick={() => setIsModalOpen(false)} className="px-6 py-2 border rounded-lg hover:bg-gray-100">Cancel</button>
                <button onClick={handleSave} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">{editingLoad ? 'Save Changes' : 'Create Load'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
