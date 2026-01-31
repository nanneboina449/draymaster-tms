package repository

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/draymaster/services/driver-service/internal/domain"
)

// DriverRepository defines driver data access methods
type DriverRepository interface {
	Create(ctx context.Context, driver *domain.Driver) error
	GetByID(ctx context.Context, id uuid.UUID) (*domain.Driver, error)
	GetByEmployeeNumber(ctx context.Context, employeeNumber string) (*domain.Driver, error)
	GetAll(ctx context.Context) ([]domain.Driver, error)
	GetByStatus(ctx context.Context, status domain.DriverStatus) ([]domain.Driver, error)
	GetAvailable(ctx context.Context) ([]domain.Driver, error)
	GetByTerminalID(ctx context.Context, terminalID uuid.UUID) ([]domain.Driver, error)
	Update(ctx context.Context, driver *domain.Driver) error
	UpdateStatus(ctx context.Context, id uuid.UUID, status domain.DriverStatus) error
	UpdateLocation(ctx context.Context, id uuid.UUID, lat, lon float64) error
	UpdateHOS(ctx context.Context, id uuid.UUID, driveMins, dutyMins, cycleMins int) error
	Delete(ctx context.Context, id uuid.UUID) error
	GetExpiringDocuments(ctx context.Context, daysUntilExpiry int) ([]domain.Driver, error)
}

// HOSLogRepository defines HOS log data access methods
type HOSLogRepository interface {
	Create(ctx context.Context, log *domain.HOSLog) error
	GetByID(ctx context.Context, id uuid.UUID) (*domain.HOSLog, error)
	GetByDriverID(ctx context.Context, driverID uuid.UUID, startTime, endTime time.Time) ([]domain.HOSLog, error)
	GetCurrentStatus(ctx context.Context, driverID uuid.UUID) (*domain.HOSLog, error)
	GetByDateRange(ctx context.Context, driverID uuid.UUID, date time.Time) ([]domain.HOSLog, error)
	GetLast8Days(ctx context.Context, driverID uuid.UUID) ([]domain.HOSLog, error)
	Update(ctx context.Context, log *domain.HOSLog) error
	CloseCurrentLog(ctx context.Context, driverID uuid.UUID, endTime time.Time) error
}

// ViolationRepository defines HOS violation data access methods
type ViolationRepository interface {
	Create(ctx context.Context, violation *domain.HOSViolation) error
	GetByID(ctx context.Context, id uuid.UUID) (*domain.HOSViolation, error)
	GetByDriverID(ctx context.Context, driverID uuid.UUID, startTime, endTime time.Time) ([]domain.HOSViolation, error)
	GetUnacknowledged(ctx context.Context, driverID uuid.UUID) ([]domain.HOSViolation, error)
	Acknowledge(ctx context.Context, id uuid.UUID) error
}

// ComplianceAlertRepository defines compliance alert data access methods
type ComplianceAlertRepository interface {
	Create(ctx context.Context, alert *domain.ComplianceAlert) error
	GetByID(ctx context.Context, id uuid.UUID) (*domain.ComplianceAlert, error)
	GetByDriverID(ctx context.Context, driverID uuid.UUID) ([]domain.ComplianceAlert, error)
	GetActive(ctx context.Context) ([]domain.ComplianceAlert, error)
	Acknowledge(ctx context.Context, id uuid.UUID) error
	DeleteExpired(ctx context.Context) error
}

// DocumentRepository defines driver document data access methods
type DocumentRepository interface {
	Create(ctx context.Context, doc *domain.DriverDocument) error
	GetByID(ctx context.Context, id uuid.UUID) (*domain.DriverDocument, error)
	GetByDriverID(ctx context.Context, driverID uuid.UUID) ([]domain.DriverDocument, error)
	GetByType(ctx context.Context, driverID uuid.UUID, docType string) (*domain.DriverDocument, error)
	Update(ctx context.Context, doc *domain.DriverDocument) error
	Delete(ctx context.Context, id uuid.UUID) error
}
