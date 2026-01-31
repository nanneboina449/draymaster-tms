'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';

function downloadCSV(filename: string, headers: string[], rows: string[][]) {
  const escape = (val: string) => `"${(val ?? '').toString().replace(/"/g, '""')}"`;
  const lines = [headers.map(escape).join(','), ...rows.map(r => r.map(escape).join(','))];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ReportsPage() {
  const [loading, setLoading] = useState(true);
  const [dateStart, setDateStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [dateEnd, setDateEnd] = useState(() => new Date().toISOString().slice(0, 10));

  const [rawData, setRawData] = useState<{
    shipments: any[];
    orders: any[];
    trips: any[];
    drivers: any[];
    invoices: any[];
  }>({ shipments: [], orders: [], trips: [], drivers: [], invoices: [] });

  const [stats, setStats] = useState({
    shipments: { total: 0, imports: 0, exports: 0, byStatus: {} as Record<string, number> },
    orders: { total: 0, revenue: 0, avgRate: 0 },
    trips: { total: 0, completed: 0 },
    drivers: { total: 0, active: 0 },
    invoices: { paid: 0, outstanding: 0 },
  });

  const fetchReportData = useCallback(async () => {
    try {
      setLoading(true);
      const startISO = dateStart + 'T00:00:00';
      const endISO = dateEnd + 'T23:59:59';

      const [shipments, orders, trips, drivers, invoices] = await Promise.all([
        supabase.from('shipments').select('*').gte('created_at', startISO).lte('created_at', endISO),
        supabase.from('orders').select('*').gte('created_at', startISO).lte('created_at', endISO),
        supabase.from('trips').select('*').gte('created_at', startISO).lte('created_at', endISO),
        supabase.from('drivers').select('*'),
        supabase.from('invoices').select('*').gte('created_at', startISO).lte('created_at', endISO),
      ]);

      const shipmentData = shipments.data || [];
      const orderData = orders.data || [];
      const tripData = trips.data || [];
      const driverData = drivers.data || [];
      const invoiceData = invoices.data || [];

      setRawData({ shipments: shipmentData, orders: orderData, trips: tripData, drivers: driverData, invoices: invoiceData });

      const byStatus: Record<string, number> = {};
      shipmentData.forEach(s => { byStatus[s.status] = (byStatus[s.status] || 0) + 1; });

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
        },
        drivers: {
          total: driverData.length,
          active: driverData.filter(d => d.is_active).length,
        },
        invoices: {
          paid: invoiceData.filter(i => i.status === 'PAID').reduce((sum, i) => sum + (i.total_amount || 0), 0),
          outstanding: invoiceData.filter(i => i.status === 'SENT').reduce((sum, i) => sum + (i.balance_due || 0), 0),
        },
      });
    } catch (err: any) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  }, [dateStart, dateEnd]);

  useEffect(() => { fetchReportData(); }, [fetchReportData]);

  const setQuickRange = (days: number | 'month') => {
    const end = new Date();
    let start: Date;
    if (days === 'month') {
      start = new Date(end.getFullYear(), end.getMonth(), 1);
    } else {
      start = new Date(end);
      start.setDate(start.getDate() - days);
    }
    setDateStart(start.toISOString().slice(0, 10));
    setDateEnd(end.toISOString().slice(0, 10));
  };

  const exportShipments = () => {
    const headers = ['Reference', 'Type', 'Status', 'Customer', 'Terminal', 'Created At'];
    const rows = rawData.shipments.map(s => [
      s.reference_number || '', s.type || '', s.status || '',
      s.customer_name || '', s.terminal_name || '',
      s.created_at ? new Date(s.created_at).toLocaleString() : '',
    ]);
    downloadCSV('shipment-report.csv', headers, rows);
  };

  const exportRevenue = () => {
    const headers = ['Order ID', 'Customer', 'Rate', 'Total Amount', 'Status', 'Created At'];
    const rows = rawData.orders.map(o => [
      o.id || '', o.customer_name || '',
      (o.rate || 0).toFixed(2), (o.total_amount || 0).toFixed(2),
      o.status || '', o.created_at ? new Date(o.created_at).toLocaleString() : '',
    ]);
    downloadCSV('revenue-report.csv', headers, rows);
  };

  const exportTrips = () => {
    const headers = ['Trip ID', 'Load ID', 'Driver', 'Status', 'Origin', 'Destination', 'Created At'];
    const rows = rawData.trips.map(t => [
      t.id || '', t.load_id || '', t.driver_name || t.driver_id || '',
      t.status || '', t.origin || '', t.destination || '',
      t.created_at ? new Date(t.created_at).toLocaleString() : '',
    ]);
    downloadCSV('trip-report.csv', headers, rows);
  };

  const exportDrivers = () => {
    const headers = ['Driver ID', 'Name', 'CDL', 'Status', 'Driver Type', 'Email', 'Phone'];
    const rows = rawData.drivers.map(d => [
      d.id || '', `${d.first_name || ''} ${d.last_name || ''}`.trim(),
      d.cdl_number || '', d.is_active ? 'Active' : 'Inactive',
      d.driver_type || '', d.email || '', d.phone || '',
    ]);
    downloadCSV('driver-report.csv', headers, rows);
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Reports & Analytics</h1>
          <p className="text-gray-500 mt-1">Business insights and performance metrics</p>
        </div>
        <button onClick={fetchReportData} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">🔄 Refresh</button>
      </div>

      {/* Date Filter */}
      <div className="bg-white rounded-xl shadow p-4">
        <div className="flex items-center gap-4 flex-wrap">
          <span className="text-sm font-medium text-gray-600">Date Range:</span>
          <input
            type="date"
            value={dateStart}
            onChange={e => setDateStart(e.target.value)}
            className="px-3 py-2 border rounded-lg text-sm"
          />
          <span className="text-gray-400">—</span>
          <input
            type="date"
            value={dateEnd}
            onChange={e => setDateEnd(e.target.value)}
            className="px-3 py-2 border rounded-lg text-sm"
          />
          <div className="flex gap-2 ml-auto">
            {[
              { label: '7d', value: 7 },
              { label: '30d', value: 30 },
              { label: '90d', value: 90 },
              { label: 'This Month', value: 'month' as const },
            ].map(opt => (
              <button
                key={opt.label}
                onClick={() => setQuickRange(opt.value)}
                className="px-3 py-1 text-sm bg-gray-100 rounded-lg hover:bg-gray-200 transition"
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Revenue Summary */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl shadow-lg p-6 text-white">
          <p className="text-green-100">Total Revenue</p>
          <p className="text-4xl font-bold mt-2">${stats.orders.revenue.toLocaleString()}</p>
          <p className="text-sm text-green-100 mt-2">{stats.orders.total} orders</p>
        </div>
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg p-6 text-white">
          <p className="text-blue-100">Paid Invoices</p>
          <p className="text-4xl font-bold mt-2">${stats.invoices.paid.toLocaleString()}</p>
        </div>
        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl shadow-lg p-6 text-white">
          <p className="text-orange-100">Outstanding</p>
          <p className="text-4xl font-bold mt-2">${stats.invoices.outstanding.toLocaleString()}</p>
        </div>
        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl shadow-lg p-6 text-white">
          <p className="text-purple-100">Avg Rate/Order</p>
          <p className="text-4xl font-bold mt-2">${stats.orders.avgRate.toFixed(0)}</p>
        </div>
      </div>

      {/* Shipment & Trip Stats */}
      <div className="grid grid-cols-2 gap-6">
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
                        <div className="bg-blue-500 h-2 rounded-full" style={{width: `${stats.shipments.total ? (count / stats.shipments.total * 100) : 0}%`}}></div>
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
              <p className="text-3xl font-bold text-purple-600">{stats.drivers.active}</p>
              <p className="text-sm text-gray-500">Active Drivers</p>
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

      {/* Quick Export */}
      <div className="bg-white rounded-xl shadow p-6">
        <h3 className="font-semibold text-gray-800 mb-4">Quick Export</h3>
        <div className="grid grid-cols-4 gap-4">
          <button onClick={exportShipments} className="p-4 bg-gray-50 rounded-lg hover:bg-gray-100 text-left transition">
            <span className="text-2xl">📊</span>
            <p className="font-medium mt-2">Shipment Report</p>
            <p className="text-sm text-blue-600">Export CSV ({rawData.shipments.length} records)</p>
          </button>
          <button onClick={exportRevenue} className="p-4 bg-gray-50 rounded-lg hover:bg-gray-100 text-left transition">
            <span className="text-2xl">💰</span>
            <p className="font-medium mt-2">Revenue Report</p>
            <p className="text-sm text-blue-600">Export CSV ({rawData.orders.length} records)</p>
          </button>
          <button onClick={exportTrips} className="p-4 bg-gray-50 rounded-lg hover:bg-gray-100 text-left transition">
            <span className="text-2xl">🚛</span>
            <p className="font-medium mt-2">Trip Report</p>
            <p className="text-sm text-blue-600">Export CSV ({rawData.trips.length} records)</p>
          </button>
          <button onClick={exportDrivers} className="p-4 bg-gray-50 rounded-lg hover:bg-gray-100 text-left transition">
            <span className="text-2xl">👤</span>
            <p className="font-medium mt-2">Driver Report</p>
            <p className="text-sm text-blue-600">Export CSV ({rawData.drivers.length} records)</p>
          </button>
        </div>
      </div>
    </div>
  );
}
