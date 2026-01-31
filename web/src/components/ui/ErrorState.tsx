'use client';

import React from 'react';

// ============================================================================
// Error Message Types
// ============================================================================

export type ErrorType =
  | 'network'
  | 'validation'
  | 'auth'
  | 'not-found'
  | 'server'
  | 'unknown';

const ERROR_MESSAGES: Record<ErrorType, { title: string; description: string }> = {
  network: {
    title: 'Connection Error',
    description: 'Unable to connect to the server. Please check your internet connection and try again.',
  },
  validation: {
    title: 'Validation Error',
    description: 'Please check the form for errors and try again.',
  },
  auth: {
    title: 'Authentication Error',
    description: 'Your session has expired. Please log in again.',
  },
  'not-found': {
    title: 'Not Found',
    description: 'The requested resource could not be found.',
  },
  server: {
    title: 'Server Error',
    description: 'Something went wrong on our end. Please try again later.',
  },
  unknown: {
    title: 'Error',
    description: 'An unexpected error occurred. Please try again.',
  },
};

// ============================================================================
// Parse Error Helper
// ============================================================================

export function parseError(error: unknown): { type: ErrorType; message: string } {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    if (message.includes('network') || message.includes('fetch') || message.includes('connection')) {
      return { type: 'network', message: error.message };
    }
    if (message.includes('unauthorized') || message.includes('401') || message.includes('auth')) {
      return { type: 'auth', message: error.message };
    }
    if (message.includes('not found') || message.includes('404')) {
      return { type: 'not-found', message: error.message };
    }
    if (message.includes('500') || message.includes('server')) {
      return { type: 'server', message: error.message };
    }
    if (message.includes('validation') || message.includes('invalid')) {
      return { type: 'validation', message: error.message };
    }

    return { type: 'unknown', message: error.message };
  }

  if (typeof error === 'string') {
    return { type: 'unknown', message: error };
  }

  return { type: 'unknown', message: 'An unexpected error occurred' };
}

// ============================================================================
// Error Alert Component
// ============================================================================

interface ErrorAlertProps {
  error: unknown;
  onDismiss?: () => void;
  onRetry?: () => void;
  className?: string;
}

export function ErrorAlert({ error, onDismiss, onRetry, className = '' }: ErrorAlertProps) {
  const { type, message } = parseError(error);
  const errorInfo = ERROR_MESSAGES[type];

  return (
    <div className={`bg-red-50 border border-red-200 rounded-lg p-4 ${className}`} role="alert">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0">
          <svg className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-medium text-red-800">{errorInfo.title}</h3>
          <p className="mt-1 text-sm text-red-700">{errorInfo.description}</p>
          {message && message !== errorInfo.description && (
            <p className="mt-2 text-xs text-red-600 font-mono bg-red-100 p-2 rounded">
              {message}
            </p>
          )}
          {(onRetry || onDismiss) && (
            <div className="mt-3 flex gap-2">
              {onRetry && (
                <button
                  onClick={onRetry}
                  className="text-sm font-medium text-red-800 hover:text-red-900 underline"
                >
                  Try Again
                </button>
              )}
              {onDismiss && (
                <button
                  onClick={onDismiss}
                  className="text-sm text-red-600 hover:text-red-700"
                >
                  Dismiss
                </button>
              )}
            </div>
          )}
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="flex-shrink-0 text-red-400 hover:text-red-500"
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Full Page Error
// ============================================================================

interface PageErrorProps {
  error: unknown;
  onRetry?: () => void;
}

export function PageError({ error, onRetry }: PageErrorProps) {
  const { type } = parseError(error);
  const errorInfo = ERROR_MESSAGES[type];

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] text-center px-4">
      <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
        <svg className="h-8 w-8 text-red-500" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
      </div>
      <h2 className="text-xl font-semibold text-gray-900 mb-2">{errorInfo.title}</h2>
      <p className="text-gray-500 mb-6 max-w-md">{errorInfo.description}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Try Again
        </button>
      )}
    </div>
  );
}

// ============================================================================
// Empty State
// ============================================================================

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ title, description, icon, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      {icon && (
        <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-4 text-gray-400">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-medium text-gray-900 mb-1">{title}</h3>
      {description && <p className="text-gray-500 mb-4 max-w-sm">{description}</p>}
      {action && (
        <button
          onClick={action.onClick}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

// ============================================================================
// Toast Notifications (using react-hot-toast)
// ============================================================================

import toast from 'react-hot-toast';

export const showToast = {
  success: (message: string) => {
    toast.success(message, {
      duration: 3000,
      position: 'top-right',
    });
  },
  error: (message: string) => {
    toast.error(message, {
      duration: 5000,
      position: 'top-right',
    });
  },
  loading: (message: string) => {
    return toast.loading(message, {
      position: 'top-right',
    });
  },
  dismiss: (toastId: string) => {
    toast.dismiss(toastId);
  },
};

// ============================================================================
// Async Operation Handler
// ============================================================================

export async function handleAsyncOperation<T>(
  operation: () => Promise<T>,
  options?: {
    loadingMessage?: string;
    successMessage?: string;
    errorMessage?: string;
    onSuccess?: (result: T) => void;
    onError?: (error: unknown) => void;
  }
): Promise<T | null> {
  const toastId = options?.loadingMessage
    ? showToast.loading(options.loadingMessage)
    : null;

  try {
    const result = await operation();

    if (toastId) toast.dismiss(toastId);
    if (options?.successMessage) showToast.success(options.successMessage);
    if (options?.onSuccess) options.onSuccess(result);

    return result;
  } catch (error) {
    if (toastId) toast.dismiss(toastId);

    const { message } = parseError(error);
    showToast.error(options?.errorMessage || message);

    if (options?.onError) options.onError(error);

    return null;
  }
}
