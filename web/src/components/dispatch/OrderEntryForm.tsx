'use client';

import { useState, useEffect } from 'react';
import {
  Order, Customer, OrderType, ShippingLine, Terminal,
  SHIPPING_LINE_LABELS, TERMINAL_LABELS
} from '@/lib/types';
import { supabase, createLoad } from '@/lib/supabase';
import { validateContainerNumber } from '@/lib/validations';

interface OrderEntryFormProps {
  onClose: () => void;
  onSuccess: () => void;
}

export default function OrderEntryForm({ onClose, onSuccess }: OrderEntryFormProps) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'type' | 'customer' | 'details' | 'containers'>('type');
  
  const [orderType, setOrderType] = useState<OrderType>('IMPORT');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  
  const [orderData, setOrderData] = useState({
    // Import fields
    bill_of_lading: '',
    master_bol: '',
    // Export fields
    booking_number: '',
    // Common
    shipping_line: '' as ShippingLine | '',
    vessel_name: '',
    voyage_number: '',
    port: 'USLAX',
    terminal: '' as Terminal | '',
    eta_date: '',
    cutoff_date: '',
    // Location
    location_name: '',
    location_address: '',
    location_city: '',
    location_state: '',
    location_zip: '',
    location_contact_name: '',
    location_contact_phone: '',
    location_contact_email: '',
    appointment_required: true,
    dock_hours: '',
    special_instructions: '',
  });

  const [containers, setContainers] = useState<{
    container_number: string;
    container_size: string;
    container_type: string;
    weight_lbs: number;
    is_hazmat: boolean;
    is_overweight: boolean;
  }[]>([{
    container_number: '',
    container_size: '40',
    container_type: 'DRY',
    weight_lbs: 0,
    is_hazmat: false,
    is_overweight: false,
  }]);
  const [containerErrors, setContainerErrors] = useState<Record<number, string | undefined>>({});

  useEffect(() => {
    loadCustomers();
  }, []);

  const loadCustomers = async () => {
    const { data } = await supabase
      .from('customers')
      .select('*')
      .eq('is_active', true)
      .order('company_name');
    setCustomers(data || []);
  };

  const addContainer = () => {
    setContainers([...containers, {
      container_number: '',
      container_size: '40',
      container_type: 'DRY',
      weight_lbs: 0,
      is_hazmat: false,
      is_overweight: false,
    }]);
  };

  const updateContainer = (index: number, field: string, value: any) => {
    const updated = [...containers];
    updated[index] = { ...updated[index], [field]: value };
    setContainers(updated);

    // Validate container number on change
    if (field === 'container_number') {
      if (!value || value.length < 11) {
        setContainerErrors(prev => ({ ...prev, [index]: undefined }));
      } else {
        const result = validateContainerNumber(value);
        setContainerErrors(prev => ({
          ...prev,
          [index]: result.valid ? undefined : result.error,
        }));
      }
    }
  };

  const removeContainer = (index: number) => {
    if (containers.length > 1) {
      setContainers(containers.filter((_, i) => i !== index));
    }
  };

  const handleSubmit = async () => {
    setLoading(true);

    try {
      // Create order
      const orderNumber = `ORD-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
      
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          order_number: orderNumber,
          order_type: orderType,
          customer_id: selectedCustomerId,
          source_type: 'MANUAL',
          bill_of_lading: orderData.bill_of_lading || null,
          booking_number: orderData.booking_number || null,
          shipping_line: orderData.shipping_line || null,
          vessel_name: orderData.vessel_name || null,
          voyage_number: orderData.voyage_number || null,
          port: orderData.port,
          terminal: orderData.terminal || null,
          eta_date: orderData.eta_date || null,
          cutoff_date: orderData.cutoff_date || null,
          location_name: orderData.location_name,
          location_address: orderData.location_address,
          location_city: orderData.location_city,
          location_state: orderData.location_state,
          location_zip: orderData.location_zip,
          location_contact_name: orderData.location_contact_name || null,
          location_contact_phone: orderData.location_contact_phone || null,
          location_contact_email: orderData.location_contact_email || null,
          appointment_required: orderData.appointment_required,
          dock_hours: orderData.dock_hours || null,
          special_instructions: orderData.special_instructions || null,
          status: 'RECEIVED',
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // Create loads for each container
      for (const container of containers) {
        if (container.container_number || orderType === 'EXPORT') {
          await createLoad({
            order_id: order.id,
            customer_id: selectedCustomerId,
            container_number: container.container_number || null,
            container_size: container.container_size as any,
            container_type: container.container_type as any,
            weight_lbs: container.weight_lbs || null,
            is_hazmat: container.is_hazmat,
            is_overweight: container.is_overweight,
            requires_triaxle: container.is_overweight,
            terminal: orderData.terminal || null,
            terminal_status: 'TRACKING',
            status: 'TRACKING',
            move_type: 'LIVE',
          });
        }
      }

      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error creating order:', error);
      alert('Error creating order. Please try again.');
    }

    setLoading(false);
  };

  const canProceed = () => {
    switch (step) {
      case 'type': return true;
      case 'customer': return !!selectedCustomerId;
      case 'details': 
        if (orderType === 'IMPORT') {
          return !!orderData.bill_of_lading && !!orderData.terminal;
        } else {
          return !!orderData.booking_number && !!orderData.terminal;
        }
      case 'containers': 
        return containers.some(c => c.container_number || orderType === 'EXPORT');
      default: return false;
    }
  };

  const nextStep = () => {
    const steps: typeof step[] = ['type', 'customer', 'details', 'containers'];
    const currentIndex = steps.indexOf(step);
    if (currentIndex < steps.length - 1) {
      setStep(steps[currentIndex + 1]);
    }
  };

  const prevStep = () => {
    const steps: typeof step[] = ['type', 'customer', 'details', 'containers'];
    const currentIndex = steps.indexOf(step);
    if (currentIndex > 0) {
      setStep(steps[currentIndex - 1]);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gray-900 text-white px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">New Order Entry</h2>
            <p className="text-gray-400 text-sm">
              Step {['type', 'customer', 'details', 'containers'].indexOf(step) + 1} of 4
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-800 rounded-lg">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-gray-200">
          <div 
            className="h-full bg-blue-600 transition-all duration-300"
            style={{ width: `${((['type', 'customer', 'details', 'containers'].indexOf(step) + 1) / 4) * 100}%` }}
          />
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {/* Step 1: Order Type */}
          {step === 'type' && (
            <div className="space-y-4">
              <h3 className="font-semibold text-lg mb-4">What type of order?</h3>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setOrderType('IMPORT')}
                  className={`p-6 rounded-lg border-2 text-left transition ${
                    orderType === 'IMPORT'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="text-3xl mb-2">📥</div>
                  <div className="font-semibold text-lg">Import</div>
                  <div className="text-sm text-gray-600">
                    Delivery from port to customer
                  </div>
                </button>
                <button
                  onClick={() => setOrderType('EXPORT')}
                  className={`p-6 rounded-lg border-2 text-left transition ${
                    orderType === 'EXPORT'
                      ? 'border-green-500 bg-green-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="text-3xl mb-2">📤</div>
                  <div className="font-semibold text-lg">Export</div>
                  <div className="text-sm text-gray-600">
                    Pickup from customer to port
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Customer Selection */}
          {step === 'customer' && (
            <div className="space-y-4">
              <h3 className="font-semibold text-lg mb-4">Select Customer</h3>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search customers..."
                  className="w-full px-4 py-2 border rounded-lg mb-4"
                />
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {customers.map(customer => (
                  <button
                    key={customer.id}
                    onClick={() => setSelectedCustomerId(customer.id)}
                    className={`w-full p-3 rounded-lg border text-left transition ${
                      selectedCustomerId === customer.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="font-medium">{customer.company_name}</div>
                    <div className="text-sm text-gray-500">
                      {customer.city}, {customer.state}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Order Details */}
          {step === 'details' && (
            <div className="space-y-6">
              <h3 className="font-semibold text-lg">
                {orderType === 'IMPORT' ? 'Import Details' : 'Export Details'}
              </h3>

              {/* Reference Numbers */}
              <div className="grid grid-cols-2 gap-4">
                {orderType === 'IMPORT' ? (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Bill of Lading *
                      </label>
                      <input
                        type="text"
                        value={orderData.bill_of_lading}
                        onChange={(e) => setOrderData({ ...orderData, bill_of_lading: e.target.value.toUpperCase() })}
                        className="w-full px-3 py-2 border rounded-lg font-mono"
                        placeholder="MAEU123456789"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Master BOL (Optional)
                      </label>
                      <input
                        type="text"
                        value={orderData.master_bol}
                        onChange={(e) => setOrderData({ ...orderData, master_bol: e.target.value.toUpperCase() })}
                        className="w-full px-3 py-2 border rounded-lg font-mono"
                        placeholder="MBOL123456"
                      />
                    </div>
                  </>
                ) : (
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Booking Number *
                    </label>
                    <input
                      type="text"
                      value={orderData.booking_number}
                      onChange={(e) => setOrderData({ ...orderData, booking_number: e.target.value.toUpperCase() })}
                      className="w-full px-3 py-2 border rounded-lg font-mono"
                      placeholder="BKG123456789"
                    />
                  </div>
                )}
              </div>

              {/* Shipping Info */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Shipping Line</label>
                  <select
                    value={orderData.shipping_line}
                    onChange={(e) => setOrderData({ ...orderData, shipping_line: e.target.value as ShippingLine })}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="">Select...</option>
                    {Object.entries(SHIPPING_LINE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Vessel</label>
                  <input
                    type="text"
                    value={orderData.vessel_name}
                    onChange={(e) => setOrderData({ ...orderData, vessel_name: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="MSC OSCAR"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Voyage</label>
                  <input
                    type="text"
                    value={orderData.voyage_number}
                    onChange={(e) => setOrderData({ ...orderData, voyage_number: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="VOY123"
                  />
                </div>
              </div>

              {/* Terminal & Dates */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Terminal *</label>
                  <select
                    value={orderData.terminal}
                    onChange={(e) => setOrderData({ ...orderData, terminal: e.target.value as Terminal })}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="">Select...</option>
                    {Object.entries(TERMINAL_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {orderType === 'IMPORT' ? 'ETA Date' : 'Cutoff Date'}
                  </label>
                  <input
                    type="date"
                    value={orderType === 'IMPORT' ? orderData.eta_date : orderData.cutoff_date}
                    onChange={(e) => setOrderData({ 
                      ...orderData, 
                      [orderType === 'IMPORT' ? 'eta_date' : 'cutoff_date']: e.target.value 
                    })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Port</label>
                  <select
                    value={orderData.port}
                    onChange={(e) => setOrderData({ ...orderData, port: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="USLAX">Los Angeles</option>
                    <option value="USLGB">Long Beach</option>
                  </select>
                </div>
              </div>

              {/* Delivery/Pickup Location */}
              <div className="border-t pt-4">
                <h4 className="font-medium mb-3">
                  {orderType === 'IMPORT' ? 'Delivery Location' : 'Pickup Location'}
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Location Name *</label>
                    <input
                      type="text"
                      value={orderData.location_name}
                      onChange={(e) => setOrderData({ ...orderData, location_name: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                      placeholder="ABC Warehouse"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                    <input
                      type="text"
                      value={orderData.location_address}
                      onChange={(e) => setOrderData({ ...orderData, location_address: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                      placeholder="123 Industrial Blvd"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                    <input
                      type="text"
                      value={orderData.location_city}
                      onChange={(e) => setOrderData({ ...orderData, location_city: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                      placeholder="Los Angeles"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                      <input
                        type="text"
                        value={orderData.location_state}
                        onChange={(e) => setOrderData({ ...orderData, location_state: e.target.value.toUpperCase() })}
                        className="w-full px-3 py-2 border rounded-lg"
                        placeholder="CA"
                        maxLength={2}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">ZIP</label>
                      <input
                        type="text"
                        value={orderData.location_zip}
                        onChange={(e) => setOrderData({ ...orderData, location_zip: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg"
                        placeholder="90001"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Contact Info */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Contact Name</label>
                  <input
                    type="text"
                    value={orderData.location_contact_name}
                    onChange={(e) => setOrderData({ ...orderData, location_contact_name: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="John Smith"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={orderData.location_contact_phone}
                    onChange={(e) => setOrderData({ ...orderData, location_contact_phone: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="(555) 123-4567"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={orderData.location_contact_email}
                    onChange={(e) => setOrderData({ ...orderData, location_contact_email: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="john@example.com"
                  />
                </div>
              </div>

              {/* Special Instructions */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Special Instructions</label>
                <textarea
                  value={orderData.special_instructions}
                  onChange={(e) => setOrderData({ ...orderData, special_instructions: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                  rows={2}
                  placeholder="Any special handling instructions..."
                />
              </div>
            </div>
          )}

          {/* Step 4: Containers */}
          {step === 'containers' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-lg">Container Information</h3>
                <button
                  onClick={addContainer}
                  className="px-3 py-1 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
                >
                  + Add Container
                </button>
              </div>

              <div className="space-y-4">
                {containers.map((container, index) => (
                  <div key={index} className="border rounded-lg p-4 bg-gray-50">
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-medium">Container {index + 1}</span>
                      {containers.length > 1 && (
                        <button
                          onClick={() => removeContainer(index)}
                          className="text-red-600 hover:text-red-800 text-sm"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">
                          Container Number {orderType === 'IMPORT' ? '*' : '(TBD for export)'}
                        </label>
                        <input
                          type="text"
                          value={container.container_number}
                          onChange={(e) => updateContainer(index, 'container_number', e.target.value.toUpperCase())}
                          className={`w-full px-2 py-1 border rounded text-sm font-mono ${
                            containerErrors[index]
                              ? 'border-red-500 bg-red-50'
                              : container.container_number.length === 11 && !containerErrors[index]
                              ? 'border-green-500 bg-green-50'
                              : ''
                          }`}
                          placeholder="MSCU1234567"
                          maxLength={11}
                        />
                        {containerErrors[index] && (
                          <p className="mt-1 text-xs text-red-600">{containerErrors[index]}</p>
                        )}
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Size</label>
                        <select
                          value={container.container_size}
                          onChange={(e) => updateContainer(index, 'container_size', e.target.value)}
                          className="w-full px-2 py-1 border rounded text-sm"
                        >
                          <option value="20">20'</option>
                          <option value="40">40'</option>
                          <option value="40HC">40' HC</option>
                          <option value="45">45'</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Type</label>
                        <select
                          value={container.container_type}
                          onChange={(e) => updateContainer(index, 'container_type', e.target.value)}
                          className="w-full px-2 py-1 border rounded text-sm"
                        >
                          <option value="DRY">Dry</option>
                          <option value="REEFER">Reefer</option>
                          <option value="FLAT">Flat Rack</option>
                          <option value="OPEN_TOP">Open Top</option>
                          <option value="TANK">Tank</option>
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3 mt-3">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Weight (lbs)</label>
                        <input
                          type="number"
                          value={container.weight_lbs || ''}
                          onChange={(e) => updateContainer(index, 'weight_lbs', Number(e.target.value))}
                          className="w-full px-2 py-1 border rounded text-sm"
                          placeholder="44000"
                        />
                      </div>
                      <div className="flex items-center gap-2 pt-4">
                        <input
                          type="checkbox"
                          id={`hazmat-${index}`}
                          checked={container.is_hazmat}
                          onChange={(e) => updateContainer(index, 'is_hazmat', e.target.checked)}
                          className="w-4 h-4"
                        />
                        <label htmlFor={`hazmat-${index}`} className="text-sm">Hazmat</label>
                      </div>
                      <div className="flex items-center gap-2 pt-4">
                        <input
                          type="checkbox"
                          id={`overweight-${index}`}
                          checked={container.is_overweight}
                          onChange={(e) => updateContainer(index, 'is_overweight', e.target.checked)}
                          className="w-4 h-4"
                        />
                        <label htmlFor={`overweight-${index}`} className="text-sm">Overweight</label>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t p-4 bg-gray-50 flex justify-between">
          <button
            onClick={step === 'type' ? onClose : prevStep}
            className="px-4 py-2 border rounded-lg text-gray-700 hover:bg-gray-100"
          >
            {step === 'type' ? 'Cancel' : 'Back'}
          </button>
          
          {step === 'containers' ? (
            <button
              onClick={handleSubmit}
              disabled={loading || !canProceed()}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300"
            >
              {loading ? 'Creating...' : 'Create Order'}
            </button>
          ) : (
            <button
              onClick={nextStep}
              disabled={!canProceed()}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300"
            >
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
