'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

interface QuoteRequest {
  id: string;
  request_number: string;
  customer_id: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  company_name: string;
  shipment_type: string;
  container_size: string;
  container_count: number;
  commodity: string;
  pickup_location: string;
  pickup_city: string;
  pickup_state: string;
  pickup_zip: string;
  delivery_location: string;
  delivery_city: string;
  delivery_state: string;
  delivery_zip: string;
  requested_pickup_date: string;
  special_instructions: string;
  is_hazmat: boolean;
  is_overweight: boolean;
  quoted_rate: number;
  quoted_fuel_surcharge: number;
  quoted_total: number;
  quote_valid_until: string;
  quoted_by: string;
  quoted_at: string;
  status: string;
  internal_notes: string;
  created_at: string;
  customers?: {
    company_name: string;
  };
}

export default function QuotesPage() {
  const [quotes, setQuotes] = useState<QuoteRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const [selectedQuote, setSelectedQuote] = useState<QuoteRequest | null>(null);
  const [isQuoteModalOpen, setIsQuoteModalOpen] = useState(false);

  const [quoteResponse, setQuoteResponse] = useState({
    quoted_rate: 0,
    quoted_fuel_surcharge: 0,
    quote_valid_until: '',
    internal_notes: '',
  });

  useEffect(() => {
    fetchQuotes();
  }, []);

  const fetchQuotes = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('quote_requests')
        .select('*, customers(company_name)')
        .order('created_at', { ascending: false });
      setQuotes(data || []);
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const openQuoteModal = (quote: QuoteRequest) => {
    setSelectedQuote(quote);
    setQuoteResponse({
      quoted_rate: quote.quoted_rate || 0,
      quoted_fuel_surcharge: quote.quoted_fuel_surcharge || 0,
      quote_valid_until: quote.quote_valid_until || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      internal_notes: quote.internal_notes || '',
    });
    setIsQuoteModalOpen(true);
  };

  const submitQuote = async () => {
    if (!selectedQuote) return;

    try {
      const total = quoteResponse.quoted_rate + quoteResponse.quoted_fuel_surcharge;
      
      const { error } = await supabase
        .from('quote_requests')
        .update({
          quoted_rate: quoteResponse.quoted_rate,
          quoted_fuel_surcharge: quoteResponse.quoted_fuel_surcharge,
          quoted_total: total,
          quote_valid_until: quoteResponse.quote_valid_until,
          quoted_by: 'Admin', // In production, use actual user
          quoted_at: new Date().toISOString(),
          internal_notes: quoteResponse.internal_notes,
          status: 'QUOTED',
        })
        .eq('id', selectedQuote.id);

      if (error) throw error;

      alert('Quote submitted successfully!');
      setIsQuoteModalOpen(false);
      fetchQuotes();
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      await supabase.from('quote_requests').update({ status }).eq('id', id);
      fetchQuotes();
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      'NEW': 'bg-blue-100 text-blue-800',
      'PENDING': 'bg-yellow-100 text-yellow-800',
      'QUOTED': 'bg-purple-100 text-purple-800',
      'ACCEPTED': 'bg-green-100 text-green-800',
      'DECLINED': 'bg-red-100 text-red-800',
      'EXPIRED': 'bg-gray-100 text-gray-600',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const filteredQuotes = filterStatus
    ? quotes.filter(q => q.status === filterStatus)
    : quotes;

  const stats = {
    total: quotes.length,
    new: quotes.filter(q => q.status === 'NEW').length,
    quoted: quotes.filter(q => q.status === 'QUOTED').length,
    accepted: quotes.filter(q => q.status === 'ACCEPTED').length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Quote Requests</h1>
          <p className="text-gray-500 mt-1">Manage and respond to customer quote requests</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div
          className={`bg-white rounded-xl shadow p-4 border-l-4 cursor-pointer transition hover:shadow-lg ${!filterStatus ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-300'}`}
          onClick={() => setFilterStatus('')}
        >
          <p className="text-sm text-gray-500">Total Requests</p>
          <p className="text-2xl font-bold text-blue-600">{stats.total}</p>
        </div>
        <div
          className={`bg-white rounded-xl shadow p-4 border-l-4 cursor-pointer transition hover:shadow-lg ${filterStatus === 'NEW' ? 'border-yellow-500 ring-2 ring-yellow-200' : 'border-gray-300'}`}
          onClick={() => setFilterStatus('NEW')}
        >
          <p className="text-sm text-gray-500">New / Pending</p>
          <p className="text-2xl font-bold text-yellow-600">{stats.new}</p>
        </div>
        <div
          className={`bg-white rounded-xl shadow p-4 border-l-4 cursor-pointer transition hover:shadow-lg ${filterStatus === 'QUOTED' ? 'border-purple-500 ring-2 ring-purple-200' : 'border-gray-300'}`}
          onClick={() => setFilterStatus('QUOTED')}
        >
          <p className="text-sm text-gray-500">Quoted</p>
          <p className="text-2xl font-bold text-purple-600">{stats.quoted}</p>
        </div>
        <div
          className={`bg-white rounded-xl shadow p-4 border-l-4 cursor-pointer transition hover:shadow-lg ${filterStatus === 'ACCEPTED' ? 'border-green-500 ring-2 ring-green-200' : 'border-gray-300'}`}
          onClick={() => setFilterStatus('ACCEPTED')}
        >
          <p className="text-sm text-gray-500">Accepted</p>
          <p className="text-2xl font-bold text-green-600">{stats.accepted}</p>
        </div>
      </div>

      {/* Quotes Table */}
      <div className="bg-white rounded-xl shadow">
        <div className="p-6">
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Request #</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Route</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Containers</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Requested Date</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Quoted</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredQuotes.map(quote => (
                    <tr key={quote.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-blue-600">{quote.request_number}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium">{quote.customers?.company_name || quote.company_name || '-'}</p>
                        <p className="text-xs text-gray-500">{quote.contact_email}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs ${quote.shipment_type === 'IMPORT' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}`}>
                          {quote.shipment_type}
                        </span>
                        {quote.is_hazmat && <span className="ml-1 px-1 py-0.5 bg-red-100 text-red-700 text-xs rounded">HAZ</span>}
                        {quote.is_overweight && <span className="ml-1 px-1 py-0.5 bg-orange-100 text-orange-700 text-xs rounded">OW</span>}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <p>{quote.pickup_city}, {quote.pickup_state}</p>
                        <p className="text-gray-400">↓</p>
                        <p>{quote.delivery_city}, {quote.delivery_state}</p>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="font-semibold">{quote.container_count}</span>
                        <span className="text-gray-500 text-sm"> × {quote.container_size}'</span>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {quote.requested_pickup_date ? new Date(quote.requested_pickup_date).toLocaleDateString() : '-'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {quote.quoted_total ? (
                          <span className="font-semibold text-green-600">${quote.quoted_total.toFixed(2)}</span>
                        ) : '-'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs ${getStatusColor(quote.status)}`}>
                          {quote.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <button
                            onClick={() => openQuoteModal(quote)}
                            className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                          >
                            {quote.status === 'QUOTED' ? 'View' : 'Quote'}
                          </button>
                          {quote.status === 'QUOTED' && (
                            <>
                              <button
                                onClick={() => updateStatus(quote.id, 'ACCEPTED')}
                                className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200"
                              >
                                Accept
                              </button>
                              <button
                                onClick={() => updateStatus(quote.id, 'DECLINED')}
                                className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200"
                              >
                                Decline
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredQuotes.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  No quote requests found
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Quote Modal */}
      {isQuoteModalOpen && selectedQuote && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => setIsQuoteModalOpen(false)}></div>
          <div className="relative min-h-screen flex items-center justify-center p-4">
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
              <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-white">Quote Request {selectedQuote.request_number}</h2>
                    <p className="text-blue-200">{selectedQuote.customers?.company_name || selectedQuote.company_name}</p>
                  </div>
                  <button onClick={() => setIsQuoteModalOpen(false)} className="text-white text-2xl">&times;</button>
                </div>
              </div>

              <div className="p-6 overflow-y-auto max-h-[60vh] space-y-6">
                {/* Request Details */}
                <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
                  <div>
                    <p className="text-xs text-gray-500">Shipment Type</p>
                    <p className="font-semibold">{selectedQuote.shipment_type}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Containers</p>
                    <p className="font-semibold">{selectedQuote.container_count} × {selectedQuote.container_size}'</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Commodity</p>
                    <p className="font-semibold">{selectedQuote.commodity || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Requested Pickup</p>
                    <p className="font-semibold">
                      {selectedQuote.requested_pickup_date 
                        ? new Date(selectedQuote.requested_pickup_date).toLocaleDateString() 
                        : 'Flexible'}
                    </p>
                  </div>
                </div>

                {/* Route */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 border rounded-lg">
                    <p className="text-xs text-gray-500 mb-2">📍 Pickup</p>
                    <p className="font-medium">{selectedQuote.pickup_location}</p>
                    <p className="text-sm text-gray-600">
                      {selectedQuote.pickup_city}, {selectedQuote.pickup_state} {selectedQuote.pickup_zip}
                    </p>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <p className="text-xs text-gray-500 mb-2">📍 Delivery</p>
                    <p className="font-medium">{selectedQuote.delivery_location}</p>
                    <p className="text-sm text-gray-600">
                      {selectedQuote.delivery_city}, {selectedQuote.delivery_state} {selectedQuote.delivery_zip}
                    </p>
                  </div>
                </div>

                {/* Special Requirements */}
                <div className="flex gap-4">
                  {selectedQuote.is_hazmat && (
                    <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm">⚠️ Hazmat</span>
                  )}
                  {selectedQuote.is_overweight && (
                    <span className="px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-sm">⚖️ Overweight</span>
                  )}
                </div>

                {selectedQuote.special_instructions && (
                  <div className="p-4 bg-yellow-50 rounded-lg">
                    <p className="text-xs text-yellow-700 font-medium mb-1">Special Instructions</p>
                    <p className="text-sm">{selectedQuote.special_instructions}</p>
                  </div>
                )}

                {/* Quote Form */}
                <div className="border-t pt-6">
                  <h3 className="font-semibold mb-4">Your Quote</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Base Rate ($)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={quoteResponse.quoted_rate}
                        onChange={e => setQuoteResponse({ ...quoteResponse, quoted_rate: parseFloat(e.target.value) || 0 })}
                        className="w-full px-4 py-2 border rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Fuel Surcharge ($)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={quoteResponse.quoted_fuel_surcharge}
                        onChange={e => setQuoteResponse({ ...quoteResponse, quoted_fuel_surcharge: parseFloat(e.target.value) || 0 })}
                        className="w-full px-4 py-2 border rounded-lg"
                      />
                    </div>
                  </div>

                  <div className="mt-4 p-4 bg-green-50 rounded-lg flex justify-between items-center">
                    <span className="font-medium">Total Quote:</span>
                    <span className="text-2xl font-bold text-green-600">
                      ${(quoteResponse.quoted_rate + quoteResponse.quoted_fuel_surcharge).toFixed(2)}
                    </span>
                  </div>

                  <div className="mt-4">
                    <label className="block text-sm font-medium mb-1">Quote Valid Until</label>
                    <input
                      type="date"
                      value={quoteResponse.quote_valid_until}
                      onChange={e => setQuoteResponse({ ...quoteResponse, quote_valid_until: e.target.value })}
                      className="w-full px-4 py-2 border rounded-lg"
                    />
                  </div>

                  <div className="mt-4">
                    <label className="block text-sm font-medium mb-1">Internal Notes</label>
                    <textarea
                      value={quoteResponse.internal_notes}
                      onChange={e => setQuoteResponse({ ...quoteResponse, internal_notes: e.target.value })}
                      className="w-full px-4 py-2 border rounded-lg"
                      rows={2}
                      placeholder="Notes for internal reference..."
                    />
                  </div>
                </div>
              </div>

              <div className="px-6 py-4 bg-gray-50 border-t flex justify-end gap-2">
                <button
                  onClick={() => setIsQuoteModalOpen(false)}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  onClick={submitQuote}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  {selectedQuote.status === 'QUOTED' ? 'Update Quote' : 'Submit Quote'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
