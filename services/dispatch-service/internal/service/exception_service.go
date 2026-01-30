package service

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/draymaster/services/dispatch-service/internal/domain"
	"github.com/draymaster/services/dispatch-service/internal/repository"
	apperrors "github.com/draymaster/shared/pkg/errors"
	"github.com/draymaster/shared/pkg/kafka"
	"github.com/draymaster/shared/pkg/logger"
)

// ExceptionService handles exception management
type ExceptionService struct {
	exceptionRepo repository.ExceptionRepository
	tripRepo      repository.TripRepository
	eventProducer *kafka.Producer
	logger        *logger.Logger
}

// NewExceptionService creates a new exception service
func NewExceptionService(
	exceptionRepo repository.ExceptionRepository,
	tripRepo repository.TripRepository,
	eventProducer *kafka.Producer,
	log *logger.Logger,
) *ExceptionService {
	return &ExceptionService{
		exceptionRepo: exceptionRepo,
		tripRepo:      tripRepo,
		eventProducer: eventProducer,
		logger:        log,
	}
}

// CreateExceptionInput contains input for creating an exception
type CreateExceptionInput struct {
	TripID             uuid.UUID
	StopID             *uuid.UUID
	OrderID            *uuid.UUID
	ContainerID        *uuid.UUID
	DriverID           *uuid.UUID
	Type               domain.ExceptionType
	Severity           *domain.ExceptionSeverity // Optional, will be determined from type if not provided
	Title              string
	Description        string
	LocationID         *uuid.UUID
	Latitude           float64
	Longitude          float64
	ReportedBy         string
	ReportedByID       *uuid.UUID
	EstimatedDelayMins *int
	RequiresReschedule bool
	RequiresReassignment bool
	PhotoURLs          []string
	DocumentURLs       []string
	Metadata           map[string]string
	OccurredAt         *time.Time
}

// CreateException creates a new exception
func (s *ExceptionService) CreateException(ctx context.Context, input CreateExceptionInput) (*domain.Exception, error) {
	s.logger.Infow("Creating exception",
		"trip_id", input.TripID,
		"type", input.Type,
		"severity", input.Severity,
	)

	// Validate trip exists
	trip, err := s.tripRepo.GetByID(ctx, input.TripID)
	if err != nil {
		return nil, apperrors.NotFoundError("trip", input.TripID.String())
	}

	// Determine severity if not provided
	severity := domain.ExceptionSeverityMedium
	if input.Severity != nil {
		severity = *input.Severity
	} else {
		severity = domain.GetSeverityForType(input.Type)
	}

	// Set occurred time
	occurredAt := time.Now()
	if input.OccurredAt != nil {
		occurredAt = *input.OccurredAt
	}

	// Create exception
	exception := &domain.Exception{
		ID:                   uuid.New(),
		TripID:               input.TripID,
		StopID:               input.StopID,
		OrderID:              input.OrderID,
		ContainerID:          input.ContainerID,
		DriverID:             input.DriverID,
		Type:                 input.Type,
		Severity:             severity,
		Status:               domain.ExceptionStatusOpen,
		Title:                input.Title,
		Description:          input.Description,
		LocationID:           input.LocationID,
		Latitude:             input.Latitude,
		Longitude:            input.Longitude,
		ReportedBy:           input.ReportedBy,
		ReportedByID:         input.ReportedByID,
		EstimatedDelay:       input.EstimatedDelayMins,
		RequiresReschedule:   input.RequiresReschedule,
		RequiresReassignment: input.RequiresReassignment,
		PhotoURLs:            input.PhotoURLs,
		DocumentURLs:         input.DocumentURLs,
		Metadata:             input.Metadata,
		OccurredAt:           occurredAt,
		CreatedAt:            time.Now(),
		UpdatedAt:            time.Now(),
	}

	if err := s.exceptionRepo.Create(ctx, exception); err != nil {
		return nil, apperrors.DatabaseError("create exception", err)
	}

	// Update trip status if critical
	if exception.RequiresImmediateAction() {
		if trip.Status == domain.TripStatusInProgress || trip.Status == domain.TripStatusEnRoute {
			// Mark trip as having exception
			s.logger.Infow("Marking trip with exception",
				"trip_id", trip.ID,
				"exception_id", exception.ID,
			)
		}
	}

	// Publish exception created event
	event := kafka.NewEvent(kafka.Topics.ExceptionCreated, "dispatch-service", map[string]interface{}{
		"exception_id": exception.ID.String(),
		"trip_id":      exception.TripID.String(),
		"type":         exception.Type,
		"severity":     exception.Severity,
		"status":       exception.Status,
	})

	if err := s.eventProducer.Publish(ctx, kafka.Topics.ExceptionCreated, event); err != nil {
		s.logger.Warnw("Failed to publish exception created event", "error", err)
	}

	s.logger.Infow("Exception created",
		"exception_id", exception.ID,
		"type", exception.Type,
		"severity", exception.Severity,
	)

	return exception, nil
}

// AcknowledgeException acknowledges an exception
func (s *ExceptionService) AcknowledgeException(ctx context.Context, exceptionID uuid.UUID, acknowledgedBy string, acknowledgedByID *uuid.UUID) error {
	exception, err := s.exceptionRepo.GetByID(ctx, exceptionID)
	if err != nil {
		return apperrors.NotFoundError("exception", exceptionID.String())
	}

	if exception.Status != domain.ExceptionStatusOpen {
		return apperrors.InvalidStateError(string(exception.Status), string(domain.ExceptionStatusOpen))
	}

	now := time.Now()
	exception.Status = domain.ExceptionStatusAcknowledged
	exception.AcknowledgedAt = &now
	exception.AssignedTo = &acknowledgedBy
	exception.AssignedToID = acknowledgedByID
	exception.UpdatedAt = now

	if err := s.exceptionRepo.Update(ctx, exception); err != nil {
		return apperrors.DatabaseError("acknowledge exception", err)
	}

	// Record history
	history := &domain.ExceptionHistory{
		ID:          uuid.New(),
		ExceptionID: exceptionID,
		FromStatus:  domain.ExceptionStatusOpen,
		ToStatus:    domain.ExceptionStatusAcknowledged,
		ChangedBy:   acknowledgedBy,
		ChangedByID: acknowledgedByID,
		Notes:       "Exception acknowledged",
		ChangedAt:   now,
	}
	_ = s.exceptionRepo.CreateHistory(ctx, history)

	// Publish event
	event := kafka.NewEvent(kafka.Topics.ExceptionUpdated, "dispatch-service", map[string]interface{}{
		"exception_id":   exceptionID.String(),
		"status":         exception.Status,
		"acknowledged_by": acknowledgedBy,
	})
	_ = s.eventProducer.Publish(ctx, kafka.Topics.ExceptionUpdated, event)

	s.logger.Infow("Exception acknowledged",
		"exception_id", exceptionID,
		"acknowledged_by", acknowledgedBy,
	)

	return nil
}

// ResolveExceptionInput contains input for resolving an exception
type ResolveExceptionInput struct {
	ExceptionID     uuid.UUID
	Resolution      string
	ResolutionNotes string
	ActualDelayMins *int
	FinancialImpact *float64
	ResolvedBy      string
	ResolvedByID    *uuid.UUID
}

// ResolveException resolves an exception
func (s *ExceptionService) ResolveException(ctx context.Context, input ResolveExceptionInput) error {
	exception, err := s.exceptionRepo.GetByID(ctx, input.ExceptionID)
	if err != nil {
		return apperrors.NotFoundError("exception", input.ExceptionID.String())
	}

	if !exception.IsOpen() {
		return apperrors.InvalidStateError(string(exception.Status), "open/in_progress")
	}

	now := time.Now()
	oldStatus := exception.Status

	exception.Status = domain.ExceptionStatusResolved
	exception.Resolution = input.Resolution
	exception.ResolutionNotes = input.ResolutionNotes
	exception.ActualDelay = input.ActualDelayMins
	exception.FinancialImpact = input.FinancialImpact
	exception.ResolvedAt = &now
	exception.UpdatedAt = now

	if err := s.exceptionRepo.Update(ctx, exception); err != nil {
		return apperrors.DatabaseError("resolve exception", err)
	}

	// Record history
	history := &domain.ExceptionHistory{
		ID:          uuid.New(),
		ExceptionID: input.ExceptionID,
		FromStatus:  oldStatus,
		ToStatus:    domain.ExceptionStatusResolved,
		ChangedBy:   input.ResolvedBy,
		ChangedByID: input.ResolvedByID,
		Notes:       fmt.Sprintf("Resolution: %s", input.Resolution),
		ChangedAt:   now,
	}
	_ = s.exceptionRepo.CreateHistory(ctx, history)

	// Publish event
	event := kafka.NewEvent(kafka.Topics.ExceptionResolved, "dispatch-service", map[string]interface{}{
		"exception_id":  input.ExceptionID.String(),
		"resolution":    input.Resolution,
		"resolved_by":   input.ResolvedBy,
		"actual_delay":  input.ActualDelayMins,
	})
	_ = s.eventProducer.Publish(ctx, kafka.Topics.ExceptionResolved, event)

	s.logger.Infow("Exception resolved",
		"exception_id", input.ExceptionID,
		"resolution", input.Resolution,
		"resolved_by", input.ResolvedBy,
	)

	return nil
}

// AddComment adds a comment to an exception
func (s *ExceptionService) AddComment(ctx context.Context, exceptionID uuid.UUID, authorID uuid.UUID, authorName, comment string, isInternal bool) (*domain.ExceptionComment, error) {
	// Verify exception exists
	if _, err := s.exceptionRepo.GetByID(ctx, exceptionID); err != nil {
		return nil, apperrors.NotFoundError("exception", exceptionID.String())
	}

	commentObj := &domain.ExceptionComment{
		ID:          uuid.New(),
		ExceptionID: exceptionID,
		AuthorID:    authorID,
		AuthorName:  authorName,
		Comment:     comment,
		IsInternal:  isInternal,
		CreatedAt:   time.Now(),
	}

	if err := s.exceptionRepo.CreateComment(ctx, commentObj); err != nil {
		return nil, apperrors.DatabaseError("create comment", err)
	}

	return commentObj, nil
}

// GetExceptionsByTrip retrieves all exceptions for a trip
func (s *ExceptionService) GetExceptionsByTrip(ctx context.Context, tripID uuid.UUID) ([]domain.Exception, error) {
	exceptions, err := s.exceptionRepo.GetByTripID(ctx, tripID)
	if err != nil {
		return nil, apperrors.DatabaseError("get exceptions by trip", err)
	}
	return exceptions, nil
}

// GetOpenExceptions retrieves all open exceptions
func (s *ExceptionService) GetOpenExceptions(ctx context.Context) ([]domain.Exception, error) {
	exceptions, err := s.exceptionRepo.GetByStatus(ctx, []domain.ExceptionStatus{
		domain.ExceptionStatusOpen,
		domain.ExceptionStatusAcknowledged,
		domain.ExceptionStatusInProgress,
	})
	if err != nil {
		return nil, apperrors.DatabaseError("get open exceptions", err)
	}
	return exceptions, nil
}

// GetCriticalExceptions retrieves all critical exceptions
func (s *ExceptionService) GetCriticalExceptions(ctx context.Context) ([]domain.Exception, error) {
	exceptions, err := s.exceptionRepo.GetBySeverity(ctx, []domain.ExceptionSeverity{
		domain.ExceptionSeverityCritical,
		domain.ExceptionSeverityHigh,
	})
	if err != nil {
		return nil, apperrors.DatabaseError("get critical exceptions", err)
	}

	// Filter to only open ones
	var openCritical []domain.Exception
	for _, e := range exceptions {
		if e.IsOpen() {
			openCritical = append(openCritical, e)
		}
	}

	return openCritical, nil
}
