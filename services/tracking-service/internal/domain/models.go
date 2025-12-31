package domain

import (
	"time"

	"github.com/google/uuid"
)

// MilestoneType represents the type of tracking milestone
type MilestoneType string

const (
	MilestoneTripStarted     MilestoneType = "TRIP_STARTED"
	MilestoneDepartedOrigin  MilestoneType = "DEPARTED_ORIGIN"
	MilestoneArrivedStop     MilestoneType = "ARRIVED_STOP"
	MilestoneDepartedStop    MilestoneType = "DEPARTED_STOP"
	MilestoneGateIn          MilestoneType = "GATE_IN"
	MilestoneGateOut         MilestoneType = "GATE_OUT"
	MilestoneLoaded          MilestoneType = "LOADED"
	MilestoneUnloaded        MilestoneType = "UNLOADED"
	MilestoneDelivered       MilestoneType = "DELIVERED"
	MilestoneTripCompleted   MilestoneType = "TRIP_COMPLETED"
	MilestoneException       MilestoneType = "EXCEPTION"
)

// LocationRecord represents a GPS location point
type LocationRecord struct {
	ID             uuid.UUID `json:"id" db:"id"`
	DriverID       uuid.UUID `json:"driver_id" db:"driver_id"`
	TractorID      *uuid.UUID `json:"tractor_id,omitempty" db:"tractor_id"`
	TripID         *uuid.UUID `json:"trip_id,omitempty" db:"trip_id"`
	Latitude       float64   `json:"latitude" db:"latitude"`
	Longitude      float64   `json:"longitude" db:"longitude"`
	SpeedMPH       float64   `json:"speed_mph" db:"speed_mph"`
	Heading        float64   `json:"heading" db:"heading"`
	AccuracyMeters float64   `json:"accuracy_meters" db:"accuracy_meters"`
	Source         string    `json:"source" db:"source"` // eld, mobile, gps
	RecordedAt     time.Time `json:"recorded_at" db:"recorded_at"`
	ReceivedAt     time.Time `json:"received_at" db:"received_at"`
}

// CurrentLocation represents real-time driver/asset location
type CurrentLocation struct {
	DriverID            uuid.UUID  `json:"driver_id"`
	DriverName          string     `json:"driver_name"`
	TractorID           *uuid.UUID `json:"tractor_id,omitempty"`
	TractorUnit         string     `json:"tractor_unit,omitempty"`
	TripID              *uuid.UUID `json:"trip_id,omitempty"`
	TripNumber          string     `json:"trip_number,omitempty"`
	Latitude            float64    `json:"latitude"`
	Longitude           float64    `json:"longitude"`
	SpeedMPH            float64    `json:"speed_mph"`
	Heading             float64    `json:"heading"`
	Status              string     `json:"status"` // moving, stopped, idle
	CurrentStopName     string     `json:"current_stop_name,omitempty"`
	CurrentStopSequence int        `json:"current_stop_sequence"`
	LastUpdate          time.Time  `json:"last_update"`
}

// Milestone represents a tracking milestone event
type Milestone struct {
	ID              uuid.UUID         `json:"id" db:"id"`
	TripID          uuid.UUID         `json:"trip_id" db:"trip_id"`
	StopID          *uuid.UUID        `json:"stop_id,omitempty" db:"stop_id"`
	Type            MilestoneType     `json:"type" db:"type"`
	OccurredAt      time.Time         `json:"occurred_at" db:"occurred_at"`
	Latitude        float64           `json:"latitude" db:"latitude"`
	Longitude       float64           `json:"longitude" db:"longitude"`
	LocationID      *uuid.UUID        `json:"location_id,omitempty" db:"location_id"`
	LocationName    string            `json:"location_name,omitempty" db:"location_name"`
	ContainerID     *uuid.UUID        `json:"container_id,omitempty" db:"container_id"`
	ContainerNumber string            `json:"container_number,omitempty" db:"container_number"`
	Metadata        map[string]string `json:"metadata,omitempty"`
	Source          string            `json:"source" db:"source"` // auto, manual, geofence
	RecordedBy      string            `json:"recorded_by,omitempty" db:"recorded_by"`
	CreatedAt       time.Time         `json:"created_at" db:"created_at"`
}

// Geofence represents a geographic boundary
type Geofence struct {
	ID              uuid.UUID    `json:"id" db:"id"`
	LocationID      uuid.UUID    `json:"location_id" db:"location_id"`
	Name            string       `json:"name" db:"name"`
	Type            string       `json:"type" db:"type"` // circle, polygon
	CenterLatitude  float64      `json:"center_latitude" db:"center_latitude"`
	CenterLongitude float64      `json:"center_longitude" db:"center_longitude"`
	RadiusMeters    float64      `json:"radius_meters" db:"radius_meters"`
	Polygon         []Coordinate `json:"polygon,omitempty"`
	IsActive        bool         `json:"is_active" db:"is_active"`
	CreatedAt       time.Time    `json:"created_at" db:"created_at"`
	UpdatedAt       time.Time    `json:"updated_at" db:"updated_at"`
}

// Coordinate represents a lat/lon point
type Coordinate struct {
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
}

// TripETA represents ETA information for a trip
type TripETA struct {
	TripID            uuid.UUID         `json:"trip_id"`
	Stops             []StopETA         `json:"stops"`
	CalculatedAt      time.Time         `json:"calculated_at"`
	TrafficConditions string            `json:"traffic_conditions"`
}

// StopETA represents ETA for a specific stop
type StopETA struct {
	StopID           uuid.UUID  `json:"stop_id"`
	Sequence         int        `json:"sequence"`
	LocationName     string     `json:"location_name"`
	ScheduledTime    *time.Time `json:"scheduled_time,omitempty"`
	EstimatedArrival time.Time  `json:"estimated_arrival"`
	VarianceMins     int        `json:"variance_mins"` // positive = late
	RemainingMiles   float64    `json:"remaining_miles"`
	RemainingMins    int        `json:"remaining_mins"`
	Status           string     `json:"status"` // on_time, at_risk, late
}

// ContainerLocation represents container tracking info
type ContainerLocation struct {
	ContainerID     uuid.UUID  `json:"container_id"`
	ContainerNumber string     `json:"container_number"`
	LocationType    string     `json:"location_type"` // vessel, terminal, transit, customer, yard
	LocationID      *uuid.UUID `json:"location_id,omitempty"`
	LocationName    string     `json:"location_name"`
	Latitude        float64    `json:"latitude"`
	Longitude       float64    `json:"longitude"`
	Status          string     `json:"status"`
	LastUpdate      time.Time  `json:"last_update"`
	CurrentTripID   *uuid.UUID `json:"current_trip_id,omitempty"`
	DriverName      string     `json:"driver_name,omitempty"`
}

// ContainerEvent represents a container tracking event
type ContainerEvent struct {
	Timestamp    time.Time `json:"timestamp"`
	EventType    string    `json:"event_type"`
	LocationType string    `json:"location_type"`
	LocationName string    `json:"location_name"`
	Latitude     float64   `json:"latitude"`
	Longitude    float64   `json:"longitude"`
	Details      string    `json:"details,omitempty"`
}

// GeofenceEvent represents an entry/exit event
type GeofenceEvent struct {
	GeofenceID   uuid.UUID `json:"geofence_id"`
	GeofenceName string    `json:"geofence_name"`
	LocationID   uuid.UUID `json:"location_id"`
	DriverID     uuid.UUID `json:"driver_id"`
	TripID       *uuid.UUID `json:"trip_id,omitempty"`
	EventType    string    `json:"event_type"` // enter, exit
	OccurredAt   time.Time `json:"occurred_at"`
	Latitude     float64   `json:"latitude"`
	Longitude    float64   `json:"longitude"`
}
