'use client';

import { useState } from 'react';

export default function SettingsPage() {
  const [companySettings, setCompanySettings] = useState({
    name: 'DrayMaster Transportation',
    address: '123 Port Ave',
    city: 'Los Angeles',
    state: 'CA',
    zip: '90731',
    phone: '310-555-0100',
    email: 'dispatch@draymaster.com',
    mc_number: 'MC123456',
    dot_number: 'DOT789012',
  });

  const [notifications, setNotifications] = useState({
    emailAlerts: true,
    smsAlerts: false,
    dispatchNotifications: true,
    deliveryNotifications: true,
    lfdReminders: true,
  });

  const handleSave = () => {
    alert('Settings saved successfully!');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500 mt-1">Manage your account and preferences</p>
      </div>

      {/* Company Information */}
      <div className="bg-white rounded-xl shadow">
        <div className="px-6 py-4 border-b"><h3 className="font-semibold text-gray-800">Company Information</h3></div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Company Name</label>
            <input value={companySettings.name} onChange={e => setCompanySettings({...companySettings, name: e.target.value})} className="w-full px-4 py-2 border rounded-lg" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Phone</label>
              <input value={companySettings.phone} onChange={e => setCompanySettings({...companySettings, phone: e.target.value})} className="w-full px-4 py-2 border rounded-lg" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <input value={companySettings.email} onChange={e => setCompanySettings({...companySettings, email: e.target.value})} className="w-full px-4 py-2 border rounded-lg" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Address</label>
            <input value={companySettings.address} onChange={e => setCompanySettings({...companySettings, address: e.target.value})} className="w-full px-4 py-2 border rounded-lg" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">City</label>
              <input value={companySettings.city} onChange={e => setCompanySettings({...companySettings, city: e.target.value})} className="w-full px-4 py-2 border rounded-lg" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">State</label>
              <input value={companySettings.state} onChange={e => setCompanySettings({...companySettings, state: e.target.value})} className="w-full px-4 py-2 border rounded-lg" maxLength={2} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">ZIP</label>
              <input value={companySettings.zip} onChange={e => setCompanySettings({...companySettings, zip: e.target.value})} className="w-full px-4 py-2 border rounded-lg" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">MC Number</label>
              <input value={companySettings.mc_number} onChange={e => setCompanySettings({...companySettings, mc_number: e.target.value})} className="w-full px-4 py-2 border rounded-lg" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">DOT Number</label>
              <input value={companySettings.dot_number} onChange={e => setCompanySettings({...companySettings, dot_number: e.target.value})} className="w-full px-4 py-2 border rounded-lg" />
            </div>
          </div>
        </div>
      </div>

      {/* Notifications */}
      <div className="bg-white rounded-xl shadow">
        <div className="px-6 py-4 border-b"><h3 className="font-semibold text-gray-800">Notifications</h3></div>
        <div className="p-6 space-y-4">
          {Object.entries({
            emailAlerts: 'Email Alerts',
            smsAlerts: 'SMS Alerts',
            dispatchNotifications: 'Dispatch Notifications',
            deliveryNotifications: 'Delivery Confirmations',
            lfdReminders: 'LFD Reminders',
          }).map(([key, label]) => (
            <div key={key} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <span>{label}</span>
              <button
                onClick={() => setNotifications({...notifications, [key]: !notifications[key as keyof typeof notifications]})}
                className={`w-12 h-6 rounded-full transition ${notifications[key as keyof typeof notifications] ? 'bg-blue-600' : 'bg-gray-300'}`}
              >
                <div className={`w-5 h-5 bg-white rounded-full shadow transform transition ${notifications[key as keyof typeof notifications] ? 'translate-x-6' : 'translate-x-1'}`}></div>
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Integrations */}
      <div className="bg-white rounded-xl shadow">
        <div className="px-6 py-4 border-b"><h3 className="font-semibold text-gray-800">Integrations</h3></div>
        <div className="p-6">
          <div className="grid grid-cols-3 gap-4">
            <div className="p-4 border rounded-lg text-center">
              <div className="text-3xl mb-2">🗺️</div>
              <p className="font-medium">Google Maps</p>
              <p className="text-xs text-gray-500 mb-2">GPS & Routing</p>
              <button className="px-3 py-1 bg-gray-100 rounded text-sm">Configure</button>
            </div>
            <div className="p-4 border rounded-lg text-center">
              <div className="text-3xl mb-2">📧</div>
              <p className="font-medium">SendGrid</p>
              <p className="text-xs text-gray-500 mb-2">Email Notifications</p>
              <button className="px-3 py-1 bg-gray-100 rounded text-sm">Configure</button>
            </div>
            <div className="p-4 border rounded-lg text-center">
              <div className="text-3xl mb-2">📱</div>
              <p className="font-medium">Twilio</p>
              <p className="text-xs text-gray-500 mb-2">SMS Alerts</p>
              <button className="px-3 py-1 bg-gray-100 rounded text-sm">Configure</button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button onClick={handleSave} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Save Changes</button>
      </div>
    </div>
  );
}