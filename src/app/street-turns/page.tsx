'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

interface StreetTurnMatch {
  import_shipment_id: string;
  import_ref: string;
  import_customer: string;
  import_terminal: string;
  import_lfd: string;
  import_container: string;
  container_size: string;
  export_shipment_id: string;
  export_ref: string;
  export_customer: string;
  export_terminal: string;
  export_cutoff: string;
  match_type: string;
}

export default function StreetTurnsPage() {
  const [matches, setMatches] = useState<StreetTurnMatch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchMatches(); }, []);

  const fetchMatches = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.from('street_turn_opportunities').select('*');
      if (error) throw error;
      setMatches(data || []);
    } catch (err: any) {
      console.error('Error:', err);
      // View might not exist yet, show empty state
      setMatches([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateStreetTurn = async (match: StreetTurnMatch) => {
    alert(`Street Turn created!\n\nImport: ${match.import_ref}\nExport: ${match.export_ref}\nContainer: ${match.import_container}`);
    // In production, this would create a linked trip
  };

  const savingsEstimate = (match: StreetTurnMatch) => {
    // Estimated savings from avoiding empty return
    const baseSavings = 150; // Empty return cost
    const sameterminal = match.match_type === 'SAME_TERMINAL' ? 50 : 0;
    return baseSavings + sameterminal;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Street Turn Opportunities</h1>
          <p className="text-gray-500 mt-1">Match import deliveries with export pickups to save costs</p>
        </div>
        <button onClick={fetchMatches} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          🔄 Refresh
        </button>
      </div>

      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <span className="text-2xl">💡</span>
          <div>
            <p className="font-semibold text-blue-900">What is a Street Turn?</p>
            <p className="text-sm text-blue-700">Instead of returning an empty import container to the terminal, deliver it directly to an export shipper. This saves time, fuel, and terminal fees.</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow p-4">
          <p className="text-sm text-gray-500">Available Matches</p>
          <p className="text-2xl font-bold text-blue-600">{matches.length}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4">
          <p className="text-sm text-gray-500">Same Terminal</p>
          <p className="text-2xl font-bold text-green-600">{matches.filter(m => m.match_type === 'SAME_TERMINAL').length}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4">
          <p className="text-sm text-gray-500">Potential Savings</p>
          <p className="text-2xl font-bold text-purple-600">${matches.reduce((sum, m) => sum + savingsEstimate(m), 0)}</p>
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl shadow p-12 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        </div>
      ) : matches.length === 0 ? (
        <div className="bg-white rounded-xl shadow p-12 text-center">
          <div className="text-6xl mb-4">🔄</div>
          <h3 className="text-xl font-semibold text-gray-900">No Street Turn Opportunities</h3>
          <p className="text-gray-500 mt-2">When import containers match export needs, they'll appear here</p>
        </div>
      ) : (
        <div className="space-y-4">
          {matches.map((match, idx) => (
            <div key={idx} className="bg-white rounded-xl shadow overflow-hidden">
              <div className="p-4 border-b bg-gray-50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                    match.match_type === 'SAME_TERMINAL' 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-yellow-100 text-yellow-800'
                  }`}>
                    {match.match_type === 'SAME_TERMINAL' ? '✓ Same Terminal' : '↔ Different Terminal'}
                  </span>
                  <span className="text-sm text-gray-500">Container: {match.container_size}'</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-green-600 font-semibold">Save ~${savingsEstimate(match)}</span>
                  <button 
                    onClick={() => handleCreateStreetTurn(match)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                  >
                    Create Street Turn
                  </button>
                </div>
              </div>
              <div className="p-4 grid grid-cols-2 gap-6">
                {/* Import Side */}
                <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xl">📥</span>
                    <span className="font-semibold text-purple-800">IMPORT</span>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Reference:</span>
                      <span className="font-mono font-semibold">{match.import_ref}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Customer:</span>
                      <span>{match.import_customer}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Container:</span>
                      <span className="font-mono">{match.import_container}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Terminal:</span>
                      <span>{match.import_terminal}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">LFD:</span>
                      <span className="text-red-600 font-semibold">{match.import_lfd || '-'}</span>
                    </div>
                  </div>
                </div>

                {/* Export Side */}
                <div className="p-4 bg-orange-50 rounded-lg border border-orange-200">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xl">📤</span>
                    <span className="font-semibold text-orange-800">EXPORT</span>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Reference:</span>
                      <span className="font-mono font-semibold">{match.export_ref}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Customer:</span>
                      <span>{match.export_customer}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Needs:</span>
                      <span>{match.container_size}' Container</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Terminal:</span>
                      <span>{match.export_terminal}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Cutoff:</span>
                      <span className="text-orange-600 font-semibold">{match.export_cutoff || '-'}</span>
                    </div>
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