package domain

import (
	"time"

	"github.com/google/uuid"
)

// TripType represents the type of trip
type TripType string

const (
	TripTypeLiveLoad        TripType = "LIVE_LOAD"
	TripTypeLiveUnload      TripType = "LIVE_UNLOAD"
	TripTypeDropHookSame    TripType = "DROP_HOOK_SAME"
	TripTypeDropHookDiff    TripType = "DROP_HOOK_DIFF"
	TripTypeDropOnly        TripType = "DROP_ONLY"
	TripTypeStreetTurn      TripType = "STREET_TURN"
	TripTypeDualTransaction TripType = "DUAL_TRANSACTION"
	TripTypeBobtail         TripType = "BOBTAIL"
	TripTypeEmptyPickup     TripType = "EMPTY_PICKUP"
	TripTypeEmptyReturn     TripType = "EMPTY_RETURN"
	TripTypePrePull         TripType = "PRE_PULL"
	TripTypeTransload       TripType = "TRANSLOAD"
)

// TripStatus represents the status of a trip
type TripStatus string

const (
	TripStatusDraft      TripStatus = "DRAFT"
	TripStatusPlanned    TripStatus = "PLANNED"
	TripStatusAssigned   TripStatus = "ASSIGNED"
	TripStatusDispatched TripStatus = "DISPATCHED"
	TripStatusEnRoute    TripStatus = "EN_ROUTE"
	TripStatusInProgress TripStatus = "IN_PROGRESS"
	TripStatusCompleted  TripStatus = "COMPLETED"
	TripStatusCancelled  TripStatus = "CANCELLED"
	TripStatusFailed     TripStatus = "FAILED"
)

// StopType represents the type of stop
type StopType string

const (
	StopTypePickup   StopType = "PICKUP"
	StopTypeDelivery StopType = "DELIVERY"
	StopTypeReturn   StopType = "RETURN"
	StopTypeYard     StopType = "YARD"
)

// ActivityType represents the activity at a stop
type ActivityType string

const (
	ActivityTypePickupLoaded  ActivityType = "PICKUP_LOADED"
	ActivityTypePickupEmpty   ActivityType = "PICKUP_EMPTY"
	ActivityTypeDeliverLoaded ActivityType = "DELIVER_LOADED"
	ActivityTypeDropLoaded    ActivityType = "DROP_LOADED"
	ActivityTypeDropEmpty     ActivityType = "DROP_EMPTY"
	ActivityTypeHookEmpty     ActivityType = "HOOK_EMPTY"
	ActivityTypeLiveLoad      ActivityType = "LIVE_LOAD"
	ActivityTypeLiveUnload    ActivityType = "LIVE_UNLOAD"
	ActivityTypeChassisPickup ActivityType = "CHASSIS_PICKUP"
	ActivityTypeChassisDrop   ActivityType = "CHASSIS_DROP"
	ActivityTypeFuelStop      ActivityType = "FUEL_STOP"
	ActivityTypeScale         ActivityType = "SCALE"
	ActivityTypeCustomsExam   ActivityType = "CUSTOMS_EXAM"
)

// StopStatus represents the status of a stop
type StopStatus string

const (
	StopStatusPending    StopStatus = "PENDING"
	StopStatusEnRoute    StopStatus = "EN_ROUTE"
	StopStatusArrived    StopStatus = "ARRIVED"
	StopStatusInProgress StopStatus = "IN_PROGRESS"
	StopStatusCompleted  StopStatus = "COMPLETED"
	StopStatusFailed     StopStatus = "FAILED"
	StopStatusSkipped    StopStatus = "SKIPPED"
)

// Trip represents a driver's trip with stops
type Trip struct {
	ID                    uuid.UUID  `json:"id" db:"id"`
	TripNumber            string     `json:"trip_number" db:"trip_number"`
	Type                  TripType   `json:"type" db:"type"`
	Status                TripStatus `json:"status" db:"status"`
	DriverID              *uuid.UUID `json:"driver_id,omitempty" db:"driver_id"`
	TractorID             *uuid.UUID `json:"tractor_id,omitempty" db:"tractor_id"`
	ChassisID             *uuid.UUID `json:"chassis_id,omitempty" db:"chassis_id"`
	CurrentStopSequence   int        `json:"current_stop_sequence" db:"current_stop_sequence"`
	PlannedStartTime      *time.Time `json:"planned_start_time,omitempty" db:"planned_start_time"`
	ActualStartTime       *time.Time `json:"actual_start_time,omitempty" db:"actual_start_time"`
	PlannedEndTime        *time.Time `json:"planned_end_time,omitempty" db:"planned_end_time"`
	ActualEndTime         *time.Time `json:"actual_end_time,omitempty" db:"actual_end_time"`
	EstimatedDurationMins int        `json:"estimated_duration_mins" db:"estimated_duration_mins"`
	TotalMiles            float64    `json:"total_miles" db:"total_miles"`
	CompletedMiles        float64    `json:"completed_miles" db:"completed_miles"`
	IsStreetTurn          bool       `json:"is_street_turn" db:"is_street_turn"`
	IsDualTransaction     bool       `json:"is_dual_transaction" db:"is_dual_transaction"`
	LinkedTripID          *uuid.UUID `json:"linked_trip_id,omitempty" db:"linked_trip_id"`
	CreatedBy             string     `json:"created_by" db:"created_by"`
	CreatedAt             time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt             time.Time  `json:"updated_at" db:"updated_at"`

	// Associations (loaded separately)
	Stops    []TripStop `json:"stops,omitempty"`
	Driver   *Driver    `json:"driver,omitempty"`
	Tractor  *Tractor   `json:"tractor,omitempty"`
	OrderIDs []string   `json:"order_ids,omitempty"`
}

// TripStop represents a stop within a trip
type TripStop struct {
	ID                    uuid.UUID    `json:"id" db:"id"`
	TripID                uuid.UUID    `json:"trip_id" db:"trip_id"`
	Sequence              int          `json:"sequence" db:"sequence"`
	Type                  StopType     `json:"type" db:"type"`
	Activity              ActivityType `json:"activity" db:"activity"`
	Status                StopStatus   `json:"status" db:"status"`
	LocationID            uuid.UUID    `json:"location_id" db:"location_id"`
	ContainerID           *uuid.UUID   `json:"container_id,omitempty" db:"container_id"`
	ContainerNumber       string       `json:"container_number,omitempty" db:"container_number"`
	OrderID               *uuid.UUID   `json:"order_id,omitempty" db:"order_id"`
	AppointmentTime       *time.Time   `json:"appointment_time,omitempty" db:"appointment_time"`
	AppointmentNumber     string       `json:"appointment_number,omitempty" db:"appointment_number"`
	AppointmentWindowMins int          `json:"appointment_window_mins" db:"appointment_window_mins"`
	PlannedArrival        *time.Time   `json:"planned_arrival,omitempty" db:"planned_arrival"`
	ActualArrival         *time.Time   `json:"actual_arrival,omitempty" db:"actual_arrival"`
	ActualDeparture       *time.Time   `json:"actual_departure,omitempty" db:"actual_departure"`
	EstimatedDurationMins int          `json:"estimated_duration_mins" db:"estimated_duration_mins"`
	ActualDurationMins    int          `json:"actual_duration_mins" db:"actual_duration_mins"`
	FreeTimeMins          int          `json:"free_time_mins" db:"free_time_mins"`
	DetentionStartTime    *time.Time   `json:"detention_start_time,omitempty" db:"detention_start_time"`
	DetentionMins         int          `json:"detention_mins" db:"detention_mins"`
	ChassisInID           *uuid.UUID   `json:"chassis_in_id,omitempty" db:"chassis_in_id"`
	ChassisOutID          *uuid.UUID   `json:"chassis_out_id,omitempty" db:"chassis_out_id"`
	ContainerInID         *uuid.UUID   `json:"container_in_id,omitempty" db:"container_in_id"`
	ContainerOutID        *uuid.UUID   `json:"container_out_id,omitempty" db:"container_out_id"`
	GateTicketNumber      string       `json:"gate_ticket_number,omitempty" db:"gate_ticket_number"`
	SealNumber            string       `json:"seal_number,omitempty" db:"seal_number"`
	FailureReason         string       `json:"failure_reason,omitempty" db:"failure_reason"`
	Notes                 string       `json:"notes,omitempty" db:"notes"`
	CreatedAt             time.Time    `json:"created_at" db:"created_at"`
	UpdatedAt             time.Time    `json:"updated_at" db:"updated_at"`

	// Associations
	Location   *Location  `json:"location,omitempty"`
	DocumentIDs []string  `json:"document_ids,omitempty"`
}

// CalculateDetention calculates detention time at stop
func (s *TripStop) CalculateDetention() int {
	if s.ActualArrival == nil || s.ActualDeparture == nil {
		return 0
	}
	
	totalMins := int(s.ActualDeparture.Sub(*s.ActualArrival).Minutes())
	if totalMins <= s.FreeTimeMins {
		return 0
	}
	return totalMins - s.FreeTimeMins
}

// Location represents a physical location
type Location struct {
	ID           uuid.UUID `json:"id" db:"id"`
	Name         string    `json:"name" db:"name"`
	Type         string    `json:"type" db:"type"`
	Address      string    `json:"address" db:"address"`
	City         string    `json:"city" db:"city"`
	State        string    `json:"state" db:"state"`
	Zip          string    `json:"zip" db:"zip"`
	Latitude     float64   `json:"latitude" db:"latitude"`
	Longitude    float64   `json:"longitude" db:"longitude"`
	ContactName  string    `json:"contact_name,omitempty" db:"contact_name"`
	ContactPhone string    `json:"contact_phone,omitempty" db:"contact_phone"`
	GeofenceID   *uuid.UUID `json:"geofence_id,omitempty" db:"geofence_id"`
}

// Driver represents a driver (lightweight for dispatch)
type Driver struct {
	ID                   uuid.UUID `json:"id" db:"id"`
	Name                 string    `json:"name" db:"name"`
	Phone                string    `json:"phone" db:"phone"`
	Status               string    `json:"status" db:"status"`
	CurrentLatitude      float64   `json:"current_latitude" db:"current_latitude"`
	CurrentLongitude     float64   `json:"current_longitude" db:"current_longitude"`
	AvailableDriveMins   int       `json:"available_drive_mins" db:"available_drive_mins"`
	AvailableDutyMins    int       `json:"available_duty_mins" db:"available_duty_mins"`
	HasTWIC              bool      `json:"has_twic" db:"has_twic"`
	HasHazmatEndorsement bool      `json:"has_hazmat_endorsement" db:"has_hazmat_endorsement"`
}

// Tractor represents a tractor/truck
type Tractor struct {
	ID         uuid.UUID `json:"id" db:"id"`
	UnitNumber string    `json:"unit_number" db:"unit_number"`
	Status     string    `json:"status" db:"status"`
}

// StreetTurnOpportunity represents a potential street turn match
type StreetTurnOpportunity struct {
	ImportOrderID           uuid.UUID `json:"import_order_id"`
	ImportOrderNumber       string    `json:"import_order_number"`
	ImportContainerNumber   string    `json:"import_container_number"`
	ImportConsigneeName     string    `json:"import_consignee_name"`
	ImportDeliveryLocation  Location  `json:"import_delivery_location"`
	ImportDeliveryDate      time.Time `json:"import_delivery_date"`
	
	ExportOrderID          uuid.UUID `json:"export_order_id"`
	ExportOrderNumber      string    `json:"export_order_number"`
	ExportShipperName      string    `json:"export_shipper_name"`
	ExportPickupLocation   Location  `json:"export_pickup_location"`
	ExportPickupDate       time.Time `json:"export_pickup_date"`
	
	SteamshipLine   string  `json:"steamship_line"`
	ContainerSize   string  `json:"container_size"`
	ContainerType   string  `json:"container_type"`
	DistanceMiles   float64 `json:"distance_miles"`
	EstimatedSavings float64 `json:"estimated_savings"`
	MatchScore      int     `json:"match_score"`
}

// DispatchBoard represents the kanban-style dispatch board
type DispatchBoard struct {
	Unassigned  []Trip    `json:"unassigned"`
	Assigned    []Trip    `json:"assigned"`
	Dispatched  []Trip    `json:"dispatched"`
	InProgress  []Trip    `json:"in_progress"`
	Completed   []Trip    `json:"completed"`
	Failed      []Trip    `json:"failed"`
	TotalTrips  int       `json:"total_trips"`
	AsOf        time.Time `json:"as_of"`
}

// DriverAvailability represents driver availability for assignment
type DriverAvailability struct {
	DriverID              uuid.UUID `json:"driver_id"`
	DriverName            string    `json:"driver_name"`
	Status                string    `json:"status"`
	Latitude              float64   `json:"latitude"`
	Longitude             float64   `json:"longitude"`
	AvailableDriveMins    int       `json:"available_drive_mins"`
	AvailableDutyMins     int       `json:"available_duty_mins"`
	CurrentTripID         *uuid.UUID `json:"current_trip_id,omitempty"`
	CurrentTripETA        *time.Time `json:"current_trip_eta,omitempty"`
	DistanceToPickupMiles float64   `json:"distance_to_pickup_miles"`
	ETAToPickupMins       int       `json:"eta_to_pickup_mins"`
	Endorsements          []string  `json:"endorsements"`
	HasTWIC               bool      `json:"has_twic"`
}

// TripTemplate defines common trip patterns
type TripTemplate struct {
	Type        TripType
	Description string
	StopPattern []StopTemplateItem
}

type StopTemplateItem struct {
	Sequence    int
	Type        StopType
	Activity    ActivityType
	Description string
}

// GetTripTemplates returns predefined trip templates
func GetTripTemplates() map[TripType]TripTemplate {
	return map[TripType]TripTemplate{
		TripTypeLiveUnload: {
			Type:        TripTypeLiveUnload,
			Description: "Import: Pick up loaded container, deliver, wait for unload, return empty",
			StopPattern: []StopTemplateItem{
				{1, StopTypePickup, ActivityTypePickupLoaded, "Pick up loaded container at terminal"},
				{2, StopTypeDelivery, ActivityTypeLiveUnload, "Deliver and wait for unload at consignee"},
				{3, StopTypeReturn, ActivityTypeDropEmpty, "Return empty container"},
			},
		},
		TripTypeDropHookSame: {
			Type:        TripTypeDropHookSame,
			Description: "Import: Drop loaded container, hook empty from same location",
			StopPattern: []StopTemplateItem{
				{1, StopTypePickup, ActivityTypePickupLoaded, "Pick up loaded container at terminal"},
				{2, StopTypeDelivery, ActivityTypeDropLoaded, "Drop loaded container at consignee"},
				{3, StopTypeDelivery, ActivityTypeHookEmpty, "Hook empty container from consignee"},
				{4, StopTypeReturn, ActivityTypeDropEmpty, "Return empty container"},
			},
		},
		TripTypeStreetTurn: {
			Type:        TripTypeStreetTurn,
			Description: "Street turn: Deliver import, pick up export load without returning empty",
			StopPattern: []StopTemplateItem{
				{1, StopTypePickup, ActivityTypePickupLoaded, "Pick up loaded import container"},
				{2, StopTypeDelivery, ActivityTypeLiveUnload, "Deliver and unload at consignee"},
				{3, StopTypePickup, ActivityTypeLiveLoad, "Pick up export load at shipper"},
				{4, StopTypeDelivery, ActivityTypeDropLoaded, "Deliver loaded export to terminal"},
			},
		},
		TripTypeDualTransaction: {
			Type:        TripTypeDualTransaction,
			Description: "Dual transaction: Drop and pick at terminal in single visit",
			StopPattern: []StopTemplateItem{
				{1, StopTypePickup, ActivityTypePickupLoaded, "Pick up outbound container"},
				{2, StopTypeDelivery, ActivityTypeDropLoaded, "Drop at terminal + pick up new container"},
				{3, StopTypeDelivery, ActivityTypeLiveUnload, "Deliver to consignee"},
				{4, StopTypeReturn, ActivityTypeDropEmpty, "Return empty"},
			},
		},
		TripTypePrePull: {
			Type:        TripTypePrePull,
			Description: "Pre-pull: Move container from terminal to yard before LFD",
			StopPattern: []StopTemplateItem{
				{1, StopTypePickup, ActivityTypePickupLoaded, "Pick up container at terminal"},
				{2, StopTypeYard, ActivityTypeDropLoaded, "Drop at yard for storage"},
			},
		},
	}
}
