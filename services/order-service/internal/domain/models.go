package domain

import (
	"time"

	"github.com/google/uuid"
)

// ShipmentType represents the type of shipment
type ShipmentType string

const (
	ShipmentTypeImport ShipmentType = "IMPORT"
	ShipmentTypeExport ShipmentType = "EXPORT"
)

// ShipmentStatus represents the status of a shipment
type ShipmentStatus string

const (
	ShipmentStatusPending    ShipmentStatus = "PENDING"
	ShipmentStatusInProgress ShipmentStatus = "IN_PROGRESS"
	ShipmentStatusCompleted  ShipmentStatus = "COMPLETED"
	ShipmentStatusCancelled  ShipmentStatus = "CANCELLED"
)

// ContainerSize represents the size of a container
type ContainerSize string

const (
	ContainerSize20 ContainerSize = "20"
	ContainerSize40 ContainerSize = "40"
	ContainerSize45 ContainerSize = "45"
)

// ContainerType represents the type of container
type ContainerType string

const (
	ContainerTypeDry      ContainerType = "DRY"
	ContainerTypeHighCube ContainerType = "HIGH_CUBE"
	ContainerTypeReefer   ContainerType = "REEFER"
	ContainerTypeTank     ContainerType = "TANK"
	ContainerTypeFlatRack ContainerType = "FLAT_RACK"
	ContainerTypeOpenTop  ContainerType = "OPEN_TOP"
)

// ContainerState represents the current state of a container
type ContainerState string

const (
	ContainerStateLoaded ContainerState = "LOADED"
	ContainerStateEmpty  ContainerState = "EMPTY"
)

// CustomsStatus represents the customs clearance status
type CustomsStatus string

const (
	CustomsStatusPending  CustomsStatus = "PENDING"
	CustomsStatusHold     CustomsStatus = "HOLD"
	CustomsStatusReleased CustomsStatus = "RELEASED"
)

// LocationType represents where a container currently is
type LocationType string

const (
	LocationTypeVessel    LocationType = "VESSEL"
	LocationTypeTerminal  LocationType = "TERMINAL"
	LocationTypeInTransit LocationType = "IN_TRANSIT"
	LocationTypeCustomer  LocationType = "CUSTOMER"
	LocationTypeYard      LocationType = "YARD"
)

// OrderType represents the type of order
type OrderType string

const (
	OrderTypeImport      OrderType = "IMPORT"
	OrderTypeExport      OrderType = "EXPORT"
	OrderTypeRepo        OrderType = "REPO"
	OrderTypeEmptyReturn OrderType = "EMPTY_RETURN"
)

// OrderStatus represents the status of an order
type OrderStatus string

const (
	OrderStatusPending    OrderStatus = "PENDING"
	OrderStatusReady      OrderStatus = "READY"
	OrderStatusDispatched OrderStatus = "DISPATCHED"
	OrderStatusInProgress OrderStatus = "IN_PROGRESS"
	OrderStatusDelivered  OrderStatus = "DELIVERED"
	OrderStatusCompleted  OrderStatus = "COMPLETED"
	OrderStatusHold       OrderStatus = "HOLD"
	OrderStatusCancelled  OrderStatus = "CANCELLED"
	OrderStatusFailed     OrderStatus = "FAILED"
)

// BillingStatus represents the billing status of an order
type BillingStatus string

const (
	BillingStatusUnbilled BillingStatus = "UNBILLED"
	BillingStatusBilled   BillingStatus = "BILLED"
	BillingStatusPaid     BillingStatus = "PAID"
)

// Shipment represents a BOL (import) or Booking (export)
type Shipment struct {
	ID                    uuid.UUID      `json:"id" db:"id"`
	Type                  ShipmentType   `json:"type" db:"type"`
	ReferenceNumber       string         `json:"reference_number" db:"reference_number"`
	CustomerID            uuid.UUID      `json:"customer_id" db:"customer_id"`
	CustomerName          string         `json:"customer_name,omitempty"`
	SteamshipLineID       uuid.UUID      `json:"steamship_line_id" db:"steamship_line_id"`
	SteamshipLineName     string         `json:"steamship_line_name,omitempty"`
	PortID                uuid.UUID      `json:"port_id" db:"port_id"`
	TerminalID            uuid.UUID      `json:"terminal_id" db:"terminal_id"`
	TerminalName          string         `json:"terminal_name,omitempty"`
	VesselName            string         `json:"vessel_name" db:"vessel_name"`
	VoyageNumber          string         `json:"voyage_number" db:"voyage_number"`
	VesselETA             *time.Time     `json:"vessel_eta,omitempty" db:"vessel_eta"`
	VesselATA             *time.Time     `json:"vessel_ata,omitempty" db:"vessel_ata"`
	LastFreeDay           *time.Time     `json:"last_free_day,omitempty" db:"last_free_day"`
	PortCutoff            *time.Time     `json:"port_cutoff,omitempty" db:"port_cutoff"`
	DocCutoff             *time.Time     `json:"doc_cutoff,omitempty" db:"doc_cutoff"`
	EarliestReturnDate    *time.Time     `json:"earliest_return_date,omitempty" db:"earliest_return_date"`
	ConsigneeID           *uuid.UUID     `json:"consignee_id,omitempty" db:"consignee_id"`
	ShipperID             *uuid.UUID     `json:"shipper_id,omitempty" db:"shipper_id"`
	EmptyReturnLocationID *uuid.UUID     `json:"empty_return_location_id,omitempty" db:"empty_return_location_id"`
	EmptyPickupLocationID *uuid.UUID     `json:"empty_pickup_location_id,omitempty" db:"empty_pickup_location_id"`
	Status                ShipmentStatus `json:"status" db:"status"`
	SpecialInstructions   string         `json:"special_instructions,omitempty" db:"special_instructions"`
	TotalContainers       int            `json:"total_containers"`
	CompletedContainers   int            `json:"completed_containers"`
	CreatedAt             time.Time      `json:"created_at" db:"created_at"`
	UpdatedAt             time.Time      `json:"updated_at" db:"updated_at"`

	// Associations
	Containers []Container `json:"containers,omitempty"`
	Consignee  *Location   `json:"consignee,omitempty"`
	Shipper    *Location   `json:"shipper,omitempty"`
}

// DaysUntilLFD calculates days until Last Free Day
func (s *Shipment) DaysUntilLFD() int {
	if s.LastFreeDay == nil {
		return -1
	}
	now := time.Now().Truncate(24 * time.Hour)
	lfd := s.LastFreeDay.Truncate(24 * time.Hour)
	return int(lfd.Sub(now).Hours() / 24)
}

// Container represents a shipping container
type Container struct {
	ID                    uuid.UUID      `json:"id" db:"id"`
	ShipmentID            uuid.UUID      `json:"shipment_id" db:"shipment_id"`
	ContainerNumber       string         `json:"container_number" db:"container_number"`
	Size                  ContainerSize  `json:"size" db:"size"`
	Type                  ContainerType  `json:"type" db:"type"`
	SealNumber            string         `json:"seal_number,omitempty" db:"seal_number"`
	WeightLbs             int            `json:"weight_lbs" db:"weight_lbs"`
	IsHazmat              bool           `json:"is_hazmat" db:"is_hazmat"`
	HazmatClass           string         `json:"hazmat_class,omitempty" db:"hazmat_class"`
	UNNumber              string         `json:"un_number,omitempty" db:"un_number"`
	IsOverweight          bool           `json:"is_overweight" db:"is_overweight"`
	IsReefer              bool           `json:"is_reefer" db:"is_reefer"`
	ReeferTempSetpoint    *float64       `json:"reefer_temp_setpoint,omitempty" db:"reefer_temp_setpoint"`
	Commodity             string         `json:"commodity,omitempty" db:"commodity"`
	CustomsStatus         CustomsStatus  `json:"customs_status" db:"customs_status"`
	CustomsHoldType       string         `json:"customs_hold_type,omitempty" db:"customs_hold_type"`
	TerminalAvailableDate *time.Time     `json:"terminal_available_date,omitempty" db:"terminal_available_date"`
	CurrentState          ContainerState `json:"current_state" db:"current_state"`
	CurrentLocationType   LocationType   `json:"current_location_type" db:"current_location_type"`
	CurrentLocationID     *uuid.UUID     `json:"current_location_id,omitempty" db:"current_location_id"`
	CreatedAt             time.Time      `json:"created_at" db:"created_at"`
	UpdatedAt             time.Time      `json:"updated_at" db:"updated_at"`
}

// IsAvailable checks if container is available for pickup
func (c *Container) IsAvailable() bool {
	return c.CustomsStatus == CustomsStatusReleased &&
		c.TerminalAvailableDate != nil &&
		c.CurrentLocationType == LocationTypeTerminal
}

// Order represents a load order for a container
type Order struct {
	ID                    uuid.UUID     `json:"id" db:"id"`
	OrderNumber           string        `json:"order_number" db:"order_number"`
	ContainerID           uuid.UUID     `json:"container_id" db:"container_id"`
	ShipmentID            uuid.UUID     `json:"shipment_id" db:"shipment_id"`
	Type                  OrderType     `json:"type" db:"type"`
	MoveType              string        `json:"move_type,omitempty" db:"move_type"`
	CustomerReference     string        `json:"customer_reference,omitempty" db:"customer_reference"`
	PickupLocationID      *uuid.UUID    `json:"pickup_location_id,omitempty" db:"pickup_location_id"`
	DeliveryLocationID    *uuid.UUID    `json:"delivery_location_id,omitempty" db:"delivery_location_id"`
	ReturnLocationID      *uuid.UUID    `json:"return_location_id,omitempty" db:"return_location_id"`
	RequestedPickupDate   *time.Time    `json:"requested_pickup_date,omitempty" db:"requested_pickup_date"`
	RequestedDeliveryDate *time.Time    `json:"requested_delivery_date,omitempty" db:"requested_delivery_date"`
	Status                OrderStatus   `json:"status" db:"status"`
	BillingStatus         BillingStatus `json:"billing_status" db:"billing_status"`
	LinkedOrderID         *uuid.UUID    `json:"linked_order_id,omitempty" db:"linked_order_id"`
	SpecialInstructions   string        `json:"special_instructions,omitempty" db:"special_instructions"`
	CreatedAt             time.Time     `json:"created_at" db:"created_at"`
	UpdatedAt             time.Time     `json:"updated_at" db:"updated_at"`

	// Associations
	Container        *Container `json:"container,omitempty"`
	PickupLocation   *Location  `json:"pickup_location,omitempty"`
	DeliveryLocation *Location  `json:"delivery_location,omitempty"`
	ReturnLocation   *Location  `json:"return_location,omitempty"`
}

// Location represents a facility/terminal/yard
type Location struct {
	ID           uuid.UUID `json:"id" db:"id"`
	Name         string    `json:"name" db:"name"`
	Type         string    `json:"type" db:"type"` // terminal, warehouse, yard, etc.
	Address      string    `json:"address" db:"address"`
	City         string    `json:"city" db:"city"`
	State        string    `json:"state" db:"state"`
	Zip          string    `json:"zip" db:"zip"`
	Latitude     float64   `json:"latitude" db:"latitude"`
	Longitude    float64   `json:"longitude" db:"longitude"`
	ContactName  string    `json:"contact_name,omitempty" db:"contact_name"`
	ContactPhone string    `json:"contact_phone,omitempty" db:"contact_phone"`
	Notes        string    `json:"notes,omitempty" db:"notes"`
	CreatedAt    time.Time `json:"created_at" db:"created_at"`
	UpdatedAt    time.Time `json:"updated_at" db:"updated_at"`
}

// Customer represents a customer/shipper/consignee
type Customer struct {
	ID        uuid.UUID `json:"id" db:"id"`
	Name      string    `json:"name" db:"name"`
	Code      string    `json:"code" db:"code"`
	Type      string    `json:"type" db:"type"` // shipper, consignee, both
	Address   string    `json:"address,omitempty" db:"address"`
	City      string    `json:"city,omitempty" db:"city"`
	State     string    `json:"state,omitempty" db:"state"`
	Zip       string    `json:"zip,omitempty" db:"zip"`
	Phone     string    `json:"phone,omitempty" db:"phone"`
	Email     string    `json:"email,omitempty" db:"email"`
	CreatedAt time.Time `json:"created_at" db:"created_at"`
	UpdatedAt time.Time `json:"updated_at" db:"updated_at"`
}

// SteamshipLine represents a shipping line
type SteamshipLine struct {
	ID        uuid.UUID `json:"id" db:"id"`
	Name      string    `json:"name" db:"name"`
	Code      string    `json:"code" db:"code"` // SCAC code
	CreatedAt time.Time `json:"created_at" db:"created_at"`
	UpdatedAt time.Time `json:"updated_at" db:"updated_at"`
}
