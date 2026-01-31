'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

interface Customer {
  id: string;
  company_name: string;
  email: string;
  billing_address: string;
}

interface Trip {
  id: string;
  trip_number: string;
  container_number: string;
  pickup_location: string;
  delivery_location: string;
  actual_end: string;
  billable_amount: number;
  order_id: string;
  orders?: {
    order_number: string;
    customer_id: string;
    customers?: Customer;
  };
}

interface Invoice {
  id: string;
  invoice_number: string;
  customer_id: string;
  customer_name: string;
  invoice_date: string;
  due_date: string;
  subtotal: number;
  fuel_surcharge: number;
  total_amount: number;
  amount_paid: number;
  balance_due: number;
  status: string;
  billing_address?: string;
  notes?: string;
  customers?: Customer;
  invoice_line_items?: InvoiceLineItem[];
}

interface InvoiceLineItem {
  id: string;
  invoice_id: string;
  line_type: string;
  description: string;
  container_number: string;
  quantity: number;
  unit_price: number;
  amount: number;
  service_date: string;
}

interface AccessorialType {
  id: string;
  code: string;
  name: string;
  default_rate: number;
  rate_type: string;
}

export default function InvoicesPage() {
  const [activeTab, setActiveTab] = useState<'invoices' | 'create' | 'aging' | 'quickbooks'>('invoices');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [pendingTrips, setPendingTrips] = useState<Trip[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [accessorials, setAccessorials] = useState<AccessorialType[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Create invoice state
  const [selectedCustomer, setSelectedCustomer] = useState<string>('');
  const [selectedTrips, setSelectedTrips] = useState<string[]>([]);
  const [lineItems, setLineItems] = useState<any[]>([]);
  const [invoiceNotes, setInvoiceNotes] = useState('');
  const [fuelSurchargePercent, setFuelSurchargePercent] = useState(0);
  
  // View/Edit invoice
  const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    amount: 0,
    payment_method: 'CHECK',
    reference_number: '',
    payment_date: new Date().toISOString().split('T')[0],
  });

  // Aging data
  const [agingData, setAgingData] = useState<any[]>([]);
  const [agingSummary, setAgingSummary] = useState({
    current: 0,
    days_1_30: 0,
    days_31_60: 0,
    days_61_90: 0,
    days_90_plus: 0,
    total: 0,
  });

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (selectedCustomer) {
      fetchPendingTripsForCustomer(selectedCustomer);
    }
  }, [selectedCustomer]);

  const fetchData = async () => {
    try {
      setLoading(true);

      // Fetch invoices
      const { data: invoicesData } = await supabase
        .from('invoices')
        .select('*, customers(company_name, email)')
        .order('created_at', { ascending: false })
        .limit(100);
      setInvoices(invoicesData || []);

      // Fetch customers
      const { data: customersData } = await supabase
        .from('customers')
        .select('*')
        .eq('status', 'ACTIVE')
        .order('company_name');
      setCustomers(customersData || []);

      // Fetch accessorials
      const { data: accessorialsData } = await supabase
        .from('accessorial_types')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');
      setAccessorials(accessorialsData || []);

      // Calculate aging
      await fetchAgingData();

    } catch (err: any) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchPendingTripsForCustomer = async (customerId: string) => {
    const { data } = await supabase
      .from('trips')
      .select(`
        *,
        orders(
          order_number,
          customer_id,
          customers(company_name)
        )
      `)
      .eq('orders.customer_id', customerId)
      .in('status', ['COMPLETED', 'DELIVERED'])
      .is('invoice_id', null)
      .order('actual_end', { ascending: false });
    
    setPendingTrips(data || []);
  };

  const fetchAgingData = async () => {
    const { data } = await supabase
      .from('invoices')
      .select('*')
      .not('status', 'in', '("VOID","DRAFT","PAID")')
      .gt('balance_due', 0);

    if (data) {
      const today = new Date();
      let current = 0, days_1_30 = 0, days_31_60 = 0, days_61_90 = 0, days_90_plus = 0;

      const processed = data.map(inv => {
        const dueDate = new Date(inv.due_date);
        const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
        let bucket = 'CURRENT';
        
        if (daysOverdue <= 0) {
          bucket = 'CURRENT';
          current += inv.balance_due;
        } else if (daysOverdue <= 30) {
          bucket = '1-30';
          days_1_30 += inv.balance_due;
        } else if (daysOverdue <= 60) {
          bucket = '31-60';
          days_31_60 += inv.balance_due;
        } else if (daysOverdue <= 90) {
          bucket = '61-90';
          days_61_90 += inv.balance_due;
        } else {
          bucket = '90+';
          days_90_plus += inv.balance_due;
        }

        return { ...inv, days_overdue: daysOverdue, aging_bucket: bucket };
      });

      setAgingData(processed);
      setAgingSummary({
        current,
        days_1_30,
        days_31_60,
        days_61_90,
        days_90_plus,
        total: current + days_1_30 + days_31_60 + days_61_90 + days_90_plus,
      });
    }
  };

  const toggleTripSelection = (tripId: string) => {
    if (selectedTrips.includes(tripId)) {
      setSelectedTrips(selectedTrips.filter(id => id !== tripId));
      setLineItems(lineItems.filter(li => li.trip_id !== tripId));
    } else {
      setSelectedTrips([...selectedTrips, tripId]);
      const trip = pendingTrips.find(t => t.id === tripId);
      if (trip) {
        setLineItems([...lineItems, {
          trip_id: trip.id,
          line_type: 'BASE_CHARGE',
          description: `Drayage: ${trip.pickup_location} → ${trip.delivery_location}`,
          container_number: trip.container_number,
          service_date: trip.actual_end?.split('T')[0],
          quantity: 1,
          unit_price: trip.billable_amount || 250,
          amount: trip.billable_amount || 250,
        }]);
      }
    }
  };

  const addAccessorialLine = () => {
    setLineItems([...lineItems, {
      trip_id: null,
      line_type: 'ACCESSORIAL',
      accessorial_code: '',
      description: '',
      container_number: '',
      service_date: new Date().toISOString().split('T')[0],
      quantity: 1,
      unit_price: 0,
      amount: 0,
    }]);
  };

  const updateLineItem = (index: number, field: string, value: any) => {
    const updated = [...lineItems];
    updated[index][field] = value;
    
    if (field === 'accessorial_code') {
      const acc = accessorials.find(a => a.code === value);
      if (acc) {
        updated[index].description = acc.name;
        updated[index].unit_price = acc.default_rate;
        updated[index].amount = acc.default_rate * updated[index].quantity;
      }
    }
    
    if (field === 'quantity' || field === 'unit_price') {
      updated[index].amount = updated[index].quantity * updated[index].unit_price;
    }
    
    setLineItems(updated);
  };

  const removeLineItem = (index: number) => {
    const item = lineItems[index];
    if (item.trip_id) {
      setSelectedTrips(selectedTrips.filter(id => id !== item.trip_id));
    }
    setLineItems(lineItems.filter((_, i) => i !== index));
  };

  const calculateTotals = () => {
    const subtotal = lineItems.reduce((sum, li) => sum + (li.amount || 0), 0);
    const fuelSurcharge = subtotal * (fuelSurchargePercent / 100);
    const total = subtotal + fuelSurcharge;
    return { subtotal, fuelSurcharge, total };
  };

  const createInvoice = async () => {
    if (!selectedCustomer || lineItems.length === 0) {
      alert('Please select a customer and add line items');
      return;
    }

    const customer = customers.find(c => c.id === selectedCustomer);
    const { subtotal, fuelSurcharge, total } = calculateTotals();

    try {
      // Create invoice
      const { data: invoice, error: invError } = await supabase
        .from('invoices')
        .insert({
          customer_id: selectedCustomer,
          customer_name: customer?.company_name,
          billing_address: customer?.billing_address,
          invoice_date: new Date().toISOString().split('T')[0],
          due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          payment_terms: 'Net 30',
          subtotal,
          fuel_surcharge: fuelSurcharge,
          total_amount: total,
          balance_due: total,
          status: 'DRAFT',
          notes: invoiceNotes,
        })
        .select()
        .single();

      if (invError) throw invError;

      // Create line items
      const lineItemsToInsert = lineItems.map((li, idx) => ({
        invoice_id: invoice.id,
        trip_id: li.trip_id,
        line_type: li.line_type,
        description: li.description,
        container_number: li.container_number,
        service_date: li.service_date,
        quantity: li.quantity,
        unit_price: li.unit_price,
        amount: li.amount,
        accessorial_code: li.accessorial_code,
        sort_order: idx,
      }));

      await supabase.from('invoice_line_items').insert(lineItemsToInsert);

      // Update trips
      if (selectedTrips.length > 0) {
        await supabase
          .from('trips')
          .update({ invoice_id: invoice.id, invoice_status: 'INVOICED' })
          .in('id', selectedTrips);
      }

      // Add fuel surcharge line if applicable
      if (fuelSurcharge > 0) {
        await supabase.from('invoice_line_items').insert({
          invoice_id: invoice.id,
          line_type: 'FUEL_SURCHARGE',
          description: `Fuel Surcharge (${fuelSurchargePercent}%)`,
          quantity: 1,
          unit_price: fuelSurcharge,
          amount: fuelSurcharge,
          sort_order: lineItems.length,
        });
      }

      alert(`Invoice ${invoice.invoice_number} created successfully!`);
      
      // Reset form
      setSelectedCustomer('');
      setSelectedTrips([]);
      setLineItems([]);
      setInvoiceNotes('');
      setFuelSurchargePercent(0);
      setActiveTab('invoices');
      fetchData();

    } catch (err: any) {
      console.error('Error:', err);
      alert('Error creating invoice: ' + err.message);
    }
  };

  const viewInvoice = async (invoice: Invoice) => {
    const { data } = await supabase
      .from('invoices')
      .select('*, invoice_line_items(*)')
      .eq('id', invoice.id)
      .single();
    
    setViewingInvoice(data);
  };

  const updateInvoiceStatus = async (invoiceId: string, status: string) => {
    await supabase.from('invoices').update({ status, sent_date: status === 'SENT' ? new Date().toISOString() : undefined }).eq('id', invoiceId);
    fetchData();
    if (viewingInvoice?.id === invoiceId) {
      setViewingInvoice({ ...viewingInvoice, status });
    }
  };

  const recordPayment = async () => {
    if (!viewingInvoice) return;

    try {
      await supabase.from('invoice_payments').insert({
        invoice_id: viewingInvoice.id,
        ...paymentForm,
      });

      setIsPaymentModalOpen(false);
      setPaymentForm({
        amount: 0,
        payment_method: 'CHECK',
        reference_number: '',
        payment_date: new Date().toISOString().split('T')[0],
      });
      
      fetchData();
      viewInvoice(viewingInvoice);
      alert('Payment recorded!');
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const generateInvoicePDF = (invoice: Invoice) => {
    // Create printable HTML
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Invoice ${invoice.invoice_number}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; }
          .header { display: flex; justify-content: space-between; margin-bottom: 40px; }
          .company { font-size: 24px; font-weight: bold; color: #1a56db; }
          .invoice-title { font-size: 32px; color: #374151; }
          .invoice-number { font-size: 14px; color: #6b7280; }
          .addresses { display: flex; justify-content: space-between; margin-bottom: 30px; }
          .address-block { width: 45%; }
          .address-label { font-weight: bold; color: #374151; margin-bottom: 5px; }
          .info-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 30px; padding: 15px; background: #f9fafb; border-radius: 8px; }
          .info-item label { font-size: 12px; color: #6b7280; }
          .info-item p { font-weight: bold; margin: 5px 0 0 0; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
          th { background: #f3f4f6; padding: 12px; text-align: left; border-bottom: 2px solid #e5e7eb; }
          td { padding: 12px; border-bottom: 1px solid #e5e7eb; }
          .amount { text-align: right; }
          .totals { margin-left: auto; width: 300px; }
          .total-row { display: flex; justify-content: space-between; padding: 8px 0; }
          .total-row.grand { font-size: 18px; font-weight: bold; border-top: 2px solid #374151; padding-top: 15px; }
          .notes { margin-top: 40px; padding: 15px; background: #f9fafb; border-radius: 8px; }
          .footer { margin-top: 50px; text-align: center; color: #6b7280; font-size: 12px; }
          @media print { body { padding: 20px; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="company">DrayMaster TMS</div>
            <div style="color: #6b7280; margin-top: 5px;">Intermodal Drayage Services</div>
          </div>
          <div style="text-align: right;">
            <div class="invoice-title">INVOICE</div>
            <div class="invoice-number">${invoice.invoice_number}</div>
          </div>
        </div>

        <div class="addresses">
          <div class="address-block">
            <div class="address-label">Bill To:</div>
            <div style="font-size: 16px; font-weight: bold;">${invoice.customer_name}</div>
            <div style="white-space: pre-line; color: #6b7280;">${invoice.billing_address || ''}</div>
          </div>
          <div class="address-block">
            <div class="address-label">From:</div>
            <div>DrayMaster TMS</div>
            <div style="color: #6b7280;">123 Logistics Way<br/>Los Angeles, CA 90001</div>
          </div>
        </div>

        <div class="info-grid">
          <div class="info-item">
            <label>Invoice Date</label>
            <p>${new Date(invoice.invoice_date).toLocaleDateString()}</p>
          </div>
          <div class="info-item">
            <label>Due Date</label>
            <p>${new Date(invoice.due_date).toLocaleDateString()}</p>
          </div>
          <div class="info-item">
            <label>Terms</label>
            <p>Net 30</p>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Description</th>
              <th>Container</th>
              <th>Date</th>
              <th style="text-align: right;">Qty</th>
              <th style="text-align: right;">Rate</th>
              <th style="text-align: right;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${(invoice.invoice_line_items || []).map(item => `
              <tr>
                <td>${item.description}</td>
                <td>${item.container_number || '-'}</td>
                <td>${item.service_date ? new Date(item.service_date).toLocaleDateString() : '-'}</td>
                <td class="amount">${item.quantity}</td>
                <td class="amount">$${item.unit_price?.toFixed(2)}</td>
                <td class="amount">$${item.amount?.toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="totals">
          <div class="total-row">
            <span>Subtotal:</span>
            <span>$${invoice.subtotal?.toFixed(2)}</span>
          </div>
          ${invoice.fuel_surcharge > 0 ? `
          <div class="total-row">
            <span>Fuel Surcharge:</span>
            <span>$${invoice.fuel_surcharge?.toFixed(2)}</span>
          </div>
          ` : ''}
          <div class="total-row grand">
            <span>Total Due:</span>
            <span>$${invoice.total_amount?.toFixed(2)}</span>
          </div>
          ${invoice.amount_paid > 0 ? `
          <div class="total-row" style="color: #059669;">
            <span>Paid:</span>
            <span>-$${invoice.amount_paid?.toFixed(2)}</span>
          </div>
          <div class="total-row" style="font-weight: bold;">
            <span>Balance Due:</span>
            <span>$${invoice.balance_due?.toFixed(2)}</span>
          </div>
          ` : ''}
        </div>

        ${invoice.notes ? `
        <div class="notes">
          <strong>Notes:</strong><br/>
          ${invoice.notes}
        </div>
        ` : ''}

        <div class="footer">
          <p>Thank you for your business!</p>
          <p>Payment is due within 30 days. Please include invoice number with payment.</p>
        </div>

        <script>window.onload = function() { window.print(); }</script>
      </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  const exportToQuickBooks = () => {
    // Generate QuickBooks IIF format
    const selectedInvoices = invoices.filter(i => i.status !== 'VOID');
    
    let iifContent = '!TRNS\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tDOCNUM\tMEMO\n';
    iifContent += '!SPL\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tDOCNUM\tMEMO\n';
    iifContent += '!ENDTRNS\n';

    selectedInvoices.forEach(inv => {
      const date = new Date(inv.invoice_date).toLocaleDateString('en-US');
      
      // Main transaction line (debit to Accounts Receivable)
      iifContent += `TRNS\tINVOICE\t${date}\tAccounts Receivable\t${inv.customer_name}\t${inv.total_amount}\t${inv.invoice_number}\tDrayage Services\n`;
      
      // Split line (credit to Revenue)
      iifContent += `SPL\tINVOICE\t${date}\tTransportation Revenue\t${inv.customer_name}\t-${inv.total_amount}\t${inv.invoice_number}\tDrayage Services\n`;
      
      iifContent += 'ENDTRNS\n';
    });

    // Download file
    const blob = new Blob([iifContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `quickbooks_invoices_${new Date().toISOString().split('T')[0]}.iif`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportToCSV = () => {
    let csv = 'Invoice Number,Customer,Invoice Date,Due Date,Subtotal,Fuel Surcharge,Total,Paid,Balance,Status\n';
    
    invoices.forEach(inv => {
      csv += `${inv.invoice_number},"${inv.customer_name}",${inv.invoice_date},${inv.due_date},${inv.subtotal},${inv.fuel_surcharge},${inv.total_amount},${inv.amount_paid},${inv.balance_due},${inv.status}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `invoices_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      'DRAFT': 'bg-gray-100 text-gray-800',
      'SENT': 'bg-blue-100 text-blue-800',
      'VIEWED': 'bg-purple-100 text-purple-800',
      'PARTIAL': 'bg-yellow-100 text-yellow-800',
      'PAID': 'bg-green-100 text-green-800',
      'OVERDUE': 'bg-red-100 text-red-800',
      'VOID': 'bg-gray-200 text-gray-500',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const { subtotal, fuelSurcharge, total } = calculateTotals();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Invoicing</h1>
          <p className="text-gray-500 mt-1">Create invoices, track payments, export to QuickBooks</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportToCSV}
            className="px-4 py-2 border rounded-lg hover:bg-gray-50"
          >
            Export CSV
          </button>
          <button
            onClick={() => setActiveTab('create')}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            + Create Invoice
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-5 gap-4">
        <div className="bg-white rounded-xl shadow p-4 border-l-4 border-blue-500">
          <p className="text-sm text-gray-500">Total Outstanding</p>
          <p className="text-2xl font-bold text-blue-600">${agingSummary.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4 border-l-4 border-green-500">
          <p className="text-sm text-gray-500">Current</p>
          <p className="text-2xl font-bold text-green-600">${agingSummary.current.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4 border-l-4 border-yellow-500">
          <p className="text-sm text-gray-500">1-30 Days</p>
          <p className="text-2xl font-bold text-yellow-600">${agingSummary.days_1_30.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4 border-l-4 border-orange-500">
          <p className="text-sm text-gray-500">31-60 Days</p>
          <p className="text-2xl font-bold text-orange-600">${agingSummary.days_31_60.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4 border-l-4 border-red-500">
          <p className="text-sm text-gray-500">60+ Days</p>
          <p className="text-2xl font-bold text-red-600">${(agingSummary.days_61_90 + agingSummary.days_90_plus).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow">
        <div className="border-b px-6">
          <div className="flex gap-4">
            {[
              { id: 'invoices', label: 'All Invoices' },
              { id: 'create', label: 'Create Invoice' },
              { id: 'aging', label: 'Aging Report' },
              { id: 'quickbooks', label: 'QuickBooks Export' },
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
              </button>
            ))}
          </div>
        </div>

        <div className="p-6">
          {/* All Invoices Tab */}
          {activeTab === 'invoices' && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice #</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Due Date</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Paid</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Balance</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {invoices.map((invoice) => (
                    <tr key={invoice.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono font-semibold text-blue-600">
                        {invoice.invoice_number}
                      </td>
                      <td className="px-4 py-3">{invoice.customer_name}</td>
                      <td className="px-4 py-3 text-sm">{new Date(invoice.invoice_date).toLocaleDateString()}</td>
                      <td className="px-4 py-3 text-sm">{new Date(invoice.due_date).toLocaleDateString()}</td>
                      <td className="px-4 py-3 text-right font-semibold">${invoice.total_amount?.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right text-green-600">${invoice.amount_paid?.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right font-bold">${invoice.balance_due?.toFixed(2)}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs ${getStatusColor(invoice.status)}`}>
                          {invoice.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <button
                            onClick={() => viewInvoice(invoice)}
                            className="px-2 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200"
                          >
                            View
                          </button>
                          <button
                            onClick={() => generateInvoicePDF(invoice)}
                            className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                          >
                            PDF
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {invoices.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No invoices found. Create your first invoice!
                </div>
              )}
            </div>
          )}

          {/* Create Invoice Tab */}
          {activeTab === 'create' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium mb-1">Select Customer *</label>
                  <select
                    value={selectedCustomer}
                    onChange={e => {
                      setSelectedCustomer(e.target.value);
                      setSelectedTrips([]);
                      setLineItems([]);
                    }}
                    className="w-full px-4 py-2 border rounded-lg"
                  >
                    <option value="">Choose a customer</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>{c.company_name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Fuel Surcharge %</label>
                  <input
                    type="number"
                    step="0.5"
                    value={fuelSurchargePercent}
                    onChange={e => setFuelSurchargePercent(parseFloat(e.target.value) || 0)}
                    className="w-full px-4 py-2 border rounded-lg"
                    placeholder="0"
                  />
                </div>
              </div>

              {selectedCustomer && pendingTrips.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-2">Completed Trips (Ready to Invoice)</h3>
                  <div className="border rounded-lg max-h-48 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left w-8"></th>
                          <th className="px-3 py-2 text-left">Trip #</th>
                          <th className="px-3 py-2 text-left">Container</th>
                          <th className="px-3 py-2 text-left">Route</th>
                          <th className="px-3 py-2 text-left">Date</th>
                          <th className="px-3 py-2 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {pendingTrips.map(trip => (
                          <tr
                            key={trip.id}
                            className={`cursor-pointer ${selectedTrips.includes(trip.id) ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
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
                            <td className="px-3 py-2">{trip.container_number || '-'}</td>
                            <td className="px-3 py-2">{trip.pickup_location} → {trip.delivery_location}</td>
                            <td className="px-3 py-2">{trip.actual_end ? new Date(trip.actual_end).toLocaleDateString() : '-'}</td>
                            <td className="px-3 py-2 text-right">${trip.billable_amount?.toFixed(2) || '0.00'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div>
                <div className="flex justify-between items-center mb-2">
                  <h3 className="font-semibold">Line Items</h3>
                  <button
                    onClick={addAccessorialLine}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    + Add Accessorial/Charge
                  </button>
                </div>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left">Type</th>
                        <th className="px-3 py-2 text-left">Description</th>
                        <th className="px-3 py-2 text-left">Container</th>
                        <th className="px-3 py-2 text-right">Qty</th>
                        <th className="px-3 py-2 text-right">Rate</th>
                        <th className="px-3 py-2 text-right">Amount</th>
                        <th className="px-3 py-2 w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {lineItems.map((item, idx) => (
                        <tr key={idx}>
                          <td className="px-3 py-2">
                            {item.line_type === 'BASE_CHARGE' ? (
                              <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">Base</span>
                            ) : (
                              <select
                                value={item.accessorial_code || ''}
                                onChange={e => updateLineItem(idx, 'accessorial_code', e.target.value)}
                                className="text-xs border rounded px-2 py-1"
                              >
                                <option value="">Select...</option>
                                {accessorials.map(a => (
                                  <option key={a.code} value={a.code}>{a.name}</option>
                                ))}
                              </select>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <input
                              value={item.description}
                              onChange={e => updateLineItem(idx, 'description', e.target.value)}
                              className="w-full border rounded px-2 py-1 text-sm"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              value={item.container_number || ''}
                              onChange={e => updateLineItem(idx, 'container_number', e.target.value)}
                              className="w-24 border rounded px-2 py-1 text-sm"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              value={item.quantity}
                              onChange={e => updateLineItem(idx, 'quantity', parseFloat(e.target.value))}
                              className="w-16 border rounded px-2 py-1 text-sm text-right"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              step="0.01"
                              value={item.unit_price}
                              onChange={e => updateLineItem(idx, 'unit_price', parseFloat(e.target.value))}
                              className="w-24 border rounded px-2 py-1 text-sm text-right"
                            />
                          </td>
                          <td className="px-3 py-2 text-right font-semibold">
                            ${item.amount?.toFixed(2)}
                          </td>
                          <td className="px-3 py-2">
                            <button
                              onClick={() => removeLineItem(idx)}
                              className="text-red-500 hover:text-red-700"
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {lineItems.length === 0 && (
                    <div className="text-center py-4 text-gray-500">
                      Select trips or add line items
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-6">
                <div className="flex-1">
                  <label className="block text-sm font-medium mb-1">Invoice Notes</label>
                  <textarea
                    value={invoiceNotes}
                    onChange={e => setInvoiceNotes(e.target.value)}
                    className="w-full px-4 py-2 border rounded-lg"
                    rows={3}
                    placeholder="Additional notes..."
                  />
                </div>
                <div className="w-64 bg-gray-50 p-4 rounded-lg">
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span>Subtotal:</span>
                      <span>${subtotal.toFixed(2)}</span>
                    </div>
                    {fuelSurchargePercent > 0 && (
                      <div className="flex justify-between text-sm text-gray-600">
                        <span>Fuel ({fuelSurchargePercent}%):</span>
                        <span>${fuelSurcharge.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold text-lg border-t pt-2">
                      <span>Total:</span>
                      <span>${total.toFixed(2)}</span>
                    </div>
                  </div>
                  <button
                    onClick={createInvoice}
                    disabled={!selectedCustomer || lineItems.length === 0}
                    className="w-full mt-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400"
                  >
                    Create Invoice
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Aging Report Tab */}
          {activeTab === 'aging' && (
            <div>
              <div className="grid grid-cols-6 gap-4 mb-6">
                <div className="bg-gray-50 p-4 rounded-lg text-center">
                  <p className="text-sm text-gray-500">Current</p>
                  <p className="text-xl font-bold text-green-600">${agingSummary.current.toFixed(2)}</p>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg text-center">
                  <p className="text-sm text-gray-500">1-30 Days</p>
                  <p className="text-xl font-bold text-yellow-600">${agingSummary.days_1_30.toFixed(2)}</p>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg text-center">
                  <p className="text-sm text-gray-500">31-60 Days</p>
                  <p className="text-xl font-bold text-orange-600">${agingSummary.days_31_60.toFixed(2)}</p>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg text-center">
                  <p className="text-sm text-gray-500">61-90 Days</p>
                  <p className="text-xl font-bold text-red-500">${agingSummary.days_61_90.toFixed(2)}</p>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg text-center">
                  <p className="text-sm text-gray-500">90+ Days</p>
                  <p className="text-xl font-bold text-red-700">${agingSummary.days_90_plus.toFixed(2)}</p>
                </div>
                <div className="bg-blue-50 p-4 rounded-lg text-center">
                  <p className="text-sm text-gray-500">Total</p>
                  <p className="text-xl font-bold text-blue-600">${agingSummary.total.toFixed(2)}</p>
                </div>
              </div>

              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Due Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Days Overdue</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Bucket</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Balance Due</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {agingData.map((inv) => (
                    <tr key={inv.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono">{inv.invoice_number}</td>
                      <td className="px-4 py-3">{inv.customer_name}</td>
                      <td className="px-4 py-3">{new Date(inv.due_date).toLocaleDateString()}</td>
                      <td className="px-4 py-3">
                        {inv.days_overdue > 0 ? (
                          <span className="text-red-600">{inv.days_overdue} days</span>
                        ) : (
                          <span className="text-green-600">Not due</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs ${
                          inv.aging_bucket === 'CURRENT' ? 'bg-green-100 text-green-800' :
                          inv.aging_bucket === '1-30' ? 'bg-yellow-100 text-yellow-800' :
                          inv.aging_bucket === '31-60' ? 'bg-orange-100 text-orange-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {inv.aging_bucket}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-bold">${inv.balance_due?.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* QuickBooks Export Tab */}
          {activeTab === 'quickbooks' && (
            <div className="max-w-2xl mx-auto text-center py-8">
              <div className="text-6xl mb-4">📊</div>
              <h2 className="text-2xl font-bold mb-4">QuickBooks Integration</h2>
              <p className="text-gray-600 mb-8">
                Export your invoices in QuickBooks IIF format for easy import into QuickBooks Desktop,
                or CSV format for QuickBooks Online.
              </p>
              
              <div className="grid grid-cols-2 gap-6">
                <div className="border rounded-xl p-6 hover:shadow-lg transition">
                  <div className="text-4xl mb-3">📄</div>
                  <h3 className="font-semibold mb-2">IIF Format</h3>
                  <p className="text-sm text-gray-500 mb-4">For QuickBooks Desktop</p>
                  <button
                    onClick={exportToQuickBooks}
                    className="w-full py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                  >
                    Download IIF File
                  </button>
                </div>
                <div className="border rounded-xl p-6 hover:shadow-lg transition">
                  <div className="text-4xl mb-3">📊</div>
                  <h3 className="font-semibold mb-2">CSV Format</h3>
                  <p className="text-sm text-gray-500 mb-4">For QuickBooks Online</p>
                  <button
                    onClick={exportToCSV}
                    className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Download CSV File
                  </button>
                </div>
              </div>

              <div className="mt-8 p-4 bg-yellow-50 rounded-lg text-left">
                <h4 className="font-semibold text-yellow-800 mb-2">Import Instructions:</h4>
                <ol className="text-sm text-yellow-700 list-decimal list-inside space-y-1">
                  <li>Download the appropriate file format</li>
                  <li>Open QuickBooks and go to File → Utilities → Import</li>
                  <li>Select IIF Files (Desktop) or Bank/Credit Card → CSV (Online)</li>
                  <li>Choose the downloaded file and follow the prompts</li>
                </ol>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* View Invoice Modal */}
      {viewingInvoice && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => setViewingInvoice(null)}></div>
          <div className="relative min-h-screen flex items-center justify-center p-4">
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-hidden">
              <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-white">Invoice {viewingInvoice.invoice_number}</h2>
                    <p className="text-blue-200">{viewingInvoice.customer_name}</p>
                  </div>
                  <button onClick={() => setViewingInvoice(null)} className="text-white text-2xl">&times;</button>
                </div>
              </div>

              <div className="p-6 overflow-y-auto max-h-[60vh]">
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div>
                    <p className="text-sm text-gray-500">Invoice Date</p>
                    <p className="font-semibold">{new Date(viewingInvoice.invoice_date).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Due Date</p>
                    <p className="font-semibold">{new Date(viewingInvoice.due_date).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Status</p>
                    <span className={`px-2 py-1 rounded text-sm ${getStatusColor(viewingInvoice.status)}`}>
                      {viewingInvoice.status}
                    </span>
                  </div>
                </div>

                <table className="w-full mb-6">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Description</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Container</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Qty</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Rate</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {viewingInvoice.invoice_line_items?.map((item) => (
                      <tr key={item.id}>
                        <td className="px-3 py-2">{item.description}</td>
                        <td className="px-3 py-2">{item.container_number || '-'}</td>
                        <td className="px-3 py-2 text-right">{item.quantity}</td>
                        <td className="px-3 py-2 text-right">${item.unit_price?.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right font-semibold">${item.amount?.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="flex justify-end">
                  <div className="w-64 space-y-2">
                    <div className="flex justify-between">
                      <span>Subtotal:</span>
                      <span>${viewingInvoice.subtotal?.toFixed(2)}</span>
                    </div>
                    {viewingInvoice.fuel_surcharge > 0 && (
                      <div className="flex justify-between text-sm text-gray-600">
                        <span>Fuel Surcharge:</span>
                        <span>${viewingInvoice.fuel_surcharge?.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold border-t pt-2">
                      <span>Total:</span>
                      <span>${viewingInvoice.total_amount?.toFixed(2)}</span>
                    </div>
                    {viewingInvoice.amount_paid > 0 && (
                      <>
                        <div className="flex justify-between text-green-600">
                          <span>Paid:</span>
                          <span>-${viewingInvoice.amount_paid?.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between font-bold text-lg">
                          <span>Balance Due:</span>
                          <span>${viewingInvoice.balance_due?.toFixed(2)}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="px-6 py-4 bg-gray-50 border-t flex justify-between">
                <div className="flex gap-2">
                  {viewingInvoice.status === 'DRAFT' && (
                    <button
                      onClick={() => updateInvoiceStatus(viewingInvoice.id, 'SENT')}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      Mark as Sent
                    </button>
                  )}
                  {viewingInvoice.balance_due > 0 && (
                    <button
                      onClick={() => {
                        setPaymentForm({ ...paymentForm, amount: viewingInvoice.balance_due });
                        setIsPaymentModalOpen(true);
                      }}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                    >
                      Record Payment
                    </button>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => generateInvoicePDF(viewingInvoice)}
                    className="px-4 py-2 border rounded-lg hover:bg-gray-100"
                  >
                    Print / PDF
                  </button>
                  <button
                    onClick={() => setViewingInvoice(null)}
                    className="px-4 py-2 border rounded-lg hover:bg-gray-100"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {isPaymentModalOpen && viewingInvoice && (
        <div className="fixed inset-0 z-[60] overflow-y-auto">
          <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => setIsPaymentModalOpen(false)}></div>
          <div className="relative min-h-screen flex items-center justify-center p-4">
            <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md">
              <div className="bg-green-600 px-6 py-4 rounded-t-xl">
                <h2 className="text-xl font-bold text-white">Record Payment</h2>
                <p className="text-green-200">Invoice {viewingInvoice.invoice_number}</p>
              </div>

              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Payment Amount *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={paymentForm.amount}
                    onChange={e => setPaymentForm({ ...paymentForm, amount: parseFloat(e.target.value) })}
                    className="w-full px-4 py-2 border rounded-lg text-lg font-semibold"
                  />
                  <p className="text-sm text-gray-500 mt-1">Balance due: ${viewingInvoice.balance_due?.toFixed(2)}</p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Payment Method</label>
                  <select
                    value={paymentForm.payment_method}
                    onChange={e => setPaymentForm({ ...paymentForm, payment_method: e.target.value })}
                    className="w-full px-4 py-2 border rounded-lg"
                  >
                    <option value="CHECK">Check</option>
                    <option value="ACH">ACH/Wire</option>
                    <option value="CREDIT_CARD">Credit Card</option>
                    <option value="CASH">Cash</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Reference # (Check #, Trans ID)</label>
                  <input
                    value={paymentForm.reference_number}
                    onChange={e => setPaymentForm({ ...paymentForm, reference_number: e.target.value })}
                    className="w-full px-4 py-2 border rounded-lg"
                    placeholder="e.g., Check #1234"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Payment Date</label>
                  <input
                    type="date"
                    value={paymentForm.payment_date}
                    onChange={e => setPaymentForm({ ...paymentForm, payment_date: e.target.value })}
                    className="w-full px-4 py-2 border rounded-lg"
                  />
                </div>
              </div>

              <div className="px-6 py-4 bg-gray-50 border-t flex justify-end gap-2 rounded-b-xl">
                <button
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  onClick={recordPayment}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  Record Payment
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
