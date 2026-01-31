import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DriversPage from '@/app/drivers/page';
import * as supabaseModule from '@/lib/supabase';

// Mock supabase functions
jest.mock('@/lib/supabase', () => ({
  getDrivers: jest.fn(),
  createDriver: jest.fn(),
  updateDriver: jest.fn(),
  deleteDriver: jest.fn(),
  updateDriverStatus: jest.fn(),
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

describe('DriversPage', () => {
  const mockDrivers: supabaseModule.Driver[] = [
    {
      id: '1',
      first_name: 'John',
      last_name: 'Doe',
      phone: '555-123-4567',
      email: 'john@example.com',
      license_number: 'DL12345',
      license_state: 'CA',
      license_expiry: '2025-12-31',
      twic_expiry: '2024-06-30',
      hazmat_endorsement: true,
      status: 'AVAILABLE',
      pay_rate: 0.55,
      pay_type: 'PER_MILE',
      created_at: '2024-01-01',
    },
    {
      id: '2',
      first_name: 'Jane',
      last_name: 'Smith',
      phone: '555-987-6543',
      email: 'jane@example.com',
      license_number: 'DL67890',
      license_state: 'NV',
      license_expiry: '2024-03-15',
      twic_expiry: null,
      hazmat_endorsement: false,
      status: 'DRIVING',
      pay_rate: 25,
      pay_type: 'HOURLY',
      created_at: '2024-01-01',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    (supabaseModule.getDrivers as jest.Mock).mockResolvedValue(mockDrivers);
    (supabaseModule.createDriver as jest.Mock).mockResolvedValue({ id: '3' });
    (supabaseModule.updateDriver as jest.Mock).mockResolvedValue({});
    (supabaseModule.deleteDriver as jest.Mock).mockResolvedValue({});
    (supabaseModule.updateDriverStatus as jest.Mock).mockResolvedValue({});
  });

  describe('loading state', () => {
    it('should show skeleton cards while loading', () => {
      (supabaseModule.getDrivers as jest.Mock).mockReturnValue(new Promise(() => {}));

      render(<DriversPage />);

      const skeletons = document.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe('loaded state', () => {
    it('should render page title', async () => {
      render(<DriversPage />);

      await waitFor(() => {
        expect(screen.getByText('Drivers')).toBeInTheDocument();
      });
      expect(screen.getByText('Manage your driver fleet')).toBeInTheDocument();
    });

    it('should display driver data in table', async () => {
      render(<DriversPage />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });
      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
      expect(screen.getByText('DL12345')).toBeInTheDocument();
      expect(screen.getByText('DL67890')).toBeInTheDocument();
    });

    it('should display stats cards', async () => {
      render(<DriversPage />);

      await waitFor(() => {
        expect(screen.getByText('Total Drivers')).toBeInTheDocument();
      });
      expect(screen.getByText('Available')).toBeInTheDocument();
      expect(screen.getByText('Driving')).toBeInTheDocument();
      expect(screen.getByText('Off Duty')).toBeInTheDocument();
      expect(screen.getByText('Hazmat Certified')).toBeInTheDocument();
    });

    it('should display driver initials avatar', async () => {
      render(<DriversPage />);

      await waitFor(() => {
        expect(screen.getByText('JD')).toBeInTheDocument(); // John Doe
        expect(screen.getByText('JS')).toBeInTheDocument(); // Jane Smith
      });
    });

    it('should show hazmat badge for endorsed drivers', async () => {
      render(<DriversPage />);

      await waitFor(() => {
        expect(screen.getByText('☣️ Yes')).toBeInTheDocument();
      });
    });

    it('should display pay rate information', async () => {
      render(<DriversPage />);

      await waitFor(() => {
        expect(screen.getByText('$0.55/mi')).toBeInTheDocument();
        expect(screen.getByText('$25/hr')).toBeInTheDocument();
      });
    });
  });

  describe('status management', () => {
    it('should have status dropdown for each driver', async () => {
      render(<DriversPage />);

      await waitFor(() => {
        const statusDropdowns = screen.getAllByRole('combobox');
        expect(statusDropdowns.length).toBe(2);
      });
    });

    it('should call updateDriverStatus when status changes', async () => {
      render(<DriversPage />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      const statusDropdowns = screen.getAllByRole('combobox');
      await userEvent.selectOptions(statusDropdowns[0], 'OFF_DUTY');

      await waitFor(() => {
        expect(supabaseModule.updateDriverStatus).toHaveBeenCalledWith('1', 'OFF_DUTY');
      });
    });
  });

  describe('add driver modal', () => {
    it('should open modal when Add Driver button is clicked', async () => {
      render(<DriversPage />);

      await waitFor(() => {
        expect(screen.getByText('Drivers')).toBeInTheDocument();
      });

      // Click the header Add Driver button
      const addButtons = screen.getAllByText(/Add Driver/);
      await userEvent.click(addButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('Add Driver', { selector: 'h2' })).toBeInTheDocument();
      });
      // Check for form field labels (not using getByLabelText since labels aren't properly associated)
      expect(screen.getByText(/First Name/)).toBeInTheDocument();
      expect(screen.getByText(/Last Name/)).toBeInTheDocument();
    });

    it('should close modal when Cancel is clicked', async () => {
      render(<DriversPage />);

      await waitFor(() => {
        expect(screen.getByText('Drivers')).toBeInTheDocument();
      });

      const addButtons = screen.getAllByText(/Add Driver/);
      await userEvent.click(addButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('Add Driver', { selector: 'h2' })).toBeInTheDocument();
      });

      await userEvent.click(screen.getByText('Cancel'));

      await waitFor(() => {
        expect(screen.queryByText('Add Driver', { selector: 'h2' })).not.toBeInTheDocument();
      });
    });

    it('should call createDriver when form is submitted', async () => {
      render(<DriversPage />);

      await waitFor(() => {
        expect(screen.getByText('Drivers')).toBeInTheDocument();
      });

      const addButtons = screen.getAllByText(/Add Driver/);
      await userEvent.click(addButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('Add Driver', { selector: 'h2' })).toBeInTheDocument();
      });

      // Find inputs by their position in the form (first two text inputs are first/last name)
      const textInputs = screen.getAllByRole('textbox');
      await userEvent.type(textInputs[0], 'Test');
      await userEvent.type(textInputs[1], 'Driver');

      // Find the submit button in the modal footer (it's the last Add Driver button)
      const addDriverButtons = screen.getAllByRole('button', { name: /Add Driver/i });
      await userEvent.click(addDriverButtons[addDriverButtons.length - 1]);

      await waitFor(() => {
        expect(supabaseModule.createDriver).toHaveBeenCalled();
      });
    });
  });

  describe('edit driver', () => {
    it('should open modal with driver data when Edit is clicked', async () => {
      render(<DriversPage />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      const editButtons = screen.getAllByText('Edit');
      await userEvent.click(editButtons[0]);

      expect(screen.getByText('Edit Driver')).toBeInTheDocument();
      expect(screen.getByDisplayValue('John')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Doe')).toBeInTheDocument();
      expect(screen.getByDisplayValue('DL12345')).toBeInTheDocument();
    });

    it('should call updateDriver when editing form is submitted', async () => {
      render(<DriversPage />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      const editButtons = screen.getAllByText('Edit');
      await userEvent.click(editButtons[0]);

      await userEvent.click(screen.getByRole('button', { name: /Save Changes/i }));

      await waitFor(() => {
        expect(supabaseModule.updateDriver).toHaveBeenCalledWith('1', expect.any(Object));
      });
    });
  });

  describe('delete driver', () => {
    it('should ask for confirmation before deleting', async () => {
      mockConfirm.mockReturnValue(false);

      render(<DriversPage />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      const deleteButtons = screen.getAllByText('Delete');
      await userEvent.click(deleteButtons[0]);

      expect(mockConfirm).toHaveBeenCalledWith('Delete this driver?');
    });

    it('should call deleteDriver when confirmed', async () => {
      mockConfirm.mockReturnValue(true);

      render(<DriversPage />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      const deleteButtons = screen.getAllByText('Delete');
      await userEvent.click(deleteButtons[0]);

      await waitFor(() => {
        expect(supabaseModule.deleteDriver).toHaveBeenCalledWith('1');
      });
    });

    it('should not call deleteDriver when cancelled', async () => {
      mockConfirm.mockReturnValue(false);

      render(<DriversPage />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      const deleteButtons = screen.getAllByText('Delete');
      await userEvent.click(deleteButtons[0]);

      expect(supabaseModule.deleteDriver).not.toHaveBeenCalled();
    });
  });

  describe('error state', () => {
    it('should display error when fetch fails', async () => {
      (supabaseModule.getDrivers as jest.Mock).mockRejectedValue(new Error('Network error'));

      render(<DriversPage />);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
    });

    it('should allow retry when error occurs', async () => {
      (supabaseModule.getDrivers as jest.Mock)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValue(mockDrivers);

      render(<DriversPage />);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      // Get the Try Again button within the error alert
      const alert = screen.getByRole('alert');
      const retryButton = alert.querySelector('button');
      expect(retryButton).not.toBeNull();
      await userEvent.click(retryButton!);

      await waitFor(() => {
        expect(supabaseModule.getDrivers).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('empty state', () => {
    it('should show empty state when no drivers exist', async () => {
      (supabaseModule.getDrivers as jest.Mock).mockResolvedValue([]);

      render(<DriversPage />);

      await waitFor(() => {
        expect(screen.getByText('No drivers found')).toBeInTheDocument();
      });
      expect(screen.getByText('Get started by adding your first driver')).toBeInTheDocument();
    });

    it('should open add modal from empty state action', async () => {
      (supabaseModule.getDrivers as jest.Mock).mockResolvedValue([]);

      render(<DriversPage />);

      await waitFor(() => {
        expect(screen.getByText('No drivers found')).toBeInTheDocument();
      });

      // Click the empty state button (the second Add Driver button on the page)
      const addButtons = screen.getAllByRole('button', { name: /Add Driver/i });
      // The second button is in the empty state
      await userEvent.click(addButtons[addButtons.length - 1]);

      await waitFor(() => {
        expect(screen.getByText('Add Driver', { selector: 'h2' })).toBeInTheDocument();
      });
    });
  });

  describe('expiring documents warning', () => {
    it('should show warning for licenses expiring within 30 days', async () => {
      const driverWithExpiringLicense = {
        ...mockDrivers[1],
        license_expiry: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      };
      (supabaseModule.getDrivers as jest.Mock).mockResolvedValue([driverWithExpiringLicense]);

      render(<DriversPage />);

      await waitFor(() => {
        // Check for red warning styling on the expiry date
        const expiryElements = document.querySelectorAll('.text-red-600');
        expect(expiryElements.length).toBeGreaterThan(0);
      });
    });
  });
});
