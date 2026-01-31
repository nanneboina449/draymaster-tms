package repository

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"

	"github.com/draymaster/services/tracking-service/internal/domain"
)

// PostgresLocationRepository implements LocationRepository using PostgreSQL/TimescaleDB
type PostgresLocationRepository struct {
	db *sqlx.DB
}

// NewPostgresLocationRepository creates a new PostgreSQL location repository
func NewPostgresLocationRepository(db *sqlx.DB) *PostgresLocationRepository {
	return &PostgresLocationRepository{db: db}
}

func (r *PostgresLocationRepository) Create(ctx context.Context, record *domain.LocationRecord) error {
	query := `
		INSERT INTO location_records (
			id, driver_id, tractor_id, trip_id, latitude, longitude,
			speed_mph, heading, accuracy_meters, source, recorded_at, received_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`

	_, err := r.db.ExecContext(ctx, query,
		record.ID, record.DriverID, record.TractorID, record.TripID,
		record.Latitude, record.Longitude, record.SpeedMPH, record.Heading,
		record.AccuracyMeters, record.Source, record.RecordedAt, record.ReceivedAt,
	)
	return err
}

func (r *PostgresLocationRepository) GetByID(ctx context.Context, id uuid.UUID) (*domain.LocationRecord, error) {
	var record domain.LocationRecord
	query := `SELECT * FROM location_records WHERE id = $1`
	err := r.db.GetContext(ctx, &record, query, id)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &record, err
}

func (r *PostgresLocationRepository) GetHistory(ctx context.Context, driverID uuid.UUID, tripID *uuid.UUID, startTime, endTime time.Time, intervalSecs int) ([]domain.LocationRecord, error) {
	var records []domain.LocationRecord

	// Use TimescaleDB time_bucket for downsampling if interval specified
	var query string
	var args []interface{}

	if intervalSecs > 0 {
		query = `
			SELECT
				first(id, recorded_at) as id,
				driver_id,
				first(tractor_id, recorded_at) as tractor_id,
				first(trip_id, recorded_at) as trip_id,
				avg(latitude) as latitude,
				avg(longitude) as longitude,
				avg(speed_mph) as speed_mph,
				avg(heading) as heading,
				avg(accuracy_meters) as accuracy_meters,
				first(source, recorded_at) as source,
				time_bucket($1::interval, recorded_at) as recorded_at,
				first(received_at, recorded_at) as received_at
			FROM location_records
			WHERE driver_id = $2
			  AND recorded_at BETWEEN $3 AND $4`
		args = append(args, fmt.Sprintf("%d seconds", intervalSecs), driverID, startTime, endTime)

		if tripID != nil {
			query += ` AND trip_id = $5`
			args = append(args, *tripID)
		}

		query += ` GROUP BY driver_id, time_bucket($1::interval, recorded_at) ORDER BY recorded_at`
	} else {
		query = `
			SELECT * FROM location_records
			WHERE driver_id = $1
			  AND recorded_at BETWEEN $2 AND $3`
		args = append(args, driverID, startTime, endTime)

		if tripID != nil {
			query += ` AND trip_id = $4`
			args = append(args, *tripID)
		}

		query += ` ORDER BY recorded_at`
	}

	err := r.db.SelectContext(ctx, &records, query, args...)
	return records, err
}

func (r *PostgresLocationRepository) GetLatest(ctx context.Context, driverID uuid.UUID) (*domain.LocationRecord, error) {
	var record domain.LocationRecord
	query := `
		SELECT * FROM location_records
		WHERE driver_id = $1
		ORDER BY recorded_at DESC
		LIMIT 1`
	err := r.db.GetContext(ctx, &record, query, driverID)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &record, err
}

func (r *PostgresLocationRepository) GetByTripID(ctx context.Context, tripID uuid.UUID) ([]domain.LocationRecord, error) {
	var records []domain.LocationRecord
	query := `SELECT * FROM location_records WHERE trip_id = $1 ORDER BY recorded_at`
	err := r.db.SelectContext(ctx, &records, query, tripID)
	return records, err
}

func (r *PostgresLocationRepository) DeleteOlderThan(ctx context.Context, olderThan time.Time) (int64, error) {
	query := `DELETE FROM location_records WHERE recorded_at < $1`
	result, err := r.db.ExecContext(ctx, query, olderThan)
	if err != nil {
		return 0, err
	}
	return result.RowsAffected()
}

// PostgresMilestoneRepository implements MilestoneRepository
type PostgresMilestoneRepository struct {
	db *sqlx.DB
}

// NewPostgresMilestoneRepository creates a new PostgreSQL milestone repository
func NewPostgresMilestoneRepository(db *sqlx.DB) *PostgresMilestoneRepository {
	return &PostgresMilestoneRepository{db: db}
}

func (r *PostgresMilestoneRepository) Create(ctx context.Context, milestone *domain.Milestone) error {
	query := `
		INSERT INTO milestones (
			id, trip_id, stop_id, type, occurred_at, latitude, longitude,
			location_id, location_name, container_id, container_number,
			source, recorded_by, created_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`

	_, err := r.db.ExecContext(ctx, query,
		milestone.ID, milestone.TripID, milestone.StopID, milestone.Type,
		milestone.OccurredAt, milestone.Latitude, milestone.Longitude,
		milestone.LocationID, milestone.LocationName, milestone.ContainerID,
		milestone.ContainerNumber, milestone.Source, milestone.RecordedBy, milestone.CreatedAt,
	)
	return err
}

func (r *PostgresMilestoneRepository) GetByID(ctx context.Context, id uuid.UUID) (*domain.Milestone, error) {
	var milestone domain.Milestone
	query := `SELECT * FROM milestones WHERE id = $1`
	err := r.db.GetContext(ctx, &milestone, query, id)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &milestone, err
}

func (r *PostgresMilestoneRepository) GetByTripID(ctx context.Context, tripID uuid.UUID) ([]domain.Milestone, error) {
	var milestones []domain.Milestone
	query := `SELECT * FROM milestones WHERE trip_id = $1 ORDER BY occurred_at`
	err := r.db.SelectContext(ctx, &milestones, query, tripID)
	return milestones, err
}

func (r *PostgresMilestoneRepository) GetByContainerID(ctx context.Context, containerID uuid.UUID) ([]domain.Milestone, error) {
	var milestones []domain.Milestone
	query := `SELECT * FROM milestones WHERE container_id = $1 ORDER BY occurred_at`
	err := r.db.SelectContext(ctx, &milestones, query, containerID)
	return milestones, err
}

func (r *PostgresMilestoneRepository) GetByDateRange(ctx context.Context, startTime, endTime time.Time) ([]domain.Milestone, error) {
	var milestones []domain.Milestone
	query := `SELECT * FROM milestones WHERE occurred_at BETWEEN $1 AND $2 ORDER BY occurred_at`
	err := r.db.SelectContext(ctx, &milestones, query, startTime, endTime)
	return milestones, err
}

func (r *PostgresMilestoneRepository) Update(ctx context.Context, milestone *domain.Milestone) error {
	query := `
		UPDATE milestones SET
			stop_id = $2, type = $3, occurred_at = $4, latitude = $5, longitude = $6,
			location_id = $7, location_name = $8, container_id = $9, container_number = $10,
			source = $11, recorded_by = $12
		WHERE id = $1`

	_, err := r.db.ExecContext(ctx, query,
		milestone.ID, milestone.StopID, milestone.Type, milestone.OccurredAt,
		milestone.Latitude, milestone.Longitude, milestone.LocationID, milestone.LocationName,
		milestone.ContainerID, milestone.ContainerNumber, milestone.Source, milestone.RecordedBy,
	)
	return err
}

func (r *PostgresMilestoneRepository) Delete(ctx context.Context, id uuid.UUID) error {
	query := `DELETE FROM milestones WHERE id = $1`
	_, err := r.db.ExecContext(ctx, query, id)
	return err
}

// PostgresGeofenceRepository implements GeofenceRepository
type PostgresGeofenceRepository struct {
	db *sqlx.DB
}

// NewPostgresGeofenceRepository creates a new PostgreSQL geofence repository
func NewPostgresGeofenceRepository(db *sqlx.DB) *PostgresGeofenceRepository {
	return &PostgresGeofenceRepository{db: db}
}

func (r *PostgresGeofenceRepository) Create(ctx context.Context, geofence *domain.Geofence) error {
	query := `
		INSERT INTO geofences (
			id, location_id, name, type, center_latitude, center_longitude,
			radius_meters, is_active, created_at, updated_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`

	_, err := r.db.ExecContext(ctx, query,
		geofence.ID, geofence.LocationID, geofence.Name, geofence.Type,
		geofence.CenterLatitude, geofence.CenterLongitude, geofence.RadiusMeters,
		geofence.IsActive, geofence.CreatedAt, geofence.UpdatedAt,
	)
	return err
}

func (r *PostgresGeofenceRepository) GetByID(ctx context.Context, id uuid.UUID) (*domain.Geofence, error) {
	var geofence domain.Geofence
	query := `SELECT * FROM geofences WHERE id = $1`
	err := r.db.GetContext(ctx, &geofence, query, id)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &geofence, err
}

func (r *PostgresGeofenceRepository) GetByLocationID(ctx context.Context, locationID uuid.UUID) (*domain.Geofence, error) {
	var geofence domain.Geofence
	query := `SELECT * FROM geofences WHERE location_id = $1`
	err := r.db.GetContext(ctx, &geofence, query, locationID)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &geofence, err
}

func (r *PostgresGeofenceRepository) GetAll(ctx context.Context) ([]*domain.Geofence, error) {
	var geofences []*domain.Geofence
	query := `SELECT * FROM geofences ORDER BY name`
	err := r.db.SelectContext(ctx, &geofences, query)
	return geofences, err
}

func (r *PostgresGeofenceRepository) GetActive(ctx context.Context) ([]*domain.Geofence, error) {
	var geofences []*domain.Geofence
	query := `SELECT * FROM geofences WHERE is_active = true ORDER BY name`
	err := r.db.SelectContext(ctx, &geofences, query)
	return geofences, err
}

func (r *PostgresGeofenceRepository) Update(ctx context.Context, geofence *domain.Geofence) error {
	query := `
		UPDATE geofences SET
			name = $2, type = $3, center_latitude = $4, center_longitude = $5,
			radius_meters = $6, is_active = $7, updated_at = $8
		WHERE id = $1`

	_, err := r.db.ExecContext(ctx, query,
		geofence.ID, geofence.Name, geofence.Type, geofence.CenterLatitude,
		geofence.CenterLongitude, geofence.RadiusMeters, geofence.IsActive, time.Now(),
	)
	return err
}

func (r *PostgresGeofenceRepository) Delete(ctx context.Context, id uuid.UUID) error {
	query := `DELETE FROM geofences WHERE id = $1`
	_, err := r.db.ExecContext(ctx, query, id)
	return err
}

func (r *PostgresGeofenceRepository) SetActive(ctx context.Context, id uuid.UUID, isActive bool) error {
	query := `UPDATE geofences SET is_active = $2, updated_at = $3 WHERE id = $1`
	_, err := r.db.ExecContext(ctx, query, id, isActive, time.Now())
	return err
}
