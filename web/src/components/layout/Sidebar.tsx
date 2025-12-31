'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clsx } from 'clsx';
import {
  HomeIcon,
  TruckIcon,
  DocumentTextIcon,
  MapIcon,
  UserGroupIcon,
  CubeIcon,
  CurrencyDollarIcon,
  Cog6ToothIcon,
  ArrowsRightLeftIcon,
} from '@heroicons/react/24/outline';

const navigation = [
  { name: 'Dashboard', href: '/', icon: HomeIcon },
  { name: 'Shipments', href: '/shipments', icon: DocumentTextIcon },
  { name: 'Dispatch', href: '/dispatch', icon: TruckIcon },
  { name: 'Tracking', href: '/tracking', icon: MapIcon },
  { name: 'Drivers', href: '/drivers', icon: UserGroupIcon },
  { name: 'Equipment', href: '/equipment', icon: CubeIcon },
  { name: 'Billing', href: '/billing', icon: CurrencyDollarIcon },
];

const secondaryNavigation = [
  { name: 'Street Turns', href: '/street-turns', icon: ArrowsRightLeftIcon },
  { name: 'Settings', href: '/settings', icon: Cog6ToothIcon },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="flex w-64 flex-col bg-gray-900">
      {/* Logo */}
      <div className="flex h-16 items-center px-6">
        <div className="flex items-center gap-2">
          <TruckIcon className="h-8 w-8 text-blue-500" />
          <span className="text-xl font-bold text-white">DrayMaster</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
        <div className="space-y-1">
          {navigation.map((item) => {
            const isActive = pathname === item.href || 
              (item.href !== '/' && pathname.startsWith(item.href));
            
            return (
              <Link
                key={item.name}
                href={item.href}
                className={clsx(
                  'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-gray-800 text-white'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                )}
              >
                <item.icon
                  className={clsx(
                    'h-5 w-5 shrink-0',
                    isActive ? 'text-blue-500' : 'text-gray-500 group-hover:text-gray-300'
                  )}
                />
                {item.name}
              </Link>
            );
          })}
        </div>

        <div className="my-4 border-t border-gray-700" />

        <div className="space-y-1">
          {secondaryNavigation.map((item) => {
            const isActive = pathname === item.href;
            
            return (
              <Link
                key={item.name}
                href={item.href}
                className={clsx(
                  'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-gray-800 text-white'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                )}
              >
                <item.icon
                  className={clsx(
                    'h-5 w-5 shrink-0',
                    isActive ? 'text-blue-500' : 'text-gray-500 group-hover:text-gray-300'
                  )}
                />
                {item.name}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* User menu */}
      <div className="border-t border-gray-700 p-4">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-blue-600 flex items-center justify-center">
            <span className="text-sm font-medium text-white">JD</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">John Dispatcher</p>
            <p className="text-xs text-gray-400 truncate">Dispatch Manager</p>
          </div>
        </div>
      </div>
    </div>
  );
}
