'use client';

import { ArrowUpIcon, ArrowDownIcon } from '@heroicons/react/24/solid';
import {
  TruckIcon,
  DocumentTextIcon,
  ClockIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { clsx } from 'clsx';

const stats = [
  {
    name: 'Active Trips',
    value: '24',
    change: '+12%',
    changeType: 'increase',
    icon: TruckIcon,
    color: 'blue',
  },
  {
    name: 'Pending Orders',
    value: '47',
    change: '+8%',
    changeType: 'increase',
    icon: DocumentTextIcon,
    color: 'purple',
  },
  {
    name: 'Containers Due (3 Days)',
    value: '18',
    change: '-3%',
    changeType: 'decrease',
    icon: ClockIcon,
    color: 'yellow',
  },
  {
    name: 'LFD Alerts',
    value: '5',
    change: '+2',
    changeType: 'increase',
    icon: ExclamationTriangleIcon,
    color: 'red',
  },
];

const colorClasses = {
  blue: {
    bg: 'bg-blue-50',
    icon: 'text-blue-600',
    ring: 'ring-blue-500/10',
  },
  purple: {
    bg: 'bg-purple-50',
    icon: 'text-purple-600',
    ring: 'ring-purple-500/10',
  },
  yellow: {
    bg: 'bg-yellow-50',
    icon: 'text-yellow-600',
    ring: 'ring-yellow-500/10',
  },
  red: {
    bg: 'bg-red-50',
    icon: 'text-red-600',
    ring: 'ring-red-500/10',
  },
};

export function DashboardStats() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => {
        const colors = colorClasses[stat.color as keyof typeof colorClasses];
        
        return (
          <div
            key={stat.name}
            className="relative overflow-hidden rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200"
          >
            <div className="flex items-center gap-4">
              <div
                className={clsx(
                  'flex h-12 w-12 items-center justify-center rounded-lg ring-1',
                  colors.bg,
                  colors.ring
                )}
              >
                <stat.icon className={clsx('h-6 w-6', colors.icon)} />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">{stat.name}</p>
                <div className="flex items-baseline gap-2">
                  <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                  <span
                    className={clsx(
                      'inline-flex items-center text-xs font-medium',
                      stat.changeType === 'increase'
                        ? 'text-green-600'
                        : 'text-red-600'
                    )}
                  >
                    {stat.changeType === 'increase' ? (
                      <ArrowUpIcon className="h-3 w-3 mr-0.5" />
                    ) : (
                      <ArrowDownIcon className="h-3 w-3 mr-0.5" />
                    )}
                    {stat.change}
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
