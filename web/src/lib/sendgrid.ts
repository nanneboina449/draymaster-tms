// SendGrid Email Service
// Place this in: web/src/lib/sendgrid.ts

interface EmailOptions {
  to: string;
  toName?: string;
  subject: string;
  text?: string;
  html?: string;
  from?: string;
  fromName?: string;
  replyTo?: string;
  attachments?: Array<{
    content: string; // Base64 encoded
    filename: string;
    type: string;
    disposition?: 'attachment' | 'inline';
  }>;
}

interface SendGridResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

const SENDGRID_API_URL = 'https://api.sendgrid.com/v3/mail/send';

export async function sendEmail(
  options: EmailOptions,
  apiKey?: string
): Promise<SendGridResponse> {
  const key = apiKey || process.env.SENDGRID_API_KEY;
  
  if (!key) {
    console.error('SendGrid API key not configured');
    return { success: false, error: 'API key not configured' };
  }

  const payload = {
    personalizations: [
      {
        to: [{ email: options.to, name: options.toName }],
        subject: options.subject,
      },
    ],
    from: {
      email: options.from || 'noreply@draymaster.com',
      name: options.fromName || 'DrayMaster TMS',
    },
    reply_to: options.replyTo ? { email: options.replyTo } : undefined,
    content: [
      ...(options.text ? [{ type: 'text/plain', value: options.text }] : []),
      ...(options.html ? [{ type: 'text/html', value: options.html }] : []),
    ],
    attachments: options.attachments,
  };

  try {
    const response = await fetch(SENDGRID_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (response.status === 202) {
      const messageId = response.headers.get('X-Message-Id') || '';
      return { success: true, messageId };
    } else {
      const error = await response.text();
      console.error('SendGrid error:', error);
      return { success: false, error };
    }
  } catch (error: any) {
    console.error('SendGrid error:', error);
    return { success: false, error: error.message };
  }
}

// Email templates for common notifications
export const emailTemplates = {
  deliveryComplete: (data: {
    containerNumber: string;
    orderNumber: string;
    deliveryLocation: string;
    deliveryTime: string;
    driverName: string;
    customerName: string;
  }) => ({
    subject: `Delivery Complete - ${data.containerNumber}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #2563eb; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0;">DrayMaster TMS</h1>
        </div>
        <div style="padding: 30px; background: #f9fafb;">
          <h2 style="color: #1f2937;">Delivery Completed</h2>
          <p>Dear ${data.customerName},</p>
          <p>Your delivery has been completed successfully.</p>
          
          <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">Container:</td>
                <td style="padding: 8px 0; font-weight: bold;">${data.containerNumber}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">Order:</td>
                <td style="padding: 8px 0;">${data.orderNumber}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">Delivered To:</td>
                <td style="padding: 8px 0;">${data.deliveryLocation}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">Delivery Time:</td>
                <td style="padding: 8px 0;">${data.deliveryTime}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">Driver:</td>
                <td style="padding: 8px 0;">${data.driverName}</td>
              </tr>
            </table>
          </div>
          
          <p>Thank you for your business!</p>
          <p style="color: #6b7280; font-size: 14px;">- DrayMaster TMS Team</p>
        </div>
        <div style="background: #1f2937; color: #9ca3af; padding: 15px; text-align: center; font-size: 12px;">
          © 2025 DrayMaster TMS. All rights reserved.
        </div>
      </div>
    `,
    text: `Delivery Complete\n\nContainer: ${data.containerNumber}\nOrder: ${data.orderNumber}\nDelivered To: ${data.deliveryLocation}\nDelivery Time: ${data.deliveryTime}\nDriver: ${data.driverName}\n\nThank you for your business!\n- DrayMaster TMS`,
  }),

  lfdWarning: (data: {
    containerNumber: string;
    orderNumber: string;
    customerName: string;
    terminal: string;
    lfdDate: string;
    daysRemaining: number;
  }) => ({
    subject: `⚠️ URGENT: Last Free Day ${data.daysRemaining === 1 ? 'Tomorrow' : `in ${data.daysRemaining} Days`} - ${data.containerNumber}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #dc2626; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0;">⚠️ LFD Warning</h1>
        </div>
        <div style="padding: 30px; background: #fef2f2;">
          <h2 style="color: #991b1b;">Action Required: Last Free Day Approaching</h2>
          <p>Dear ${data.customerName},</p>
          <p><strong>Container ${data.containerNumber}</strong> has Last Free Day ${data.daysRemaining === 1 ? 'TOMORROW' : `in ${data.daysRemaining} days`}.</p>
          
          <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0; border: 2px solid #fca5a5;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">Container:</td>
                <td style="padding: 8px 0; font-weight: bold; font-size: 18px;">${data.containerNumber}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">Order:</td>
                <td style="padding: 8px 0;">${data.orderNumber}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">Terminal:</td>
                <td style="padding: 8px 0;">${data.terminal}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">Last Free Day:</td>
                <td style="padding: 8px 0; font-weight: bold; color: #dc2626; font-size: 18px;">${data.lfdDate}</td>
              </tr>
            </table>
          </div>
          
          <p style="color: #991b1b; font-weight: bold;">Please arrange pickup/return immediately to avoid demurrage charges.</p>
          <p style="color: #6b7280; font-size: 14px;">- DrayMaster TMS Team</p>
        </div>
      </div>
    `,
    text: `URGENT: Last Free Day Warning\n\nContainer ${data.containerNumber} has Last Free Day ${data.daysRemaining === 1 ? 'TOMORROW' : `in ${data.daysRemaining} days`}.\n\nTerminal: ${data.terminal}\nLFD: ${data.lfdDate}\n\nPlease arrange pickup/return immediately to avoid demurrage charges.`,
  }),

  invoiceSent: (data: {
    invoiceNumber: string;
    customerName: string;
    totalAmount: number;
    dueDate: string;
    lineItems: Array<{ description: string; amount: number }>;
  }) => ({
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
          <p style="color: #6b7280; font-size: 14px;">- DrayMaster TMS Team</p>
        </div>
        <div style="background: #1f2937; color: #9ca3af; padding: 15px; text-align: center; font-size: 12px;">
          © 2025 DrayMaster TMS. All rights reserved.
        </div>
      </div>
    `,
    text: `Invoice ${data.invoiceNumber}\n\nDear ${data.customerName},\n\nTotal Amount: $${data.totalAmount.toFixed(2)}\nDue Date: ${data.dueDate}\n\nThank you for your business!\n- DrayMaster TMS`,
  }),

  paymentReceived: (data: {
    invoiceNumber: string;
    customerName: string;
    paymentAmount: number;
    paymentMethod: string;
    paymentReference: string;
    balanceDue: number;
  }) => ({
    subject: `Payment Received - Thank You!`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #059669; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0;">✓ Payment Received</h1>
        </div>
        <div style="padding: 30px; background: #f0fdf4;">
          <h2 style="color: #166534;">Thank You for Your Payment!</h2>
          <p>Dear ${data.customerName},</p>
          <p>We have received your payment.</p>
          
          <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0; border: 2px solid #86efac;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">Invoice:</td>
                <td style="padding: 8px 0; font-weight: bold;">${data.invoiceNumber}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">Amount Received:</td>
                <td style="padding: 8px 0; font-weight: bold; color: #059669; font-size: 20px;">$${data.paymentAmount.toFixed(2)}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">Payment Method:</td>
                <td style="padding: 8px 0;">${data.paymentMethod}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">Reference:</td>
                <td style="padding: 8px 0;">${data.paymentReference}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">Remaining Balance:</td>
                <td style="padding: 8px 0; font-weight: bold;">$${data.balanceDue.toFixed(2)}</td>
              </tr>
            </table>
          </div>
          
          <p>Thank you for your prompt payment!</p>
          <p style="color: #6b7280; font-size: 14px;">- DrayMaster TMS Team</p>
        </div>
      </div>
    `,
    text: `Payment Received\n\nInvoice: ${data.invoiceNumber}\nAmount: $${data.paymentAmount.toFixed(2)}\nMethod: ${data.paymentMethod}\nReference: ${data.paymentReference}\nRemaining Balance: $${data.balanceDue.toFixed(2)}\n\nThank you!`,
  }),

  chassisPerDiemWarning: (data: {
    chassisNumber: string;
    containerNumber: string;
    customerName: string;
    daysOut: number;
    freeDays: number;
    billableDays: number;
    perDiemAmount: number;
    dailyRate: number;
  }) => ({
    subject: `⚠️ Chassis Per Diem Alert - ${data.chassisNumber}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #f59e0b; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0;">⚠️ Chassis Per Diem Alert</h1>
        </div>
        <div style="padding: 30px; background: #fffbeb;">
          <h2 style="color: #92400e;">Per Diem Charges Accruing</h2>
          <p>Dear ${data.customerName},</p>
          <p>Chassis <strong>${data.chassisNumber}</strong> has exceeded free days and is now accruing per diem charges.</p>
          
          <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0; border: 2px solid #fcd34d;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">Chassis:</td>
                <td style="padding: 8px 0; font-weight: bold;">${data.chassisNumber}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">Container:</td>
                <td style="padding: 8px 0;">${data.containerNumber}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">Days Out:</td>
                <td style="padding: 8px 0;">${data.daysOut}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">Free Days:</td>
                <td style="padding: 8px 0;">${data.freeDays}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">Billable Days:</td>
                <td style="padding: 8px 0; font-weight: bold; color: #dc2626;">${data.billableDays}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">Daily Rate:</td>
                <td style="padding: 8px 0;">$${data.dailyRate.toFixed(2)}</td>
              </tr>
              <tr style="background: #fef3c7;">
                <td style="padding: 12px 8px; font-weight: bold;">Current Per Diem:</td>
                <td style="padding: 12px 8px; font-weight: bold; color: #dc2626; font-size: 20px;">$${data.perDiemAmount.toFixed(2)}</td>
              </tr>
            </table>
          </div>
          
          <p style="color: #92400e; font-weight: bold;">Please arrange return of the chassis to minimize charges.</p>
          <p style="color: #6b7280; font-size: 14px;">- DrayMaster TMS Team</p>
        </div>
      </div>
    `,
    text: `Chassis Per Diem Alert\n\nChassis ${data.chassisNumber} is accruing per diem charges.\n\nDays Out: ${data.daysOut}\nBillable Days: ${data.billableDays}\nCurrent Per Diem: $${data.perDiemAmount.toFixed(2)}\n\nPlease arrange return ASAP.`,
  }),

  quoteResponse: (data: {
    requestNumber: string;
    customerName: string;
    contactEmail: string;
    shipmentType: string;
    route: string;
    quotedRate: number;
    fuelSurcharge: number;
    totalQuote: number;
    validUntil: string;
  }) => ({
    subject: `Quote ${data.requestNumber} - DrayMaster`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #2563eb; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0;">DrayMaster TMS</h1>
          <p style="margin: 5px 0 0 0; opacity: 0.9;">Quote Response</p>
        </div>
        <div style="padding: 30px; background: #f9fafb;">
          <h2 style="color: #1f2937;">Quote ${data.requestNumber}</h2>
          <p>Dear ${data.customerName},</p>
          <p>Thank you for your quote request. Please find our pricing below:</p>
          
          <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <p style="color: #6b7280; margin-bottom: 15px;">
              <strong>Shipment:</strong> ${data.shipmentType}<br>
              <strong>Route:</strong> ${data.route}
            </p>
            <table style="width: 100%; border-collapse: collapse;">
              <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 10px;">Base Rate</td>
                <td style="padding: 10px; text-align: right;">$${data.quotedRate.toFixed(2)}</td>
              </tr>
              <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 10px;">Fuel Surcharge</td>
                <td style="padding: 10px; text-align: right;">$${data.fuelSurcharge.toFixed(2)}</td>
              </tr>
              <tr style="background: #eff6ff;">
                <td style="padding: 15px; font-weight: bold; font-size: 18px;">Total Quote</td>
                <td style="padding: 15px; text-align: right; font-weight: bold; font-size: 24px; color: #2563eb;">$${data.totalQuote.toFixed(2)}</td>
              </tr>
            </table>
          </div>
          
          <p><strong>Quote Valid Until:</strong> ${data.validUntil}</p>
          <p>To accept this quote, please reply to this email or contact us.</p>
          <p style="color: #6b7280; font-size: 14px;">- DrayMaster TMS Team</p>
        </div>
      </div>
    `,
    text: `Quote ${data.requestNumber}\n\nShipment: ${data.shipmentType}\nRoute: ${data.route}\n\nBase Rate: $${data.quotedRate.toFixed(2)}\nFuel Surcharge: $${data.fuelSurcharge.toFixed(2)}\nTotal: $${data.totalQuote.toFixed(2)}\n\nValid Until: ${data.validUntil}`,
  }),
};

export default sendEmail;
