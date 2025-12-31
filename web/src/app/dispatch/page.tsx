'use client';

import { useState } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from 'react-beautiful-dnd';
import { format } from 'date-fns';
import { clsx } from 'clsx';
import {
  TruckIcon,
  ClockIcon,
  MapPinIcon,
  UserIcon,
  EllipsisVerticalIcon,
  PlusIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';

// Trip type badges
const tripTypeBadges: Record<string, { label: string; className: string }> = {
  LIVE_UNLOAD: { label: 'Live Unload', className: 'bg-blue-100 text-blue-700' },
  DROP_HOOK_SAME: { label: 'Drop & Hook', className: 'bg-green-100 text-green-700' },
  DROP_HOOK_DIFF: { label: 'Drop & Pick', className: 'bg-purple-100 text-purple-700' },
  STREET_TURN: { label: 'Street Turn', className: 'bg-pink-100 text-pink-700' },
  DUAL_TRANSACTION: { label: 'Dual Trans', className: 'bg-cyan-100 text-cyan-700' },
  PRE_PULL: { label: 'Pre-Pull', className: 'bg-yellow-100 text-yellow-700' },
  EMPTY_RETURN: { label: 'Empty Return', className: 'bg-gray-100 text-gray-700' },
};

// Column definitions
const columns = [
  { id: 'unassigned', title: 'Unassigned', color: 'bg-gray-100' },
  { id: 'assigned', title: 'Assigned', color: 'bg-blue-100' },
  { id: 'dispatched', title: 'Dispatched', color: 'bg-yellow-100' },
  { id: 'in_progress', title: 'In Progress', color: 'bg-purple-100' },
  { id: 'completed', title: 'Completed', color: 'bg-green-100' },
];

// Mock data
const initialTrips = {
  unassigned: [
    {
      id: '1',
      tripNumber: 'TRP-20241229-0012',
      type: 'LIVE_UNLOAD',
      containerNumber: 'MSCU1234567',
      pickupLocation: 'APM Terminals',
      deliveryLocation: 'ABC Warehouse, Compton',
      appointmentTime: '2024-12-29T10:00:00',
      estimatedMiles: 28,
      estimatedDuration: 90,
    },
    {
      id: '2',
      tripNumber: 'TRP-20241229-0013',
      type: 'DROP_HOOK_SAME',
      containerNumber: 'MAEU7654321',
      pickupLocation: 'LBCT',
      deliveryLocation: 'XYZ Distribution, Carson',
      appointmentTime: '2024-12-29T11:30:00',
      estimatedMiles: 15,
      estimatedDuration: 60,
    },
  ],
  assigned: [
    {
      id: '3',
      tripNumber: 'TRP-20241229-0008',
      type: 'STREET_TURN',
      containerNumber: 'HLCU9876543',
      pickupLocation: 'TraPac',
      deliveryLocation: 'Import Co, Ontario → Export Inc, Fontana',
      appointmentTime: '2024-12-29T08:00:00',
      estimatedMiles: 65,
      estimatedDuration: 180,
      driver: { name: 'Mike Johnson', id: '101' },
      tractor: 'T-105',
    },
  ],
  dispatched: [
    {
      id: '4',
      tripNumber: 'TRP-20241229-0005',
      type: 'LIVE_UNLOAD',
      containerNumber: 'CMAU4567890',
      pickupLocation: 'PCT',
      deliveryLocation: 'Fresh Foods, Riverside',
      appointmentTime: '2024-12-29T07:00:00',
      estimatedMiles: 55,
      estimatedDuration: 150,
      driver: { name: 'Carlos Rodriguez', id: '102' },
      tractor: 'T-108',
      dispatchedAt: '2024-12-29T05:30:00',
    },
  ],
  in_progress: [
    {
      id: '5',
      tripNumber: 'TRP-20241229-0002',
      type: 'DUAL_TRANSACTION',
      containerNumber: 'OOLU1122334',
      pickupLocation: 'ITS',
      deliveryLocation: 'Auto Parts Inc, Torrance',
      appointmentTime: '2024-12-29T06:00:00',
      estimatedMiles: 22,
      estimatedDuration: 90,
      driver: { name: 'James Wilson', id: '103' },
      tractor: 'T-112',
      currentStop: 2,
      totalStops: 4,
      eta: '2024-12-29T08:45:00',
    },
  ],
  completed: [
    {
      id: '6',
      tripNumber: 'TRP-20241229-0001',
      type: 'DROP_HOOK_DIFF',
      containerNumber: 'TCLU5566778',
      pickupLocation: 'Fenix Marine',
      deliveryLocation: 'Paper Products, Commerce',
      driver: { name: 'David Lee', id: '104' },
      tractor: 'T-115',
      completedAt: '2024-12-29T07:15:00',
      actualMiles: 19,
      detention: 0,
    },
  ],
};

type Trip = typeof initialTrips.unassigned[0] & {
  driver?: { name: string; id: string };
  tractor?: string;
  dispatchedAt?: string;
  currentStop?: number;
  totalStops?: number;
  eta?: string;
  completedAt?: string;
  actualMiles?: number;
  detention?: number;
};

export default function DispatchPage() {
  const [trips, setTrips] = useState<Record<string, Trip[]>>(initialTrips);
  const [searchQuery, setSearchQuery] = useState('');

  const handleDragEnd = (result: DropResult) => {
    const { source, destination } = result;

    if (!destination) return;
    if (
      source.droppableId === destination.droppableId &&
      source.index === destination.index
    ) {
      return;
    }

    const sourceColumn = trips[source.droppableId];
    const destColumn = trips[destination.droppableId];
    const [removed] = sourceColumn.splice(source.index, 1);
    destColumn.splice(destination.index, 0, removed);

    setTrips({
      ...trips,
      [source.droppableId]: sourceColumn,
      [destination.droppableId]: destColumn,
    });

    // In real app, would call API to update trip status
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dispatch Board</h1>
          <p className="text-sm text-gray-500">
            {format(new Date(), 'EEEE, MMMM d, yyyy')} • Drag trips to assign and dispatch
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search trips..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-64 rounded-lg border border-gray-300 py-2 pl-9 pr-4 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          {/* Filter */}
          <button className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            <FunnelIcon className="h-4 w-4" />
            Filters
          </button>
          {/* Create Trip */}
          <button className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            <PlusIcon className="h-4 w-4" />
            New Trip
          </button>
        </div>
      </div>

      {/* Kanban Board */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex-1 flex gap-4 overflow-x-auto pb-4">
          {columns.map((column) => (
            <div
              key={column.id}
              className="flex w-80 flex-shrink-0 flex-col rounded-xl bg-gray-100"
            >
              {/* Column Header */}
              <div className={clsx('flex items-center justify-between rounded-t-xl px-4 py-3', column.color)}>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-gray-900">{column.title}</h3>
                  <span className="rounded-full bg-white/60 px-2 py-0.5 text-xs font-medium text-gray-700">
                    {trips[column.id]?.length || 0}
                  </span>
                </div>
              </div>

              {/* Droppable Area */}
              <Droppable droppableId={column.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={clsx(
                      'flex-1 space-y-3 overflow-y-auto p-3',
                      snapshot.isDraggingOver && 'bg-blue-50'
                    )}
                  >
                    {trips[column.id]?.map((trip, index) => (
                      <Draggable key={trip.id} draggableId={trip.id} index={index}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            className={clsx(
                              'rounded-lg bg-white p-4 shadow-sm ring-1 ring-gray-200 transition-shadow',
                              snapshot.isDragging && 'shadow-lg ring-blue-500'
                            )}
                          >
                            {/* Trip Header */}
                            <div className="flex items-start justify-between mb-3">
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-sm font-semibold text-gray-900">
                                    {trip.tripNumber}
                                  </span>
                                  <button className="text-gray-400 hover:text-gray-600">
                                    <EllipsisVerticalIcon className="h-4 w-4" />
                                  </button>
                                </div>
                                <span
                                  className={clsx(
                                    'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
                                    tripTypeBadges[trip.type]?.className || 'bg-gray-100 text-gray-700'
                                  )}
                                >
                                  {tripTypeBadges[trip.type]?.label || trip.type}
                                </span>
                              </div>
                            </div>

                            {/* Container */}
                            <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                              <TruckIcon className="h-4 w-4 text-gray-400" />
                              <span className="font-mono">{trip.containerNumber}</span>
                            </div>

                            {/* Locations */}
                            <div className="space-y-1 mb-3">
                              <div className="flex items-start gap-2 text-sm">
                                <MapPinIcon className="h-4 w-4 text-green-500 mt-0.5" />
                                <span className="text-gray-600">{trip.pickupLocation}</span>
                              </div>
                              <div className="flex items-start gap-2 text-sm">
                                <MapPinIcon className="h-4 w-4 text-red-500 mt-0.5" />
                                <span className="text-gray-600">{trip.deliveryLocation}</span>
                              </div>
                            </div>

                            {/* Appointment Time */}
                            {trip.appointmentTime && (
                              <div className="flex items-center gap-2 text-sm text-gray-500 mb-3">
                                <ClockIcon className="h-4 w-4" />
                                <span>
                                  Appt: {format(new Date(trip.appointmentTime), 'h:mm a')}
                                </span>
                              </div>
                            )}

                            {/* Driver (if assigned) */}
                            {trip.driver && (
                              <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
                                <div className="h-6 w-6 rounded-full bg-blue-100 flex items-center justify-center">
                                  <UserIcon className="h-3 w-3 text-blue-600" />
                                </div>
                                <span className="text-sm font-medium text-gray-700">
                                  {trip.driver.name}
                                </span>
                                {trip.tractor && (
                                  <span className="text-xs text-gray-400">• {trip.tractor}</span>
                                )}
                              </div>
                            )}

                            {/* Progress (if in progress) */}
                            {trip.currentStop && trip.totalStops && (
                              <div className="mt-3 pt-3 border-t border-gray-100">
                                <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                                  <span>Stop {trip.currentStop} of {trip.totalStops}</span>
                                  {trip.eta && (
                                    <span>ETA: {format(new Date(trip.eta), 'h:mm a')}</span>
                                  )}
                                </div>
                                <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-blue-500 rounded-full"
                                    style={{ width: `${(trip.currentStop / trip.totalStops) * 100}%` }}
                                  />
                                </div>
                              </div>
                            )}

                            {/* Completed info */}
                            {trip.completedAt && (
                              <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-500">
                                <div className="flex justify-between">
                                  <span>Completed</span>
                                  <span>{format(new Date(trip.completedAt), 'h:mm a')}</span>
                                </div>
                                {trip.actualMiles && (
                                  <div className="flex justify-between mt-1">
                                    <span>Miles</span>
                                    <span>{trip.actualMiles} mi</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          ))}
        </div>
      </DragDropContext>
    </div>
  );
}
