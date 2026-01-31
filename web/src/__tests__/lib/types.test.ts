import {
  DISPATCH_COLUMNS,
  LOAD_STATUS_LABELS,
  SHIPPING_LINE_LABELS,
  TERMINAL_LABELS,
} from '@/lib/types';

describe('Type Constants', () => {
  describe('DISPATCH_COLUMNS', () => {
    it('should have all required columns', () => {
      const columnIds = DISPATCH_COLUMNS.map(col => col.id);

      expect(columnIds).toContain('TRACKING');
      expect(columnIds).toContain('AVAILABLE');
      expect(columnIds).toContain('HOLD');
      expect(columnIds).toContain('DISPATCHED');
      expect(columnIds).toContain('COMPLETED');
    });

    it('should have labels for all columns', () => {
      DISPATCH_COLUMNS.forEach(col => {
        expect(col.label).toBeTruthy();
        expect(typeof col.label).toBe('string');
      });
    });

    it('should have colors for all columns', () => {
      DISPATCH_COLUMNS.forEach(col => {
        expect(col.color).toBeTruthy();
        expect(typeof col.color).toBe('string');
      });
    });
  });

  describe('LOAD_STATUS_LABELS', () => {
    it('should have labels for all load statuses', () => {
      const expectedStatuses = [
        'TRACKING', 'AVAILABLE', 'HOLD', 'APPOINTMENT_NEEDED',
        'READY_FOR_DISPATCH', 'DISPATCHED', 'IN_YARD', 'IN_TRANSIT',
        'AT_PICKUP', 'AT_DELIVERY', 'RETURNING', 'COMPLETED',
        'INVOICED', 'CANCELLED'
      ];

      expectedStatuses.forEach(status => {
        expect(LOAD_STATUS_LABELS[status as keyof typeof LOAD_STATUS_LABELS]).toBeTruthy();
      });
    });
  });

  describe('SHIPPING_LINE_LABELS', () => {
    it('should have labels for major shipping lines', () => {
      expect(SHIPPING_LINE_LABELS.MAERSK).toBe('Maersk');
      expect(SHIPPING_LINE_LABELS.MSC).toBe('MSC');
      expect(SHIPPING_LINE_LABELS.CMA_CGM).toBe('CMA CGM');
      expect(SHIPPING_LINE_LABELS.COSCO).toBe('COSCO');
      expect(SHIPPING_LINE_LABELS.EVERGREEN).toBe('Evergreen');
    });
  });

  describe('TERMINAL_LABELS', () => {
    it('should have labels for LA/LB terminals', () => {
      expect(TERMINAL_LABELS.APM_LA).toBe('APM Terminals - LA');
      expect(TERMINAL_LABELS.LBCT).toBe('Long Beach Container Terminal');
      expect(TERMINAL_LABELS.PCT).toBe('Pacific Container Terminal');
    });
  });
});
