'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

interface Driver {
  id: string;
  first_name: string;
  last_name: string;
  driver_type: string;
  status: string;
}

interface Trip {
  id: string;
  trip_number: string;
  driver_id: string;
  status: string;
  pickup_location: string;
  delivery_location: string;
  container_number: string;
  actual_start: string;
  actual_end: string;
  miles: number;
  base_pay: number;
  pay_status: string;
}

interface TripCharge {
  id: string;
  trip_id: string;
  driver_id: string;
  charge_type: string;
  charge_category: string;
  description: string;
  quantity: number;
  rate: number;
  amount: number;
  status: string;
  is_processed: boolean;
}

interface Settlement {
  id: string;
  settlement_number: string;
  driver_id: string;
  period_start: string;
  period_end: string;
  total_trips: number;
  total_miles: number;
  gross_trip_pay: number;
  waiting_pay: number;
  accessorial_pay: number;
  total_gross_pay: number;
  fuel_advances: number;
  cash_advances: number;
  insurance_deduction: number;
  total_deductions: number;
  toll_reimbursements: number;
  total_reimbursements: number;
  net_pay: number;
  status: string;
  paid_date: string;
  drivers?: Driver;
}

export default function SettlementsPage() {
  const [activeTab, setActiveTab] = useState<'settlements' | 'pending' | 'charges'>('settlements');
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [pendingTrips, setPendingTrips] = useState<Trip[]>([]);
  const [tripCharges, setTripCharges] = useState<TripCharge[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedDriver, setSelectedDriver] = useState<string>('');
  const [selectedTrips, setSelectedTrips] = useState<string[]>([]);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isChargeModalOpen, setIsChargeModalOpen] = useState(false);
  const [viewingSettlement, setViewingSettlement] = useState<Settlement | null>(null);

  const [chargeForm, setChargeForm] = useState({
    trip_id: '',
    driver_id: '',
    charge_type: 'WAITING_TIME',
    charge_category: 'EARNING',
    description: '',
    quantity: 1,
    rate: 25,
    amount: 25,
  });

  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0],
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);

      // Fetch drivers
      const { data: driversData } = await supabase
        .from('drivers')
        .select('*')
        .eq('status', 'ACTIVE')
        .order('first_name');
      setDrivers(driversData || []);

      // Fetch settlements
      const { data: settlementsData } = await supabase
        .from('driver_settlements')
        .select('*, drivers(first_name, last_name, driver_type)')
        .order('created_at', { ascending: false })
        .limit(50);
      setSettlements(settlementsData || []);

      // Fetch pending trips (completed but unpaid)
      const { data: tripsData } = await supabase
        .from('trips')
        .select('*')
        .in('status', ['COMPLETED', 'DELIVERED'])
        .eq('pay_status', 'UNPAID')
        .order('actual_end', { ascending: false });
      setPendingTrips(tripsData || []);

      // Fetch recent charges
      const { data: chargesData } = await supabase
        .from('trip_charges')
        .select('*')
        .eq('is_processed', false)
        .order('created_at', { ascending: false })
        .limit(100);
      setTripCharges(chargesData || []);

    } catch (err: any) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const chargeTypes = [
    { value: 'WAITING_TIME', label: 'Waiting Time', category: 'EARNING' },
    { value: 'DETENTION', label: 'Detention', category: 'EARNING' },
    { value: 'STOP_PAY', label: 'Extra Stop', category: 'EARNING' },
    { value: 'HAZMAT', label: 'Hazmat', category: 'EARNING' },
    { value: 'OVERWEIGHT', label: 'Overweight', category: 'EARNING' },
    { value: 'LIVE_UNLOAD', label: 'Live Unload', category: 'EARNING' },
    { value: 'WEEKEND', label: 'Weekend Pay', category: 'EARNING' },
    { value: 'BONUS', label: 'Bonus', category: 'EARNING' },
    { value: 'OTHER_EARNING', label: 'Other Earning', category: 'EARNING' },
    { value: 'FUEL_ADVANCE', label: 'Fuel Advance', category: 'DEDUCTION' },
    { value: 'CASH_ADVANCE', label: 'Cash Advance', category: 'DEDUCTION' },
    { value: 'INSURANCE', label: 'Insurance', category: 'DEDUCTION' },
    { value: 'OTHER_DEDUCTION', label: 'Other Deduction', category: 'DEDUCTION' },
    { value: 'TOLL_REIMBURSEMENT', label: 'Toll Reimbursement', category: 'REIMBURSEMENT' },
    { value: 'LUMPER', label: 'Lumper Fee', category: 'REIMBURSEMENT' },
    { value: 'SCALE_TICKET', label: 'Scale Ticket', category: 'REIMBURSEMENT' },
    { value: 'OTHER_REIMBURSEMENT', label: 'Other Reimbursement', category: 'REIMBURSEMENT' },
  ];

  const openChargeModal = (tripId?: string, driverId?: string) => {
    setChargeForm({
      trip_id: tripId || '',
      driver_id: driverId || '',
      charge_type: 'WAITING_TIME',
      charge_category: 'EARNING',
      description: '',
      quantity: 1,
      rate: 25,
      amount: 25,
    });
    setIsChargeModalOpen(true);
  };

  const handleChargeTypeChange = (type: string) => {
    const chargeType = chargeTypes.find(c => c.value === type);
    setChargeForm({
      ...chargeForm,
      charge_type: type,
      charge_category: chargeType?.category || 'EARNING',
    });
  };

  const calculateAmount = () => {
    const amount = chargeForm.quantity * chargeForm.rate;
    setChargeForm({ ...chargeForm, amount });
  };

  const saveCharge = async () => {
    try {
      const { error } = await supabase
        .from('trip_charges')
        .insert({
          ...chargeForm,
          status: 'PENDING',
          is_processed: false,
        });
      if (error) throw error;
      setIsChargeModalOpen(false);
      fetchData();
      alert('Charge added successfully!');
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const createSettlement = async () => {
    if (!selectedDriver) {
      alert('Please select a driver');
      return;
    }

    if (selectedTrips.length === 0) {
      alert('Please select at least one trip');
      return;
    }

    try {
      // Get selected trips data
      const { data: trips } = await supabase
        .from('trips')
        .select('*')
        .in('id', selectedTrips);

      if (!trips || trips.length === 0) {
        alert('No trips found');
        return;
      }

      // Get charges for these trips
      const { data: charges } = await supabase
        .from('trip_charges')
        .select('*')
        .in('trip_id', selectedTrips)
        .eq('is_processed', false);

      // Calculate totals
      let grossTripPay = 0;
      let waitingPay = 0;
      let accessorialPay = 0;
      let totalMiles = 0;
      let fuelAdvances = 0;
      let cashAdvances = 0;
      let tollReimbursements = 0;
      let otherDeductions = 0;
      let otherReimbursements = 0;

      trips.forEach(trip => {
        grossTripPay += trip.base_pay || 0;
        totalMiles += trip.miles || 0;
      });

      charges?.forEach(charge => {
        if (charge.charge_category === 'EARNING') {
          if (charge.charge_type === 'WAITING_TIME' || charge.charge_type === 'DETENTION') {
            waitingPay += charge.amount;
          } else {
            accessorialPay += charge.amount;
          }
        } else if (charge.charge_category === 'DEDUCTION') {
          if (charge.charge_type === 'FUEL_ADVANCE') {
            fuelAdvances += charge.amount;
          } else if (charge.charge_type === 'CASH_ADVANCE') {
            cashAdvances += charge.amount;
          } else {
            otherDeductions += charge.amount;
          }
        } else if (charge.charge_category === 'REIMBURSEMENT') {
          if (charge.charge_type === 'TOLL_REIMBURSEMENT') {
            tollReimbursements += charge.amount;
          } else {
            otherReimbursements += charge.amount;
          }
        }
      });

      const totalGrossPay = grossTripPay + waitingPay + accessorialPay;
      const totalDeductions = fuelAdvances + cashAdvances + otherDeductions;
      const totalReimbursements = tollReimbursements + otherReimbursements;
      const netPay = totalGrossPay - totalDeductions + totalReimbursements;

      // Create settlement
      const { data: settlement, error: settlementError } = await supabase
        .from('driver_settlements')
        .insert({
          driver_id: selectedDriver,
          period_start: dateRange.start,
          period_end: dateRange.end,
          total_trips: trips.length,
          total_miles: totalMiles,
          gross_trip_pay: grossTripPay,
          waiting_pay: waitingPay,
          accessorial_pay: accessorialPay,
          total_gross_pay: totalGrossPay,
          fuel_advances: fuelAdvances,
          cash_advances: cashAdvances,
          total_deductions: totalDeductions,
          toll_reimbursements: tollReimbursements,
          other_reimbursements: otherReimbursements,
          total_reimbursements: totalReimbursements,
          net_pay: netPay,
          status: 'DRAFT',
        })
        .select()
        .single();

      if (settlementError) throw settlementError;

      // Update trips with settlement_id
      await supabase
        .from('trips')
        .update({ settlement_id: settlement.id, pay_status: 'PENDING' })
        .in('id', selectedTrips);

      // Mark charges as processed
      if (charges && charges.length > 0) {
        await supabase
          .from('trip_charges')
          .update({ settlement_id: settlement.id, is_processed: true })
          .in('id', charges.map(c => c.id));
      }

      setIsCreateModalOpen(false);
      setSelectedTrips([]);
      setSelectedDriver('');
      fetchData();
      alert(`Settlement ${settlement.settlement_number} created successfully!`);

    } catch (err: any) {
      console.error('Error:', err);
      alert('Error creating settlement: ' + err.message);
    }
  };

  const approveSettlement = async (settlementId: string) => {
    try {
      const { error } = await supabase
        .from('driver_settlements')
        .update({ status: 'APPROVED', approved_at: new Date().toISOString() })
        .eq('id', settlementId);
      if (error) throw error;
      fetchData();
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const markAsPaid = async (settlementId: string) => {
    const paymentRef = prompt('Enter payment reference (check #, transaction ID):');
    if (!paymentRef) return;

    try {
      // Update settlement
      const { error } = await supabase
        .from('driver_settlements')
        .update({
          status: 'PAID',
          paid_date: new Date().toISOString().split('T')[0],
          payment_reference: paymentRef,
        })
        .eq('id', settlementId);
      if (error) throw error;

      // Update trips to PAID
      await supabase
        .from('trips')
        .update({ pay_status: 'PAID' })
        .eq('settlement_id', settlementId);

      fetchData();
      alert('Settlement marked as paid!');
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      'DRAFT': 'bg-gray-100 text-gray-800',
      'PENDING_APPROVAL': 'bg-yellow-100 text-yellow-800',
      'APPROVED': 'bg-blue-100 text-blue-800',
      'PAID': 'bg-green-100 text-green-800',
      'VOID': 'bg-red-100 text-red-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const filteredPendingTrips = selectedDriver
    ? pendingTrips.filter(t => t.driver_id === selectedDriver)
    : pendingTrips;

  const toggleTripSelection = (tripId: string) => {
    setSelectedTrips(prev =>
      prev.includes(tripId)
        ? prev.filter(id => id !== tripId)
        : [...prev, tripId]
    );
  };

  const selectAllTrips = () => {
    if (selectedTrips.length === filteredPendingTrips.length) {
      setSelectedTrips([]);
    } else {
      setSelectedTrips(filteredPendingTrips.map(t => t.id));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Driver Settlements</h1>
          <p className="text-gray-500 mt-1">Process driver pay, track charges, and generate settlements</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => openChargeModal()}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
          >
            + Add Charge
          </button>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            + Create Settlement
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow p-4 border-l-4 border-yellow-500">
          <p className="text-sm text-gray-500">Pending Trips</p>
          <p className="text-2xl font-bold text-yellow-600">{pendingTrips.length}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4 border-l-4 border-blue-500">
          <p className="text-sm text-gray-500">Unprocessed Charges</p>
          <p className="text-2xl font-bold text-blue-600">{tripCharges.length}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4 border-l-4 border-purple-500">
          <p className="text-sm text-gray-500">Draft Settlements</p>
          <p className="text-2xl font-bold text-purple-600">
            {settlements.filter(s => s.status === 'DRAFT').length}
          </p>
        </div>
        <div className="bg-white rounded-xl shadow p-4 border-l-4 border-green-500">
          <p className="text-sm text-gray-500">Ready to Pay</p>
          <p className="text-2xl font-bold text-green-600">
            {settlements.filter(s => s.status === 'APPROVED').length}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow">
        <div className="border-b px-6">
          <div className="flex gap-4">
            {[
              { id: 'settlements', label: 'Settlements', count: settlements.length },
              { id: 'pending', label: 'Pending Trips', count: pendingTrips.length },
              { id: 'charges', label: 'Trip Charges', count: tripCharges.length },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`py-3 px-4 font-medium border-b-2 transition ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
                <span className="ml-2 bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-xs">
                  {tab.count}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            </div>
          ) : (
            <>
              {/* Settlements Tab */}
              {activeTab === 'settlements' && (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Settlement #</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Driver</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Period</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Trips</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Gross Pay</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Deductions</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Net Pay</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {settlements.map((settlement) => (
                        <tr key={settlement.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-mono font-semibold text-blue-600">
                            {settlement.settlement_number}
                          </td>
                          <td className="px-4 py-3">
                            {settlement.drivers?.first_name} {settlement.drivers?.last_name}
                            <div className="text-xs text-gray-500">{settlement.drivers?.driver_type?.replace('_', ' ')}</div>
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {new Date(settlement.period_start).toLocaleDateString()} -
                            <br />{new Date(settlement.period_end).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3">{settlement.total_trips}</td>
                          <td className="px-4 py-3 text-green-600 font-semibold">
                            ${settlement.total_gross_pay?.toFixed(2)}
                          </td>
                          <td className="px-4 py-3 text-red-600">
                            -${settlement.total_deductions?.toFixed(2)}
                          </td>
                          <td className="px-4 py-3 font-bold text-lg">
                            ${settlement.net_pay?.toFixed(2)}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded-full text-xs ${getStatusColor(settlement.status)}`}>
                              {settlement.status}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1">
                              <button
                                onClick={() => setViewingSettlement(settlement)}
                                className="px-2 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200"
                              >
                                View
                              </button>
                              {settlement.status === 'DRAFT' && (
                                <button
                                  onClick={() => approveSettlement(settlement.id)}
                                  className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                                >
                                  Approve
                                </button>
                              )}
                              {settlement.status === 'APPROVED' && (
                                <button
                                  onClick={() => markAsPaid(settlement.id)}
                                  className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200"
                                >
                                  Mark Paid
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {settlements.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      No settlements found. Create your first settlement!
                    </div>
                  )}
                </div>
              )}

              {/* Pending Trips Tab */}
              {activeTab === 'pending' && (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Trip #</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Container</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Route</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Completed</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Miles</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Base Pay</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {pendingTrips.map((trip) => (
                        <tr key={trip.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-mono">{trip.trip_number}</td>
                          <td className="px-4 py-3 font-mono">{trip.container_number || '-'}</td>
                          <td className="px-4 py-3 text-sm">
                            <div>{trip.pickup_location}</div>
                            <div className="text-gray-500">→ {trip.delivery_location}</div>
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {trip.actual_end ? new Date(trip.actual_end).toLocaleDateString() : '-'}
                          </td>
                          <td className="px-4 py-3">{trip.miles || '-'}</td>
                          <td className="px-4 py-3 font-semibold text-green-600">
                            ${trip.base_pay?.toFixed(2) || '0.00'}
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => openChargeModal(trip.id, trip.driver_id)}
                              className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                            >
                              + Charge
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {pendingTrips.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      No pending trips to process
                    </div>
                  )}
                </div>
              )}

              {/* Trip Charges Tab */}
              {activeTab === 'charges' && (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Qty</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rate</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {tripCharges.map((charge) => (
                        <tr key={charge.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">{charge.charge_type.replace('_', ' ')}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded text-xs ${
                              charge.charge_category === 'EARNING' ? 'bg-green-100 text-green-800' :
                              charge.charge_category === 'DEDUCTION' ? 'bg-red-100 text-red-800' :
                              'bg-blue-100 text-blue-800'
                            }`}>
                              {charge.charge_category}
                            </span>
                          </td>
                          <td className="px-4 py-3">{charge.description || '-'}</td>
                          <td className="px-4 py-3">{charge.quantity}</td>
                          <td className="px-4 py-3">${charge.rate?.toFixed(2)}</td>
                          <td className={`px-4 py-3 font-semibold ${
                            charge.charge_category === 'DEDUCTION' ? 'text-red-600' : 'text-green-600'
                          }`}>
                            {charge.charge_category === 'DEDUCTION' ? '-' : ''}${charge.amount?.toFixed(2)}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded-full text-xs ${
                              charge.is_processed ? 'bg-gray-100 text-gray-600' : 'bg-yellow-100 text-yellow-800'
                            }`}>
                              {charge.is_processed ? 'Processed' : 'Pending'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {tripCharges.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      No pending charges
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Create Settlement Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => setIsCreateModalOpen(false)}></div>
          <div className="relative min-h-screen flex items-center justify-center p-4">
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
              <div className="bg-gradient-to-r from-green-600 to-green-700 px-6 py-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold text-white">Create Driver Settlement</h2>
                  <button onClick={() => setIsCreateModalOpen(false)} className="text-white text-2xl">&times;</button>
                </div>
              </div>

              <div className="p-6 overflow-y-auto max-h-[60vh]">
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div>
                    <label className="block text-sm font-medium mb-1">Select Driver *</label>
                    <select
                      value={selectedDriver}
                      onChange={e => {
                        setSelectedDriver(e.target.value);
                        setSelectedTrips([]);
                      }}
                      className="w-full px-4 py-2 border rounded-lg"
                    >
                      <option value="">Select Driver</option>
                      {drivers.map(d => (
                        <option key={d.id} value={d.id}>
                          {d.first_name} {d.last_name} ({d.driver_type?.replace('_', ' ')})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Period Start</label>
                    <input
                      type="date"
                      value={dateRange.start}
                      onChange={e => setDateRange({ ...dateRange, start: e.target.value })}
                      className="w-full px-4 py-2 border rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Period End</label>
                    <input
                      type="date"
                      value={dateRange.end}
                      onChange={e => setDateRange({ ...dateRange, end: e.target.value })}
                      className="w-full px-4 py-2 border rounded-lg"
                    />
                  </div>
                </div>

                {selectedDriver && (
                  <>
                    <div className="flex justify-between items-center mb-2">
                      <h3 className="font-semibold">Select Trips to Include</h3>
                      <button
                        onClick={selectAllTrips}
                        className="text-sm text-blue-600 hover:underline"
                      >
                        {selectedTrips.length === filteredPendingTrips.length ? 'Deselect All' : 'Select All'}
                      </button>
                    </div>
                    <div className="border rounded-lg max-h-64 overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th className="px-3 py-2 text-left w-8">
                              <input
                                type="checkbox"
                                checked={selectedTrips.length === filteredPendingTrips.length && filteredPendingTrips.length > 0}
                                onChange={selectAllTrips}
                              />
                            </th>
                            <th className="px-3 py-2 text-left">Trip #</th>
                            <th className="px-3 py-2 text-left">Container</th>
                            <th className="px-3 py-2 text-left">Route</th>
                            <th className="px-3 py-2 text-left">Base Pay</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {filteredPendingTrips.map(trip => (
                            <tr
                              key={trip.id}
                              className={`cursor-pointer ${selectedTrips.includes(trip.id) ? 'bg-green-50' : 'hover:bg-gray-50'}`}
                              onClick={() => toggleTripSelection(trip.id)}
                            >
                              <td className="px-3 py-2">
                                <input
                                  type="checkbox"
                                  checked={selectedTrips.includes(trip.id)}
                                  onChange={() => toggleTripSelection(trip.id)}
                                />
                              </td>
                              <td className="px-3 py-2 font-mono">{trip.trip_number}</td>
                              <td className="px-3 py-2 font-mono">{trip.container_number || '-'}</td>
                              <td className="px-3 py-2">
                                {trip.pickup_location} → {trip.delivery_location}
                              </td>
                              <td className="px-3 py-2 text-green-600 font-semibold">
                                ${trip.base_pay?.toFixed(2) || '0.00'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {filteredPendingTrips.length === 0 && (
                        <div className="text-center py-4 text-gray-500">
                          No pending trips for this driver
                        </div>
                      )}
                    </div>

                    <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600">Selected Trips:</span>
                        <span className="font-semibold">{selectedTrips.length}</span>
                      </div>
                      <div className="flex justify-between items-center mt-2">
                        <span className="text-gray-600">Estimated Total:</span>
                        <span className="font-bold text-xl text-green-600">
                          ${filteredPendingTrips
                            .filter(t => selectedTrips.includes(t.id))
                            .reduce((sum, t) => sum + (t.base_pay || 0), 0)
                            .toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="px-6 py-4 bg-gray-50 border-t flex justify-between">
                <button onClick={() => setIsCreateModalOpen(false)} className="px-6 py-2 border rounded-lg hover:bg-gray-100">
                  Cancel
                </button>
                <button
                  onClick={createSettlement}
                  disabled={!selectedDriver || selectedTrips.length === 0}
                  className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400"
                >
                  Create Settlement ({selectedTrips.length} trips)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Charge Modal */}
      {isChargeModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => setIsChargeModalOpen(false)}></div>
          <div className="relative min-h-screen flex items-center justify-center p-4">
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md">
              <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold text-white">Add Trip Charge</h2>
                  <button onClick={() => setIsChargeModalOpen(false)} className="text-white text-2xl">&times;</button>
                </div>
              </div>

              <div className="p-6 space-y-4">
                {!chargeForm.trip_id && (
                  <div>
                    <label className="block text-sm font-medium mb-1">Select Trip</label>
                    <select
                      value={chargeForm.trip_id}
                      onChange={e => setChargeForm({ ...chargeForm, trip_id: e.target.value })}
                      className="w-full px-4 py-2 border rounded-lg"
                    >
                      <option value="">Select Trip</option>
                      {pendingTrips.map(t => (
                        <option key={t.id} value={t.id}>
                          {t.trip_number} - {t.container_number}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium mb-1">Charge Type</label>
                  <select
                    value={chargeForm.charge_type}
                    onChange={e => handleChargeTypeChange(e.target.value)}
                    className="w-full px-4 py-2 border rounded-lg"
                  >
                    <optgroup label="Earnings">
                      {chargeTypes.filter(c => c.category === 'EARNING').map(c => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Deductions">
                      {chargeTypes.filter(c => c.category === 'DEDUCTION').map(c => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Reimbursements">
                      {chargeTypes.filter(c => c.category === 'REIMBURSEMENT').map(c => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </optgroup>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Description</label>
                  <input
                    value={chargeForm.description}
                    onChange={e => setChargeForm({ ...chargeForm, description: e.target.value })}
                    className="w-full px-4 py-2 border rounded-lg"
                    placeholder="e.g., 3 hours waiting at APM"
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Quantity</label>
                    <input
                      type="number"
                      step="0.5"
                      value={chargeForm.quantity}
                      onChange={e => {
                        const qty = parseFloat(e.target.value);
                        setChargeForm({
                          ...chargeForm,
                          quantity: qty,
                          amount: qty * chargeForm.rate
                        });
                      }}
                      className="w-full px-4 py-2 border rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Rate ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={chargeForm.rate}
                      onChange={e => {
                        const rate = parseFloat(e.target.value);
                        setChargeForm({
                          ...chargeForm,
                          rate: rate,
                          amount: chargeForm.quantity * rate
                        });
                      }}
                      className="w-full px-4 py-2 border rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Amount ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={chargeForm.amount}
                      onChange={e => setChargeForm({ ...chargeForm, amount: parseFloat(e.target.value) })}
                      className="w-full px-4 py-2 border rounded-lg font-semibold"
                    />
                  </div>
                </div>

                <div className={`p-3 rounded-lg ${
                  chargeForm.charge_category === 'EARNING' ? 'bg-green-50 text-green-800' :
                  chargeForm.charge_category === 'DEDUCTION' ? 'bg-red-50 text-red-800' :
                  'bg-blue-50 text-blue-800'
                }`}>
                  <span className="font-medium">{chargeForm.charge_category}</span>: 
                  {chargeForm.charge_category === 'DEDUCTION' ? ' -' : ' '}${chargeForm.amount.toFixed(2)}
                </div>
              </div>

              <div className="px-6 py-4 bg-gray-50 border-t flex justify-between">
                <button onClick={() => setIsChargeModalOpen(false)} className="px-6 py-2 border rounded-lg hover:bg-gray-100">
                  Cancel
                </button>
                <button onClick={saveCharge} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                  Add Charge
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View Settlement Modal */}
      {viewingSettlement && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => setViewingSettlement(null)}></div>
          <div className="relative min-h-screen flex items-center justify-center p-4">
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl">
              <div className="bg-gradient-to-r from-gray-700 to-gray-800 px-6 py-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold text-white">
                    Settlement {viewingSettlement.settlement_number}
                  </h2>
                  <button onClick={() => setViewingSettlement(null)} className="text-white text-2xl">&times;</button>
                </div>
              </div>

              <div className="p-6">
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div>
                    <p className="text-sm text-gray-500">Driver</p>
                    <p className="font-semibold">
                      {viewingSettlement.drivers?.first_name} {viewingSettlement.drivers?.last_name}
                    </p>
                    <p className="text-sm text-gray-500">{viewingSettlement.drivers?.driver_type?.replace('_', ' ')}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Period</p>
                    <p className="font-semibold">
                      {new Date(viewingSettlement.period_start).toLocaleDateString()} - {new Date(viewingSettlement.period_end).toLocaleDateString()}
                    </p>
                    <p className="text-sm text-gray-500">{viewingSettlement.total_trips} trips, {viewingSettlement.total_miles} miles</p>
                  </div>
                </div>

                <div className="border rounded-lg overflow-hidden">
                  <div className="bg-green-50 px-4 py-3">
                    <h3 className="font-semibold text-green-800">Earnings</h3>
                  </div>
                  <div className="p-4 space-y-2">
                    <div className="flex justify-between">
                      <span>Trip Pay ({viewingSettlement.total_trips} trips)</span>
                      <span className="font-semibold">${viewingSettlement.gross_trip_pay?.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Waiting Time / Detention</span>
                      <span className="font-semibold">${viewingSettlement.waiting_pay?.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Accessorials</span>
                      <span className="font-semibold">${viewingSettlement.accessorial_pay?.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between border-t pt-2 font-bold text-green-700">
                      <span>Total Gross Pay</span>
                      <span>${viewingSettlement.total_gross_pay?.toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                <div className="border rounded-lg overflow-hidden mt-4">
                  <div className="bg-red-50 px-4 py-3">
                    <h3 className="font-semibold text-red-800">Deductions</h3>
                  </div>
                  <div className="p-4 space-y-2">
                    <div className="flex justify-between">
                      <span>Fuel Advances</span>
                      <span className="text-red-600">-${viewingSettlement.fuel_advances?.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Cash Advances</span>
                      <span className="text-red-600">-${viewingSettlement.cash_advances?.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Insurance</span>
                      <span className="text-red-600">-${viewingSettlement.insurance_deduction?.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between border-t pt-2 font-bold text-red-700">
                      <span>Total Deductions</span>
                      <span>-${viewingSettlement.total_deductions?.toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                <div className="border rounded-lg overflow-hidden mt-4">
                  <div className="bg-blue-50 px-4 py-3">
                    <h3 className="font-semibold text-blue-800">Reimbursements</h3>
                  </div>
                  <div className="p-4 space-y-2">
                    <div className="flex justify-between">
                      <span>Tolls</span>
                      <span>${viewingSettlement.toll_reimbursements?.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between border-t pt-2 font-bold text-blue-700">
                      <span>Total Reimbursements</span>
                      <span>${viewingSettlement.total_reimbursements?.toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-6 p-4 bg-gray-100 rounded-lg">
                  <div className="flex justify-between items-center">
                    <span className="text-xl font-bold">Net Pay</span>
                    <span className="text-3xl font-bold text-green-600">
                      ${viewingSettlement.net_pay?.toFixed(2)}
                    </span>
                  </div>
                </div>

                {viewingSettlement.status === 'PAID' && viewingSettlement.paid_date && (
                  <div className="mt-4 p-3 bg-green-50 rounded-lg text-green-800 text-center">
                    Paid on {new Date(viewingSettlement.paid_date).toLocaleDateString()}
                  </div>
                )}
              </div>

              <div className="px-6 py-4 bg-gray-50 border-t flex justify-end gap-2">
                <button onClick={() => setViewingSettlement(null)} className="px-6 py-2 border rounded-lg hover:bg-gray-100">
                  Close
                </button>
                <button className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                  Print / Export PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
