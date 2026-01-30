package service

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/draymaster/services/order-service/internal/domain"
	"github.com/draymaster/services/order-service/internal/repository"
	apperrors "github.com/draymaster/shared/pkg/errors"
	"github.com/draymaster/shared/pkg/validation"
	"github.com/draymaster/shared/pkg/config"
	"github.com/draymaster/shared/pkg/kafka"
	"github.com/draymaster/shared/pkg/logger"
)

// AppointmentService handles terminal appointment management
type AppointmentService struct {
	appointmentRepo  repository.AppointmentRepository
	terminalRepo     repository.TerminalRepository
	orderRepo        repository.OrderRepository
	eventProducer    *kafka.Producer
	logger           *logger.Logger
	dateValidator    *validation.DateValidator
	businessRules    *config.BusinessRules
}

// NewAppointmentService creates a new appointment service
func NewAppointmentService(
	appointmentRepo repository.AppointmentRepository,
	terminalRepo repository.TerminalRepository,
	orderRepo repository.OrderRepository,
	eventProducer *kafka.Producer,
	log *logger.Logger,
) *AppointmentService {
	return &AppointmentService{
		appointmentRepo: appointmentRepo,
		terminalRepo:    terminalRepo,
		orderRepo:       orderRepo,
		eventProducer:   eventProducer,
		logger:          log,
		dateValidator:   validation.NewDateValidator(),
		businessRules:   config.DefaultBusinessRules(),
	}
}

// RequestAppointmentInput contains input for requesting an appointment
type RequestAppointmentInput struct {
	OrderID             uuid.UUID
	TerminalID          uuid.UUID
	Type                domain.AppointmentType
	ContainerID         *uuid.UUID
	RequestedTime       time.Time
	SpecialInstructions string
	RequestedBy         string
	RequestedByID       *uuid.UUID
}

// RequestAppointment requests a terminal appointment
func (s *AppointmentService) RequestAppointment(ctx context.Context, input RequestAppointmentInput) (*domain.TerminalAppointment, error) {
	s.logger.Infow("Requesting terminal appointment",
		"order_id", input.OrderID,
		"terminal_id", input.TerminalID,
		"type", input.Type,
		"requested_time", input.RequestedTime,
	)

	// Validate order exists
	order, err := s.orderRepo.GetByID(ctx, input.OrderID)
	if err != nil {
		return nil, apperrors.NotFoundError("order", input.OrderID.String())
	}

	// Validate requested time
	minAdvanceHours := s.businessRules.Time.MinAppointmentAdvanceHours
	if err := s.dateValidator.ValidateAppointmentTime(input.RequestedTime, minAdvanceHours); err != nil {
		return nil, apperrors.ValidationError(err.Error(), "requested_time", input.RequestedTime)
	}

	// Check terminal gate hours
	isOpen, err := s.isTerminalOpen(ctx, input.TerminalID, input.RequestedTime)
	if err != nil {
		return nil, err
	}
	if !isOpen {
		return nil, apperrors.New("TERMINAL_CLOSED", "Terminal is closed at requested time")
	}

	// Check for existing active appointment
	existing, _ := s.appointmentRepo.GetByOrderID(ctx, input.OrderID)
	for _, appt := range existing {
		if appt.IsActive() {
			return nil, apperrors.ConflictError(
				fmt.Sprintf("Order already has active appointment: %s", appt.ConfirmationNumber),
			)
		}
	}

	// Check slot availability
	available, err := s.checkSlotAvailability(ctx, input.TerminalID, input.RequestedTime)
	if err != nil {
		return nil, err
	}
	if !available {
		return nil, apperrors.New("SLOT_UNAVAILABLE", "No available slots at requested time")
	}

	// Calculate appointment window
	windowMins := s.businessRules.Time.AppointmentWindowMins
	windowStart := input.RequestedTime
	windowEnd := input.RequestedTime.Add(time.Duration(windowMins) * time.Minute)

	// Create appointment
	appointment := &domain.TerminalAppointment{
		ID:                  uuid.New(),
		OrderID:             input.OrderID,
		TerminalID:          input.TerminalID,
		Type:                input.Type,
		Status:              domain.AppointmentStatusRequested,
		ContainerID:         input.ContainerID,
		RequestedTime:       input.RequestedTime,
		WindowStartTime:     windowStart,
		WindowEndTime:       windowEnd,
		SpecialInstructions: input.SpecialInstructions,
		RequestedBy:         input.RequestedBy,
		RequestedByID:       input.RequestedByID,
		CreatedAt:           time.Now(),
		UpdatedAt:           time.Now(),
	}

	// Get container number if provided
	if input.ContainerID != nil {
		// Would fetch container details
		appointment.ContainerNumber = "CONTAINER_NUMBER" // Placeholder
	}

	if err := s.appointmentRepo.Create(ctx, appointment); err != nil {
		return nil, apperrors.DatabaseError("create appointment", err)
	}

	// In real implementation, would call terminal API to book appointment
	// For now, simulate auto-confirmation
	go s.simulateTerminalConfirmation(context.Background(), appointment.ID)

	// Publish event
	event := kafka.NewEvent(kafka.Topics.AppointmentRequested, "order-service", map[string]interface{}{
		"appointment_id": appointment.ID.String(),
		"order_id":       input.OrderID.String(),
		"terminal_id":    input.TerminalID.String(),
		"requested_time": input.RequestedTime,
		"type":           input.Type,
	})
	_ = s.eventProducer.Publish(ctx, kafka.Topics.AppointmentRequested, event)

	s.logger.Infow("Appointment requested",
		"appointment_id", appointment.ID,
		"order_id", input.OrderID,
	)

	return appointment, nil
}

// ConfirmAppointment confirms a terminal appointment
func (s *AppointmentService) ConfirmAppointment(ctx context.Context, appointmentID uuid.UUID, confirmationNumber, confirmedBy string) error {
	appointment, err := s.appointmentRepo.GetByID(ctx, appointmentID)
	if err != nil {
		return apperrors.NotFoundError("appointment", appointmentID.String())
	}

	if appointment.Status != domain.AppointmentStatusRequested &&
	   appointment.Status != domain.AppointmentStatusPending {
		return apperrors.InvalidStateError(
			string(appointment.Status),
			string(domain.AppointmentStatusRequested),
		)
	}

	now := time.Now()
	appointment.Status = domain.AppointmentStatusConfirmed
	appointment.ConfirmationNumber = confirmationNumber
	appointment.ConfirmedBy = confirmedBy
	appointment.ConfirmedTime = &now
	appointment.UpdatedAt = now

	if err := s.appointmentRepo.Update(ctx, appointment); err != nil {
		return apperrors.DatabaseError("confirm appointment", err)
	}

	// Publish event
	event := kafka.NewEvent(kafka.Topics.AppointmentConfirmed, "order-service", map[string]interface{}{
		"appointment_id":      appointmentID.String(),
		"confirmation_number": confirmationNumber,
		"confirmed_time":      now,
	})
	_ = s.eventProducer.Publish(ctx, kafka.Topics.AppointmentConfirmed, event)

	s.logger.Infow("Appointment confirmed",
		"appointment_id", appointmentID,
		"confirmation_number", confirmationNumber,
	)

	return nil
}

// CancelAppointment cancels a terminal appointment
func (s *AppointmentService) CancelAppointment(ctx context.Context, appointmentID uuid.UUID, reason, cancelledBy string) error {
	appointment, err := s.appointmentRepo.GetByID(ctx, appointmentID)
	if err != nil {
		return apperrors.NotFoundError("appointment", appointmentID.String())
	}

	if !appointment.IsActive() {
		return apperrors.InvalidStateError(
			string(appointment.Status),
			"active status",
		)
	}

	appointment.Status = domain.AppointmentStatusCancelled
	appointment.CancellationReason = reason
	appointment.UpdatedAt = time.Now()

	if err := s.appointmentRepo.Update(ctx, appointment); err != nil {
		return apperrors.DatabaseError("cancel appointment", err)
	}

	// In real implementation, would call terminal API to cancel

	// Publish event
	event := kafka.NewEvent(kafka.Topics.AppointmentCancelled, "order-service", map[string]interface{}{
		"appointment_id": appointmentID.String(),
		"reason":         reason,
		"cancelled_by":   cancelledBy,
	})
	_ = s.eventProducer.Publish(ctx, kafka.Topics.AppointmentCancelled, event)

	s.logger.Infow("Appointment cancelled",
		"appointment_id", appointmentID,
		"reason", reason,
	)

	return nil
}

// RescheduleAppointment reschedules an existing appointment
func (s *AppointmentService) RescheduleAppointment(ctx context.Context, appointmentID uuid.UUID, newTime time.Time, reason, rescheduledBy string) (*domain.TerminalAppointment, error) {
	oldAppointment, err := s.appointmentRepo.GetByID(ctx, appointmentID)
	if err != nil {
		return nil, apperrors.NotFoundError("appointment", appointmentID.String())
	}

	// Validate new time
	minAdvanceHours := s.businessRules.Time.MinAppointmentAdvanceHours
	if err := s.dateValidator.ValidateAppointmentTime(newTime, minAdvanceHours); err != nil {
		return nil, apperrors.ValidationError(err.Error(), "new_time", newTime)
	}

	// Check terminal hours
	isOpen, err := s.isTerminalOpen(ctx, oldAppointment.TerminalID, newTime)
	if err != nil {
		return nil, err
	}
	if !isOpen {
		return nil, apperrors.New("TERMINAL_CLOSED", "Terminal is closed at requested time")
	}

	// Mark old appointment as rescheduled
	oldAppointment.Status = domain.AppointmentStatusRescheduled
	oldAppointment.UpdatedAt = time.Now()
	_ = s.appointmentRepo.Update(ctx, oldAppointment)

	// Create new appointment
	windowMins := s.businessRules.Time.AppointmentWindowMins
	newAppointment := &domain.TerminalAppointment{
		ID:                  uuid.New(),
		OrderID:             oldAppointment.OrderID,
		TerminalID:          oldAppointment.TerminalID,
		Type:                oldAppointment.Type,
		Status:              domain.AppointmentStatusRequested,
		ContainerID:         oldAppointment.ContainerID,
		ContainerNumber:     oldAppointment.ContainerNumber,
		RequestedTime:       newTime,
		WindowStartTime:     newTime,
		WindowEndTime:       newTime.Add(time.Duration(windowMins) * time.Minute),
		SpecialInstructions: oldAppointment.SpecialInstructions,
		RequestedBy:         rescheduledBy,
		RescheduledFrom:     &appointmentID,
		CreatedAt:           time.Now(),
		UpdatedAt:           time.Now(),
	}

	if err := s.appointmentRepo.Create(ctx, newAppointment); err != nil {
		return nil, apperrors.DatabaseError("create rescheduled appointment", err)
	}

	// Publish event
	event := kafka.NewEvent(kafka.Topics.AppointmentRescheduled, "order-service", map[string]interface{}{
		"old_appointment_id": appointmentID.String(),
		"new_appointment_id": newAppointment.ID.String(),
		"old_time":           oldAppointment.RequestedTime,
		"new_time":           newTime,
		"reason":             reason,
	})
	_ = s.eventProducer.Publish(ctx, kafka.Topics.AppointmentRescheduled, event)

	s.logger.Infow("Appointment rescheduled",
		"old_appointment_id", appointmentID,
		"new_appointment_id", newAppointment.ID,
		"new_time", newTime,
	)

	return newAppointment, nil
}

// RecordArrival records driver arrival at terminal
func (s *AppointmentService) RecordArrival(ctx context.Context, appointmentID uuid.UUID, arrivalTime time.Time, gateNumber string) error {
	appointment, err := s.appointmentRepo.GetByID(ctx, appointmentID)
	if err != nil {
		return apperrors.NotFoundError("appointment", appointmentID.String())
	}

	appointment.ActualArrivalTime = &arrivalTime
	appointment.GateNumber = gateNumber
	appointment.UpdatedAt = time.Now()

	if err := s.appointmentRepo.Update(ctx, appointment); err != nil {
		return apperrors.DatabaseError("record arrival", err)
	}

	// Check if arrival was on time
	onTime := arrivalTime.Before(appointment.WindowEndTime) && arrivalTime.After(appointment.WindowStartTime.Add(-15*time.Minute))

	// Publish event
	event := kafka.NewEvent(kafka.Topics.AppointmentArrival, "order-service", map[string]interface{}{
		"appointment_id": appointmentID.String(),
		"arrival_time":   arrivalTime,
		"on_time":        onTime,
	})
	_ = s.eventProducer.Publish(ctx, kafka.Topics.AppointmentArrival, event)

	return nil
}

// CompleteAppointment marks appointment as completed
func (s *AppointmentService) CompleteAppointment(ctx context.Context, appointmentID uuid.UUID, completionTime time.Time, gateTicketNumber string) error {
	appointment, err := s.appointmentRepo.GetByID(ctx, appointmentID)
	if err != nil {
		return nil, apperrors.NotFoundError("appointment", appointmentID.String())
	}

	appointment.Status = domain.AppointmentStatusCompleted
	appointment.ActualCompletionTime = &completionTime
	appointment.GateTicketNumber = gateTicketNumber
	appointment.UpdatedAt = time.Now()

	if err := s.appointmentRepo.Update(ctx, appointment); err != nil {
		return apperrors.DatabaseError("complete appointment", err)
	}

	// Publish event
	event := kafka.NewEvent(kafka.Topics.AppointmentCompleted, "order-service", map[string]interface{}{
		"appointment_id":     appointmentID.String(),
		"completion_time":    completionTime,
		"gate_ticket_number": gateTicketNumber,
	})
	_ = s.eventProducer.Publish(ctx, kafka.Topics.AppointmentCompleted, event)

	s.logger.Infow("Appointment completed",
		"appointment_id", appointmentID,
		"gate_ticket", gateTicketNumber,
	)

	return nil
}

// Helper methods

func (s *AppointmentService) isTerminalOpen(ctx context.Context, terminalID uuid.UUID, requestedTime time.Time) (bool, error) {
	// In real implementation, would check terminal gate hours from database
	// For now, assume terminals are open 6 AM - 6 PM Mon-Fri

	hour := requestedTime.Hour()
	weekday := requestedTime.Weekday()

	// Check if weekend
	if weekday == time.Saturday || weekday == time.Sunday {
		return false, nil
	}

	// Check hours (6 AM - 6 PM)
	if hour < 6 || hour >= 18 {
		return false, nil
	}

	return true, nil
}

func (s *AppointmentService) checkSlotAvailability(ctx context.Context, terminalID uuid.UUID, requestedTime time.Time) (bool, error) {
	// In real implementation, would check appointment capacity
	// For now, assume slots are available
	return true, nil
}

func (s *AppointmentService) simulateTerminalConfirmation(ctx context.Context, appointmentID uuid.UUID) {
	// Simulate terminal API response delay
	time.Sleep(5 * time.Second)

	// Auto-confirm with generated confirmation number
	confirmationNumber := fmt.Sprintf("APPT-%s", time.Now().Format("20060102-150405"))
	_ = s.ConfirmAppointment(ctx, appointmentID, confirmationNumber, "terminal-system")
}

// GetUpcomingAppointments retrieves upcoming appointments for a terminal
func (s *AppointmentService) GetUpcomingAppointments(ctx context.Context, terminalID uuid.UUID, startTime, endTime time.Time) ([]domain.TerminalAppointment, error) {
	appointments, err := s.appointmentRepo.GetByTerminalAndTimeRange(ctx, terminalID, startTime, endTime)
	if err != nil {
		return nil, apperrors.DatabaseError("get upcoming appointments", err)
	}
	return appointments, nil
}
