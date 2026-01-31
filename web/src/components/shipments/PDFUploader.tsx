'use client';

import { useState, useRef, useCallback } from 'react';

export interface ExtractedLoadData {
  // Shipment Info
  type?: 'IMPORT' | 'EXPORT';
  customerName?: string;
  steamshipLine?: string;
  bookingNumber?: string;
  billOfLading?: string;
  vessel?: string;
  voyage?: string;
  terminalName?: string;
  lastFreeDay?: string;
  portCutoff?: string;
  earliestReturnDate?: string;

  // Delivery/Pickup Location
  deliveryLocationName?: string;
  deliveryAddress?: string;
  deliveryCity?: string;
  deliveryState?: string;
  deliveryZip?: string;
  deliveryContactName?: string;
  deliveryContactPhone?: string;

  pickupLocationName?: string;
  pickupAddress?: string;
  pickupCity?: string;
  pickupState?: string;
  pickupZip?: string;
  pickupContactName?: string;
  pickupContactPhone?: string;

  // Containers
  containers?: {
    containerNumber?: string;
    size?: '20' | '40' | '45';
    type?: string;
    weightLbs?: number;
    sealNumber?: string;
    isHazmat?: boolean;
    hazmatClass?: string;
    hazmatUnNumber?: string;
    isOverweight?: boolean;
    isReefer?: boolean;
    reeferTemp?: number;
  }[];

  // Trip Details
  tripType?: string;
  chassisRequired?: boolean;
  chassisPool?: string;
  specialInstructions?: string;

  // Raw text for reference
  rawText?: string;
  confidence?: number;
}

interface PDFUploaderProps {
  onExtracted: (data: ExtractedLoadData) => void;
  onError?: (error: string) => void;
  className?: string;
}

export default function PDFUploader({ onExtracted, onError, className = '' }: PDFUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (file: File) => {
    if (file.type !== 'application/pdf') {
      onError?.('Please upload a PDF file');
      return;
    }

    if (file.size > 10 * 1024 * 1024) { // 10MB limit
      onError?.('File size must be less than 10MB');
      return;
    }

    setFileName(file.name);
    setIsProcessing(true);
    setProgress(10);

    try {
      const formData = new FormData();
      formData.append('pdf', file);

      setProgress(30);

      const response = await fetch('/api/parse-pdf', {
        method: 'POST',
        body: formData,
      });

      setProgress(70);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to process PDF');
      }

      const data: ExtractedLoadData = await response.json();

      setProgress(100);

      // Small delay to show 100% completion
      setTimeout(() => {
        setIsProcessing(false);
        setProgress(0);
        onExtracted(data);
      }, 500);

    } catch (error) {
      setIsProcessing(false);
      setProgress(0);
      setFileName(null);
      onError?.(error instanceof Error ? error.message : 'Failed to process PDF');
    }
  }, [onExtracted, onError]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      processFile(file);
    }
  }, [processFile]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  }, [processFile]);

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className={className}>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        onChange={handleFileSelect}
        className="hidden"
      />

      <div
        onClick={!isProcessing ? handleClick : undefined}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          relative border-2 border-dashed rounded-xl p-8 text-center transition-all
          ${isDragging
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
          }
          ${isProcessing ? 'cursor-wait' : 'cursor-pointer'}
        `}
      >
        {isProcessing ? (
          <div className="space-y-4">
            <div className="w-16 h-16 mx-auto">
              <svg className="animate-spin text-blue-600" viewBox="0 0 24 24" fill="none">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">Processing {fileName}</p>
              <p className="text-xs text-gray-500 mt-1">Extracting load information...</p>
            </div>
            <div className="w-full max-w-xs mx-auto">
              <div className="bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">{progress}%</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="w-16 h-16 mx-auto text-gray-400">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12l-3-3m0 0l-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            </div>
            <div>
              <p className="text-base font-medium text-gray-900">
                Drop a PDF here or click to upload
              </p>
              <p className="text-sm text-gray-500 mt-1">
                Rate confirmation, BOL, or booking document
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <span>AI-powered extraction</span>
              <span className="mx-1">|</span>
              <span>Max 10MB</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
