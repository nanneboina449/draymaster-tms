package domain

import (
	"time"

	"github.com/google/uuid"
)

// EquipmentStatus represents the status of equipment
type EquipmentStatus string

const (
	EquipmentStatusAvailable    EquipmentStatus = "AVAILABLE"
	EquipmentStatusInUse        EquipmentStatus = "IN_USE"
	EquipmentStatusMaintenance  EquipmentStatus = "MAINTENANCE"
	EquipmentStatusOutOfService EquipmentStatus = "OUT_OF_SERVICE"
)

// Tractor represents a truck/tractor
type Tractor struct {
	ID                uuid.UUID       `json:"id" db:"id"`
	UnitNumber        string          `json:"unit_number" db:"unit_number"`
	VIN               string          `json:"vin" db:"vin"`
	Make              string          `json:"make" db:"make"`
	Model             string          `json:"model" db:"model"`
	Year              int             `json:"year" db:"year"`
	Status            EquipmentStatus `json:"status" db:"status"`
	
	// Ownership
	OwnershipType     string     `json:"ownership_type" db:"ownership_type"` // company, owner_operator, lease
	OwnerOperatorID   *uuid.UUID `json:"owner_operator_id,omitempty" db:"owner_operator_id"`
	
	// Current State
	CurrentDriverID   *uuid.UUID `json:"current_driver_id,omitempty" db:"current_driver_id"`
	CurrentTripID     *uuid.UUID `json:"current_trip_id,omitempty" db:"current_trip_id"`
	CurrentLatitude   float64    `json:"current_latitude" db:"current_latitude"`
	CurrentLongitude  float64    `json:"current_longitude" db:"current_longitude"`
	CurrentOdometer   int        `json:"current_odometer" db:"current_odometer"`
	CurrentEngineHours float64   `json:"current_engine_hours" db:"current_engine_hours"`
	
	// Specs
	GrossWeight       int        `json:"gross_weight" db:"gross_weight"`
	FuelType          string     `json:"fuel_type" db:"fuel_type"` // diesel, natural_gas, electric
	FuelCapacity      int        `json:"fuel_capacity" db:"fuel_capacity"`
	SleeperType       string     `json:"sleeper_type" db:"sleeper_type"` // day_cab, sleeper
	AxleConfig        string     `json:"axle_config" db:"axle_config"` // single, tandem
	
	// ELD
	ELDProvider       string     `json:"eld_provider,omitempty" db:"eld_provider"`
	ELDDeviceID       string     `json:"eld_device_id,omitempty" db:"eld_device_id"`
	
	// Registration
	LicensePlate      string     `json:"license_plate" db:"license_plate"`
	LicenseState      string     `json:"license_state" db:"license_state"`
	RegistrationExp   *time.Time `json:"registration_exp,omitempty" db:"registration_exp"`
	
	// Insurance
	InsurancePolicy   string     `json:"insurance_policy,omitempty" db:"insurance_policy"`
	InsuranceExp      *time.Time `json:"insurance_exp,omitempty" db:"insurance_exp"`
	
	// Inspections
	LastInspectionDate *time.Time `json:"last_inspection_date,omitempty" db:"last_inspection_date"`
	NextInspectionDate *time.Time `json:"next_inspection_date,omitempty" db:"next_inspection_date"`
	
	// Home Terminal
	HomeTerminalID    *uuid.UUID `json:"home_terminal_id,omitempty" db:"home_terminal_id"`
	
	CreatedAt         time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt         time.Time  `json:"updated_at" db:"updated_at"`
}

// Chassis represents a container chassis
type Chassis struct {
	ID                uuid.UUID       `json:"id" db:"id"`
	ChassisNumber     string          `json:"chassis_number" db:"chassis_number"`
	Status            EquipmentStatus `json:"status" db:"status"`
	
	// Ownership
	OwnerType         string     `json:"owner_type" db:"owner_type"` // company, pool, ssl
	PoolID            *uuid.UUID `json:"pool_id,omitempty" db:"pool_id"`
	PoolName          string     `json:"pool_name,omitempty" db:"pool_name"`
	SteamshipLineID   *uuid.UUID `json:"steamship_line_id,omitempty" db:"steamship_line_id"`
	
	// Specs
	Size              string     `json:"size" db:"size"` // 20, 40, 45, combo
	Type              string     `json:"type" db:"type"` // standard, extendable, tri_axle, gooseneck
	MaxWeight         int        `json:"max_weight" db:"max_weight"`
	TareWeight        int        `json:"tare_weight" db:"tare_weight"`
	NumAxles          int        `json:"num_axles" db:"num_axles"`
	
	// Current State
	CurrentLocationID   *uuid.UUID `json:"current_location_id,omitempty" db:"current_location_id"`
	CurrentLocationType string     `json:"current_location_type" db:"current_location_type"` // terminal, yard, customer, transit
	CurrentTripID       *uuid.UUID `json:"current_trip_id,omitempty" db:"current_trip_id"`
	CurrentContainerID  *uuid.UUID `json:"current_container_id,omitempty" db:"current_container_id"`
	
	// Last Known Position
	LastLatitude      float64    `json:"last_latitude" db:"last_latitude"`
	LastLongitude     float64    `json:"last_longitude" db:"last_longitude"`
	LastPositionTime  *time.Time `json:"last_position_time,omitempty" db:"last_position_time"`
	
	// Registration
	LicensePlate      string     `json:"license_plate,omitempty" db:"license_plate"`
	LicenseState      string     `json:"license_state,omitempty" db:"license_state"`
	RegistrationExp   *time.Time `json:"registration_exp,omitempty" db:"registration_exp"`
	
	// Inspection
	LastInspectionDate *time.Time `json:"last_inspection_date,omitempty" db:"last_inspection_date"`
	FHWAInspectionExp  *time.Time `json:"fhwa_inspection_exp,omitempty" db:"fhwa_inspection_exp"`
	
	CreatedAt         time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt         time.Time  `json:"updated_at" db:"updated_at"`
}

// ChassisPool represents a chassis pool (DCLI, TRAC, etc.)
type ChassisPool struct {
	ID                uuid.UUID `json:"id" db:"id"`
	Name              string    `json:"name" db:"name"`
	Code              string    `json:"code" db:"code"`
	ProviderName      string    `json:"provider_name" db:"provider_name"`
	APIEndpoint       string    `json:"api_endpoint,omitempty" db:"api_endpoint"`
	APIKey            string    `json:"-" db:"api_key"`
	DailyRate20       float64   `json:"daily_rate_20" db:"daily_rate_20"`
	DailyRate40       float64   `json:"daily_rate_40" db:"daily_rate_40"`
	DailyRate45       float64   `json:"daily_rate_45" db:"daily_rate_45"`
	SplitDayRate      float64   `json:"split_day_rate" db:"split_day_rate"`
	CreatedAt         time.Time `json:"created_at" db:"created_at"`
	UpdatedAt         time.Time `json:"updated_at" db:"updated_at"`
}

// ChassisUsage tracks chassis usage for billing
type ChassisUsage struct {
	ID              uuid.UUID  `json:"id" db:"id"`
	ChassisID       uuid.UUID  `json:"chassis_id" db:"chassis_id"`
	TripID          *uuid.UUID `json:"trip_id,omitempty" db:"trip_id"`
	PoolID          *uuid.UUID `json:"pool_id,omitempty" db:"pool_id"`
	PickupTime      time.Time  `json:"pickup_time" db:"pickup_time"`
	PickupLocation  string     `json:"pickup_location" db:"pickup_location"`
	ReturnTime      *time.Time `json:"return_time,omitempty" db:"return_time"`
	ReturnLocation  string     `json:"return_location,omitempty" db:"return_location"`
	UsageDays       int        `json:"usage_days" db:"usage_days"`
	IsSplitDay      bool       `json:"is_split_day" db:"is_split_day"`
	DailyRate       float64    `json:"daily_rate" db:"daily_rate"`
	TotalCost       float64    `json:"total_cost" db:"total_cost"`
	InvoiceID       *uuid.UUID `json:"invoice_id,omitempty" db:"invoice_id"`
	CreatedAt       time.Time  `json:"created_at" db:"created_at"`
}

// Trailer represents a trailer (for non-container moves)
type Trailer struct {
	ID                uuid.UUID       `json:"id" db:"id"`
	TrailerNumber     string          `json:"trailer_number" db:"trailer_number"`
	VIN               string          `json:"vin,omitempty" db:"vin"`
	Type              string          `json:"type" db:"type"` // dry_van, flatbed, reefer, tanker
	Status            EquipmentStatus `json:"status" db:"status"`
	
	// Specs
	Length            int        `json:"length" db:"length"` // feet
	MaxWeight         int        `json:"max_weight" db:"max_weight"`
	TareWeight        int        `json:"tare_weight" db:"tare_weight"`
	
	// For Reefer
	IsReefer          bool       `json:"is_reefer" db:"is_reefer"`
	ReeferUnit        string     `json:"reefer_unit,omitempty" db:"reefer_unit"`
	
	// Current State
	CurrentDriverID   *uuid.UUID `json:"current_driver_id,omitempty" db:"current_driver_id"`
	CurrentTripID     *uuid.UUID `json:"current_trip_id,omitempty" db:"current_trip_id"`
	CurrentLocationID *uuid.UUID `json:"current_location_id,omitempty" db:"current_location_id"`
	
	// Registration
	LicensePlate      string     `json:"license_plate" db:"license_plate"`
	LicenseState      string     `json:"license_state" db:"license_state"`
	RegistrationExp   *time.Time `json:"registration_exp,omitempty" db:"registration_exp"`
	
	CreatedAt         time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt         time.Time  `json:"updated_at" db:"updated_at"`
}

// MaintenanceRecord represents equipment maintenance
type MaintenanceRecord struct {
	ID              uuid.UUID  `json:"id" db:"id"`
	EquipmentType   string     `json:"equipment_type" db:"equipment_type"` // tractor, chassis, trailer
	EquipmentID     uuid.UUID  `json:"equipment_id" db:"equipment_id"`
	Type            string     `json:"type" db:"type"` // preventive, repair, inspection
	Description     string     `json:"description" db:"description"`
	Status          string     `json:"status" db:"status"` // scheduled, in_progress, completed
	ScheduledDate   *time.Time `json:"scheduled_date,omitempty" db:"scheduled_date"`
	CompletedDate   *time.Time `json:"completed_date,omitempty" db:"completed_date"`
	Odometer        int        `json:"odometer" db:"odometer"`
	EngineHours     float64    `json:"engine_hours" db:"engine_hours"`
	VendorName      string     `json:"vendor_name,omitempty" db:"vendor_name"`
	LaborCost       float64    `json:"labor_cost" db:"labor_cost"`
	PartsCost       float64    `json:"parts_cost" db:"parts_cost"`
	TotalCost       float64    `json:"total_cost" db:"total_cost"`
	Notes           string     `json:"notes,omitempty" db:"notes"`
	CreatedBy       string     `json:"created_by" db:"created_by"`
	CreatedAt       time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at" db:"updated_at"`
}

// FuelTransaction represents a fuel purchase
type FuelTransaction struct {
	ID              uuid.UUID `json:"id" db:"id"`
	TractorID       uuid.UUID `json:"tractor_id" db:"tractor_id"`
	DriverID        uuid.UUID `json:"driver_id" db:"driver_id"`
	TripID          *uuid.UUID `json:"trip_id,omitempty" db:"trip_id"`
	TransactionDate time.Time `json:"transaction_date" db:"transaction_date"`
	Location        string    `json:"location" db:"location"`
	FuelType        string    `json:"fuel_type" db:"fuel_type"`
	Gallons         float64   `json:"gallons" db:"gallons"`
	PricePerGallon  float64   `json:"price_per_gallon" db:"price_per_gallon"`
	TotalAmount     float64   `json:"total_amount" db:"total_amount"`
	Odometer        int       `json:"odometer" db:"odometer"`
	PaymentMethod   string    `json:"payment_method" db:"payment_method"` // fuel_card, cash, credit
	CardNumber      string    `json:"card_number,omitempty" db:"card_number"`
	ReceiptNumber   string    `json:"receipt_number,omitempty" db:"receipt_number"`
	CreatedAt       time.Time `json:"created_at" db:"created_at"`
}

// EquipmentInspection represents a DVIR or inspection
type EquipmentInspection struct {
	ID              uuid.UUID `json:"id" db:"id"`
	EquipmentType   string    `json:"equipment_type" db:"equipment_type"`
	EquipmentID     uuid.UUID `json:"equipment_id" db:"equipment_id"`
	DriverID        uuid.UUID `json:"driver_id" db:"driver_id"`
	TripID          *uuid.UUID `json:"trip_id,omitempty" db:"trip_id"`
	InspectionType  string    `json:"inspection_type" db:"inspection_type"` // pre_trip, post_trip
	InspectionDate  time.Time `json:"inspection_date" db:"inspection_date"`
	Odometer        int       `json:"odometer" db:"odometer"`
	Location        string    `json:"location" db:"location"`
	Latitude        float64   `json:"latitude" db:"latitude"`
	Longitude       float64   `json:"longitude" db:"longitude"`
	
	// Inspection Items
	Defects         []InspectionDefect `json:"defects,omitempty"`
	HasDefects      bool      `json:"has_defects" db:"has_defects"`
	IsSafeToOperate bool      `json:"is_safe_to_operate" db:"is_safe_to_operate"`
	
	DriverSignature string    `json:"driver_signature,omitempty" db:"driver_signature"`
	SignedAt        *time.Time `json:"signed_at,omitempty" db:"signed_at"`
	Notes           string    `json:"notes,omitempty" db:"notes"`
	CreatedAt       time.Time `json:"created_at" db:"created_at"`
}

// InspectionDefect represents a defect found during inspection
type InspectionDefect struct {
	ID            uuid.UUID `json:"id" db:"id"`
	InspectionID  uuid.UUID `json:"inspection_id" db:"inspection_id"`
	Category      string    `json:"category" db:"category"` // brakes, tires, lights, etc.
	Description   string    `json:"description" db:"description"`
	Severity      string    `json:"severity" db:"severity"` // minor, major, critical
	PhotoPath     string    `json:"photo_path,omitempty" db:"photo_path"`
	Resolved      bool      `json:"resolved" db:"resolved"`
	ResolvedAt    *time.Time `json:"resolved_at,omitempty" db:"resolved_at"`
	ResolvedBy    string    `json:"resolved_by,omitempty" db:"resolved_by"`
}
