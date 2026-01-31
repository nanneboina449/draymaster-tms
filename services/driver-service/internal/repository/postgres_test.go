package repository

import (
	"context"
	"database/sql"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"

	"github.com/draymaster/services/driver-service/internal/domain"
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
// PostgresDriverRepository Tests
// ============================================================================

func TestPostgresDriverRepository_Create(t *testing.T) {
	db, mock := newMockDB(t)
	defer db.Close()

	repo := NewPostgresDriverRepository(db)

	driver := &domain.Driver{
		ID:             uuid.New(),
		EmployeeNumber: "EMP001",
		FirstName:      "John",
		LastName:       "Doe",
		Email:          "john.doe@example.com",
		Phone:          "555-123-4567",
		Status:         domain.DriverStatusAvailable,
		LicenseNumber:  "DL12345",
		LicenseState:   "CA",
		LicenseClass:   "A",
		CreatedAt:      time.Now(),
		UpdatedAt:      time.Now(),
	}

	mock.ExpectExec("INSERT INTO drivers").
		WithArgs(
			driver.ID, driver.EmployeeNumber, driver.FirstName, driver.LastName,
			driver.Email, driver.Phone, driver.Status,
			driver.LicenseNumber, driver.LicenseState, driver.LicenseClass, driver.LicenseExpiration,
			driver.HasTWIC, driver.TWICExpiration, driver.HasHazmatEndorsement, driver.HazmatExpiration,
			driver.HasTankerEndorsement, driver.HasDoublesEndorsement, driver.MedicalCardExpiration,
			driver.CurrentLatitude, driver.CurrentLongitude, driver.CurrentTractorID, driver.CurrentTripID,
			driver.AvailableDriveMins, driver.AvailableDutyMins, driver.AvailableCycleMins, driver.LastHOSUpdate,
			driver.HomeTerminalID, driver.HireDate, driver.AppUserID, driver.DeviceToken,
			driver.CreatedAt, driver.UpdatedAt,
		).
		WillReturnResult(sqlmock.NewResult(1, 1))

	err := repo.Create(context.Background(), driver)

	if err != nil {
		t.Errorf("expected no error, got %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unfulfilled expectations: %v", err)
	}
}

func TestPostgresDriverRepository_GetByID(t *testing.T) {
	db, mock := newMockDB(t)
	defer db.Close()

	repo := NewPostgresDriverRepository(db)
	driverID := uuid.New()

	rows := sqlmock.NewRows([]string{
		"id", "employee_number", "first_name", "last_name", "email", "phone", "status",
		"license_number", "license_state", "license_class",
	}).AddRow(
		driverID, "EMP001", "John", "Doe", "john@example.com", "555-123-4567", "AVAILABLE",
		"DL12345", "CA", "A",
	)

	mock.ExpectQuery("SELECT \\* FROM drivers WHERE id = \\$1").
		WithArgs(driverID).
		WillReturnRows(rows)

	driver, err := repo.GetByID(context.Background(), driverID)

	if err != nil {
		t.Errorf("expected no error, got %v", err)
	}
	if driver == nil {
		t.Error("expected driver, got nil")
	}
	if driver != nil && driver.FirstName != "John" {
		t.Errorf("expected FirstName 'John', got '%s'", driver.FirstName)
	}
}

func TestPostgresDriverRepository_GetByID_NotFound(t *testing.T) {
	db, mock := newMockDB(t)
	defer db.Close()

	repo := NewPostgresDriverRepository(db)
	driverID := uuid.New()

	mock.ExpectQuery("SELECT \\* FROM drivers WHERE id = \\$1").
		WithArgs(driverID).
		WillReturnError(sql.ErrNoRows)

	driver, err := repo.GetByID(context.Background(), driverID)

	if err != nil {
		t.Errorf("expected no error for not found, got %v", err)
	}
	if driver != nil {
		t.Error("expected nil driver for not found")
	}
}

func TestPostgresDriverRepository_GetByEmployeeNumber(t *testing.T) {
	db, mock := newMockDB(t)
	defer db.Close()

	repo := NewPostgresDriverRepository(db)

	rows := sqlmock.NewRows([]string{
		"id", "employee_number", "first_name", "last_name",
	}).AddRow(uuid.New(), "EMP001", "John", "Doe")

	mock.ExpectQuery("SELECT \\* FROM drivers WHERE employee_number = \\$1").
		WithArgs("EMP001").
		WillReturnRows(rows)

	driver, err := repo.GetByEmployeeNumber(context.Background(), "EMP001")

	if err != nil {
		t.Errorf("expected no error, got %v", err)
	}
	if driver == nil {
		t.Error("expected driver, got nil")
	}
}

func TestPostgresDriverRepository_GetAll(t *testing.T) {
	db, mock := newMockDB(t)
	defer db.Close()

	repo := NewPostgresDriverRepository(db)

	rows := sqlmock.NewRows([]string{
		"id", "employee_number", "first_name", "last_name",
	}).
		AddRow(uuid.New(), "EMP001", "Alice", "Smith").
		AddRow(uuid.New(), "EMP002", "Bob", "Jones")

	mock.ExpectQuery("SELECT \\* FROM drivers WHERE termination_date IS NULL").
		WillReturnRows(rows)

	drivers, err := repo.GetAll(context.Background())

	if err != nil {
		t.Errorf("expected no error, got %v", err)
	}
	if len(drivers) != 2 {
		t.Errorf("expected 2 drivers, got %d", len(drivers))
	}
}

func TestPostgresDriverRepository_GetByStatus(t *testing.T) {
	db, mock := newMockDB(t)
	defer db.Close()

	repo := NewPostgresDriverRepository(db)

	rows := sqlmock.NewRows([]string{
		"id", "employee_number", "first_name", "last_name", "status",
	}).
		AddRow(uuid.New(), "EMP001", "John", "Doe", "AVAILABLE")

	mock.ExpectQuery("SELECT \\* FROM drivers WHERE status = \\$1").
		WithArgs(domain.DriverStatusAvailable).
		WillReturnRows(rows)

	drivers, err := repo.GetByStatus(context.Background(), domain.DriverStatusAvailable)

	if err != nil {
		t.Errorf("expected no error, got %v", err)
	}
	if len(drivers) != 1 {
		t.Errorf("expected 1 driver, got %d", len(drivers))
	}
}

func TestPostgresDriverRepository_GetAvailable(t *testing.T) {
	db, mock := newMockDB(t)
	defer db.Close()

	repo := NewPostgresDriverRepository(db)

	rows := sqlmock.NewRows([]string{
		"id", "employee_number", "first_name", "last_name",
		"available_drive_mins", "available_duty_mins", "available_cycle_mins",
	}).
		AddRow(uuid.New(), "EMP001", "John", "Doe", 600, 840, 4200)

	mock.ExpectQuery("SELECT \\* FROM drivers").
		WillReturnRows(rows)

	drivers, err := repo.GetAvailable(context.Background())

	if err != nil {
		t.Errorf("expected no error, got %v", err)
	}
	if len(drivers) != 1 {
		t.Errorf("expected 1 driver, got %d", len(drivers))
	}
}

func TestPostgresDriverRepository_UpdateStatus(t *testing.T) {
	db, mock := newMockDB(t)
	defer db.Close()

	repo := NewPostgresDriverRepository(db)
	driverID := uuid.New()

	mock.ExpectExec("UPDATE drivers SET status = \\$2").
		WithArgs(driverID, domain.DriverStatusDriving, sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(0, 1))

	err := repo.UpdateStatus(context.Background(), driverID, domain.DriverStatusDriving)

	if err != nil {
		t.Errorf("expected no error, got %v", err)
	}
}

func TestPostgresDriverRepository_UpdateLocation(t *testing.T) {
	db, mock := newMockDB(t)
	defer db.Close()

	repo := NewPostgresDriverRepository(db)
	driverID := uuid.New()

	mock.ExpectExec("UPDATE drivers SET current_latitude = \\$2").
		WithArgs(driverID, 33.9425, -118.4081, sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(0, 1))

	err := repo.UpdateLocation(context.Background(), driverID, 33.9425, -118.4081)

	if err != nil {
		t.Errorf("expected no error, got %v", err)
	}
}

func TestPostgresDriverRepository_UpdateHOS(t *testing.T) {
	db, mock := newMockDB(t)
	defer db.Close()

	repo := NewPostgresDriverRepository(db)
	driverID := uuid.New()

	mock.ExpectExec("UPDATE drivers SET").
		WithArgs(driverID, 600, 840, 4000, sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(0, 1))

	err := repo.UpdateHOS(context.Background(), driverID, 600, 840, 4000)

	if err != nil {
		t.Errorf("expected no error, got %v", err)
	}
}

func TestPostgresDriverRepository_Delete(t *testing.T) {
	db, mock := newMockDB(t)
	defer db.Close()

	repo := NewPostgresDriverRepository(db)
	driverID := uuid.New()

	// Soft delete
	mock.ExpectExec("UPDATE drivers SET termination_date").
		WithArgs(driverID, sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(0, 1))

	err := repo.Delete(context.Background(), driverID)

	if err != nil {
		t.Errorf("expected no error, got %v", err)
	}
}

func TestPostgresDriverRepository_GetExpiringDocuments(t *testing.T) {
	db, mock := newMockDB(t)
	defer db.Close()

	repo := NewPostgresDriverRepository(db)

	rows := sqlmock.NewRows([]string{
		"id", "employee_number", "first_name", "last_name", "license_expiration",
	}).
		AddRow(uuid.New(), "EMP001", "John", "Doe", time.Now().AddDate(0, 0, 15))

	mock.ExpectQuery("SELECT \\* FROM drivers").
		WithArgs(sqlmock.AnyArg()).
		WillReturnRows(rows)

	drivers, err := repo.GetExpiringDocuments(context.Background(), 30)

	if err != nil {
		t.Errorf("expected no error, got %v", err)
	}
	if len(drivers) != 1 {
		t.Errorf("expected 1 driver with expiring docs, got %d", len(drivers))
	}
}

// ============================================================================
// PostgresHOSLogRepository Tests
// ============================================================================

func TestPostgresHOSLogRepository_Create(t *testing.T) {
	db, mock := newMockDB(t)
	defer db.Close()

	repo := NewPostgresHOSLogRepository(db)

	log := &domain.HOSLog{
		ID:        uuid.New(),
		DriverID:  uuid.New(),
		Status:    domain.HOSStatusDriving,
		StartTime: time.Now(),
		Location:  "Port of Los Angeles",
		Latitude:  33.7397,
		Longitude: -118.2628,
		CreatedAt: time.Now(),
	}

	mock.ExpectExec("INSERT INTO hos_logs").
		WithArgs(
			log.ID, log.DriverID, log.Status, log.StartTime, log.EndTime, log.DurationMins,
			log.Location, log.Latitude, log.Longitude, log.Odometer, log.EngineHours,
			log.TripID, log.TractorID, log.Notes, log.Source, log.EditReason, log.OriginalLogID, log.CreatedAt,
		).
		WillReturnResult(sqlmock.NewResult(1, 1))

	err := repo.Create(context.Background(), log)

	if err != nil {
		t.Errorf("expected no error, got %v", err)
	}
}

func TestPostgresHOSLogRepository_GetByID(t *testing.T) {
	db, mock := newMockDB(t)
	defer db.Close()

	repo := NewPostgresHOSLogRepository(db)
	logID := uuid.New()

	rows := sqlmock.NewRows([]string{
		"id", "driver_id", "status", "start_time", "location",
	}).AddRow(logID, uuid.New(), "DRIVING", time.Now(), "Terminal")

	mock.ExpectQuery("SELECT \\* FROM hos_logs WHERE id = \\$1").
		WithArgs(logID).
		WillReturnRows(rows)

	log, err := repo.GetByID(context.Background(), logID)

	if err != nil {
		t.Errorf("expected no error, got %v", err)
	}
	if log == nil {
		t.Error("expected log, got nil")
	}
}

func TestPostgresHOSLogRepository_GetCurrentStatus(t *testing.T) {
	db, mock := newMockDB(t)
	defer db.Close()

	repo := NewPostgresHOSLogRepository(db)
	driverID := uuid.New()

	rows := sqlmock.NewRows([]string{
		"id", "driver_id", "status", "start_time",
	}).AddRow(uuid.New(), driverID, "DRIVING", time.Now())

	mock.ExpectQuery("SELECT \\* FROM hos_logs").
		WithArgs(driverID).
		WillReturnRows(rows)

	log, err := repo.GetCurrentStatus(context.Background(), driverID)

	if err != nil {
		t.Errorf("expected no error, got %v", err)
	}
	if log == nil {
		t.Error("expected current log, got nil")
	}
}

func TestPostgresHOSLogRepository_GetByDriverID(t *testing.T) {
	db, mock := newMockDB(t)
	defer db.Close()

	repo := NewPostgresHOSLogRepository(db)
	driverID := uuid.New()
	startTime := time.Now().Add(-24 * time.Hour)
	endTime := time.Now()

	rows := sqlmock.NewRows([]string{
		"id", "driver_id", "status", "start_time",
	}).
		AddRow(uuid.New(), driverID, "DRIVING", time.Now().Add(-6*time.Hour)).
		AddRow(uuid.New(), driverID, "ON_DUTY", time.Now().Add(-4*time.Hour))

	mock.ExpectQuery("SELECT \\* FROM hos_logs").
		WithArgs(driverID, startTime, endTime).
		WillReturnRows(rows)

	logs, err := repo.GetByDriverID(context.Background(), driverID, startTime, endTime)

	if err != nil {
		t.Errorf("expected no error, got %v", err)
	}
	if len(logs) != 2 {
		t.Errorf("expected 2 logs, got %d", len(logs))
	}
}

func TestPostgresHOSLogRepository_CloseCurrentLog(t *testing.T) {
	db, mock := newMockDB(t)
	defer db.Close()

	repo := NewPostgresHOSLogRepository(db)
	driverID := uuid.New()
	endTime := time.Now()

	mock.ExpectExec("UPDATE hos_logs SET").
		WithArgs(driverID, endTime).
		WillReturnResult(sqlmock.NewResult(0, 1))

	err := repo.CloseCurrentLog(context.Background(), driverID, endTime)

	if err != nil {
		t.Errorf("expected no error, got %v", err)
	}
}

// ============================================================================
// PostgresViolationRepository Tests
// ============================================================================

func TestPostgresViolationRepository_Create(t *testing.T) {
	db, mock := newMockDB(t)
	defer db.Close()

	repo := NewPostgresViolationRepository(db)

	violation := &domain.HOSViolation{
		ID:           uuid.New(),
		DriverID:     uuid.New(),
		Type:         "DRIVING_LIMIT",
		OccurredAt:   time.Now(),
		DurationMins: 15,
		Description:  "Exceeded 11-hour driving limit",
		Acknowledged: false,
		CreatedAt:    time.Now(),
	}

	mock.ExpectExec("INSERT INTO hos_violations").
		WithArgs(
			violation.ID, violation.DriverID, violation.Type, violation.OccurredAt,
			violation.DurationMins, violation.Description, violation.Acknowledged, violation.CreatedAt,
		).
		WillReturnResult(sqlmock.NewResult(1, 1))

	err := repo.Create(context.Background(), violation)

	if err != nil {
		t.Errorf("expected no error, got %v", err)
	}
}

func TestPostgresViolationRepository_GetUnacknowledged(t *testing.T) {
	db, mock := newMockDB(t)
	defer db.Close()

	repo := NewPostgresViolationRepository(db)
	driverID := uuid.New()

	rows := sqlmock.NewRows([]string{
		"id", "driver_id", "type", "occurred_at", "acknowledged",
	}).
		AddRow(uuid.New(), driverID, "DRIVING_LIMIT", time.Now(), false).
		AddRow(uuid.New(), driverID, "BREAK_VIOLATION", time.Now().Add(-1*time.Hour), false)

	mock.ExpectQuery("SELECT \\* FROM hos_violations").
		WithArgs(driverID).
		WillReturnRows(rows)

	violations, err := repo.GetUnacknowledged(context.Background(), driverID)

	if err != nil {
		t.Errorf("expected no error, got %v", err)
	}
	if len(violations) != 2 {
		t.Errorf("expected 2 violations, got %d", len(violations))
	}
}

func TestPostgresViolationRepository_Acknowledge(t *testing.T) {
	db, mock := newMockDB(t)
	defer db.Close()

	repo := NewPostgresViolationRepository(db)
	violationID := uuid.New()

	mock.ExpectExec("UPDATE hos_violations SET acknowledged = true").
		WithArgs(violationID).
		WillReturnResult(sqlmock.NewResult(0, 1))

	err := repo.Acknowledge(context.Background(), violationID)

	if err != nil {
		t.Errorf("expected no error, got %v", err)
	}
}

// ============================================================================
// PostgresAlertRepository Tests
// ============================================================================

func TestPostgresAlertRepository_Create(t *testing.T) {
	db, mock := newMockDB(t)
	defer db.Close()

	repo := NewPostgresAlertRepository(db)

	alert := &domain.ComplianceAlert{
		ID:           uuid.New(),
		DriverID:     uuid.New(),
		Type:         "LICENSE_EXPIRING",
		Severity:     "WARNING",
		Message:      "License expires in 15 days",
		ExpiresAt:    time.Now().Add(15 * 24 * time.Hour),
		DaysUntil:    15,
		Acknowledged: false,
		CreatedAt:    time.Now(),
	}

	mock.ExpectExec("INSERT INTO compliance_alerts").
		WithArgs(
			alert.ID, alert.DriverID, alert.Type, alert.Severity, alert.Message,
			alert.ExpiresAt, alert.DaysUntil, alert.Acknowledged, alert.CreatedAt,
		).
		WillReturnResult(sqlmock.NewResult(1, 1))

	err := repo.Create(context.Background(), alert)

	if err != nil {
		t.Errorf("expected no error, got %v", err)
	}
}

func TestPostgresAlertRepository_GetActive(t *testing.T) {
	db, mock := newMockDB(t)
	defer db.Close()

	repo := NewPostgresAlertRepository(db)

	rows := sqlmock.NewRows([]string{
		"id", "driver_id", "type", "severity", "message", "acknowledged",
	}).
		AddRow(uuid.New(), uuid.New(), "LICENSE_EXPIRING", "CRITICAL", "License expired", false).
		AddRow(uuid.New(), uuid.New(), "MEDICAL_EXPIRING", "WARNING", "Medical card expires soon", false)

	mock.ExpectQuery("SELECT \\* FROM compliance_alerts WHERE acknowledged = false").
		WillReturnRows(rows)

	alerts, err := repo.GetActive(context.Background())

	if err != nil {
		t.Errorf("expected no error, got %v", err)
	}
	if len(alerts) != 2 {
		t.Errorf("expected 2 active alerts, got %d", len(alerts))
	}
}

func TestPostgresAlertRepository_Acknowledge(t *testing.T) {
	db, mock := newMockDB(t)
	defer db.Close()

	repo := NewPostgresAlertRepository(db)
	alertID := uuid.New()

	mock.ExpectExec("UPDATE compliance_alerts SET acknowledged = true").
		WithArgs(alertID).
		WillReturnResult(sqlmock.NewResult(0, 1))

	err := repo.Acknowledge(context.Background(), alertID)

	if err != nil {
		t.Errorf("expected no error, got %v", err)
	}
}

func TestPostgresAlertRepository_DeleteExpired(t *testing.T) {
	db, mock := newMockDB(t)
	defer db.Close()

	repo := NewPostgresAlertRepository(db)

	mock.ExpectExec("DELETE FROM compliance_alerts WHERE expires_at").
		WillReturnResult(sqlmock.NewResult(0, 5))

	err := repo.DeleteExpired(context.Background())

	if err != nil {
		t.Errorf("expected no error, got %v", err)
	}
}

// ============================================================================
// PostgresDocumentRepository Tests
// ============================================================================

func TestPostgresDocumentRepository_Create(t *testing.T) {
	db, mock := newMockDB(t)
	defer db.Close()

	repo := NewPostgresDocumentRepository(db)

	doc := &domain.DriverDocument{
		ID:         uuid.New(),
		DriverID:   uuid.New(),
		Type:       "LICENSE",
		FileName:   "license.pdf",
		FilePath:   "/uploads/license.pdf",
		FileSize:   102400,
		MimeType:   "application/pdf",
		ExpiresAt:  timePtr(time.Now().Add(365 * 24 * time.Hour)),
		UploadedAt: time.Now(),
		UploadedBy: uuid.New(),
	}

	mock.ExpectExec("INSERT INTO driver_documents").
		WithArgs(
			doc.ID, doc.DriverID, doc.Type, doc.FileName, doc.FilePath,
			doc.FileSize, doc.MimeType, doc.ExpiresAt, doc.UploadedAt, doc.UploadedBy,
		).
		WillReturnResult(sqlmock.NewResult(1, 1))

	err := repo.Create(context.Background(), doc)

	if err != nil {
		t.Errorf("expected no error, got %v", err)
	}
}

func TestPostgresDocumentRepository_GetByDriverID(t *testing.T) {
	db, mock := newMockDB(t)
	defer db.Close()

	repo := NewPostgresDocumentRepository(db)
	driverID := uuid.New()

	rows := sqlmock.NewRows([]string{
		"id", "driver_id", "type", "file_name",
	}).
		AddRow(uuid.New(), driverID, "LICENSE", "license.pdf").
		AddRow(uuid.New(), driverID, "MEDICAL_CARD", "medical.pdf")

	mock.ExpectQuery("SELECT \\* FROM driver_documents WHERE driver_id = \\$1").
		WithArgs(driverID).
		WillReturnRows(rows)

	docs, err := repo.GetByDriverID(context.Background(), driverID)

	if err != nil {
		t.Errorf("expected no error, got %v", err)
	}
	if len(docs) != 2 {
		t.Errorf("expected 2 documents, got %d", len(docs))
	}
}

func TestPostgresDocumentRepository_GetByType(t *testing.T) {
	db, mock := newMockDB(t)
	defer db.Close()

	repo := NewPostgresDocumentRepository(db)
	driverID := uuid.New()

	rows := sqlmock.NewRows([]string{
		"id", "driver_id", "type", "file_name",
	}).AddRow(uuid.New(), driverID, "LICENSE", "license.pdf")

	mock.ExpectQuery("SELECT \\* FROM driver_documents WHERE driver_id = \\$1 AND type = \\$2").
		WithArgs(driverID, "LICENSE").
		WillReturnRows(rows)

	doc, err := repo.GetByType(context.Background(), driverID, "LICENSE")

	if err != nil {
		t.Errorf("expected no error, got %v", err)
	}
	if doc == nil {
		t.Error("expected document, got nil")
	}
}

func TestPostgresDocumentRepository_Delete(t *testing.T) {
	db, mock := newMockDB(t)
	defer db.Close()

	repo := NewPostgresDocumentRepository(db)
	docID := uuid.New()

	mock.ExpectExec("DELETE FROM driver_documents WHERE id = \\$1").
		WithArgs(docID).
		WillReturnResult(sqlmock.NewResult(0, 1))

	err := repo.Delete(context.Background(), docID)

	if err != nil {
		t.Errorf("expected no error, got %v", err)
	}
}

// ============================================================================
// Repository Constructor Tests
// ============================================================================

func TestNewPostgresDriverRepository(t *testing.T) {
	db, _ := newMockDB(t)
	defer db.Close()

	repo := NewPostgresDriverRepository(db)

	if repo == nil {
		t.Error("expected non-nil repository")
	}
	if repo.db != db {
		t.Error("expected db to be set")
	}
}

func TestNewPostgresHOSLogRepository(t *testing.T) {
	db, _ := newMockDB(t)
	defer db.Close()

	repo := NewPostgresHOSLogRepository(db)

	if repo == nil {
		t.Error("expected non-nil repository")
	}
}

func TestNewPostgresViolationRepository(t *testing.T) {
	db, _ := newMockDB(t)
	defer db.Close()

	repo := NewPostgresViolationRepository(db)

	if repo == nil {
		t.Error("expected non-nil repository")
	}
}

func TestNewPostgresAlertRepository(t *testing.T) {
	db, _ := newMockDB(t)
	defer db.Close()

	repo := NewPostgresAlertRepository(db)

	if repo == nil {
		t.Error("expected non-nil repository")
	}
}

func TestNewPostgresDocumentRepository(t *testing.T) {
	db, _ := newMockDB(t)
	defer db.Close()

	repo := NewPostgresDocumentRepository(db)

	if repo == nil {
		t.Error("expected non-nil repository")
	}
}

// Helper function
func timePtr(t time.Time) *time.Time {
	return &t
}
