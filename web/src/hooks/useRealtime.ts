// ==============================================================================
// DRAYMASTER TMS - Real-time Subscription Hooks
// ==============================================================================
// Provides WebSocket-based real-time updates using Supabase Realtime
// Addresses P0 Critical Issue: No Real-Time Push Updates

import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

// Types for real-time events
export type RealtimeEventType = 'INSERT' | 'UPDATE' | 'DELETE' | '*';

export interface RealtimeSubscription<T = any> {
  data: T[];
  isConnected: boolean;
  error: Error | null;
  lastUpdate: Date | null;
  refresh: () => Promise<void>;
}

export interface RealtimeChangeEvent<T = any> {
  eventType: RealtimeEventType;
  old: T | null;
  new: T | null;
  table: string;
  schema: string;
  commitTimestamp: string;
}

// ==============================================================================
// HOOK: useRealtimeTable
// Subscribe to changes on a specific table
// ==============================================================================

export function useRealtimeTable<T = any>(
  table: string,
  options?: {
    filter?: string;
    select?: string;
    event?: RealtimeEventType;
    onInsert?: (record: T) => void;
    onUpdate?: (old: T, current: T) => void;
    onDelete?: (record: T) => void;
    enabled?: boolean;
  }
): RealtimeSubscription<T> {
  const [data, setData] = useState<T[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const { filter, select = '*', event = '*', onInsert, onUpdate, onDelete, enabled = true } = options || {};

  // Initial data fetch
  const fetchData = useCallback(async () => {
    try {
      let query = supabase.from(table).select(select);

      if (filter) {
        // Parse simple filter like "status=eq.PENDING"
        const [column, condition] = filter.split('=');
        if (condition) {
          const [operator, value] = condition.split('.');
          if (operator === 'eq') {
            query = query.eq(column, value);
          } else if (operator === 'in') {
            query = query.in(column, value.split(','));
          }
        }
      }

      const { data: result, error: fetchError } = await query;

      if (fetchError) {
        setError(new Error(fetchError.message));
        return;
      }

      setData(result || []);
      setLastUpdate(new Date());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch data'));
    }
  }, [table, select, filter]);

  // Handle real-time changes
  const handleChange = useCallback(
    (payload: RealtimePostgresChangesPayload<T>) => {
      const { eventType, old: oldRecord, new: newRecord } = payload;

      setLastUpdate(new Date());

      switch (eventType) {
        case 'INSERT':
          if (newRecord) {
            setData((prev) => [newRecord as T, ...prev]);
            onInsert?.(newRecord as T);
          }
          break;

        case 'UPDATE':
          if (newRecord) {
            setData((prev) =>
              prev.map((item: any) =>
                item.id === (newRecord as any).id ? newRecord : item
              )
            );
            onUpdate?.(oldRecord as T, newRecord as T);
          }
          break;

        case 'DELETE':
          if (oldRecord) {
            setData((prev) =>
              prev.filter((item: any) => item.id !== (oldRecord as any).id)
            );
            onDelete?.(oldRecord as T);
          }
          break;
      }
    },
    [onInsert, onUpdate, onDelete]
  );

  useEffect(() => {
    if (!enabled) {
      return;
    }

    // Fetch initial data
    fetchData();

    // Set up real-time subscription
    const channelName = `realtime:${table}:${Date.now()}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: event === '*' ? '*' : event.toLowerCase() as any,
          schema: 'public',
          table: table,
        },
        handleChange
      )
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED');
        if (status === 'CHANNEL_ERROR') {
          setError(new Error('Failed to connect to real-time channel'));
        }
      });

    channelRef.current = channel;

    // Cleanup on unmount
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [table, event, enabled, fetchData, handleChange]);

  return {
    data,
    isConnected,
    error,
    lastUpdate,
    refresh: fetchData,
  };
}

// ==============================================================================
// HOOK: useRealtimeDispatch
// Specialized hook for dispatch board real-time updates
// ==============================================================================

export interface DispatchItem {
  id: string;
  status: string;
  order_number?: string;
  container_number?: string;
  driver_id?: string;
  [key: string]: any;
}

export interface UseRealtimeDispatchOptions {
  onOrderChange?: (order: DispatchItem, changeType: string) => void;
  onTripChange?: (trip: DispatchItem, changeType: string) => void;
  onContainerChange?: (container: DispatchItem, changeType: string) => void;
  showNotifications?: boolean;
}

export function useRealtimeDispatch(options: UseRealtimeDispatchOptions = {}) {
  const { onOrderChange, onTripChange, onContainerChange, showNotifications = true } = options;

  const [orders, setOrders] = useState<DispatchItem[]>([]);
  const [trips, setTrips] = useState<DispatchItem[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [lastActivity, setLastActivity] = useState<{ table: string; action: string; time: Date } | null>(null);
  const channelsRef = useRef<RealtimeChannel[]>([]);

  // Fetch initial data
  const fetchInitialData = useCallback(async () => {
    const [ordersResult, tripsResult] = await Promise.all([
      supabase
        .from('orders')
        .select('*, container:containers(*), shipment:shipments(*)')
        .in('status', ['PENDING', 'READY', 'DISPATCHED', 'IN_PROGRESS'])
        .is('deleted_at', null)
        .order('created_at', { ascending: false }),
      supabase
        .from('trips')
        .select('*, driver:drivers(*)')
        .in('status', ['PLANNED', 'ASSIGNED', 'DISPATCHED', 'EN_ROUTE', 'IN_PROGRESS'])
        .order('created_at', { ascending: false }),
    ]);

    if (ordersResult.data) setOrders(ordersResult.data);
    if (tripsResult.data) setTrips(tripsResult.data);
  }, []);

  useEffect(() => {
    fetchInitialData();

    // Subscribe to orders changes
    const ordersChannel = supabase
      .channel('realtime:orders:dispatch')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        (payload) => {
          const { eventType, old: oldRecord, new: newRecord } = payload;
          setLastActivity({ table: 'orders', action: eventType, time: new Date() });

          if (eventType === 'INSERT' && newRecord) {
            setOrders((prev) => [newRecord as DispatchItem, ...prev]);
            onOrderChange?.(newRecord as DispatchItem, 'created');
          } else if (eventType === 'UPDATE' && newRecord) {
            setOrders((prev) =>
              prev.map((o) => (o.id === (newRecord as any).id ? newRecord as DispatchItem : o))
            );
            onOrderChange?.(newRecord as DispatchItem, 'updated');
          } else if (eventType === 'DELETE' && oldRecord) {
            setOrders((prev) => prev.filter((o) => o.id !== (oldRecord as any).id));
            onOrderChange?.(oldRecord as DispatchItem, 'deleted');
          }
        }
      )
      .subscribe();

    // Subscribe to trips changes
    const tripsChannel = supabase
      .channel('realtime:trips:dispatch')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trips' },
        (payload) => {
          const { eventType, old: oldRecord, new: newRecord } = payload;
          setLastActivity({ table: 'trips', action: eventType, time: new Date() });

          if (eventType === 'INSERT' && newRecord) {
            setTrips((prev) => [newRecord as DispatchItem, ...prev]);
            onTripChange?.(newRecord as DispatchItem, 'created');
          } else if (eventType === 'UPDATE' && newRecord) {
            setTrips((prev) =>
              prev.map((t) => (t.id === (newRecord as any).id ? newRecord as DispatchItem : t))
            );
            onTripChange?.(newRecord as DispatchItem, 'updated');
          } else if (eventType === 'DELETE' && oldRecord) {
            setTrips((prev) => prev.filter((t) => t.id !== (oldRecord as any).id));
            onTripChange?.(oldRecord as DispatchItem, 'deleted');
          }
        }
      )
      .subscribe();

    // Subscribe to containers changes
    const containersChannel = supabase
      .channel('realtime:containers:dispatch')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'containers' },
        (payload) => {
          const { new: newRecord } = payload;
          setLastActivity({ table: 'containers', action: 'UPDATE', time: new Date() });
          onContainerChange?.(newRecord as DispatchItem, 'updated');
        }
      )
      .subscribe();

    // Track connection status
    ordersChannel.subscribe((status) => {
      setIsConnected(status === 'SUBSCRIBED');
    });

    channelsRef.current = [ordersChannel, tripsChannel, containersChannel];

    return () => {
      channelsRef.current.forEach((channel) => {
        supabase.removeChannel(channel);
      });
    };
  }, [fetchInitialData, onOrderChange, onTripChange, onContainerChange]);

  return {
    orders,
    trips,
    isConnected,
    lastActivity,
    refresh: fetchInitialData,
  };
}

// ==============================================================================
// HOOK: useRealtimeNotifications
// Subscribe to notification updates
// ==============================================================================

export interface Notification {
  id: string;
  title: string;
  message: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: string;
  created_at: string;
  read_at?: string;
}

export function useRealtimeNotifications(userId?: string) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const fetchNotifications = useCallback(async () => {
    let query = supabase
      .from('notifications')
      .select('*')
      .eq('status', 'PENDING')
      .order('created_at', { ascending: false })
      .limit(50);

    if (userId) {
      query = query.eq('recipient_user_id', userId);
    }

    const { data } = await query;
    setNotifications(data || []);
    setUnreadCount((data || []).filter((n) => !n.read_at).length);
  }, [userId]);

  const markAsRead = useCallback(async (notificationId: string) => {
    await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', notificationId);

    setNotifications((prev) =>
      prev.map((n) =>
        n.id === notificationId ? { ...n, read_at: new Date().toISOString() } : n
      )
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
  }, []);

  useEffect(() => {
    fetchNotifications();

    const channel = supabase
      .channel('realtime:notifications')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        (payload) => {
          const newNotification = payload.new as Notification;
          if (!userId || newNotification.id === userId) {
            setNotifications((prev) => [newNotification, ...prev]);
            setUnreadCount((prev) => prev + 1);
          }
        }
      )
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED');
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [userId, fetchNotifications]);

  return {
    notifications,
    unreadCount,
    isConnected,
    markAsRead,
    refresh: fetchNotifications,
  };
}

// ==============================================================================
// HOOK: useRealtimeDemurrageAlerts
// Monitor containers approaching LFD
// ==============================================================================

export interface DemurrageAlert {
  containerId: string;
  containerNumber: string;
  shipmentId: string;
  lastFreeDay: string;
  daysRemaining: number;
  urgency: 'OK' | 'WARNING' | 'CRITICAL' | 'OVERDUE';
  estimatedCharges: number;
}

export function useRealtimeDemurrageAlerts() {
  const [alerts, setAlerts] = useState<DemurrageAlert[]>([]);
  const [criticalCount, setCriticalCount] = useState(0);

  const calculateAlerts = useCallback(async () => {
    const { data: containers } = await supabase
      .from('containers')
      .select('id, container_number, shipment_id, shipment:shipments(last_free_day)')
      .not('shipment.last_free_day', 'is', null);

    if (!containers) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const processedAlerts: DemurrageAlert[] = [];

    for (const container of containers) {
      const shipment = container.shipment as any;
      if (!shipment?.last_free_day) continue;

      const lfd = new Date(shipment.last_free_day);
      lfd.setHours(0, 0, 0, 0);

      const daysRemaining = Math.ceil((lfd.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      let urgency: DemurrageAlert['urgency'] = 'OK';
      if (daysRemaining < 0) urgency = 'OVERDUE';
      else if (daysRemaining === 0) urgency = 'CRITICAL';
      else if (daysRemaining <= 2) urgency = 'WARNING';

      if (urgency !== 'OK') {
        processedAlerts.push({
          containerId: container.id,
          containerNumber: container.container_number,
          shipmentId: container.shipment_id,
          lastFreeDay: shipment.last_free_day,
          daysRemaining,
          urgency,
          estimatedCharges: Math.max(0, -daysRemaining) * 125, // $125/day average
        });
      }
    }

    // Sort by urgency
    processedAlerts.sort((a, b) => {
      const urgencyOrder = { OVERDUE: 0, CRITICAL: 1, WARNING: 2, OK: 3 };
      return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
    });

    setAlerts(processedAlerts);
    setCriticalCount(processedAlerts.filter((a) => a.urgency === 'CRITICAL' || a.urgency === 'OVERDUE').length);
  }, []);

  useEffect(() => {
    calculateAlerts();

    // Refresh every 5 minutes
    const interval = setInterval(calculateAlerts, 5 * 60 * 1000);

    // Subscribe to container changes
    const channel = supabase
      .channel('realtime:containers:demurrage')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'containers' },
        () => {
          calculateAlerts();
        }
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [calculateAlerts]);

  return {
    alerts,
    criticalCount,
    refresh: calculateAlerts,
  };
}

// ==============================================================================
// COMPONENT: RealtimeConnectionIndicator
// Shows connection status
// ==============================================================================

export function useConnectionStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof window !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}
