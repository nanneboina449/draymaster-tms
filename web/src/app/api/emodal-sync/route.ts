// eModal Sync API Route
// Place this in: web/src/app/api/emodal-sync/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// eModal API endpoints (these are placeholder URLs - real implementation would use actual eModal API)
const EMODAL_DATA_API = 'https://apidocs.eds.emodal.com';
const EMODAL_PROPASS_API = 'https://propassapi.emodal.com/api';

interface ContainerUpdateResult {
  container_number: string;
  success: boolean;
  error?: string;
  data?: any;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let containersUpdated = 0;
  let containersFailed = 0;
  let errorMessage = '';

  try {
    // Get eModal config
    const { data: config } = await supabase
      .from('emodal_config')
      .select('*')
      .eq('is_active', true)
      .single();

    // Get all containers that need tracking
    const { data: containers } = await supabase
      .from('container_tracking')
      .select('id, container_number, terminal_code, shipment_id')
      .order('last_checked_at', { ascending: true })
      .limit(50); // Process in batches

    if (!containers || containers.length === 0) {
      // If no containers in tracking table, get from shipments
      const { data: shipments } = await supabase
        .from('shipments')
        .select('id, special_instructions, terminal_name')
        .not('status', 'in', '("DELIVERED","COMPLETED","CANCELLED")')
        .limit(50);

      // Extract container numbers from shipments and add to tracking
      if (shipments) {
        for (const shipment of shipments) {
          const containerMatch = shipment.special_instructions?.match(/Container:\s*([A-Z]{4}\d{7})/i);
          if (containerMatch) {
            const containerNumber = containerMatch[1];
            
            // Check if already exists
            const { data: existing } = await supabase
              .from('container_tracking')
              .select('id')
              .eq('container_number', containerNumber)
              .single();

            if (!existing) {
              await supabase.from('container_tracking').insert({
                container_number: containerNumber,
                shipment_id: shipment.id,
                terminal_name: shipment.terminal_name,
                availability_status: 'UNKNOWN',
                last_checked_at: new Date().toISOString(),
              });
            }
          }
        }
      }
    }

    // Re-fetch containers after potential additions
    const { data: containersToSync } = await supabase
      .from('container_tracking')
      .select('*')
      .order('last_checked_at', { ascending: true })
      .limit(50);

    if (containersToSync && containersToSync.length > 0) {
      // Simulate eModal API call (in production, this would be real API calls)
      for (const container of containersToSync) {
        try {
          const result = await syncContainerStatus(container, config);
          
          if (result.success) {
            // Update container in database
            await supabase
              .from('container_tracking')
              .update({
                ...result.data,
                last_checked_at: new Date().toISOString(),
              })
              .eq('id', container.id);

            // Log history
            await supabase.from('container_tracking_history').insert({
              container_id: container.id,
              container_number: container.container_number,
              status: result.data.availability_status,
              emodal_status: result.data.emodal_status,
              has_customs_hold: result.data.has_customs_hold,
              has_freight_hold: result.data.has_freight_hold,
              source: 'EMODAL_SYNC',
              raw_response: JSON.stringify(result.data),
            });

            containersUpdated++;

            // Check for LFD alerts and send notifications
            if (result.data.last_free_day) {
              const lfd = new Date(result.data.last_free_day);
              const daysUntilLfd = Math.ceil((lfd.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
              
              if (daysUntilLfd <= 2 && daysUntilLfd >= 0) {
                // Get shipment and customer info for notification
                const { data: shipment } = await supabase
                  .from('shipments')
                  .select('id, reference_number, customer_id')
                  .eq('id', container.shipment_id)
                  .single();

                if (shipment) {
                  const { data: customer } = await supabase
                    .from('customers')
                    .select('name, contact_name')
                    .eq('id', shipment.customer_id)
                    .single();

                  // Queue LFD warning email
                  await supabase.from('email_queue').insert({
                    to_email: customer?.name || 'operations@company.com',
                    subject: `⚠️ LFD Alert: ${container.container_number} - ${daysUntilLfd === 0 ? 'TODAY' : daysUntilLfd === 1 ? 'TOMORROW' : `${daysUntilLfd} days`}`,
                    template_code: 'LFD_WARNING',
                    template_data: JSON.stringify({
                      container_number: container.container_number,
                      terminal_name: container.terminal_name,
                      last_free_day: result.data.last_free_day,
                      days_remaining: daysUntilLfd,
                    }),
                    status: 'PENDING',
                  });
                }
              }
            }

            // Update shipment status based on container availability
            if (container.shipment_id && result.data.availability_status === 'AVAILABLE') {
              await supabase
                .from('shipments')
                .update({ status: 'AVAILABLE' })
                .eq('id', container.shipment_id)
                .in('status', ['PENDING', 'BOOKED', 'AT_TERMINAL']);
            }

          } else {
            containersFailed++;
            if (!errorMessage) errorMessage = result.error || 'Unknown error';
          }
        } catch (err: any) {
          containersFailed++;
          console.error(`Error syncing ${container.container_number}:`, err);
        }
      }
    }

    // Update config with last sync info
    if (config?.id) {
      await supabase
        .from('emodal_config')
        .update({
          last_sync_at: new Date().toISOString(),
          sync_status: containersFailed === 0 ? 'SUCCESS' : 'PARTIAL',
          containers_synced: containersUpdated,
          errors_count: containersFailed,
        })
        .eq('id', config.id);
    }

    // Log sync
    const duration = Date.now() - startTime;
    await supabase.from('emodal_sync_log').insert({
      synced_at: new Date().toISOString(),
      containers_updated: containersUpdated,
      containers_failed: containersFailed,
      duration_ms: duration,
      status: containersFailed === 0 ? 'SUCCESS' : (containersUpdated > 0 ? 'PARTIAL' : 'FAILED'),
      error_message: errorMessage || null,
    });

    return NextResponse.json({
      success: true,
      containersUpdated,
      containersFailed,
      duration,
    });

  } catch (error: any) {
    console.error('eModal sync error:', error);

    // Log failed sync
    await supabase.from('emodal_sync_log').insert({
      synced_at: new Date().toISOString(),
      containers_updated: containersUpdated,
      containers_failed: containersFailed,
      duration_ms: Date.now() - startTime,
      status: 'FAILED',
      error_message: error.message,
    });

    return NextResponse.json({ 
      success: false, 
      error: error.message,
      containersUpdated,
      containersFailed,
    }, { status: 500 });
  }
}

// eModal EDS status_cd → availability mapping
const STATUS_AVAILABILITY: Record<string, string> = {
  'Y': 'AVAILABLE',     // In yard / available
  'A': 'AVAILABLE',     // Available
  'D': 'DISCHARGED',
  'R': 'RELEASED',
  'I': 'IN_YARD',       // Gate in
  'H': 'NOT_AVAILABLE', // On hold
  'C': 'NOT_AVAILABLE', // Customs hold
  'O': 'NOT_AVAILABLE', // Gate out
  'M': 'NOT_AVAILABLE', // Manifested
  'L': 'NOT_AVAILABLE', // Loaded
};

async function syncContainerStatus(
  container: any,
  config: any
): Promise<ContainerUpdateResult> {
  try {
    const apiKey = config?.api_key_encrypted || '';
    const url = `${EMODAL_PROPASS_API}/container/${container.container_number}`;

    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        'apikey': apiKey,
      },
    });

    if (!response.ok) {
      return {
        container_number: container.container_number,
        success: false,
        error: `eModal API returned ${response.status}`,
      };
    }

    const data = await response.json();
    const statusCd: string = data.unitstatusinfo?.status_cd || '';

    return {
      container_number: container.container_number,
      success: true,
      data: {
        emodal_status:        data.unitstatusinfo?.status_desc || statusCd,
        availability_status: STATUS_AVAILABILITY[statusCd] || 'UNKNOWN',
        has_customs_hold:     data.holds?.customs || false,
        has_freight_hold:     data.holds?.freight || false,
        has_usda_hold:        data.holds?.usda    || false,
        last_free_day:        data.last_free_day  || null,
        yard_location:        data.yard_location  || '',
        terminal_name:        data.currentlocationinfo?.facility || container.terminal_name,
        gate_status:          STATUS_AVAILABILITY[statusCd] === 'AVAILABLE' ? 'READY' : 'NOT_READY',
      },
    };
  } catch (error: any) {
    return {
      container_number: container.container_number,
      success: false,
      error: error.message,
    };
  }
}

// GET endpoint for checking sync status
export async function GET(request: NextRequest) {
  try {
    // Get last sync info
    const { data: config } = await supabase
      .from('emodal_config')
      .select('last_sync_at, sync_status, containers_synced, errors_count, auto_refresh_enabled, refresh_interval_minutes')
      .eq('is_active', true)
      .single();

    // Get last few sync logs
    const { data: recentLogs } = await supabase
      .from('emodal_sync_log')
      .select('*')
      .order('synced_at', { ascending: false })
      .limit(5);

    // Get container stats
    const { data: containers } = await supabase
      .from('container_tracking')
      .select('availability_status, has_customs_hold, has_freight_hold');

    const stats = {
      total: containers?.length || 0,
      available: containers?.filter(c => c.availability_status === 'AVAILABLE').length || 0,
      onHold: containers?.filter(c => c.has_customs_hold || c.has_freight_hold).length || 0,
    };

    return NextResponse.json({
      config,
      recentLogs,
      stats,
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
