package domain

import (
	"time"

	"github.com/google/uuid"
)

// ExceptionType represents types of exceptions
type ExceptionType string

const (
	ExceptionTypeFailedPickup        ExceptionType = "FAILED_PICKUP"
	ExceptionTypeFailedDelivery      ExceptionType = "FAILED_DELIVERY"
	ExceptionTypeTerminalClosed      ExceptionType = "TERMINAL_CLOSED"
	ExceptionTypeEquipmentFailure    ExceptionType = "EQUIPMENT_FAILURE"
	ExceptionTypeChassisUnavailable  ExceptionType = "CHASSIS_UNAVAILABLE"
	ExceptionTypeContainerUnavailable ExceptionType = "CONTAINER_UNAVAILABLE"
	ExceptionTypeCustomsHold         ExceptionType = "CUSTOMS_HOLD"
	ExceptionTypeWeatherDelay        ExceptionType = "WEATHER_DELAY"
	ExceptionTypeDriverUnavailable   ExceptionType = "DRIVER_UNAVAILABLE"
	ExceptionTypeAccident            ExceptionType = "ACCIDENT"
	ExceptionTypeRoadClosure         ExceptionType = "ROAD_CLOSURE"
	ExceptionTypeAppointmentMissed   ExceptionType = "APPOINTMENT_MISSED"
	ExceptionTypeWeightIssue         ExceptionType = "WEIGHT_ISSUE"
	ExceptionTypeDamage              ExceptionType = "DAMAGE"
	ExceptionTypeOther               ExceptionType = "OTHER"
)

// ExceptionSeverity represents the severity level
type ExceptionSeverity string

const (
	ExceptionSeverityLow      ExceptionSeverity = "LOW"
	ExceptionSeverityMedium   ExceptionSeverity = "MEDIUM"
	ExceptionSeverityHigh     ExceptionSeverity = "HIGH"
	ExceptionSeverityCritical ExceptionSeverity = "CRITICAL"
)

// ExceptionStatus represents the exception status
type ExceptionStatus string

const (
	ExceptionStatusOpen       ExceptionStatus = "OPEN"
	ExceptionStatusAcknowledged ExceptionStatus = "ACKNOWLEDGED"
	ExceptionStatusInProgress ExceptionStatus = "IN_PROGRESS"
	ExceptionStatusResolved   ExceptionStatus = "RESOLVED"
	ExceptionStatusClosed     ExceptionStatus = "CLOSED"
	ExceptionStatusCancelled  ExceptionStatus = "CANCELLED"
)

// Exception represents an operational exception
type Exception struct {
	ID                uuid.UUID         `json:"id" db:"id"`
	TripID            uuid.UUID         `json:"trip_id" db:"trip_id"`
	StopID            *uuid.UUID        `json:"stop_id,omitempty" db:"stop_id"`
	OrderID           *uuid.UUID        `json:"order_id,omitempty" db:"order_id"`
	ContainerID       *uuid.UUID        `json:"container_id,omitempty" db:"container_id"`
	DriverID          *uuid.UUID        `json:"driver_id,omitempty" db:"driver_id"`
	Type              ExceptionType     `json:"type" db:"type"`
	Severity          ExceptionSeverity `json:"severity" db:"severity"`
	Status            ExceptionStatus   `json:"status" db:"status"`
	Title             string            `json:"title" db:"title"`
	Description       string            `json:"description" db:"description"`
	LocationID        *uuid.UUID        `json:"location_id,omitempty" db:"location_id"`
	Latitude          float64           `json:"latitude,omitempty" db:"latitude"`
	Longitude         float64           `json:"longitude,omitempty" db:"longitude"`
	ReportedBy        string            `json:"reported_by" db:"reported_by"`
	ReportedByID      *uuid.UUID        `json:"reported_by_id,omitempty" db:"reported_by_id"`
	AssignedTo        *string           `json:"assigned_to,omitempty" db:"assigned_to"`
	AssignedToID      *uuid.UUID        `json:"assigned_to_id,omitempty" db:"assigned_to_id"`
	Resolution        string            `json:"resolution,omitempty" db:"resolution"`
	ResolutionNotes   string            `json:"resolution_notes,omitempty" db:"resolution_notes"`
	EstimatedDelay    *int              `json:"estimated_delay_mins,omitempty" db:"estimated_delay_mins"`
	ActualDelay       *int              `json:"actual_delay_mins,omitempty" db:"actual_delay_mins"`
	FinancialImpact   *float64          `json:"financial_impact,omitempty" db:"financial_impact"`
	RequiresReschedule bool             `json:"requires_reschedule" db:"requires_reschedule"`
	RequiresReassignment bool           `json:"requires_reassignment" db:"requires_reassignment"`
	PhotoURLs         []string          `json:"photo_urls,omitempty" db:"photo_urls"`
	DocumentURLs      []string          `json:"document_urls,omitempty" db:"document_urls"`
	Metadata          map[string]string `json:"metadata,omitempty" db:"metadata"`
	OccurredAt        time.Time         `json:"occurred_at" db:"occurred_at"`
	AcknowledgedAt    *time.Time        `json:"acknowledged_at,omitempty" db:"acknowledged_at"`
	ResolvedAt        *time.Time        `json:"resolved_at,omitempty" db:"resolved_at"`
	CreatedAt         time.Time         `json:"created_at" db:"created_at"`
	UpdatedAt         time.Time         `json:"updated_at" db:"updated_at"`

	// Associations
	Trip      *Trip      `json:"trip,omitempty"`
	Stop      *TripStop  `json:"stop,omitempty"`
	Driver    *Driver    `json:"driver,omitempty"`
	Comments  []ExceptionComment `json:"comments,omitempty"`
}

// ExceptionComment represents a comment on an exception
type ExceptionComment struct {
	ID          uuid.UUID  `json:"id" db:"id"`
	ExceptionID uuid.UUID  `json:"exception_id" db:"exception_id"`
	AuthorID    uuid.UUID  `json:"author_id" db:"author_id"`
	AuthorName  string     `json:"author_name" db:"author_name"`
	Comment     string     `json:"comment" db:"comment"`
	IsInternal  bool       `json:"is_internal" db:"is_internal"`
	CreatedAt   time.Time  `json:"created_at" db:"created_at"`
}

// ExceptionHistory tracks status changes
type ExceptionHistory struct {
	ID          uuid.UUID       `json:"id" db:"id"`
	ExceptionID uuid.UUID       `json:"exception_id" db:"exception_id"`
	FromStatus  ExceptionStatus `json:"from_status" db:"from_status"`
	ToStatus    ExceptionStatus `json:"to_status" db:"to_status"`
	ChangedBy   string          `json:"changed_by" db:"changed_by"`
	ChangedByID *uuid.UUID      `json:"changed_by_id,omitempty" db:"changed_by_id"`
	Notes       string          `json:"notes,omitempty" db:"notes"`
	ChangedAt   time.Time       `json:"changed_at" db:"changed_at"`
}

// GetSeverityForType returns the default severity for an exception type
func GetSeverityForType(exceptionType ExceptionType) ExceptionSeverity {
	switch exceptionType {
	case ExceptionTypeAccident, ExceptionTypeDamage:
		return ExceptionSeverityCritical
	case ExceptionTypeFailedPickup, ExceptionTypeFailedDelivery,
		ExceptionTypeEquipmentFailure, ExceptionTypeCustomsHold:
		return ExceptionSeverityHigh
	case ExceptionTypeChassisUnavailable, ExceptionTypeAppointmentMissed,
		ExceptionTypeWeightIssue:
		return ExceptionSeverityMedium
	case ExceptionTypeWeatherDelay, ExceptionTypeRoadClosure:
		return ExceptionSeverityMedium
	default:
		return ExceptionSeverityLow
	}
}

// RequiresImmediateAction checks if exception needs immediate attention
func (e *Exception) RequiresImmediateAction() bool {
	return e.Severity == ExceptionSeverityCritical ||
		e.Severity == ExceptionSeverityHigh
}

// IsOpen checks if exception is still open
func (e *Exception) IsOpen() bool {
	return e.Status == ExceptionStatusOpen ||
		e.Status == ExceptionStatusAcknowledged ||
		e.Status == ExceptionStatusInProgress
}
