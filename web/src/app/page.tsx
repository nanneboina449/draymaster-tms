'use client';

import { useState, useEffect } from 'react';
import { getDashboardStats } from '../lib/supabase';

export default function Dashboard() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchStats(); }, []);

  const fetchStats = async () => {
    try {
      const data = await getDashboardStats();
      setStats(data);
    } catch (err) {
      console.error(err);
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

  const shipmentStats = {
    total: stats?.shipments?.length || 0,
    pending: stats?.shipments?.filter((s: any) => s.status === 'PENDING').length || 0,
    inProgress: stats?.shipments?.filter((s: any) => s.status === 'IN_PROGRESS').length || 0,
    delivered: stats?.shipments?.filter((s: any) => s.status === 'DELIVERED').length || 0,
    imports: stats?.shipments?.filter((s: any) => s.type === 'IMPORT').length || 0,
    exports: stats?.shipments?.filter((s: any) => s.type === 'EXPORT').length || 0,
  };

  const orderStats = {
    total: stats?.orders?.length || 0,
    pending: stats?.orders?.filter((o: any) => o.status === 'PENDING').length || 0,
    unbilled: stats?.orders?.filter((o: any) => o.billing_status === 'UNBILLED').length || 0,
    revenue: stats?.orders?.reduce((sum: number, o: any) => sum + (o.total_amount || 0), 0) || 0,
  };

  const driverStats = {
    total: stats?.drivers?.length || 0,
    available: stats?.drivers?.filter((d: any) => d.status === 'AVAILABLE').length || 0,
    driving: stats?.drivers?.filter((d: any) => d.status === 'DRIVING').length || 0,
  };

  const tractorStats = {
    total: stats?.tractors?.length || 0,
    available: stats?.tractors?.filter((t: any) => t.status === 'AVAILABLE').length || 0,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">Welcome to DrayMaster TMS</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg p-6 text-white">
          <p className="text-blue-100">Total Shipments</p>
          <p className="text-4xl font-bold mt-2">{shipmentStats.total}</p>
          <p className="text-sm text-blue-100 mt-2">{shipmentStats.imports} imports / {shipmentStats.exports} exports</p>
        </div>
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl shadow-lg p-6 text-white">
          <p className="text-green-100">Total Orders</p>
          <p className="text-4xl font-bold mt-2">{orderStats.total}</p>
          <p className="text-sm text-green-100 mt-2">{orderStats.pending} pending</p>
        </div>
        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl shadow-lg p-6 text-white">
          <p className="text-purple-100">Drivers</p>
          <p className="text-4xl font-bold mt-2">{driverStats.total}</p>
          <p className="text-sm text-purple-100 mt-2">{driverStats.available} available</p>
        </div>
        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl shadow-lg p-6 text-white">
          <p className="text-orange-100">Revenue</p>
          <p className="text-4xl font-bold mt-2">${orderStats.revenue.toLocaleString()}</p>
          <p className="text-sm text-orange-100 mt-2">{orderStats.unbilled} unbilled orders</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow p-6">
          <h3 className="font-semibold text-gray-800 mb-4">Shipment Status</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Pending</span>
              <div className="flex items-center gap-2">
                <div className="w-32 bg-gray-200 rounded-full h-2">
                  <div className="bg-yellow-500 h-2 rounded-full" style={{width: `${(shipmentStats.pending / shipmentStats.total * 100) || 0}%`}}></div>
                </div>
                <span className="font-semibold w-8">{shipmentStats.pending}</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">In Progress</span>
              <div className="flex items-center gap-2">
                <div className="w-32 bg-gray-200 rounded-full h-2">
                  <div className="bg-blue-500 h-2 rounded-full" style={{width: `${(shipmentStats.inProgress / shipmentStats.total * 100) || 0}%`}}></div>
                </div>
                <span className="font-semibold w-8">{shipmentStats.inProgress}</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Delivered</span>
              <div className="flex items-center gap-2">
                <div className="w-32 bg-gray-200 rounded-full h-2">
                  <div className="bg-green-500 h-2 rounded-full" style={{width: `${(shipmentStats.delivered / shipmentStats.total * 100) || 0}%`}}></div>
                </div>
                <span className="font-semibold w-8">{shipmentStats.delivered}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow p-6">
          <h3 className="font-semibold text-gray-800 mb-4">Fleet Status</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center p-4 bg-green-50 rounded-xl">
              <p className="text-3xl font-bold text-green-600">{driverStats.available}</p>
              <p className="text-sm text-gray-500">Available Drivers</p>
            </div>
            <div className="text-center p-4 bg-purple-50 rounded-xl">
              <p className="text-3xl font-bold text-purple-600">{driverStats.driving}</p>
              <p className="text-sm text-gray-500">On the Road</p>
            </div>
            <div className="text-center p-4 bg-blue-50 rounded-xl">
              <p className="text-3xl font-bold text-blue-600">{tractorStats.available}</p>
              <p className="text-sm text-gray-500">Available Tractors</p>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-xl">
              <p className="text-3xl font-bold text-gray-600">{tractorStats.total}</p>
              <p className="text-sm text-gray-500">Total Fleet</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow p-6">
        <h3 className="font-semibold text-gray-800 mb-4">Quick Actions</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <a href="/shipments" className="p-4 bg-blue-50 rounded-xl hover:bg-blue-100 transition text-center">
            <span className="text-3xl">??</span>
            <p className="font-medium mt-2">New Shipment</p>
          </a>
          <a href="/dispatch" className="p-4 bg-purple-50 rounded-xl hover:bg-purple-100 transition text-center">
            <span className="text-3xl">??</span>
            <p className="font-medium mt-2">Dispatch Board</p>
          </a>
          <a href="/drivers" className="p-4 bg-green-50 rounded-xl hover:bg-green-100 transition text-center">
            <span className="text-3xl">??</span>
            <p className="font-medium mt-2">Manage Drivers</p>
          </a>
          <a href="/billing" className="p-4 bg-orange-50 rounded-xl hover:bg-orange-100 transition text-center">
            <span className="text-3xl">??</span>
            <p className="font-medium mt-2">Billing</p>
          </a>
        </div>
      </div>
    </div>
  );
}