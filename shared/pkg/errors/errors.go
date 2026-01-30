package errors

import (
	"errors"
	"fmt"
)

// Error types for standardized error handling
var (
	// Validation errors
	ErrInvalidInput      = errors.New("invalid input")
	ErrValidationFailed  = errors.New("validation failed")

	// Resource errors
	ErrNotFound          = errors.New("resource not found")
	ErrAlreadyExists     = errors.New("resource already exists")
	ErrConflict          = errors.New("resource conflict")

	// Business logic errors
	ErrInvalidState      = errors.New("invalid state")
	ErrNotAvailable      = errors.New("not available")
	ErrInsufficientTime  = errors.New("insufficient time")

	// Authorization errors
	ErrUnauthorized      = errors.New("unauthorized")
	ErrForbidden         = errors.New("forbidden")

	// System errors
	ErrInternal          = errors.New("internal error")
	ErrDatabaseError     = errors.New("database error")
	ErrExternalService   = errors.New("external service error")
)

// AppError represents a structured application error
type AppError struct {
	Code    string                 `json:"code"`
	Message string                 `json:"message"`
	Details map[string]interface{} `json:"details,omitempty"`
	Err     error                  `json:"-"`
}

func (e *AppError) Error() string {
	if e.Err != nil {
		return fmt.Sprintf("%s: %v", e.Message, e.Err)
	}
	return e.Message
}

func (e *AppError) Unwrap() error {
	return e.Err
}

// New creates a new AppError
func New(code, message string) *AppError {
	return &AppError{
		Code:    code,
		Message: message,
		Details: make(map[string]interface{}),
	}
}

// Wrap wraps an existing error with context
func Wrap(err error, code, message string) *AppError {
	return &AppError{
		Code:    code,
		Message: message,
		Err:     err,
		Details: make(map[string]interface{}),
	}
}

// WithDetail adds a detail to the error
func (e *AppError) WithDetail(key string, value interface{}) *AppError {
	e.Details[key] = value
	return e
}

// ValidationError creates a validation error
func ValidationError(message string, field string, value interface{}) *AppError {
	return &AppError{
		Code:    "VALIDATION_ERROR",
		Message: message,
		Details: map[string]interface{}{
			"field": field,
			"value": value,
		},
	}
}

// NotFoundError creates a not found error
func NotFoundError(resourceType string, identifier string) *AppError {
	return &AppError{
		Code:    "NOT_FOUND",
		Message: fmt.Sprintf("%s not found", resourceType),
		Details: map[string]interface{}{
			"resource_type": resourceType,
			"identifier":    identifier,
		},
	}
}

// ConflictError creates a conflict error
func ConflictError(message string) *AppError {
	return &AppError{
		Code:    "CONFLICT",
		Message: message,
		Details: make(map[string]interface{}),
	}
}

// InvalidStateError creates an invalid state error
func InvalidStateError(currentState, requiredState string) *AppError {
	return &AppError{
		Code:    "INVALID_STATE",
		Message: fmt.Sprintf("invalid state: expected %s, got %s", requiredState, currentState),
		Details: map[string]interface{}{
			"current_state":  currentState,
			"required_state": requiredState,
		},
	}
}

// InsufficientResourceError creates an insufficient resource error
func InsufficientResourceError(resource string, required, available interface{}) *AppError {
	return &AppError{
		Code:    "INSUFFICIENT_RESOURCE",
		Message: fmt.Sprintf("insufficient %s", resource),
		Details: map[string]interface{}{
			"resource":  resource,
			"required":  required,
			"available": available,
		},
	}
}

// DatabaseError creates a database error
func DatabaseError(operation string, err error) *AppError {
	return &AppError{
		Code:    "DATABASE_ERROR",
		Message: fmt.Sprintf("database operation failed: %s", operation),
		Err:     err,
		Details: map[string]interface{}{
			"operation": operation,
		},
	}
}

// ExternalServiceError creates an external service error
func ExternalServiceError(service string, err error) *AppError {
	return &AppError{
		Code:    "EXTERNAL_SERVICE_ERROR",
		Message: fmt.Sprintf("external service error: %s", service),
		Err:     err,
		Details: map[string]interface{}{
			"service": service,
		},
	}
}
