// SendGrid Email API Route
// Place this in: web/src/app/api/email/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const SENDGRID_API_URL = 'https://api.sendgrid.com/v3/mail/send';

// Get API key from database or environment
async function getSendGridApiKey(): Promise<string> {
  // First try environment variable
  if (process.env.SENDGRID_API_KEY) {
    return process.env.SENDGRID_API_KEY;
  }
  
  // Then try database
  const { data } = await supabase
    .from('notification_settings')
    .select('setting_value')
    .eq('setting_key', 'sendgrid_api_key')
    .single();
  
  return data?.setting_value || '';
}

// Get email settings from database
async function getEmailSettings() {
  const { data } = await supabase
    .from('notification_settings')
    .select('setting_key, setting_value')
    .in('setting_key', ['email_from_address', 'email_from_name']);
  
  const settings: Record<string, string> = {};
  data?.forEach(row => {
    settings[row.setting_key] = row.setting_value;
  });
  
  return {
    fromEmail: settings['email_from_address'] || 'noreply@draymaster.com',
    fromName: settings['email_from_name'] || 'DrayMaster TMS',
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'send': {
        const { to, toName, subject, text, html, replyTo, templateCode, templateData } = body;

        if (!to || !subject) {
          return NextResponse.json({ error: 'to and subject required' }, { status: 400 });
        }

        const apiKey = await getSendGridApiKey();
        if (!apiKey) {
          return NextResponse.json({ error: 'SendGrid API key not configured' }, { status: 500 });
        }

        const emailSettings = await getEmailSettings();

        // Build email content
        let emailHtml = html;
        let emailText = text;

        // If using a template, generate content
        if (templateCode && templateData) {
          const template = await generateTemplateContent(templateCode, templateData);
          emailHtml = template.html;
          emailText = template.text;
        }

        const payload = {
          personalizations: [
            {
              to: [{ email: to, name: toName }],
              subject: subject,
            },
          ],
          from: {
            email: emailSettings.fromEmail,
            name: emailSettings.fromName,
          },
          reply_to: replyTo ? { email: replyTo } : undefined,
          content: [
            ...(emailText ? [{ type: 'text/plain', value: emailText }] : []),
            ...(emailHtml ? [{ type: 'text/html', value: emailHtml }] : []),
          ],
        };

        const response = await fetch(SENDGRID_API_URL, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        // Log to email_queue
        const messageId = response.headers.get('X-Message-Id') || '';
        await supabase.from('email_queue').insert({
          to_email: to,
          to_name: toName,
          from_email: emailSettings.fromEmail,
          from_name: emailSettings.fromName,
          subject: subject,
          body_text: emailText,
          body_html: emailHtml,
          status: response.status === 202 ? 'SENT' : 'FAILED',
          sendgrid_message_id: messageId,
          sent_at: response.status === 202 ? new Date().toISOString() : null,
          error_message: response.status !== 202 ? await response.text() : null,
        });

        // Also log to notification_log
        await supabase.from('notification_log').insert({
          template_code: templateCode,
          recipient_email: to,
          recipient_name: toName,
          notification_type: 'EMAIL',
          email_to: to,
          email_subject: subject,
          email_body: emailText,
          status: response.status === 202 ? 'SENT' : 'FAILED',
          sent_at: response.status === 202 ? new Date().toISOString() : null,
          external_id: messageId,
        });

        if (response.status === 202) {
          return NextResponse.json({ success: true, messageId });
        } else {
          const error = await response.text();
          return NextResponse.json({ success: false, error }, { status: 500 });
        }
      }

      case 'send-invoice': {
        const { invoiceId } = body;

        // Fetch invoice details
        const { data: invoice, error: invoiceError } = await supabase
          .from('invoices')
          .select('*, invoice_line_items(*)')
          .eq('id', invoiceId)
          .single();

        if (invoiceError || !invoice) {
          return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
        }

        // Get customer email
        const { data: customer } = await supabase
          .from('customers')
          .select('email, company_name')
          .eq('id', invoice.customer_id)
          .single();

        if (!customer?.email) {
          return NextResponse.json({ error: 'Customer email not found' }, { status: 400 });
        }

        const apiKey = await getSendGridApiKey();
        const emailSettings = await getEmailSettings();

        // Generate invoice email
        const lineItems = (invoice.invoice_line_items || []).map((item: any) => ({
          description: item.description,
          amount: item.amount,
        }));

        const emailContent = generateInvoiceEmail({
          invoiceNumber: invoice.invoice_number,
          customerName: invoice.customer_name,
          totalAmount: invoice.total_amount,
          dueDate: new Date(invoice.due_date).toLocaleDateString(),
          lineItems,
        });

        const payload = {
          personalizations: [
            {
              to: [{ email: customer.email, name: invoice.customer_name }],
              subject: emailContent.subject,
            },
          ],
          from: {
            email: emailSettings.fromEmail,
            name: emailSettings.fromName,
          },
          content: [
            { type: 'text/plain', value: emailContent.text },
            { type: 'text/html', value: emailContent.html },
          ],
        };

        const response = await fetch(SENDGRID_API_URL, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (response.status === 202) {
          // Update invoice status
          await supabase
            .from('invoices')
            .update({
              status: 'SENT',
              sent_date: new Date().toISOString(),
              sent_to_email: customer.email,
            })
            .eq('id', invoiceId);

          return NextResponse.json({ success: true, sentTo: customer.email });
        } else {
          const error = await response.text();
          return NextResponse.json({ success: false, error }, { status: 500 });
        }
      }

      case 'send-lfd-warning': {
        const { containerNumber, customerEmail, customerName, terminal, lfdDate, orderNumber, daysRemaining } = body;

        const apiKey = await getSendGridApiKey();
        const emailSettings = await getEmailSettings();

        const emailContent = generateLfdWarningEmail({
          containerNumber,
          orderNumber,
          customerName,
          terminal,
          lfdDate,
          daysRemaining,
        });

        const payload = {
          personalizations: [
            {
              to: [{ email: customerEmail, name: customerName }],
              subject: emailContent.subject,
            },
          ],
          from: {
            email: emailSettings.fromEmail,
            name: emailSettings.fromName,
          },
          content: [
            { type: 'text/plain', value: emailContent.text },
            { type: 'text/html', value: emailContent.html },
          ],
        };

        const response = await fetch(SENDGRID_API_URL, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        // Log notification
        await supabase.from('notification_log').insert({
          template_code: daysRemaining === 1 ? 'LFD_WARNING_24H' : 'LFD_WARNING_48H',
          recipient_email: customerEmail,
          recipient_name: customerName,
          notification_type: 'EMAIL',
          email_to: customerEmail,
          email_subject: emailContent.subject,
          status: response.status === 202 ? 'SENT' : 'FAILED',
          sent_at: response.status === 202 ? new Date().toISOString() : null,
        });

        return NextResponse.json({ success: response.status === 202 });
      }

      case 'test': {
        // Send a test email
        const { testEmail } = body;
        
        const apiKey = await getSendGridApiKey();
        if (!apiKey) {
          return NextResponse.json({ error: 'SendGrid API key not configured' }, { status: 500 });
        }

        const emailSettings = await getEmailSettings();

        const payload = {
          personalizations: [
            {
              to: [{ email: testEmail }],
              subject: 'DrayMaster TMS - Test Email',
            },
          ],
          from: {
            email: emailSettings.fromEmail,
            name: emailSettings.fromName,
          },
          content: [
            { type: 'text/plain', value: 'This is a test email from DrayMaster TMS. If you received this, your email configuration is working correctly!' },
            { type: 'text/html', value: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: #2563eb; color: white; padding: 20px; text-align: center;">
                  <h1 style="margin: 0;">DrayMaster TMS</h1>
                </div>
                <div style="padding: 30px; background: #f0fdf4; text-align: center;">
                  <h2 style="color: #166534;">✓ Email Configuration Working!</h2>
                  <p>This is a test email from DrayMaster TMS.</p>
                  <p>If you received this, your SendGrid integration is configured correctly.</p>
                  <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">Sent at: ${new Date().toLocaleString()}</p>
                </div>
              </div>
            ` },
          ],
        };

        const response = await fetch(SENDGRID_API_URL, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (response.status === 202) {
          return NextResponse.json({ success: true, message: `Test email sent to ${testEmail}` });
        } else {
          const error = await response.text();
          return NextResponse.json({ success: false, error }, { status: 500 });
        }
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error: any) {
    console.error('Email API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Template generation helpers
async function generateTemplateContent(templateCode: string, data: any) {
  // Fetch template from database
  const { data: template } = await supabase
    .from('notification_templates')
    .select('email_subject, email_body, email_html')
    .eq('code', templateCode)
    .single();

  if (!template) {
    return { subject: '', html: '', text: '' };
  }

  // Replace variables
  let subject = template.email_subject || '';
  let html = template.email_html || template.email_body || '';
  let text = template.email_body || '';

  Object.keys(data).forEach(key => {
    const regex = new RegExp(`{{${key}}}`, 'g');
    subject = subject.replace(regex, data[key]);
    html = html.replace(regex, data[key]);
    text = text.replace(regex, data[key]);
  });

  return { subject, html, text };
}

function generateInvoiceEmail(data: {
  invoiceNumber: string;
  customerName: string;
  totalAmount: number;
  dueDate: string;
  lineItems: Array<{ description: string; amount: number }>;
}) {
  return {
    subject: `Invoice ${data.invoiceNumber} from DrayMaster`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #2563eb; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0;">DrayMaster TMS</h1>
          <p style="margin: 5px 0 0 0; opacity: 0.9;">Invoice</p>
        </div>
        <div style="padding: 30px; background: #f9fafb;">
          <h2 style="color: #1f2937;">Invoice ${data.invoiceNumber}</h2>
          <p>Dear ${data.customerName},</p>
          <p>Please find your invoice details below.</p>
          
          <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <table style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr style="border-bottom: 2px solid #e5e7eb;">
                  <th style="padding: 10px; text-align: left;">Description</th>
                  <th style="padding: 10px; text-align: right;">Amount</th>
                </tr>
              </thead>
              <tbody>
                ${data.lineItems.map(item => `
                  <tr style="border-bottom: 1px solid #e5e7eb;">
                    <td style="padding: 10px;">${item.description}</td>
                    <td style="padding: 10px; text-align: right;">$${item.amount.toFixed(2)}</td>
                  </tr>
                `).join('')}
              </tbody>
              <tfoot>
                <tr style="background: #f3f4f6;">
                  <td style="padding: 15px; font-weight: bold; font-size: 18px;">Total Due</td>
                  <td style="padding: 15px; text-align: right; font-weight: bold; font-size: 18px; color: #2563eb;">$${data.totalAmount.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          
          <p><strong>Due Date:</strong> ${data.dueDate}</p>
          <p>Thank you for your business!</p>
        </div>
        <div style="background: #1f2937; color: #9ca3af; padding: 15px; text-align: center; font-size: 12px;">
          © 2025 DrayMaster TMS. All rights reserved.
        </div>
      </div>
    `,
    text: `Invoice ${data.invoiceNumber}\n\nTotal: $${data.totalAmount.toFixed(2)}\nDue Date: ${data.dueDate}\n\nThank you for your business!`,
  };
}

function generateLfdWarningEmail(data: {
  containerNumber: string;
  orderNumber: string;
  customerName: string;
  terminal: string;
  lfdDate: string;
  daysRemaining: number;
}) {
  return {
    subject: `⚠️ URGENT: Last Free Day ${data.daysRemaining === 1 ? 'Tomorrow' : `in ${data.daysRemaining} Days`} - ${data.containerNumber}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #dc2626; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0;">⚠️ LFD Warning</h1>
        </div>
        <div style="padding: 30px; background: #fef2f2;">
          <h2 style="color: #991b1b;">Action Required</h2>
          <p>Dear ${data.customerName},</p>
          <p><strong>Container ${data.containerNumber}</strong> has Last Free Day ${data.daysRemaining === 1 ? 'TOMORROW' : `in ${data.daysRemaining} days`}.</p>
          
          <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0; border: 2px solid #fca5a5;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="padding: 8px 0; color: #6b7280;">Container:</td><td style="padding: 8px 0; font-weight: bold;">${data.containerNumber}</td></tr>
              <tr><td style="padding: 8px 0; color: #6b7280;">Order:</td><td style="padding: 8px 0;">${data.orderNumber}</td></tr>
              <tr><td style="padding: 8px 0; color: #6b7280;">Terminal:</td><td style="padding: 8px 0;">${data.terminal}</td></tr>
              <tr><td style="padding: 8px 0; color: #6b7280;">Last Free Day:</td><td style="padding: 8px 0; font-weight: bold; color: #dc2626;">${data.lfdDate}</td></tr>
            </table>
          </div>
          
          <p style="color: #991b1b; font-weight: bold;">Please arrange pickup/return immediately to avoid demurrage charges.</p>
        </div>
      </div>
    `,
    text: `URGENT: LFD Warning\n\nContainer ${data.containerNumber} - LFD ${data.daysRemaining === 1 ? 'Tomorrow' : `in ${data.daysRemaining} days`}\n\nTerminal: ${data.terminal}\nLFD: ${data.lfdDate}\n\nPlease arrange pickup immediately.`,
  };
}
