'use client';

import { useState } from 'react';
import {
  ContainerSize,
  ContainerType,
  CustomsStatus,
  TripType,
  TRIP_TYPE_INFO
} from '../../types';
import { validateContainerNumber } from '../../lib/validations';
import PDFUploader, { ExtractedLoadData } from './PDFUploader';
import toast from 'react-hot-toast';

interface ContainerInput {
  containerNumber: string;
  size: ContainerSize;
  type: ContainerType;
  weight: string;
  sealNumber: string;
  isHazmat: boolean;
  hazmatClass: string;
  hazmatUN: string;
  isOverweight: boolean;
  isReefer: boolean;
  reeferTemp: string;
  customsStatus: CustomsStatus;
  terminalAvailableDate: string;
}

interface LocationInput {
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  contactName: string;
  contactPhone: string;
  appointmentRequired: boolean;
  appointmentDate: string;
  appointmentTime: string;
}

interface NewLoadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => void;
}

const emptyContainer: ContainerInput = {
  containerNumber: '',
  size: '40',
  type: 'DRY',
  weight: '',
  sealNumber: '',
  isHazmat: false,
  hazmatClass: '',
  hazmatUN: '',
  isOverweight: false,
  isReefer: false,
  reeferTemp: '',
  customsStatus: 'PENDING',
  terminalAvailableDate: '',
};

const emptyLocation: LocationInput = {
  name: '',
  address: '',
  city: '',
  state: '',
  zip: '',
  contactName: '',
  contactPhone: '',
  appointmentRequired: false,
  appointmentDate: '',
  appointmentTime: '',
};

export function NewLoadModal({ isOpen, onClose, onSubmit }: NewLoadModalProps) {
  const [step, setStep] = useState(0); // Start at step 0 for entry method selection
  const [entryMethod, setEntryMethod] = useState<'manual' | 'pdf' | null>(null);
  const [formData, setFormData] = useState({
    type: 'IMPORT' as 'IMPORT' | 'EXPORT',
    customer: '',
    steamshipLine: '',
    bookingNumber: '',
    billOfLading: '',
    vessel: '',
    voyage: '',
    terminal: '',
    lastFreeDay: '',
    portCutoff: '',
    earliestReturnDate: '',
    tripType: 'LIVE_UNLOAD' as TripType,
    specialInstructions: '',
    generateOrders: true,
  });
  
  const [containers, setContainers] = useState<ContainerInput[]>([{ ...emptyContainer }]);
  const [pickupLocation, setPickupLocation] = useState<LocationInput>({ ...emptyLocation });
  const [deliveryLocation, setDeliveryLocation] = useState<LocationInput>({ ...emptyLocation });
  const [chassisInfo, setChassisInfo] = useState({
    required: true,
    pool: 'DCLI',
    preferredSize: '40',
  });
  const [containerErrors, setContainerErrors] = useState<Record<number, string | undefined>>({});
  const [pdfExtractedData, setPdfExtractedData] = useState<ExtractedLoadData | null>(null);
  const [stepErrors, setStepErrors] = useState<string[]>([]);

  // Handle PDF extraction
  const handlePDFExtracted = (data: ExtractedLoadData) => {
    setPdfExtractedData(data);

    // Pre-fill form data from extracted PDF
    setFormData(prev => ({
      ...prev,
      type: data.type || prev.type,
      customer: data.customerName || prev.customer,
      steamshipLine: data.steamshipLine || prev.steamshipLine,
      bookingNumber: data.bookingNumber || prev.bookingNumber,
      billOfLading: data.billOfLading || prev.billOfLading,
      vessel: data.vessel || prev.vessel,
      voyage: data.voyage || prev.voyage,
      terminal: data.terminalName || prev.terminal,
      lastFreeDay: data.lastFreeDay || prev.lastFreeDay,
      portCutoff: data.portCutoff || prev.portCutoff,
      earliestReturnDate: data.earliestReturnDate || prev.earliestReturnDate,
      specialInstructions: data.specialInstructions || prev.specialInstructions,
    }));

    // Pre-fill containers
    if (data.containers && data.containers.length > 0) {
      const mappedContainers: ContainerInput[] = data.containers.map(c => ({
        containerNumber: c.containerNumber || '',
        size: (c.size as ContainerSize) || '40',
        type: (c.type as ContainerType) || 'DRY',
        weight: c.weightLbs?.toString() || '',
        sealNumber: c.sealNumber || '',
        isHazmat: c.isHazmat || false,
        hazmatClass: c.hazmatClass || '',
        hazmatUN: c.hazmatUnNumber || '',
        isOverweight: c.isOverweight || false,
        isReefer: c.isReefer || false,
        reeferTemp: c.reeferTemp?.toString() || '',
        customsStatus: 'PENDING' as CustomsStatus,
        terminalAvailableDate: '',
      }));
      setContainers(mappedContainers);
    }

    // Pre-fill delivery location (for imports)
    if (data.type === 'IMPORT' && (data.deliveryAddress || data.deliveryCity)) {
      setDeliveryLocation(prev => ({
        ...prev,
        name: data.deliveryLocationName || prev.name,
        address: data.deliveryAddress || prev.address,
        city: data.deliveryCity || prev.city,
        state: data.deliveryState || prev.state,
        zip: data.deliveryZip || prev.zip,
        contactName: data.deliveryContactName || prev.contactName,
        contactPhone: data.deliveryContactPhone || prev.contactPhone,
      }));
    }

    // Pre-fill pickup location (for exports)
    if (data.type === 'EXPORT' && (data.pickupAddress || data.pickupCity)) {
      setPickupLocation(prev => ({
        ...prev,
        name: data.pickupLocationName || prev.name,
        address: data.pickupAddress || prev.address,
        city: data.pickupCity || prev.city,
        state: data.pickupState || prev.state,
        zip: data.pickupZip || prev.zip,
        contactName: data.pickupContactName || prev.contactName,
        contactPhone: data.pickupContactPhone || prev.contactPhone,
      }));
    }

    // Show success message with confidence
    const confidencePercent = Math.round((data.confidence || 0) * 100);
    toast.success(`Extracted ${data.containers?.length || 0} container(s) with ${confidencePercent}% confidence`);

    // Move to step 1 (shipment info)
    setEntryMethod('pdf');
    setStep(1);
  };

  const handlePDFError = (error: string) => {
    toast.error(error);
  };

  if (!isOpen) return null;

  const validateContainerInput = (index: number, value: string) => {
    if (!value || value.length < 11) {
      setContainerErrors(prev => ({ ...prev, [index]: undefined }));
      return;
    }
    const result = validateContainerNumber(value);
    setContainerErrors(prev => ({
      ...prev,
      [index]: result.valid ? undefined : result.error,
    }));
  };

  const validateCurrentStep = (): boolean => {
    const errors: string[] = [];

    if (step === 1) {
      if (!formData.customer) errors.push('Customer is required');
      if (!formData.steamshipLine) errors.push('Steamship Line is required');
      if (!formData.bookingNumber) errors.push('Booking Number is required');
      if (!formData.terminal) errors.push('Terminal is required');
      if (formData.type === 'IMPORT' && !formData.lastFreeDay) {
        errors.push('Last Free Day is required for imports');
      }
      if (formData.type === 'EXPORT' && !formData.portCutoff) {
        errors.push('Port Cutoff is required for exports');
      }
    }

    if (step === 2) {
      containers.forEach((container, index) => {
        if (!container.containerNumber) {
          errors.push(`Container #${index + 1}: Container number is required`);
        } else if (containerErrors[index]) {
          errors.push(`Container #${index + 1}: ${containerErrors[index]}`);
        }
      });
    }

    if (step === 3 && formData.type === 'EXPORT') {
      if (!pickupLocation.name) errors.push('Pickup location name is required');
      if (!pickupLocation.address) errors.push('Pickup address is required');
      if (!pickupLocation.city) errors.push('Pickup city is required');
    }

    if (step === 3 && formData.type === 'IMPORT') {
      if (!deliveryLocation.name) errors.push('Delivery location name is required');
      if (!deliveryLocation.address) errors.push('Delivery address is required');
      if (!deliveryLocation.city) errors.push('Delivery city is required');
    }

    setStepErrors(errors);
    return errors.length === 0;
  };

  const handleNextStep = () => {
    if (validateCurrentStep()) {
      setStep(step + 1);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    setFormData(prev => ({ 
      ...prev, 
      [name]: type === 'checkbox' ? checked : value 
    }));
  };

  const handleContainerChange = (index: number, field: keyof ContainerInput, value: any) => {
    const updated = [...containers];
    updated[index] = { ...updated[index], [field]: value };
    setContainers(updated);
    // Validate container number on change
    if (field === 'containerNumber') {
      validateContainerInput(index, value);
    }
  };

  const addContainer = () => {
    setContainers([...containers, { ...emptyContainer }]);
  };

  const removeContainer = (index: number) => {
    if (containers.length > 1) {
      setContainers(containers.filter((_, i) => i !== index));
    }
  };

  const handleLocationChange = (
    locationType: 'pickup' | 'delivery',
    field: keyof LocationInput,
    value: any
  ) => {
    if (locationType === 'pickup') {
      setPickupLocation(prev => ({ ...prev, [field]: value }));
    } else {
      setDeliveryLocation(prev => ({ ...prev, [field]: value }));
    }
  };

  const handleSubmit = () => {
    const shipmentData = {
      ...formData,
      containers,
      pickupLocation,
      deliveryLocation,
      chassisInfo,
    };
    onSubmit(shipmentData);
    resetForm();
  };

  const resetForm = () => {
    setFormData({
      type: 'IMPORT',
      customer: '',
      steamshipLine: '',
      bookingNumber: '',
      billOfLading: '',
      vessel: '',
      voyage: '',
      terminal: '',
      lastFreeDay: '',
      portCutoff: '',
      earliestReturnDate: '',
      tripType: 'LIVE_UNLOAD',
      specialInstructions: '',
      generateOrders: true,
    });
    setContainers([{ ...emptyContainer }]);
    setPickupLocation({ ...emptyLocation });
    setDeliveryLocation({ ...emptyLocation });
    setStep(0);
    setEntryMethod(null);
    setPdfExtractedData(null);
  };

  const renderStepIndicator = () => {
    // Don't show indicator on step 0 (entry method selection)
    if (step === 0) return null;

    return (
      <div className="flex items-center justify-center gap-2 mt-4">
        {[1, 2, 3, 4, 5].map((s) => (
          <div key={s} className="flex items-center">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium cursor-pointer ${
                step === s
                  ? 'bg-white text-blue-600'
                  : step > s
                  ? 'bg-blue-400 text-white'
                  : 'bg-blue-500/50 text-white/70'
              }`}
              onClick={() => s < step && setStep(s)}
            >
              {step > s ? '✓' : s}
            </div>
            {s < 5 && <div className={`w-8 h-0.5 ${step > s ? 'bg-blue-400' : 'bg-blue-500/50'}`}></div>}
          </div>
        ))}
      </div>
    );
  };

  const renderStepTitle = () => {
    if (step === 0) {
      return (
        <div className="text-center mt-2">
          <span className="text-white/80 text-sm">Choose Entry Method</span>
        </div>
      );
    }

    const titles = ['Shipment Info', 'Containers', 'Locations', 'Trip Details', 'Review'];
    return (
      <div className="text-center mt-2">
        <span className="text-white/80 text-sm">{titles[step - 1]}</span>
        {entryMethod === 'pdf' && pdfExtractedData && (
          <span className="ml-2 text-xs bg-green-500 text-white px-2 py-0.5 rounded-full">
            From PDF
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black bg-opacity-50" onClick={onClose}></div>
      <div className="relative min-h-screen flex items-center justify-center p-4">
        <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-5xl max-h-[90vh] overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">New Load Entry</h2>
              <button onClick={onClose} className="text-white hover:text-gray-200 text-2xl">
                ×
              </button>
            </div>
            {renderStepIndicator()}
            {renderStepTitle()}
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto max-h-[60vh]">
            {/* Step 0: Entry Method Selection */}
            {step === 0 && (
              <div className="space-y-6">
                <div className="text-center mb-8">
                  <h3 className="text-xl font-semibold text-gray-800">How would you like to enter load information?</h3>
                  <p className="text-gray-500 mt-2">Upload a document for automatic extraction or enter details manually</p>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  {/* PDF Upload Option */}
                  <div className="border-2 border-gray-200 rounded-xl p-6 hover:border-blue-300 transition-colors">
                    <div className="text-center mb-4">
                      <div className="w-16 h-16 mx-auto bg-blue-100 rounded-full flex items-center justify-center mb-4">
                        <svg className="w-8 h-8 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12l-3-3m0 0l-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                        </svg>
                      </div>
                      <h4 className="font-semibold text-gray-800">Upload PDF</h4>
                      <p className="text-sm text-gray-500 mt-1">Rate confirmation, BOL, or booking document</p>
                    </div>
                    <PDFUploader
                      onExtracted={handlePDFExtracted}
                      onError={handlePDFError}
                    />
                    <div className="mt-4 flex items-center justify-center gap-2 text-xs text-gray-400">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      <span>AI-powered extraction</span>
                    </div>
                  </div>

                  {/* Manual Entry Option */}
                  <button
                    type="button"
                    onClick={() => {
                      setEntryMethod('manual');
                      setStep(1);
                    }}
                    className="border-2 border-gray-200 rounded-xl p-6 hover:border-blue-500 hover:bg-blue-50 transition-all text-left group"
                  >
                    <div className="text-center">
                      <div className="w-16 h-16 mx-auto bg-gray-100 group-hover:bg-blue-100 rounded-full flex items-center justify-center mb-4 transition-colors">
                        <svg className="w-8 h-8 text-gray-600 group-hover:text-blue-600 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                        </svg>
                      </div>
                      <h4 className="font-semibold text-gray-800 group-hover:text-blue-800">Manual Entry</h4>
                      <p className="text-sm text-gray-500 mt-1">Enter shipment details step by step</p>
                      <div className="mt-6 py-3 px-4 bg-gray-100 group-hover:bg-blue-100 rounded-lg transition-colors">
                        <span className="text-sm font-medium text-gray-600 group-hover:text-blue-600">Start Manual Entry →</span>
                      </div>
                    </div>
                  </button>
                </div>

                {/* Quick stats */}
                <div className="mt-8 p-4 bg-gray-50 rounded-xl">
                  <div className="flex items-center justify-center gap-8 text-sm text-gray-500">
                    <div className="flex items-center gap-2">
                      <svg className="w-5 h-5 text-green-500" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <span>Extracts container numbers</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <svg className="w-5 h-5 text-green-500" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <span>Detects dates & addresses</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <svg className="w-5 h-5 text-green-500" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <span>Identifies SSL & terminals</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 1: Shipment Info */}
            {step === 1 && (
              <div className="space-y-6">
                {/* Shipment Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Shipment Type *</label>
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, type: 'IMPORT', tripType: 'LIVE_UNLOAD' }))}
                      className={`p-4 rounded-xl border-2 text-left transition ${
                        formData.type === 'IMPORT'
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="text-2xl mb-2">📥</div>
                      <div className="font-semibold">Import</div>
                      <div className="text-sm text-gray-500">Terminal → Customer</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, type: 'EXPORT', tripType: 'LIVE_LOAD' }))}
                      className={`p-4 rounded-xl border-2 text-left transition ${
                        formData.type === 'EXPORT'
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="text-2xl mb-2">📤</div>
                      <div className="font-semibold">Export</div>
                      <div className="text-sm text-gray-500">Customer → Terminal</div>
                    </button>
                  </div>
                </div>

                {/* Customer & SSL */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Customer *</label>
                    <select
                      name="customer"
                      value={formData.customer}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select Customer</option>
                      <option value="ABC Logistics">ABC Logistics</option>
                      <option value="XYZ Imports">XYZ Imports</option>
                      <option value="Global Trade Co">Global Trade Co</option>
                      <option value="Pacific Freight">Pacific Freight</option>
                      <option value="West Coast Distributors">West Coast Distributors</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Steamship Line *</label>
                    <select
                      name="steamshipLine"
                      value={formData.steamshipLine}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select SSL</option>
                      <option value="Maersk">Maersk</option>
                      <option value="MSC">MSC</option>
                      <option value="COSCO">COSCO</option>
                      <option value="CMA CGM">CMA CGM</option>
                      <option value="Hapag-Lloyd">Hapag-Lloyd</option>
                      <option value="ONE">ONE</option>
                      <option value="Evergreen">Evergreen</option>
                      <option value="Yang Ming">Yang Ming</option>
                      <option value="HMM">HMM</option>
                      <option value="ZIM">ZIM</option>
                    </select>
                  </div>
                </div>

                {/* Booking & BOL */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Booking Number *</label>
                    <input
                      type="text"
                      name="bookingNumber"
                      value={formData.bookingNumber}
                      onChange={handleInputChange}
                      placeholder="Enter booking number"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Bill of Lading</label>
                    <input
                      type="text"
                      name="billOfLading"
                      value={formData.billOfLading}
                      onChange={handleInputChange}
                      placeholder="Enter B/L number"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* Vessel & Voyage */}
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Vessel Name</label>
                    <input
                      type="text"
                      name="vessel"
                      value={formData.vessel}
                      onChange={handleInputChange}
                      placeholder="Enter vessel name"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Voyage Number</label>
                    <input
                      type="text"
                      name="voyage"
                      value={formData.voyage}
                      onChange={handleInputChange}
                      placeholder="e.g., 123E"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Terminal *</label>
                    <select
                      name="terminal"
                      value={formData.terminal}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select Terminal</option>
                      <option value="APM Terminals">APM Terminals - Pier 400</option>
                      <option value="LBCT">LBCT - Long Beach</option>
                      <option value="TraPac">TraPac - Terminal Island</option>
                      <option value="PCT">PCT - Pacific Container</option>
                      <option value="Fenix Marine">Fenix Marine Services</option>
                      <option value="YTI">YTI - Yusen Terminals</option>
                      <option value="ITS">ITS - Int'l Transportation</option>
                      <option value="SSA Terminals">SSA Terminals</option>
                    </select>
                  </div>
                </div>

                {/* Important Dates */}
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Last Free Day (LFD) {formData.type === 'IMPORT' && '*'}
                    </label>
                    <input
                      type="date"
                      name="lastFreeDay"
                      value={formData.lastFreeDay}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {formData.type === 'EXPORT' ? 'Port Cutoff *' : 'ERD (Earliest Return)'}
                    </label>
                    <input
                      type="date"
                      name={formData.type === 'EXPORT' ? 'portCutoff' : 'earliestReturnDate'}
                      value={formData.type === 'EXPORT' ? formData.portCutoff : formData.earliestReturnDate}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {formData.type === 'EXPORT' ? 'ERD' : 'Port Cutoff'}
                    </label>
                    <input
                      type="date"
                      name={formData.type === 'EXPORT' ? 'earliestReturnDate' : 'portCutoff'}
                      value={formData.type === 'EXPORT' ? formData.earliestReturnDate : formData.portCutoff}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Containers */}
            {step === 2 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Container Details</h3>
                  <button
                    type="button"
                    onClick={addContainer}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm flex items-center gap-2"
                  >
                    <span>+</span> Add Container
                  </button>
                </div>

                {containers.map((container, index) => (
                  <div key={index} className="p-4 border border-gray-200 rounded-xl bg-gray-50">
                    <div className="flex items-center justify-between mb-4">
                      <span className="font-semibold text-gray-700">Container #{index + 1}</span>
                      {containers.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeContainer(index)}
                          className="text-red-500 hover:text-red-700 text-sm"
                        >
                          Remove
                        </button>
                      )}
                    </div>

                    {/* Basic Info */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                      <div className="col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Container Number *</label>
                        <input
                          type="text"
                          value={container.containerNumber}
                          onChange={(e) => handleContainerChange(index, 'containerNumber', e.target.value.toUpperCase())}
                          placeholder="MSCU1234567"
                          className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 font-mono ${
                            containerErrors[index]
                              ? 'border-red-500 bg-red-50'
                              : container.containerNumber.length === 11 && !containerErrors[index]
                              ? 'border-green-500 bg-green-50'
                              : 'border-gray-300'
                          }`}
                          maxLength={11}
                        />
                        {containerErrors[index] && (
                          <p className="mt-1 text-sm text-red-600">{containerErrors[index]}</p>
                        )}
                        {container.containerNumber.length === 11 && !containerErrors[index] && (
                          <p className="mt-1 text-sm text-green-600">Valid container number</p>
                        )}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Size</label>
                        <select
                          value={container.size}
                          onChange={(e) => handleContainerChange(index, 'size', e.target.value)}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="20">20'</option>
                          <option value="40">40'</option>
                          <option value="45">45'</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                        <select
                          value={container.type}
                          onChange={(e) => handleContainerChange(index, 'type', e.target.value)}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="DRY">Dry</option>
                          <option value="HIGH_CUBE">High Cube</option>
                          <option value="REEFER">Reefer</option>
                          <option value="TANK">Tank</option>
                          <option value="FLAT_RACK">Flat Rack</option>
                          <option value="OPEN_TOP">Open Top</option>
                        </select>
                      </div>
                    </div>

                    {/* Weight & Seal */}
                    <div className="grid grid-cols-3 gap-4 mb-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Weight (lbs)</label>
                        <input
                          type="number"
                          value={container.weight}
                          onChange={(e) => handleContainerChange(index, 'weight', e.target.value)}
                          placeholder="40000"
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Seal Number</label>
                        <input
                          type="text"
                          value={container.sealNumber}
                          onChange={(e) => handleContainerChange(index, 'sealNumber', e.target.value)}
                          placeholder="Enter seal #"
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Customs Status</label>
                        <select
                          value={container.customsStatus}
                          onChange={(e) => handleContainerChange(index, 'customsStatus', e.target.value)}
                          className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                            container.customsStatus === 'HOLD' 
                              ? 'border-red-300 bg-red-50' 
                              : container.customsStatus === 'RELEASED'
                              ? 'border-green-300 bg-green-50'
                              : 'border-gray-300'
                          }`}
                        >
                          <option value="PENDING">Pending</option>
                          <option value="HOLD">Hold ⚠️</option>
                          <option value="RELEASED">Released ✓</option>
                        </select>
                      </div>
                    </div>

                    {/* Special Flags */}
                    <div className="border-t pt-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">Special Handling</label>
                      <div className="flex flex-wrap gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={container.isHazmat}
                            onChange={(e) => handleContainerChange(index, 'isHazmat', e.target.checked)}
                            className="w-4 h-4 text-red-600 rounded"
                          />
                          <span className="text-sm">☣️ Hazmat</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={container.isOverweight}
                            onChange={(e) => handleContainerChange(index, 'isOverweight', e.target.checked)}
                            className="w-4 h-4 text-orange-600 rounded"
                          />
                          <span className="text-sm">⚖️ Overweight</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={container.isReefer}
                            onChange={(e) => handleContainerChange(index, 'isReefer', e.target.checked)}
                            className="w-4 h-4 text-blue-600 rounded"
                          />
                          <span className="text-sm">❄️ Reefer</span>
                        </label>
                      </div>

                      {/* Hazmat Details */}
                      {container.isHazmat && (
                        <div className="grid grid-cols-2 gap-4 mt-4 p-3 bg-red-50 rounded-lg border border-red-200">
                          <div>
                            <label className="block text-sm font-medium text-red-700 mb-1">Hazmat Class *</label>
                            <select
                              value={container.hazmatClass}
                              onChange={(e) => handleContainerChange(index, 'hazmatClass', e.target.value)}
                              className="w-full px-4 py-2 border border-red-300 rounded-lg"
                            >
                              <option value="">Select Class</option>
                              <option value="1">Class 1 - Explosives</option>
                              <option value="2">Class 2 - Gases</option>
                              <option value="3">Class 3 - Flammable Liquids</option>
                              <option value="4">Class 4 - Flammable Solids</option>
                              <option value="5">Class 5 - Oxidizers</option>
                              <option value="6">Class 6 - Toxic</option>
                              <option value="7">Class 7 - Radioactive</option>
                              <option value="8">Class 8 - Corrosive</option>
                              <option value="9">Class 9 - Miscellaneous</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-red-700 mb-1">UN Number</label>
                            <input
                              type="text"
                              value={container.hazmatUN}
                              onChange={(e) => handleContainerChange(index, 'hazmatUN', e.target.value)}
                              placeholder="UN1234"
                              className="w-full px-4 py-2 border border-red-300 rounded-lg"
                            />
                          </div>
                        </div>
                      )}

                      {/* Reefer Details */}
                      {container.isReefer && (
                        <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                          <label className="block text-sm font-medium text-blue-700 mb-1">Temperature Setpoint (°F) *</label>
                          <input
                            type="number"
                            value={container.reeferTemp}
                            onChange={(e) => handleContainerChange(index, 'reeferTemp', e.target.value)}
                            placeholder="35"
                            className="w-32 px-4 py-2 border border-blue-300 rounded-lg"
                          />
                        </div>
                      )}
                    </div>

                    {/* Terminal Available Date (Import only) */}
                    {formData.type === 'IMPORT' && (
                      <div className="mt-4">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Terminal Available Date</label>
                        <input
                          type="date"
                          value={container.terminalAvailableDate}
                          onChange={(e) => handleContainerChange(index, 'terminalAvailableDate', e.target.value)}
                          className="w-48 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Step 3: Locations */}
            {step === 3 && (
              <div className="space-y-6">
                {/* Pickup Location */}
                <div className="p-4 border border-gray-200 rounded-xl">
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <span className="w-8 h-8 bg-green-100 text-green-600 rounded-full flex items-center justify-center">📤</span>
                    {formData.type === 'IMPORT' ? 'Pickup (Terminal)' : 'Pickup (Shipper)'}
                  </h3>
                  
                  {formData.type === 'IMPORT' ? (
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <p className="text-gray-600">
                        <span className="font-medium">Terminal:</span> {formData.terminal || 'Not selected'}
                      </p>
                      <p className="text-sm text-gray-500 mt-1">Container will be picked up from the selected terminal</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Location Name *</label>
                        <input
                          type="text"
                          value={pickupLocation.name}
                          onChange={(e) => handleLocationChange('pickup', 'name', e.target.value)}
                          placeholder="Company name or location name"
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Address *</label>
                        <input
                          type="text"
                          value={pickupLocation.address}
                          onChange={(e) => handleLocationChange('pickup', 'address', e.target.value)}
                          placeholder="Street address"
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">City *</label>
                        <input
                          type="text"
                          value={pickupLocation.city}
                          onChange={(e) => handleLocationChange('pickup', 'city', e.target.value)}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                          <input
                            type="text"
                            value={pickupLocation.state}
                            onChange={(e) => handleLocationChange('pickup', 'state', e.target.value)}
                            maxLength={2}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">ZIP</label>
                          <input
                            type="text"
                            value={pickupLocation.zip}
                            onChange={(e) => handleLocationChange('pickup', 'zip', e.target.value)}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Contact Name</label>
                        <input
                          type="text"
                          value={pickupLocation.contactName}
                          onChange={(e) => handleLocationChange('pickup', 'contactName', e.target.value)}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Contact Phone</label>
                        <input
                          type="tel"
                          value={pickupLocation.contactPhone}
                          onChange={(e) => handleLocationChange('pickup', 'contactPhone', e.target.value)}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Delivery Location */}
                <div className="p-4 border border-gray-200 rounded-xl">
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <span className="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center">📥</span>
                    {formData.type === 'IMPORT' ? 'Delivery (Consignee)' : 'Delivery (Terminal)'}
                  </h3>
                  
                  {formData.type === 'EXPORT' ? (
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <p className="text-gray-600">
                        <span className="font-medium">Terminal:</span> {formData.terminal || 'Not selected'}
                      </p>
                      <p className="text-sm text-gray-500 mt-1">Container will be delivered to the selected terminal</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Location Name *</label>
                        <input
                          type="text"
                          value={deliveryLocation.name}
                          onChange={(e) => handleLocationChange('delivery', 'name', e.target.value)}
                          placeholder="Company name or location name"
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Address *</label>
                        <input
                          type="text"
                          value={deliveryLocation.address}
                          onChange={(e) => handleLocationChange('delivery', 'address', e.target.value)}
                          placeholder="Street address"
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">City *</label>
                        <input
                          type="text"
                          value={deliveryLocation.city}
                          onChange={(e) => handleLocationChange('delivery', 'city', e.target.value)}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                          <input
                            type="text"
                            value={deliveryLocation.state}
                            onChange={(e) => handleLocationChange('delivery', 'state', e.target.value)}
                            maxLength={2}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">ZIP</label>
                          <input
                            type="text"
                            value={deliveryLocation.zip}
                            onChange={(e) => handleLocationChange('delivery', 'zip', e.target.value)}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Contact Name</label>
                        <input
                          type="text"
                          value={deliveryLocation.contactName}
                          onChange={(e) => handleLocationChange('delivery', 'contactName', e.target.value)}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Contact Phone</label>
                        <input
                          type="tel"
                          value={deliveryLocation.contactPhone}
                          onChange={(e) => handleLocationChange('delivery', 'contactPhone', e.target.value)}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={deliveryLocation.appointmentRequired}
                            onChange={(e) => handleLocationChange('delivery', 'appointmentRequired', e.target.checked)}
                            className="w-4 h-4 text-blue-600 rounded"
                          />
                          <span className="text-sm font-medium">Appointment Required</span>
                        </label>
                        {deliveryLocation.appointmentRequired && (
                          <div className="grid grid-cols-2 gap-4 mt-2">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Appointment Date</label>
                              <input
                                type="date"
                                value={deliveryLocation.appointmentDate}
                                onChange={(e) => handleLocationChange('delivery', 'appointmentDate', e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Appointment Time</label>
                              <input
                                type="time"
                                value={deliveryLocation.appointmentTime}
                                onChange={(e) => handleLocationChange('delivery', 'appointmentTime', e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Step 4: Trip Details */}
            {step === 4 && (
              <div className="space-y-6">
                {/* Trip Type Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">Trip Type *</label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {(Object.keys(TRIP_TYPE_INFO) as TripType[])
                      .filter(type => {
                        // Filter trip types based on shipment type
                        if (formData.type === 'IMPORT') {
                          return ['LIVE_UNLOAD', 'DROP_HOOK_SAME', 'DROP_HOOK_DIFF', 'DROP_ONLY', 'PRE_PULL', 'STREET_TURN', 'DUAL_TRANSACTION'].includes(type);
                        } else {
                          return ['LIVE_LOAD', 'DROP_HOOK_SAME', 'DROP_HOOK_DIFF', 'EMPTY_PICKUP', 'STREET_TURN', 'DUAL_TRANSACTION'].includes(type);
                        }
                      })
                      .map((type) => {
                        const info = TRIP_TYPE_INFO[type];
                        return (
                          <button
                            key={type}
                            type="button"
                            onClick={() => setFormData(prev => ({ ...prev, tripType: type }))}
                            className={`p-3 rounded-xl border-2 text-left transition ${
                              formData.tripType === type
                                ? 'border-blue-500 bg-blue-50'
                                : 'border-gray-200 hover:border-gray-300'
                            }`}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xl">{info.icon}</span>
                              <span className="font-medium text-sm">{info.label}</span>
                            </div>
                            <p className="text-xs text-gray-500">{info.description}</p>
                          </button>
                        );
                      })}
                  </div>
                </div>

                {/* Chassis Information */}
                <div className="p-4 border border-gray-200 rounded-xl">
                  <h3 className="text-lg font-semibold mb-4">Chassis Information</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="flex items-center gap-2 cursor-pointer mb-3">
                        <input
                          type="checkbox"
                          checked={chassisInfo.required}
                          onChange={(e) => setChassisInfo(prev => ({ ...prev, required: e.target.checked }))}
                          className="w-4 h-4 text-blue-600 rounded"
                        />
                        <span className="text-sm font-medium">Chassis Required</span>
                      </label>
                    </div>
                    {chassisInfo.required && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Chassis Pool</label>
                          <select
                            value={chassisInfo.pool}
                            onChange={(e) => setChassisInfo(prev => ({ ...prev, pool: e.target.value }))}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="DCLI">DCLI</option>
                            <option value="TRAC">TRAC</option>
                            <option value="FLEXI">Flexi-Van</option>
                            <option value="COMPANY">Company Owned</option>
                            <option value="OTHER">Other</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Preferred Size</label>
                          <select
                            value={chassisInfo.preferredSize}
                            onChange={(e) => setChassisInfo(prev => ({ ...prev, preferredSize: e.target.value }))}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="20">20'</option>
                            <option value="40">40'</option>
                            <option value="45">45'</option>
                            <option value="COMBO">Combo (Extendable)</option>
                          </select>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Order Generation */}
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.generateOrders}
                      onChange={(e) => setFormData(prev => ({ ...prev, generateOrders: e.target.checked }))}
                      className="w-5 h-5 text-blue-600 rounded"
                    />
                    <div>
                      <span className="font-medium text-blue-900">Auto-generate delivery orders</span>
                      <p className="text-sm text-blue-700">Create {containers.length} order(s) from this shipment automatically</p>
                    </div>
                  </label>
                </div>

                {/* Special Instructions */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Special Instructions</label>
                  <textarea
                    name="specialInstructions"
                    value={formData.specialInstructions}
                    onChange={handleInputChange}
                    rows={3}
                    placeholder="Any special handling instructions, driver notes, etc."
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            )}

            {/* Step 5: Review */}
            {step === 5 && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-6">
                  {/* Shipment Summary */}
                  <div className="space-y-4">
                    <h4 className="font-semibold text-gray-800 border-b pb-2">Shipment Details</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Type:</span>
                        <span className={`font-medium px-2 py-0.5 rounded ${formData.type === 'IMPORT' ? 'bg-purple-100 text-purple-800' : 'bg-orange-100 text-orange-800'}`}>
                          {formData.type}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Customer:</span>
                        <span className="font-medium">{formData.customer || '-'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Steamship Line:</span>
                        <span className="font-medium">{formData.steamshipLine || '-'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Booking #:</span>
                        <span className="font-mono">{formData.bookingNumber || '-'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">B/L:</span>
                        <span className="font-mono">{formData.billOfLading || '-'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Vessel / Voyage:</span>
                        <span className="font-medium">{formData.vessel || '-'} / {formData.voyage || '-'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Terminal:</span>
                        <span className="font-medium">{formData.terminal || '-'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Last Free Day:</span>
                        <span className="font-medium text-red-600">{formData.lastFreeDay || '-'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Trip Type:</span>
                        <span className={`font-medium px-2 py-0.5 rounded ${TRIP_TYPE_INFO[formData.tripType].color}`}>
                          {TRIP_TYPE_INFO[formData.tripType].icon} {TRIP_TYPE_INFO[formData.tripType].label}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Containers Summary */}
                  <div className="space-y-4">
                    <h4 className="font-semibold text-gray-800 border-b pb-2">Containers ({containers.length})</h4>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {containers.map((container, index) => (
                        <div key={index} className="p-3 bg-gray-50 rounded-lg text-sm">
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-semibold text-blue-600">
                              {container.containerNumber || 'No Number'}
                            </span>
                            <div className="flex gap-1">
                              {container.isHazmat && <span title="Hazmat">☣️</span>}
                              {container.isOverweight && <span title="Overweight">⚖️</span>}
                              {container.isReefer && <span title="Reefer">❄️</span>}
                            </div>
                          </div>
                          <div className="text-gray-500 mt-1">
                            {container.size}' {container.type} • {container.weight || '0'} lbs
                          </div>
                          <div className={`text-xs mt-1 ${
                            container.customsStatus === 'HOLD' ? 'text-red-600' : 
                            container.customsStatus === 'RELEASED' ? 'text-green-600' : 'text-yellow-600'
                          }`}>
                            Customs: {container.customsStatus}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Route Summary */}
                <div className="p-4 bg-gray-50 rounded-xl">
                  <h4 className="font-semibold text-gray-800 mb-3">Route</h4>
                  <div className="flex items-center gap-4">
                    <div className="flex-1 p-3 bg-white rounded-lg border">
                      <div className="text-xs text-gray-500 mb-1">PICKUP</div>
                      <div className="font-medium">
                        {formData.type === 'IMPORT' ? formData.terminal : (pickupLocation.name || 'Not specified')}
                      </div>
                      {formData.type === 'EXPORT' && pickupLocation.city && (
                        <div className="text-sm text-gray-500">{pickupLocation.city}, {pickupLocation.state}</div>
                      )}
                    </div>
                    <div className="text-2xl text-gray-400">→</div>
                    <div className="flex-1 p-3 bg-white rounded-lg border">
                      <div className="text-xs text-gray-500 mb-1">DELIVERY</div>
                      <div className="font-medium">
                        {formData.type === 'EXPORT' ? formData.terminal : (deliveryLocation.name || 'Not specified')}
                      </div>
                      {formData.type === 'IMPORT' && deliveryLocation.city && (
                        <div className="text-sm text-gray-500">{deliveryLocation.city}, {deliveryLocation.state}</div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Order Generation Notice */}
                {formData.generateOrders && (
                  <div className="p-4 bg-green-50 border border-green-200 rounded-xl">
                    <div className="flex items-center gap-2 text-green-800">
                      <span className="text-xl">✓</span>
                      <span className="font-medium">{containers.length} delivery order(s) will be created automatically</span>
                    </div>
                  </div>
                )}

                {formData.specialInstructions && (
                  <div>
                    <h4 className="font-semibold text-gray-800 border-b pb-2">Special Instructions</h4>
                    <p className="mt-2 text-sm text-gray-600">{formData.specialInstructions}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
            {step > 0 && stepErrors.length > 0 && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm font-medium text-red-800 mb-1">Please fix the following errors:</p>
                <ul className="text-sm text-red-600 list-disc list-inside">
                  {stepErrors.map((error, i) => (
                    <li key={i}>{error}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* PDF extraction info banner */}
            {step > 0 && entryMethod === 'pdf' && pdfExtractedData && (
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-blue-600" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                  <span className="text-sm text-blue-800">
                    Data extracted from PDF ({Math.round((pdfExtractedData.confidence || 0) * 100)}% confidence). Please review and correct any fields.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setStep(0)}
                  className="text-xs text-blue-600 hover:text-blue-800 underline"
                >
                  Upload different file
                </button>
              </div>
            )}

            <div className="flex justify-between">
              <button
                type="button"
                onClick={() => {
                  setStepErrors([]);
                  if (step === 0) {
                    onClose();
                  } else if (step === 1) {
                    setStep(0);
                    setEntryMethod(null);
                  } else {
                    setStep(step - 1);
                  }
                }}
                className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100"
              >
                {step === 0 ? 'Cancel' : step === 1 ? 'Back to Start' : 'Back'}
              </button>
              {step > 0 && (
                <button
                  type="button"
                  onClick={() => step < 5 ? handleNextStep() : handleSubmit()}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  {step < 5 ? 'Continue' : 'Create Shipment'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}