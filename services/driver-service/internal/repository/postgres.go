package repository

import (
	"context"
	"database/sql"
	"time"

	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"

	"github.com/draymaster/services/driver-service/internal/domain"
)

// PostgresDriverRepository implements DriverRepository
type PostgresDriverRepository struct {
	db *sqlx.DB
}

// NewPostgresDriverRepository creates a new PostgreSQL driver repository
func NewPostgresDriverRepository(db *sqlx.DB) *PostgresDriverRepository {
	return &PostgresDriverRepository{db: db}
}

func (r *PostgresDriverRepository) Create(ctx context.Context, driver *domain.Driver) error {
	query := `
		INSERT INTO drivers (
			id, employee_number, first_name, last_name, email, phone, status,
			license_number, license_state, license_class, license_expiration,
			has_twic, twic_expiration, has_hazmat_endorsement, hazmat_expiration,
			has_tanker_endorsement, has_doubles_endorsement, medical_card_expiration,
			current_latitude, current_longitude, current_tractor_id, current_trip_id,
			available_drive_mins, available_duty_mins, available_cycle_mins, last_hos_update,
			home_terminal_id, hire_date, app_user_id, device_token, created_at, updated_at
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
			$16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32
		)`

	_, err := r.db.ExecContext(ctx, query,
		driver.ID, driver.EmployeeNumber, driver.FirstName, driver.LastName,
		driver.Email, driver.Phone, driver.Status,
		driver.LicenseNumber, driver.LicenseState, driver.LicenseClass, driver.LicenseExpiration,
		driver.HasTWIC, driver.TWICExpiration, driver.HasHazmatEndorsement, driver.HazmatExpiration,
		driver.HasTankerEndorsement, driver.HasDoublesEndorsement, driver.MedicalCardExpiration,
		driver.CurrentLatitude, driver.CurrentLongitude, driver.CurrentTractorID, driver.CurrentTripID,
		driver.AvailableDriveMins, driver.AvailableDutyMins, driver.AvailableCycleMins, driver.LastHOSUpdate,
		driver.HomeTerminalID, driver.HireDate, driver.AppUserID, driver.DeviceToken,
		driver.CreatedAt, driver.UpdatedAt,
	)
	return err
}

func (r *PostgresDriverRepository) GetByID(ctx context.Context, id uuid.UUID) (*domain.Driver, error) {
	var driver domain.Driver
	query := `SELECT * FROM drivers WHERE id = $1`
	err := r.db.GetContext(ctx, &driver, query, id)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &driver, err
}

func (r *PostgresDriverRepository) GetByEmployeeNumber(ctx context.Context, employeeNumber string) (*domain.Driver, error) {
	var driver domain.Driver
	query := `SELECT * FROM drivers WHERE employee_number = $1`
	err := r.db.GetContext(ctx, &driver, query, employeeNumber)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &driver, err
}

func (r *PostgresDriverRepository) GetAll(ctx context.Context) ([]domain.Driver, error) {
	var drivers []domain.Driver
	query := `SELECT * FROM drivers WHERE termination_date IS NULL ORDER BY last_name, first_name`
	err := r.db.SelectContext(ctx, &drivers, query)
	return drivers, err
}

func (r *PostgresDriverRepository) GetByStatus(ctx context.Context, status domain.DriverStatus) ([]domain.Driver, error) {
	var drivers []domain.Driver
	query := `SELECT * FROM drivers WHERE status = $1 AND termination_date IS NULL ORDER BY last_name, first_name`
	err := r.db.SelectContext(ctx, &drivers, query, status)
	return drivers, err
}

func (r *PostgresDriverRepository) GetAvailable(ctx context.Context) ([]domain.Driver, error) {
	var drivers []domain.Driver
	query := `
		SELECT * FROM drivers
		WHERE status = 'AVAILABLE'
		  AND termination_date IS NULL
		  AND available_drive_mins > 0
		  AND available_duty_mins > 0
		  AND available_cycle_mins > 0
		ORDER BY last_name, first_name`
	err := r.db.SelectContext(ctx, &drivers, query)
	return drivers, err
}

func (r *PostgresDriverRepository) GetByTerminalID(ctx context.Context, terminalID uuid.UUID) ([]domain.Driver, error) {
	var drivers []domain.Driver
	query := `SELECT * FROM drivers WHERE home_terminal_id = $1 AND termination_date IS NULL ORDER BY last_name, first_name`
	err := r.db.SelectContext(ctx, &drivers, query, terminalID)
	return drivers, err
}

func (r *PostgresDriverRepository) Update(ctx context.Context, driver *domain.Driver) error {
	query := `
		UPDATE drivers SET
			employee_number = $2, first_name = $3, last_name = $4, email = $5, phone = $6, status = $7,
			license_number = $8, license_state = $9, license_class = $10, license_expiration = $11,
			has_twic = $12, twic_expiration = $13, has_hazmat_endorsement = $14, hazmat_expiration = $15,
			has_tanker_endorsement = $16, has_doubles_endorsement = $17, medical_card_expiration = $18,
			home_terminal_id = $19, device_token = $20, updated_at = $21
		WHERE id = $1`

	_, err := r.db.ExecContext(ctx, query,
		driver.ID, driver.EmployeeNumber, driver.FirstName, driver.LastName,
		driver.Email, driver.Phone, driver.Status,
		driver.LicenseNumber, driver.LicenseState, driver.LicenseClass, driver.LicenseExpiration,
		driver.HasTWIC, driver.TWICExpiration, driver.HasHazmatEndorsement, driver.HazmatExpiration,
		driver.HasTankerEndorsement, driver.HasDoublesEndorsement, driver.MedicalCardExpiration,
		driver.HomeTerminalID, driver.DeviceToken, time.Now(),
	)
	return err
}

func (r *PostgresDriverRepository) UpdateStatus(ctx context.Context, id uuid.UUID, status domain.DriverStatus) error {
	query := `UPDATE drivers SET status = $2, updated_at = $3 WHERE id = $1`
	_, err := r.db.ExecContext(ctx, query, id, status, time.Now())
	return err
}

func (r *PostgresDriverRepository) UpdateLocation(ctx context.Context, id uuid.UUID, lat, lon float64) error {
	query := `UPDATE drivers SET current_latitude = $2, current_longitude = $3, updated_at = $4 WHERE id = $1`
	_, err := r.db.ExecContext(ctx, query, id, lat, lon, time.Now())
	return err
}

func (r *PostgresDriverRepository) UpdateHOS(ctx context.Context, id uuid.UUID, driveMins, dutyMins, cycleMins int) error {
	query := `
		UPDATE drivers SET
			available_drive_mins = $2,
			available_duty_mins = $3,
			available_cycle_mins = $4,
			last_hos_update = $5,
			updated_at = $5
		WHERE id = $1`
	_, err := r.db.ExecContext(ctx, query, id, driveMins, dutyMins, cycleMins, time.Now())
	return err
}

func (r *PostgresDriverRepository) Delete(ctx context.Context, id uuid.UUID) error {
	// Soft delete by setting termination date
	query := `UPDATE drivers SET termination_date = $2, status = 'INACTIVE', updated_at = $2 WHERE id = $1`
	_, err := r.db.ExecContext(ctx, query, id, time.Now())
	return err
}

func (r *PostgresDriverRepository) GetExpiringDocuments(ctx context.Context, daysUntilExpiry int) ([]domain.Driver, error) {
	var drivers []domain.Driver
	threshold := time.Now().AddDate(0, 0, daysUntilExpiry)

	query := `
		SELECT * FROM drivers
		WHERE termination_date IS NULL
		  AND (
			license_expiration <= $1
			OR medical_card_expiration <= $1
			OR (has_twic = true AND twic_expiration <= $1)
			OR (has_hazmat_endorsement = true AND hazmat_expiration <= $1)
		  )
		ORDER BY
			LEAST(
				COALESCE(license_expiration, '9999-12-31'),
				COALESCE(medical_card_expiration, '9999-12-31'),
				COALESCE(twic_expiration, '9999-12-31'),
				COALESCE(hazmat_expiration, '9999-12-31')
			)`

	err := r.db.SelectContext(ctx, &drivers, query, threshold)
	return drivers, err
}

// PostgresHOSLogRepository implements HOSLogRepository
type PostgresHOSLogRepository struct {
	db *sqlx.DB
}

// NewPostgresHOSLogRepository creates a new PostgreSQL HOS log repository
func NewPostgresHOSLogRepository(db *sqlx.DB) *PostgresHOSLogRepository {
	return &PostgresHOSLogRepository{db: db}
}

func (r *PostgresHOSLogRepository) Create(ctx context.Context, log *domain.HOSLog) error {
	query := `
		INSERT INTO hos_logs (
			id, driver_id, status, start_time, end_time, duration_mins,
			location, latitude, longitude, odometer, engine_hours,
			trip_id, tractor_id, notes, source, edit_reason, original_log_id, created_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`

	_, err := r.db.ExecContext(ctx, query,
		log.ID, log.DriverID, log.Status, log.StartTime, log.EndTime, log.DurationMins,
		log.Location, log.Latitude, log.Longitude, log.Odometer, log.EngineHours,
		log.TripID, log.TractorID, log.Notes, log.Source, log.EditReason, log.OriginalLogID, log.CreatedAt,
	)
	return err
}

func (r *PostgresHOSLogRepository) GetByID(ctx context.Context, id uuid.UUID) (*domain.HOSLog, error) {
	var log domain.HOSLog
	query := `SELECT * FROM hos_logs WHERE id = $1`
	err := r.db.GetContext(ctx, &log, query, id)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &log, err
}

func (r *PostgresHOSLogRepository) GetByDriverID(ctx context.Context, driverID uuid.UUID, startTime, endTime time.Time) ([]domain.HOSLog, error) {
	var logs []domain.HOSLog
	query := `
		SELECT * FROM hos_logs
		WHERE driver_id = $1
		  AND start_time >= $2
		  AND start_time < $3
		ORDER BY start_time`
	err := r.db.SelectContext(ctx, &logs, query, driverID, startTime, endTime)
	return logs, err
}

func (r *PostgresHOSLogRepository) GetCurrentStatus(ctx context.Context, driverID uuid.UUID) (*domain.HOSLog, error) {
	var log domain.HOSLog
	query := `
		SELECT * FROM hos_logs
		WHERE driver_id = $1 AND end_time IS NULL
		ORDER BY start_time DESC
		LIMIT 1`
	err := r.db.GetContext(ctx, &log, query, driverID)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &log, err
}

func (r *PostgresHOSLogRepository) GetByDateRange(ctx context.Context, driverID uuid.UUID, date time.Time) ([]domain.HOSLog, error) {
	startOfDay := time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, date.Location())
	endOfDay := startOfDay.Add(24 * time.Hour)
	return r.GetByDriverID(ctx, driverID, startOfDay, endOfDay)
}

func (r *PostgresHOSLogRepository) GetLast8Days(ctx context.Context, driverID uuid.UUID) ([]domain.HOSLog, error) {
	endTime := time.Now()
	startTime := endTime.AddDate(0, 0, -8)
	return r.GetByDriverID(ctx, driverID, startTime, endTime)
}

func (r *PostgresHOSLogRepository) Update(ctx context.Context, log *domain.HOSLog) error {
	query := `
		UPDATE hos_logs SET
			status = $2, start_time = $3, end_time = $4, duration_mins = $5,
			location = $6, latitude = $7, longitude = $8, odometer = $9, engine_hours = $10,
			notes = $11, edit_reason = $12
		WHERE id = $1`

	_, err := r.db.ExecContext(ctx, query,
		log.ID, log.Status, log.StartTime, log.EndTime, log.DurationMins,
		log.Location, log.Latitude, log.Longitude, log.Odometer, log.EngineHours,
		log.Notes, log.EditReason,
	)
	return err
}

func (r *PostgresHOSLogRepository) CloseCurrentLog(ctx context.Context, driverID uuid.UUID, endTime time.Time) error {
	query := `
		UPDATE hos_logs SET
			end_time = $2,
			duration_mins = EXTRACT(EPOCH FROM ($2 - start_time)) / 60
		WHERE driver_id = $1 AND end_time IS NULL`
	_, err := r.db.ExecContext(ctx, query, driverID, endTime)
	return err
}

// PostgresViolationRepository implements ViolationRepository
type PostgresViolationRepository struct {
	db *sqlx.DB
}

// NewPostgresViolationRepository creates a new PostgreSQL violation repository
func NewPostgresViolationRepository(db *sqlx.DB) *PostgresViolationRepository {
	return &PostgresViolationRepository{db: db}
}

func (r *PostgresViolationRepository) Create(ctx context.Context, violation *domain.HOSViolation) error {
	query := `
		INSERT INTO hos_violations (id, driver_id, type, occurred_at, duration_mins, description, acknowledged, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`
	_, err := r.db.ExecContext(ctx, query,
		violation.ID, violation.DriverID, violation.Type, violation.OccurredAt,
		violation.DurationMins, violation.Description, violation.Acknowledged, violation.CreatedAt,
	)
	return err
}

func (r *PostgresViolationRepository) GetByID(ctx context.Context, id uuid.UUID) (*domain.HOSViolation, error) {
	var violation domain.HOSViolation
	query := `SELECT * FROM hos_violations WHERE id = $1`
	err := r.db.GetContext(ctx, &violation, query, id)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &violation, err
}

func (r *PostgresViolationRepository) GetByDriverID(ctx context.Context, driverID uuid.UUID, startTime, endTime time.Time) ([]domain.HOSViolation, error) {
	var violations []domain.HOSViolation
	query := `
		SELECT * FROM hos_violations
		WHERE driver_id = $1 AND occurred_at >= $2 AND occurred_at < $3
		ORDER BY occurred_at DESC`
	err := r.db.SelectContext(ctx, &violations, query, driverID, startTime, endTime)
	return violations, err
}

func (r *PostgresViolationRepository) GetUnacknowledged(ctx context.Context, driverID uuid.UUID) ([]domain.HOSViolation, error) {
	var violations []domain.HOSViolation
	query := `SELECT * FROM hos_violations WHERE driver_id = $1 AND acknowledged = false ORDER BY occurred_at DESC`
	err := r.db.SelectContext(ctx, &violations, query, driverID)
	return violations, err
}

func (r *PostgresViolationRepository) Acknowledge(ctx context.Context, id uuid.UUID) error {
	query := `UPDATE hos_violations SET acknowledged = true WHERE id = $1`
	_, err := r.db.ExecContext(ctx, query, id)
	return err
}

// PostgresAlertRepository implements ComplianceAlertRepository
type PostgresAlertRepository struct {
	db *sqlx.DB
}

// NewPostgresAlertRepository creates a new PostgreSQL alert repository
func NewPostgresAlertRepository(db *sqlx.DB) *PostgresAlertRepository {
	return &PostgresAlertRepository{db: db}
}

func (r *PostgresAlertRepository) Create(ctx context.Context, alert *domain.ComplianceAlert) error {
	query := `
		INSERT INTO compliance_alerts (id, driver_id, type, severity, message, expires_at, days_until, acknowledged, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`
	_, err := r.db.ExecContext(ctx, query,
		alert.ID, alert.DriverID, alert.Type, alert.Severity, alert.Message,
		alert.ExpiresAt, alert.DaysUntil, alert.Acknowledged, alert.CreatedAt,
	)
	return err
}

func (r *PostgresAlertRepository) GetByID(ctx context.Context, id uuid.UUID) (*domain.ComplianceAlert, error) {
	var alert domain.ComplianceAlert
	query := `SELECT * FROM compliance_alerts WHERE id = $1`
	err := r.db.GetContext(ctx, &alert, query, id)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &alert, err
}

func (r *PostgresAlertRepository) GetByDriverID(ctx context.Context, driverID uuid.UUID) ([]domain.ComplianceAlert, error) {
	var alerts []domain.ComplianceAlert
	query := `SELECT * FROM compliance_alerts WHERE driver_id = $1 AND acknowledged = false ORDER BY severity DESC, expires_at`
	err := r.db.SelectContext(ctx, &alerts, query, driverID)
	return alerts, err
}

func (r *PostgresAlertRepository) GetActive(ctx context.Context) ([]domain.ComplianceAlert, error) {
	var alerts []domain.ComplianceAlert
	query := `SELECT * FROM compliance_alerts WHERE acknowledged = false AND expires_at > NOW() ORDER BY severity DESC, expires_at`
	err := r.db.SelectContext(ctx, &alerts, query)
	return alerts, err
}

func (r *PostgresAlertRepository) Acknowledge(ctx context.Context, id uuid.UUID) error {
	query := `UPDATE compliance_alerts SET acknowledged = true WHERE id = $1`
	_, err := r.db.ExecContext(ctx, query, id)
	return err
}

func (r *PostgresAlertRepository) DeleteExpired(ctx context.Context) error {
	query := `DELETE FROM compliance_alerts WHERE expires_at < NOW() - INTERVAL '30 days'`
	_, err := r.db.ExecContext(ctx, query)
	return err
}

// PostgresDocumentRepository implements DocumentRepository
type PostgresDocumentRepository struct {
	db *sqlx.DB
}

// NewPostgresDocumentRepository creates a new PostgreSQL document repository
func NewPostgresDocumentRepository(db *sqlx.DB) *PostgresDocumentRepository {
	return &PostgresDocumentRepository{db: db}
}

func (r *PostgresDocumentRepository) Create(ctx context.Context, doc *domain.DriverDocument) error {
	query := `
		INSERT INTO driver_documents (id, driver_id, type, file_name, file_path, file_size, mime_type, expires_at, uploaded_at, uploaded_by)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`
	_, err := r.db.ExecContext(ctx, query,
		doc.ID, doc.DriverID, doc.Type, doc.FileName, doc.FilePath,
		doc.FileSize, doc.MimeType, doc.ExpiresAt, doc.UploadedAt, doc.UploadedBy,
	)
	return err
}

func (r *PostgresDocumentRepository) GetByID(ctx context.Context, id uuid.UUID) (*domain.DriverDocument, error) {
	var doc domain.DriverDocument
	query := `SELECT * FROM driver_documents WHERE id = $1`
	err := r.db.GetContext(ctx, &doc, query, id)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &doc, err
}

func (r *PostgresDocumentRepository) GetByDriverID(ctx context.Context, driverID uuid.UUID) ([]domain.DriverDocument, error) {
	var docs []domain.DriverDocument
	query := `SELECT * FROM driver_documents WHERE driver_id = $1 ORDER BY type, uploaded_at DESC`
	err := r.db.SelectContext(ctx, &docs, query, driverID)
	return docs, err
}

func (r *PostgresDocumentRepository) GetByType(ctx context.Context, driverID uuid.UUID, docType string) (*domain.DriverDocument, error) {
	var doc domain.DriverDocument
	query := `SELECT * FROM driver_documents WHERE driver_id = $1 AND type = $2 ORDER BY uploaded_at DESC LIMIT 1`
	err := r.db.GetContext(ctx, &doc, query, driverID, docType)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &doc, err
}

func (r *PostgresDocumentRepository) Update(ctx context.Context, doc *domain.DriverDocument) error {
	query := `
		UPDATE driver_documents SET
			file_name = $2, file_path = $3, file_size = $4, mime_type = $5, expires_at = $6
		WHERE id = $1`
	_, err := r.db.ExecContext(ctx, query,
		doc.ID, doc.FileName, doc.FilePath, doc.FileSize, doc.MimeType, doc.ExpiresAt,
	)
	return err
}

func (r *PostgresDocumentRepository) Delete(ctx context.Context, id uuid.UUID) error {
	query := `DELETE FROM driver_documents WHERE id = $1`
	_, err := r.db.ExecContext(ctx, query, id)
	return err
}
