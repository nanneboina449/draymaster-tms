'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

export default function StreetTurnsPage() {
  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchMatches(); }, []);

  const fetchMatches = async () => {
    try {
      setLoading(true);
      // Get pending imports with released customs
      const { data: imports } = await supabase
        .from('shipments')
        .select('*, containers(*)')
        .eq('type', 'IMPORT')
        .in('status', ['PENDING', 'CONFIRMED']);

      // Get pending exports
      const { data: exports } = await supabase
        .from('shipments')
        .select('*, containers(*)')
        .eq('type', 'EXPORT')
        .eq('status', 'PENDING');

      // Simple matching logic
      const opportunities: any[] = [];
      (imports || []).forEach(imp => {
        const impContainers = imp.containers || [];
        impContainers.forEach((ic: any) => {
          if (ic.customs_status === 'RELEASED') {
            (exports || []).forEach(exp => {
              const expContainers = exp.containers || [];
              expContainers.forEach((ec: any) => {
                if (ic.size === ec.size) {
                  opportunities.push({
                    import_ref: imp.reference_number,
                    import_customer: imp.customer_name,
                    import_terminal: imp.terminal_name,
                    import_lfd: imp.last_free_day,
                    import_container: ic.container_number,
                    container_size: ic.size,
                    export_ref: exp.reference_number,
                    export_customer: exp.customer_name,
                    export_terminal: exp.terminal_name,
                    export_cutoff: exp.port_cutoff,
                    match_type: imp.terminal_name === exp.terminal_name ? 'SAME_TERMINAL' : 'DIFFERENT_TERMINAL',
                  });
                }
              });
            });
          }
        });
      });

      setMatches(opportunities);
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const savingsEstimate = (match: any) => {
    return match.match_type === 'SAME_TERMINAL' ? 200 : 150;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Street Turn Opportunities</h1>
          <p className="text-gray-500 mt-1">Match imports with exports to save costs</p>
        </div>
        <button onClick={fetchMatches} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">🔄 Refresh</button>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <span className="text-2xl">💡</span>
          <div>
            <p className="font-semibold text-blue-900">What is a Street Turn?</p>
            <p className="text-sm text-blue-700">Instead of returning an empty import container to the terminal, deliver it directly to an export shipper. Saves time, fuel, and terminal fees.</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow p-4"><p className="text-sm text-gray-500">Matches Found</p><p className="text-2xl font-bold text-blue-600">{matches.length}</p></div>
        <div className="bg-white rounded-xl shadow p-4"><p className="text-sm text-gray-500">Same Terminal</p><p className="text-2xl font-bold text-green-600">{matches.filter(m => m.match_type === 'SAME_TERMINAL').length}</p></div>
        <div className="bg-white rounded-xl shadow p-4"><p className="text-sm text-gray-500">Est. Savings</p><p className="text-2xl font-bold text-purple-600">${matches.reduce((sum, m) => sum + savingsEstimate(m), 0)}</p></div>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl shadow p-12 text-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div></div>
      ) : matches.length === 0 ? (
        <div className="bg-white rounded-xl shadow p-12 text-center">
          <div className="text-6xl mb-4">🔄</div>
          <h3 className="text-xl font-semibold">No Opportunities Found</h3>
          <p className="text-gray-500 mt-2">When import containers match export needs, they'll appear here</p>
        </div>
      ) : (
        <div className="space-y-4">
          {matches.map((match, idx) => (
            <div key={idx} className="bg-white rounded-xl shadow overflow-hidden">
              <div className="p-4 border-b bg-gray-50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${match.match_type === 'SAME_TERMINAL' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                    {match.match_type === 'SAME_TERMINAL' ? '✓ Same Terminal' : '↔ Different Terminal'}
                  </span>
                  <span className="text-sm text-gray-500">Container: {match.container_size}'</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-green-600 font-semibold">Save ~${savingsEstimate(match)}</span>
                  <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">Create Street Turn</button>
                </div>
              </div>
              <div className="p-4 grid grid-cols-2 gap-6">
                <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
                  <div className="flex items-center gap-2 mb-3"><span className="text-xl">📥</span><span className="font-semibold text-purple-800">IMPORT</span></div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-gray-500">Reference:</span><span className="font-mono font-semibold">{match.import_ref}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Customer:</span><span>{match.import_customer}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Container:</span><span className="font-mono">{match.import_container}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Terminal:</span><span>{match.import_terminal}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">LFD:</span><span className="text-red-600 font-semibold">{match.import_lfd || '-'}</span></div>
                  </div>
                </div>
                <div className="p-4 bg-orange-50 rounded-lg border border-orange-200">
                  <div className="flex items-center gap-2 mb-3"><span className="text-xl">📤</span><span className="font-semibold text-orange-800">EXPORT</span></div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-gray-500">Reference:</span><span className="font-mono font-semibold">{match.export_ref}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Customer:</span><span>{match.export_customer}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Needs:</span><span>{match.container_size}' Container</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Terminal:</span><span>{match.export_terminal}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Cutoff:</span><span className="text-orange-600 font-semibold">{match.export_cutoff || '-'}</span></div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}