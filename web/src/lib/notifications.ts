// ==============================================================================
// DRAYMASTER TMS - Notification Service
// ==============================================================================
// Addresses P1 High Priority Issue: No Notification System
// Provides multi-channel notifications (Email, SMS, Push, In-App)

import { supabase } from './supabase';

// ==============================================================================
// TYPES
// ==============================================================================

export type NotificationChannel = 'EMAIL' | 'SMS' | 'PUSH' | 'DASHBOARD';
export type NotificationSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type NotificationStatus = 'PENDING' | 'SENT' | 'PARTIAL' | 'FAILED';

export interface NotificationTemplate {
  code: string;
  name: string;
  subject_template: string;
  body_template: string;
  sms_template?: string;
  send_email: boolean;
  send_sms: boolean;
  send_push: boolean;
}

export interface NotificationRequest {
  templateCode: string;
  recipientEmail?: string;
  recipientPhone?: string;
  recipientUserId?: string;
  variables: Record<string, string>;
  orderId?: string;
  tripId?: string;
  containerId?: string;
}

export interface NotificationResult {
  success: boolean;
  notificationId?: string;
  emailSent?: boolean;
  smsSent?: boolean;
  pushSent?: boolean;
  error?: string;
}

// ==============================================================================
// TEMPLATE VARIABLES
// ==============================================================================

/**
 * Replace template variables with actual values
 */
function renderTemplate(template: string, variables: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`{{${key}}}`, 'g'), value || '');
  }
  return result;
}

// ==============================================================================
// NOTIFICATION FUNCTIONS
// ==============================================================================

/**
 * Get a notification template by code
 */
export async function getTemplate(code: string): Promise<NotificationTemplate | null> {
  const { data, error } = await supabase
    .from('notification_templates')
    .select('*')
    .eq('code', code)
    .eq('is_active', true)
    .single();

  if (error) {
    console.error('Error fetching template:', error);
    return null;
  }

  return data;
}

/**
 * Send a notification using a template
 */
export async function sendNotification(
  request: NotificationRequest
): Promise<NotificationResult> {
  try {
    // Get template
    const template = await getTemplate(request.templateCode);
    if (!template) {
      return { success: false, error: `Template ${request.templateCode} not found` };
    }

    // Render content
    const subject = renderTemplate(template.subject_template || '', request.variables);
    const body = renderTemplate(template.body_template, request.variables);
    const smsBody = template.sms_template
      ? renderTemplate(template.sms_template, request.variables)
      : null;

    // Create notification record
    const { data: notification, error: insertError } = await supabase
      .from('notifications')
      .insert({
        template_code: request.templateCode,
        recipient_email: request.recipientEmail,
        recipient_phone: request.recipientPhone,
        recipient_user_id: request.recipientUserId,
        subject,
        body,
        sms_body: smsBody,
        variables: request.variables,
        status: 'PENDING',
        order_id: request.orderId,
        trip_id: request.tripId,
      })
      .select()
      .single();

    if (insertError) {
      return { success: false, error: insertError.message };
    }

    const results: NotificationResult = {
      success: true,
      notificationId: notification.id,
      emailSent: false,
      smsSent: false,
      pushSent: false,
    };

    // Send email (if configured)
    if (template.send_email && request.recipientEmail) {
      try {
        const emailSent = await sendEmail(request.recipientEmail, subject, body);
        results.emailSent = emailSent;

        await supabase
          .from('notifications')
          .update({
            email_sent: emailSent,
            email_sent_at: emailSent ? new Date().toISOString() : null,
          })
          .eq('id', notification.id);
      } catch (err) {
        console.error('Email send failed:', err);
      }
    }

    // Send SMS (if configured)
    if (template.send_sms && request.recipientPhone && smsBody) {
      try {
        const smsSent = await sendSMS(request.recipientPhone, smsBody);
        results.smsSent = smsSent;

        await supabase
          .from('notifications')
          .update({
            sms_sent: smsSent,
            sms_sent_at: smsSent ? new Date().toISOString() : null,
          })
          .eq('id', notification.id);
      } catch (err) {
        console.error('SMS send failed:', err);
      }
    }

    // Update final status
    const finalStatus = determineStatus(results, template);
    await supabase
      .from('notifications')
      .update({ status: finalStatus })
      .eq('id', notification.id);

    return results;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Determine notification status based on send results
 */
function determineStatus(
  results: NotificationResult,
  template: NotificationTemplate
): NotificationStatus {
  const expectedChannels = [
    template.send_email,
    template.send_sms,
    template.send_push,
  ].filter(Boolean).length;

  const sentChannels = [results.emailSent, results.smsSent, results.pushSent].filter(
    Boolean
  ).length;

  if (sentChannels === 0) return 'FAILED';
  if (sentChannels < expectedChannels) return 'PARTIAL';
  return 'SENT';
}

// ==============================================================================
// CHANNEL IMPLEMENTATIONS
// ==============================================================================

/**
 * Send email notification
 * Uses the existing /api/email endpoint
 */
async function sendEmail(to: string, subject: string, body: string): Promise<boolean> {
  try {
    const response = await fetch('/api/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, subject, body }),
    });

    return response.ok;
  } catch (error) {
    console.error('Email send error:', error);
    return false;
  }
}

/**
 * Send SMS notification
 * Placeholder for SMS integration (e.g., Twilio)
 */
async function sendSMS(phone: string, message: string): Promise<boolean> {
  // TODO: Integrate with Twilio or other SMS provider
  console.log(`SMS to ${phone}: ${message}`);

  // For now, just log and return true for development
  if (process.env.NODE_ENV === 'development') {
    console.log('[DEV] SMS would be sent:', { phone, message });
    return true;
  }

  // Production SMS implementation would go here
  return false;
}

// ==============================================================================
// CONVENIENCE FUNCTIONS
// ==============================================================================

/**
 * Notify about a new order
 */
export async function notifyOrderCreated(
  orderNumber: string,
  containerNumber: string,
  customerName: string,
  dispatcherEmail: string
): Promise<NotificationResult> {
  return sendNotification({
    templateCode: 'ORDER_CREATED',
    recipientEmail: dispatcherEmail,
    variables: {
      order_number: orderNumber,
      container_number: containerNumber,
      customer_name: customerName,
    },
  });
}

/**
 * Notify driver about trip assignment
 */
export async function notifyTripAssigned(
  tripNumber: string,
  pickupLocation: string,
  deliveryLocation: string,
  scheduledTime: string,
  driverEmail: string,
  driverPhone?: string
): Promise<NotificationResult> {
  return sendNotification({
    templateCode: 'TRIP_ASSIGNED',
    recipientEmail: driverEmail,
    recipientPhone: driverPhone,
    variables: {
      trip_number: tripNumber,
      pickup_location: pickupLocation,
      delivery_location: deliveryLocation,
      scheduled_time: scheduledTime,
    },
  });
}

/**
 * Notify about container availability
 */
export async function notifyContainerAvailable(
  containerNumber: string,
  terminalName: string,
  lastFreeDay: string,
  customerEmail: string,
  customerPhone?: string
): Promise<NotificationResult> {
  return sendNotification({
    templateCode: 'CONTAINER_AVAILABLE',
    recipientEmail: customerEmail,
    recipientPhone: customerPhone,
    variables: {
      container_number: containerNumber,
      terminal_name: terminalName,
      last_free_day: lastFreeDay,
    },
  });
}

/**
 * Notify about demurrage warning
 */
export async function notifyDemurrageWarning(
  containerNumber: string,
  lastFreeDay: string,
  hoursRemaining: number,
  estimatedDemurrage: number,
  recipientEmail: string,
  recipientPhone?: string
): Promise<NotificationResult> {
  return sendNotification({
    templateCode: 'DEMURRAGE_WARNING',
    recipientEmail,
    recipientPhone,
    variables: {
      container_number: containerNumber,
      last_free_day: lastFreeDay,
      hours_remaining: hoursRemaining.toString(),
      estimated_demurrage: estimatedDemurrage.toFixed(2),
    },
  });
}

/**
 * Notify about delivery completion
 */
export async function notifyDeliveryComplete(
  containerNumber: string,
  deliveryLocation: string,
  completionTime: string,
  podStatus: string,
  customerEmail: string
): Promise<NotificationResult> {
  return sendNotification({
    templateCode: 'DELIVERY_COMPLETE',
    recipientEmail: customerEmail,
    variables: {
      container_number: containerNumber,
      delivery_location: deliveryLocation,
      completion_time: completionTime,
      pod_status: podStatus,
    },
  });
}

/**
 * Notify about exception/alert
 */
export async function notifyException(
  exceptionType: string,
  containerNumber: string,
  exceptionDetails: string,
  dispatcherEmail: string
): Promise<NotificationResult> {
  return sendNotification({
    templateCode: 'EXCEPTION_ALERT',
    recipientEmail: dispatcherEmail,
    variables: {
      exception_type: exceptionType,
      container_number: containerNumber,
      exception_details: exceptionDetails,
    },
  });
}

// ==============================================================================
// BATCH OPERATIONS
// ==============================================================================

/**
 * Send notifications to multiple recipients
 */
export async function sendBulkNotification(
  templateCode: string,
  recipients: Array<{ email?: string; phone?: string; userId?: string }>,
  variables: Record<string, string>
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;

  for (const recipient of recipients) {
    const result = await sendNotification({
      templateCode,
      recipientEmail: recipient.email,
      recipientPhone: recipient.phone,
      recipientUserId: recipient.userId,
      variables,
    });

    if (result.success) {
      sent++;
    } else {
      failed++;
    }
  }

  return { sent, failed };
}

/**
 * Check for pending demurrage warnings and send notifications
 */
export async function processDemurrageAlerts(): Promise<number> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Find containers approaching LFD
  const { data: containers } = await supabase
    .from('containers')
    .select(`
      id,
      container_number,
      shipment:shipments(
        last_free_day,
        customer_name
      )
    `)
    .not('shipment.last_free_day', 'is', null);

  if (!containers) return 0;

  let alertsSent = 0;

  for (const container of containers) {
    const shipment = container.shipment as any;
    if (!shipment?.last_free_day) continue;

    const lfd = new Date(shipment.last_free_day);
    lfd.setHours(0, 0, 0, 0);

    const daysRemaining = Math.ceil((lfd.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const hoursRemaining = daysRemaining * 24;

    // Send warning if within 2 days
    if (daysRemaining >= 0 && daysRemaining <= 2) {
      // TODO: Get actual dispatcher email from settings
      const dispatcherEmail = process.env.DISPATCHER_EMAIL || 'dispatch@draymaster.com';

      await notifyDemurrageWarning(
        container.container_number,
        shipment.last_free_day,
        hoursRemaining,
        daysRemaining < 0 ? Math.abs(daysRemaining) * 125 : 0,
        dispatcherEmail
      );

      alertsSent++;
    }
  }

  return alertsSent;
}

// ==============================================================================
// QUERY FUNCTIONS
// ==============================================================================

/**
 * Get recent notifications for a user
 */
export async function getRecentNotifications(
  userId?: string,
  limit: number = 20
): Promise<any[]> {
  let query = supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (userId) {
    query = query.eq('recipient_user_id', userId);
  }

  const { data } = await query;
  return data || [];
}

/**
 * Mark notification as read
 */
export async function markNotificationRead(notificationId: string): Promise<boolean> {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId);

  return !error;
}

/**
 * Get unread notification count
 */
export async function getUnreadCount(userId?: string): Promise<number> {
  let query = supabase
    .from('notifications')
    .select('id', { count: 'exact' })
    .is('read_at', null);

  if (userId) {
    query = query.eq('recipient_user_id', userId);
  }

  const { count } = await query;
  return count || 0;
}
