'use client';

import { useState, useEffect } from 'react';
import { Notification, Severity } from '@/lib/types';
import { getUnreadNotifications, markNotificationRead, supabase } from '@/lib/supabase';

interface NotificationCenterProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function NotificationCenter({ isOpen, onClose }: NotificationCenterProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread'>('unread');

  useEffect(() => {
    if (isOpen) {
      loadNotifications();
    }
  }, [isOpen, filter]);

  const loadNotifications = async () => {
    setLoading(true);
    
    let query = supabase
      .from('notifications')
      .select('*')
      .eq('channel', 'DASHBOARD')
      .order('created_at', { ascending: false })
      .limit(50);

    if (filter === 'unread') {
      query = query.is('read_at', null);
    }

    const { data } = await query;
    setNotifications(data || []);
    setLoading(false);
  };

  const handleMarkRead = async (id: string) => {
    await markNotificationRead(id);
    loadNotifications();
  };

  const handleMarkAllRead = async () => {
    const unreadIds = notifications.filter(n => !n.read_at).map(n => n.id);
    for (const id of unreadIds) {
      await markNotificationRead(id);
    }
    loadNotifications();
  };

  const getSeverityStyles = (severity: Severity) => {
    switch (severity) {
      case 'CRITICAL': return 'border-l-red-600 bg-red-50';
      case 'HIGH': return 'border-l-orange-500 bg-orange-50';
      case 'MEDIUM': return 'border-l-yellow-500 bg-yellow-50';
      case 'LOW': return 'border-l-blue-400 bg-blue-50';
      default: return 'border-l-gray-400 bg-gray-50';
    }
  };

  const getSeverityIcon = (severity: Severity) => {
    switch (severity) {
      case 'CRITICAL': return '🚨';
      case 'HIGH': return '⚠️';
      case 'MEDIUM': return '📢';
      case 'LOW': return 'ℹ️';
      default: return '📌';
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      
      {/* Panel */}
      <div className="absolute top-16 right-4 w-96 max-h-[80vh] bg-white rounded-lg shadow-xl border overflow-hidden">
        {/* Header */}
        <div className="bg-gray-900 text-white px-4 py-3 flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Notifications</h3>
            <p className="text-xs text-gray-400">
              {notifications.filter(n => !n.read_at).length} unread
            </p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-800 rounded">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs & Actions */}
        <div className="px-4 py-2 border-b flex items-center justify-between">
          <div className="flex gap-2">
            <button
              onClick={() => setFilter('unread')}
              className={`px-3 py-1 rounded-lg text-sm ${
                filter === 'unread' ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              Unread
            </button>
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1 rounded-lg text-sm ${
                filter === 'all' ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              All
            </button>
          </div>
          {notifications.some(n => !n.read_at) && (
            <button
              onClick={handleMarkAllRead}
              className="text-xs text-blue-600 hover:underline"
            >
              Mark all read
            </button>
          )}
        </div>

        {/* Notifications List */}
        <div className="overflow-y-auto max-h-[60vh]">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : notifications.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <div className="text-4xl mb-2">🔔</div>
              <p>No notifications</p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map(notification => (
                <div
                  key={notification.id}
                  className={`p-4 border-l-4 hover:bg-gray-50 transition cursor-pointer ${
                    getSeverityStyles(notification.severity)
                  } ${notification.read_at ? 'opacity-60' : ''}`}
                  onClick={() => !notification.read_at && handleMarkRead(notification.id)}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-lg">{getSeverityIcon(notification.severity)}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-sm ${notification.read_at ? '' : 'font-semibold'}`}>
                          {notification.title}
                        </p>
                        <span className="text-xs text-gray-400 whitespace-nowrap">
                          {formatTime(notification.created_at)}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mt-1">{notification.message}</p>
                      {notification.action_url && (
                        <a
                          href={notification.action_url}
                          className="inline-flex items-center gap-1 mt-2 text-xs text-blue-600 hover:underline"
                        >
                          {notification.action_label || 'View Details'} →
                        </a>
                      )}
                    </div>
                    {!notification.read_at && (
                      <div className="w-2 h-2 rounded-full bg-blue-600 flex-shrink-0 mt-2"></div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t p-3 bg-gray-50 text-center">
          <button className="text-sm text-blue-600 hover:underline">
            View All Notifications
          </button>
        </div>
      </div>
    </div>
  );
}

// Notification Bell Button Component
export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    loadUnreadCount();
    // Poll for new notifications every 30 seconds
    const interval = setInterval(loadUnreadCount, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadUnreadCount = async () => {
    const notifications = await getUnreadNotifications('DISPATCHER');
    setUnreadCount(notifications.length);
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="relative p-2 rounded-lg hover:bg-gray-100 transition"
      >
        <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
      
      <NotificationCenter 
        isOpen={isOpen} 
        onClose={() => {
          setIsOpen(false);
          loadUnreadCount();
        }} 
      />
    </>
  );
}

// Alert Banner Component (for critical alerts at top of page)
export function AlertBanner() {
  const [criticalAlerts, setCriticalAlerts] = useState<Notification[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadCriticalAlerts();
    const interval = setInterval(loadCriticalAlerts, 60000);
    return () => clearInterval(interval);
  }, []);

  const loadCriticalAlerts = async () => {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('channel', 'DASHBOARD')
      .in('severity', ['CRITICAL', 'HIGH'])
      .is('read_at', null)
      .order('created_at', { ascending: false })
      .limit(5);
    
    setCriticalAlerts((data || []).filter(a => !dismissed.has(a.id)));
  };

  const handleDismiss = async (id: string) => {
    setDismissed(prev => new Set([...prev, id]));
    await markNotificationRead(id);
  };

  if (criticalAlerts.length === 0) return null;

  return (
    <div className="space-y-2 mb-4">
      {criticalAlerts.map(alert => (
        <div 
          key={alert.id}
          className={`rounded-lg p-4 flex items-center justify-between ${
            alert.severity === 'CRITICAL' 
              ? 'bg-red-100 border border-red-300' 
              : 'bg-orange-100 border border-orange-300'
          }`}
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">
              {alert.severity === 'CRITICAL' ? '🚨' : '⚠️'}
            </span>
            <div>
              <p className={`font-semibold ${
                alert.severity === 'CRITICAL' ? 'text-red-800' : 'text-orange-800'
              }`}>
                {alert.title}
              </p>
              <p className={`text-sm ${
                alert.severity === 'CRITICAL' ? 'text-red-600' : 'text-orange-600'
              }`}>
                {alert.message}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {alert.action_url && (
              <a
                href={alert.action_url}
                className={`px-3 py-1 rounded text-sm font-medium ${
                  alert.severity === 'CRITICAL'
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'bg-orange-600 text-white hover:bg-orange-700'
                }`}
              >
                {alert.action_label || 'View'}
              </a>
            )}
            <button
              onClick={() => handleDismiss(alert.id)}
              className={`p-1 rounded hover:bg-white/50 ${
                alert.severity === 'CRITICAL' ? 'text-red-600' : 'text-orange-600'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
