// Mock the entire supabase module
jest.mock('@/lib/supabase', () => {
  const originalModule = jest.requireActual('@/lib/supabase');

  return {
    ...originalModule,
    getCustomers: jest.fn(),
    createCustomer: jest.fn(),
    deleteCustomer: jest.fn(),
    getDrivers: jest.fn(),
    updateDriverStatus: jest.fn(),
    updateTripStatus: jest.fn(),
    deleteInvoice: jest.fn(),
  };
});

import {
  getCustomers,
  createCustomer,
  deleteCustomer,
  getDrivers,
  updateDriverStatus,
  updateTripStatus,
  deleteInvoice,
} from '@/lib/supabase';

// Cast to jest.Mock for type safety
const mockGetCustomers = getCustomers as jest.Mock;
const mockCreateCustomer = createCustomer as jest.Mock;
const mockDeleteCustomer = deleteCustomer as jest.Mock;
const mockGetDrivers = getDrivers as jest.Mock;
const mockUpdateDriverStatus = updateDriverStatus as jest.Mock;
const mockUpdateTripStatus = updateTripStatus as jest.Mock;
const mockDeleteInvoice = deleteInvoice as jest.Mock;

describe('Supabase Customer Functions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getCustomers', () => {
    it('should return customer list on success', async () => {
      const mockCustomers = [
        { id: '1', company_name: 'Acme Inc', email: 'acme@test.com' },
        { id: '2', company_name: 'Beta Corp', email: 'beta@test.com' },
      ];
      mockGetCustomers.mockResolvedValueOnce(mockCustomers);

      const result = await getCustomers();

      expect(mockGetCustomers).toHaveBeenCalled();
      expect(result).toEqual(mockCustomers);
    });

    it('should return empty array on error', async () => {
      mockGetCustomers.mockResolvedValueOnce([]);

      const result = await getCustomers();

      expect(result).toEqual([]);
    });
  });

  describe('createCustomer', () => {
    it('should create a new customer', async () => {
      const newCustomer = { company_name: 'New Corp', email: 'new@test.com' };
      const createdCustomer = { id: '3', ...newCustomer };
      mockCreateCustomer.mockResolvedValueOnce(createdCustomer);

      const result = await createCustomer(newCustomer);

      expect(mockCreateCustomer).toHaveBeenCalledWith(newCustomer);
      expect(result).toEqual(createdCustomer);
    });

    it('should return null on error', async () => {
      mockCreateCustomer.mockResolvedValueOnce(null);

      const result = await createCustomer({ company_name: 'Test' });

      expect(result).toBeNull();
    });
  });

  describe('deleteCustomer', () => {
    it('should delete a customer by id', async () => {
      mockDeleteCustomer.mockResolvedValueOnce(true);

      const result = await deleteCustomer('123');

      expect(mockDeleteCustomer).toHaveBeenCalledWith('123');
      expect(result).toBe(true);
    });

    it('should return false on error', async () => {
      mockDeleteCustomer.mockResolvedValueOnce(false);

      const result = await deleteCustomer('123');

      expect(result).toBe(false);
    });
  });
});

describe('Supabase Driver Functions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getDrivers', () => {
    it('should fetch drivers', async () => {
      const mockDrivers = [
        { id: '1', first_name: 'John', last_name: 'Doe', status: 'ACTIVE' },
        { id: '2', first_name: 'Jane', last_name: 'Smith', status: 'ACTIVE' },
      ];
      mockGetDrivers.mockResolvedValueOnce(mockDrivers);

      const result = await getDrivers();

      expect(mockGetDrivers).toHaveBeenCalled();
      expect(result).toEqual(mockDrivers);
    });
  });

  describe('updateDriverStatus', () => {
    it('should update driver status', async () => {
      mockUpdateDriverStatus.mockResolvedValueOnce(true);

      const result = await updateDriverStatus('123', 'INACTIVE');

      expect(mockUpdateDriverStatus).toHaveBeenCalledWith('123', 'INACTIVE');
      expect(result).toBe(true);
    });

    it('should return false on error', async () => {
      mockUpdateDriverStatus.mockResolvedValueOnce(false);

      const result = await updateDriverStatus('123', 'INACTIVE');

      expect(result).toBe(false);
    });
  });
});

describe('Supabase Trip Functions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('updateTripStatus', () => {
    it('should update trip status', async () => {
      mockUpdateTripStatus.mockResolvedValueOnce(true);

      const result = await updateTripStatus('trip-123', 'COMPLETED');

      expect(mockUpdateTripStatus).toHaveBeenCalledWith('trip-123', 'COMPLETED');
      expect(result).toBe(true);
    });

    it('should return false on error', async () => {
      mockUpdateTripStatus.mockResolvedValueOnce(false);

      const result = await updateTripStatus('trip-123', 'COMPLETED');

      expect(result).toBe(false);
    });
  });
});

describe('Supabase Invoice Functions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('deleteInvoice', () => {
    it('should delete an invoice by id', async () => {
      mockDeleteInvoice.mockResolvedValueOnce(true);

      const result = await deleteInvoice('inv-123');

      expect(mockDeleteInvoice).toHaveBeenCalledWith('inv-123');
      expect(result).toBe(true);
    });

    it('should return false on error', async () => {
      mockDeleteInvoice.mockResolvedValueOnce(false);

      const result = await deleteInvoice('inv-123');

      expect(result).toBe(false);
    });
  });
});
