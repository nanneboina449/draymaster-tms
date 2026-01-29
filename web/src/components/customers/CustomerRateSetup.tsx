'use client';

import { useState, useEffect } from 'react';
import { 
  Customer, CustomerBillingSettings, CustomerChassisPreferences,
  CustomerNotificationPreferences, RateAgreement, LaneRate, AccessorialRate,
  TERMINAL_LABELS, ChargeType
} from '@/lib/types';
import { supabase } from '@/lib/supabase';

interface CustomerRateSetupProps {
  customerId: string;
  onClose?: () => void;
}

const CHARGE_TYPES: { value: ChargeType; label: string }[] = [
  { value: 'PREPULL', label: 'Prepull' },
  { value: 'DETENTION', label: 'Detention (per hour)' },
  { value: 'STORAGE', label: 'Storage (per day)' },
  { value: 'CHASSIS_SPLIT', label: 'Chassis Split' },
  { value: 'WAITING_TIME', label: 'Waiting Time (per hour)' },
  { value: 'HAZMAT', label: 'Hazmat Surcharge' },
  { value: 'OVERWEIGHT', label: 'Overweight' },
  { value: 'TRIAXLE', label: 'Tri-Axle Chassis' },
  { value: 'STOP_OFF', label: 'Stop Off' },
  { value: 'GATE_FEE', label: 'Gate Fee' },
];

const TERMINALS = Object.entries(TERMINAL_LABELS).map(([value, label]) => ({ value, label }));

export default function CustomerRateSetup({ customerId, onClose }: CustomerRateSetupProps) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [billingSettings, setBillingSettings] = useState<Partial<CustomerBillingSettings>>({});
  const [chassisPrefs, setChassisPrefs] = useState<Partial<CustomerChassisPreferences>>({});
  const [notificationPrefs, setNotificationPrefs] = useState<Partial<CustomerNotificationPreferences>>({});
  const [rateAgreement, setRateAgreement] = useState<Partial<RateAgreement>>({});
  const [laneRates, setLaneRates] = useState<Partial<LaneRate>[]>([]);
  const [accessorialRates, setAccessorialRates] = useState<Partial<AccessorialRate>[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'billing' | 'rates' | 'lanes' | 'accessorials' | 'notifications'>('billing');

  useEffect(() => {
    loadData();
  }, [customerId]);

  const loadData = async () => {
    setLoading(true);

    // Load customer
    const { data: customerData } = await supabase
      .from('customers')
      .select('*')
      .eq('id', customerId)
      .single();
    setCustomer(customerData);

    // Load billing settings
    const { data: billing } = await supabase
      .from('customer_billing_settings')
      .select('*')
      .eq('customer_id', customerId)
      .single();
    setBillingSettings(billing || {
      payment_terms: 'NET_30',
      payment_terms_days: 30,
      gate_fee_responsibility: 'CARRIER',
      demurrage_responsibility: 'CUSTOMER',
      detention_responsibility: 'CUSTOMER',
      default_move_type: 'LIVE',
      prepull_authorization: 'REQUIRES_APPROVAL',
      yard_storage_free_days: 2,
    });

    // Load chassis preferences
    const { data: chassis } = await supabase
      .from('customer_chassis_preferences')
      .select('*')
      .eq('customer_id', customerId)
      .single();
    setChassisPrefs(chassis || {
      primary_pool: 'DCLI',
      allow_flexivan: true,
      allow_direct_chassis: true,
    });

    // Load notification preferences
    const { data: notifications } = await supabase
      .from('customer_notification_preferences')
      .select('*')
      .eq('customer_id', customerId)
      .single();
    setNotificationPrefs(notifications || {
      email_on_available: true,
      email_on_lfd_warning: true,
      email_on_delivered: true,
      email_on_invoice: true,
    });

    // Load rate agreement
    const { data: rates } = await supabase
      .from('rate_agreements')
      .select(`
        *,
        lane_rates(*),
        accessorial_rates(*)
      `)
      .eq('customer_id', customerId)
      .eq('is_active', true)
      .single();

    if (rates) {
      setRateAgreement(rates);
      setLaneRates(rates.lane_rates || []);
      setAccessorialRates(rates.accessorial_rates || []);
    } else {
      setRateAgreement({
        rate_type: 'PER_LANE',
        fuel_surcharge_pct: 18,
        effective_date: new Date().toISOString().split('T')[0],
      });
    }

    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);

    try {
      // Save billing settings
      const billingData = { ...billingSettings, customer_id: customerId };
      if (billingSettings.id) {
        await supabase.from('customer_billing_settings').update(billingData).eq('id', billingSettings.id);
      } else {
        await supabase.from('customer_billing_settings').insert(billingData);
      }

      // Save chassis preferences
      const chassisData = { ...chassisPrefs, customer_id: customerId };
      if (chassisPrefs.id) {
        await supabase.from('customer_chassis_preferences').update(chassisData).eq('id', chassisPrefs.id);
      } else {
        await supabase.from('customer_chassis_preferences').insert(chassisData);
      }

      // Save notification preferences
      const notifData = { ...notificationPrefs, customer_id: customerId };
      if (notificationPrefs.id) {
        await supabase.from('customer_notification_preferences').update(notifData).eq('id', notifData.id);
      } else {
        await supabase.from('customer_notification_preferences').insert(notifData);
      }

      // Save rate agreement
      let agreementId = rateAgreement.id;
      if (agreementId) {
        await supabase.from('rate_agreements').update({
          ...rateAgreement,
          customer_id: customerId,
        }).eq('id', agreementId);
      } else {
        const { data } = await supabase.from('rate_agreements').insert({
          ...rateAgreement,
          customer_id: customerId,
          is_active: true,
        }).select().single();
        agreementId = data?.id;
      }

      // Save lane rates
      if (agreementId) {
        // Delete existing and re-insert
        await supabase.from('lane_rates').delete().eq('rate_agreement_id', agreementId);
        for (const lane of laneRates) {
          await supabase.from('lane_rates').insert({
            ...lane,
            rate_agreement_id: agreementId,
          });
        }

        // Save accessorial rates
        await supabase.from('accessorial_rates').delete().eq('rate_agreement_id', agreementId);
        for (const acc of accessorialRates) {
          await supabase.from('accessorial_rates').insert({
            ...acc,
            rate_agreement_id: agreementId,
          });
        }
      }

      alert('Settings saved successfully!');
      loadData();
    } catch (error) {
      console.error('Error saving:', error);
      alert('Error saving settings');
    }

    setSaving(false);
  };

  const addLaneRate = () => {
    setLaneRates([...laneRates, {
      origin_terminal: '',
      destination_city: '',
      destination_state: '',
      rate_20: 0,
      rate_40: 0,
      rate_40hc: 0,
      rate_45: 0,
    }]);
  };

  const updateLaneRate = (index: number, field: string, value: any) => {
    const updated = [...laneRates];
    updated[index] = { ...updated[index], [field]: value };
    setLaneRates(updated);
  };

  const removeLaneRate = (index: number) => {
    setLaneRates(laneRates.filter((_, i) => i !== index));
  };

  const addAccessorialRate = () => {
    setAccessorialRates([...accessorialRates, {
      charge_type: 'PREPULL',
      description: '',
      rate_amount: 0,
      rate_unit: 'FLAT',
    }]);
  };

  const updateAccessorialRate = (index: number, field: string, value: any) => {
    const updated = [...accessorialRates];
    updated[index] = { ...updated[index], [field]: value };
    setAccessorialRates(updated);
  };

  const removeAccessorialRate = (index: number) => {
    setAccessorialRates(accessorialRates.filter((_, i) => i !== index));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-lg max-w-4xl mx-auto">
      {/* Header */}
      <div className="bg-gray-900 text-white px-6 py-4 rounded-t-lg flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">{customer?.company_name}</h2>
          <p className="text-gray-400 text-sm">Rate & Billing Setup</p>
        </div>
        {onClose && (
          <button onClick={onClose} className="p-2 hover:bg-gray-800 rounded-lg">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b">
        <div className="flex">
          {[
            { id: 'billing', label: 'Billing' },
            { id: 'rates', label: 'Rate Agreement' },
            { id: 'lanes', label: 'Lane Rates' },
            { id: 'accessorials', label: 'Accessorials' },
            { id: 'notifications', label: 'Notifications' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-3 text-sm font-medium ${
                activeTab === tab.id
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {/* Billing Tab */}
        {activeTab === 'billing' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Payment Terms</label>
                <select
                  value={billingSettings.payment_terms || 'NET_30'}
                  onChange={(e) => setBillingSettings({ ...billingSettings, payment_terms: e.target.value as any })}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="NET_30">Net 30</option>
                  <option value="NET_15">Net 15</option>
                  <option value="NET_7">Net 7</option>
                  <option value="COD">COD</option>
                  <option value="PREPAID">Prepaid</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Invoice Consolidation</label>
                <select
                  value={billingSettings.invoice_consolidation || 'PER_LOAD'}
                  onChange={(e) => setBillingSettings({ ...billingSettings, invoice_consolidation: e.target.value as any })}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="PER_LOAD">Per Load</option>
                  <option value="DAILY">Daily</option>
                  <option value="WEEKLY">Weekly</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Gate Fee Responsibility</label>
                <select
                  value={billingSettings.gate_fee_responsibility || 'CARRIER'}
                  onChange={(e) => setBillingSettings({ ...billingSettings, gate_fee_responsibility: e.target.value as any })}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="CARRIER">Carrier Pays</option>
                  <option value="CUSTOMER">Customer Pays</option>
                  <option value="PREPAID">Customer Prepaid (Direct)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Demurrage Responsibility</label>
                <select
                  value={billingSettings.demurrage_responsibility || 'CUSTOMER'}
                  onChange={(e) => setBillingSettings({ ...billingSettings, demurrage_responsibility: e.target.value as any })}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="CUSTOMER">Customer</option>
                  <option value="CARRIER">Carrier</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Default Move Type</label>
                <select
                  value={billingSettings.default_move_type || 'LIVE'}
                  onChange={(e) => setBillingSettings({ ...billingSettings, default_move_type: e.target.value as any })}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="LIVE">Live Unload</option>
                  <option value="DROP">Drop</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Prepull Authorization</label>
                <select
                  value={billingSettings.prepull_authorization || 'REQUIRES_APPROVAL'}
                  onChange={(e) => setBillingSettings({ ...billingSettings, prepull_authorization: e.target.value as any })}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="AUTO">Auto-Approve</option>
                  <option value="REQUIRES_APPROVAL">Requires Approval</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Yard Storage Free Days</label>
                <input
                  type="number"
                  value={billingSettings.yard_storage_free_days || 2}
                  onChange={(e) => setBillingSettings({ ...billingSettings, yard_storage_free_days: Number(e.target.value) })}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Chassis Preference</label>
                <select
                  value={chassisPrefs.primary_pool || 'DCLI'}
                  onChange={(e) => setChassisPrefs({ ...chassisPrefs, primary_pool: e.target.value as any })}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="DCLI">DCLI</option>
                  <option value="TRAC">TRAC</option>
                  <option value="FLEXI">Flexivan</option>
                  <option value="DIRECT">SSL Direct</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Rate Agreement Tab */}
        {activeTab === 'rates' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Agreement Name</label>
                <input
                  type="text"
                  value={rateAgreement.agreement_name || ''}
                  onChange={(e) => setRateAgreement({ ...rateAgreement, agreement_name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="2024 Rate Agreement"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rate Type</label>
                <select
                  value={rateAgreement.rate_type || 'PER_LANE'}
                  onChange={(e) => setRateAgreement({ ...rateAgreement, rate_type: e.target.value as any })}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="PER_LANE">Per Lane</option>
                  <option value="PER_LOAD">Per Load (Flat)</option>
                  <option value="SPOT">Spot Rate</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Effective Date</label>
                <input
                  type="date"
                  value={rateAgreement.effective_date || ''}
                  onChange={(e) => setRateAgreement({ ...rateAgreement, effective_date: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Expiry Date</label>
                <input
                  type="date"
                  value={rateAgreement.expiry_date || ''}
                  onChange={(e) => setRateAgreement({ ...rateAgreement, expiry_date: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fuel Surcharge %</label>
                <input
                  type="number"
                  step="0.5"
                  value={rateAgreement.fuel_surcharge_pct || 18}
                  onChange={(e) => setRateAgreement({ ...rateAgreement, fuel_surcharge_pct: Number(e.target.value) })}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
            </div>
          </div>
        )}

        {/* Lane Rates Tab */}
        {activeTab === 'lanes' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-medium">Lane Rates</h3>
              <button
                onClick={addLaneRate}
                className="px-3 py-1 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
              >
                + Add Lane
              </button>
            </div>

            {laneRates.length === 0 ? (
              <div className="text-center py-8 text-gray-500 border-2 border-dashed rounded-lg">
                No lane rates configured. Click "Add Lane" to get started.
              </div>
            ) : (
              <div className="space-y-4">
                {laneRates.map((lane, index) => (
                  <div key={index} className="border rounded-lg p-4 bg-gray-50">
                    <div className="flex justify-between items-start mb-3">
                      <span className="font-medium text-sm">Lane {index + 1}</span>
                      <button
                        onClick={() => removeLaneRate(index)}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        Remove
                      </button>
                    </div>
                    <div className="grid grid-cols-4 gap-3">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Origin Terminal</label>
                        <select
                          value={lane.origin_terminal || ''}
                          onChange={(e) => updateLaneRate(index, 'origin_terminal', e.target.value)}
                          className="w-full px-2 py-1 border rounded text-sm"
                        >
                          <option value="">Select...</option>
                          {TERMINALS.map(t => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Destination City</label>
                        <input
                          type="text"
                          value={lane.destination_city || ''}
                          onChange={(e) => updateLaneRate(index, 'destination_city', e.target.value)}
                          className="w-full px-2 py-1 border rounded text-sm"
                          placeholder="Los Angeles"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">State</label>
                        <input
                          type="text"
                          value={lane.destination_state || ''}
                          onChange={(e) => updateLaneRate(index, 'destination_state', e.target.value)}
                          className="w-full px-2 py-1 border rounded text-sm"
                          placeholder="CA"
                          maxLength={2}
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">ZIP Range</label>
                        <div className="flex gap-1">
                          <input
                            type="text"
                            value={lane.destination_zip_start || ''}
                            onChange={(e) => updateLaneRate(index, 'destination_zip_start', e.target.value)}
                            className="w-full px-2 py-1 border rounded text-sm"
                            placeholder="90001"
                          />
                          <input
                            type="text"
                            value={lane.destination_zip_end || ''}
                            onChange={(e) => updateLaneRate(index, 'destination_zip_end', e.target.value)}
                            className="w-full px-2 py-1 border rounded text-sm"
                            placeholder="90099"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-3 mt-3">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">20' Rate</label>
                        <input
                          type="number"
                          value={lane.rate_20 || ''}
                          onChange={(e) => updateLaneRate(index, 'rate_20', Number(e.target.value))}
                          className="w-full px-2 py-1 border rounded text-sm"
                          placeholder="350"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">40' Rate</label>
                        <input
                          type="number"
                          value={lane.rate_40 || ''}
                          onChange={(e) => updateLaneRate(index, 'rate_40', Number(e.target.value))}
                          className="w-full px-2 py-1 border rounded text-sm"
                          placeholder="450"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">40'HC Rate</label>
                        <input
                          type="number"
                          value={lane.rate_40hc || ''}
                          onChange={(e) => updateLaneRate(index, 'rate_40hc', Number(e.target.value))}
                          className="w-full px-2 py-1 border rounded text-sm"
                          placeholder="475"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">45' Rate</label>
                        <input
                          type="number"
                          value={lane.rate_45 || ''}
                          onChange={(e) => updateLaneRate(index, 'rate_45', Number(e.target.value))}
                          className="w-full px-2 py-1 border rounded text-sm"
                          placeholder="500"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Accessorials Tab */}
        {activeTab === 'accessorials' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-medium">Accessorial Rates</h3>
              <button
                onClick={addAccessorialRate}
                className="px-3 py-1 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
              >
                + Add Accessorial
              </button>
            </div>

            {accessorialRates.length === 0 ? (
              <div className="text-center py-8 text-gray-500 border-2 border-dashed rounded-lg">
                No accessorial rates configured.
              </div>
            ) : (
              <div className="space-y-3">
                {accessorialRates.map((acc, index) => (
                  <div key={index} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <select
                      value={acc.charge_type || 'PREPULL'}
                      onChange={(e) => updateAccessorialRate(index, 'charge_type', e.target.value)}
                      className="px-2 py-1 border rounded text-sm"
                    >
                      {CHARGE_TYPES.map(ct => (
                        <option key={ct.value} value={ct.value}>{ct.label}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={acc.description || ''}
                      onChange={(e) => updateAccessorialRate(index, 'description', e.target.value)}
                      className="flex-1 px-2 py-1 border rounded text-sm"
                      placeholder="Description"
                    />
                    <div className="flex items-center gap-1">
                      <span className="text-gray-500">$</span>
                      <input
                        type="number"
                        value={acc.rate_amount || ''}
                        onChange={(e) => updateAccessorialRate(index, 'rate_amount', Number(e.target.value))}
                        className="w-20 px-2 py-1 border rounded text-sm"
                        placeholder="0"
                      />
                    </div>
                    <select
                      value={acc.rate_unit || 'FLAT'}
                      onChange={(e) => updateAccessorialRate(index, 'rate_unit', e.target.value)}
                      className="px-2 py-1 border rounded text-sm"
                    >
                      <option value="FLAT">Flat</option>
                      <option value="PER_HOUR">Per Hour</option>
                      <option value="PER_DAY">Per Day</option>
                    </select>
                    <button
                      onClick={() => removeAccessorialRate(index)}
                      className="text-red-600 hover:text-red-800"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Notifications Tab */}
        {activeTab === 'notifications' && (
          <div className="space-y-4">
            <h3 className="font-medium">Email Notifications</h3>
            <div className="space-y-3">
              {[
                { key: 'email_on_available', label: 'Container Available' },
                { key: 'email_on_lfd_warning', label: 'LFD Warning' },
                { key: 'email_on_dispatched', label: 'Load Dispatched' },
                { key: 'email_on_delivered', label: 'Delivery Complete' },
                { key: 'email_on_invoice', label: 'Invoice Sent' },
                { key: 'email_on_hold_detected', label: 'Hold Detected' },
              ].map(item => (
                <label key={item.key} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
                  <input
                    type="checkbox"
                    checked={(notificationPrefs as any)[item.key] || false}
                    onChange={(e) => setNotificationPrefs({ ...notificationPrefs, [item.key]: e.target.checked })}
                    className="w-4 h-4 rounded text-blue-600"
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>

            <div className="border-t pt-4 mt-4">
              <h3 className="font-medium mb-3">SMS Notifications</h3>
              <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
                <input
                  type="checkbox"
                  checked={notificationPrefs.sms_enabled || false}
                  onChange={(e) => setNotificationPrefs({ ...notificationPrefs, sms_enabled: e.target.checked })}
                  className="w-4 h-4 rounded text-blue-600"
                />
                <span>Enable SMS Notifications</span>
              </label>
              {notificationPrefs.sms_enabled && (
                <div className="mt-3">
                  <label className="block text-sm text-gray-600 mb-1">SMS Phone Number</label>
                  <input
                    type="tel"
                    value={notificationPrefs.sms_phone || ''}
                    onChange={(e) => setNotificationPrefs({ ...notificationPrefs, sms_phone: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="+1 (555) 123-4567"
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t p-4 bg-gray-50 rounded-b-lg flex justify-end gap-3">
        {onClose && (
          <button
            onClick={onClose}
            className="px-4 py-2 border rounded-lg text-gray-700 hover:bg-gray-100"
          >
            Cancel
          </button>
        )}
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300"
        >
          {saving ? 'Saving...' : 'Save All Settings'}
        </button>
      </div>
    </div>
  );
}
