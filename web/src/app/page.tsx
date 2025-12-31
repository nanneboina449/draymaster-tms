import { DashboardStats } from '@/components/dashboard/DashboardStats';
import { LFDAlerts } from '@/components/dashboard/LFDAlerts';
import { ActiveTrips } from '@/components/dashboard/ActiveTrips';
import { FleetMap } from '@/components/map/FleetMap';
import { RecentActivity } from '@/components/dashboard/RecentActivity';

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500">
          Overview of your drayage operations
        </p>
      </div>

      {/* Stats Cards */}
      <DashboardStats />

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* LFD Alerts - Priority items */}
        <div className="lg:col-span-1">
          <LFDAlerts />
        </div>

        {/* Active Trips */}
        <div className="lg:col-span-2">
          <ActiveTrips />
        </div>
      </div>

      {/* Fleet Map and Activity */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Fleet Map */}
        <div className="lg:col-span-2">
          <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Fleet Location
            </h2>
            <div className="h-96 rounded-lg overflow-hidden">
              <FleetMap />
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="lg:col-span-1">
          <RecentActivity />
        </div>
      </div>
    </div>
  );
}
