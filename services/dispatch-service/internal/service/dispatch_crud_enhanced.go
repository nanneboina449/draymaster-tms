package service

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/draymaster/services/dispatch-service/internal/domain"
	"github.com/draymaster/services/dispatch-service/internal/repository"
	apperrors "github.com/draymaster/shared/pkg/errors"
	"github.com/draymaster/shared/pkg/database"
	"github.com/draymaster/shared/pkg/kafka"
	"github.com/draymaster/shared/pkg/logger"
)

// DispatchCRUDService provides comprehensive CRUD operations for trips
type DispatchCRUDService struct {
	db            *database.DB
	tripRepo      repository.TripRepository
	stopRepo      repository.TripStopRepository
	driverRepo    repository.DriverRepository
	eventProducer *kafka.Producer
	logger        *logger.Logger
}

// NewDispatchCRUDService creates a new dispatch CRUD service
func NewDispatchCRUDService(
	db *database.DB,
	tripRepo repository.TripRepository,
	stopRepo repository.TripStopRepository,
	driverRepo repository.DriverRepository,
	eventProducer *kafka.Producer,
	log *logger.Logger,
) *DispatchCRUDService {
	return &DispatchCRUDService{
		db:            db,
		tripRepo:      tripRepo,
		stopRepo:      stopRepo,
		driverRepo:    driverRepo,
		eventProducer: eventProducer,
		logger:        log,
	}
}

// UpdateTripInput contains input for updating a trip
type UpdateTripInput struct {
	PlannedStartTime *time.Time
	DriverID         *uuid.UUID
	TractorID        *uuid.UUID
	UpdatedBy        string
}

// UpdateTrip updates an existing trip (partial update)
func (s *DispatchCRUDService) UpdateTrip(ctx context.Context, tripID uuid.UUID, input UpdateTripInput) (*domain.Trip, error) {
	s.logger.Infow("Updating trip", "trip_id", tripID)

	trip, err := s.tripRepo.GetByID(ctx, tripID)
	if err != nil {
		return nil, apperrors.NotFoundError("trip", tripID.String())
	}

	// Validate trip can be updated
	if trip.Status == domain.TripStatusCompleted ||
	   trip.Status == domain.TripStatusCancelled ||
	   trip.Status == domain.TripStatusFailed {
		return nil, apperrors.InvalidStateError(
			string(trip.Status),
			"planned, assigned, or dispatched",
		)
	}

	// Apply updates
	updated := false

	if input.PlannedStartTime != nil {
		trip.PlannedStartTime = input.PlannedStartTime
		// Recalculate planned end time
		if trip.EstimatedDurationMins > 0 {
			endTime := input.PlannedStartTime.Add(time.Duration(trip.EstimatedDurationMins) * time.Minute)
			trip.PlannedEndTime = &endTime
		}
		updated = true
	}

	if input.DriverID != nil {
		// Validate driver if provided
		if *input.DriverID != uuid.Nil {
			driver, err := s.driverRepo.GetByID(ctx, *input.DriverID)
			if err != nil {
				return nil, apperrors.NotFoundError("driver", input.DriverID.String())
			}
			if driver.Status != "AVAILABLE" && driver.Status != "ON_DUTY" {
				return nil, apperrors.InvalidStateError(driver.Status, "AVAILABLE or ON_DUTY")
			}
			trip.DriverID = input.DriverID
		} else {
			trip.DriverID = nil // Unassign driver
		}
		updated = true
	}

	if input.TractorID != nil {
		trip.TractorID = input.TractorID
		updated = true
	}

	if !updated {
		return trip, nil // No changes
	}

	trip.UpdatedAt = time.Now()

	if err := s.tripRepo.Update(ctx, trip); err != nil {
		return nil, apperrors.DatabaseError("update trip", err)
	}

	// Load trip details
	stops, _ := s.stopRepo.GetByTripID(ctx, tripID)
	trip.Stops = stops

	s.logger.Infow("Trip updated",
		"trip_id", tripID,
		"updated_by", input.UpdatedBy,
	)

	return trip, nil
}

// CancelTrip cancels a trip
func (s *DispatchCRUDService) CancelTrip(ctx context.Context, tripID uuid.UUID, reason, cancelledBy string) error {
	s.logger.Infow("Cancelling trip", "trip_id", tripID)

	trip, err := s.tripRepo.GetByID(ctx, tripID)
	if err != nil {
		return apperrors.NotFoundError("trip", tripID.String())
	}

	// Validate trip can be cancelled
	if trip.Status == domain.TripStatusCompleted || trip.Status == domain.TripStatusCancelled {
		return apperrors.InvalidStateError(
			string(trip.Status),
			"planned, assigned, dispatched, or in_progress",
		)
	}

	// Update status
	trip.Status = domain.TripStatusCancelled
	trip.UpdatedAt = time.Now()

	if err := s.tripRepo.Update(ctx, trip); err != nil {
		return apperrors.DatabaseError("cancel trip", err)
	}

	// Cancel all pending stops
	stops, _ := s.stopRepo.GetByTripID(ctx, tripID)
	for _, stop := range stops {
		if stop.Status == domain.StopStatusPending || stop.Status == domain.StopStatusEnRoute {
			stop.Status = domain.StopStatusCancelled
			_ = s.stopRepo.Update(ctx, &stop)
		}
	}

	// Publish event
	event := kafka.NewEvent("dispatch.trip.cancelled", "dispatch-service", map[string]interface{}{
		"trip_id":      tripID.String(),
		"trip_number":  trip.TripNumber,
		"reason":       reason,
		"cancelled_by": cancelledBy,
	})
	_ = s.eventProducer.Publish(ctx, "dispatch.trip.cancelled", event)

	s.logger.Infow("Trip cancelled",
		"trip_id", tripID,
		"reason", reason,
	)

	return nil
}

// DeleteTrip soft deletes a trip
func (s *DispatchCRUDService) DeleteTrip(ctx context.Context, tripID uuid.UUID, deletedBy string) error {
	s.logger.Infow("Deleting trip", "trip_id", tripID)

	trip, err := s.tripRepo.GetByID(ctx, tripID)
	if err != nil {
		return apperrors.NotFoundError("trip", tripID.String())
	}

	// Validate trip can be deleted
	if trip.Status != domain.TripStatusCancelled && trip.Status != domain.TripStatusPlanned {
		return apperrors.New("CANNOT_DELETE", "only cancelled or planned trips can be deleted")
	}

	// Execute in transaction
	err = s.db.Transaction(ctx, func(tx pgx.Tx) error {
		// Delete stops
		if err := s.stopRepo.DeleteByTripID(ctx, tripID); err != nil {
			return apperrors.DatabaseError("delete stops", err)
		}

		// Delete trip
		if err := s.tripRepo.Delete(ctx, tripID); err != nil {
			return apperrors.DatabaseError("delete trip", err)
		}

		return nil
	})

	if err != nil {
		return err
	}

	s.logger.Infow("Trip deleted",
		"trip_id", tripID,
		"deleted_by", deletedBy,
	)

	return nil
}

// ListTripsFilter contains filter criteria for listing trips
type ListTripsFilter struct {
	Status           []domain.TripStatus
	Type             []domain.TripType
	DriverID         *uuid.UUID
	TripNumber       string
	PlannedAfter     *time.Time
	PlannedBefore    *time.Time
	CompletedAfter   *time.Time
	CompletedBefore  *time.Time
	IsStreetTurn     *bool
	IsDualTransaction *bool
	Page             int
	PageSize         int
	SortBy           string // "created_at", "trip_number", "planned_start_time"
	SortOrder        string // "asc", "desc"
}

// ListTrips retrieves trips with filtering, pagination, and sorting
func (s *DispatchCRUDService) ListTrips(ctx context.Context, filter ListTripsFilter) (*TripListResult, error) {
	s.logger.Infow("Listing trips", "filter", filter)

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
		filter.SortBy = "planned_start_time"
	}
	if filter.SortOrder == "" {
		filter.SortOrder = "desc"
	}

	// Build repository filter
	repoFilter := repository.TripFilter{
		Status:            filter.Status,
		Type:              filter.Type,
		DriverID:          filter.DriverID,
		TripNumber:        filter.TripNumber,
		PlannedAfter:      filter.PlannedAfter,
		PlannedBefore:     filter.PlannedBefore,
		CompletedAfter:    filter.CompletedAfter,
		CompletedBefore:   filter.CompletedBefore,
		IsStreetTurn:      filter.IsStreetTurn,
		IsDualTransaction: filter.IsDualTransaction,
		Page:              filter.Page,
		PageSize:          filter.PageSize,
		SortBy:            filter.SortBy,
		SortOrder:         filter.SortOrder,
	}

	trips, total, err := s.tripRepo.List(ctx, repoFilter)
	if err != nil {
		return nil, apperrors.DatabaseError("list trips", err)
	}

	// Load stops for all trips (batch load)
	tripIDs := make([]uuid.UUID, len(trips))
	for i, trip := range trips {
		tripIDs[i] = trip.ID
	}

	stopsMap := make(map[uuid.UUID][]domain.TripStop)
	if len(tripIDs) > 0 {
		allStops, err := s.stopRepo.GetByTripIDs(ctx, tripIDs)
		if err == nil {
			for _, stop := range allStops {
				stopsMap[stop.TripID] = append(stopsMap[stop.TripID], stop)
			}
		}
	}

	// Attach stops
	for i := range trips {
		if stops, ok := stopsMap[trips[i].ID]; ok {
			trips[i].Stops = stops
		}
	}

	result := &TripListResult{
		Trips:      trips,
		Total:      total,
		Page:       filter.Page,
		PageSize:   filter.PageSize,
		TotalPages: int((total + int64(filter.PageSize) - 1) / int64(filter.PageSize)),
	}

	return result, nil
}

// TripListResult contains paginated trip list
type TripListResult struct {
	Trips      []domain.Trip `json:"trips"`
	Total      int64         `json:"total"`
	Page       int           `json:"page"`
	PageSize   int           `json:"page_size"`
	TotalPages int           `json:"total_pages"`
}

// UpdateStopInput contains input for updating a stop
type UpdateStopInput struct {
	AppointmentTime       *time.Time
	AppointmentNumber     *string
	EstimatedDurationMins *int
	FreeTimeMins          *int
	Notes                 *string
	UpdatedBy             string
}

// UpdateStop updates a trip stop (partial update)
func (s *DispatchCRUDService) UpdateStop(ctx context.Context, tripID, stopID uuid.UUID, input UpdateStopInput) (*domain.TripStop, error) {
	s.logger.Infow("Updating stop", "trip_id", tripID, "stop_id", stopID)

	stop, err := s.stopRepo.GetByID(ctx, stopID)
	if err != nil {
		return nil, apperrors.NotFoundError("stop", stopID.String())
	}

	if stop.TripID != tripID {
		return nil, apperrors.New("INVALID_TRIP", "stop does not belong to trip")
	}

	// Validate stop can be updated
	if stop.Status == domain.StopStatusCompleted || stop.Status == domain.StopStatusCancelled {
		return nil, apperrors.InvalidStateError(
			string(stop.Status),
			"pending, en_route, or arrived",
		)
	}

	// Apply updates
	updated := false

	if input.AppointmentTime != nil {
		stop.AppointmentTime = input.AppointmentTime
		updated = true
	}
	if input.AppointmentNumber != nil {
		stop.AppointmentNumber = *input.AppointmentNumber
		updated = true
	}
	if input.EstimatedDurationMins != nil {
		stop.EstimatedDurationMins = *input.EstimatedDurationMins
		updated = true
	}
	if input.FreeTimeMins != nil {
		stop.FreeTimeMins = *input.FreeTimeMins
		updated = true
	}
	if input.Notes != nil {
		stop.Notes = *input.Notes
		updated = true
	}

	if !updated {
		return stop, nil // No changes
	}

	stop.UpdatedAt = time.Now()

	if err := s.stopRepo.Update(ctx, stop); err != nil {
		return nil, apperrors.DatabaseError("update stop", err)
	}

	s.logger.Infow("Stop updated",
		"stop_id", stopID,
		"updated_by", input.UpdatedBy,
	)

	return stop, nil
}

// SkipStop marks a stop as skipped
func (s *DispatchCRUDService) SkipStop(ctx context.Context, tripID, stopID uuid.UUID, reason, skippedBy string) error {
	s.logger.Infow("Skipping stop", "trip_id", tripID, "stop_id", stopID)

	stop, err := s.stopRepo.GetByID(ctx, stopID)
	if err != nil {
		return apperrors.NotFoundError("stop", stopID.String())
	}

	if stop.TripID != tripID {
		return apperrors.New("INVALID_TRIP", "stop does not belong to trip")
	}

	// Validate stop can be skipped
	if stop.Status == domain.StopStatusCompleted || stop.Status == domain.StopStatusCancelled {
		return apperrors.InvalidStateError(
			string(stop.Status),
			"pending, en_route, or arrived",
		)
	}

	// Update status
	stop.Status = domain.StopStatusSkipped
	stop.Notes = fmt.Sprintf("Skipped: %s", reason)
	stop.UpdatedAt = time.Now()

	if err := s.stopRepo.Update(ctx, stop); err != nil {
		return apperrors.DatabaseError("skip stop", err)
	}

	// Update trip current stop sequence
	trip, _ := s.tripRepo.GetByID(ctx, tripID)
	if trip != nil && trip.CurrentStopSequence == stop.Sequence {
		trip.CurrentStopSequence = stop.Sequence + 1
		_ = s.tripRepo.Update(ctx, trip)
	}

	s.logger.Infow("Stop skipped",
		"stop_id", stopID,
		"reason", reason,
	)

	return nil
}

// GetTripWithDetails retrieves trip with all associations (optimized)
func (s *DispatchCRUDService) GetTripWithDetails(ctx context.Context, tripID uuid.UUID) (*domain.Trip, error) {
	trip, err := s.tripRepo.GetByID(ctx, tripID)
	if err != nil {
		return nil, apperrors.NotFoundError("trip", tripID.String())
	}

	// Load stops
	stops, err := s.stopRepo.GetByTripID(ctx, tripID)
	if err == nil {
		trip.Stops = stops
	}

	// Load driver
	if trip.DriverID != nil {
		driver, err := s.driverRepo.GetByID(ctx, *trip.DriverID)
		if err == nil {
			trip.Driver = driver
		}
	}

	return trip, nil
}

// GetTripsByDriver retrieves all trips for a driver
func (s *DispatchCRUDService) GetTripsByDriver(ctx context.Context, driverID uuid.UUID, startDate, endDate *time.Time) ([]domain.Trip, error) {
	filter := ListTripsFilter{
		DriverID:      &driverID,
		PlannedAfter:  startDate,
		PlannedBefore: endDate,
		PageSize:      1000, // Large page size for single driver
	}

	result, err := s.ListTrips(ctx, filter)
	if err != nil {
		return nil, err
	}

	return result.Trips, nil
}

// GetActiveTrips retrieves all active trips
func (s *DispatchCRUDService) GetActiveTrips(ctx context.Context) ([]domain.Trip, error) {
	filter := ListTripsFilter{
		Status: []domain.TripStatus{
			domain.TripStatusDispatched,
			domain.TripStatusEnRoute,
			domain.TripStatusInProgress,
		},
		PageSize: 1000,
		SortBy:   "planned_start_time",
		SortOrder: "asc",
	}

	result, err := s.ListTrips(ctx, filter)
	if err != nil {
		return nil, err
	}

	return result.Trips, nil
}

// GetUnassignedTrips retrieves trips without driver assignment
func (s *DispatchCRUDService) GetUnassignedTrips(ctx context.Context) ([]domain.Trip, error) {
	filter := ListTripsFilter{
		Status: []domain.TripStatus{
			domain.TripStatusPlanned,
		},
		PageSize:  1000,
		SortBy:    "planned_start_time",
		SortOrder: "asc",
	}

	result, err := s.ListTrips(ctx, filter)
	if err != nil {
		return nil, err
	}

	// Filter to only unassigned (no driver)
	var unassigned []domain.Trip
	for _, trip := range result.Trips {
		if trip.DriverID == nil {
			unassigned = append(unassigned, trip)
		}
	}

	return unassigned, nil
}

// SearchTrips performs text search on trips
func (s *DispatchCRUDService) SearchTrips(ctx context.Context, query string, limit int) ([]domain.Trip, error) {
	s.logger.Infow("Searching trips", "query", query)

	if limit < 1 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}

	trips, err := s.tripRepo.Search(ctx, query, limit)
	if err != nil {
		return nil, apperrors.DatabaseError("search trips", err)
	}

	return trips, nil
}

// BulkAssignDriver assigns a driver to multiple trips
func (s *DispatchCRUDService) BulkAssignDriver(ctx context.Context, tripIDs []uuid.UUID, driverID uuid.UUID, assignedBy string) error {
	s.logger.Infow("Bulk assigning driver",
		"trip_count", len(tripIDs),
		"driver_id", driverID,
	)

	if len(tripIDs) == 0 {
		return apperrors.ValidationError("trip_ids cannot be empty", "trip_ids", tripIDs)
	}

	if len(tripIDs) > 50 {
		return apperrors.ValidationError("cannot assign more than 50 trips at once", "trip_ids", len(tripIDs))
	}

	// Validate driver
	driver, err := s.driverRepo.GetByID(ctx, driverID)
	if err != nil {
		return apperrors.NotFoundError("driver", driverID.String())
	}

	if driver.Status != "AVAILABLE" && driver.Status != "ON_DUTY" {
		return apperrors.InvalidStateError(driver.Status, "AVAILABLE or ON_DUTY")
	}

	// Execute in transaction
	err = s.db.Transaction(ctx, func(tx pgx.Tx) error {
		for _, tripID := range tripIDs {
			trip, err := s.tripRepo.GetByID(ctx, tripID)
			if err != nil {
				s.logger.Warnw("Trip not found in bulk assign", "trip_id", tripID)
				continue
			}

			// Validate trip can be assigned
			if trip.Status != domain.TripStatusPlanned && trip.Status != domain.TripStatusAssigned {
				s.logger.Warnw("Trip cannot be assigned",
					"trip_id", tripID,
					"status", trip.Status,
				)
				continue
			}

			// Assign driver
			trip.DriverID = &driverID
			trip.Status = domain.TripStatusAssigned
			trip.UpdatedAt = time.Now()

			if err := s.tripRepo.Update(ctx, trip); err != nil {
				return apperrors.DatabaseError("update trip", err)
			}

			// Publish event
			event := kafka.NewEvent(kafka.Topics.TripAssigned, "dispatch-service", map[string]interface{}{
				"trip_id":      tripID.String(),
				"driver_id":    driverID.String(),
				"driver_name":  driver.Name,
				"assigned_by":  assignedBy,
			})
			_ = s.eventProducer.Publish(ctx, kafka.Topics.TripAssigned, event)
		}
		return nil
	})

	if err != nil {
		return err
	}

	s.logger.Infow("Bulk driver assignment completed",
		"trip_count", len(tripIDs),
		"driver_id", driverID,
	)

	return nil
}

// GetTripStatistics retrieves statistics for trips
func (s *DispatchCRUDService) GetTripStatistics(ctx context.Context, startDate, endDate time.Time) (*TripStatistics, error) {
	stats := &TripStatistics{
		Period:    fmt.Sprintf("%s to %s", startDate.Format("2006-01-02"), endDate.Format("2006-01-02")),
		StartDate: startDate,
		EndDate:   endDate,
	}

	// Get all trips in period
	filter := ListTripsFilter{
		PlannedAfter:  &startDate,
		PlannedBefore: &endDate,
		PageSize:      10000, // Large page size for stats
	}

	result, err := s.ListTrips(ctx, filter)
	if err != nil {
		return nil, err
	}

	stats.TotalTrips = int(result.Total)

	// Count by status
	stats.ByStatus = make(map[string]int)
	for _, trip := range result.Trips {
		stats.ByStatus[string(trip.Status)]++

		if trip.Status == domain.TripStatusCompleted {
			stats.CompletedTrips++
			stats.TotalMiles += trip.TotalMiles
			stats.TotalRevenue += trip.Revenue
		}
	}

	// Count by type
	stats.ByType = make(map[string]int)
	for _, trip := range result.Trips {
		stats.ByType[string(trip.Type)]++
	}

	// Calculate averages
	if stats.CompletedTrips > 0 {
		stats.AvgMilesPerTrip = stats.TotalMiles / float64(stats.CompletedTrips)
		stats.AvgRevenuePerTrip = stats.TotalRevenue / float64(stats.CompletedTrips)
	}

	return stats, nil
}

// TripStatistics contains trip statistics
type TripStatistics struct {
	Period            string         `json:"period"`
	StartDate         time.Time      `json:"start_date"`
	EndDate           time.Time      `json:"end_date"`
	TotalTrips        int            `json:"total_trips"`
	CompletedTrips    int            `json:"completed_trips"`
	TotalMiles        float64        `json:"total_miles"`
	TotalRevenue      float64        `json:"total_revenue"`
	AvgMilesPerTrip   float64        `json:"avg_miles_per_trip"`
	AvgRevenuePerTrip float64        `json:"avg_revenue_per_trip"`
	ByStatus          map[string]int `json:"by_status"`
	ByType            map[string]int `json:"by_type"`
}
