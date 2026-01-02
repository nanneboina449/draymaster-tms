// Shipment Status Change Notification API
// Place this in: web/src/app/api/notify/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const SENDGRID_API_URL = 'https://api.sendgrid.com/v3/mail/send';

async function sendEmail(to: string, subject: string, html: string, text: string) {
  // Get API key
  const { data: settings } = await supabase
    .from('notification_settings')
    .select('setting_value')
    .eq('setting_key', 'sendgrid_api_key')
    .single();

  const apiKey = settings?.setting_value || process.env.SENDGRID_API_KEY;
  if (!apiKey) {
    console.error('No SendGrid API key');
    return { success: false, error: 'No API key' };
  }

  const payload = {
    personalizations: [{ to: [{ email: to }], subject }],
    from: { email: 'noreply@draymaster.com', name: 'DrayMaster TMS' },
    content: [
      { type: 'text/plain', value: text },
      { type: 'text/html', value: html },
    ],
  };

  try {
    const response = await fetch(SENDGRID_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    return { success: response.status === 202 };
  } catch (error: any) {
    console.error('SendGrid error:', error);
    return { success: false, error: error.message };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'status-change': {
        // Notify customer when shipment status changes
        const { shipmentId, newStatus, oldStatus } = body;

        // Get shipment with customer info
        const { data: shipment } = await supabase
          .from('shipments')
          .select('*, customers(email, company_name, contact_email)')
          .eq('id', shipmentId)
          .single();

        if (!shipment) {
          return NextResponse.json({ error: 'Shipment not found' }, { status: 404 });
        }

        const customerEmail = shipment.customers?.contact_email || shipment.customers?.email;
        if (!customerEmail) {
          return NextResponse.json({ error: 'No customer email' }, { status: 400 });
        }

        const statusMessages: Record<string, string> = {
          'AVAILABLE': '🟢 Your container is now AVAILABLE for pickup!',
          'DISPATCHED': '🚛 A truck has been dispatched for your shipment',
          'IN_TRANSIT': '🚚 Your shipment is now in transit',
          'OUT_FOR_DELIVERY': '📦 Your shipment is out for delivery',
          'DELIVERED': '✅ Your shipment has been DELIVERED!',
          'AT_TERMINAL': '🏭 Your container has arrived at the terminal',
        };

        const message = statusMessages[newStatus] || `Status updated to: ${newStatus}`;

        const html = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #2563eb; color: white; padding: 20px; text-align: center;">
              <h1 style="margin: 0;">DrayMaster TMS</h1>
              <p style="margin: 5px 0 0 0;">Shipment Update</p>
            </div>
            <div style="padding: 30px; background: #f9fafb;">
              <h2 style="color: #1f2937;">${message}</h2>
              <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0;">
                <table style="width: 100%;">
                  <tr><td style="padding: 8px 0; color: #6b7280;">Reference:</td><td style="font-weight: bold;">${shipment.reference_number}</td></tr>
                  <tr><td style="padding: 8px 0; color: #6b7280;">Container:</td><td style="font-weight: bold; font-family: monospace;">${shipment.container_number}</td></tr>
                  <tr><td style="padding: 8px 0; color: #6b7280;">Terminal:</td><td>${shipment.terminal_name || '-'}</td></tr>
                  <tr><td style="padding: 8px 0; color: #6b7280;">Delivery To:</td><td>${shipment.delivery_city || shipment.delivery_location || '-'}</td></tr>
                  <tr><td style="padding: 8px 0; color: #6b7280;">New Status:</td><td><span style="background: #dcfce7; color: #166534; padding: 4px 12px; border-radius: 12px;">${newStatus.replace(/_/g, ' ')}</span></td></tr>
                </table>
              </div>
              <p style="color: #6b7280;">Track your shipment at the <a href="https://draymaster-tms.vercel.app/portal" style="color: #2563eb;">Customer Portal</a></p>
            </div>
          </div>
        `;

        const text = `${message}\n\nReference: ${shipment.reference_number}\nContainer: ${shipment.container_number}\nNew Status: ${newStatus}`;

        const result = await sendEmail(customerEmail, `Shipment Update: ${shipment.container_number} - ${newStatus.replace(/_/g, ' ')}`, html, text);

        // Log notification
        await supabase.from('notification_log').insert({
          template_code: 'STATUS_CHANGE',
          recipient_email: customerEmail,
          notification_type: 'EMAIL',
          email_to: customerEmail,
          email_subject: `Shipment Update: ${shipment.container_number}`,
          status: result.success ? 'SENT' : 'FAILED',
          sent_at: result.success ? new Date().toISOString() : null,
        });

        return NextResponse.json({ success: result.success, sentTo: customerEmail });
      }

      case 'lfd-warning': {
        // Send LFD warning emails
        const { daysAhead = 2 } = body;

        // Find shipments with LFD approaching
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + daysAhead);
        const dateStr = targetDate.toISOString().split('T')[0];

        const { data: shipments } = await supabase
          .from('shipments')
          .select('*, customers(email, company_name, contact_email)')
          .eq('last_free_day', dateStr)
          .not('status', 'in', '("DELIVERED","COMPLETED","CANCELLED")');

        if (!shipments || shipments.length === 0) {
          return NextResponse.json({ message: 'No LFD warnings needed', count: 0 });
        }

        let sentCount = 0;
        for (const shipment of shipments) {
          const customerEmail = shipment.customers?.contact_email || shipment.customers?.email;
          if (!customerEmail) continue;

          const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <div style="background: #dc2626; color: white; padding: 20px; text-align: center;">
                <h1 style="margin: 0;">⚠️ LFD Warning</h1>
              </div>
              <div style="padding: 30px; background: #fef2f2;">
                <h2 style="color: #991b1b;">Last Free Day ${daysAhead === 1 ? 'is TOMORROW!' : `in ${daysAhead} Days`}</h2>
                <p>Container <strong>${shipment.container_number}</strong> must be picked up to avoid demurrage charges.</p>
                <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0; border: 2px solid #fca5a5;">
                  <table style="width: 100%;">
                    <tr><td style="padding: 8px 0; color: #6b7280;">Container:</td><td style="font-weight: bold; font-family: monospace; font-size: 18px;">${shipment.container_number}</td></tr>
                    <tr><td style="padding: 8px 0; color: #6b7280;">Terminal:</td><td>${shipment.terminal_name || '-'}</td></tr>
                    <tr><td style="padding: 8px 0; color: #6b7280;">Last Free Day:</td><td style="font-weight: bold; color: #dc2626; font-size: 18px;">${dateStr}</td></tr>
                  </table>
                </div>
                <p style="color: #991b1b; font-weight: bold;">Please arrange pickup immediately!</p>
              </div>
            </div>
          `;

          const text = `⚠️ LFD WARNING\n\nContainer ${shipment.container_number} has Last Free Day on ${dateStr}.\n\nTerminal: ${shipment.terminal_name}\n\nPlease arrange pickup immediately to avoid demurrage charges.`;

          const result = await sendEmail(
            customerEmail,
            `⚠️ URGENT: Last Free Day ${daysAhead === 1 ? 'Tomorrow' : `in ${daysAhead} Days`} - ${shipment.container_number}`,
            html,
            text
          );

          if (result.success) sentCount++;

          // Log
          await supabase.from('notification_log').insert({
            template_code: daysAhead === 1 ? 'LFD_WARNING_24H' : 'LFD_WARNING_48H',
            recipient_email: customerEmail,
            notification_type: 'EMAIL',
            email_to: customerEmail,
            email_subject: `LFD Warning - ${shipment.container_number}`,
            status: result.success ? 'SENT' : 'FAILED',
            sent_at: result.success ? new Date().toISOString() : null,
          });
        }

        return NextResponse.json({ success: true, count: sentCount, total: shipments.length });
      }

      case 'delivery-complete': {
        // Send delivery confirmation email
        const { shipmentId } = body;

        const { data: shipment } = await supabase
          .from('shipments')
          .select('*, customers(email, company_name, contact_email)')
          .eq('id', shipmentId)
          .single();

        if (!shipment) {
          return NextResponse.json({ error: 'Shipment not found' }, { status: 404 });
        }

        const customerEmail = shipment.customers?.contact_email || shipment.customers?.email;
        if (!customerEmail) {
          return NextResponse.json({ error: 'No customer email' }, { status: 400 });
        }

        const html = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #059669; color: white; padding: 20px; text-align: center;">
              <h1 style="margin: 0;">✅ Delivery Complete!</h1>
            </div>
            <div style="padding: 30px; background: #f0fdf4;">
              <h2 style="color: #166534;">Your shipment has been delivered</h2>
              <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0; border: 2px solid #86efac;">
                <table style="width: 100%;">
                  <tr><td style="padding: 8px 0; color: #6b7280;">Reference:</td><td style="font-weight: bold;">${shipment.reference_number}</td></tr>
                  <tr><td style="padding: 8px 0; color: #6b7280;">Container:</td><td style="font-weight: bold; font-family: monospace;">${shipment.container_number}</td></tr>
                  <tr><td style="padding: 8px 0; color: #6b7280;">Delivered To:</td><td>${shipment.delivery_location || shipment.delivery_city}</td></tr>
                  <tr><td style="padding: 8px 0; color: #6b7280;">Delivery Time:</td><td>${shipment.delivered_at ? new Date(shipment.delivered_at).toLocaleString() : new Date().toLocaleString()}</td></tr>
                </table>
              </div>
              <p>Thank you for your business!</p>
              <p style="color: #6b7280;">POD documents will be available in your <a href="https://draymaster-tms.vercel.app/portal" style="color: #059669;">Customer Portal</a></p>
            </div>
          </div>
        `;

        const text = `✅ DELIVERY COMPLETE\n\nContainer ${shipment.container_number} has been delivered.\n\nDelivered To: ${shipment.delivery_location || shipment.delivery_city}\n\nThank you for your business!`;

        const result = await sendEmail(customerEmail, `✅ Delivery Complete - ${shipment.container_number}`, html, text);

        return NextResponse.json({ success: result.success, sentTo: customerEmail });
      }

      case 'test-email': {
        // Send test email
        const { email } = body;

        const html = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #2563eb; color: white; padding: 20px; text-align: center;">
              <h1 style="margin: 0;">DrayMaster TMS</h1>
            </div>
            <div style="padding: 30px; background: #f0fdf4; text-align: center;">
              <h2 style="color: #166534;">✅ Email Configuration Working!</h2>
              <p>This is a test email from DrayMaster TMS.</p>
              <p>Your SendGrid integration is configured correctly.</p>
              <p style="color: #6b7280; margin-top: 30px;">Sent at: ${new Date().toLocaleString()}</p>
            </div>
          </div>
        `;

        const result = await sendEmail(email, 'DrayMaster TMS - Test Email', html, 'Test email from DrayMaster TMS');

        return NextResponse.json({ success: result.success, message: result.success ? 'Test email sent!' : 'Failed to send' });
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error: any) {
    console.error('Notify API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
