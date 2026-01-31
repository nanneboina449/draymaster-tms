package repository

import (
	"context"
	"database/sql"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"

	"github.com/draymaster/services/tracking-service/internal/domain"
)

// Helper to create a mock DB
func newMockDB(t *testing.T) (*sqlx.DB, sqlmock.Sqlmock) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("failed to create sqlmock: %v", err)
	}
	return sqlx.NewDb(db, "postgres"), mock
}

// ============================================================================
// PostgresLocationRepository Tests
// ============================================================================

func TestPostgresLocationRepository_Create(t *testing.T) {
	db, mock := newMockDB(t)
	defer db.Close()

	repo := NewPostgresLocationRepository(db)

	record := &domain.LocationRecord{
		ID:             uuid.New(),
		DriverID:       uuid.New(),
		TractorID:      uuidPtr(uuid.New()),
		TripID:         uuidPtr(uuid.New()),
		Latitude:       33.7397,
		Longitude:      -118.2628,
		SpeedMPH:       45.5,
		Heading:        180,
		AccuracyMeters: 10.0,
		Source:         "GPS",
		RecordedAt:     time.Now(),
		ReceivedAt:     time.Now(),
	}

	mock.ExpectExec("INSERT INTO location_records").
		WithArgs(
			record.ID, record.DriverID, record.TractorID, record.TripID,
			record.Latitude, record.Longitude, record.SpeedMPH, record.Heading,
			record.AccuracyMeters, record.Source, record.RecordedAt, record.ReceivedAt,
		).
		WillReturnResult(sqlmock.NewResult(1, 1))

	err := repo.Create(context.Background(), record)

	if err != nil {
		t.Errorf("expected no error, got %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unfulfilled expectations: %v", err)
	}
}

func TestPostgresLocationRepository_GetByID(t *testing.T) {
	db, mock := newMockDB(t)
	defer db.Close()

	repo := NewPostgresLocationRepository(db)
	recordID := uuid.New()
	driverID := uuid.New()

	rows := sqlmock.NewRows([]string{
		"id", "driver_id", "latitude", "longitude", "speed_mph", "source", "recorded_at",
	}).AddRow(recordID, driverID, 33.7397, -118.2628, 45.5, "GPS", time.Now())

	mock.ExpectQuery("SELECT \\* FROM location_records WHERE id = \\$1").
		WithArgs(recordID).
		WillReturnRows(rows)

	record, err := repo.GetByID(context.Background(), recordID)

	if err != nil {
		t.Errorf("expected no error, got %v", err)
	}
	if record == nil {
		t.Error("expected record, got nil")
	}
	if record != nil && record.Latitude != 33.7397 {
		t.Errorf("expected latitude 33.7397, got %f", record.Latitude)
	}
}

func TestPostgresLocationRepository_GetByID_NotFound(t *testing.T) {
	db, mock := newMockDB(t)
	defer db.Close()

	repo := NewPostgresLocationRepository(db)
	recordID := uuid.New()

	mock.ExpectQuery("SELECT \\* FROM location_records WHERE id = \\$1").
		WithArgs(recordID).
		WillReturnError(sql.ErrNoRows)

	record, err := repo.GetByID(context.Background(), recordID)

	if err != nil {
		t.Errorf("expected no error for not found, got %v", err)
	}
	if record != nil {
		t.Error("expected nil record for not found")
	}
}

func TestPostgresLocationRepository_GetLatest(t *testing.T) {
	db, mock := newMockDB(t)
	defer db.Close()

	repo := NewPostgresLocationRepository(db)
	driverID := uuid.New()

	rows := sqlmock.NewRows([]string{
		"id", "driver_id", "latitude", "longitude", "speed_mph", "recorded_at",
	}).AddRow(uuid.New(), driverID, 33.9425, -118.4081, 55.0, time.Now())

	mock.ExpectQuery("SELECT \\* FROM location_records").
		WithArgs(driverID).
		WillReturnRows(rows)

	record, err := repo.GetLatest(context.Background(), driverID)

	if err != nil {
		t.Errorf("expected no error, got %v", err)
	}
	if record == nil {
		t.Error("expected record, got nil")
	}
}

func TestPostgresLocationRepository_GetLatest_NotFound(t *testing.T) {
	db, mock := newMockDB(t)
	defer db.Close()

	repo := NewPostgresLocationRepository(db)
	driverID := uuid.New()

	mock.ExpectQuery("SELECT \\* FROM location_records").
		WithArgs(driverID).
		WillReturnError(sql.ErrNoRows)

	record, err := repo.GetLatest(context.Background(), driverID)

	if err != nil {
		t.Errorf("expected no error for not found, got %v", err)
	}
	if record != nil {
		t.Error("expected nil record for not found")
	}
}

func TestPostgresLocationRepository_GetByTripID(t *testing.T) {
	db, mock := newMockDB(t)
	defer db.Close()

	repo := NewPostgresLocationRepository(db)
	tripID := uuid.New()
	driverID := uuid.New()

	rows := sqlmock.NewRows([]string{
		"id", "driver_id", "trip_id", "latitude", "longitude", "recorded_at",
	}).
		AddRow(uuid.New(), driverID, tripID, 33.7397, -118.2628, time.Now().Add(-1*time.Hour)).
		AddRow(uuid.New(), driverID, tripID, 33.8505, -118.1547, time.Now().Add(-30*time.Minute)).
		AddRow(uuid.New(), driverID, tripID, 33.9425, -118.4081, time.Now())

	mock.ExpectQuery("SELECT \\* FROM location_records WHERE trip_id = \\$1").
		WithArgs(tripID).
		WillReturnRows(rows)

	records, err := repo.GetByTripID(context.Background(), tripID)

	if err != nil {
		t.Errorf("expected no error, got %v", err)
	}
	if len(records) != 3 {
		t.Errorf("expected 3 records, got %d", len(records))
	}
}

func TestPostgresLocationRepository_GetHistory_WithoutDownsampling(t *testing.T) {
	db, mock := newMockDB(t)
	defer db.Close()

	repo := NewPostgresLocationRepository(db)
	driverID := uuid.New()
	startTime := time.Now().Add(-2 * time.Hour)
	endTime := time.Now()

	rows := sqlmock.NewRows([]string{
		"id", "driver_id", "latitude", "longitude", "recorded_at",
	}).
		AddRow(uuid.New(), driverID, 33.7397, -118.2628, time.Now().Add(-90*time.Minute)).
		AddRow(uuid.New(), driverID, 33.8505, -118.1547, time.Now().Add(-60*time.Minute))

	mock.ExpectQuery("SELECT \\* FROM location_records").
		WithArgs(driverID, startTime, endTime).
		WillReturnRows(rows)

	records, err := repo.GetHistory(context.Background(), driverID, nil, startTime, endTime, 0)

	if err != nil {
		t.Errorf("expected no error, got %v", err)
	}
	if len(records) != 2 {
		t.Errorf("expected 2 records, got %d", len(records))
	}
}

func TestPostgresLocationRepository_DeleteOlderThan(t *testing.T) {
	db, mock := newMockDB(t)
	defer db.Close()

	repo := NewPostgresLocationRepository(db)
	olderThan := time.Now().Add(-30 * 24 * time.Hour)

	mock.ExpectExec("DELETE FROM location_records WHERE recorded_at < \\$1").
		WithArgs(olderThan).
		WillReturnResult(sqlmock.NewResult(0, 1000))

	deleted, err := repo.DeleteOlderThan(context.Background(), olderThan)

	if err != nil {
		t.Errorf("expected no error, got %v", err)
	}
	if deleted != 1000 {
		t.Errorf("expected 1000 deleted, got %d", deleted)
	}
}

// ============================================================================
// PostgresMilestoneRepository Tests
// ============================================================================

func TestPostgresMilestoneRepository_Create(t *testing.T) {
	db, mock := newMockDB(t)
	defer db.Close()

	repo := NewPostgresMilestoneRepository(db)

	milestone := &domain.Milestone{
		ID:              uuid.New(),
		TripID:          uuid.New(),
		StopID:          uuidPtr(uuid.New()),
		Type:            "ARRIVAL",
		OccurredAt:      time.Now(),
		Latitude:        33.7397,
		Longitude:       -118.2628,
		LocationID:      uuidPtr(uuid.New()),
		LocationName:    "Port of Los Angeles",
		ContainerID:     uuidPtr(uuid.New()),
		ContainerNumber: "MSCU1234567",
		Source:          "GPS",
		RecordedBy:      uuidPtr(uuid.New()),
		CreatedAt:       time.Now(),
	}

	mock.ExpectExec("INSERT INTO milestones").
		WithArgs(
			milestone.ID, milestone.TripID, milestone.StopID, milestone.Type,
			milestone.OccurredAt, milestone.Latitude, milestone.Longitude,
			milestone.LocationID, milestone.LocationName, milestone.ContainerID,
			milestone.ContainerNumber, milestone.Source, milestone.RecordedBy, milestone.CreatedAt,
		).
		WillReturnResult(sqlmock.NewResult(1, 1))

	err := repo.Create(context.Background(), milestone)

	if err != nil {
		t.Errorf("expected no error, got %v", err)
	}
}

func TestPostgresMilestoneRepository_GetByID(t *testing.T) {
	db, mock := newMockDB(t)
	defer db.Close()

	repo := NewPostgresMilestoneRepository(db)
	milestoneID := uuid.New()

	rows := sqlmock.NewRows([]string{
		"id", "trip_id", "type", "occurred_at", "location_name",
	}).AddRow(milestoneID, uuid.New(), "ARRIVAL", time.Now(), "Port of LA")

	mock.ExpectQuery("SELECT \\* FROM milestones WHERE id = \\$1").
		WithArgs(milestoneID).
		WillReturnRows(rows)

	milestone, err := repo.GetByID(context.Background(), milestoneID)

	if err != nil {
		t.Errorf("expected no error, got %v", err)
	}
	if milestone == nil {
		t.Error("expected milestone, got nil")
	}
	if milestone != nil && milestone.Type != "ARRIVAL" {
		t.Errorf("expected type ARRIVAL, got %s", milestone.Type)
	}
}

func TestPostgresMilestoneRepository_GetByID_NotFound(t *testing.T) {
	db, mock := newMockDB(t)
	defer db.Close()

	repo := NewPostgresMilestoneRepository(db)
	milestoneID := uuid.New()

	mock.ExpectQuery("SELECT \\* FROM milestones WHERE id = \\$1").
		WithArgs(milestoneID).
		WillReturnError(sql.ErrNoRows)

	milestone, err := repo.GetByID(context.Background(), milestoneID)

	if err != nil {
		t.Errorf("expected no error for not found, got %v", err)
	}
	if milestone != nil {
		t.Error("expected nil milestone for not found")
	}
}

func TestPostgresMilestoneRepository_GetByTripID(t *testing.T) {
	db, mock := newMockDB(t)
	defer db.Close()

	repo := NewPostgresMilestoneRepository(db)
	tripID := uuid.New()

	rows := sqlmock.NewRows([]string{
		"id", "trip_id", "type", "occurred_at", "location_name",
	}).
		AddRow(uuid.New(), tripID, "DEPARTURE", time.Now().Add(-2*time.Hour), "Terminal A").
		AddRow(uuid.New(), tripID, "ARRIVAL", time.Now().Add(-1*time.Hour), "Port of LA").
		AddRow(uuid.New(), tripID, "LOADED", time.Now().Add(-30*time.Minute), "Port of LA").
		AddRow(uuid.New(), tripID, "DEPARTURE", time.Now(), "Port of LA")

	mock.ExpectQuery("SELECT \\* FROM milestones WHERE trip_id = \\$1").
		WithArgs(tripID).
		WillReturnRows(rows)

	milestones, err := repo.GetByTripID(context.Background(), tripID)

	if err != nil {
		t.Errorf("expected no error, got %v", err)
	}
	if len(milestones) != 4 {
		t.Errorf("expected 4 milestones, got %d", len(milestones))
	}
}

func TestPostgresMilestoneRepository_GetByContainerID(t *testing.T) {
	db, mock := newMockDB(t)
	defer db.Close()

	repo := NewPostgresMilestoneRepository(db)
	containerID := uuid.New()

	rows := sqlmock.NewRows([]string{
		"id", "container_id", "type", "occurred_at",
	}).
		AddRow(uuid.New(), containerID, "PICKUP", time.Now().Add(-4*time.Hour)).
		AddRow(uuid.New(), containerID, "DELIVERY", time.Now())

	mock.ExpectQuery("SELECT \\* FROM milestones WHERE container_id = \\$1").
		WithArgs(containerID).
		WillReturnRows(rows)

	milestones, err := repo.GetByContainerID(context.Background(), containerID)

	if err != nil {
		t.Errorf("expected no error, got %v", err)
	}
	if len(milestones) != 2 {
		t.Errorf("expected 2 milestones, got %d", len(milestones))
	}
}

func TestPostgresMilestoneRepository_GetByDateRange(t *testing.T) {
	db, mock := newMockDB(t)
	defer db.Close()

	repo := NewPostgresMilestoneRepository(db)
	startTime := time.Now().Add(-24 * time.Hour)
	endTime := time.Now()

	rows := sqlmock.NewRows([]string{
		"id", "trip_id", "type", "occurred_at",
	}).
		AddRow(uuid.New(), uuid.New(), "ARRIVAL", time.Now().Add(-12*time.Hour)).
		AddRow(uuid.New(), uuid.New(), "DEPARTURE", time.Now().Add(-6*time.Hour))

	mock.ExpectQuery("SELECT \\* FROM milestones WHERE occurred_at BETWEEN \\$1 AND \\$2").
		WithArgs(startTime, endTime).
		WillReturnRows(rows)

	milestones, err := repo.GetByDateRange(context.Background(), startTime, endTime)

	if err != nil {
		t.Errorf("expected no error, got %v", err)
	}
	if len(milestones) != 2 {
		t.Errorf("expected 2 milestones, got %d", len(milestones))
	}
}

func TestPostgresMilestoneRepository_Update(t *testing.T) {
	db, mock := newMockDB(t)
	defer db.Close()

	repo := NewPostgresMilestoneRepository(db)

	milestone := &domain.Milestone{
		ID:           uuid.New(),
		Type:         "ARRIVAL",
		OccurredAt:   time.Now(),
		LocationName: "Updated Location",
	}

	mock.ExpectExec("UPDATE milestones SET").
		WithArgs(
			milestone.ID, milestone.StopID, milestone.Type, milestone.OccurredAt,
			milestone.Latitude, milestone.Longitude, milestone.LocationID, milestone.LocationName,
			milestone.ContainerID, milestone.ContainerNumber, milestone.Source, milestone.RecordedBy,
		).
		WillReturnResult(sqlmock.NewResult(0, 1))

	err := repo.Update(context.Background(), milestone)

	if err != nil {
		t.Errorf("expected no error, got %v", err)
	}
}

func TestPostgresMilestoneRepository_Delete(t *testing.T) {
	db, mock := newMockDB(t)
	defer db.Close()

	repo := NewPostgresMilestoneRepository(db)
	milestoneID := uuid.New()

	mock.ExpectExec("DELETE FROM milestones WHERE id = \\$1").
		WithArgs(milestoneID).
		WillReturnResult(sqlmock.NewResult(0, 1))

	err := repo.Delete(context.Background(), milestoneID)

	if err != nil {
		t.Errorf("expected no error, got %v", err)
	}
}

// ============================================================================
// PostgresGeofenceRepository Tests
// ============================================================================

func TestPostgresGeofenceRepository_Create(t *testing.T) {
	db, mock := newMockDB(t)
	defer db.Close()

	repo := NewPostgresGeofenceRepository(db)

	geofence := &domain.Geofence{
		ID:              uuid.New(),
		LocationID:      uuidPtr(uuid.New()),
		Name:            "Port of Los Angeles",
		Type:            "POLYGON",
		CenterLatitude:  33.7397,
		CenterLongitude: -118.2628,
		RadiusMeters:    500,
		IsActive:        true,
		CreatedAt:       time.Now(),
		UpdatedAt:       time.Now(),
	}

	mock.ExpectExec("INSERT INTO geofences").
		WithArgs(
			geofence.ID, geofence.LocationID, geofence.Name, geofence.Type,
			geofence.CenterLatitude, geofence.CenterLongitude, geofence.RadiusMeters,
			geofence.IsActive, geofence.CreatedAt, geofence.UpdatedAt,
		).
		WillReturnResult(sqlmock.NewResult(1, 1))

	err := repo.Create(context.Background(), geofence)

	if err != nil {
		t.Errorf("expected no error, got %v", err)
	}
}

func TestPostgresGeofenceRepository_GetByID(t *testing.T) {
	db, mock := newMockDB(t)
	defer db.Close()

	repo := NewPostgresGeofenceRepository(db)
	geofenceID := uuid.New()

	rows := sqlmock.NewRows([]string{
		"id", "name", "type", "center_latitude", "center_longitude", "radius_meters", "is_active",
	}).AddRow(geofenceID, "Port of LA", "CIRCLE", 33.7397, -118.2628, 500, true)

	mock.ExpectQuery("SELECT \\* FROM geofences WHERE id = \\$1").
		WithArgs(geofenceID).
		WillReturnRows(rows)

	geofence, err := repo.GetByID(context.Background(), geofenceID)

	if err != nil {
		t.Errorf("expected no error, got %v", err)
	}
	if geofence == nil {
		t.Error("expected geofence, got nil")
	}
	if geofence != nil && geofence.Name != "Port of LA" {
		t.Errorf("expected name 'Port of LA', got '%s'", geofence.Name)
	}
}

func TestPostgresGeofenceRepository_GetByID_NotFound(t *testing.T) {
	db, mock := newMockDB(t)
	defer db.Close()

	repo := NewPostgresGeofenceRepository(db)
	geofenceID := uuid.New()

	mock.ExpectQuery("SELECT \\* FROM geofences WHERE id = \\$1").
		WithArgs(geofenceID).
		WillReturnError(sql.ErrNoRows)

	geofence, err := repo.GetByID(context.Background(), geofenceID)

	if err != nil {
		t.Errorf("expected no error for not found, got %v", err)
	}
	if geofence != nil {
		t.Error("expected nil geofence for not found")
	}
}

func TestPostgresGeofenceRepository_GetByLocationID(t *testing.T) {
	db, mock := newMockDB(t)
	defer db.Close()

	repo := NewPostgresGeofenceRepository(db)
	locationID := uuid.New()

	rows := sqlmock.NewRows([]string{
		"id", "location_id", "name", "type", "is_active",
	}).AddRow(uuid.New(), locationID, "Terminal A", "POLYGON", true)

	mock.ExpectQuery("SELECT \\* FROM geofences WHERE location_id = \\$1").
		WithArgs(locationID).
		WillReturnRows(rows)

	geofence, err := repo.GetByLocationID(context.Background(), locationID)

	if err != nil {
		t.Errorf("expected no error, got %v", err)
	}
	if geofence == nil {
		t.Error("expected geofence, got nil")
	}
}

func TestPostgresGeofenceRepository_GetAll(t *testing.T) {
	db, mock := newMockDB(t)
	defer db.Close()

	repo := NewPostgresGeofenceRepository(db)

	rows := sqlmock.NewRows([]string{
		"id", "name", "type", "is_active",
	}).
		AddRow(uuid.New(), "Port of LA", "POLYGON", true).
		AddRow(uuid.New(), "Port of Long Beach", "CIRCLE", true).
		AddRow(uuid.New(), "Terminal A", "POLYGON", false)

	mock.ExpectQuery("SELECT \\* FROM geofences ORDER BY name").
		WillReturnRows(rows)

	geofences, err := repo.GetAll(context.Background())

	if err != nil {
		t.Errorf("expected no error, got %v", err)
	}
	if len(geofences) != 3 {
		t.Errorf("expected 3 geofences, got %d", len(geofences))
	}
}

func TestPostgresGeofenceRepository_GetActive(t *testing.T) {
	db, mock := newMockDB(t)
	defer db.Close()

	repo := NewPostgresGeofenceRepository(db)

	rows := sqlmock.NewRows([]string{
		"id", "name", "type", "is_active",
	}).
		AddRow(uuid.New(), "Port of LA", "POLYGON", true).
		AddRow(uuid.New(), "Port of Long Beach", "CIRCLE", true)

	mock.ExpectQuery("SELECT \\* FROM geofences WHERE is_active = true").
		WillReturnRows(rows)

	geofences, err := repo.GetActive(context.Background())

	if err != nil {
		t.Errorf("expected no error, got %v", err)
	}
	if len(geofences) != 2 {
		t.Errorf("expected 2 active geofences, got %d", len(geofences))
	}
}

func TestPostgresGeofenceRepository_Update(t *testing.T) {
	db, mock := newMockDB(t)
	defer db.Close()

	repo := NewPostgresGeofenceRepository(db)

	geofence := &domain.Geofence{
		ID:              uuid.New(),
		Name:            "Updated Geofence",
		Type:            "CIRCLE",
		CenterLatitude:  33.7500,
		CenterLongitude: -118.2700,
		RadiusMeters:    600,
		IsActive:        true,
	}

	mock.ExpectExec("UPDATE geofences SET").
		WithArgs(
			geofence.ID, geofence.Name, geofence.Type, geofence.CenterLatitude,
			geofence.CenterLongitude, geofence.RadiusMeters, geofence.IsActive, sqlmock.AnyArg(),
		).
		WillReturnResult(sqlmock.NewResult(0, 1))

	err := repo.Update(context.Background(), geofence)

	if err != nil {
		t.Errorf("expected no error, got %v", err)
	}
}

func TestPostgresGeofenceRepository_Delete(t *testing.T) {
	db, mock := newMockDB(t)
	defer db.Close()

	repo := NewPostgresGeofenceRepository(db)
	geofenceID := uuid.New()

	mock.ExpectExec("DELETE FROM geofences WHERE id = \\$1").
		WithArgs(geofenceID).
		WillReturnResult(sqlmock.NewResult(0, 1))

	err := repo.Delete(context.Background(), geofenceID)

	if err != nil {
		t.Errorf("expected no error, got %v", err)
	}
}

func TestPostgresGeofenceRepository_SetActive(t *testing.T) {
	testCases := []struct {
		name     string
		isActive bool
	}{
		{"activate geofence", true},
		{"deactivate geofence", false},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			db, mock := newMockDB(t)
			defer db.Close()

			repo := NewPostgresGeofenceRepository(db)
			geofenceID := uuid.New()

			mock.ExpectExec("UPDATE geofences SET is_active = \\$2").
				WithArgs(geofenceID, tc.isActive, sqlmock.AnyArg()).
				WillReturnResult(sqlmock.NewResult(0, 1))

			err := repo.SetActive(context.Background(), geofenceID, tc.isActive)

			if err != nil {
				t.Errorf("expected no error, got %v", err)
			}
		})
	}
}

// ============================================================================
// Repository Constructor Tests
// ============================================================================

func TestNewPostgresLocationRepository(t *testing.T) {
	db, _ := newMockDB(t)
	defer db.Close()

	repo := NewPostgresLocationRepository(db)

	if repo == nil {
		t.Error("expected non-nil repository")
	}
	if repo.db != db {
		t.Error("expected db to be set")
	}
}

func TestNewPostgresMilestoneRepository(t *testing.T) {
	db, _ := newMockDB(t)
	defer db.Close()

	repo := NewPostgresMilestoneRepository(db)

	if repo == nil {
		t.Error("expected non-nil repository")
	}
}

func TestNewPostgresGeofenceRepository(t *testing.T) {
	db, _ := newMockDB(t)
	defer db.Close()

	repo := NewPostgresGeofenceRepository(db)

	if repo == nil {
		t.Error("expected non-nil repository")
	}
}

// ============================================================================
// Error Handling Tests
// ============================================================================

func TestPostgresLocationRepository_Create_DBError(t *testing.T) {
	db, mock := newMockDB(t)
	defer db.Close()

	repo := NewPostgresLocationRepository(db)

	record := &domain.LocationRecord{
		ID:       uuid.New(),
		DriverID: uuid.New(),
	}

	mock.ExpectExec("INSERT INTO location_records").
		WillReturnError(sql.ErrConnDone)

	err := repo.Create(context.Background(), record)

	if err == nil {
		t.Error("expected error, got nil")
	}
}

func TestPostgresMilestoneRepository_Create_DBError(t *testing.T) {
	db, mock := newMockDB(t)
	defer db.Close()

	repo := NewPostgresMilestoneRepository(db)

	milestone := &domain.Milestone{
		ID:     uuid.New(),
		TripID: uuid.New(),
	}

	mock.ExpectExec("INSERT INTO milestones").
		WillReturnError(sql.ErrConnDone)

	err := repo.Create(context.Background(), milestone)

	if err == nil {
		t.Error("expected error, got nil")
	}
}

func TestPostgresGeofenceRepository_Create_DBError(t *testing.T) {
	db, mock := newMockDB(t)
	defer db.Close()

	repo := NewPostgresGeofenceRepository(db)

	geofence := &domain.Geofence{
		ID:   uuid.New(),
		Name: "Test",
	}

	mock.ExpectExec("INSERT INTO geofences").
		WillReturnError(sql.ErrConnDone)

	err := repo.Create(context.Background(), geofence)

	if err == nil {
		t.Error("expected error, got nil")
	}
}

// Helper function
func uuidPtr(u uuid.UUID) *uuid.UUID {
	return &u
}
