'use client';

import { useState, useEffect } from 'react';
import { 
  StreetTurn, StreetTurnOpportunity, StreetTurnStatus,
  SHIPPING_LINE_LABELS 
} from '@/lib/types';
import { 
  getStreetTurnOpportunities, createStreetTurn, approveStreetTurn,
  supabase 
} from '@/lib/supabase';

export default function StreetTurnScreen() {
  const [opportunities, setOpportunities] = useState<StreetTurnOpportunity[]>([]);
  const [existingStreetTurns, setExistingStreetTurns] = useState<StreetTurn[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'opportunities' | 'active' | 'completed'>('opportunities');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    
    // Get opportunities
    const opps = await getStreetTurnOpportunities();
    setOpportunities(opps);

    // Get existing street turns
    const { data: turns } = await supabase
      .from('street_turns')
      .select(`
        *,
        import_load:loads!street_turns_import_load_id_fkey(*),
        export_load:loads!street_turns_export_load_id_fkey(*),
        import_customer:customers!street_turns_import_customer_id_fkey(*),
        export_customer:customers!street_turns_export_customer_id_fkey(*)
      `)
      .order('created_at', { ascending: false });

    setExistingStreetTurns(turns || []);
    setLoading(false);
  };

  const handleCreateStreetTurn = async (importLoadId: string, exportLoadId: string) => {
    const streetTurn = await createStreetTurn(importLoadId, exportLoadId);
    if (streetTurn) {
      loadData();
    }
  };

  const handleApprove = async (streetTurnId: string) => {
    const success = await approveStreetTurn(streetTurnId, 'Dispatcher');
    if (success) {
      loadData();
    }
  };

  const handleReject = async (streetTurnId: string, reason: string) => {
    await supabase
      .from('street_turns')
      .update({ 
        status: 'REJECTED',
        rejection_reason: reason 
      })
      .eq('id', streetTurnId);
    loadData();
  };

  const getStatusBadge = (status: StreetTurnStatus) => {
    const styles: Record<StreetTurnStatus, string> = {
      POTENTIAL: 'bg-yellow-100 text-yellow-800',
      APPROVED: 'bg-blue-100 text-blue-800',
      LINKED: 'bg-green-100 text-green-800',
      COMPLETED: 'bg-emerald-100 text-emerald-800',
      REJECTED: 'bg-red-100 text-red-800',
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status]}`}>
        {status}
      </span>
    );
  };

  const getMatchScoreBadge = (score: number) => {
    const color = score >= 80 ? 'bg-green-500' : score >= 60 ? 'bg-yellow-500' : 'bg-orange-500';
    return (
      <div className="flex items-center gap-2">
        <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
          <div className={`h-full ${color}`} style={{ width: `${score}%` }}></div>
        </div>
        <span className="text-sm font-medium">{score}%</span>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const activeStreetTurns = existingStreetTurns.filter(st => 
    ['POTENTIAL', 'APPROVED', 'LINKED'].includes(st.status)
  );
  const completedStreetTurns = existingStreetTurns.filter(st => 
    ['COMPLETED', 'REJECTED'].includes(st.status)
  );

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">🔄 Street Turns</h1>
        <p className="text-gray-600">Match import empties with export bookings to save costs</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-2xl font-bold text-blue-600">{opportunities.length}</div>
          <div className="text-sm text-gray-600">Opportunities</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-2xl font-bold text-green-600">{activeStreetTurns.length}</div>
          <div className="text-sm text-gray-600">Active</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-2xl font-bold text-emerald-600">
            {completedStreetTurns.filter(st => st.status === 'COMPLETED').length}
          </div>
          <div className="text-sm text-gray-600">Completed</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-2xl font-bold text-emerald-600">
            ${existingStreetTurns
              .filter(st => st.status === 'COMPLETED')
              .reduce((sum, st) => sum + (st.estimated_savings || 0), 0)
              .toLocaleString()}
          </div>
          <div className="text-sm text-gray-600">Total Savings</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow">
        <div className="border-b">
          <div className="flex">
            <button
              onClick={() => setActiveTab('opportunities')}
              className={`px-6 py-3 text-sm font-medium ${
                activeTab === 'opportunities'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Opportunities ({opportunities.length})
            </button>
            <button
              onClick={() => setActiveTab('active')}
              className={`px-6 py-3 text-sm font-medium ${
                activeTab === 'active'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Active ({activeStreetTurns.length})
            </button>
            <button
              onClick={() => setActiveTab('completed')}
              className={`px-6 py-3 text-sm font-medium ${
                activeTab === 'completed'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              History ({completedStreetTurns.length})
            </button>
          </div>
        </div>

        <div className="p-4">
          {/* Opportunities Tab */}
          {activeTab === 'opportunities' && (
            <div className="space-y-4">
              {opportunities.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <div className="text-4xl mb-2">🔍</div>
                  <p>No street turn opportunities found</p>
                  <p className="text-sm">Opportunities appear when import empties match export bookings</p>
                </div>
              ) : (
                opportunities.map((opp, index) => (
                  <div key={index} className="border rounded-lg p-4 hover:bg-gray-50">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 grid grid-cols-2 gap-6">
                        {/* Import Side */}
                        <div className="bg-blue-50 rounded-lg p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-lg">📥</span>
                            <span className="font-semibold text-blue-800">Import (Empty Available)</span>
                          </div>
                          <div className="space-y-1 text-sm">
                            <div className="font-mono font-bold">{opp.import_container}</div>
                            <div className="text-gray-600">{opp.import_customer}</div>
                            <div className="text-gray-500">
                              {SHIPPING_LINE_LABELS[opp.import_ssl || 'OTHER']} • {opp.import_size}
                            </div>
                            <div className="text-gray-500">📍 {opp.import_delivery_city}</div>
                          </div>
                        </div>

                        {/* Export Side */}
                        <div className="bg-green-50 rounded-lg p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-lg">📤</span>
                            <span className="font-semibold text-green-800">Export (Needs Empty)</span>
                          </div>
                          <div className="space-y-1 text-sm">
                            <div className="font-mono font-bold">{opp.export_container || 'TBD'}</div>
                            <div className="text-gray-600">{opp.export_customer}</div>
                            <div className="text-gray-500">
                              {SHIPPING_LINE_LABELS[opp.export_ssl || 'OTHER']} • {opp.export_size}
                            </div>
                            <div className="text-gray-500">📍 {opp.export_pickup_city}</div>
                          </div>
                        </div>
                      </div>

                      {/* Match Score & Actions */}
                      <div className="ml-6 text-center">
                        <div className="mb-2">
                          <div className="text-xs text-gray-500 mb-1">Match Score</div>
                          {getMatchScoreBadge(opp.match_score)}
                        </div>
                        <div className="text-sm text-green-600 font-semibold mb-3">
                          Est. Savings: $170
                        </div>
                        <button
                          onClick={() => handleCreateStreetTurn(opp.import_load_id, opp.export_load_id)}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
                        >
                          Create Match
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Active Tab */}
          {activeTab === 'active' && (
            <div className="space-y-4">
              {activeStreetTurns.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <p>No active street turns</p>
                </div>
              ) : (
                activeStreetTurns.map(st => (
                  <div key={st.id} className="border rounded-lg p-4">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <div className="flex items-center gap-3">
                          <span className="font-mono font-bold">{st.street_turn_number}</span>
                          {getStatusBadge(st.status)}
                        </div>
                        <div className="text-sm text-gray-500 mt-1">
                          Created: {new Date(st.created_at).toLocaleDateString()}
                        </div>
                      </div>
                      {st.estimated_savings && (
                        <div className="text-right">
                          <div className="text-xs text-gray-500">Estimated Savings</div>
                          <div className="text-lg font-bold text-green-600">
                            ${st.estimated_savings}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div className="bg-blue-50 rounded p-3">
                        <div className="text-xs text-blue-600 mb-1">Import</div>
                        <div className="font-mono font-bold">{st.import_container}</div>
                        <div className="text-sm text-gray-600">
                          {st.import_customer?.company_name}
                        </div>
                      </div>
                      <div className="bg-green-50 rounded p-3">
                        <div className="text-xs text-green-600 mb-1">Export</div>
                        <div className="font-mono font-bold">{st.export_booking_number}</div>
                        <div className="text-sm text-gray-600">
                          {st.export_customer?.company_name}
                        </div>
                      </div>
                    </div>

                    {st.status === 'POTENTIAL' && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleApprove(st.id)}
                          className="flex-1 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700"
                        >
                          ✓ Approve
                        </button>
                        <button
                          onClick={() => handleReject(st.id, 'Not feasible')}
                          className="flex-1 py-2 bg-red-100 text-red-700 rounded-lg text-sm hover:bg-red-200"
                        >
                          ✗ Reject
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* Completed Tab */}
          {activeTab === 'completed' && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left">ST Number</th>
                    <th className="px-4 py-2 text-left">Import Container</th>
                    <th className="px-4 py-2 text-left">Export Booking</th>
                    <th className="px-4 py-2 text-left">Status</th>
                    <th className="px-4 py-2 text-right">Savings</th>
                    <th className="px-4 py-2 text-left">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {completedStreetTurns.map(st => (
                    <tr key={st.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono">{st.street_turn_number}</td>
                      <td className="px-4 py-3">{st.import_container}</td>
                      <td className="px-4 py-3">{st.export_booking_number}</td>
                      <td className="px-4 py-3">{getStatusBadge(st.status)}</td>
                      <td className="px-4 py-3 text-right font-medium text-green-600">
                        ${st.estimated_savings || 0}
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {new Date(st.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
