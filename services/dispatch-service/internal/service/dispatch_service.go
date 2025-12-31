package service

import (
	"context"
	"fmt"
	"math"
	"sort"
	"time"

	"github.com/google/uuid"

	"github.com/draymaster/services/dispatch-service/internal/domain"
	"github.com/draymaster/services/dispatch-service/internal/repository"
	"github.com/draymaster/shared/pkg/kafka"
	"github.com/draymaster/shared/pkg/logger"
)

// DispatchService handles trip dispatch business logic
type DispatchService struct {
	tripRepo      repository.TripRepository
	stopRepo      repository.TripStopRepository
	driverRepo    repository.DriverRepository
	locationRepo  repository.LocationRepository
	eventProducer *kafka.Producer
	logger        *logger.Logger
}

// NewDispatchService creates a new dispatch service
func NewDispatchService(
	tripRepo repository.TripRepository,
	stopRepo repository.TripStopRepository,
	driverRepo repository.DriverRepository,
	locationRepo repository.LocationRepository,
	eventProducer *kafka.Producer,
	log *logger.Logger,
) *DispatchService {
	return &DispatchService{
		tripRepo:      tripRepo,
		stopRepo:      stopRepo,
		driverRepo:    driverRepo,
		locationRepo:  locationRepo,
		eventProducer: eventProducer,
		logger:        log,
	}
}

// CreateTripInput contains input for creating a trip
type CreateTripInput struct {
	Type             domain.TripType
	Stops            []CreateStopInput
	OrderIDs         []uuid.UUID
	PlannedStartTime *time.Time
	DriverID         *uuid.UUID
	TractorID        *uuid.UUID
	CreatedBy        string
}

// CreateStopInput contains input for creating a stop
type CreateStopInput struct {
	Sequence              int
	Type                  domain.StopType
	Activity              domain.ActivityType
	LocationID            uuid.UUID
	ContainerID           *uuid.UUID
	OrderID               *uuid.UUID
	AppointmentTime       *time.Time
	AppointmentNumber     string
	EstimatedDurationMins int
	FreeTimeMins          int
}

// CreateTrip creates a new trip with stops
func (s *DispatchService) CreateTrip(ctx context.Context, input CreateTripInput) (*domain.Trip, error) {
	s.logger.Infow("Creating trip",
		"type", input.Type,
		"stops", len(input.Stops),
	)

	// Validate minimum stops
	if len(input.Stops) < 2 {
		return nil, fmt.Errorf("trip must have at least 2 stops")
	}

	// Generate trip number
	tripNumber, err := s.tripRepo.GetNextTripNumber(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to generate trip number: %w", err)
	}

	// Calculate total miles and duration
	totalMiles, totalDuration := s.calculateTripMetrics(ctx, input.Stops)

	// Create trip
	trip := &domain.Trip{
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
		return nil, fmt.Errorf("failed to create trip: %w", err)
	}

	// Create stops
	stops := make([]domain.TripStop, len(input.Stops))
	for i, stopInput := range input.Stops {
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
			EstimatedDurationMins: stopInput.EstimatedDurationMins,
			FreeTimeMins:          stopInput.FreeTimeMins,
		}

		if err := s.stopRepo.Create(ctx, &stop); err != nil {
			return nil, fmt.Errorf("failed to create stop: %w", err)
		}
		stops[i] = stop
	}
	trip.Stops = stops

	// Publish event
	event := kafka.NewEvent(kafka.Topics.TripCreated, "dispatch-service", map[string]interface{}{
		"trip_id":     trip.ID.String(),
		"trip_number": trip.TripNumber,
		"type":        trip.Type,
		"stop_count":  len(stops),
	})
	_ = s.eventProducer.Publish(ctx, kafka.Topics.TripCreated, event)

	s.logger.Infow("Trip created",
		"trip_id", trip.ID,
		"trip_number", trip.TripNumber,
	)

	return trip, nil
}

// GetTrip retrieves a trip by ID with all associations
func (s *DispatchService) GetTrip(ctx context.Context, id uuid.UUID) (*domain.Trip, error) {
	trip, err := s.tripRepo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	// Load stops
	stops, err := s.stopRepo.GetByTripID(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("failed to load stops: %w", err)
	}
	trip.Stops = stops

	// Load driver if assigned
	if trip.DriverID != nil {
		driver, err := s.driverRepo.GetByID(ctx, *trip.DriverID)
		if err == nil {
			trip.Driver = driver
		}
	}

	return trip, nil
}

// AssignDriver assigns a driver to a trip
func (s *DispatchService) AssignDriver(ctx context.Context, tripID, driverID uuid.UUID, tractorID *uuid.UUID) (*domain.Trip, error) {
	trip, err := s.tripRepo.GetByID(ctx, tripID)
	if err != nil {
		return nil, err
	}

	// Validate trip status allows assignment
	if trip.Status != domain.TripStatusPlanned && trip.Status != domain.TripStatusAssigned {
		return nil, fmt.Errorf("trip status %s does not allow driver assignment", trip.Status)
	}

	// Validate driver availability
	driver, err := s.driverRepo.GetByID(ctx, driverID)
	if err != nil {
		return nil, fmt.Errorf("driver not found: %w", err)
	}

	if driver.Status != "AVAILABLE" && driver.Status != "ON_DUTY" {
		return nil, fmt.Errorf("driver is not available (status: %s)", driver.Status)
	}

	// Check HOS compliance
	if driver.AvailableDriveMins < trip.EstimatedDurationMins {
		return nil, fmt.Errorf("driver has insufficient drive time (%d mins available, %d mins required)",
			driver.AvailableDriveMins, trip.EstimatedDurationMins)
	}

	// Update trip
	trip.DriverID = &driverID
	trip.TractorID = tractorID
	trip.Status = domain.TripStatusAssigned

	if err := s.tripRepo.Update(ctx, trip); err != nil {
		return nil, fmt.Errorf("failed to assign driver: %w", err)
	}

	// Publish event
	event := kafka.NewEvent(kafka.Topics.TripAssigned, "dispatch-service", map[string]interface{}{
		"trip_id":     tripID.String(),
		"driver_id":   driverID.String(),
		"driver_name": driver.Name,
	})
	_ = s.eventProducer.Publish(ctx, kafka.Topics.TripAssigned, event)

	trip.Driver = driver
	return trip, nil
}

// DispatchTrip dispatches a trip to the driver
func (s *DispatchService) DispatchTrip(ctx context.Context, tripID uuid.UUID) (*domain.Trip, error) {
	trip, err := s.GetTrip(ctx, tripID)
	if err != nil {
		return nil, err
	}

	// Validate trip can be dispatched
	if trip.Status != domain.TripStatusAssigned {
		return nil, fmt.Errorf("trip must be assigned before dispatch (current: %s)", trip.Status)
	}

	if trip.DriverID == nil {
		return nil, fmt.Errorf("trip has no driver assigned")
	}

	// Update status
	trip.Status = domain.TripStatusDispatched
	now := time.Now()
	if trip.PlannedStartTime == nil {
		trip.PlannedStartTime = &now
	}

	if err := s.tripRepo.Update(ctx, trip); err != nil {
		return nil, fmt.Errorf("failed to dispatch trip: %w", err)
	}

	// Publish event for driver mobile app
	event := kafka.NewEvent(kafka.Topics.TripDispatched, "dispatch-service", map[string]interface{}{
		"trip_id":     tripID.String(),
		"trip_number": trip.TripNumber,
		"driver_id":   trip.DriverID.String(),
		"stops":       len(trip.Stops),
	})
	_ = s.eventProducer.Publish(ctx, kafka.Topics.TripDispatched, event)

	s.logger.Infow("Trip dispatched",
		"trip_id", tripID,
		"driver_id", trip.DriverID,
	)

	return trip, nil
}

// RecordStopArrival records driver arrival at a stop
func (s *DispatchService) RecordStopArrival(ctx context.Context, tripID, stopID uuid.UUID, arrivalTime time.Time, lat, lon float64) (*domain.TripStop, error) {
	stop, err := s.stopRepo.GetByID(ctx, stopID)
	if err != nil {
		return nil, err
	}

	if stop.TripID != tripID {
		return nil, fmt.Errorf("stop does not belong to trip")
	}

	stop.Status = domain.StopStatusArrived
	stop.ActualArrival = &arrivalTime

	// Update trip status if this is first stop
	trip, _ := s.tripRepo.GetByID(ctx, tripID)
	if trip != nil && trip.Status == domain.TripStatusDispatched {
		trip.Status = domain.TripStatusInProgress
		trip.ActualStartTime = &arrivalTime
		_ = s.tripRepo.Update(ctx, trip)
	}

	if err := s.stopRepo.Update(ctx, stop); err != nil {
		return nil, fmt.Errorf("failed to record arrival: %w", err)
	}

	return stop, nil
}

// CompleteStop completes a stop
func (s *DispatchService) CompleteStop(ctx context.Context, input CompleteStopInput) (*domain.TripStop, error) {
	stop, err := s.stopRepo.GetByID(ctx, input.StopID)
	if err != nil {
		return nil, err
	}

	if stop.TripID != input.TripID {
		return nil, fmt.Errorf("stop does not belong to trip")
	}

	// Update stop
	stop.Status = domain.StopStatusCompleted
	stop.ActualDeparture = &input.DepartureTime
	stop.GateTicketNumber = input.GateTicketNumber
	stop.SealNumber = input.SealNumber
	stop.Notes = input.Notes

	// Calculate actual duration
	if stop.ActualArrival != nil {
		stop.ActualDurationMins = int(input.DepartureTime.Sub(*stop.ActualArrival).Minutes())
		stop.DetentionMins = stop.CalculateDetention()
	}

	// Handle equipment changes
	if input.ChassisID != nil {
		stop.ChassisOutID = input.ChassisID
	}
	if input.ContainerNumber != "" {
		stop.ContainerNumber = input.ContainerNumber
	}

	if err := s.stopRepo.Update(ctx, stop); err != nil {
		return nil, fmt.Errorf("failed to complete stop: %w", err)
	}

	// Check if trip is complete
	trip, _ := s.tripRepo.GetByID(ctx, input.TripID)
	if trip != nil {
		allComplete := s.checkAllStopsComplete(ctx, input.TripID)
		if allComplete {
			trip.Status = domain.TripStatusCompleted
			trip.ActualEndTime = &input.DepartureTime
			_ = s.tripRepo.Update(ctx, trip)

			event := kafka.NewEvent(kafka.Topics.TripCompleted, "dispatch-service", map[string]interface{}{
				"trip_id":     trip.ID.String(),
				"trip_number": trip.TripNumber,
			})
			_ = s.eventProducer.Publish(ctx, kafka.Topics.TripCompleted, event)
		} else {
			// Update current stop sequence
			trip.CurrentStopSequence = stop.Sequence + 1
			_ = s.tripRepo.Update(ctx, trip)
		}
	}

	// Publish stop completed event
	event := kafka.NewEvent(kafka.Topics.StopCompleted, "dispatch-service", map[string]interface{}{
		"trip_id":    input.TripID.String(),
		"stop_id":    input.StopID.String(),
		"sequence":   stop.Sequence,
		"detention":  stop.DetentionMins,
	})
	_ = s.eventProducer.Publish(ctx, kafka.Topics.StopCompleted, event)

	return stop, nil
}

// CompleteStopInput contains input for completing a stop
type CompleteStopInput struct {
	TripID           uuid.UUID
	StopID           uuid.UUID
	DepartureTime    time.Time
	GateTicketNumber string
	SealNumber       string
	ChassisID        *uuid.UUID
	ContainerNumber  string
	DocumentIDs      []string
	Notes            string
}

// FindStreetTurnOpportunities finds potential street turn matches
func (s *DispatchService) FindStreetTurnOpportunities(ctx context.Context, filter StreetTurnFilter) ([]domain.StreetTurnOpportunity, error) {
	opportunities, err := s.tripRepo.FindStreetTurnMatches(ctx, filter)
	if err != nil {
		return nil, fmt.Errorf("failed to find street turn opportunities: %w", err)
	}

	// Calculate match scores
	for i := range opportunities {
		opportunities[i].MatchScore = s.calculateStreetTurnScore(&opportunities[i])
		opportunities[i].EstimatedSavings = s.calculateStreetTurnSavings(&opportunities[i])
	}

	// Sort by score descending
	sort.Slice(opportunities, func(i, j int) bool {
		return opportunities[i].MatchScore > opportunities[j].MatchScore
	})

	return opportunities, nil
}

// StreetTurnFilter contains filter criteria for street turn matching
type StreetTurnFilter struct {
	ImportOrderID    *uuid.UUID
	ExportOrderID    *uuid.UUID
	SteamshipLineID  *uuid.UUID
	ContainerSize    string
	MaxDistanceMiles int
	MaxResults       int
}

// CreateStreetTurn creates a street turn trip linking import and export orders
func (s *DispatchService) CreateStreetTurn(ctx context.Context, importOrderID, exportOrderID uuid.UUID, driverID *uuid.UUID, plannedStart *time.Time) (*domain.Trip, error) {
	// Get import and export order details (would call order service)
	// For now, we'll create the trip structure

	template := domain.GetTripTemplates()[domain.TripTypeStreetTurn]
	
	input := CreateTripInput{
		Type:             domain.TripTypeStreetTurn,
		OrderIDs:         []uuid.UUID{importOrderID, exportOrderID},
		DriverID:         driverID,
		PlannedStartTime: plannedStart,
		CreatedBy:        "system",
	}

	// Build stops from template (locations would come from order service)
	// This is a simplified version
	for i, pattern := range template.StopPattern {
		input.Stops = append(input.Stops, CreateStopInput{
			Sequence: pattern.Sequence,
			Type:     pattern.Type,
			Activity: pattern.Activity,
			// LocationID and other fields would be populated from order data
			EstimatedDurationMins: 30,
			FreeTimeMins: func() int {
				if pattern.Activity == domain.ActivityTypeLiveUnload || pattern.Activity == domain.ActivityTypeLiveLoad {
					return 120 // 2 hour free time
				}
				return 30
			}(),
		})
		_ = i // suppress unused warning
	}

	trip, err := s.CreateTrip(ctx, input)
	if err != nil {
		return nil, err
	}

	// Publish street turn matched event
	event := kafka.NewEvent(kafka.Topics.StreetTurnMatched, "dispatch-service", map[string]interface{}{
		"trip_id":         trip.ID.String(),
		"import_order_id": importOrderID.String(),
		"export_order_id": exportOrderID.String(),
	})
	_ = s.eventProducer.Publish(ctx, kafka.Topics.StreetTurnMatched, event)

	return trip, nil
}

// GetDispatchBoard returns the dispatch board for a date
func (s *DispatchService) GetDispatchBoard(ctx context.Context, date time.Time) (*domain.DispatchBoard, error) {
	startOfDay := time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, date.Location())
	endOfDay := startOfDay.Add(24 * time.Hour)

	trips, err := s.tripRepo.GetByDateRange(ctx, startOfDay, endOfDay)
	if err != nil {
		return nil, fmt.Errorf("failed to get trips: %w", err)
	}

	board := &domain.DispatchBoard{
		Unassigned:  []domain.Trip{},
		Assigned:    []domain.Trip{},
		Dispatched:  []domain.Trip{},
		InProgress:  []domain.Trip{},
		Completed:   []domain.Trip{},
		Failed:      []domain.Trip{},
		TotalTrips:  len(trips),
		AsOf:        time.Now(),
	}

	for _, trip := range trips {
		switch trip.Status {
		case domain.TripStatusPlanned:
			board.Unassigned = append(board.Unassigned, trip)
		case domain.TripStatusAssigned:
			board.Assigned = append(board.Assigned, trip)
		case domain.TripStatusDispatched, domain.TripStatusEnRoute:
			board.Dispatched = append(board.Dispatched, trip)
		case domain.TripStatusInProgress:
			board.InProgress = append(board.InProgress, trip)
		case domain.TripStatusCompleted:
			board.Completed = append(board.Completed, trip)
		case domain.TripStatusFailed, domain.TripStatusCancelled:
			board.Failed = append(board.Failed, trip)
		}
	}

	return board, nil
}

// GetDriverAvailability returns available drivers sorted by proximity
func (s *DispatchService) GetDriverAvailability(ctx context.Context, pickupLat, pickupLon float64, requiredDriveMins int, requireTWIC bool) ([]domain.DriverAvailability, error) {
	drivers, err := s.driverRepo.GetAvailable(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get drivers: %w", err)
	}

	var availability []domain.DriverAvailability
	for _, driver := range drivers {
		// Filter by TWIC if required
		if requireTWIC && !driver.HasTWIC {
			continue
		}

		// Filter by available drive time
		if driver.AvailableDriveMins < requiredDriveMins {
			continue
		}

		// Calculate distance to pickup
		distance := s.haversineDistance(driver.CurrentLatitude, driver.CurrentLongitude, pickupLat, pickupLon)
		etaMins := int(distance / 0.75) // Assume 45 mph average

		availability = append(availability, domain.DriverAvailability{
			DriverID:              driver.ID,
			DriverName:            driver.Name,
			Status:                driver.Status,
			Latitude:              driver.CurrentLatitude,
			Longitude:             driver.CurrentLongitude,
			AvailableDriveMins:    driver.AvailableDriveMins,
			AvailableDutyMins:     driver.AvailableDutyMins,
			DistanceToPickupMiles: distance,
			ETAToPickupMins:       etaMins,
			HasTWIC:               driver.HasTWIC,
		})
	}

	// Sort by distance
	sort.Slice(availability, func(i, j int) bool {
		return availability[i].DistanceToPickupMiles < availability[j].DistanceToPickupMiles
	})

	return availability, nil
}

// Helper methods

func (s *DispatchService) calculateTripMetrics(ctx context.Context, stops []CreateStopInput) (float64, int) {
	var totalMiles float64
	var totalDuration int

	for i := 0; i < len(stops)-1; i++ {
		// Would calculate actual distance between stops using location coordinates
		totalMiles += 25 // Placeholder
		totalDuration += stops[i].EstimatedDurationMins
	}
	totalDuration += stops[len(stops)-1].EstimatedDurationMins

	// Add drive time (assume 45 mph average)
	totalDuration += int(totalMiles / 0.75)

	return totalMiles, totalDuration
}

func (s *DispatchService) checkAllStopsComplete(ctx context.Context, tripID uuid.UUID) bool {
	stops, err := s.stopRepo.GetByTripID(ctx, tripID)
	if err != nil {
		return false
	}

	for _, stop := range stops {
		if stop.Status != domain.StopStatusCompleted && stop.Status != domain.StopStatusSkipped {
			return false
		}
	}
	return true
}

func (s *DispatchService) calculateStreetTurnScore(opp *domain.StreetTurnOpportunity) int {
	score := 100

	// Penalize for distance
	if opp.DistanceMiles > 10 {
		score -= int(opp.DistanceMiles - 10)
	}

	// Penalize for time gap between deliveries
	hours := opp.ExportPickupDate.Sub(opp.ImportDeliveryDate).Hours()
	if hours > 4 {
		score -= int(hours - 4) * 5
	}

	if score < 0 {
		score = 0
	}
	return score
}

func (s *DispatchService) calculateStreetTurnSavings(opp *domain.StreetTurnOpportunity) float64 {
	// Estimate savings: avoided empty return + avoided empty pickup
	emptyReturnMiles := 30.0 // Average return to terminal
	emptyPickupMiles := 30.0 // Average pickup from terminal
	ratePerMile := 3.50

	savedMiles := emptyReturnMiles + emptyPickupMiles - opp.DistanceMiles
	if savedMiles < 0 {
		savedMiles = 0
	}

	return savedMiles * ratePerMile
}

func (s *DispatchService) haversineDistance(lat1, lon1, lat2, lon2 float64) float64 {
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
