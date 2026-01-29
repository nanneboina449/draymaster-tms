'use client';

import { useState, useEffect } from 'react';
import { 
  DispatchBoardItem, LoadStatus, DISPATCH_COLUMNS, 
  LOAD_STATUS_LABELS, TERMINAL_LABELS 
} from '@/lib/types';
import { getDispatchBoard, updateLoadStatus } from '@/lib/supabase';
import LoadDetailPanel from './LoadDetailPanel';

// Status to column mapping
const STATUS_COLUMNS: Record<string, LoadStatus[]> = {
  TRACKING: ['TRACKING'],
  AVAILABLE: ['AVAILABLE'],
  HOLD: ['HOLD'],
  NEEDS_APPT: ['APPOINTMENT_NEEDED'],
  READY: ['READY_FOR_DISPATCH'],
  DISPATCHED: ['DISPATCHED', 'IN_TRANSIT', 'AT_PICKUP', 'AT_DELIVERY', 'RETURNING'],
  IN_YARD: ['IN_YARD'],
  COMPLETED: ['COMPLETED'],
};

const COLUMN_CONFIG = [
  { id: 'TRACKING', label: 'Tracking', color: 'gray', statuses: ['TRACKING'] },
  { id: 'AVAILABLE', label: 'Available', color: 'green', statuses: ['AVAILABLE'] },
  { id: 'HOLD', label: 'On Hold', color: 'yellow', statuses: ['HOLD'] },
  { id: 'NEEDS_APPT', label: 'Needs Appt', color: 'orange', statuses: ['APPOINTMENT_NEEDED'] },
  { id: 'READY', label: 'Ready', color: 'blue', statuses: ['READY_FOR_DISPATCH'] },
  { id: 'DISPATCHED', label: 'In Progress', color: 'indigo', statuses: ['DISPATCHED', 'IN_TRANSIT', 'AT_PICKUP', 'AT_DELIVERY', 'RETURNING'] },
  { id: 'IN_YARD', label: 'In Yard', color: 'purple', statuses: ['IN_YARD'] },
  { id: 'COMPLETED', label: 'Completed', color: 'emerald', statuses: ['COMPLETED'] },
];

const COLUMN_COLORS: Record<string, string> = {
  gray: 'bg-gray-100 border-gray-300',
  green: 'bg-green-50 border-green-300',
  yellow: 'bg-yellow-50 border-yellow-300',
  orange: 'bg-orange-50 border-orange-300',
  blue: 'bg-blue-50 border-blue-300',
  indigo: 'bg-indigo-50 border-indigo-300',
  purple: 'bg-purple-50 border-purple-300',
  emerald: 'bg-emerald-50 border-emerald-300',
};

const HEADER_COLORS: Record<string, string> = {
  gray: 'bg-gray-500',
  green: 'bg-green-500',
  yellow: 'bg-yellow-500',
  orange: 'bg-orange-500',
  blue: 'bg-blue-500',
  indigo: 'bg-indigo-500',
  purple: 'bg-purple-500',
  emerald: 'bg-emerald-500',
};

export default function DispatchBoard() {
  const [loads, setLoads] = useState<DispatchBoardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLoad, setSelectedLoad] = useState<string | null>(null);
  const [filter, setFilter] = useState<'ALL' | 'IMPORT' | 'EXPORT' | 'URGENT'>('ALL');
  const [draggedItem, setDraggedItem] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const data = await getDispatchBoard();
    setLoads(data);
    setLoading(false);
  };

  // Group loads by column
  const getColumnLoads = (columnId: string): DispatchBoardItem[] => {
    const column = COLUMN_CONFIG.find(c => c.id === columnId);
    if (!column) return [];

    let filtered = loads.filter(load => column.statuses.includes(load.status));

    // Apply filter
    if (filter === 'URGENT') {
      filtered = filtered.filter(load => 
        load.lfd_urgency === 'OVERDUE' || load.lfd_urgency === 'TOMORROW'
      );
    }

    return filtered;
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, loadId: string) => {
    setDraggedItem(loadId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent, targetColumnId: string) => {
    e.preventDefault();
    if (!draggedItem) return;

    const column = COLUMN_CONFIG.find(c => c.id === targetColumnId);
    if (!column || column.statuses.length === 0) return;

    // Get the primary status for this column
    const newStatus = column.statuses[0] as LoadStatus;

    // Update status
    const success = await updateLoadStatus(draggedItem, newStatus);
    if (success) {
      await loadData();
    }

    setDraggedItem(null);
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
  };

  // Get urgency badge
  const getUrgencyBadge = (load: DispatchBoardItem) => {
    switch (load.lfd_urgency) {
      case 'OVERDUE':
        return <span className="px-2 py-0.5 text-xs font-bold bg-red-600 text-white rounded">OVERDUE</span>;
      case 'TOMORROW':
        return <span className="px-2 py-0.5 text-xs font-bold bg-red-500 text-white rounded">LFD TOMORROW</span>;
      case 'SOON':
        return <span className="px-2 py-0.5 text-xs font-bold bg-orange-500 text-white rounded">LFD {load.days_until_lfd}d</span>;
      default:
        return null;
    }
  };

  // Get hold badges
  const getHoldBadges = (load: DispatchBoardItem) => {
    const holds = [];
    if (load.hold_customs) holds.push('CUSTOMS');
    if (load.hold_freight) holds.push('FREIGHT');
    if (load.hold_usda) holds.push('USDA');
    if (load.hold_tmf) holds.push('TMF');
    
    if (holds.length === 0) return null;
    
    return (
      <div className="flex flex-wrap gap-1 mt-1">
        {holds.map(hold => (
          <span key={hold} className="px-1.5 py-0.5 text-xs bg-red-100 text-red-700 rounded">
            ⛔ {hold}
          </span>
        ))}
      </div>
    );
  };

  // Count urgent items
  const urgentCount = loads.filter(l => 
    l.lfd_urgency === 'OVERDUE' || l.lfd_urgency === 'TOMORROW'
  ).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Dispatch Board</h1>
            <p className="text-sm text-gray-500">
              {new Date().toLocaleDateString('en-US', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}
            </p>
          </div>
          <div className="flex items-center gap-4">
            {/* Filter buttons */}
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setFilter('ALL')}
                className={`px-3 py-1.5 text-sm rounded-md transition ${
                  filter === 'ALL' 
                    ? 'bg-white shadow text-gray-900' 
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                All ({loads.length})
              </button>
              <button
                onClick={() => setFilter('URGENT')}
                className={`px-3 py-1.5 text-sm rounded-md transition flex items-center gap-1 ${
                  filter === 'URGENT' 
                    ? 'bg-red-500 shadow text-white' 
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                🚨 Urgent ({urgentCount})
              </button>
            </div>
            
            {/* Refresh button */}
            <button
              onClick={loadData}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto p-4 bg-gray-100">
        <div className="flex gap-4 h-full min-w-max">
          {COLUMN_CONFIG.map(column => {
            const columnLoads = getColumnLoads(column.id);
            
            return (
              <div
                key={column.id}
                className={`w-80 flex flex-col rounded-lg border-2 ${COLUMN_COLORS[column.color]} overflow-hidden`}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, column.id)}
              >
                {/* Column Header */}
                <div className={`${HEADER_COLORS[column.color]} px-4 py-3 text-white`}>
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">{column.label}</h3>
                    <span className="px-2 py-0.5 bg-white/20 rounded-full text-sm">
                      {columnLoads.length}
                    </span>
                  </div>
                </div>

                {/* Column Content */}
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {columnLoads.length === 0 ? (
                    <div className="text-center py-8 text-gray-400 text-sm">
                      No loads
                    </div>
                  ) : (
                    columnLoads.map(load => (
                      <div
                        key={load.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, load.id)}
                        onDragEnd={handleDragEnd}
                        onClick={() => setSelectedLoad(load.id)}
                        className={`bg-white rounded-lg shadow-sm border p-3 cursor-pointer hover:shadow-md transition ${
                          draggedItem === load.id ? 'opacity-50' : ''
                        } ${selectedLoad === load.id ? 'ring-2 ring-blue-500' : ''}`}
                      >
                        {/* Container number and move type */}
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-mono font-bold text-sm text-gray-900">
                            {load.container_number || load.load_number}
                          </span>
                          <span className={`px-2 py-0.5 text-xs rounded ${
                            load.move_type === 'LIVE' ? 'bg-blue-100 text-blue-700' :
                            load.move_type === 'DROP' ? 'bg-purple-100 text-purple-700' :
                            load.move_type === 'PREPULL' ? 'bg-orange-100 text-orange-700' :
                            load.move_type === 'STREET_TURN' ? 'bg-green-100 text-green-700' :
                            'bg-gray-100 text-gray-700'
                          }`}>
                            {load.move_type}
                          </span>
                        </div>

                        {/* Customer */}
                        <div className="text-sm text-gray-600 mb-1">
                          {load.customer_name}
                        </div>

                        {/* Terminal */}
                        <div className="text-xs text-gray-500 mb-2 flex items-center gap-1">
                          <span>🚢</span>
                          {TERMINAL_LABELS[load.terminal || ''] || load.terminal}
                        </div>

                        {/* LFD */}
                        {load.last_free_day && (
                          <div className="text-xs mb-2 flex items-center gap-2">
                            <span className="text-gray-500">LFD:</span>
                            <span className={`font-semibold ${
                              load.lfd_urgency === 'OVERDUE' ? 'text-red-600' :
                              load.lfd_urgency === 'TOMORROW' ? 'text-red-500' :
                              load.lfd_urgency === 'SOON' ? 'text-orange-500' :
                              'text-gray-700'
                            }`}>
                              {new Date(load.last_free_day).toLocaleDateString()}
                            </span>
                            {getUrgencyBadge(load)}
                          </div>
                        )}

                        {/* Holds */}
                        {getHoldBadges(load)}

                        {/* Appointments */}
                        {(load.terminal_appointment_date || load.delivery_appointment_date) && (
                          <div className="mt-2 pt-2 border-t text-xs space-y-1">
                            {load.terminal_appointment_date && (
                              <div className="flex items-center gap-1 text-gray-600">
                                <span>🏭</span>
                                <span>
                                  {new Date(load.terminal_appointment_date).toLocaleDateString()}
                                  {load.terminal_appointment_time && ` ${load.terminal_appointment_time}`}
                                </span>
                              </div>
                            )}
                            {load.delivery_appointment_date && (
                              <div className="flex items-center gap-1 text-gray-600">
                                <span>📦</span>
                                <span>
                                  {new Date(load.delivery_appointment_date).toLocaleDateString()}
                                  {load.delivery_appointment_time && ` ${load.delivery_appointment_time}`}
                                </span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Driver (if dispatched) */}
                        {load.driver_name && (
                          <div className="mt-2 pt-2 border-t">
                            <div className="flex items-center gap-2 text-sm">
                              <span className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 text-xs font-bold">
                                {load.driver_name.charAt(0)}
                              </span>
                              <span className="text-gray-700">{load.driver_name}</span>
                              {load.truck_number && (
                                <span className="text-gray-400">• {load.truck_number}</span>
                              )}
                            </div>
                            {load.trip_status && (
                              <div className="mt-1">
                                <span className={`text-xs px-2 py-0.5 rounded ${
                                  load.trip_status === 'AT_PICKUP' ? 'bg-yellow-100 text-yellow-700' :
                                  load.trip_status === 'AT_DELIVERY' ? 'bg-green-100 text-green-700' :
                                  load.trip_status === 'EN_ROUTE' ? 'bg-blue-100 text-blue-700' :
                                  'bg-gray-100 text-gray-700'
                                }`}>
                                  {load.trip_status.replace(/_/g, ' ')}
                                </span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* In Yard indicator */}
                        {load.in_yard && (
                          <div className="mt-2 flex items-center gap-1 text-xs text-purple-600">
                            <span>🏗️</span>
                            <span>In Yard</span>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Load Detail Panel */}
      {selectedLoad && (
        <LoadDetailPanel
          loadId={selectedLoad}
          onClose={() => setSelectedLoad(null)}
          onUpdate={loadData}
        />
      )}
    </div>
  );
}
