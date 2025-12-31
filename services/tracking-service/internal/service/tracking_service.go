package service

import (
	"context"
	"fmt"
	"math"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"

	"github.com/draymaster/services/tracking-service/internal/domain"
	"github.com/draymaster/services/tracking-service/internal/repository"
	"github.com/draymaster/shared/pkg/kafka"
	"github.com/draymaster/shared/pkg/logger"
)

// TrackingService handles GPS tracking and milestone recording
type TrackingService struct {
	locationRepo  repository.LocationRepository
	milestoneRepo repository.MilestoneRepository
	geofenceRepo  repository.GeofenceRepository
	redis         *redis.Client
	eventProducer *kafka.Producer
	logger        *logger.Logger
	
	// In-memory geofence cache
	geofenceCache map[uuid.UUID]*domain.Geofence
	cacheMu       sync.RWMutex
}

// NewTrackingService creates a new tracking service
func NewTrackingService(
	locationRepo repository.LocationRepository,
	milestoneRepo repository.MilestoneRepository,
	geofenceRepo repository.GeofenceRepository,
	redisClient *redis.Client,
	eventProducer *kafka.Producer,
	log *logger.Logger,
) *TrackingService {
	svc := &TrackingService{
		locationRepo:  locationRepo,
		milestoneRepo: milestoneRepo,
		geofenceRepo:  geofenceRepo,
		redis:         redisClient,
		eventProducer: eventProducer,
		logger:        log,
		geofenceCache: make(map[uuid.UUID]*domain.Geofence),
	}
	
	// Load geofences into cache
	go svc.loadGeofenceCache(context.Background())
	
	return svc
}

// RecordLocation records a GPS location and checks geofences
func (s *TrackingService) RecordLocation(ctx context.Context, input RecordLocationInput) (*domain.LocationRecord, error) {
	record := &domain.LocationRecord{
		ID:             uuid.New(),
		DriverID:       input.DriverID,
		TractorID:      input.TractorID,
		TripID:         input.TripID,
		Latitude:       input.Latitude,
		Longitude:      input.Longitude,
		SpeedMPH:       input.SpeedMPH,
		Heading:        input.Heading,
		AccuracyMeters: input.AccuracyMeters,
		Source:         input.Source,
		RecordedAt:     input.RecordedAt,
		ReceivedAt:     time.Now(),
	}

	// Store in TimescaleDB
	if err := s.locationRepo.Create(ctx, record); err != nil {
		return nil, fmt.Errorf("failed to store location: %w", err)
	}

	// Update current location in Redis for real-time queries
	if err := s.updateCurrentLocation(ctx, record); err != nil {
		s.logger.Warnw("Failed to update Redis location", "error", err)
	}

	// Check geofences asynchronously
	go s.checkGeofences(context.Background(), record)

	// Publish location update event
	event := kafka.NewEvent(kafka.Topics.LocationUpdated, "tracking-service", map[string]interface{}{
		"driver_id": input.DriverID.String(),
		"trip_id":   input.TripID,
		"latitude":  input.Latitude,
		"longitude": input.Longitude,
		"speed":     input.SpeedMPH,
	})
	_ = s.eventProducer.Publish(ctx, kafka.Topics.LocationUpdated, event)

	return record, nil
}

// RecordLocationInput contains input for recording location
type RecordLocationInput struct {
	DriverID       uuid.UUID
	TractorID      *uuid.UUID
	TripID         *uuid.UUID
	Latitude       float64
	Longitude      float64
	SpeedMPH       float64
	Heading        float64
	AccuracyMeters float64
	Source         string
	RecordedAt     time.Time
}

// GetCurrentLocation retrieves current location from Redis
func (s *TrackingService) GetCurrentLocation(ctx context.Context, driverID uuid.UUID) (*domain.CurrentLocation, error) {
	key := fmt.Sprintf("location:current:%s", driverID.String())
	
	data, err := s.redis.HGetAll(ctx, key).Result()
	if err != nil {
		return nil, fmt.Errorf("failed to get current location: %w", err)
	}

	if len(data) == 0 {
		return nil, fmt.Errorf("no location found for driver")
	}

	// Parse Redis hash to CurrentLocation
	location := &domain.CurrentLocation{
		DriverID: driverID,
	}
	
	// Would parse data map to struct
	// Simplified for brevity
	
	return location, nil
}

// GetFleetLocations retrieves all active driver locations
func (s *TrackingService) GetFleetLocations(ctx context.Context, driverIDs []uuid.UUID) ([]domain.CurrentLocation, error) {
	var locations []domain.CurrentLocation
	
	for _, driverID := range driverIDs {
		loc, err := s.GetCurrentLocation(ctx, driverID)
		if err != nil {
			continue
		}
		locations = append(locations, *loc)
	}
	
	return locations, nil
}

// GetLocationHistory retrieves historical GPS points
func (s *TrackingService) GetLocationHistory(ctx context.Context, driverID uuid.UUID, tripID *uuid.UUID, startTime, endTime time.Time, intervalSecs int) ([]domain.LocationRecord, error) {
	return s.locationRepo.GetHistory(ctx, driverID, tripID, startTime, endTime, intervalSecs)
}

// RecordMilestone records a tracking milestone
func (s *TrackingService) RecordMilestone(ctx context.Context, input RecordMilestoneInput) (*domain.Milestone, error) {
	milestone := &domain.Milestone{
		ID:              uuid.New(),
		TripID:          input.TripID,
		StopID:          input.StopID,
		Type:            input.Type,
		OccurredAt:      input.OccurredAt,
		Latitude:        input.Latitude,
		Longitude:       input.Longitude,
		LocationID:      input.LocationID,
		ContainerID:     input.ContainerID,
		ContainerNumber: input.ContainerNumber,
		Metadata:        input.Metadata,
		Source:          input.Source,
		RecordedBy:      input.RecordedBy,
		CreatedAt:       time.Now(),
	}

	// Lookup location name if ID provided
	if input.LocationID != nil {
		// Would lookup location name from location service
		milestone.LocationName = "Location Name" // Placeholder
	}

	if err := s.milestoneRepo.Create(ctx, milestone); err != nil {
		return nil, fmt.Errorf("failed to record milestone: %w", err)
	}

	// Publish milestone event
	event := kafka.NewEvent(kafka.Topics.MilestoneRecorded, "tracking-service", map[string]interface{}{
		"trip_id":       input.TripID.String(),
		"milestone_id":  milestone.ID.String(),
		"type":          input.Type,
		"occurred_at":   input.OccurredAt,
		"container_id":  input.ContainerID,
	})
	_ = s.eventProducer.Publish(ctx, kafka.Topics.MilestoneRecorded, event)

	s.logger.Infow("Milestone recorded",
		"trip_id", input.TripID,
		"type", input.Type,
	)

	return milestone, nil
}

// RecordMilestoneInput contains input for recording milestone
type RecordMilestoneInput struct {
	TripID          uuid.UUID
	StopID          *uuid.UUID
	Type            domain.MilestoneType
	OccurredAt      time.Time
	Latitude        float64
	Longitude       float64
	LocationID      *uuid.UUID
	ContainerID     *uuid.UUID
	ContainerNumber string
	Metadata        map[string]string
	Source          string
	RecordedBy      string
}

// GetTripMilestones retrieves milestones for a trip
func (s *TrackingService) GetTripMilestones(ctx context.Context, tripID uuid.UUID) ([]domain.Milestone, error) {
	return s.milestoneRepo.GetByTripID(ctx, tripID)
}

// CalculateTripETA calculates ETAs for all stops in a trip
func (s *TrackingService) CalculateTripETA(ctx context.Context, tripID uuid.UUID) (*domain.TripETA, error) {
	// Get current driver location
	// Get remaining stops
	// Calculate ETA for each stop considering:
	// - Current location
	// - Traffic conditions
	// - Historical travel times
	// - Scheduled appointment times
	
	eta := &domain.TripETA{
		TripID:            tripID,
		Stops:             []domain.StopETA{},
		CalculatedAt:      time.Now(),
		TrafficConditions: "moderate",
	}

	// Would call external routing API for accurate ETAs
	// Simplified implementation
	
	return eta, nil
}

// CalculateETA calculates ETA between two points
func (s *TrackingService) CalculateETA(ctx context.Context, originLat, originLon, destLat, destLon float64, departureTime time.Time) (*ETAResult, error) {
	// Calculate distance using Haversine
	distance := s.haversineDistance(originLat, originLon, destLat, destLon)
	
	// Estimate duration (assume 35 mph average for drayage)
	durationMins := int(distance / 35.0 * 60)
	
	// Apply traffic factor based on time of day
	trafficFactor := s.getTrafficFactor(departureTime)
	durationMins = int(float64(durationMins) * trafficFactor)
	
	eta := departureTime.Add(time.Duration(durationMins) * time.Minute)
	
	return &ETAResult{
		ETA:               eta,
		DurationMins:      durationMins,
		DistanceMiles:     distance,
		TrafficConditions: s.getTrafficConditions(trafficFactor),
	}, nil
}

// ETAResult contains ETA calculation result
type ETAResult struct {
	ETA               time.Time
	DurationMins      int
	DistanceMiles     float64
	TrafficConditions string
}

// CreateGeofence creates a new geofence
func (s *TrackingService) CreateGeofence(ctx context.Context, input CreateGeofenceInput) (*domain.Geofence, error) {
	geofence := &domain.Geofence{
		ID:              uuid.New(),
		LocationID:      input.LocationID,
		Name:            input.Name,
		Type:            input.Type,
		CenterLatitude:  input.CenterLatitude,
		CenterLongitude: input.CenterLongitude,
		RadiusMeters:    input.RadiusMeters,
		Polygon:         input.Polygon,
		IsActive:        true,
		CreatedAt:       time.Now(),
		UpdatedAt:       time.Now(),
	}

	if err := s.geofenceRepo.Create(ctx, geofence); err != nil {
		return nil, fmt.Errorf("failed to create geofence: %w", err)
	}

	// Update cache
	s.cacheMu.Lock()
	s.geofenceCache[geofence.ID] = geofence
	s.cacheMu.Unlock()

	return geofence, nil
}

// CreateGeofenceInput contains input for creating geofence
type CreateGeofenceInput struct {
	LocationID      uuid.UUID
	Name            string
	Type            string // circle, polygon
	CenterLatitude  float64
	CenterLongitude float64
	RadiusMeters    float64
	Polygon         []domain.Coordinate
}

// CheckGeofence checks if a point is inside a geofence
func (s *TrackingService) CheckGeofence(ctx context.Context, geofenceID uuid.UUID, lat, lon float64) (bool, float64, error) {
	s.cacheMu.RLock()
	geofence, ok := s.geofenceCache[geofenceID]
	s.cacheMu.RUnlock()

	if !ok {
		gf, err := s.geofenceRepo.GetByID(ctx, geofenceID)
		if err != nil {
			return false, 0, err
		}
		geofence = gf
	}

	if geofence.Type == "circle" {
		distance := s.haversineDistance(lat, lon, geofence.CenterLatitude, geofence.CenterLongitude)
		distanceMeters := distance * 1609.34 // Convert miles to meters
		isInside := distanceMeters <= geofence.RadiusMeters
		return isInside, distanceMeters, nil
	}

	// Polygon check using ray casting algorithm
	if geofence.Type == "polygon" && len(geofence.Polygon) > 0 {
		isInside := s.pointInPolygon(lat, lon, geofence.Polygon)
		return isInside, 0, nil
	}

	return false, 0, nil
}

// GetContainerLocation retrieves current container location
func (s *TrackingService) GetContainerLocation(ctx context.Context, containerID uuid.UUID) (*domain.ContainerLocation, error) {
	// Would lookup container location from container tracking
	// This combines data from:
	// - Order service (static location type)
	// - Tracking service (GPS if in transit)
	// - Terminal API (if at port)
	
	return &domain.ContainerLocation{
		ContainerID:  containerID,
		LocationType: "transit",
		LastUpdate:   time.Now(),
	}, nil
}

// GetContainerHistory retrieves container movement history
func (s *TrackingService) GetContainerHistory(ctx context.Context, containerID uuid.UUID, startTime, endTime time.Time) ([]domain.ContainerEvent, error) {
	// Would aggregate events from milestones and location data
	return []domain.ContainerEvent{}, nil
}

// Internal methods

func (s *TrackingService) updateCurrentLocation(ctx context.Context, record *domain.LocationRecord) error {
	key := fmt.Sprintf("location:current:%s", record.DriverID.String())
	
	// Store as Redis hash for efficient partial updates
	data := map[string]interface{}{
		"latitude":    record.Latitude,
		"longitude":   record.Longitude,
		"speed":       record.SpeedMPH,
		"heading":     record.Heading,
		"recorded_at": record.RecordedAt.Unix(),
		"trip_id":     "",
	}
	
	if record.TripID != nil {
		data["trip_id"] = record.TripID.String()
	}
	
	pipe := s.redis.Pipeline()
	pipe.HSet(ctx, key, data)
	pipe.Expire(ctx, key, 24*time.Hour)
	_, err := pipe.Exec(ctx)
	
	// Also add to geo index for proximity queries
	geoKey := "location:geo"
	pipe.GeoAdd(ctx, geoKey, &redis.GeoLocation{
		Name:      record.DriverID.String(),
		Latitude:  record.Latitude,
		Longitude: record.Longitude,
	})
	
	return err
}

func (s *TrackingService) checkGeofences(ctx context.Context, record *domain.LocationRecord) {
	s.cacheMu.RLock()
	geofences := make([]*domain.Geofence, 0, len(s.geofenceCache))
	for _, gf := range s.geofenceCache {
		if gf.IsActive {
			geofences = append(geofences, gf)
		}
	}
	s.cacheMu.RUnlock()

	previousKey := fmt.Sprintf("geofence:state:%s", record.DriverID.String())
	previousStates, _ := s.redis.HGetAll(ctx, previousKey).Result()

	for _, geofence := range geofences {
		isInside, _, _ := s.CheckGeofence(ctx, geofence.ID, record.Latitude, record.Longitude)
		
		wasInside := previousStates[geofence.ID.String()] == "inside"
		
		if isInside && !wasInside {
			// Entered geofence
			s.handleGeofenceEvent(ctx, geofence, record, "enter")
			s.redis.HSet(ctx, previousKey, geofence.ID.String(), "inside")
		} else if !isInside && wasInside {
			// Exited geofence
			s.handleGeofenceEvent(ctx, geofence, record, "exit")
			s.redis.HSet(ctx, previousKey, geofence.ID.String(), "outside")
		}
	}
}

func (s *TrackingService) handleGeofenceEvent(ctx context.Context, geofence *domain.Geofence, record *domain.LocationRecord, eventType string) {
	topic := kafka.Topics.GeofenceEntered
	if eventType == "exit" {
		topic = kafka.Topics.GeofenceExited
	}

	event := kafka.NewEvent(topic, "tracking-service", map[string]interface{}{
		"geofence_id":   geofence.ID.String(),
		"geofence_name": geofence.Name,
		"location_id":   geofence.LocationID.String(),
		"driver_id":     record.DriverID.String(),
		"trip_id":       record.TripID,
		"event_type":    eventType,
		"latitude":      record.Latitude,
		"longitude":     record.Longitude,
	})
	
	_ = s.eventProducer.Publish(ctx, topic, event)

	s.logger.Infow("Geofence event",
		"type", eventType,
		"geofence", geofence.Name,
		"driver_id", record.DriverID,
	)
}

func (s *TrackingService) loadGeofenceCache(ctx context.Context) {
	geofences, err := s.geofenceRepo.GetAll(ctx)
	if err != nil {
		s.logger.Errorw("Failed to load geofence cache", "error", err)
		return
	}

	s.cacheMu.Lock()
	for _, gf := range geofences {
		s.geofenceCache[gf.ID] = gf
	}
	s.cacheMu.Unlock()

	s.logger.Infow("Geofence cache loaded", "count", len(geofences))
}

func (s *TrackingService) haversineDistance(lat1, lon1, lat2, lon2 float64) float64 {
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

func (s *TrackingService) pointInPolygon(lat, lon float64, polygon []domain.Coordinate) bool {
	n := len(polygon)
	inside := false

	j := n - 1
	for i := 0; i < n; i++ {
		if ((polygon[i].Longitude > lon) != (polygon[j].Longitude > lon)) &&
			(lat < (polygon[j].Latitude-polygon[i].Latitude)*(lon-polygon[i].Longitude)/
				(polygon[j].Longitude-polygon[i].Longitude)+polygon[i].Latitude) {
			inside = !inside
		}
		j = i
	}

	return inside
}

func (s *TrackingService) getTrafficFactor(t time.Time) float64 {
	hour := t.Hour()
	
	// Peak hours (7-9 AM, 4-7 PM)
	if (hour >= 7 && hour <= 9) || (hour >= 16 && hour <= 19) {
		return 1.5 // 50% longer
	}
	
	// Moderate traffic (6-7 AM, 9-11 AM, 3-4 PM, 7-8 PM)
	if (hour >= 6 && hour <= 7) || (hour >= 9 && hour <= 11) ||
		(hour >= 15 && hour <= 16) || (hour >= 19 && hour <= 20) {
		return 1.25 // 25% longer
	}
	
	// Light traffic
	return 1.0
}

func (s *TrackingService) getTrafficConditions(factor float64) string {
	if factor >= 1.4 {
		return "heavy"
	}
	if factor >= 1.2 {
		return "moderate"
	}
	return "light"
}
