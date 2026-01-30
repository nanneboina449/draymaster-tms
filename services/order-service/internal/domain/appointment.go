package domain

import (
	"time"

	"github.com/google/uuid"
)

// AppointmentType represents the type of terminal appointment
type AppointmentType string

const (
	AppointmentTypePickup  AppointmentType = "PICKUP"
	AppointmentTypeReturn  AppointmentType = "RETURN"
	AppointmentTypeDropOff AppointmentType = "DROP_OFF"
	AppointmentTypeDual    AppointmentType = "DUAL" // Pick and drop in one visit
)

// AppointmentStatus represents the appointment status
type AppointmentStatus string

const (
	AppointmentStatusRequested  AppointmentStatus = "REQUESTED"
	AppointmentStatusPending    AppointmentStatus = "PENDING"
	AppointmentStatusConfirmed  AppointmentStatus = "CONFIRMED"
	AppointmentStatusCancelled  AppointmentStatus = "CANCELLED"
	AppointmentStatusCompleted  AppointmentStatus = "COMPLETED"
	AppointmentStatusMissed     AppointmentStatus = "MISSED"
	AppointmentStatusRescheduled AppointmentStatus = "RESCHEDULED"
)

// TerminalAppointment represents a terminal gate appointment
type TerminalAppointment struct {
	ID                  uuid.UUID         `json:"id" db:"id"`
	OrderID             uuid.UUID         `json:"order_id" db:"order_id"`
	TripID              *uuid.UUID        `json:"trip_id,omitempty" db:"trip_id"`
	TerminalID          uuid.UUID         `json:"terminal_id" db:"terminal_id"`
	TerminalName        string            `json:"terminal_name,omitempty"`
	Type                AppointmentType   `json:"type" db:"type"`
	Status              AppointmentStatus `json:"status" db:"status"`
	ContainerID         *uuid.UUID        `json:"container_id,omitempty" db:"container_id"`
	ContainerNumber     string            `json:"container_number,omitempty" db:"container_number"`
	ChassisID           *uuid.UUID        `json:"chassis_id,omitempty" db:"chassis_id"`
	DriverID            *uuid.UUID        `json:"driver_id,omitempty" db:"driver_id"`
	TractorID           *uuid.UUID        `json:"tractor_id,omitempty" db:"tractor_id"`
	RequestedTime       time.Time         `json:"requested_time" db:"requested_time"`
	ConfirmedTime       *time.Time        `json:"confirmed_time,omitempty" db:"confirmed_time"`
	WindowStartTime     time.Time         `json:"window_start_time" db:"window_start_time"`
	WindowEndTime       time.Time         `json:"window_end_time" db:"window_end_time"`
	ConfirmationNumber  string            `json:"confirmation_number,omitempty" db:"confirmation_number"`
	GateNumber          string            `json:"gate_number,omitempty" db:"gate_number"`
	LaneNumber          string            `json:"lane_number,omitempty" db:"lane_number"`
	SpecialInstructions string            `json:"special_instructions,omitempty" db:"special_instructions"`
	ActualArrivalTime   *time.Time        `json:"actual_arrival_time,omitempty" db:"actual_arrival_time"`
	ActualCompletionTime *time.Time       `json:"actual_completion_time,omitempty" db:"actual_completion_time"`
	GateTicketNumber    string            `json:"gate_ticket_number,omitempty" db:"gate_ticket_number"`
	CancellationReason  string            `json:"cancellation_reason,omitempty" db:"cancellation_reason"`
	RescheduledFrom     *uuid.UUID        `json:"rescheduled_from,omitempty" db:"rescheduled_from"`
	RequestedBy         string            `json:"requested_by" db:"requested_by"`
	RequestedByID       *uuid.UUID        `json:"requested_by_id,omitempty" db:"requested_by_id"`
	ConfirmedBy         string            `json:"confirmed_by,omitempty" db:"confirmed_by"`
	TerminalReference   string            `json:"terminal_reference,omitempty" db:"terminal_reference"`
	Metadata            map[string]string `json:"metadata,omitempty" db:"metadata"`
	CreatedAt           time.Time         `json:"created_at" db:"created_at"`
	UpdatedAt           time.Time         `json:"updated_at" db:"updated_at"`

	// Associations
	Order     *Order    `json:"order,omitempty"`
	Trip      *Trip     `json:"trip,omitempty"`
	Container *Container `json:"container,omitempty"`
}

// TerminalGateHours represents terminal operating hours
type TerminalGateHours struct {
	ID              uuid.UUID `json:"id" db:"id"`
	TerminalID      uuid.UUID `json:"terminal_id" db:"terminal_id"`
	DayOfWeek       int       `json:"day_of_week" db:"day_of_week"` // 0=Sunday, 6=Saturday
	OpenTime        string    `json:"open_time" db:"open_time"`     // HH:MM format
	CloseTime       string    `json:"close_time" db:"close_time"`   // HH:MM format
	IsHoliday       bool      `json:"is_holiday" db:"is_holiday"`
	IsClosed        bool      `json:"is_closed" db:"is_closed"`
	SpecialDate     *time.Time `json:"special_date,omitempty" db:"special_date"` // For holidays
	Notes           string    `json:"notes,omitempty" db:"notes"`
	CreatedAt       time.Time `json:"created_at" db:"created_at"`
	UpdatedAt       time.Time `json:"updated_at" db:"updated_at"`
}

// TerminalAppointmentSlot represents available appointment slots
type TerminalAppointmentSlot struct {
	TerminalID    uuid.UUID `json:"terminal_id"`
	SlotTime      time.Time `json:"slot_time"`
	Capacity      int       `json:"capacity"`
	BookedCount   int       `json:"booked_count"`
	AvailableSlots int      `json:"available_slots"`
	IsAvailable   bool      `json:"is_available"`
}

// IsActive checks if appointment is active
func (a *TerminalAppointment) IsActive() bool {
	return a.Status == AppointmentStatusRequested ||
		a.Status == AppointmentStatusPending ||
		a.Status == AppointmentStatusConfirmed
}

// IsMissed checks if appointment was missed
func (a *TerminalAppointment) IsMissed() bool {
	if a.Status == AppointmentStatusMissed {
		return true
	}

	// If confirmed and past window with no arrival
	if a.Status == AppointmentStatusConfirmed &&
	   a.ActualArrivalTime == nil &&
	   time.Now().After(a.WindowEndTime) {
		return true
	}

	return false
}

// IsWithinWindow checks if current time is within appointment window
func (a *TerminalAppointment) IsWithinWindow() bool {
	now := time.Now()
	return now.After(a.WindowStartTime) && now.Before(a.WindowEndTime)
}

// TimeUntilAppointment returns minutes until appointment window starts
func (a *TerminalAppointment) TimeUntilAppointment() int {
	if time.Now().After(a.WindowStartTime) {
		return 0
	}
	duration := time.Until(a.WindowStartTime)
	return int(duration.Minutes())
}
