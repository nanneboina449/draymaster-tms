'use client';

import { useState } from 'react';
import DispatchBoard from '@/components/dispatch/DispatchBoard';
import OrderEntryForm from '@/components/dispatch/OrderEntryForm';
import { AlertBanner, NotificationBell } from '@/components/notifications/NotificationCenter';

export default function DispatchPage() {
  const [showOrderForm, setShowOrderForm] = useState(false);

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      {/* Top Header */}
      <header className="bg-white border-b px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Dispatch Center</h1>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setShowOrderForm(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Order
          </button>
          <NotificationBell />
        </div>
      </header>

      {/* Alert Banner for critical notifications */}
      <div className="px-6 pt-4">
        <AlertBanner />
      </div>

      {/* Main Dispatch Board */}
      <main className="flex-1 overflow-hidden">
        <DispatchBoard />
      </main>

      {/* Order Entry Modal */}
      {showOrderForm && (
        <OrderEntryForm
          onClose={() => setShowOrderForm(false)}
          onSuccess={() => {
            setShowOrderForm(false);
          }}
        />
      )}
    </div>
  );
}
