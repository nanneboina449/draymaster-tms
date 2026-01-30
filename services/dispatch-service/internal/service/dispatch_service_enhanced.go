package service

import (
	"context"
	"fmt"
	"math"
	"sort"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/draymaster/services/dispatch-service/internal/domain"
	"github.com/draymaster/services/dispatch-service/internal/repository"
	apperrors "github.com/draymaster/shared/pkg/errors"
	"github.com/draymaster/shared/pkg/config"
	"github.com/draymaster/shared/pkg/database"
	"github.com/draymaster/shared/pkg/kafka"
	"github.com/draymaster/shared/pkg/logger"
)

// EnhancedDispatchService handles trip dispatch with optimizations
type EnhancedDispatchService struct {
	db            *database.DB
	tripRepo      repository.TripRepository
	stopRepo      repository.TripStopRepository
	driverRepo    repository.DriverRepository
	locationRepo  repository.LocationRepository
	equipmentRepo repository.EquipmentRepository
	eventProducer *kafka.Producer
	logger        *logger.Logger
	businessRules *config.BusinessRules
}

// NewEnhancedDispatchService creates a new enhanced dispatch service
func NewEnhancedDispatchService(
	db *database.DB,
	tripRepo repository.TripRepository,
	stopRepo repository.TripStopRepository,
	driverRepo repository.DriverRepository,
	locationRepo repository.LocationRepository,
	equipmentRepo repository.EquipmentRepository,
	eventProducer *kafka.Producer,
	log *logger.Logger,
) *EnhancedDispatchService {
	return &EnhancedDispatchService{
		db:            db,
		tripRepo:      tripRepo,
		stopRepo:      stopRepo,
		driverRepo:    driverRepo,
		locationRepo:  locationRepo,
		equipmentRepo: equipmentRepo,
		eventProducer: eventProducer,
		logger:        log,
		businessRules: config.DefaultBusinessRules(),
	}
}

// CreateTripEnhanced creates a trip with proper distance calculation and validation
func (s *EnhancedDispatchService) CreateTripEnhanced(ctx context.Context, input CreateTripInput) (*domain.Trip, error) {
	s.logger.Infow("Creating trip with enhanced validation",
		"type", input.Type,
		"stops", len(input.Stops),
	)

	// Validate minimum stops
	if len(input.Stops) < 2 {
		return nil, apperrors.ValidationError("trip must have at least 2 stops", "stops", len(input.Stops))
	}

	// Validate driver availability if assigned
	if input.DriverID != nil {
		if err := s.validateDriverAvailability(ctx, *input.DriverID, input.PlannedStartTime); err != nil {
			return nil, err
		}
	}

	var trip *domain.Trip

	// Execute in transaction
	err := s.db.Transaction(ctx, func(tx pgxpool.Tx) error {
		// Load location details for all stops
		locations, err := s.loadStopLocations(ctx, input.Stops)
		if err != nil {
			return err
		}

		// Calculate actual trip metrics
		totalMiles, totalDuration, err := s.calculateRealTripMetrics(ctx, locations, input.Stops)
		if err != nil {
			return err
		}

		// Generate trip number
		tripNumber, err := s.tripRepo.GetNextTripNumber(ctx)
		if err != nil {
			return apperrors.DatabaseError("generate trip number", err)
		}

		// Create trip
		trip = &domain.Trip{
			ID:                    uuid.New(),
			TripNumber:            tripNumber,
			Type:                  input.Type,
			Status:                domain.TripStatusPlanned,
			DriverID:              input.DriverID,
			TractorID:             input.TractorID,
			CurrentStopSequence:   1,
			PlannedStartTime:      input.PlannedStartTime,
			EstimatedDurationMins: totalDuration,
			TotalMiles:            totalMiles,
			IsStreetTurn:          input.Type == domain.TripTypeStreetTurn,
			IsDualTransaction:     input.Type == domain.TripTypeDualTransaction,
			CreatedBy:             input.CreatedBy,
			CreatedAt:             time.Now(),
			UpdatedAt:             time.Now(),
		}

		// Calculate planned end time
		if input.PlannedStartTime != nil {
			endTime := input.PlannedStartTime.Add(time.Duration(totalDuration) * time.Minute)
			trip.PlannedEndTime = &endTime
		}

		// Set status to assigned if driver is provided
		if input.DriverID != nil {
			trip.Status = domain.TripStatusAssigned
		}

		if err := s.tripRepo.Create(ctx, trip); err != nil {
			return apperrors.DatabaseError("create trip", err)
		}

		// Create stops with calculated ETAs
		stops, err := s.createTripStops(ctx, trip, input.Stops, locations)
		if err != nil {
			return err
		}
		trip.Stops = stops

		return nil
	})

	if err != nil {
		s.logger.Errorw("Failed to create trip", "error", err)
		return nil, err
	}

	// Publish event (outside transaction)
	event := kafka.NewEvent(kafka.Topics.TripCreated, "dispatch-service", map[string]interface{}{
		"trip_id":       trip.ID.String(),
		"trip_number":   trip.TripNumber,
		"type":          trip.Type,
		"stop_count":    len(trip.Stops),
		"total_miles":   trip.TotalMiles,
		"total_duration": trip.EstimatedDurationMins,
	})
	_ = s.eventProducer.Publish(ctx, kafka.Topics.TripCreated, event)

	s.logger.Infow("Trip created successfully",
		"trip_id", trip.ID,
		"trip_number", trip.TripNumber,
		"miles", trip.TotalMiles,
		"duration", trip.EstimatedDurationMins,
	)

	return trip, nil
}

// validateDriverAvailability checks if driver can accept the trip
func (s *EnhancedDispatchService) validateDriverAvailability(ctx context.Context, driverID uuid.UUID, startTime *time.Time) error {
	driver, err := s.driverRepo.GetByID(ctx, driverID)
	if err != nil {
		return apperrors.NotFoundError("driver", driverID.String())
	}

	// Check if driver is available
	if driver.Status != "AVAILABLE" && driver.Status != "ON_DUTY" {
		return apperrors.InvalidStateError(driver.Status, "AVAILABLE or ON_DUTY")
	}

	// Check if driver has sufficient HOS time
	if driver.AvailableDriveMins < 60 {
		return apperrors.InsufficientResourceError("drive time", "60 mins", fmt.Sprintf("%d mins", driver.AvailableDriveMins))
	}

	return nil
}

// loadStopLocations loads location details for all stops
func (s *EnhancedDispatchService) loadStopLocations(ctx context.Context, stops []CreateStopInput) (map[uuid.UUID]*domain.Location, error) {
	locations := make(map[uuid.UUID]*domain.Location)

	for _, stop := range stops {
		if _, exists := locations[stop.LocationID]; !exists {
			loc, err := s.locationRepo.GetByID(ctx, stop.LocationID)
			if err != nil {
				return nil, apperrors.NotFoundError("location", stop.LocationID.String())
			}
			locations[stop.LocationID] = loc
		}
	}

	return locations, nil
}

// calculateRealTripMetrics calculates actual distance and duration
func (s *EnhancedDispatchService) calculateRealTripMetrics(ctx context.Context, locations map[uuid.UUID]*domain.Location, stops []CreateStopInput) (float64, int, error) {
	var totalMiles float64
	var totalDuration int

	for i := 0; i < len(stops)-1; i++ {
		fromLoc := locations[stops[i].LocationID]
		toLoc := locations[stops[i+1].LocationID]

		// Calculate actual distance using Haversine formula
		miles := s.haversineDistance(
			fromLoc.Latitude, fromLoc.Longitude,
			toLoc.Latitude, toLoc.Longitude,
		)

		totalMiles += miles

		// Add stop duration
		totalDuration += stops[i].EstimatedDurationMins

		// Add drive time based on actual distance
		// Use configurable average speed
		avgSpeed := s.businessRules.Distance.DrayageAverageSpeedMPH
		driveHours := miles / avgSpeed
		driveMins := int(driveHours * 60)
		totalDuration += driveMins
	}

	// Add last stop duration
	totalDuration += stops[len(stops)-1].EstimatedDurationMins

	return totalMiles, totalDuration, nil
}

// createTripStops creates stops with calculated ETAs
func (s *EnhancedDispatchService) createTripStops(ctx context.Context, trip *domain.Trip, stopInputs []CreateStopInput, locations map[uuid.UUID]*domain.Location) ([]domain.TripStop, error) {
	stops := make([]domain.TripStop, len(stopInputs))

	currentTime := trip.PlannedStartTime
	if currentTime == nil {
		now := time.Now()
		currentTime = &now
	}

	for i, stopInput := range stopInputs {
		// Calculate ETA for this stop
		var estimatedArrival *time.Time
		if i > 0 {
			// Calculate travel time from previous stop
			prevLoc := locations[stopInputs[i-1].LocationID]
			currLoc := locations[stopInput.LocationID]

			miles := s.haversineDistance(
				prevLoc.Latitude, prevLoc.Longitude,
				currLoc.Latitude, currLoc.Longitude,
			)

			avgSpeed := s.businessRules.Distance.DrayageAverageSpeedMPH
			travelMins := int((miles / avgSpeed) * 60)

			// Add previous stop duration and travel time
			eta := currentTime.Add(time.Duration(stopInputs[i-1].EstimatedDurationMins+travelMins) * time.Minute)
			estimatedArrival = &eta
			currentTime = &eta
		} else {
			estimatedArrival = currentTime
		}

		// Determine free time based on activity type
		freeTime := stopInput.FreeTimeMins
		if freeTime == 0 {
			freeTime = s.businessRules.Time.GetFreeTime(string(stopInput.Activity))
		}

		stop := domain.TripStop{
			ID:                    uuid.New(),
			TripID:                trip.ID,
			Sequence:              stopInput.Sequence,
			Type:                  stopInput.Type,
			Activity:              stopInput.Activity,
			Status:                domain.StopStatusPending,
			LocationID:            stopInput.LocationID,
			ContainerID:           stopInput.ContainerID,
			OrderID:               stopInput.OrderID,
			AppointmentTime:       stopInput.AppointmentTime,
			AppointmentNumber:     stopInput.AppointmentNumber,
			EstimatedArrival:      estimatedArrival,
			EstimatedDurationMins: stopInput.EstimatedDurationMins,
			FreeTimeMins:          freeTime,
			CreatedAt:             time.Now(),
			UpdatedAt:             time.Now(),
		}

		if err := s.stopRepo.Create(ctx, &stop); err != nil {
			return nil, apperrors.DatabaseError("create stop", err)
		}

		stops[i] = stop

		// Update current time for next iteration
		if currentTime != nil {
			next := currentTime.Add(time.Duration(stopInput.EstimatedDurationMins) * time.Minute)
			currentTime = &next
		}
	}

	return stops, nil
}

// AssignDriverEnhanced assigns driver with comprehensive validation
func (s *EnhancedDispatchService) AssignDriverEnhanced(ctx context.Context, tripID, driverID uuid.UUID, tractorID *uuid.UUID) (*domain.Trip, error) {
	trip, err := s.tripRepo.GetByID(ctx, tripID)
	if err != nil {
		return nil, apperrors.NotFoundError("trip", tripID.String())
	}

	// Validate trip status
	if trip.Status != domain.TripStatusPlanned && trip.Status != domain.TripStatusAssigned {
		return nil, apperrors.InvalidStateError(
			string(trip.Status),
			string(domain.TripStatusPlanned)+" or "+string(domain.TripStatusAssigned),
		)
	}

	// Validate driver
	driver, err := s.driverRepo.GetByID(ctx, driverID)
	if err != nil {
		return nil, apperrors.NotFoundError("driver", driverID.String())
	}

	if driver.Status != "AVAILABLE" && driver.Status != "ON_DUTY" {
		return nil, apperrors.InvalidStateError(driver.Status, "AVAILABLE or ON_DUTY")
	}

	// Check HOS compliance with buffer
	requiredTime := trip.EstimatedDurationMins + 30 // 30-minute buffer
	if driver.AvailableDriveMins < requiredTime {
		return nil, apperrors.InsufficientResourceError(
			"driver HOS time",
			fmt.Sprintf("%d mins", requiredTime),
			fmt.Sprintf("%d mins", driver.AvailableDriveMins),
		)
	}

	// Check if driver requires TWIC and has it
	// (would check trip requirements)

	// Update trip
	trip.DriverID = &driverID
	trip.TractorID = tractorID
	trip.Status = domain.TripStatusAssigned
	trip.UpdatedAt = time.Now()

	if err := s.tripRepo.Update(ctx, trip); err != nil {
		return nil, apperrors.DatabaseError("assign driver", err)
	}

	// Publish event
	event := kafka.NewEvent(kafka.Topics.TripAssigned, "dispatch-service", map[string]interface{}{
		"trip_id":       tripID.String(),
		"driver_id":     driverID.String(),
		"driver_name":   driver.Name,
		"trip_number":   trip.TripNumber,
	})
	_ = s.eventProducer.Publish(ctx, kafka.Topics.TripAssigned, event)

	trip.Driver = driver
	s.logger.Infow("Driver assigned to trip",
		"trip_id", tripID,
		"driver_id", driverID,
		"driver_name", driver.Name,
	)

	return trip, nil
}

// FindStreetTurnOpportunitiesEnhanced finds street turn matches with improved scoring
func (s *EnhancedDispatchService) FindStreetTurnOpportunitiesEnhanced(ctx context.Context, filter StreetTurnFilter) ([]domain.StreetTurnOpportunity, error) {
	opportunities, err := s.tripRepo.FindStreetTurnMatches(ctx, filter)
	if err != nil {
		return nil, apperrors.DatabaseError("find street turn opportunities", err)
	}

	// Calculate enhanced match scores
	for i := range opportunities {
		opportunities[i].MatchScore = s.calculateEnhancedStreetTurnScore(&opportunities[i])
		opportunities[i].EstimatedSavings = s.calculateRealStreetTurnSavings(&opportunities[i])
	}

	// Sort by score descending
	sort.Slice(opportunities, func(i, j int) bool {
		return opportunities[i].MatchScore > opportunities[j].MatchScore
	})

	// Apply max results limit
	if filter.MaxResults > 0 && len(opportunities) > filter.MaxResults {
		opportunities = opportunities[:filter.MaxResults]
	}

	return opportunities, nil
}

// calculateEnhancedStreetTurnScore calculates improved match score
func (s *EnhancedDispatchService) calculateEnhancedStreetTurnScore(opp *domain.StreetTurnOpportunity) int {
	score := 100

	// Distance penalty (non-linear)
	if opp.DistanceMiles > 10 {
		score -= int((opp.DistanceMiles - 10) * 1.5)
	}

	// Time gap penalty
	hours := opp.ExportPickupDate.Sub(opp.ImportDeliveryDate).Hours()
	if hours > 4 {
		score -= int((hours - 4) * 5)
	} else if hours < 0.5 {
		score -= 20 // Too tight
	}

	// Container size match bonus
	if opp.ImportContainerSize == opp.ExportContainerSize {
		score += 10
	}

	// Same steamship line bonus (chassis compatibility)
	if opp.ImportSSLID == opp.ExportSSLID {
		score += 15
	}

	// Same terminal bonus (dual transaction potential)
	if opp.ImportTerminalID == opp.ExportTerminalID {
		score += 25 // Big bonus for same terminal
	}

	// Revenue bonus (higher value exports prioritized)
	if opp.ExportRevenue > 500 {
		score += 10
	}

	if score < 0 {
		score = 0
	}
	return score
}

// calculateRealStreetTurnSavings estimates actual savings
func (s *EnhancedDispatchService) calculateRealStreetTurnSavings(opp *domain.StreetTurnOpportunity) float64 {
	// Get terminal location to calculate empty return distance
	terminalDistance := 30.0 // Default assumption

	// Calculate savings
	emptyReturnMiles := terminalDistance
	emptyPickupMiles := terminalDistance
	streetTurnMiles := opp.DistanceMiles

	// Savings = (empty return + empty pickup) - street turn distance
	savedMiles := (emptyReturnMiles + emptyPickupMiles) - streetTurnMiles

	if savedMiles < 0 {
		return 0 // No savings if street turn is longer
	}

	// Calculate cost savings
	ratePerMile := s.businessRules.Rates.BaseRatePerMile
	savings := savedMiles * ratePerMile

	// Add fuel savings
	fuelSavings := savedMiles * 0.50 // Estimated fuel cost per mile

	// Add time savings (driver wages)
	avgSpeed := s.businessRules.Distance.DrayageAverageSpeedMPH
	savedHours := savedMiles / avgSpeed
	laborSavings := savedHours * 40 // Estimated driver hourly cost

	totalSavings := savings + fuelSavings + laborSavings

	return totalSavings
}

// haversineDistance calculates distance between two coordinates
func (s *EnhancedDispatchService) haversineDistance(lat1, lon1, lat2, lon2 float64) float64 {
	const earthRadiusMiles = 3959

	lat1Rad := lat1 * math.Pi / 180
	lat2Rad := lat2 * math.Pi / 180
	deltaLat := (lat2 - lat1) * math.Pi / 180
	deltaLon := (lon2 - lon1) * math.Pi / 180

	a := math.Sin(deltaLat/2)*math.Sin(deltaLat/2) +
		math.Cos(lat1Rad)*math.Cos(lat2Rad)*
			math.Sin(deltaLon/2)*math.Sin(deltaLon/2)
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))

	return earthRadiusMiles * c
}
