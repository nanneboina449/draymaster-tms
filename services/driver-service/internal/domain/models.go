package domain

import (
	"time"

	"github.com/google/uuid"
)

// DriverStatus represents the current status of a driver
type DriverStatus string

const (
	DriverStatusAvailable   DriverStatus = "AVAILABLE"
	DriverStatusOnDuty      DriverStatus = "ON_DUTY"
	DriverStatusDriving     DriverStatus = "DRIVING"
	DriverStatusSleeper     DriverStatus = "SLEEPER"
	DriverStatusOffDuty     DriverStatus = "OFF_DUTY"
	DriverStatusInactive    DriverStatus = "INACTIVE"
)

// HOSStatus represents Hours of Service duty status
type HOSStatus string

const (
	HOSStatusOffDuty       HOSStatus = "OFF_DUTY"
	HOSStatusSleeperBerth  HOSStatus = "SLEEPER_BERTH"
	HOSStatusDriving       HOSStatus = "DRIVING"
	HOSStatusOnDutyNotDriv HOSStatus = "ON_DUTY_NOT_DRIVING"
)

// Driver represents a truck driver
type Driver struct {
	ID                    uuid.UUID    `json:"id" db:"id"`
	EmployeeNumber        string       `json:"employee_number" db:"employee_number"`
	FirstName             string       `json:"first_name" db:"first_name"`
	LastName              string       `json:"last_name" db:"last_name"`
	Email                 string       `json:"email" db:"email"`
	Phone                 string       `json:"phone" db:"phone"`
	Status                DriverStatus `json:"status" db:"status"`
	
	// License Information
	LicenseNumber         string     `json:"license_number" db:"license_number"`
	LicenseState          string     `json:"license_state" db:"license_state"`
	LicenseClass          string     `json:"license_class" db:"license_class"`
	LicenseExpiration     *time.Time `json:"license_expiration,omitempty" db:"license_expiration"`
	
	// Endorsements & Certifications
	HasTWIC               bool       `json:"has_twic" db:"has_twic"`
	TWICExpiration        *time.Time `json:"twic_expiration,omitempty" db:"twic_expiration"`
	HasHazmatEndorsement  bool       `json:"has_hazmat_endorsement" db:"has_hazmat_endorsement"`
	HazmatExpiration      *time.Time `json:"hazmat_expiration,omitempty" db:"hazmat_expiration"`
	HasTankerEndorsement  bool       `json:"has_tanker_endorsement" db:"has_tanker_endorsement"`
	HasDoublesEndorsement bool       `json:"has_doubles_endorsement" db:"has_doubles_endorsement"`
	
	// Medical
	MedicalCardExpiration *time.Time `json:"medical_card_expiration,omitempty" db:"medical_card_expiration"`
	
	// Current State
	CurrentLatitude       float64    `json:"current_latitude" db:"current_latitude"`
	CurrentLongitude      float64    `json:"current_longitude" db:"current_longitude"`
	CurrentTractorID      *uuid.UUID `json:"current_tractor_id,omitempty" db:"current_tractor_id"`
	CurrentTripID         *uuid.UUID `json:"current_trip_id,omitempty" db:"current_trip_id"`
	
	// HOS
	AvailableDriveMins    int        `json:"available_drive_mins" db:"available_drive_mins"`
	AvailableDutyMins     int        `json:"available_duty_mins" db:"available_duty_mins"`
	AvailableCycleMins    int        `json:"available_cycle_mins" db:"available_cycle_mins"`
	LastHOSUpdate         *time.Time `json:"last_hos_update,omitempty" db:"last_hos_update"`
	
	// Home Terminal
	HomeTerminalID        *uuid.UUID `json:"home_terminal_id,omitempty" db:"home_terminal_id"`
	
	// Employment
	HireDate              *time.Time `json:"hire_date,omitempty" db:"hire_date"`
	TerminationDate       *time.Time `json:"termination_date,omitempty" db:"termination_date"`
	
	// App
	AppUserID             *uuid.UUID `json:"app_user_id,omitempty" db:"app_user_id"`
	DeviceToken           string     `json:"device_token,omitempty" db:"device_token"`
	
	CreatedAt             time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt             time.Time  `json:"updated_at" db:"updated_at"`
}

// FullName returns the driver's full name
func (d *Driver) FullName() string {
	return d.FirstName + " " + d.LastName
}

// IsCompliant checks if driver meets all compliance requirements
func (d *Driver) IsCompliant() bool {
	now := time.Now()
	
	// Check license expiration
	if d.LicenseExpiration != nil && d.LicenseExpiration.Before(now) {
		return false
	}
	
	// Check medical card
	if d.MedicalCardExpiration != nil && d.MedicalCardExpiration.Before(now) {
		return false
	}
	
	// Check TWIC if required
	if d.HasTWIC && d.TWICExpiration != nil && d.TWICExpiration.Before(now) {
		return false
	}
	
	return true
}

// CanDrive checks if driver has available HOS time
func (d *Driver) CanDrive(requiredMins int) bool {
	return d.AvailableDriveMins >= requiredMins && 
		   d.AvailableDutyMins >= requiredMins &&
		   d.AvailableCycleMins >= requiredMins
}

// HOSLog represents an Hours of Service log entry
type HOSLog struct {
	ID              uuid.UUID `json:"id" db:"id"`
	DriverID        uuid.UUID `json:"driver_id" db:"driver_id"`
	Status          HOSStatus `json:"status" db:"status"`
	StartTime       time.Time `json:"start_time" db:"start_time"`
	EndTime         *time.Time `json:"end_time,omitempty" db:"end_time"`
	DurationMins    int       `json:"duration_mins" db:"duration_mins"`
	Location        string    `json:"location,omitempty" db:"location"`
	Latitude        float64   `json:"latitude" db:"latitude"`
	Longitude       float64   `json:"longitude" db:"longitude"`
	Odometer        int       `json:"odometer" db:"odometer"`
	EngineHours     float64   `json:"engine_hours" db:"engine_hours"`
	TripID          *uuid.UUID `json:"trip_id,omitempty" db:"trip_id"`
	TractorID       *uuid.UUID `json:"tractor_id,omitempty" db:"tractor_id"`
	Notes           string    `json:"notes,omitempty" db:"notes"`
	Source          string    `json:"source" db:"source"` // eld, manual, auto
	EditReason      string    `json:"edit_reason,omitempty" db:"edit_reason"`
	OriginalLogID   *uuid.UUID `json:"original_log_id,omitempty" db:"original_log_id"`
	CreatedAt       time.Time `json:"created_at" db:"created_at"`
}

// HOSSummary represents daily HOS summary
type HOSSummary struct {
	DriverID         uuid.UUID `json:"driver_id"`
	Date             time.Time `json:"date"`
	DrivingMins      int       `json:"driving_mins"`
	OnDutyMins       int       `json:"on_duty_mins"`
	OffDutyMins      int       `json:"off_duty_mins"`
	SleeperMins      int       `json:"sleeper_mins"`
	AvailableDrive   int       `json:"available_drive"`
	AvailableDuty    int       `json:"available_duty"`
	AvailableCycle   int       `json:"available_cycle"`
	Violations       []HOSViolation `json:"violations,omitempty"`
}

// HOSViolation represents an HOS violation
type HOSViolation struct {
	ID           uuid.UUID `json:"id" db:"id"`
	DriverID     uuid.UUID `json:"driver_id" db:"driver_id"`
	Type         string    `json:"type" db:"type"` // 11_hour, 14_hour, 30_min_break, 60_70_hour
	OccurredAt   time.Time `json:"occurred_at" db:"occurred_at"`
	DurationMins int       `json:"duration_mins" db:"duration_mins"`
	Description  string    `json:"description" db:"description"`
	Acknowledged bool      `json:"acknowledged" db:"acknowledged"`
	CreatedAt    time.Time `json:"created_at" db:"created_at"`
}

// ComplianceAlert represents a driver compliance alert
type ComplianceAlert struct {
	ID          uuid.UUID `json:"id" db:"id"`
	DriverID    uuid.UUID `json:"driver_id" db:"driver_id"`
	Type        string    `json:"type" db:"type"` // license_expiring, medical_expiring, twic_expiring, etc.
	Severity    string    `json:"severity" db:"severity"` // warning, critical
	Message     string    `json:"message" db:"message"`
	ExpiresAt   time.Time `json:"expires_at" db:"expires_at"`
	DaysUntil   int       `json:"days_until" db:"days_until"`
	Acknowledged bool     `json:"acknowledged" db:"acknowledged"`
	CreatedAt   time.Time `json:"created_at" db:"created_at"`
}

// DriverDocument represents a driver document/certification
type DriverDocument struct {
	ID           uuid.UUID  `json:"id" db:"id"`
	DriverID     uuid.UUID  `json:"driver_id" db:"driver_id"`
	Type         string     `json:"type" db:"type"` // license, medical_card, twic, hazmat_cert, etc.
	FileName     string     `json:"file_name" db:"file_name"`
	FilePath     string     `json:"file_path" db:"file_path"`
	FileSize     int        `json:"file_size" db:"file_size"`
	MimeType     string     `json:"mime_type" db:"mime_type"`
	ExpiresAt    *time.Time `json:"expires_at,omitempty" db:"expires_at"`
	UploadedAt   time.Time  `json:"uploaded_at" db:"uploaded_at"`
	UploadedBy   string     `json:"uploaded_by" db:"uploaded_by"`
}

// DriverPerformance represents driver performance metrics
type DriverPerformance struct {
	DriverID          uuid.UUID `json:"driver_id"`
	Period            string    `json:"period"` // daily, weekly, monthly
	StartDate         time.Time `json:"start_date"`
	EndDate           time.Time `json:"end_date"`
	TotalTrips        int       `json:"total_trips"`
	CompletedTrips    int       `json:"completed_trips"`
	OnTimeDeliveries  int       `json:"on_time_deliveries"`
	LateDeliveries    int       `json:"late_deliveries"`
	TotalMiles        float64   `json:"total_miles"`
	TotalRevenue      float64   `json:"total_revenue"`
	FuelEfficiency    float64   `json:"fuel_efficiency"` // MPG
	IdleTimePercent   float64   `json:"idle_time_percent"`
	HOSViolations     int       `json:"hos_violations"`
	DetentionMins     int       `json:"detention_mins"`
	AvgTripDuration   float64   `json:"avg_trip_duration"`
}
