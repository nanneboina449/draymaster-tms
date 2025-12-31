'use client';

import { useState } from 'react';
import { NewLoadModal } from '../../components/shipments/NewLoadModal';
import { ShipmentList } from '../../components/shipments/ShipmentList';

export default function ShipmentsPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [shipments, setShipments] = useState([
    {
      id: '1',
      referenceNumber: 'SHP-2024-001',
      type: 'IMPORT',
      status: 'PENDING',
      customer: 'ABC Logistics',
      steamshipLine: 'Maersk',
      vessel: 'Ever Given',
      voyage: '123E',
      terminal: 'APM Terminals',
      containerCount: 3,
      lastFreeDay: '2025-01-05',
      createdAt: '2024-12-30',
    },
    {
      id: '2',
      referenceNumber: 'SHP-2024-002',
      type: 'EXPORT',
      status: 'IN_PROGRESS',
      customer: 'XYZ Imports',
      steamshipLine: 'MSC',
      vessel: 'MSC Oscar',
      voyage: '456W',
      terminal: 'LBCT',
      containerCount: 1,
      lastFreeDay: '2025-01-03',
      createdAt: '2024-12-29',
    },
    {
      id: '3',
      referenceNumber: 'SHP-2024-003',
      type: 'IMPORT',
      status: 'DELIVERED',
      customer: 'Global Trade Co',
      steamshipLine: 'COSCO',
      vessel: 'COSCO Faith',
      voyage: '789E',
      terminal: 'TraPac',
      containerCount: 2,
      lastFreeDay: '2024-12-28',
      createdAt: '2024-12-25',
    },
    {
      id: '4',
      referenceNumber: 'SHP-2024-004',
      type: 'IMPORT',
      status: 'PENDING',
      customer: 'Pacific Freight',
      steamshipLine: 'CMA CGM',
      vessel: 'CMA CGM Marco Polo',
      voyage: '234E',
      terminal: 'Fenix Marine',
      containerCount: 5,
      lastFreeDay: '2025-01-02',
      createdAt: '2024-12-28',
    },
    {
      id: '5',
      referenceNumber: 'SHP-2024-005',
      type: 'EXPORT',
      status: 'PENDING',
      customer: 'West Coast Distributors',
      steamshipLine: 'Hapag-Lloyd',
      vessel: 'Berlin Express',
      voyage: '567W',
      terminal: 'YTI',
      containerCount: 2,
      lastFreeDay: '2025-01-04',
      createdAt: '2024-12-29',
    },
  ]);

  const handleAddShipment = (newShipment: any) => {
    const shipment = {
      ...newShipment,
      id: String(shipments.length + 1),
      referenceNumber: `SHP-2024-${String(shipments.length + 1).padStart(3, '0')}`,
      status: 'PENDING',
      customer: newShipment.customer,
      steamshipLine: newShipment.steamshipLine,
      vessel: newShipment.vessel || 'TBD',
      voyage: newShipment.voyage || 'TBD',
      terminal: newShipment.terminal,
      containerCount: newShipment.containers?.length || 0,
      lastFreeDay: newShipment.lastFreeDay || 'TBD',
      createdAt: new Date().toISOString().split('T')[0],
    };
    setShipments([shipment, ...shipments]);
    setIsModalOpen(false);
  };

  const stats = {
    total: shipments.length,
    pending: shipments.filter(s => s.status === 'PENDING').length,
    inProgress: shipments.filter(s => s.status === 'IN_PROGRESS').length,
    delivered: shipments.filter(s => s.status === 'DELIVERED').length,
    imports: shipments.filter(s => s.type === 'IMPORT').length,
    exports: shipments.filter(s => s.type === 'EXPORT').length,
    urgentLFD: shipments.filter(s => {
      const lfd = new Date(s.lastFreeDay);
      const today = new Date();
      const diff = Math.ceil((lfd.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return diff <= 2 && diff >= 0;
    }).length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Shipments</h1>
          <p className="text-gray-500 mt-1">Manage import and export shipments</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 font-medium shadow-sm"
        >
          <span className="text-xl">+</span>
          <span>New Load</span>
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        <div className="bg-white rounded-xl shadow p-4">
          <p className="text-sm text-gray-500">Total</p>
          <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4">
          <p className="text-sm text-gray-500">Pending</p>
          <p className="text-2xl font-bold text-yellow-600">{stats.pending}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4">
          <p className="text-sm text-gray-500">In Progress</p>
          <p className="text-2xl font-bold text-blue-600">{stats.inProgress}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4">
          <p className="text-sm text-gray-500">Delivered</p>
          <p className="text-2xl font-bold text-green-600">{stats.delivered}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4">
          <p className="text-sm text-gray-500">Imports</p>
          <p className="text-2xl font-bold text-purple-600">{stats.imports}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4">
          <p className="text-sm text-gray-500">Exports</p>
          <p className="text-2xl font-bold text-orange-600">{stats.exports}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4 border-l-4 border-red-500">
          <p className="text-sm text-gray-500">Urgent LFD</p>
          <p className="text-2xl font-bold text-red-600">{stats.urgentLFD} ⚠️</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Type:</label>
            <select className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500">
              <option value="">All Types</option>
              <option value="IMPORT">Import</option>
              <option value="EXPORT">Export</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Status:</label>
            <select className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500">
              <option value="">All Status</option>
              <option value="PENDING">Pending</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="DELIVERED">Delivered</option>
              <option value="COMPLETED">Completed</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Terminal:</label>
            <select className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500">
              <option value="">All Terminals</option>
              <option value="APM Terminals">APM Terminals</option>
              <option value="LBCT">LBCT</option>
              <option value="TraPac">TraPac</option>
              <option value="Fenix Marine">Fenix Marine</option>
              <option value="YTI">YTI</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">SSL:</label>
            <select className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500">
              <option value="">All Lines</option>
              <option value="Maersk">Maersk</option>
              <option value="MSC">MSC</option>
              <option value="COSCO">COSCO</option>
              <option value="CMA CGM">CMA CGM</option>
              <option value="Hapag-Lloyd">Hapag-Lloyd</option>
            </select>
          </div>
          <div className="flex-1"></div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Search by reference, container..."
              className="px-4 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 w-64"
            />
            <button className="px-4 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm">
              Search
            </button>
          </div>
        </div>
      </div>

      {/* Shipment List */}
      <ShipmentList shipments={shipments} />

      {/* New Load Modal */}
      <NewLoadModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleAddShipment}
      />
    </div>
  );
}