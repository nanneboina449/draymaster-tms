package repository

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/draymaster/services/tracking-service/internal/domain"
)

// LocationRepository defines location data access methods
type LocationRepository interface {
	Create(ctx context.Context, record *domain.LocationRecord) error
	GetByID(ctx context.Context, id uuid.UUID) (*domain.LocationRecord, error)
	GetHistory(ctx context.Context, driverID uuid.UUID, tripID *uuid.UUID, startTime, endTime time.Time, intervalSecs int) ([]domain.LocationRecord, error)
	GetLatest(ctx context.Context, driverID uuid.UUID) (*domain.LocationRecord, error)
	GetByTripID(ctx context.Context, tripID uuid.UUID) ([]domain.LocationRecord, error)
	DeleteOlderThan(ctx context.Context, olderThan time.Time) (int64, error)
}

// MilestoneRepository defines milestone data access methods
type MilestoneRepository interface {
	Create(ctx context.Context, milestone *domain.Milestone) error
	GetByID(ctx context.Context, id uuid.UUID) (*domain.Milestone, error)
	GetByTripID(ctx context.Context, tripID uuid.UUID) ([]domain.Milestone, error)
	GetByContainerID(ctx context.Context, containerID uuid.UUID) ([]domain.Milestone, error)
	GetByDateRange(ctx context.Context, startTime, endTime time.Time) ([]domain.Milestone, error)
	Update(ctx context.Context, milestone *domain.Milestone) error
	Delete(ctx context.Context, id uuid.UUID) error
}

// GeofenceRepository defines geofence data access methods
type GeofenceRepository interface {
	Create(ctx context.Context, geofence *domain.Geofence) error
	GetByID(ctx context.Context, id uuid.UUID) (*domain.Geofence, error)
	GetByLocationID(ctx context.Context, locationID uuid.UUID) (*domain.Geofence, error)
	GetAll(ctx context.Context) ([]*domain.Geofence, error)
	GetActive(ctx context.Context) ([]*domain.Geofence, error)
	Update(ctx context.Context, geofence *domain.Geofence) error
	Delete(ctx context.Context, id uuid.UUID) error
	SetActive(ctx context.Context, id uuid.UUID, isActive bool) error
}
