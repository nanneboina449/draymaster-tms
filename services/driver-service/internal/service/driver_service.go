package service

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/draymaster/services/driver-service/internal/domain"
	"github.com/draymaster/services/driver-service/internal/repository"
	"github.com/draymaster/shared/pkg/kafka"
	"github.com/draymaster/shared/pkg/logger"
)

// DriverService handles driver management and HOS compliance
type DriverService struct {
	driverRepo     repository.DriverRepository
	hosLogRepo     repository.HOSLogRepository
	violationRepo  repository.ViolationRepository
	alertRepo      repository.ComplianceAlertRepository
	documentRepo   repository.DocumentRepository
	eventProducer  *kafka.Producer
	logger         *logger.Logger
}

// NewDriverService creates a new driver service
func NewDriverService(
	driverRepo repository.DriverRepository,
	hosLogRepo repository.HOSLogRepository,
	violationRepo repository.ViolationRepository,
	alertRepo repository.ComplianceAlertRepository,
	documentRepo repository.DocumentRepository,
	eventProducer *kafka.Producer,
	log *logger.Logger,
) *DriverService {
	return &DriverService{
		driverRepo:    driverRepo,
		hosLogRepo:    hosLogRepo,
		violationRepo: violationRepo,
		alertRepo:     alertRepo,
		documentRepo:  documentRepo,
		eventProducer: eventProducer,
		logger:        log,
	}
}

// =============================================================================
// DRIVER CRUD
// =============================================================================

// CreateDriver creates a new driver
func (s *DriverService) CreateDriver(ctx context.Context, input CreateDriverInput) (*domain.Driver, error) {
	driver := &domain.Driver{
		ID:                   uuid.New(),
		EmployeeNumber:       input.EmployeeNumber,
		FirstName:            input.FirstName,
		LastName:             input.LastName,
		Email:                input.Email,
		Phone:                input.Phone,
		Status:               domain.DriverStatusAvailable,
		LicenseNumber:        input.LicenseNumber,
		LicenseState:         input.LicenseState,
		LicenseClass:         input.LicenseClass,
		LicenseExpiration:    input.LicenseExpiration,
		HasTWIC:              input.HasTWIC,
		TWICExpiration:       input.TWICExpiration,
		HasHazmatEndorsement: input.HasHazmatEndorsement,
		HazmatExpiration:     input.HazmatExpiration,
		MedicalCardExpiration: input.MedicalCardExpiration,
		HomeTerminalID:       input.HomeTerminalID,
		HireDate:             input.HireDate,
		// Initialize HOS with max available time
		AvailableDriveMins:   660, // 11 hours
		AvailableDutyMins:    840, // 14 hours
		AvailableCycleMins:   4200, // 70 hours (8-day cycle)
		LastHOSUpdate:        timePtr(time.Now()),
		CreatedAt:            time.Now(),
		UpdatedAt:            time.Now(),
	}

	if err := s.driverRepo.Create(ctx, driver); err != nil {
		return nil, fmt.Errorf("failed to create driver: %w", err)
	}

	// Create initial OFF_DUTY log entry
	initialLog := &domain.HOSLog{
		ID:        uuid.New(),
		DriverID:  driver.ID,
		Status:    domain.HOSStatusOffDuty,
		StartTime: time.Now(),
		Source:    "system",
		CreatedAt: time.Now(),
	}
	_ = s.hosLogRepo.Create(ctx, initialLog)

	// Generate compliance alerts for expiring documents
	go s.checkDriverCompliance(context.Background(), driver)

	s.logger.Infow("Driver created", "driver_id", driver.ID, "name", driver.FullName())

	return driver, nil
}

// CreateDriverInput contains input for creating a driver
type CreateDriverInput struct {
	EmployeeNumber        string
	FirstName             string
	LastName              string
	Email                 string
	Phone                 string
	LicenseNumber         string
	LicenseState          string
	LicenseClass          string
	LicenseExpiration     *time.Time
	HasTWIC               bool
	TWICExpiration        *time.Time
	HasHazmatEndorsement  bool
	HazmatExpiration      *time.Time
	MedicalCardExpiration *time.Time
	HomeTerminalID        *uuid.UUID
	HireDate              *time.Time
}

// GetDriver retrieves a driver by ID
func (s *DriverService) GetDriver(ctx context.Context, id uuid.UUID) (*domain.Driver, error) {
	return s.driverRepo.GetByID(ctx, id)
}

// GetAvailableDrivers retrieves drivers who are available for dispatch
func (s *DriverService) GetAvailableDrivers(ctx context.Context, requiredMins int, needsHazmat, needsTWIC bool) ([]domain.Driver, error) {
	drivers, err := s.driverRepo.GetAvailable(ctx)
	if err != nil {
		return nil, err
	}

	var available []domain.Driver
	for _, driver := range drivers {
		// Check HOS availability
		if !driver.CanDrive(requiredMins) {
			continue
		}

		// Check compliance
		if !driver.IsCompliant() {
			continue
		}

		// Check endorsements
		if needsHazmat && !driver.HasHazmatEndorsement {
			continue
		}
		if needsTWIC && !driver.HasTWIC {
			continue
		}

		available = append(available, driver)
	}

	return available, nil
}

// UpdateDriverStatus updates driver status
func (s *DriverService) UpdateDriverStatus(ctx context.Context, driverID uuid.UUID, status domain.DriverStatus) error {
	return s.driverRepo.UpdateStatus(ctx, driverID, status)
}

// =============================================================================
// HOS COMPLIANCE
// =============================================================================

// RecordHOSStatus records a new HOS status change
func (s *DriverService) RecordHOSStatus(ctx context.Context, input RecordHOSInput) (*domain.HOSLog, error) {
	// Close the current log entry
	if err := s.hosLogRepo.CloseCurrentLog(ctx, input.DriverID, input.StartTime); err != nil {
		s.logger.Warnw("Failed to close current HOS log", "error", err)
	}

	// Create new log entry
	log := &domain.HOSLog{
		ID:          uuid.New(),
		DriverID:    input.DriverID,
		Status:      input.Status,
		StartTime:   input.StartTime,
		Location:    input.Location,
		Latitude:    input.Latitude,
		Longitude:   input.Longitude,
		Odometer:    input.Odometer,
		EngineHours: input.EngineHours,
		TripID:      input.TripID,
		TractorID:   input.TractorID,
		Notes:       input.Notes,
		Source:      input.Source,
		CreatedAt:   time.Now(),
	}

	if err := s.hosLogRepo.Create(ctx, log); err != nil {
		return nil, fmt.Errorf("failed to record HOS status: %w", err)
	}

	// Recalculate available time
	if err := s.recalculateHOS(ctx, input.DriverID); err != nil {
		s.logger.Warnw("Failed to recalculate HOS", "error", err)
	}

	// Check for violations
	go s.checkHOSViolations(context.Background(), input.DriverID)

	// Publish event
	event := kafka.NewEvent(kafka.Topics.HOSStatusChanged, "driver-service", map[string]interface{}{
		"driver_id": input.DriverID.String(),
		"status":    input.Status,
		"time":      input.StartTime,
	})
	_ = s.eventProducer.Publish(ctx, kafka.Topics.HOSStatusChanged, event)

	return log, nil
}

// RecordHOSInput contains input for recording HOS status
type RecordHOSInput struct {
	DriverID    uuid.UUID
	Status      domain.HOSStatus
	StartTime   time.Time
	Location    string
	Latitude    float64
	Longitude   float64
	Odometer    int
	EngineHours float64
	TripID      *uuid.UUID
	TractorID   *uuid.UUID
	Notes       string
	Source      string // eld, manual, auto
}

// GetHOSSummary retrieves HOS summary for a driver
func (s *DriverService) GetHOSSummary(ctx context.Context, driverID uuid.UUID, date time.Time) (*domain.HOSSummary, error) {
	// Get logs for the specified date
	startOfDay := time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, date.Location())
	endOfDay := startOfDay.Add(24 * time.Hour)

	logs, err := s.hosLogRepo.GetByDriverID(ctx, driverID, startOfDay, endOfDay)
	if err != nil {
		return nil, err
	}

	// Calculate totals
	summary := &domain.HOSSummary{
		DriverID: driverID,
		Date:     date,
	}

	for _, log := range logs {
		duration := log.DurationMins
		if duration == 0 && log.EndTime == nil {
			// Still active, calculate from start to now
			duration = int(time.Since(log.StartTime).Minutes())
		}

		switch log.Status {
		case domain.HOSStatusDriving:
			summary.DrivingMins += duration
		case domain.HOSStatusOnDutyNotDriv:
			summary.OnDutyMins += duration
		case domain.HOSStatusOffDuty:
			summary.OffDutyMins += duration
		case domain.HOSStatusSleeperBerth:
			summary.SleeperMins += duration
		}
	}

	// Calculate available time
	summary.AvailableDrive = max(0, 660-summary.DrivingMins)                        // 11 hours
	summary.AvailableDuty = max(0, 840-(summary.DrivingMins+summary.OnDutyMins))   // 14 hours

	// Get 8-day cycle for 70-hour rule
	cycleMins, _ := s.getCycleDutyMins(ctx, driverID)
	summary.AvailableCycle = max(0, 4200-cycleMins) // 70 hours

	// Get violations
	violations, _ := s.violationRepo.GetByDriverID(ctx, driverID, startOfDay, endOfDay)
	summary.Violations = violations

	return summary, nil
}

// GetDriverLogs retrieves HOS logs for a driver
func (s *DriverService) GetDriverLogs(ctx context.Context, driverID uuid.UUID, startTime, endTime time.Time) ([]domain.HOSLog, error) {
	return s.hosLogRepo.GetByDriverID(ctx, driverID, startTime, endTime)
}

// CalculateAvailableTime calculates remaining available drive/duty time
func (s *DriverService) CalculateAvailableTime(ctx context.Context, driverID uuid.UUID) (*AvailableTime, error) {
	driver, err := s.driverRepo.GetByID(ctx, driverID)
	if err != nil {
		return nil, err
	}

	// Get current day's logs
	now := time.Now()
	startOfDay := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())

	logs, err := s.hosLogRepo.GetByDriverID(ctx, driverID, startOfDay, now)
	if err != nil {
		return nil, err
	}

	// Calculate today's usage
	var drivingMins, onDutyMins int
	for _, log := range logs {
		duration := log.DurationMins
		if duration == 0 && log.EndTime == nil {
			duration = int(time.Since(log.StartTime).Minutes())
		}
		switch log.Status {
		case domain.HOSStatusDriving:
			drivingMins += duration
		case domain.HOSStatusOnDutyNotDriv:
			onDutyMins += duration
		}
	}

	// Calculate 8-day cycle
	cycleMins, _ := s.getCycleDutyMins(ctx, driverID)

	// Check 30-minute break requirement
	needsBreak := s.needsBreak(logs)

	// Calculate time until required break
	var minsUntilBreak int
	if !needsBreak {
		minsUntilBreak = s.getMinsUntilBreak(logs)
	}

	available := &AvailableTime{
		DriverID:             driverID,
		AvailableDriveMins:   max(0, 660-drivingMins),
		AvailableDutyMins:    max(0, 840-(drivingMins+onDutyMins)),
		AvailableCycleMins:   max(0, 4200-cycleMins),
		TodayDrivingMins:     drivingMins,
		TodayOnDutyMins:      onDutyMins,
		CycleDutyMins:        cycleMins,
		NeedsBreak:           needsBreak,
		MinsUntilBreak:       minsUntilBreak,
		LastResetTime:        driver.LastHOSUpdate,
		IsCompliant:          driver.IsCompliant(),
		CalculatedAt:         time.Now(),
	}

	return available, nil
}

// AvailableTime represents calculated available HOS time
type AvailableTime struct {
	DriverID             uuid.UUID  `json:"driver_id"`
	AvailableDriveMins   int        `json:"available_drive_mins"`
	AvailableDutyMins    int        `json:"available_duty_mins"`
	AvailableCycleMins   int        `json:"available_cycle_mins"`
	TodayDrivingMins     int        `json:"today_driving_mins"`
	TodayOnDutyMins      int        `json:"today_on_duty_mins"`
	CycleDutyMins        int        `json:"cycle_duty_mins"`
	NeedsBreak           bool       `json:"needs_break"`
	MinsUntilBreak       int        `json:"mins_until_break"`
	LastResetTime        *time.Time `json:"last_reset_time"`
	IsCompliant          bool       `json:"is_compliant"`
	CalculatedAt         time.Time  `json:"calculated_at"`
}

// =============================================================================
// HOS VIOLATION CHECKING
// =============================================================================

func (s *DriverService) checkHOSViolations(ctx context.Context, driverID uuid.UUID) {
	available, err := s.CalculateAvailableTime(ctx, driverID)
	if err != nil {
		s.logger.Errorw("Failed to calculate available time", "error", err)
		return
	}

	now := time.Now()

	// Check 11-hour driving limit
	if available.TodayDrivingMins > 660 {
		violation := &domain.HOSViolation{
			ID:           uuid.New(),
			DriverID:     driverID,
			Type:         "11_HOUR",
			OccurredAt:   now,
			DurationMins: available.TodayDrivingMins - 660,
			Description:  fmt.Sprintf("Exceeded 11-hour driving limit by %d minutes", available.TodayDrivingMins-660),
			CreatedAt:    now,
		}
		if err := s.violationRepo.Create(ctx, violation); err != nil {
			s.logger.Errorw("Failed to create violation", "error", err)
		}
		s.publishViolationEvent(ctx, violation)
	}

	// Check 14-hour duty limit
	totalDuty := available.TodayDrivingMins + available.TodayOnDutyMins
	if totalDuty > 840 {
		violation := &domain.HOSViolation{
			ID:           uuid.New(),
			DriverID:     driverID,
			Type:         "14_HOUR",
			OccurredAt:   now,
			DurationMins: totalDuty - 840,
			Description:  fmt.Sprintf("Exceeded 14-hour duty limit by %d minutes", totalDuty-840),
			CreatedAt:    now,
		}
		if err := s.violationRepo.Create(ctx, violation); err != nil {
			s.logger.Errorw("Failed to create violation", "error", err)
		}
		s.publishViolationEvent(ctx, violation)
	}

	// Check 70-hour/8-day cycle
	if available.CycleDutyMins > 4200 {
		violation := &domain.HOSViolation{
			ID:           uuid.New(),
			DriverID:     driverID,
			Type:         "70_HOUR",
			OccurredAt:   now,
			DurationMins: available.CycleDutyMins - 4200,
			Description:  fmt.Sprintf("Exceeded 70-hour/8-day cycle limit by %d minutes", available.CycleDutyMins-4200),
			CreatedAt:    now,
		}
		if err := s.violationRepo.Create(ctx, violation); err != nil {
			s.logger.Errorw("Failed to create violation", "error", err)
		}
		s.publishViolationEvent(ctx, violation)
	}

	// Check 30-minute break requirement
	if available.NeedsBreak {
		violation := &domain.HOSViolation{
			ID:           uuid.New(),
			DriverID:     driverID,
			Type:         "30_MIN_BREAK",
			OccurredAt:   now,
			DurationMins: 0,
			Description:  "Required 30-minute break not taken after 8 hours of driving",
			CreatedAt:    now,
		}
		if err := s.violationRepo.Create(ctx, violation); err != nil {
			s.logger.Errorw("Failed to create violation", "error", err)
		}
		s.publishViolationEvent(ctx, violation)
	}
}

func (s *DriverService) publishViolationEvent(ctx context.Context, violation *domain.HOSViolation) {
	event := kafka.NewEvent(kafka.Topics.HOSViolation, "driver-service", map[string]interface{}{
		"driver_id":      violation.DriverID.String(),
		"violation_id":   violation.ID.String(),
		"type":           violation.Type,
		"occurred_at":    violation.OccurredAt,
		"duration_mins":  violation.DurationMins,
		"description":    violation.Description,
	})
	_ = s.eventProducer.Publish(ctx, kafka.Topics.HOSViolation, event)

	s.logger.Warnw("HOS violation detected",
		"driver_id", violation.DriverID,
		"type", violation.Type,
		"description", violation.Description,
	)
}

// =============================================================================
// COMPLIANCE CHECKING
// =============================================================================

func (s *DriverService) checkDriverCompliance(ctx context.Context, driver *domain.Driver) {
	now := time.Now()
	warningDays := 30
	criticalDays := 7

	checks := []struct {
		expiration *time.Time
		alertType  string
		docType    string
	}{
		{driver.LicenseExpiration, "license_expiring", "CDL"},
		{driver.MedicalCardExpiration, "medical_expiring", "Medical Card"},
		{driver.TWICExpiration, "twic_expiring", "TWIC"},
		{driver.HazmatExpiration, "hazmat_expiring", "Hazmat Endorsement"},
	}

	for _, check := range checks {
		if check.expiration == nil {
			continue
		}

		daysUntil := int(check.expiration.Sub(now).Hours() / 24)

		if daysUntil <= criticalDays {
			alert := &domain.ComplianceAlert{
				ID:        uuid.New(),
				DriverID:  driver.ID,
				Type:      check.alertType,
				Severity:  "critical",
				Message:   fmt.Sprintf("%s expires in %d days", check.docType, daysUntil),
				ExpiresAt: *check.expiration,
				DaysUntil: daysUntil,
				CreatedAt: now,
			}
			_ = s.alertRepo.Create(ctx, alert)
		} else if daysUntil <= warningDays {
			alert := &domain.ComplianceAlert{
				ID:        uuid.New(),
				DriverID:  driver.ID,
				Type:      check.alertType,
				Severity:  "warning",
				Message:   fmt.Sprintf("%s expires in %d days", check.docType, daysUntil),
				ExpiresAt: *check.expiration,
				DaysUntil: daysUntil,
				CreatedAt: now,
			}
			_ = s.alertRepo.Create(ctx, alert)
		}
	}
}

// GetComplianceAlerts retrieves active compliance alerts for a driver
func (s *DriverService) GetComplianceAlerts(ctx context.Context, driverID uuid.UUID) ([]domain.ComplianceAlert, error) {
	return s.alertRepo.GetByDriverID(ctx, driverID)
}

// GetViolations retrieves HOS violations for a driver
func (s *DriverService) GetViolations(ctx context.Context, driverID uuid.UUID, startTime, endTime time.Time) ([]domain.HOSViolation, error) {
	return s.violationRepo.GetByDriverID(ctx, driverID, startTime, endTime)
}

// AcknowledgeViolation acknowledges an HOS violation
func (s *DriverService) AcknowledgeViolation(ctx context.Context, violationID uuid.UUID) error {
	return s.violationRepo.Acknowledge(ctx, violationID)
}

// =============================================================================
// HOS CALCULATION HELPERS
// =============================================================================

func (s *DriverService) recalculateHOS(ctx context.Context, driverID uuid.UUID) error {
	available, err := s.CalculateAvailableTime(ctx, driverID)
	if err != nil {
		return err
	}

	return s.driverRepo.UpdateHOS(ctx, driverID,
		available.AvailableDriveMins,
		available.AvailableDutyMins,
		available.AvailableCycleMins,
	)
}

func (s *DriverService) getCycleDutyMins(ctx context.Context, driverID uuid.UUID) (int, error) {
	// Get last 8 days of logs
	now := time.Now()
	startTime := now.AddDate(0, 0, -8)

	logs, err := s.hosLogRepo.GetByDriverID(ctx, driverID, startTime, now)
	if err != nil {
		return 0, err
	}

	var totalDutyMins int
	for _, log := range logs {
		if log.Status == domain.HOSStatusDriving || log.Status == domain.HOSStatusOnDutyNotDriv {
			duration := log.DurationMins
			if duration == 0 && log.EndTime == nil {
				duration = int(time.Since(log.StartTime).Minutes())
			}
			totalDutyMins += duration
		}
	}

	return totalDutyMins, nil
}

func (s *DriverService) needsBreak(logs []domain.HOSLog) bool {
	// Check if driver has driven more than 8 hours without a 30-minute break
	var consecutiveDrivingMins int
	var hadBreak bool

	for _, log := range logs {
		if log.Status == domain.HOSStatusDriving {
			duration := log.DurationMins
			if duration == 0 && log.EndTime == nil {
				duration = int(time.Since(log.StartTime).Minutes())
			}
			consecutiveDrivingMins += duration
			hadBreak = false
		} else if log.Status == domain.HOSStatusOffDuty || log.Status == domain.HOSStatusSleeperBerth {
			duration := log.DurationMins
			if duration == 0 && log.EndTime == nil {
				duration = int(time.Since(log.StartTime).Minutes())
			}
			if duration >= 30 {
				hadBreak = true
				consecutiveDrivingMins = 0
			}
		}
	}

	// Needs break if driven 8+ hours without a 30-min break
	return consecutiveDrivingMins >= 480 && !hadBreak
}

func (s *DriverService) getMinsUntilBreak(logs []domain.HOSLog) int {
	var consecutiveDrivingMins int

	for _, log := range logs {
		if log.Status == domain.HOSStatusDriving {
			duration := log.DurationMins
			if duration == 0 && log.EndTime == nil {
				duration = int(time.Since(log.StartTime).Minutes())
			}
			consecutiveDrivingMins += duration
		} else if log.Status == domain.HOSStatusOffDuty || log.Status == domain.HOSStatusSleeperBerth {
			duration := log.DurationMins
			if duration == 0 && log.EndTime == nil {
				duration = int(time.Since(log.StartTime).Minutes())
			}
			if duration >= 30 {
				consecutiveDrivingMins = 0
			}
		}
	}

	return max(0, 480-consecutiveDrivingMins)
}

// =============================================================================
// PERFORMANCE METRICS
// =============================================================================

// GetDriverPerformance retrieves performance metrics for a driver
func (s *DriverService) GetDriverPerformance(ctx context.Context, driverID uuid.UUID, period string, startDate, endDate time.Time) (*domain.DriverPerformance, error) {
	// This would aggregate data from trip completions, HOS logs, fuel records, etc.
	performance := &domain.DriverPerformance{
		DriverID:  driverID,
		Period:    period,
		StartDate: startDate,
		EndDate:   endDate,
		// Would be populated from actual data
	}

	return performance, nil
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

func timePtr(t time.Time) *time.Time {
	return &t
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
