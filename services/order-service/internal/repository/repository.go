package repository

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/draymaster/services/order-service/internal/domain"
)

// ShipmentRepository defines the interface for shipment data access
type ShipmentRepository interface {
	Create(ctx context.Context, shipment *domain.Shipment) error
	GetByID(ctx context.Context, id uuid.UUID) (*domain.Shipment, error)
	GetByReferenceNumber(ctx context.Context, refNum string) (*domain.Shipment, error)
	List(ctx context.Context, filter ShipmentFilter) ([]*domain.Shipment, int64, error)
	Update(ctx context.Context, shipment *domain.Shipment) error
	UpdateStatus(ctx context.Context, id uuid.UUID, status domain.ShipmentStatus) error
	Delete(ctx context.Context, id uuid.UUID) error
}

// ShipmentFilter contains filter criteria for listing shipments
type ShipmentFilter struct {
	Type       domain.ShipmentType
	Status     domain.ShipmentStatus
	CustomerID *uuid.UUID
	TerminalID *uuid.UUID
	LFDBefore  *time.Time
	LFDAfter   *time.Time
	Page       int
	PageSize   int
	SortBy     string
	SortOrder  string
}

// ContainerRepository defines the interface for container data access
type ContainerRepository interface {
	Create(ctx context.Context, container *domain.Container) error
	CreateBatch(ctx context.Context, containers []*domain.Container) error
	GetByID(ctx context.Context, id uuid.UUID) (*domain.Container, error)
	GetByNumber(ctx context.Context, containerNumber string) (*domain.Container, error)
	GetByShipmentID(ctx context.Context, shipmentID uuid.UUID) ([]*domain.Container, error)
	Update(ctx context.Context, container *domain.Container) error
	UpdateStatus(ctx context.Context, id uuid.UUID, customsStatus domain.CustomsStatus, state domain.ContainerState, locationType domain.LocationType) error
	UpdateAvailability(ctx context.Context, id uuid.UUID, availableDate time.Time) error
	Delete(ctx context.Context, id uuid.UUID) error
}

// OrderRepository defines the interface for order data access
type OrderRepository interface {
	Create(ctx context.Context, order *domain.Order) error
	CreateBatch(ctx context.Context, orders []*domain.Order) error
	GetByID(ctx context.Context, id uuid.UUID) (*domain.Order, error)
	GetByOrderNumber(ctx context.Context, orderNumber string) (*domain.Order, error)
	GetByContainerID(ctx context.Context, containerID uuid.UUID) (*domain.Order, error)
	List(ctx context.Context, filter OrderFilter) ([]*domain.Order, int64, error)
	Update(ctx context.Context, order *domain.Order) error
	UpdateStatus(ctx context.Context, id uuid.UUID, status domain.OrderStatus) error
	Delete(ctx context.Context, id uuid.UUID) error
	GetNextOrderNumber(ctx context.Context) (string, error)
}

// OrderFilter contains filter criteria for listing orders
type OrderFilter struct {
	ShipmentID *uuid.UUID
	CustomerID *uuid.UUID
	Status     domain.OrderStatus
	Type       domain.OrderType
	DateFrom   *time.Time
	DateTo     *time.Time
	Page       int
	PageSize   int
}

// LocationRepository defines the interface for location data access
type LocationRepository interface {
	Create(ctx context.Context, location *domain.Location) error
	GetByID(ctx context.Context, id uuid.UUID) (*domain.Location, error)
	List(ctx context.Context, locationType string) ([]*domain.Location, error)
	Update(ctx context.Context, location *domain.Location) error
	Delete(ctx context.Context, id uuid.UUID) error
}

// CustomerRepository defines the interface for customer data access
type CustomerRepository interface {
	Create(ctx context.Context, customer *domain.Customer) error
	GetByID(ctx context.Context, id uuid.UUID) (*domain.Customer, error)
	GetByCode(ctx context.Context, code string) (*domain.Customer, error)
	List(ctx context.Context, customerType string) ([]*domain.Customer, error)
	Update(ctx context.Context, customer *domain.Customer) error
	Delete(ctx context.Context, id uuid.UUID) error
}

// SteamshipLineRepository defines the interface for SSL data access
type SteamshipLineRepository interface {
	Create(ctx context.Context, ssl *domain.SteamshipLine) error
	GetByID(ctx context.Context, id uuid.UUID) (*domain.SteamshipLine, error)
	GetByCode(ctx context.Context, code string) (*domain.SteamshipLine, error)
	List(ctx context.Context) ([]*domain.SteamshipLine, error)
}
