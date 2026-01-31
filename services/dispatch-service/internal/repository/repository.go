package repository

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/draymaster/services/dispatch-service/internal/domain"
)

// TripFilter contains filter criteria for listing trips
type TripFilter struct {
	Status            []domain.TripStatus
	Type              []domain.TripType
	DriverID          *uuid.UUID
	TripNumber        string
	PlannedAfter      *time.Time
	PlannedBefore     *time.Time
	CompletedAfter    *time.Time
	CompletedBefore   *time.Time
	IsStreetTurn      *bool
	IsDualTransaction *bool
	Page              int
	PageSize          int
	SortBy            string
	SortOrder         string
}

// StreetTurnFilter contains filter criteria for street turn matching
type StreetTurnFilter struct {
	ImportOrderID   *uuid.UUID
	ExportOrderID   *uuid.UUID
	SteamshipLineID *uuid.UUID
	ContainerSize   string
	MaxDistanceMiles int
	MaxResults      int
}

// TripRepository defines the interface for trip data access
type TripRepository interface {
	Create(ctx context.Context, trip *domain.Trip) error
	GetByID(ctx context.Context, id uuid.UUID) (*domain.Trip, error)
	Update(ctx context.Context, trip *domain.Trip) error
	Delete(ctx context.Context, id uuid.UUID) error
	GetNextTripNumber(ctx context.Context) (string, error)
	FindStreetTurnMatches(ctx context.Context, filter StreetTurnFilter) ([]domain.StreetTurnOpportunity, error)
	GetByDateRange(ctx context.Context, start, end time.Time) ([]domain.Trip, error)
	List(ctx context.Context, filter TripFilter) ([]domain.Trip, int64, error)
	Search(ctx context.Context, query string, limit int) ([]domain.Trip, error)
}

// TripStopRepository defines the interface for trip stop data access
type TripStopRepository interface {
	Create(ctx context.Context, stop *domain.TripStop) error
	GetByID(ctx context.Context, id uuid.UUID) (*domain.TripStop, error)
	Update(ctx context.Context, stop *domain.TripStop) error
	GetByTripID(ctx context.Context, tripID uuid.UUID) ([]domain.TripStop, error)
	GetByTripIDs(ctx context.Context, tripIDs []uuid.UUID) ([]domain.TripStop, error)
	DeleteByTripID(ctx context.Context, tripID uuid.UUID) error
}

// DriverRepository defines the interface for driver data access
type DriverRepository interface {
	GetByID(ctx context.Context, id uuid.UUID) (*domain.Driver, error)
	GetAvailable(ctx context.Context) ([]domain.Driver, error)
}

// LocationRepository defines the interface for location data access
type LocationRepository interface {
	GetByID(ctx context.Context, id uuid.UUID) (*domain.Location, error)
}

// EquipmentRepository defines the interface for equipment data access
type EquipmentRepository interface {
	GetByID(ctx context.Context, id uuid.UUID) (interface{}, error)
}

// ExceptionRepository defines the interface for exception data access
type ExceptionRepository interface {
	Create(ctx context.Context, exception *domain.Exception) error
	GetByID(ctx context.Context, id uuid.UUID) (*domain.Exception, error)
	Update(ctx context.Context, exception *domain.Exception) error
	CreateHistory(ctx context.Context, history *domain.ExceptionHistory) error
	CreateComment(ctx context.Context, comment *domain.ExceptionComment) error
	GetByTripID(ctx context.Context, tripID uuid.UUID) ([]domain.Exception, error)
	GetByStatus(ctx context.Context, statuses []domain.ExceptionStatus) ([]domain.Exception, error)
	GetBySeverity(ctx context.Context, severities []domain.ExceptionSeverity) ([]domain.Exception, error)
}
