// eModal API Route
// Place this in: web/src/app/api/emodal/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// eModal API Configuration
const EMODAL_CONFIG = {
  dataServicesUrl: 'https://apidocs.eds.emodal.com',
  propassUrl: 'https://propassapi.emodal.com/api',
};

// Get API key from database settings
async function getApiKey(): Promise<string> {
  const { data } = await supabase
    .from('emodal_config')
    .select('api_key')
    .eq('is_active', true)
    .limit(1)
    .single();

  return data?.api_key || '';
}

// Fetch with eModal authentication
async function fetchEmodal(url: string, apiKey: string, options: RequestInit = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'apikey': apiKey,
      ...options.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`eModal API Error: ${response.status}`);
  }

  return response.json();
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  try {
    const apiKey = await getApiKey();

    switch (action) {
      case 'terminals': {
        // Get list of terminals
        const url = `${EMODAL_CONFIG.dataServicesUrl}/terminalmetrics/v1/terminals`;
        const data = await fetchEmodal(url, apiKey);
        return NextResponse.json(data);
      }

      case 'availability': {
        // Get appointment availability for a terminal
        const terminalId = searchParams.get('terminalId');
        if (!terminalId) {
          return NextResponse.json({ error: 'terminalId required' }, { status: 400 });
        }
        const url = `${EMODAL_CONFIG.dataServicesUrl}/terminalmetrics/v1/terminals/${terminalId}/apptavailability`;
        const data = await fetchEmodal(url, apiKey);
        return NextResponse.json(data);
      }

      case 'dwell': {
        // Get dwell statistics
        const terminalId = searchParams.get('terminalId');
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');
        const dwellOption = searchParams.get('dwellOption') || 'all';
        
        if (!terminalId || !startDate || !endDate) {
          return NextResponse.json({ error: 'terminalId, startDate, endDate required' }, { status: 400 });
        }
        
        const params = new URLSearchParams({
          start_date: startDate,
          end_date: endDate,
          dwell_option: dwellOption,
        });
        
        const url = `${EMODAL_CONFIG.dataServicesUrl}/terminalmetrics/v1/terminals/${terminalId}/containerdwelltime?${params}`;
        const data = await fetchEmodal(url, apiKey);
        return NextResponse.json(data);
      }

      case 'container': {
        // Get container status
        const containerNumber = searchParams.get('container');
        if (!containerNumber) {
          return NextResponse.json({ error: 'container required' }, { status: 400 });
        }
        
        const url = `${EMODAL_CONFIG.propassUrl}/appointments/container/${containerNumber}`;
        const data = await fetchEmodal(url, apiKey);
        return NextResponse.json(mapContainerResponse(data));
      }

      case 'slots': {
        // Get available appointment slots
        const terminalCode = searchParams.get('terminal');
        const moveType = searchParams.get('moveType');
        const date = searchParams.get('date');
        
        if (!terminalCode || !moveType || !date) {
          return NextResponse.json({ error: 'terminal, moveType, date required' }, { status: 400 });
        }
        
        const params = new URLSearchParams({ terminal: terminalCode, moveType, date });
        const url = `${EMODAL_CONFIG.propassUrl}/appointments/slots?${params}`;
        const data = await fetchEmodal(url, apiKey);
        return NextResponse.json(data);
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error: any) {
    console.error('eModal API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const body = await request.json();

  try {
    const apiKey = await getApiKey();

    switch (action) {
      case 'sync': {
        // Sync multiple containers
        const { containers } = body;
        if (!containers || !Array.isArray(containers)) {
          return NextResponse.json({ error: 'containers array required' }, { status: 400 });
        }

        const results = await Promise.allSettled(
          containers.map(async (containerNumber: string) => {
            try {
              const url = `${EMODAL_CONFIG.propassUrl}/appointments/container/${containerNumber}`;
              const data = await fetchEmodal(url, apiKey);
              const mapped = mapContainerResponse(data);

              // Update database
              await supabase
                .from('container_tracking')
                .upsert({
                  container_number: containerNumber,
                  emodal_status: mapped.status_desc,
                  availability_status: mapped.availability,
                  has_customs_hold: mapped.holds?.customs || false,
                  has_freight_hold: mapped.holds?.freight || false,
                  has_usda_hold: mapped.holds?.usda || false,
                  terminal_name: mapped.facility_name,
                  yard_location: mapped.yard_location,
                  last_free_day: mapped.last_free_day,
                  vessel_name: mapped.vessel_name,
                  last_checked_at: new Date().toISOString(),
                  raw_response: data,
                }, { onConflict: 'container_number' });

              // Log history
              await supabase.from('container_tracking_history').insert({
                container_number: containerNumber,
                status: mapped.status_desc,
                availability_status: mapped.availability,
                holds: mapped.holds,
                yard_location: mapped.yard_location,
                source: 'EMODAL',
              });

              return { container: containerNumber, success: true, data: mapped };
            } catch (err: any) {
              return { container: containerNumber, success: false, error: err.message };
            }
          })
        );

        // Update sync status
        await supabase
          .from('emodal_config')
          .update({
            last_sync_at: new Date().toISOString(),
            last_sync_status: 'SUCCESS',
          })
          .not('id', 'is', null);

        return NextResponse.json({ 
          success: true, 
          results: results.map(r => r.status === 'fulfilled' ? r.value : { success: false })
        });
      }

      case 'book': {
        // Book an appointment
        const url = `${EMODAL_CONFIG.propassUrl}/appointments/book`;
        const data = await fetchEmodal(url, apiKey, {
          method: 'POST',
          body: JSON.stringify(body),
        });
        return NextResponse.json(data);
      }

      case 'cancel': {
        // Cancel an appointment
        const { appointmentNumber } = body;
        const url = `${EMODAL_CONFIG.propassUrl}/appointments/${appointmentNumber}/cancel`;
        const data = await fetchEmodal(url, apiKey, { method: 'POST' });
        return NextResponse.json(data);
      }

      case 'watchlist-add': {
        // Add to watchlist
        const { containerNumber, terminalCode } = body;
        const url = `${EMODAL_CONFIG.propassUrl}/watchlist/add`;
        const data = await fetchEmodal(url, apiKey, {
          method: 'POST',
          body: JSON.stringify({ containerNumber, terminalCode }),
        });
        return NextResponse.json(data);
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error: any) {
    console.error('eModal API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Map eModal response to our format
function mapContainerResponse(data: any) {
  return {
    container_number: data.unitinfo?.unit_nbr || data.container_number || '',
    status_cd: data.unitstatusinfo?.status_cd || data.status || '',
    status_desc: data.unitstatusinfo?.status_desc || data.status_description || '',
    availability: data.unitstatusinfo?.status_cd === 'Y' ? 'AVAILABLE' : 'NOT_AVAILABLE',
    unit_use: data.unitstatusinfo?.unituse_desc || data.unit_use || '',
    facility_cd: data.currentlocationinfo?.facility_cd || data.terminal_code || '',
    facility_name: data.currentlocationinfo?.facility || data.terminal_name || '',
    vessel_name: data.arrivalinfo?.carrier_cd || data.vessel || '',
    voyage: data.voyage || '',
    discharge_date: data.discharge_date || null,
    last_free_day: data.last_free_day || null,
    holds: {
      customs: data.holds?.customs || false,
      freight: data.holds?.freight || false,
      usda: data.holds?.usda || false,
      tmf: data.holds?.tmf || false,
      other: data.holds?.other || false,
    },
    yard_location: data.yard_location || '',
    container_size: data.unitinfo?.unitsztype_cd?.substring(0, 2) || data.size || '40',
    container_type: data.unitinfo?.unitsztype_cd?.substring(2) || data.type || 'DRY',
    weight: data.weight || 0,
  };
}
