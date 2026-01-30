package service

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/draymaster/services/order-service/internal/domain"
	"github.com/draymaster/services/order-service/internal/repository"
	apperrors "github.com/draymaster/shared/pkg/errors"
	"github.com/draymaster/shared/pkg/validation"
	"github.com/draymaster/shared/pkg/database"
	"github.com/draymaster/shared/pkg/kafka"
	"github.com/draymaster/shared/pkg/logger"
)

// OrderCRUDService provides comprehensive CRUD operations for orders
type OrderCRUDService struct {
	db            *database.DB
	orderRepo     repository.OrderRepository
	containerRepo repository.ContainerRepository
	shipmentRepo  repository.ShipmentRepository
	eventProducer *kafka.Producer
	logger        *logger.Logger
	validator     *validation.StringValidator
}

// NewOrderCRUDService creates a new order CRUD service
func NewOrderCRUDService(
	db *database.DB,
	orderRepo repository.OrderRepository,
	containerRepo repository.ContainerRepository,
	shipmentRepo repository.ShipmentRepository,
	eventProducer *kafka.Producer,
	log *logger.Logger,
) *OrderCRUDService {
	return &OrderCRUDService{
		db:            db,
		orderRepo:     orderRepo,
		containerRepo: containerRepo,
		shipmentRepo:  shipmentRepo,
		eventProducer: eventProducer,
		logger:        log,
		validator:     validation.NewStringValidator(),
	}
}

// CreateOrderInput contains input for creating an order
type CreateOrderInput struct {
	OrderNumber           string
	ContainerID           uuid.UUID
	ShipmentID            uuid.UUID
	Type                  domain.OrderType
	MoveType              string
	CustomerReference     string
	PickupLocationID      *uuid.UUID
	DeliveryLocationID    *uuid.UUID
	ReturnLocationID      *uuid.UUID
	RequestedPickupDate   *time.Time
	RequestedDeliveryDate *time.Time
	SpecialInstructions   string
	CreatedBy             string
}

// CreateOrder creates a new order with validation
func (s *OrderCRUDService) CreateOrder(ctx context.Context, input CreateOrderInput) (*domain.Order, error) {
	s.logger.Infow("Creating order",
		"type", input.Type,
		"container_id", input.ContainerID,
	)

	// Validate input
	if err := s.validateCreateOrderInput(input); err != nil {
		return nil, err
	}

	// Verify container exists and is not already assigned
	container, err := s.containerRepo.GetByID(ctx, input.ContainerID)
	if err != nil {
		return nil, apperrors.NotFoundError("container", input.ContainerID.String())
	}

	// Check for existing order
	existing, _ := s.orderRepo.GetByContainerID(ctx, input.ContainerID)
	if existing != nil {
		return nil, apperrors.ConflictError(
			fmt.Sprintf("container already has order: %s", existing.OrderNumber),
		)
	}

	// Generate order number if not provided
	orderNumber := input.OrderNumber
	if orderNumber == "" {
		orderNumber, err = s.orderRepo.GetNextOrderNumber(ctx)
		if err != nil {
			return nil, apperrors.DatabaseError("generate order number", err)
		}
	}

	// Create order
	order := &domain.Order{
		ID:                    uuid.New(),
		OrderNumber:           orderNumber,
		ContainerID:           input.ContainerID,
		ShipmentID:            input.ShipmentID,
		Type:                  input.Type,
		MoveType:              input.MoveType,
		CustomerReference:     input.CustomerReference,
		PickupLocationID:      input.PickupLocationID,
		DeliveryLocationID:    input.DeliveryLocationID,
		ReturnLocationID:      input.ReturnLocationID,
		RequestedPickupDate:   input.RequestedPickupDate,
		RequestedDeliveryDate: input.RequestedDeliveryDate,
		Status:                domain.OrderStatusPending,
		BillingStatus:         domain.BillingStatusUnbilled,
		SpecialInstructions:   input.SpecialInstructions,
		CreatedAt:             time.Now(),
		UpdatedAt:             time.Now(),
	}

	if err := s.orderRepo.Create(ctx, order); err != nil {
		return nil, apperrors.DatabaseError("create order", err)
	}

	// Attach container
	order.Container = container

	// Publish event
	event := kafka.NewEvent(kafka.Topics.OrderCreated, "order-service", map[string]interface{}{
		"order_id":         order.ID.String(),
		"order_number":     order.OrderNumber,
		"container_number": container.ContainerNumber,
		"type":             order.Type,
	})
	_ = s.eventProducer.Publish(ctx, kafka.Topics.OrderCreated, event)

	s.logger.Infow("Order created",
		"order_id", order.ID,
		"order_number", order.OrderNumber,
	)

	return order, nil
}

// UpdateOrderInput contains input for updating an order
type UpdateOrderInput struct {
	CustomerReference     *string
	PickupLocationID      *uuid.UUID
	DeliveryLocationID    *uuid.UUID
	ReturnLocationID      *uuid.UUID
	RequestedPickupDate   *time.Time
	RequestedDeliveryDate *time.Time
	SpecialInstructions   *string
	UpdatedBy             string
}

// UpdateOrder updates an existing order (partial update)
func (s *OrderCRUDService) UpdateOrder(ctx context.Context, orderID uuid.UUID, input UpdateOrderInput) (*domain.Order, error) {
	s.logger.Infow("Updating order", "order_id", orderID)

	order, err := s.orderRepo.GetByID(ctx, orderID)
	if err != nil {
		return nil, apperrors.NotFoundError("order", orderID.String())
	}

	// Validate order can be updated
	if order.Status == domain.OrderStatusCompleted || order.Status == domain.OrderStatusCancelled {
		return nil, apperrors.InvalidStateError(
			string(order.Status),
			"pending, ready, or dispatched",
		)
	}

	// Apply updates
	updated := false
	if input.CustomerReference != nil {
		order.CustomerReference = *input.CustomerReference
		updated = true
	}
	if input.PickupLocationID != nil {
		order.PickupLocationID = input.PickupLocationID
		updated = true
	}
	if input.DeliveryLocationID != nil {
		order.DeliveryLocationID = input.DeliveryLocationID
		updated = true
	}
	if input.ReturnLocationID != nil {
		order.ReturnLocationID = input.ReturnLocationID
		updated = true
	}
	if input.RequestedPickupDate != nil {
		order.RequestedPickupDate = input.RequestedPickupDate
		updated = true
	}
	if input.RequestedDeliveryDate != nil {
		order.RequestedDeliveryDate = input.RequestedDeliveryDate
		updated = true
	}
	if input.SpecialInstructions != nil {
		order.SpecialInstructions = *input.SpecialInstructions
		updated = true
	}

	if !updated {
		return order, nil // No changes
	}

	order.UpdatedAt = time.Now()

	if err := s.orderRepo.Update(ctx, order); err != nil {
		return nil, apperrors.DatabaseError("update order", err)
	}

	s.logger.Infow("Order updated",
		"order_id", orderID,
		"updated_by", input.UpdatedBy,
	)

	return order, nil
}

// CancelOrder cancels an order
func (s *OrderCRUDService) CancelOrder(ctx context.Context, orderID uuid.UUID, reason, cancelledBy string) error {
	s.logger.Infow("Cancelling order", "order_id", orderID)

	order, err := s.orderRepo.GetByID(ctx, orderID)
	if err != nil {
		return apperrors.NotFoundError("order", orderID.String())
	}

	// Validate order can be cancelled
	if order.Status == domain.OrderStatusCompleted || order.Status == domain.OrderStatusCancelled {
		return apperrors.InvalidStateError(
			string(order.Status),
			"pending, ready, or dispatched",
		)
	}

	if order.Status == domain.OrderStatusInProgress {
		return apperrors.New("CANNOT_CANCEL", "cannot cancel order in progress")
	}

	// Update status
	order.Status = domain.OrderStatusCancelled
	order.UpdatedAt = time.Now()

	if err := s.orderRepo.Update(ctx, order); err != nil {
		return apperrors.DatabaseError("cancel order", err)
	}

	// Publish event
	event := kafka.NewEvent("orders.order.cancelled", "order-service", map[string]interface{}{
		"order_id":     orderID.String(),
		"order_number": order.OrderNumber,
		"reason":       reason,
		"cancelled_by": cancelledBy,
	})
	_ = s.eventProducer.Publish(ctx, "orders.order.cancelled", event)

	s.logger.Infow("Order cancelled",
		"order_id", orderID,
		"reason", reason,
	)

	return nil
}

// DeleteOrder soft deletes an order
func (s *OrderCRUDService) DeleteOrder(ctx context.Context, orderID uuid.UUID, deletedBy string) error {
	s.logger.Infow("Deleting order", "order_id", orderID)

	order, err := s.orderRepo.GetByID(ctx, orderID)
	if err != nil {
		return apperrors.NotFoundError("order", orderID.String())
	}

	// Validate order can be deleted
	if order.Status != domain.OrderStatusCancelled && order.Status != domain.OrderStatusPending {
		return apperrors.New("CANNOT_DELETE", "only cancelled or pending orders can be deleted")
	}

	if err := s.orderRepo.Delete(ctx, orderID); err != nil {
		return apperrors.DatabaseError("delete order", err)
	}

	s.logger.Infow("Order deleted",
		"order_id", orderID,
		"deleted_by", deletedBy,
	)

	return nil
}

// ListOrdersFilter contains filter criteria for listing orders
type ListOrdersFilter struct {
	Status            []domain.OrderStatus
	Type              []domain.OrderType
	BillingStatus     []domain.BillingStatus
	ShipmentID        *uuid.UUID
	ContainerID       *uuid.UUID
	CustomerReference string
	OrderNumber       string
	CreatedAfter      *time.Time
	CreatedBefore     *time.Time
	PickupAfter       *time.Time
	PickupBefore      *time.Time
	Page              int
	PageSize          int
	SortBy            string // "created_at", "order_number", "pickup_date"
	SortOrder         string // "asc", "desc"
}

// ListOrders retrieves orders with filtering, pagination, and sorting
func (s *OrderCRUDService) ListOrders(ctx context.Context, filter ListOrdersFilter) (*OrderListResult, error) {
	s.logger.Infow("Listing orders", "filter", filter)

	// Set defaults
	if filter.Page < 1 {
		filter.Page = 1
	}
	if filter.PageSize < 1 {
		filter.PageSize = 20
	}
	if filter.PageSize > 100 {
		filter.PageSize = 100
	}
	if filter.SortBy == "" {
		filter.SortBy = "created_at"
	}
	if filter.SortOrder == "" {
		filter.SortOrder = "desc"
	}

	// Build repository filter
	repoFilter := repository.OrderFilter{
		Status:            filter.Status,
		Type:              filter.Type,
		BillingStatus:     filter.BillingStatus,
		ShipmentID:        filter.ShipmentID,
		ContainerID:       filter.ContainerID,
		CustomerReference: filter.CustomerReference,
		OrderNumber:       filter.OrderNumber,
		CreatedAfter:      filter.CreatedAfter,
		CreatedBefore:     filter.CreatedBefore,
		PickupAfter:       filter.PickupAfter,
		PickupBefore:      filter.PickupBefore,
		Page:              filter.Page,
		PageSize:          filter.PageSize,
		SortBy:            filter.SortBy,
		SortOrder:         filter.SortOrder,
	}

	orders, total, err := s.orderRepo.List(ctx, repoFilter)
	if err != nil {
		return nil, apperrors.DatabaseError("list orders", err)
	}

	// Load containers for all orders (optimize with batch loading)
	containerIDs := make([]uuid.UUID, 0, len(orders))
	for _, order := range orders {
		if order.ContainerID != uuid.Nil {
			containerIDs = append(containerIDs, order.ContainerID)
		}
	}

	containers := make(map[uuid.UUID]*domain.Container)
	if len(containerIDs) > 0 {
		containerList, err := s.containerRepo.GetByIDs(ctx, containerIDs)
		if err == nil {
			for _, c := range containerList {
				containers[c.ID] = c
			}
		}
	}

	// Attach containers
	for i, order := range orders {
		if container, ok := containers[order.ContainerID]; ok {
			orders[i].Container = container
		}
	}

	result := &OrderListResult{
		Orders:      orders,
		Total:       total,
		Page:        filter.Page,
		PageSize:    filter.PageSize,
		TotalPages:  int((total + int64(filter.PageSize) - 1) / int64(filter.PageSize)),
	}

	return result, nil
}

// OrderListResult contains paginated order list
type OrderListResult struct {
	Orders     []*domain.Order `json:"orders"`
	Total      int64           `json:"total"`
	Page       int             `json:"page"`
	PageSize   int             `json:"page_size"`
	TotalPages int             `json:"total_pages"`
}

// BulkUpdateOrderStatus updates status for multiple orders
func (s *OrderCRUDService) BulkUpdateOrderStatus(ctx context.Context, orderIDs []uuid.UUID, status domain.OrderStatus, reason, updatedBy string) error {
	s.logger.Infow("Bulk updating order status",
		"count", len(orderIDs),
		"status", status,
	)

	if len(orderIDs) == 0 {
		return apperrors.ValidationError("order_ids cannot be empty", "order_ids", orderIDs)
	}

	if len(orderIDs) > 100 {
		return apperrors.ValidationError("cannot update more than 100 orders at once", "order_ids", len(orderIDs))
	}

	// Execute in transaction
	err := s.db.Transaction(ctx, func(tx pgxpool.Tx) error {
		for _, orderID := range orderIDs {
			// Validate order exists and can be updated
			order, err := s.orderRepo.GetByID(ctx, orderID)
			if err != nil {
				s.logger.Warnw("Order not found in bulk update", "order_id", orderID)
				continue
			}

			// Validate state transition
			if !s.isValidStatusTransition(order.Status, status) {
				s.logger.Warnw("Invalid status transition",
					"order_id", orderID,
					"from", order.Status,
					"to", status,
				)
				continue
			}

			// Update status
			if err := s.orderRepo.UpdateStatus(ctx, orderID, status); err != nil {
				return apperrors.DatabaseError("update order status", err)
			}

			// Publish event
			event := kafka.NewEvent(kafka.Topics.OrderStatusChanged, "order-service", map[string]interface{}{
				"order_id":   orderID.String(),
				"new_status": status,
				"old_status": order.Status,
				"reason":     reason,
				"updated_by": updatedBy,
			})
			_ = s.eventProducer.Publish(ctx, kafka.Topics.OrderStatusChanged, event)
		}
		return nil
	})

	if err != nil {
		return err
	}

	s.logger.Infow("Bulk status update completed",
		"count", len(orderIDs),
		"status", status,
	)

	return nil
}

// GetOrderWithDetails retrieves order with all associations (optimized)
func (s *OrderCRUDService) GetOrderWithDetails(ctx context.Context, orderID uuid.UUID) (*domain.Order, error) {
	order, err := s.orderRepo.GetByID(ctx, orderID)
	if err != nil {
		return nil, apperrors.NotFoundError("order", orderID.String())
	}

	// Load container
	if order.ContainerID != uuid.Nil {
		container, err := s.containerRepo.GetByID(ctx, order.ContainerID)
		if err == nil {
			order.Container = container
		}
	}

	// Load locations (if needed, could batch these)
	// order.PickupLocation, order.DeliveryLocation, etc.

	return order, nil
}

// GetOrdersByShipment retrieves all orders for a shipment
func (s *OrderCRUDService) GetOrdersByShipment(ctx context.Context, shipmentID uuid.UUID) ([]*domain.Order, error) {
	filter := ListOrdersFilter{
		ShipmentID: &shipmentID,
		PageSize:   1000, // Large page size for single shipment
	}

	result, err := s.ListOrders(ctx, filter)
	if err != nil {
		return nil, err
	}

	return result.Orders, nil
}

// SearchOrders performs text search on orders
func (s *OrderCRUDService) SearchOrders(ctx context.Context, query string, limit int) ([]*domain.Order, error) {
	s.logger.Infow("Searching orders", "query", query)

	if limit < 1 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}

	orders, err := s.orderRepo.Search(ctx, query, limit)
	if err != nil {
		return nil, apperrors.DatabaseError("search orders", err)
	}

	return orders, nil
}

// Helper methods

func (s *OrderCRUDService) validateCreateOrderInput(input CreateOrderInput) error {
	if input.ContainerID == uuid.Nil {
		return apperrors.ValidationError("container_id is required", "container_id", input.ContainerID)
	}

	if input.ShipmentID == uuid.Nil {
		return apperrors.ValidationError("shipment_id is required", "shipment_id", input.ShipmentID)
	}

	// Validate type
	if input.Type != domain.OrderTypeImport &&
	   input.Type != domain.OrderTypeExport &&
	   input.Type != domain.OrderTypeRepo &&
	   input.Type != domain.OrderTypeEmptyReturn {
		return apperrors.ValidationError("invalid order type", "type", input.Type)
	}

	// Validate dates
	if input.RequestedPickupDate != nil && input.RequestedDeliveryDate != nil {
		if input.RequestedPickupDate.After(*input.RequestedDeliveryDate) {
			return apperrors.ValidationError(
				"pickup date cannot be after delivery date",
				"requested_pickup_date",
				input.RequestedPickupDate,
			)
		}
	}

	return nil
}

func (s *OrderCRUDService) isValidStatusTransition(from, to domain.OrderStatus) bool {
	// Define valid state transitions
	validTransitions := map[domain.OrderStatus][]domain.OrderStatus{
		domain.OrderStatusPending:    {domain.OrderStatusReady, domain.OrderStatusHold, domain.OrderStatusCancelled},
		domain.OrderStatusReady:      {domain.OrderStatusDispatched, domain.OrderStatusHold, domain.OrderStatusCancelled},
		domain.OrderStatusDispatched: {domain.OrderStatusInProgress, domain.OrderStatusCancelled},
		domain.OrderStatusInProgress: {domain.OrderStatusDelivered, domain.OrderStatusFailed},
		domain.OrderStatusDelivered:  {domain.OrderStatusCompleted},
		domain.OrderStatusHold:       {domain.OrderStatusPending, domain.OrderStatusCancelled},
	}

	allowedTargets, ok := validTransitions[from]
	if !ok {
		return false
	}

	for _, allowed := range allowedTargets {
		if allowed == to {
			return true
		}
	}

	return false
}
