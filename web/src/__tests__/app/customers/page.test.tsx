import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CustomersPage from '@/app/customers/page';
import { supabase } from '@/lib/supabase';

// Mock supabase
jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

// Mock react-hot-toast
jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: {
    success: jest.fn(),
    error: jest.fn(),
    loading: jest.fn(() => 'toast-id'),
    dismiss: jest.fn(),
  },
}));

// Mock window.confirm
const mockConfirm = jest.fn();
global.confirm = mockConfirm;

describe('CustomersPage', () => {
  const mockCustomers = [
    {
      id: '1',
      name: 'Acme Corporation',
      code: 'ACME',
      city: 'Los Angeles',
      state: 'CA',
      contact_name: 'John Doe',
      contact_phone: '555-123-4567',
      contact_email: 'john@acme.com',
      payment_terms: 30,
      is_active: true,
    },
    {
      id: '2',
      name: 'Beta Industries',
      code: 'BETA',
      city: 'San Francisco',
      state: 'CA',
      contact_name: 'Jane Smith',
      contact_phone: '555-987-6543',
      contact_email: 'jane@beta.com',
      payment_terms: 45,
      is_active: false,
    },
  ];

  const mockSupabaseFrom = () => {
    const mockQuery = {
      select: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({ data: mockCustomers, error: null }),
      insert: jest.fn().mockResolvedValue({ error: null }),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ error: null }),
    };
    (supabase.from as jest.Mock).mockReturnValue(mockQuery);
    return mockQuery;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabaseFrom();
  });

  describe('loading state', () => {
    it('should show skeleton cards while loading', () => {
      // Make the query hang
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnValue(new Promise(() => {})),
      };
      (supabase.from as jest.Mock).mockReturnValue(mockQuery);

      render(<CustomersPage />);

      // Check for skeleton cards (loading state)
      const skeletons = document.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe('loaded state', () => {
    it('should render page title', async () => {
      render(<CustomersPage />);

      await waitFor(() => {
        expect(screen.getByText('Customers')).toBeInTheDocument();
      });
      expect(screen.getByText('Manage your customer base')).toBeInTheDocument();
    });

    it('should display customer data in table', async () => {
      render(<CustomersPage />);

      await waitFor(() => {
        expect(screen.getByText('Acme Corporation')).toBeInTheDocument();
      });
      expect(screen.getByText('ACME')).toBeInTheDocument();
      expect(screen.getByText('Los Angeles, CA')).toBeInTheDocument();
      expect(screen.getByText('Beta Industries')).toBeInTheDocument();
    });

    it('should display stats cards', async () => {
      render(<CustomersPage />);

      await waitFor(() => {
        expect(screen.getByText('Total')).toBeInTheDocument();
      });
      expect(screen.getByText('2')).toBeInTheDocument(); // Total
      // Use getAllByText since "Active" appears in stats and status badges
      const activeElements = screen.getAllByText('Active');
      expect(activeElements.length).toBeGreaterThan(0);
      const inactiveElements = screen.getAllByText('Inactive');
      expect(inactiveElements.length).toBeGreaterThan(0);
    });

    it('should display active/inactive status badges', async () => {
      render(<CustomersPage />);

      await waitFor(() => {
        // Use getAllByText since there are multiple elements
        const activeElements = screen.getAllByText('Active');
        expect(activeElements.length).toBeGreaterThan(0);
      });
    });
  });

  describe('search functionality', () => {
    it('should filter customers by name', async () => {
      render(<CustomersPage />);

      await waitFor(() => {
        expect(screen.getByText('Acme Corporation')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText('Search customers...');
      await userEvent.type(searchInput, 'Acme');

      expect(screen.getByText('Acme Corporation')).toBeInTheDocument();
      expect(screen.queryByText('Beta Industries')).not.toBeInTheDocument();
    });

    it('should filter customers by code', async () => {
      render(<CustomersPage />);

      await waitFor(() => {
        expect(screen.getByText('Acme Corporation')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText('Search customers...');
      await userEvent.type(searchInput, 'BETA');

      expect(screen.queryByText('Acme Corporation')).not.toBeInTheDocument();
      expect(screen.getByText('Beta Industries')).toBeInTheDocument();
    });

    it('should show empty state when no results match', async () => {
      render(<CustomersPage />);

      await waitFor(() => {
        expect(screen.getByText('Acme Corporation')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText('Search customers...');
      await userEvent.type(searchInput, 'nonexistent');

      expect(screen.getByText('No customers found')).toBeInTheDocument();
      expect(screen.getByText('Try adjusting your search terms')).toBeInTheDocument();
    });
  });

  describe('add customer modal', () => {
    it('should open modal when Add Customer button is clicked', async () => {
      render(<CustomersPage />);

      await waitFor(() => {
        expect(screen.getByText('Customers')).toBeInTheDocument();
      });

      // Click the header Add Customer button
      const addButtons = screen.getAllByText(/Add Customer/);
      await userEvent.click(addButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('Add Customer', { selector: 'h2' })).toBeInTheDocument();
      });
      // Check for form field label text (not using getByLabelText since labels aren't properly associated)
      expect(screen.getByText(/Company Name/)).toBeInTheDocument();
    });

    it('should close modal when Cancel is clicked', async () => {
      render(<CustomersPage />);

      await waitFor(() => {
        expect(screen.getByText('Customers')).toBeInTheDocument();
      });

      const addButtons = screen.getAllByText(/Add Customer/);
      await userEvent.click(addButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('Add Customer', { selector: 'h2' })).toBeInTheDocument();
      });

      await userEvent.click(screen.getByText('Cancel'));

      await waitFor(() => {
        expect(screen.queryByText('Add Customer', { selector: 'h2' })).not.toBeInTheDocument();
      });
    });
  });

  describe('edit customer', () => {
    it('should open modal with customer data when Edit is clicked', async () => {
      render(<CustomersPage />);

      await waitFor(() => {
        expect(screen.getByText('Acme Corporation')).toBeInTheDocument();
      });

      const editButtons = screen.getAllByText('Edit');
      await userEvent.click(editButtons[0]);

      expect(screen.getByText('Edit Customer')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Acme Corporation')).toBeInTheDocument();
      expect(screen.getByDisplayValue('ACME')).toBeInTheDocument();
    });
  });

  describe('delete customer', () => {
    it('should ask for confirmation before deleting', async () => {
      mockConfirm.mockReturnValue(false);

      render(<CustomersPage />);

      await waitFor(() => {
        expect(screen.getByText('Acme Corporation')).toBeInTheDocument();
      });

      const deleteButtons = screen.getAllByText('Delete');
      await userEvent.click(deleteButtons[0]);

      expect(mockConfirm).toHaveBeenCalledWith('Delete this customer?');
    });

    it('should delete when confirmed', async () => {
      mockConfirm.mockReturnValue(true);
      const mockQuery = mockSupabaseFrom();

      render(<CustomersPage />);

      await waitFor(() => {
        expect(screen.getByText('Acme Corporation')).toBeInTheDocument();
      });

      const deleteButtons = screen.getAllByText('Delete');
      await userEvent.click(deleteButtons[0]);

      expect(mockConfirm).toHaveBeenCalled();
      await waitFor(() => {
        expect(mockQuery.delete).toHaveBeenCalled();
      });
    });
  });

  describe('error state', () => {
    it('should display error message when fetch fails', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({ data: null, error: new Error('Network error') }),
      };
      (supabase.from as jest.Mock).mockReturnValue(mockQuery);

      render(<CustomersPage />);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
    });
  });

  describe('empty state', () => {
    it('should show empty state when no customers exist', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({ data: [], error: null }),
      };
      (supabase.from as jest.Mock).mockReturnValue(mockQuery);

      render(<CustomersPage />);

      await waitFor(() => {
        expect(screen.getByText('No customers found')).toBeInTheDocument();
      });
      expect(screen.getByText('Get started by adding your first customer')).toBeInTheDocument();
    });
  });
});
