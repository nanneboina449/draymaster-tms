import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  parseError,
  ErrorAlert,
  PageError,
  EmptyState,
  showToast,
  handleAsyncOperation,
} from '@/components/ui/ErrorState';
import toast from 'react-hot-toast';

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

describe('parseError', () => {
  describe('Error instances', () => {
    it('should detect network errors', () => {
      const result = parseError(new Error('Network request failed'));
      expect(result.type).toBe('network');
      expect(result.message).toBe('Network request failed');
    });

    it('should detect fetch errors', () => {
      const result = parseError(new Error('Failed to fetch'));
      expect(result.type).toBe('network');
    });

    it('should detect connection errors', () => {
      const result = parseError(new Error('Connection refused'));
      expect(result.type).toBe('network');
    });

    it('should detect auth errors with "unauthorized"', () => {
      const result = parseError(new Error('Unauthorized access'));
      expect(result.type).toBe('auth');
    });

    it('should detect auth errors with "401"', () => {
      const result = parseError(new Error('401 Unauthorized'));
      expect(result.type).toBe('auth');
    });

    it('should detect not-found errors with "not found"', () => {
      const result = parseError(new Error('Resource not found'));
      expect(result.type).toBe('not-found');
    });

    it('should detect not-found errors with "404"', () => {
      const result = parseError(new Error('404 Error'));
      expect(result.type).toBe('not-found');
    });

    it('should detect server errors with "500"', () => {
      const result = parseError(new Error('500 Internal Server Error'));
      expect(result.type).toBe('server');
    });

    it('should detect server errors', () => {
      const result = parseError(new Error('Server error occurred'));
      expect(result.type).toBe('server');
    });

    it('should detect validation errors', () => {
      const result = parseError(new Error('Validation failed'));
      expect(result.type).toBe('validation');
    });

    it('should detect invalid errors as validation', () => {
      const result = parseError(new Error('Invalid email format'));
      expect(result.type).toBe('validation');
    });

    it('should return unknown for unrecognized errors', () => {
      const result = parseError(new Error('Something went wrong'));
      expect(result.type).toBe('unknown');
      expect(result.message).toBe('Something went wrong');
    });
  });

  describe('string errors', () => {
    it('should handle string errors', () => {
      const result = parseError('Custom error message');
      expect(result.type).toBe('unknown');
      expect(result.message).toBe('Custom error message');
    });
  });

  describe('other error types', () => {
    it('should handle null', () => {
      const result = parseError(null);
      expect(result.type).toBe('unknown');
      expect(result.message).toBe('An unexpected error occurred');
    });

    it('should handle undefined', () => {
      const result = parseError(undefined);
      expect(result.type).toBe('unknown');
      expect(result.message).toBe('An unexpected error occurred');
    });

    it('should handle objects', () => {
      const result = parseError({ code: 'ERR_001' });
      expect(result.type).toBe('unknown');
      expect(result.message).toBe('An unexpected error occurred');
    });
  });
});

describe('ErrorAlert', () => {
  it('should render error title and description', () => {
    render(<ErrorAlert error={new Error('Network request failed')} />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Connection Error')).toBeInTheDocument();
    expect(screen.getByText(/Unable to connect to the server/)).toBeInTheDocument();
  });

  it('should show original error message if different from description', () => {
    render(<ErrorAlert error={new Error('fetch failed: ECONNREFUSED')} />);

    expect(screen.getByText('fetch failed: ECONNREFUSED')).toBeInTheDocument();
  });

  it('should render retry button when onRetry provided', async () => {
    const handleRetry = jest.fn();
    render(<ErrorAlert error={new Error('Error')} onRetry={handleRetry} />);

    const retryButton = screen.getByText('Try Again');
    await userEvent.click(retryButton);

    expect(handleRetry).toHaveBeenCalledTimes(1);
  });

  it('should render dismiss button when onDismiss provided', async () => {
    const handleDismiss = jest.fn();
    render(<ErrorAlert error={new Error('Error')} onDismiss={handleDismiss} />);

    const dismissButton = screen.getByText('Dismiss');
    await userEvent.click(dismissButton);

    expect(handleDismiss).toHaveBeenCalledTimes(1);
  });

  it('should apply custom className', () => {
    render(<ErrorAlert error={new Error('Error')} className="custom-class" />);
    expect(screen.getByRole('alert')).toHaveClass('custom-class');
  });

  it('should render validation error correctly', () => {
    render(<ErrorAlert error={new Error('Validation failed')} />);
    expect(screen.getByText('Validation Error')).toBeInTheDocument();
  });

  it('should render auth error correctly', () => {
    render(<ErrorAlert error={new Error('Unauthorized')} />);
    expect(screen.getByText('Authentication Error')).toBeInTheDocument();
  });

  it('should render not-found error correctly', () => {
    render(<ErrorAlert error={new Error('Resource not found')} />);
    expect(screen.getByText('Not Found')).toBeInTheDocument();
  });

  it('should render server error correctly', () => {
    render(<ErrorAlert error={new Error('500 Internal Server Error')} />);
    expect(screen.getByText('Server Error')).toBeInTheDocument();
  });
});

describe('PageError', () => {
  it('should render error information', () => {
    render(<PageError error={new Error('Server error')} />);

    expect(screen.getByText('Server Error')).toBeInTheDocument();
    expect(screen.getByText(/Something went wrong on our end/)).toBeInTheDocument();
  });

  it('should render retry button when onRetry provided', async () => {
    const handleRetry = jest.fn();
    render(<PageError error={new Error('Error')} onRetry={handleRetry} />);

    const retryButton = screen.getByRole('button', { name: 'Try Again' });
    await userEvent.click(retryButton);

    expect(handleRetry).toHaveBeenCalledTimes(1);
  });

  it('should not render retry button when onRetry not provided', () => {
    render(<PageError error={new Error('Error')} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('EmptyState', () => {
  it('should render title', () => {
    render(<EmptyState title="No items found" />);
    expect(screen.getByText('No items found')).toBeInTheDocument();
  });

  it('should render description when provided', () => {
    render(
      <EmptyState
        title="No items"
        description="Add your first item to get started"
      />
    );
    expect(screen.getByText('Add your first item to get started')).toBeInTheDocument();
  });

  it('should render icon when provided', () => {
    render(
      <EmptyState
        title="No items"
        icon={<span data-testid="custom-icon">Icon</span>}
      />
    );
    expect(screen.getByTestId('custom-icon')).toBeInTheDocument();
  });

  it('should render action button when provided', async () => {
    const handleAction = jest.fn();
    render(
      <EmptyState
        title="No items"
        action={{ label: 'Add Item', onClick: handleAction }}
      />
    );

    const button = screen.getByRole('button', { name: 'Add Item' });
    await userEvent.click(button);

    expect(handleAction).toHaveBeenCalledTimes(1);
  });

  it('should not render description when not provided', () => {
    const { container } = render(<EmptyState title="No items" />);
    // Should only have the title paragraph
    const paragraphs = container.querySelectorAll('p');
    expect(paragraphs).toHaveLength(0);
  });
});

describe('showToast', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should show success toast', () => {
    showToast.success('Operation successful');

    expect(toast.success).toHaveBeenCalledWith('Operation successful', {
      duration: 3000,
      position: 'top-right',
    });
  });

  it('should show error toast', () => {
    showToast.error('Operation failed');

    expect(toast.error).toHaveBeenCalledWith('Operation failed', {
      duration: 5000,
      position: 'top-right',
    });
  });

  it('should show loading toast and return id', () => {
    const id = showToast.loading('Loading...');

    expect(toast.loading).toHaveBeenCalledWith('Loading...', {
      position: 'top-right',
    });
    expect(id).toBe('toast-id');
  });

  it('should dismiss toast by id', () => {
    showToast.dismiss('toast-123');
    expect(toast.dismiss).toHaveBeenCalledWith('toast-123');
  });
});

describe('handleAsyncOperation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return result on success', async () => {
    const operation = jest.fn().mockResolvedValue({ data: 'test' });

    const result = await handleAsyncOperation(operation);

    expect(result).toEqual({ data: 'test' });
  });

  it('should show loading toast when loadingMessage provided', async () => {
    const operation = jest.fn().mockResolvedValue('result');

    await handleAsyncOperation(operation, {
      loadingMessage: 'Processing...',
    });

    expect(toast.loading).toHaveBeenCalledWith('Processing...', {
      position: 'top-right',
    });
    expect(toast.dismiss).toHaveBeenCalledWith('toast-id');
  });

  it('should show success toast when successMessage provided', async () => {
    const operation = jest.fn().mockResolvedValue('result');

    await handleAsyncOperation(operation, {
      successMessage: 'Done!',
    });

    expect(toast.success).toHaveBeenCalledWith('Done!', {
      duration: 3000,
      position: 'top-right',
    });
  });

  it('should call onSuccess callback on success', async () => {
    const operation = jest.fn().mockResolvedValue('result');
    const onSuccess = jest.fn();

    await handleAsyncOperation(operation, { onSuccess });

    expect(onSuccess).toHaveBeenCalledWith('result');
  });

  it('should return null on error', async () => {
    const operation = jest.fn().mockRejectedValue(new Error('Failed'));

    const result = await handleAsyncOperation(operation);

    expect(result).toBeNull();
  });

  it('should show error toast on failure', async () => {
    const operation = jest.fn().mockRejectedValue(new Error('Network error'));

    await handleAsyncOperation(operation);

    expect(toast.error).toHaveBeenCalled();
  });

  it('should show custom error message when provided', async () => {
    const operation = jest.fn().mockRejectedValue(new Error('Error'));

    await handleAsyncOperation(operation, {
      errorMessage: 'Custom error',
    });

    expect(toast.error).toHaveBeenCalledWith('Custom error', {
      duration: 5000,
      position: 'top-right',
    });
  });

  it('should call onError callback on failure', async () => {
    const error = new Error('Failed');
    const operation = jest.fn().mockRejectedValue(error);
    const onError = jest.fn();

    await handleAsyncOperation(operation, { onError });

    expect(onError).toHaveBeenCalledWith(error);
  });

  it('should dismiss loading toast on error', async () => {
    const operation = jest.fn().mockRejectedValue(new Error('Error'));

    await handleAsyncOperation(operation, {
      loadingMessage: 'Loading...',
    });

    expect(toast.dismiss).toHaveBeenCalledWith('toast-id');
  });
});
