'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

interface NotificationTemplate {
  id: string;
  code: string;
  name: string;
  description: string;
  notification_type: string;
  email_subject: string;
  email_body: string;
  sms_body: string;
  available_variables: string;
  is_active: boolean;
}

interface NotificationLog {
  id: string;
  template_code: string;
  recipient_name: string;
  recipient_email: string;
  recipient_phone: string;
  notification_type: string;
  email_subject: string;
  email_to: string;
  sms_to: string;
  sms_body: string;
  status: string;
  sent_at: string;
  failure_reason: string;
  created_at: string;
}

interface NotificationSetting {
  id: string;
  setting_key: string;
  setting_value: string;
  setting_type: string;
  description: string;
}

export default function NotificationsPage() {
  const [activeTab, setActiveTab] = useState<'overview' | 'templates' | 'log' | 'settings'>('overview');
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [notificationLog, setNotificationLog] = useState<NotificationLog[]>([]);
  const [settings, setSettings] = useState<NotificationSetting[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [editingTemplate, setEditingTemplate] = useState<NotificationTemplate | null>(null);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [isSendTestModalOpen, setIsSendTestModalOpen] = useState(false);
  const [testRecipient, setTestRecipient] = useState({ email: '', phone: '' });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);

      const { data: templatesData } = await supabase
        .from('notification_templates')
        .select('*')
        .order('name');
      setTemplates(templatesData || []);

      const { data: logData } = await supabase
        .from('notification_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      setNotificationLog(logData || []);

      const { data: settingsData } = await supabase
        .from('notification_settings')
        .select('*')
        .order('setting_key');
      setSettings(settingsData || []);

    } catch (err: any) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const updateSetting = async (key: string, value: string) => {
    try {
      const { error } = await supabase
        .from('notification_settings')
        .update({ setting_value: value })
        .eq('setting_key', key);
      
      if (error) throw error;
      
      setSettings(settings.map(s => 
        s.setting_key === key ? { ...s, setting_value: value } : s
      ));
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const toggleTemplate = async (templateId: string, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from('notification_templates')
        .update({ is_active: isActive })
        .eq('id', templateId);
      
      if (error) throw error;
      fetchData();
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const editTemplate = (template: NotificationTemplate) => {
    setEditingTemplate(template);
    setIsTemplateModalOpen(true);
  };

  const saveTemplate = async () => {
    if (!editingTemplate) return;

    try {
      const { error } = await supabase
        .from('notification_templates')
        .update({
          email_subject: editingTemplate.email_subject,
          email_body: editingTemplate.email_body,
          sms_body: editingTemplate.sms_body,
        })
        .eq('id', editingTemplate.id);

      if (error) throw error;
      
      setIsTemplateModalOpen(false);
      setEditingTemplate(null);
      fetchData();
      alert('Template saved!');
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const sendTestNotification = async (template: NotificationTemplate) => {
    // For demo, we'll simulate sending
    try {
      await supabase.from('notification_log').insert({
        template_code: template.code,
        recipient_name: 'Test User',
        recipient_email: testRecipient.email,
        recipient_phone: testRecipient.phone,
        notification_type: template.notification_type === 'BOTH' ? 'EMAIL' : template.notification_type,
        email_to: testRecipient.email,
        email_subject: template.email_subject?.replace(/\{\{.*?\}\}/g, '[TEST]'),
        sms_to: testRecipient.phone,
        sms_body: template.sms_body?.replace(/\{\{.*?\}\}/g, '[TEST]'),
        status: 'SENT',
        sent_at: new Date().toISOString(),
      });

      alert('Test notification logged! In production, this would send via SendGrid/Twilio.');
      setIsSendTestModalOpen(false);
      fetchData();
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const getNotificationTypeIcon = (type: string) => {
    if (type === 'EMAIL') return '📧';
    if (type === 'SMS') return '📱';
    return '📧📱';
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      'PENDING': 'bg-yellow-100 text-yellow-800',
      'SENT': 'bg-blue-100 text-blue-800',
      'DELIVERED': 'bg-green-100 text-green-800',
      'FAILED': 'bg-red-100 text-red-800',
      'BOUNCED': 'bg-orange-100 text-orange-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getSetting = (key: string) => settings.find(s => s.setting_key === key)?.setting_value || '';

  // Calculate stats
  const stats = {
    totalSent: notificationLog.filter(n => n.status === 'SENT' || n.status === 'DELIVERED').length,
    emailsSent: notificationLog.filter(n => n.notification_type === 'EMAIL' && (n.status === 'SENT' || n.status === 'DELIVERED')).length,
    smsSent: notificationLog.filter(n => n.notification_type === 'SMS' && (n.status === 'SENT' || n.status === 'DELIVERED')).length,
    failed: notificationLog.filter(n => n.status === 'FAILED').length,
    activeTemplates: templates.filter(t => t.is_active).length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Notifications</h1>
          <p className="text-gray-500 mt-1">Manage email and SMS notifications, templates, and settings</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-5 gap-4">
        <div className="bg-white rounded-xl shadow p-4 border-l-4 border-blue-500">
          <p className="text-sm text-gray-500">Total Sent</p>
          <p className="text-2xl font-bold text-blue-600">{stats.totalSent}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4 border-l-4 border-green-500">
          <p className="text-sm text-gray-500">Emails Sent</p>
          <p className="text-2xl font-bold text-green-600">{stats.emailsSent}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4 border-l-4 border-purple-500">
          <p className="text-sm text-gray-500">SMS Sent</p>
          <p className="text-2xl font-bold text-purple-600">{stats.smsSent}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4 border-l-4 border-red-500">
          <p className="text-sm text-gray-500">Failed</p>
          <p className="text-2xl font-bold text-red-600">{stats.failed}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4 border-l-4 border-yellow-500">
          <p className="text-sm text-gray-500">Active Templates</p>
          <p className="text-2xl font-bold text-yellow-600">{stats.activeTemplates}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow">
        <div className="border-b px-6">
          <div className="flex gap-4">
            {[
              { id: 'overview', label: 'Overview' },
              { id: 'templates', label: 'Templates' },
              { id: 'log', label: 'Notification Log' },
              { id: 'settings', label: 'Settings' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`py-3 px-4 font-medium border-b-2 transition ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            </div>
          ) : (
            <>
              {/* Overview Tab */}
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-6">
                    {/* Quick Actions */}
                    <div className="border rounded-xl p-6">
                      <h3 className="font-semibold mb-4">Quick Actions</h3>
                      <div className="space-y-3">
                        <button
                          onClick={() => setActiveTab('templates')}
                          className="w-full text-left px-4 py-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition"
                        >
                          <span className="text-xl mr-3">📝</span>
                          <span className="font-medium">Edit Notification Templates</span>
                        </button>
                        <button
                          onClick={() => setActiveTab('settings')}
                          className="w-full text-left px-4 py-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition"
                        >
                          <span className="text-xl mr-3">⚙️</span>
                          <span className="font-medium">Configure Email/SMS Settings</span>
                        </button>
                        <button
                          onClick={() => setActiveTab('log')}
                          className="w-full text-left px-4 py-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition"
                        >
                          <span className="text-xl mr-3">📋</span>
                          <span className="font-medium">View Notification History</span>
                        </button>
                      </div>
                    </div>

                    {/* Recent Notifications */}
                    <div className="border rounded-xl p-6">
                      <h3 className="font-semibold mb-4">Recent Notifications</h3>
                      <div className="space-y-2">
                        {notificationLog.slice(0, 5).map(log => (
                          <div key={log.id} className="flex items-center justify-between py-2 border-b last:border-0">
                            <div className="flex items-center gap-2">
                              <span>{getNotificationTypeIcon(log.notification_type)}</span>
                              <div>
                                <p className="text-sm font-medium">{log.template_code?.replace(/_/g, ' ')}</p>
                                <p className="text-xs text-gray-500">{log.recipient_email || log.recipient_phone}</p>
                              </div>
                            </div>
                            <span className={`px-2 py-1 rounded text-xs ${getStatusColor(log.status)}`}>
                              {log.status}
                            </span>
                          </div>
                        ))}
                        {notificationLog.length === 0 && (
                          <p className="text-gray-500 text-center py-4">No notifications sent yet</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Active Alerts */}
                  <div className="border rounded-xl p-6">
                    <h3 className="font-semibold mb-4">Automatic Alert Types</h3>
                    <div className="grid grid-cols-4 gap-4">
                      {templates.filter(t => t.is_active).slice(0, 8).map(template => (
                        <div
                          key={template.id}
                          className="border rounded-lg p-4 hover:shadow-md transition"
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xl">{getNotificationTypeIcon(template.notification_type)}</span>
                            <span className={`px-2 py-0.5 rounded-full text-xs ${template.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                              {template.is_active ? 'Active' : 'Disabled'}
                            </span>
                          </div>
                          <h4 className="font-medium text-sm">{template.name}</h4>
                          <p className="text-xs text-gray-500 mt-1 line-clamp-2">{template.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Templates Tab */}
              {activeTab === 'templates' && (
                <div className="space-y-4">
                  {templates.map(template => (
                    <div key={template.id} className="border rounded-xl p-5">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{getNotificationTypeIcon(template.notification_type)}</span>
                          <div>
                            <h3 className="font-semibold">{template.name}</h3>
                            <p className="text-sm text-gray-500">{template.description}</p>
                            <p className="text-xs text-gray-400 font-mono mt-1">{template.code}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={template.is_active}
                              onChange={e => toggleTemplate(template.id, e.target.checked)}
                              className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                          </label>
                          <button
                            onClick={() => editTemplate(template)}
                            className="px-3 py-1 text-sm border rounded-lg hover:bg-gray-50"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => {
                              setEditingTemplate(template);
                              setIsSendTestModalOpen(true);
                            }}
                            className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200"
                          >
                            Test
                          </button>
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-4">
                        {template.email_subject && (
                          <div className="bg-gray-50 rounded-lg p-3">
                            <p className="text-xs text-gray-500 mb-1">📧 Email Subject</p>
                            <p className="text-sm font-mono">{template.email_subject}</p>
                          </div>
                        )}
                        {template.sms_body && (
                          <div className="bg-gray-50 rounded-lg p-3">
                            <p className="text-xs text-gray-500 mb-1">📱 SMS Message</p>
                            <p className="text-sm font-mono">{template.sms_body}</p>
                          </div>
                        )}
                      </div>

                      {template.available_variables && (
                        <div className="mt-3">
                          <p className="text-xs text-gray-400">
                            Variables: {JSON.parse(template.available_variables).map((v: string) => `{{${v}}}`).join(', ')}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Notification Log Tab */}
              {activeTab === 'log' && (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Template</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Recipient</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Subject/Message</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sent At</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {notificationLog.map(log => (
                        <tr key={log.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-xl">
                            {getNotificationTypeIcon(log.notification_type)}
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm font-medium">{log.template_code?.replace(/_/g, ' ')}</span>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-sm">{log.recipient_name}</p>
                            <p className="text-xs text-gray-500">{log.email_to || log.sms_to}</p>
                          </td>
                          <td className="px-4 py-3 max-w-xs">
                            <p className="text-sm truncate">
                              {log.notification_type === 'EMAIL' ? log.email_subject : log.sms_body}
                            </p>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded-full text-xs ${getStatusColor(log.status)}`}>
                              {log.status}
                            </span>
                            {log.failure_reason && (
                              <p className="text-xs text-red-500 mt-1">{log.failure_reason}</p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500">
                            {log.sent_at ? new Date(log.sent_at).toLocaleString() : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {notificationLog.length === 0 && (
                    <div className="text-center py-12 text-gray-500">
                      <div className="text-6xl mb-4">📭</div>
                      <p>No notifications sent yet</p>
                    </div>
                  )}
                </div>
              )}

              {/* Settings Tab */}
              {activeTab === 'settings' && (
                <div className="max-w-2xl space-y-8">
                  {/* Email Settings */}
                  <div>
                    <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                      <span>📧</span> Email Settings (SendGrid)
                    </h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">From Email Address</label>
                        <input
                          value={getSetting('email_from_address')}
                          onChange={e => updateSetting('email_from_address', e.target.value)}
                          className="w-full px-4 py-2 border rounded-lg"
                          placeholder="noreply@yourcompany.com"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">From Name</label>
                        <input
                          value={getSetting('email_from_name')}
                          onChange={e => updateSetting('email_from_name', e.target.value)}
                          className="w-full px-4 py-2 border rounded-lg"
                          placeholder="DrayMaster TMS"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">SendGrid API Key</label>
                        <input
                          type="password"
                          value={getSetting('sendgrid_api_key')}
                          onChange={e => updateSetting('sendgrid_api_key', e.target.value)}
                          className="w-full px-4 py-2 border rounded-lg"
                          placeholder="SG.xxxxxxxxxx"
                        />
                        <p className="text-xs text-gray-500 mt-1">Get your API key from sendgrid.com</p>
                      </div>
                    </div>
                  </div>

                  {/* SMS Settings */}
                  <div>
                    <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                      <span>📱</span> SMS Settings (Twilio)
                    </h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Twilio Phone Number</label>
                        <input
                          value={getSetting('sms_from_number')}
                          onChange={e => updateSetting('sms_from_number', e.target.value)}
                          className="w-full px-4 py-2 border rounded-lg"
                          placeholder="+1234567890"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Twilio Account SID</label>
                        <input
                          value={getSetting('twilio_account_sid')}
                          onChange={e => updateSetting('twilio_account_sid', e.target.value)}
                          className="w-full px-4 py-2 border rounded-lg"
                          placeholder="ACxxxxxxxxxx"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Twilio Auth Token</label>
                        <input
                          type="password"
                          value={getSetting('twilio_auth_token')}
                          onChange={e => updateSetting('twilio_auth_token', e.target.value)}
                          className="w-full px-4 py-2 border rounded-lg"
                          placeholder="xxxxxxxxxx"
                        />
                        <p className="text-xs text-gray-500 mt-1">Get your credentials from twilio.com</p>
                      </div>
                    </div>
                  </div>

                  {/* Alert Settings */}
                  <div>
                    <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                      <span>⚡</span> Automation Settings
                    </h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">LFD Warning Days Before</label>
                        <input
                          type="number"
                          value={getSetting('lfd_warning_days')}
                          onChange={e => updateSetting('lfd_warning_days', e.target.value)}
                          className="w-full px-4 py-2 border rounded-lg"
                        />
                        <p className="text-xs text-gray-500 mt-1">Send warning this many days before Last Free Day</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Chassis Per Diem Warning Days</label>
                        <input
                          type="number"
                          value={getSetting('chassis_perdiem_warning_days')}
                          onChange={e => updateSetting('chassis_perdiem_warning_days', e.target.value)}
                          className="w-full px-4 py-2 border rounded-lg"
                        />
                        <p className="text-xs text-gray-500 mt-1">Send warning after chassis exceeds free days by this amount</p>
                      </div>
                      <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                        <div>
                          <p className="font-medium">Auto-send Delivery Notifications</p>
                          <p className="text-sm text-gray-500">Automatically notify customers when delivery is complete</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={getSetting('auto_send_delivery_notification') === 'true'}
                            onChange={e => updateSetting('auto_send_delivery_notification', e.target.checked ? 'true' : 'false')}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                        </label>
                      </div>
                      <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                        <div>
                          <p className="font-medium">Auto-email Invoices</p>
                          <p className="text-sm text-gray-500">Automatically email invoices when created</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={getSetting('auto_send_invoice_email') === 'true'}
                            onChange={e => updateSetting('auto_send_invoice_email', e.target.checked ? 'true' : 'false')}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Edit Template Modal */}
      {isTemplateModalOpen && editingTemplate && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => setIsTemplateModalOpen(false)}></div>
          <div className="relative min-h-screen flex items-center justify-center p-4">
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
              <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold text-white">Edit Template: {editingTemplate.name}</h2>
                  <button onClick={() => setIsTemplateModalOpen(false)} className="text-white text-2xl">&times;</button>
                </div>
              </div>

              <div className="p-6 overflow-y-auto max-h-[60vh] space-y-4">
                {editingTemplate.notification_type !== 'SMS' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium mb-1">Email Subject</label>
                      <input
                        value={editingTemplate.email_subject || ''}
                        onChange={e => setEditingTemplate({ ...editingTemplate, email_subject: e.target.value })}
                        className="w-full px-4 py-2 border rounded-lg font-mono text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Email Body</label>
                      <textarea
                        value={editingTemplate.email_body || ''}
                        onChange={e => setEditingTemplate({ ...editingTemplate, email_body: e.target.value })}
                        className="w-full px-4 py-2 border rounded-lg font-mono text-sm"
                        rows={8}
                      />
                    </div>
                  </>
                )}

                {editingTemplate.notification_type !== 'EMAIL' && (
                  <div>
                    <label className="block text-sm font-medium mb-1">SMS Body (160 char limit)</label>
                    <textarea
                      value={editingTemplate.sms_body || ''}
                      onChange={e => setEditingTemplate({ ...editingTemplate, sms_body: e.target.value })}
                      className="w-full px-4 py-2 border rounded-lg font-mono text-sm"
                      rows={3}
                      maxLength={500}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      {(editingTemplate.sms_body || '').length} / 500 characters
                    </p>
                  </div>
                )}

                {editingTemplate.available_variables && (
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <p className="text-sm font-medium mb-2">Available Variables:</p>
                    <div className="flex flex-wrap gap-2">
                      {JSON.parse(editingTemplate.available_variables).map((v: string) => (
                        <code key={v} className="px-2 py-1 bg-white border rounded text-sm">
                          {`{{${v}}}`}
                        </code>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="px-6 py-4 bg-gray-50 border-t flex justify-end gap-2">
                <button
                  onClick={() => setIsTemplateModalOpen(false)}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  onClick={saveTemplate}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Save Template
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Send Test Modal */}
      {isSendTestModalOpen && editingTemplate && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => setIsSendTestModalOpen(false)}></div>
          <div className="relative min-h-screen flex items-center justify-center p-4">
            <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md">
              <div className="bg-green-600 px-6 py-4 rounded-t-xl">
                <h2 className="text-xl font-bold text-white">Send Test Notification</h2>
                <p className="text-green-200">{editingTemplate.name}</p>
              </div>

              <div className="p-6 space-y-4">
                {editingTemplate.notification_type !== 'SMS' && (
                  <div>
                    <label className="block text-sm font-medium mb-1">Test Email Address</label>
                    <input
                      type="email"
                      value={testRecipient.email}
                      onChange={e => setTestRecipient({ ...testRecipient, email: e.target.value })}
                      className="w-full px-4 py-2 border rounded-lg"
                      placeholder="test@example.com"
                    />
                  </div>
                )}

                {editingTemplate.notification_type !== 'EMAIL' && (
                  <div>
                    <label className="block text-sm font-medium mb-1">Test Phone Number</label>
                    <input
                      type="tel"
                      value={testRecipient.phone}
                      onChange={e => setTestRecipient({ ...testRecipient, phone: e.target.value })}
                      className="w-full px-4 py-2 border rounded-lg"
                      placeholder="+1234567890"
                    />
                  </div>
                )}

                <div className="bg-yellow-50 p-3 rounded-lg text-sm text-yellow-800">
                  ⚠️ This will log a test notification. In production with configured API keys, it would actually send.
                </div>
              </div>

              <div className="px-6 py-4 bg-gray-50 border-t flex justify-end gap-2 rounded-b-xl">
                <button
                  onClick={() => setIsSendTestModalOpen(false)}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  onClick={() => sendTestNotification(editingTemplate)}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  Send Test
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
