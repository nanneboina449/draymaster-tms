package domain

import (
	"time"

	"github.com/google/uuid"
)

// MoveType represents eModal intermodal move types.
type MoveType string

const (
	MoveTypeImportPickup  MoveType = "IP" // Import container pickup at terminal
	MoveTypeImportDrop    MoveType = "ID" // Import container drayage drop
	MoveTypeExportPickup  MoveType = "XP" // Export container drayage pickup
	MoveTypeExportDrop    MoveType = "XD" // Export container drop at terminal
	MoveTypeEmptyPickup   MoveType = "MP" // Empty container pickup
	MoveTypeEmptyDrop     MoveType = "MD" // Empty container return/drop
	MoveTypeChassiPickup  MoveType = "BP" // Chassis pickup
	MoveTypeChasssisDrop  MoveType = "BD" // Chassis drop
)

// ContainerStatus represents the state of a container as reported by eModal.
type ContainerStatus string

const (
	StatusManifested    ContainerStatus = "MANIFESTED"
	StatusDischarged    ContainerStatus = "DISCHARGED"
	StatusInYard        ContainerStatus = "IN_YARD"
	StatusAvailable     ContainerStatus = "AVAILABLE"
	StatusOnHold        ContainerStatus = "ON_HOLD"
	StatusCustomsHold   ContainerStatus = "CUSTOMS_HOLD"
	StatusGateIn        ContainerStatus = "GATE_IN"
	StatusGateOut       ContainerStatus = "GATE_OUT"
	StatusReleased      ContainerStatus = "RELEASED"
	StatusLoaded        ContainerStatus = "LOADED"
	StatusNotManifested ContainerStatus = "NOT_MANIFESTED"
)

// eModalStatusCodes maps eModal single-character status codes to ContainerStatus.
// Reference: eModal EDS documentation — unitstatusinfo.status_cd field.
var eModalStatusCodes = map[string]ContainerStatus{
	"M": StatusManifested,
	"D": StatusDischarged,
	"Y": StatusInYard,
	"A": StatusAvailable,
	"H": StatusOnHold,
	"C": StatusCustomsHold,
	"I": StatusGateIn,
	"O": StatusGateOut,
	"R": StatusReleased,
	"L": StatusLoaded,
	"N": StatusNotManifested,
}

// MapStatusCode converts an eModal status_cd character to a ContainerStatus.
// Returns StatusInYard for unknown codes.
func MapStatusCode(code string) ContainerStatus {
	if status, ok := eModalStatusCodes[code]; ok {
		return status
	}
	return StatusInYard
}

// GateFeeType represents the category of a terminal fee.
type GateFeeType string

const (
	FeeDemurrage    GateFeeType = "DEMURRAGE"
	FeeStorage      GateFeeType = "STORAGE"
	FeeGate         GateFeeType = "GATE_FEE"
	FeeExtendedGate GateFeeType = "EXTENDED_GATE_FEE"
	FeePerDiem      GateFeeType = "PER_DIEM"
	FeeCustomsExam  GateFeeType = "CUSTOMS_EXAM"
)

// GateFeeStatus represents the payment state of a gate fee.
type GateFeeStatus string

const (
	FeePending  GateFeeStatus = "PENDING"
	FeeAssessed GateFeeStatus = "ASSESSED"
	FeePaid     GateFeeStatus = "PAID"
	FeeWaived   GateFeeStatus = "WAIVED"
	FeeDisputed GateFeeStatus = "DISPUTED"
)

// AppointmentSlot is an available time slot from eModal PreGate.
type AppointmentSlot struct {
	Time      time.Time
	Capacity  int
	Available int
	MoveType  MoveType
}

// ContainerStatusEvent is a parsed status push from eModal via Service Bus.
type ContainerStatusEvent struct {
	ContainerNumber     string
	Status              ContainerStatus
	PreviousStatus      ContainerStatus
	TerminalCode        string
	TerminalName        string
	LocationDescription string
	OccurredAt          time.Time
}

// GateFee represents a fee assessed by a terminal, persisted locally.
type GateFee struct {
	ID              uuid.UUID
	ContainerID     uuid.UUID
	ContainerNumber string
	OrderID         *uuid.UUID
	TerminalID      uuid.UUID
	Type            GateFeeType
	Amount          float64
	Currency        string
	BillableTo      string
	Status          GateFeeStatus
	EModalFeeID     string
	AssessedAt      time.Time
	PaidAt          *time.Time
	CreatedAt       time.Time
}

// PublishedContainer tracks a container registered with eModal for tracking.
type PublishedContainer struct {
	ContainerNumber string
	TerminalCode    string
	PortCode        string
	PublishedAt     time.Time
	LastStatusAt    *time.Time
	CurrentStatus   ContainerStatus
}

// DwellStats holds dwell time data for a container at a terminal.
type DwellStats struct {
	TerminalCode      string
	ContainerNumber   string
	DischargeDate     *time.Time
	GateOutDate       *time.Time
	DwellHours        float64
	AverageDwellHours float64
}

// TerminalInfo holds metadata about a terminal from eModal.
type TerminalInfo struct {
	TerminalID      string
	TerminalName    string
	PortCode        string
	SupportedMoves  []MoveType
	AppointmentType string // "slot" or "pre-advice"
}
