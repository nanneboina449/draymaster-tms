'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface DroppedContainer {
  id: string;
  container_number: string;
  size?: string;
  customer_name?: string;
  delivery_city?: string;
  delivery_address?: string;
  delivered_at?: string;
  lifecycle_status: string;
  empty_ready_at?: string;
  shipment_reference?: string;
}

interface EmptyReadyPanelProps {
  onRefresh?: () => void;
}

export default function EmptyReadyPanel({ onRefresh }: EmptyReadyPanelProps) {
  const [containers, setContainers] = useState<DroppedContainer[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingEmpty, setMarkingEmpty] = useState<string | null>(null);

  const loadDroppedContainers = async () => {
    setLoading(true);
    try {
      // Find containers that have been dropped but not yet marked empty
      const { data, error } = await supabase
        .from('containers')
        .select(`
          id,
          container_number,
          size,
          lifecycle_status,
          empty_ready_at,
          shipment:shipments!shipment_id(
            reference_number,
            customer_name
          )
        `)
        .in('lifecycle_status', ['DROPPED', 'DELIVERED'])
        .is('empty_ready_at', null)
        .order('updated_at', { ascending: false })
        .limit(20);

      if (error) throw error;

      // Get delivery info from orders
      const containerIds = (data || []).map(c => c.id);
      const { data: ordersData } = await supabase
        .from('orders')
        .select('container_id, delivery_city, delivery_address, delivered_at')
        .in('container_id', containerIds)
        .eq('move_type_v2', 'IMPORT_DELIVERY');

      const ordersMap = new Map(ordersData?.map(o => [o.container_id, o]) || []);

      const transformed: DroppedContainer[] = (data || []).map((c: any) => ({
        id: c.id,
        container_number: c.container_number,
        size: c.size,
        lifecycle_status: c.lifecycle_status,
        empty_ready_at: c.empty_ready_at,
        customer_name: c.shipment?.customer_name,
        shipment_reference: c.shipment?.reference_number,
        delivery_city: ordersMap.get(c.id)?.delivery_city,
        delivery_address: ordersMap.get(c.id)?.delivery_address,
        delivered_at: ordersMap.get(c.id)?.delivered_at,
      }));

      setContainers(transformed);
    } catch (err) {
      console.error('Error loading dropped containers:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDroppedContainers();
  }, []);

  const handleMarkEmpty = async (containerId: string) => {
    setMarkingEmpty(containerId);
    try {
      // Call the mark_container_empty_ready function
      const { error } = await supabase.rpc('mark_container_empty_ready', {
        p_container_id: containerId,
        p_confirmed_by: 'Dispatcher', // TODO: Use actual user name
      });

      if (error) {
        // Fallback to direct update if function doesn't exist
        const { error: updateError } = await supabase
          .from('containers')
          .update({
            empty_ready_at: new Date().toISOString(),
            empty_ready_confirmed_by: 'Dispatcher',
            lifecycle_status: 'EMPTY_PICKED',
            updated_at: new Date().toISOString(),
          })
          .eq('id', containerId);

        if (updateError) throw updateError;

        // Also update related EMPTY_RETURN orders to READY
        await supabase
          .from('orders')
          .update({ status: 'READY', updated_at: new Date().toISOString() })
          .eq('container_id', containerId)
          .eq('move_type_v2', 'EMPTY_RETURN')
          .eq('status', 'PENDING');
      }

      loadDroppedContainers();
      onRefresh?.();
    } catch (err: any) {
      alert('Error marking empty: ' + err.message);
    } finally {
      setMarkingEmpty(null);
    }
  };

  // Calculate how long container has been at customer
  const getDaysAtCustomer = (deliveredAt?: string) => {
    if (!deliveredAt) return null;
    const delivered = new Date(deliveredAt);
    const now = new Date();
    const days = Math.floor((now.getTime() - delivered.getTime()) / (1000 * 60 * 60 * 24));
    return days;
  };

  if (loading) {
    return (
      <div className="p-4 text-center text-gray-500">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600 mx-auto"></div>
      </div>
    );
  }

  if (containers.length === 0) {
    return (
      <div className="p-4 text-center text-gray-500">
        <p className="text-sm">No containers waiting for empty confirmation</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
          <span>📦</span> Dropped Containers
        </h3>
        <button
          onClick={loadDroppedContainers}
          className="text-xs text-gray-500 hover:text-gray-700"
        >
          Refresh
        </button>
      </div>

      <p className="text-xs text-gray-500 mb-3">
        Mark containers as empty when customer confirms
      </p>

      <div className="space-y-2 max-h-80 overflow-y-auto">
        {containers.map(container => {
          const daysAtCustomer = getDaysAtCustomer(container.delivered_at);
          return (
            <div
              key={container.id}
              className="p-3 bg-gray-50 rounded-lg border"
            >
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="font-mono font-bold text-sm">{container.container_number}</span>
                  <span className="text-xs text-gray-500 ml-2">{container.size}'</span>
                </div>
                {daysAtCustomer !== null && (
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    daysAtCustomer >= 3 ? 'bg-red-100 text-red-700' :
                    daysAtCustomer >= 2 ? 'bg-yellow-100 text-yellow-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {daysAtCustomer === 0 ? 'Today' : `${daysAtCustomer}d ago`}
                  </span>
                )}
              </div>

              <p className="text-xs text-gray-600 mb-1">{container.customer_name}</p>
              <p className="text-xs text-gray-500 mb-2">{container.delivery_city}</p>

              <button
                onClick={() => handleMarkEmpty(container.id)}
                disabled={markingEmpty === container.id}
                className="w-full py-1.5 bg-green-100 text-green-700 rounded text-xs font-medium hover:bg-green-200 disabled:opacity-50 transition"
              >
                {markingEmpty === container.id ? 'Marking...' : '✓ Mark Empty Ready'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
