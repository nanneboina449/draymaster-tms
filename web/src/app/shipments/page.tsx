'use client';

import { useState, useEffect } from 'react';
import { NewLoadModal } from '../../components/shipments/NewLoadModal';
import { ShipmentList } from '../../components/shipments/ShipmentList';
import { EditShipmentModal } from '../../components/shipments/EditShipmentModal';
import { ViewShipmentModal } from '../../components/shipments/ViewShipmentModal';
import { DeleteConfirmModal } from '../../components/shipments/DeleteConfirmModal';
import { getShipments, createShipment, updateShipment, deleteShipment, updateShipmentStatus, Shipment } from '../../lib/supabase';

export default function ShipmentsPage() {
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => { fetchShipments(); }, []);

  const fetchShipments = async () => {
    try {
      setLoading(true);
      const data = await getShipments();
      setShipments(data || []);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddShipment = async (formData: any) => {
    try {
      const shipmentData = {
        type: formData.type,
        customer_name: formData.customer,
        steamship_line: formData.steamshipLine,
        booking_number: formData.bookingNumber,
        bill_of_lading: formData.billOfLading,
        vessel: formData.vessel,
        voyage: formData.voyage,
        terminal_name: formData.terminal,
        last_free_day: formData.lastFreeDay || null,
        port_cutoff: formData.portCutoff || null,
        trip_type: formData.tripType,
        chassis_required: formData.chassisInfo?.required ?? true,
        chassis_pool: formData.chassisInfo?.pool,
        chassis_size: formData.chassisInfo?.preferredSize,
        delivery_address: formData.deliveryLocation?.address,
        delivery_city: formData.deliveryLocation?.city,
        delivery_state: formData.deliveryLocation?.state,
        delivery_zip: formData.deliveryLocation?.zip,
        special_instructions: formData.specialInstructions,
      };
      const containers = formData.containers?.map((c: any) => ({
        container_number: c.containerNumber,
        size: c.size,
        type: c.type,
        weight: parseInt(c.weight) || null,
        seal_number: c.sealNumber,
        is_hazmat: c.isHazmat,
        hazmat_class: c.hazmatClass,
        is_overweight: c.isOverweight,
        is_reefer: c.isReefer,
        reefer_temp: parseInt(c.reeferTemp) || null,
        customs_status: c.customsStatus,
      })) || [];
      await createShipment(shipmentData, containers);
      await fetchShipments();
      setIsNewModalOpen(false);
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const handleEditShipment = async (formData: any) => {
    if (!selectedShipment) return;
    try {
      await updateShipment(selectedShipment.id, formData);
      await fetchShipments();
      setIsEditModalOpen(false);
      setSelectedShipment(null);
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const handleDeleteShipment = async () => {
    if (!selectedShipment) return;
    try {
      await deleteShipment(selectedShipment.id);
      await fetchShipments();
      setIsDeleteModalOpen(false);
      setSelectedShipment(null);
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await updateShipmentStatus(id, status);
      await fetchShipments();
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const filteredShipments = shipments.filter(s => {
    if (typeFilter && s.type !== typeFilter) return false;
    if (statusFilter && s.status !== statusFilter) return false;
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      return s.reference_number?.toLowerCase().includes(search) || s.customer_name?.toLowerCase().includes(search);
    }
    return true;
  });

  const stats = {
    total: shipments.length,
    pending: shipments.filter(s => s.status === 'PENDING').length,
    inProgress: shipments.filter(s => s.status === 'IN_PROGRESS').length,
    delivered: shipments.filter(s => s.status === 'DELIVERED').length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Shipments</h1>
          <p className="text-gray-500 mt-1">Manage import and export shipments</p>
        </div>
        <button onClick={() => setIsNewModalOpen(true)} className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 font-medium">
          <span className="text-xl">+</span> New Load
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">Error: {error}</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow p-4"><p className="text-sm text-gray-500">Total</p><p className="text-2xl font-bold">{stats.total}</p></div>
        <div className="bg-white rounded-xl shadow p-4"><p className="text-sm text-gray-500">Pending</p><p className="text-2xl font-bold text-yellow-600">{stats.pending}</p></div>
        <div className="bg-white rounded-xl shadow p-4"><p className="text-sm text-gray-500">In Progress</p><p className="text-2xl font-bold text-blue-600">{stats.inProgress}</p></div>
        <div className="bg-white rounded-xl shadow p-4"><p className="text-sm text-gray-500">Delivered</p><p className="text-2xl font-bold text-green-600">{stats.delivered}</p></div>
      </div>

      <div className="bg-white rounded-xl shadow p-4 flex flex-wrap gap-4">
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="px-3 py-1.5 border rounded-lg text-sm">
          <option value="">All Types</option>
          <option value="IMPORT">Import</option>
          <option value="EXPORT">Export</option>
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-3 py-1.5 border rounded-lg text-sm">
          <option value="">All Status</option>
          <option value="PENDING">Pending</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="DELIVERED">Delivered</option>
        </select>
        <input type="text" placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="px-4 py-1.5 border rounded-lg text-sm w-64" />
        <button onClick={fetchShipments} className="px-4 py-1.5 bg-gray-100 rounded-lg hover:bg-gray-200 text-sm">Refresh</button>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl shadow p-12 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-500">Loading...</p>
        </div>
      ) : (
        <ShipmentList
          shipments={filteredShipments}
          onView={(s) => { setSelectedShipment(s); setIsViewModalOpen(true); }}
          onEdit={(s) => { setSelectedShipment(s); setIsEditModalOpen(true); }}
          onDelete={(s) => { setSelectedShipment(s); setIsDeleteModalOpen(true); }}
          onStatusChange={handleStatusChange}
        />
      )}

      <NewLoadModal isOpen={isNewModalOpen} onClose={() => setIsNewModalOpen(false)} onSubmit={handleAddShipment} />
      
      {selectedShipment && (
        <>
          <ViewShipmentModal isOpen={isViewModalOpen} onClose={() => { setIsViewModalOpen(false); setSelectedShipment(null); }} shipment={selectedShipment} />
          <EditShipmentModal isOpen={isEditModalOpen} onClose={() => { setIsEditModalOpen(false); setSelectedShipment(null); }} onSubmit={handleEditShipment} shipment={selectedShipment} />
          <DeleteConfirmModal isOpen={isDeleteModalOpen} onClose={() => { setIsDeleteModalOpen(false); setSelectedShipment(null); }} onConfirm={handleDeleteShipment} shipment={selectedShipment} />
        </>
      )}
    </div>
  );
}