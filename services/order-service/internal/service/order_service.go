package service

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/draymaster/services/order-service/internal/domain"
	"github.com/draymaster/services/order-service/internal/repository"
	"github.com/draymaster/shared/pkg/kafka"
	"github.com/draymaster/shared/pkg/logger"
)

// OrderService handles business logic for orders
type OrderService struct {
	shipmentRepo  repository.ShipmentRepository
	containerRepo repository.ContainerRepository
	orderRepo     repository.OrderRepository
	locationRepo  repository.LocationRepository
	eventProducer *kafka.Producer
	logger        *logger.Logger
}

// NewOrderService creates a new order service
func NewOrderService(
	shipmentRepo repository.ShipmentRepository,
	containerRepo repository.ContainerRepository,
	orderRepo repository.OrderRepository,
	locationRepo repository.LocationRepository,
	eventProducer *kafka.Producer,
	log *logger.Logger,
) *OrderService {
	return &OrderService{
		shipmentRepo:  shipmentRepo,
		containerRepo: containerRepo,
		orderRepo:     orderRepo,
		locationRepo:  locationRepo,
		eventProducer: eventProducer,
		logger:        log,
	}
}

// CreateShipmentInput contains input for creating a shipment
type CreateShipmentInput struct {
	Type                  domain.ShipmentType
	ReferenceNumber       string
	CustomerID            uuid.UUID
	SteamshipLineID       uuid.UUID
	PortID                uuid.UUID
	TerminalID            uuid.UUID
	VesselName            string
	VoyageNumber          string
	VesselETA             *time.Time
	LastFreeDay           *time.Time
	PortCutoff            *time.Time
	DocCutoff             *time.Time
	EarliestReturnDate    *time.Time
	ConsigneeID           *uuid.UUID
	ShipperID             *uuid.UUID
	EmptyReturnLocationID *uuid.UUID
	EmptyPickupLocationID *uuid.UUID
	SpecialInstructions   string
	Containers            []CreateContainerInput
}

// CreateContainerInput contains input for creating a container
type CreateContainerInput struct {
	ContainerNumber    string
	Size               domain.ContainerSize
	Type               domain.ContainerType
	SealNumber         string
	WeightLbs          int
	IsHazmat           bool
	HazmatClass        string
	UNNumber           string
	ReeferTempSetpoint *float64
	Commodity          string
}

// CreateShipment creates a new shipment with containers
func (s *OrderService) CreateShipment(ctx context.Context, input CreateShipmentInput) (*domain.Shipment, error) {
	s.logger.Infow("Creating shipment",
		"type", input.Type,
		"reference", input.ReferenceNumber,
		"containers", len(input.Containers),
	)

	// Validate input
	if input.ReferenceNumber == "" {
		return nil, fmt.Errorf("reference number is required")
	}

	// Create shipment
	shipment := &domain.Shipment{
		ID:                    uuid.New(),
		Type:                  input.Type,
		ReferenceNumber:       input.ReferenceNumber,
		CustomerID:            input.CustomerID,
		SteamshipLineID:       input.SteamshipLineID,
		PortID:                input.PortID,
		TerminalID:            input.TerminalID,
		VesselName:            input.VesselName,
		VoyageNumber:          input.VoyageNumber,
		VesselETA:             input.VesselETA,
		LastFreeDay:           input.LastFreeDay,
		PortCutoff:            input.PortCutoff,
		DocCutoff:             input.DocCutoff,
		EarliestReturnDate:    input.EarliestReturnDate,
		ConsigneeID:           input.ConsigneeID,
		ShipperID:             input.ShipperID,
		EmptyReturnLocationID: input.EmptyReturnLocationID,
		EmptyPickupLocationID: input.EmptyPickupLocationID,
		Status:                domain.ShipmentStatusPending,
		SpecialInstructions:   input.SpecialInstructions,
	}

	if err := s.shipmentRepo.Create(ctx, shipment); err != nil {
		return nil, fmt.Errorf("failed to create shipment: %w", err)
	}

	// Create containers if provided
	if len(input.Containers) > 0 {
		containers := make([]*domain.Container, len(input.Containers))
		for i, c := range input.Containers {
			containers[i] = &domain.Container{
				ID:                 uuid.New(),
				ShipmentID:         shipment.ID,
				ContainerNumber:    c.ContainerNumber,
				Size:               c.Size,
				Type:               c.Type,
				SealNumber:         c.SealNumber,
				WeightLbs:          c.WeightLbs,
				IsHazmat:           c.IsHazmat,
				HazmatClass:        c.HazmatClass,
				UNNumber:           c.UNNumber,
				IsOverweight:       c.WeightLbs > 44000,
				IsReefer:           c.Type == domain.ContainerTypeReefer,
				ReeferTempSetpoint: c.ReeferTempSetpoint,
				Commodity:          c.Commodity,
				CustomsStatus:      domain.CustomsStatusPending,
				CurrentState:       domain.ContainerStateLoaded,
				CurrentLocationType: domain.LocationTypeVessel,
			}
		}

		if err := s.containerRepo.CreateBatch(ctx, containers); err != nil {
			return nil, fmt.Errorf("failed to create containers: %w", err)
		}

		shipment.Containers = make([]domain.Container, len(containers))
		for i, c := range containers {
			shipment.Containers[i] = *c
		}
	}

	// Publish event
	event := kafka.NewEvent(kafka.Topics.ShipmentCreated, "order-service", map[string]interface{}{
		"shipment_id":      shipment.ID.String(),
		"reference_number": shipment.ReferenceNumber,
		"type":             shipment.Type,
		"container_count":  len(input.Containers),
	})
	
	if err := s.eventProducer.Publish(ctx, kafka.Topics.ShipmentCreated, event); err != nil {
		s.logger.Warnw("Failed to publish shipment created event", "error", err)
	}

	s.logger.Infow("Shipment created successfully",
		"shipment_id", shipment.ID,
		"reference", shipment.ReferenceNumber,
	)

	return shipment, nil
}

// GetShipment retrieves a shipment by ID with containers
func (s *OrderService) GetShipment(ctx context.Context, id uuid.UUID) (*domain.Shipment, error) {
	shipment, err := s.shipmentRepo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	// Load containers
	containers, err := s.containerRepo.GetByShipmentID(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("failed to load containers: %w", err)
	}

	shipment.Containers = make([]domain.Container, len(containers))
	for i, c := range containers {
		shipment.Containers[i] = *c
	}

	return shipment, nil
}

// ListShipments retrieves shipments based on filter
func (s *OrderService) ListShipments(ctx context.Context, filter repository.ShipmentFilter) ([]*domain.Shipment, int64, error) {
	return s.shipmentRepo.List(ctx, filter)
}

// AddContainers adds containers to an existing shipment
func (s *OrderService) AddContainers(ctx context.Context, shipmentID uuid.UUID, inputs []CreateContainerInput) ([]*domain.Container, error) {
	// Verify shipment exists
	_, err := s.shipmentRepo.GetByID(ctx, shipmentID)
	if err != nil {
		return nil, err
	}

	containers := make([]*domain.Container, len(inputs))
	for i, c := range inputs {
		containers[i] = &domain.Container{
			ID:                 uuid.New(),
			ShipmentID:         shipmentID,
			ContainerNumber:    c.ContainerNumber,
			Size:               c.Size,
			Type:               c.Type,
			SealNumber:         c.SealNumber,
			WeightLbs:          c.WeightLbs,
			IsHazmat:           c.IsHazmat,
			HazmatClass:        c.HazmatClass,
			UNNumber:           c.UNNumber,
			IsOverweight:       c.WeightLbs > 44000,
			IsReefer:           c.Type == domain.ContainerTypeReefer,
			ReeferTempSetpoint: c.ReeferTempSetpoint,
			Commodity:          c.Commodity,
			CustomsStatus:      domain.CustomsStatusPending,
			CurrentState:       domain.ContainerStateLoaded,
			CurrentLocationType: domain.LocationTypeVessel,
		}
	}

	if err := s.containerRepo.CreateBatch(ctx, containers); err != nil {
		return nil, fmt.Errorf("failed to create containers: %w", err)
	}

	// Publish event
	event := kafka.NewEvent(kafka.Topics.ContainerAdded, "order-service", map[string]interface{}{
		"shipment_id":     shipmentID.String(),
		"container_count": len(containers),
	})
	_ = s.eventProducer.Publish(ctx, kafka.Topics.ContainerAdded, event)

	return containers, nil
}

// GenerateOrdersFromShipment creates orders for all containers in a shipment
func (s *OrderService) GenerateOrdersFromShipment(ctx context.Context, shipmentID uuid.UUID) ([]*domain.Order, error) {
	shipment, err := s.GetShipment(ctx, shipmentID)
	if err != nil {
		return nil, err
	}

	orders := make([]*domain.Order, 0, len(shipment.Containers))

	for _, container := range shipment.Containers {
		// Check if order already exists
		existing, _ := s.orderRepo.GetByContainerID(ctx, container.ID)
		if existing != nil {
			continue // Skip if order exists
		}

		// Generate order number
		orderNumber, err := s.orderRepo.GetNextOrderNumber(ctx)
		if err != nil {
			return nil, fmt.Errorf("failed to generate order number: %w", err)
		}

		// Determine order type based on shipment type
		orderType := domain.OrderTypeImport
		if shipment.Type == domain.ShipmentTypeExport {
			orderType = domain.OrderTypeExport
		}

		order := &domain.Order{
			ID:                  uuid.New(),
			OrderNumber:         orderNumber,
			ContainerID:         container.ID,
			ShipmentID:          shipmentID,
			Type:                orderType,
			PickupLocationID:    &shipment.TerminalID,
			DeliveryLocationID:  shipment.ConsigneeID,
			ReturnLocationID:    shipment.EmptyReturnLocationID,
			Status:              domain.OrderStatusPending,
			BillingStatus:       domain.BillingStatusUnbilled,
			SpecialInstructions: shipment.SpecialInstructions,
		}

		if err := s.orderRepo.Create(ctx, order); err != nil {
			return nil, fmt.Errorf("failed to create order: %w", err)
		}

		orders = append(orders, order)

		// Publish event
		event := kafka.NewEvent(kafka.Topics.OrderCreated, "order-service", map[string]interface{}{
			"order_id":         order.ID.String(),
			"order_number":     order.OrderNumber,
			"container_number": container.ContainerNumber,
			"shipment_id":      shipmentID.String(),
		})
		_ = s.eventProducer.Publish(ctx, kafka.Topics.OrderCreated, event)
	}

	s.logger.Infow("Orders generated",
		"shipment_id", shipmentID,
		"order_count", len(orders),
	)

	return orders, nil
}

// GetOrder retrieves an order by ID
func (s *OrderService) GetOrder(ctx context.Context, id uuid.UUID) (*domain.Order, error) {
	order, err := s.orderRepo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	// Load container
	if order.ContainerID != uuid.Nil {
		container, err := s.containerRepo.GetByID(ctx, order.ContainerID)
		if err == nil {
			order.Container = container
		}
	}

	return order, nil
}

// UpdateOrderStatus updates the status of an order
func (s *OrderService) UpdateOrderStatus(ctx context.Context, id uuid.UUID, status domain.OrderStatus, reason string) error {
	if err := s.orderRepo.UpdateStatus(ctx, id, status); err != nil {
		return err
	}

	// Publish event
	event := kafka.NewEvent(kafka.Topics.OrderStatusChanged, "order-service", map[string]interface{}{
		"order_id":   id.String(),
		"new_status": status,
		"reason":     reason,
	})
	_ = s.eventProducer.Publish(ctx, kafka.Topics.OrderStatusChanged, event)

	return nil
}

// CheckContainerAvailability checks if containers are available for pickup
func (s *OrderService) CheckContainerAvailability(ctx context.Context, containerIDs []uuid.UUID) ([]ContainerAvailabilityResult, error) {
	results := make([]ContainerAvailabilityResult, len(containerIDs))

	for i, id := range containerIDs {
		container, err := s.containerRepo.GetByID(ctx, id)
		if err != nil {
			results[i] = ContainerAvailabilityResult{
				ContainerID: id,
				Available:   false,
				Reason:      "Container not found",
			}
			continue
		}

		available := container.IsAvailable()
		reason := ""
		if !available {
			if container.CustomsStatus == domain.CustomsStatusHold {
				reason = fmt.Sprintf("Customs hold: %s", container.CustomsHoldType)
			} else if container.CustomsStatus == domain.CustomsStatusPending {
				reason = "Customs clearance pending"
			} else if container.TerminalAvailableDate == nil {
				reason = "Not yet discharged from vessel"
			} else {
				reason = "Not available at terminal"
			}
		}

		results[i] = ContainerAvailabilityResult{
			ContainerID:     id,
			ContainerNumber: container.ContainerNumber,
			Available:       available,
			Reason:          reason,
			AvailableDate:   container.TerminalAvailableDate,
		}
	}

	return results, nil
}

// ContainerAvailabilityResult contains availability check result
type ContainerAvailabilityResult struct {
	ContainerID     uuid.UUID  `json:"container_id"`
	ContainerNumber string     `json:"container_number"`
	Available       bool       `json:"available"`
	Reason          string     `json:"reason,omitempty"`
	AvailableDate   *time.Time `json:"available_date,omitempty"`
}
