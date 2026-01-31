'use client';

import { useState } from 'react';

// Workflow states configuration
const LOAD_STATES = [
  {
    status: 'PENDING',
    label: 'Pending',
    color: 'bg-gray-100 text-gray-800',
    description: 'Load created, awaiting prerequisites',
    autoAdvance: {
      to: 'READY',
      conditions: [
        'Customs status is RELEASED',
        'Terminal available date is today or earlier',
        'Container is available at terminal'
      ]
    }
  },
  {
    status: 'READY',
    label: 'Ready',
    color: 'bg-cyan-100 text-cyan-800',
    description: 'All prerequisites met, ready for dispatch',
    autoAdvance: null,
    manualAction: 'Click "Dispatch" button and assign driver'
  },
  {
    status: 'DISPATCHED',
    label: 'Dispatched',
    color: 'bg-purple-100 text-purple-800',
    description: 'Driver assigned, trip created',
    autoAdvance: {
      to: 'IN_PROGRESS',
      conditions: [
        'Driver picks up container (via driver app)',
        'Or manual update by dispatcher'
      ]
    }
  },
  {
    status: 'IN_PROGRESS',
    label: 'In Progress',
    color: 'bg-yellow-100 text-yellow-800',
    description: 'Container picked up, in transit',
    autoAdvance: {
      to: 'DELIVERED',
      conditions: [
        'Driver arrives at delivery location (via GPS)',
        'Or manual update by dispatcher'
      ]
    }
  },
  {
    status: 'DELIVERED',
    label: 'Delivered',
    color: 'bg-blue-100 text-blue-800',
    description: 'Container delivered to customer',
    autoAdvance: {
      to: 'COMPLETED',
      conditions: [
        'POD (Proof of Delivery) uploaded',
        'Or manual completion by dispatcher'
      ]
    }
  },
  {
    status: 'COMPLETED',
    label: 'Completed',
    color: 'bg-green-100 text-green-800',
    description: 'All done, ready for billing',
    autoAdvance: null
  }
];

const CONTAINER_LIFECYCLE = [
  { status: 'BOOKED', label: 'Booked', description: 'Container on booking, not yet at terminal' },
  { status: 'AVAILABLE', label: 'Available', description: 'Available at terminal for pickup' },
  { status: 'PICKED_UP', label: 'Picked Up', description: 'Container picked up, in transit' },
  { status: 'DELIVERED', label: 'Delivered', description: 'Delivered to customer (loaded)' },
  { status: 'DROPPED', label: 'Dropped', description: 'Dropped at customer location' },
  { status: 'EMPTY_PICKED', label: 'Empty Picked', description: 'Empty container picked up' },
  { status: 'RETURNED', label: 'Returned', description: 'Empty returned to terminal' },
  { status: 'COMPLETED', label: 'Completed', description: 'All movements complete' },
];

const AUTOMATION_RULES = [
  {
    id: 'auto_ready',
    name: 'Auto-Ready When Available',
    description: 'Automatically move loads to READY when customs is released and container is available',
    enabled: true,
    conditions: ['customs_status = RELEASED', 'terminal_available_date <= TODAY'],
    action: 'Set load status to READY'
  },
  {
    id: 'auto_notify_lfd',
    name: 'LFD Warning Notifications',
    description: 'Send alerts when Last Free Day is approaching',
    enabled: true,
    conditions: ['LFD is within 2 days', 'Load not yet delivered'],
    action: 'Send notification to dispatcher'
  },
  {
    id: 'auto_complete_shipment',
    name: 'Auto-Complete Shipment',
    description: 'Automatically mark shipment as COMPLETED when all orders are done',
    enabled: true,
    conditions: ['All orders for shipment are COMPLETED'],
    action: 'Set shipment status to COMPLETED'
  },
  {
    id: 'auto_container_lifecycle',
    name: 'Container Lifecycle Sync',
    description: 'Automatically update container lifecycle based on order status',
    enabled: true,
    conditions: ['Order status changes'],
    action: 'Update container lifecycle_status'
  }
];

export default function WorkflowSettingsPage() {
  const [rules, setRules] = useState(AUTOMATION_RULES);
  const [activeTab, setActiveTab] = useState<'states' | 'rules' | 'lifecycle'>('states');

  const toggleRule = (ruleId: string) => {
    setRules(prev => prev.map(rule =>
      rule.id === ruleId ? { ...rule, enabled: !rule.enabled } : rule
    ));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dispatch Workflow</h1>
        <p className="text-gray-500 mt-1">Configure load states, automation rules, and workflow settings</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-8">
          <button
            onClick={() => setActiveTab('states')}
            className={`py-3 border-b-2 font-medium text-sm ${
              activeTab === 'states'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Load States
          </button>
          <button
            onClick={() => setActiveTab('lifecycle')}
            className={`py-3 border-b-2 font-medium text-sm ${
              activeTab === 'lifecycle'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Container Lifecycle
          </button>
          <button
            onClick={() => setActiveTab('rules')}
            className={`py-3 border-b-2 font-medium text-sm ${
              activeTab === 'rules'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Automation Rules
          </button>
        </nav>
      </div>

      {/* Load States Tab */}
      {activeTab === 'states' && (
        <div className="space-y-6">
          {/* Visual Flow */}
          <div className="bg-white rounded-xl shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Dispatch Flow</h2>
            <div className="flex items-center justify-between overflow-x-auto pb-4">
              {LOAD_STATES.map((state, index) => (
                <div key={state.status} className="flex items-center">
                  <div className="flex flex-col items-center min-w-[120px]">
                    <div className={`px-4 py-2 rounded-lg font-medium text-sm ${state.color}`}>
                      {state.label}
                    </div>
                    <div className="text-xs text-gray-500 mt-2 text-center max-w-[120px]">
                      {state.description}
                    </div>
                  </div>
                  {index < LOAD_STATES.length - 1 && (
                    <div className="flex items-center mx-2">
                      <div className="w-8 h-0.5 bg-gray-300"></div>
                      <div className="text-gray-400">→</div>
                      <div className="w-8 h-0.5 bg-gray-300"></div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* State Details */}
          <div className="bg-white rounded-xl shadow overflow-hidden">
            <div className="px-6 py-4 border-b">
              <h2 className="text-lg font-semibold">State Definitions</h2>
            </div>
            <div className="divide-y">
              {LOAD_STATES.map((state) => (
                <div key={state.status} className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-4">
                      <span className={`px-3 py-1 rounded-lg font-medium ${state.color}`}>
                        {state.label}
                      </span>
                      <div>
                        <p className="text-gray-900 font-medium">{state.description}</p>
                        <p className="text-sm text-gray-500 font-mono">{state.status}</p>
                      </div>
                    </div>
                  </div>

                  {state.autoAdvance && (
                    <div className="mt-4 ml-4 p-4 bg-blue-50 rounded-lg">
                      <div className="text-sm font-medium text-blue-800">
                        Auto-advances to: <span className="font-bold">{state.autoAdvance.to}</span>
                      </div>
                      <div className="text-sm text-blue-600 mt-2">
                        When:
                        <ul className="list-disc ml-5 mt-1">
                          {state.autoAdvance.conditions.map((cond, i) => (
                            <li key={i}>{cond}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}

                  {state.manualAction && (
                    <div className="mt-4 ml-4 p-4 bg-yellow-50 rounded-lg">
                      <div className="text-sm font-medium text-yellow-800">
                        Manual Action Required:
                      </div>
                      <div className="text-sm text-yellow-700 mt-1">
                        {state.manualAction}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Quick Reference */}
          <div className="bg-white rounded-xl shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Quick Reference</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="font-medium text-gray-900">PENDING → READY</div>
                <div className="text-sm text-gray-500 mt-1">
                  Automatic when customs released + available at terminal
                </div>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="font-medium text-gray-900">READY → DISPATCHED</div>
                <div className="text-sm text-gray-500 mt-1">
                  Manual: Click Dispatch + assign driver
                </div>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="font-medium text-gray-900">DISPATCHED → IN_PROGRESS</div>
                <div className="text-sm text-gray-500 mt-1">
                  Auto when driver picks up (or manual)
                </div>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="font-medium text-gray-900">IN_PROGRESS → DELIVERED</div>
                <div className="text-sm text-gray-500 mt-1">
                  Auto when driver arrives (or manual)
                </div>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="font-medium text-gray-900">DELIVERED → COMPLETED</div>
                <div className="text-sm text-gray-500 mt-1">
                  Auto when POD uploaded (or manual)
                </div>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="font-medium text-gray-900">HOLD</div>
                <div className="text-sm text-gray-500 mt-1">
                  Manual: Issues prevent dispatch
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Container Lifecycle Tab */}
      {activeTab === 'lifecycle' && (
        <div className="space-y-6">
          {/* Visual Flow */}
          <div className="bg-white rounded-xl shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Container Lifecycle (Import)</h2>
            <div className="flex items-center flex-wrap gap-2">
              {['BOOKED', 'AVAILABLE', 'PICKED_UP', 'DELIVERED', 'DROPPED', 'EMPTY_PICKED', 'RETURNED', 'COMPLETED'].map((status, i, arr) => (
                <div key={status} className="flex items-center">
                  <span className="px-3 py-1 bg-gray-100 rounded text-sm font-medium">{status}</span>
                  {i < arr.length - 1 && <span className="mx-2 text-gray-400">→</span>}
                </div>
              ))}
            </div>
            <p className="text-sm text-gray-500 mt-4">
              For DROP trips: Container goes through DROPPED state before empty return.
              For LIVE trips: Container goes directly from DELIVERED to EMPTY return.
            </p>
          </div>

          {/* Lifecycle States */}
          <div className="bg-white rounded-xl shadow overflow-hidden">
            <div className="px-6 py-4 border-b">
              <h2 className="text-lg font-semibold">Lifecycle States</h2>
            </div>
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Label</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {CONTAINER_LIFECYCLE.map((state) => (
                  <tr key={state.status}>
                    <td className="px-6 py-4 font-mono text-sm">{state.status}</td>
                    <td className="px-6 py-4 font-medium">{state.label}</td>
                    <td className="px-6 py-4 text-gray-600">{state.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Move Type Flows */}
          <div className="bg-white rounded-xl shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Move Type Flows</h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="p-4 border rounded-lg">
                <h3 className="font-medium text-blue-600 mb-2">Import (Live Unload)</h3>
                <div className="text-sm text-gray-600 space-y-1">
                  <p>1. IMPORT_DELIVERY: Terminal → Customer</p>
                  <p className="text-gray-400">Container stays on chassis, driver waits</p>
                </div>
              </div>
              <div className="p-4 border rounded-lg">
                <h3 className="font-medium text-purple-600 mb-2">Import (Drop)</h3>
                <div className="text-sm text-gray-600 space-y-1">
                  <p>1. IMPORT_DELIVERY: Terminal → Customer (drop)</p>
                  <p>2. EMPTY_RETURN: Customer → Terminal</p>
                  <p className="text-gray-400">Two separate trips</p>
                </div>
              </div>
              <div className="p-4 border rounded-lg">
                <h3 className="font-medium text-orange-600 mb-2">Export</h3>
                <div className="text-sm text-gray-600 space-y-1">
                  <p>1. EMPTY_PICKUP: Terminal → Customer (drop empty)</p>
                  <p>2. EXPORT_PICKUP: Customer → Terminal (loaded)</p>
                  <p className="text-gray-400">Two trips for export flow</p>
                </div>
              </div>
              <div className="p-4 border rounded-lg">
                <h3 className="font-medium text-green-600 mb-2">Street Turn</h3>
                <div className="text-sm text-gray-600 space-y-1">
                  <p>Import container reused for export</p>
                  <p className="text-gray-400">Skips empty return, goes directly to export customer</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Automation Rules Tab */}
      {activeTab === 'rules' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow overflow-hidden">
            <div className="px-6 py-4 border-b flex justify-between items-center">
              <h2 className="text-lg font-semibold">Automation Rules</h2>
              <span className="text-sm text-gray-500">
                {rules.filter(r => r.enabled).length} of {rules.length} enabled
              </span>
            </div>
            <div className="divide-y">
              {rules.map((rule) => (
                <div key={rule.id} className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h3 className="font-medium text-gray-900">{rule.name}</h3>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          rule.enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {rule.enabled ? 'Enabled' : 'Disabled'}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 mt-1">{rule.description}</p>

                      <div className="mt-4 grid md:grid-cols-2 gap-4">
                        <div className="p-3 bg-gray-50 rounded-lg">
                          <div className="text-xs font-medium text-gray-500 uppercase mb-2">Conditions</div>
                          <ul className="text-sm text-gray-700 space-y-1">
                            {rule.conditions.map((cond, i) => (
                              <li key={i} className="flex items-center gap-2">
                                <span className="text-blue-500">•</span>
                                {cond}
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div className="p-3 bg-gray-50 rounded-lg">
                          <div className="text-xs font-medium text-gray-500 uppercase mb-2">Action</div>
                          <p className="text-sm text-gray-700">{rule.action}</p>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => toggleRule(rule.id)}
                      className={`ml-4 relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                        rule.enabled ? 'bg-blue-600' : 'bg-gray-200'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition ${
                          rule.enabled ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Implementation Note */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6">
            <h3 className="font-medium text-yellow-800 mb-2">Implementation Note</h3>
            <p className="text-sm text-yellow-700">
              These automation rules are configured via database triggers (see migrations 003 and 004).
              Toggle switches on this page are for reference only - actual automation is handled by PostgreSQL triggers.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
