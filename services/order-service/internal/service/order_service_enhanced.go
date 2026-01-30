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
	"github.com/draymaster/shared/pkg/config"
	"github.com/draymaster/shared/pkg/kafka"
	"github.com/draymaster/shared/pkg/logger"
	"github.com/draymaster/shared/pkg/database"
)

// EnhancedOrderService handles business logic with proper validation and error handling
type EnhancedOrderService struct {
	db            *database.DB
	shipmentRepo  repository.ShipmentRepository
	containerRepo repository.ContainerRepository
	orderRepo     repository.OrderRepository
	locationRepo  repository.LocationRepository
	eventProducer *kafka.Producer
	logger        *logger.Logger

	// Validators
	containerValidator *validation.ContainerNumberValidator
	weightValidator    *validation.WeightValidator
	coordinateValidator *validation.CoordinateValidator
	dateValidator      *validation.DateValidator
	hazmatValidator    *validation.HazmatValidator
	reeferValidator    *validation.ReeferValidator
	stringValidator    *validation.StringValidator

	// Business rules
	businessRules *config.BusinessRules
}

// NewEnhancedOrderService creates a new enhanced order service
func NewEnhancedOrderService(
	db *database.DB,
	shipmentRepo repository.ShipmentRepository,
	containerRepo repository.ContainerRepository,
	orderRepo repository.OrderRepository,
	locationRepo repository.LocationRepository,
	eventProducer *kafka.Producer,
	log *logger.Logger,
) *EnhancedOrderService {
	return &EnhancedOrderService{
		db:            db,
		shipmentRepo:  shipmentRepo,
		containerRepo: containerRepo,
		orderRepo:     orderRepo,
		locationRepo:  locationRepo,
		eventProducer: eventProducer,
		logger:        log,
		containerValidator: validation.NewContainerNumberValidator(),
		weightValidator:    validation.NewWeightValidator(0),
		coordinateValidator: validation.NewCoordinateValidator(),
		dateValidator:      validation.NewDateValidator(),
		hazmatValidator:    validation.NewHazmatValidator(),
		reeferValidator:    validation.NewReeferValidator(),
		stringValidator:    validation.NewStringValidator(),
		businessRules:      config.DefaultBusinessRules(),
	}
}

// CreateShipmentEnhanced creates a new shipment with comprehensive validation and transaction support
func (s *EnhancedOrderService) CreateShipmentEnhanced(ctx context.Context, input CreateShipmentInput) (*domain.Shipment, error) {
	s.logger.Infow("Creating shipment with validation",
		"type", input.Type,
		"reference", input.ReferenceNumber,
		"containers", len(input.Containers),
	)

	// Validate input
	if err := s.validateShipmentInput(input); err != nil {
		return nil, err
	}

	var shipment *domain.Shipment

	// Execute in transaction
	err := s.db.Transaction(ctx, func(tx pgxpool.Tx) error {
		// Create shipment
		shipment = &domain.Shipment{
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
			return apperrors.DatabaseError("create shipment", err)
		}

		// Create containers if provided
		if len(input.Containers) > 0 {
			containers := make([]*domain.Container, len(input.Containers))
			for i, c := range input.Containers {
				// Validate each container
				if err := s.validateContainerInput(c); err != nil {
					return err
				}

				// Determine overweight status using business rules
				isOverweight := s.businessRules.Weight.OverweightThresholdLbs > 0 &&
					c.WeightLbs > s.businessRules.Weight.OverweightThresholdLbs

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
					IsOverweight:       isOverweight,
					IsReefer:           c.Type == domain.ContainerTypeReefer,
					ReeferTempSetpoint: c.ReeferTempSetpoint,
					Commodity:          c.Commodity,
					CustomsStatus:      domain.CustomsStatusPending,
					CurrentState:       domain.ContainerStateLoaded,
					CurrentLocationType: domain.LocationTypeVessel,
				}
			}

			if err := s.containerRepo.CreateBatch(ctx, containers); err != nil {
				return apperrors.DatabaseError("create containers", err)
			}

			shipment.Containers = make([]domain.Container, len(containers))
			for i, c := range containers {
				shipment.Containers[i] = *c
			}
		}

		return nil
	})

	if err != nil {
		s.logger.Errorw("Failed to create shipment", "error", err)
		return nil, err
	}

	// Publish event (outside transaction)
	event := kafka.NewEvent(kafka.Topics.ShipmentCreated, "order-service", map[string]interface{}{
		"shipment_id":      shipment.ID.String(),
		"reference_number": shipment.ReferenceNumber,
		"type":             shipment.Type,
		"container_count":  len(input.Containers),
	})

	if err := s.eventProducer.Publish(ctx, kafka.Topics.ShipmentCreated, event); err != nil {
		s.logger.Warnw("Failed to publish shipment created event", "error", err)
		// Don't fail the operation if event publishing fails
	}

	s.logger.Infow("Shipment created successfully",
		"shipment_id", shipment.ID,
		"reference", shipment.ReferenceNumber,
	)

	return shipment, nil
}

// validateShipmentInput validates shipment creation input
func (s *EnhancedOrderService) validateShipmentInput(input CreateShipmentInput) error {
	// Validate required fields
	if err := s.stringValidator.ValidateRequired(input.ReferenceNumber, "reference_number"); err != nil {
		return apperrors.ValidationError(err.Error(), "reference_number", input.ReferenceNumber)
	}

	if err := s.stringValidator.ValidateLength(input.ReferenceNumber, "reference_number", 1, 50); err != nil {
		return apperrors.ValidationError(err.Error(), "reference_number", input.ReferenceNumber)
	}

	if input.CustomerID == uuid.Nil {
		return apperrors.ValidationError("customer_id is required", "customer_id", input.CustomerID)
	}

	if input.SteamshipLineID == uuid.Nil {
		return apperrors.ValidationError("steamship_line_id is required", "steamship_line_id", input.SteamshipLineID)
	}

	if input.TerminalID == uuid.Nil {
		return apperrors.ValidationError("terminal_id is required", "terminal_id", input.TerminalID)
	}

	// Validate vessel information
	if input.Type == domain.ShipmentTypeImport {
		if err := s.stringValidator.ValidateRequired(input.VesselName, "vessel_name"); err != nil {
			return apperrors.ValidationError(err.Error(), "vessel_name", input.VesselName)
		}
		if err := s.stringValidator.ValidateRequired(input.VoyageNumber, "voyage_number"); err != nil {
			return apperrors.ValidationError(err.Error(), "voyage_number", input.VoyageNumber)
		}
	}

	// Validate dates
	if err := s.dateValidator.ValidateShipmentDates(input.VesselETA, input.LastFreeDay, input.PortCutoff, input.DocCutoff); err != nil {
		return apperrors.ValidationError(err.Error(), "dates", "")
	}

	// For exports, validate cutoff dates
	if input.Type == domain.ShipmentTypeExport {
		if input.PortCutoff == nil {
			return apperrors.ValidationError("port_cutoff is required for exports", "port_cutoff", nil)
		}
		if input.DocCutoff == nil {
			return apperrors.ValidationError("doc_cutoff is required for exports", "doc_cutoff", nil)
		}
	}

	// For imports, validate Last Free Day
	if input.Type == domain.ShipmentTypeImport {
		if input.LastFreeDay == nil {
			return apperrors.ValidationError("last_free_day is required for imports", "last_free_day", nil)
		}
	}

	return nil
}

// validateContainerInput validates container creation input
func (s *EnhancedOrderService) validateContainerInput(input CreateContainerInput) error {
	// Validate container number format
	if err := s.containerValidator.Validate(input.ContainerNumber); err != nil {
		return apperrors.ValidationError(err.Error(), "container_number", input.ContainerNumber)
	}

	// Validate weight
	maxWeight := s.businessRules.Weight.MaxGrossWeightLbs
	if err := s.weightValidator.Validate(input.WeightLbs); err != nil {
		return apperrors.ValidationError(err.Error(), "weight_lbs", input.WeightLbs)
	}

	if input.WeightLbs > maxWeight {
		return apperrors.ValidationError(
			fmt.Sprintf("weight %d lbs exceeds maximum allowed %d lbs", input.WeightLbs, maxWeight),
			"weight_lbs",
			input.WeightLbs,
		)
	}

	// Validate container size
	if input.Size != domain.ContainerSize20 &&
	   input.Size != domain.ContainerSize40 &&
	   input.Size != domain.ContainerSize45 {
		return apperrors.ValidationError("invalid container size", "size", input.Size)
	}

	// Validate hazmat information
	if err := s.hazmatValidator.Validate(input.IsHazmat, input.HazmatClass, input.UNNumber); err != nil {
		return apperrors.ValidationError(err.Error(), "hazmat", "")
	}

	// Validate reefer information
	if err := s.reeferValidator.Validate(input.Type == domain.ContainerTypeReefer, input.ReeferTempSetpoint); err != nil {
		return apperrors.ValidationError(err.Error(), "reefer", "")
	}

	return nil
}

// PerDiemCharges represents per-diem storage charges
type PerDiemCharges struct {
	ContainerID   uuid.UUID  `json:"container_id"`
	Days          int        `json:"days"`
	Amount        float64    `json:"amount"`
	StartDate     time.Time  `json:"start_date"`
	CalculatedAt  time.Time  `json:"calculated_at"`
	Breakdown     []TierCharge `json:"breakdown"`
}

// TierCharge represents charges for a specific tier
type TierCharge struct {
	TierName  string  `json:"tier_name"`
	Days      int     `json:"days"`
	RatePerDay float64 `json:"rate_per_day"`
	Amount    float64 `json:"amount"`
}

// CalculatePerDiem calculates per-diem storage charges for a container
func (s *EnhancedOrderService) CalculatePerDiem(ctx context.Context, containerID uuid.UUID) (*PerDiemCharges, error) {
	container, err := s.containerRepo.GetByID(ctx, containerID)
	if err != nil {
		return nil, apperrors.NotFoundError("container", containerID.String())
	}

	shipment, err := s.shipmentRepo.GetByID(ctx, container.ShipmentID)
	if err != nil {
		return nil, apperrors.NotFoundError("shipment", container.ShipmentID.String())
	}

	// Per-diem only applies to imports
	if shipment.Type != domain.ShipmentTypeImport {
		return &PerDiemCharges{
			ContainerID: containerID,
			Days:        0,
			Amount:      0,
		}, nil
	}

	// Calculate days from Last Free Day
	if shipment.LastFreeDay == nil {
		return &PerDiemCharges{
			ContainerID: containerID,
			Days:        0,
			Amount:      0,
		}, nil
	}

	now := time.Now()
	if now.Before(*shipment.LastFreeDay) {
		return &PerDiemCharges{
			ContainerID: containerID,
			Days:        0,
			Amount:      0,
			StartDate:   *shipment.LastFreeDay,
		}, nil
	}

	// Calculate days past Last Free Day
	daysPastLFD := int(now.Sub(*shipment.LastFreeDay).Hours() / 24)

	// Get applicable rates for container size
	sizeKey := string(container.Size)
	rates, ok := s.businessRules.PerDiem.Rates[sizeKey]
	if !ok {
		return nil, apperrors.New("INVALID_CONTAINER_SIZE", fmt.Sprintf("no per-diem rates for size %s", sizeKey))
	}

	// Subtract free days
	chargeableDays := daysPastLFD - s.businessRules.PerDiem.FreeDays
	if chargeableDays <= 0 {
		return &PerDiemCharges{
			ContainerID:  containerID,
			Days:         daysPastLFD,
			Amount:       0,
			StartDate:    *shipment.LastFreeDay,
			CalculatedAt: now,
		}, nil
	}

	// Calculate tiered charges with breakdown
	totalAmount := 0.0
	breakdown := []TierCharge{}

	for _, tier := range rates {
		if chargeableDays < tier.FromDay {
			break
		}

		endDay := tier.ToDay
		if endDay == 0 || endDay > chargeableDays {
			endDay = chargeableDays
		}

		daysInTier := endDay - tier.FromDay + 1
		if daysInTier > 0 {
			tierAmount := float64(daysInTier) * tier.Rate
			totalAmount += tierAmount

			breakdown = append(breakdown, TierCharge{
				TierName:   fmt.Sprintf("Days %d-%d", tier.FromDay, endDay),
				Days:       daysInTier,
				RatePerDay: tier.Rate,
				Amount:     tierAmount,
			})
		}

		if tier.ToDay != 0 && chargeableDays <= tier.ToDay {
			break
		}
	}

	return &PerDiemCharges{
		ContainerID:  containerID,
		Days:         chargeableDays,
		Amount:       totalAmount,
		StartDate:    shipment.LastFreeDay.Add(time.Duration(s.businessRules.PerDiem.FreeDays) * 24 * time.Hour),
		CalculatedAt: now,
		Breakdown:    breakdown,
	}, nil
}

// DemurrageCharges represents steamship line demurrage charges
type DemurrageCharges struct {
	ContainerID   uuid.UUID    `json:"container_id"`
	Days          int          `json:"days"`
	Amount        float64      `json:"amount"`
	StartDate     time.Time    `json:"start_date"`
	CalculatedAt  time.Time    `json:"calculated_at"`
	Breakdown     []TierCharge `json:"breakdown"`
}

// CalculateDemurrage calculates steamship line demurrage charges
func (s *EnhancedOrderService) CalculateDemurrage(ctx context.Context, containerID uuid.UUID) (*DemurrageCharges, error) {
	container, err := s.containerRepo.GetByID(ctx, containerID)
	if err != nil {
		return nil, apperrors.NotFoundError("container", containerID.String())
	}

	shipment, err := s.shipmentRepo.GetByID(ctx, container.ShipmentID)
	if err != nil {
		return nil, apperrors.NotFoundError("shipment", container.ShipmentID.String())
	}

	// Demurrage only applies to imports
	if shipment.Type != domain.ShipmentTypeImport {
		return &DemurrageCharges{
			ContainerID: containerID,
			Days:        0,
			Amount:      0,
		}, nil
	}

	// Must have Last Free Day
	if shipment.LastFreeDay == nil {
		return &DemurrageCharges{
			ContainerID: containerID,
			Days:        0,
			Amount:      0,
		}, nil
	}

	now := time.Now()
	daysPastLFD := shipment.DaysUntilLFD()

	// If not past LFD, no demurrage
	if daysPastLFD >= 0 {
		return &DemurrageCharges{
			ContainerID:  containerID,
			Days:         0,
			Amount:       0,
			StartDate:    *shipment.LastFreeDay,
			CalculatedAt: now,
		}, nil
	}

	overdueDays := -daysPastLFD // Convert negative to positive

	// Get applicable rates for container size
	sizeKey := string(container.Size)
	rates, ok := s.businessRules.Demurrage.Rates[sizeKey]
	if !ok {
		return nil, apperrors.New("INVALID_CONTAINER_SIZE", fmt.Sprintf("no demurrage rates for size %s", sizeKey))
	}

	// Calculate tiered demurrage with breakdown
	totalAmount := 0.0
	breakdown := []TierCharge{}

	for _, tier := range rates {
		if overdueDays < tier.FromDay {
			break
		}

		endDay := tier.ToDay
		if endDay == 0 || endDay > overdueDays {
			endDay = overdueDays
		}

		daysInTier := endDay - tier.FromDay + 1
		if daysInTier > 0 {
			tierAmount := float64(daysInTier) * tier.Rate
			totalAmount += tierAmount

			breakdown = append(breakdown, TierCharge{
				TierName:   fmt.Sprintf("Days %d-%d", tier.FromDay, endDay),
				Days:       daysInTier,
				RatePerDay: tier.Rate,
				Amount:     tierAmount,
			})
		}

		if tier.ToDay != 0 && overdueDays <= tier.ToDay {
			break
		}
	}

	return &DemurrageCharges{
		ContainerID:  containerID,
		Days:         overdueDays,
		Amount:       totalAmount,
		StartDate:    shipment.LastFreeDay.Add(24 * time.Hour), // Day after LFD
		CalculatedAt: now,
		Breakdown:    breakdown,
	}, nil
}
