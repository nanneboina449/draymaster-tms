'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

export default function ReportsPage() {
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [stats, setStats] = useState({
    shipments: { total: 0, imports: 0, exports: 0, byStatus: {} as Record<string, number> },
    orders: { total: 0, revenue: 0, avgRate: 0 },
    trips: { total: 0, completed: 0, avgMiles: 0 },
    drivers: { total: 0, active: 0 },
    invoices: { total: 0, paid: 0, outstanding: 0 },
  });

  useEffect(() => { fetchReportData(); }, []);

  const fetchReportData = async () => {
    try {
      setLoading(true);
      const [shipments, orders, trips, drivers, invoices] = await Promise.all([
        supabase.from('shipments').select('*'),
        supabase.from('orders').select('*'),
        supabase.from('trips').select('*'),
        supabase.from('drivers').select('*'),
        supabase.from('invoices').select('*'),
      ]);

      const shipmentData = shipments.data || [];
      const orderData = orders.data || [];
      const tripData = trips.data || [];
      const driverData = drivers.data || [];
      const invoiceData = invoices.data || [];

      const byStatus: Record<string, number> = {};
      shipmentData.forEach(s => {
        byStatus[s.status] = (byStatus[s.status] || 0) + 1;
      });

      setStats({
        shipments: {
          total: shipmentData.length,
          imports: shipmentData.filter(s => s.type === 'IMPORT').length,
          exports: shipmentData.filter(s => s.type === 'EXPORT').length,
          byStatus,
        },
        orders: {
          total: orderData.length,
          revenue: orderData.reduce((sum, o) => sum + (o.total_amount || 0), 0),
          avgRate: orderData.length ? orderData.reduce((sum, o) => sum + (o.rate || 0), 0) / orderData.length : 0,
        },
        trips: {
          total: tripData.length,
          completed: tripData.filter(t => t.status === 'COMPLETED').length,
          avgMiles: tripData.length ? tripData.reduce((sum, t) => sum + (t.actual_miles || 0), 0) / tripData.length : 0,
        },
        drivers: {
          total: driverData.length,
          active: driverData.filter(d => d.is_active).length,
        },
        invoices: {
          total: invoiceData.length,
          paid: invoiceData.filter(i => i.status === 'PAID').reduce((sum, i) => sum + (i.total_amount || 0), 0),
          outstanding: invoiceData.filter(i => i.status === 'SENT').reduce((sum, i) => sum + (i.balance_due || 0), 0),
        },
      });
    } catch (err: any) {
      console.error('Error fetching report data:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Reports & Analytics</h1>
          <p className="text-gray-500 mt-1">Business insights and performance metrics</p>
        </div>
        <div className="flex items-center gap-4">
          <input type="date" value={dateRange.start} onChange={e => setDateRange({...dateRange, start: e.target.value})} className="px-3 py-2 border rounded-lg text-sm" />
          <span>to</span>
          <input type="date" value={dateRange.end} onChange={e => setDateRange({...dateRange, end: e.target.value})} className="px-3 py-2 border rounded-lg text-sm" />
          <button onClick={fetchReportData} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Apply</button>
        </div>
      </div>

      {/* Revenue Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl shadow-lg p-6 text-white">
          <p className="text-green-100">Total Revenue</p>
          <p className="text-4xl font-bold mt-2">${stats.orders.revenue.toLocaleString()}</p>
          <p className="text-sm text-green-100 mt-2">{stats.orders.total} orders</p>
        </div>
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg p-6 text-white">
          <p className="text-blue-100">Paid Invoices</p>
          <p className="text-4xl font-bold mt-2">${stats.invoices.paid.toLocaleString()}</p>
          <p className="text-sm text-blue-100 mt-2">{stats.invoices.total} invoices</p>
        </div>
        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl shadow-lg p-6 text-white">
          <p className="text-orange-100">Outstanding</p>
          <p className="text-4xl font-bold mt-2">${stats.invoices.outstanding.toLocaleString()}</p>
          <p className="text-sm text-orange-100 mt-2">Pending payment</p>
        </div>
        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl shadow-lg p-6 text-white">
          <p className="text-purple-100">Avg Rate/Order</p>
          <p className="text-4xl font-bold mt-2">${stats.orders.avgRate.toFixed(0)}</p>
          <p className="text-sm text-purple-100 mt-2">Per delivery</p>
        </div>
      </div>

      {/* Shipment Analytics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow p-6">
          <h3 className="font-semibold text-gray-800 mb-4">Shipment Overview</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="text-2xl font-bold">{stats.shipments.total}</p>
                <p className="text-sm text-gray-500">Total Shipments</p>
              </div>
              <div className="text-right">
                <p className="text-purple-600 font-semibold">{stats.shipments.imports} Imports</p>
                <p className="text-orange-600 font-semibold">{stats.shipments.exports} Exports</p>
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500 mb-2">By Status</p>
              <div className="space-y-2">
                {Object.entries(stats.shipments.byStatus).map(([status, count]) => (
                  <div key={status} className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">{status}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-32 bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-blue-500 h-2 rounded-full" 
                          style={{width: `${(count / stats.shipments.total * 100)}%`}}
                        ></div>
                      </div>
                      <span className="font-semibold w-8 text-right">{count}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow p-6">
          <h3 className="font-semibold text-gray-800 mb-4">Trip Performance</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-blue-50 rounded-xl text-center">
              <p className="text-3xl font-bold text-blue-600">{stats.trips.total}</p>
              <p className="text-sm text-gray-500">Total Trips</p>
            </div>
            <div className="p-4 bg-green-50 rounded-xl text-center">
              <p className="text-3xl font-bold text-green-600">{stats.trips.completed}</p>
              <p className="text-sm text-gray-500">Completed</p>
            </div>
            <div className="p-4 bg-purple-50 rounded-xl text-center">
              <p className="text-3xl font-bold text-purple-600">{stats.trips.avgMiles.toFixed(0)}</p>
              <p className="text-sm text-gray-500">Avg Miles/Trip</p>
            </div>
            <div className="p-4 bg-orange-50 rounded-xl text-center">
              <p className="text-3xl font-bold text-orange-600">
                {stats.trips.total ? ((stats.trips.completed / stats.trips.total) * 100).toFixed(0) : 0}%
              </p>
              <p className="text-sm text-gray-500">Completion Rate</p>
            </div>
          </div>
        </div>
      </div>

      {/* Fleet & Driver Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow p-6">
          <h3 className="font-semibold text-gray-800 mb-4">Driver Utilization</h3>
          <div className="flex items-center justify-center">
            <div className="relative w-40 h-40">
              <svg className="w-full h-full transform -rotate-90">
                <circle cx="80" cy="80" r="70" stroke="#e5e7eb" strokeWidth="12" fill="none" />
                <circle 
                  cx="80" cy="80" r="70" 
                  stroke="#10b981" 
                  strokeWidth="12" 
                  fill="none"
                  strokeDasharray={`${(stats.drivers.active / stats.drivers.total) * 440} 440`}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-3xl font-bold">{stats.drivers.active}</p>
                <p className="text-sm text-gray-500">of {stats.drivers.total}</p>
              </div>
            </div>
          </div>
          <p className="text-center mt-4 text-gray-600">Active Drivers</p>
        </div>

        <div className="bg-white rounded-xl shadow p-6">
          <h3 className="font-semibold text-gray-800 mb-4">Quick Export</h3>
          <div className="space-y-3">
            <button className="w-full p-3 bg-gray-50 rounded-lg hover:bg-gray-100 flex items-center justify-between">
              <span>📊 Shipment Report</span>
              <span className="text-blue-600">Export CSV</span>
            </button>
            <button className="w-full p-3 bg-gray-50 rounded-lg hover:bg-gray-100 flex items-center justify-between">
              <span>💰 Revenue Report</span>
              <span className="text-blue-600">Export CSV</span>
            </button>
            <button className="w-full p-3 bg-gray-50 rounded-lg hover:bg-gray-100 flex items-center justify-between">
              <span>🚛 Trip Report</span>
              <span className="text-blue-600">Export CSV</span>
            </button>
            <button className="w-full p-3 bg-gray-50 rounded-lg hover:bg-gray-100 flex items-center justify-between">
              <span>👤 Driver Report</span>
              <span className="text-blue-600">Export CSV</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}