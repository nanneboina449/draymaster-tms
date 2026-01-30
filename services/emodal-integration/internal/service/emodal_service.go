package service

import (
	"context"
	"fmt"
	"time"

	"github.com/draymaster/services/emodal-integration/internal/client"
	"github.com/draymaster/services/emodal-integration/internal/domain"
	"github.com/draymaster/shared/pkg/kafka"
	"github.com/draymaster/shared/pkg/logger"
)

// EModalService orchestrates the eModal integration:
//   - Processes incoming container status events from Service Bus
//   - Publishes internal Kafka events for downstream consumers
//   - Provides query methods for appointment availability and dwell stats
type EModalService struct {
	eModalClient  *client.EModalClient
	kafkaProducer *kafka.Producer
	log           *logger.Logger
}

// NewEModalService creates a new EModalService.
func NewEModalService(
	eModalClient *client.EModalClient,
	kafkaProducer *kafka.Producer,
	log *logger.Logger,
) *EModalService {
	return &EModalService{
		eModalClient:  eModalClient,
		kafkaProducer: kafkaProducer,
		log:           log,
	}
}

// ProcessContainerEvent handles a container status event from eModal Service Bus.
// Translates the event and publishes to the appropriate internal Kafka topics.
func (s *EModalService) ProcessContainerEvent(ctx context.Context, event domain.ContainerStatusEvent) error {
	s.log.Infow("Processing eModal container event",
		"container", event.ContainerNumber,
		"status", event.Status,
		"terminal", event.TerminalCode,
	)

	payload := map[string]interface{}{
		"containerNumber":     event.ContainerNumber,
		"status":              string(event.Status),
		"terminalCode":        event.TerminalCode,
		"terminalName":        event.TerminalName,
		"locationDescription": event.LocationDescription,
		"occurredAt":          event.OccurredAt.UTC(),
	}

	// Always publish general status update
	statusEvent := kafka.NewEvent("emodal.container.status_updated", "emodal-integration", payload)
	if err := s.kafkaProducer.Publish(ctx, kafka.Topics.EModalContainerStatusUpdated, statusEvent); err != nil {
		return fmt.Errorf("publish status event: %w", err)
	}

	// Publish gate-specific events so tracking-service can record milestones
	switch event.Status {
	case domain.StatusGateIn:
		gateEvent := kafka.NewEvent("emodal.container.gate_in", "emodal-integration", payload)
		if err := s.kafkaProducer.Publish(ctx, kafka.Topics.EModalGateIn, gateEvent); err != nil {
			s.log.Errorw("Failed to publish gate-in event", "error", err)
		}
		s.log.Infow("Container gate-in", "container", event.ContainerNumber, "terminal", event.TerminalCode)

	case domain.StatusGateOut:
		gateEvent := kafka.NewEvent("emodal.container.gate_out", "emodal-integration", payload)
		if err := s.kafkaProducer.Publish(ctx, kafka.Topics.EModalGateOut, gateEvent); err != nil {
			s.log.Errorw("Failed to publish gate-out event", "error", err)
		}
		s.log.Infow("Container gate-out", "container", event.ContainerNumber, "terminal", event.TerminalCode)

	case domain.StatusCustomsHold:
		s.log.Warnw("Container on customs hold",
			"container", event.ContainerNumber,
			"terminal", event.TerminalCode,
		)
	}

	return nil
}

// GetAppointmentAvailability queries eModal for available gate appointment slots.
func (s *EModalService) GetAppointmentAvailability(ctx context.Context, terminalID string, date time.Time, moveType domain.MoveType) ([]domain.AppointmentSlot, error) {
	return s.eModalClient.GetAppointmentAvailability(ctx, terminalID, date, moveType)
}

// GetDwellStats retrieves container dwell time statistics from eModal.
func (s *EModalService) GetDwellStats(ctx context.Context, terminalID string, startDate, endDate time.Time, containerNumbers []string) ([]domain.DwellStats, float64, error) {
	return s.eModalClient.GetDwellStats(ctx, terminalID, startDate, endDate, containerNumbers)
}

// PublishContainers registers containers with eModal for real-time tracking
// and publishes a confirmation event to Kafka.
func (s *EModalService) PublishContainers(ctx context.Context, containers []domain.PublishedContainer) ([]string, error) {
	published, err := s.eModalClient.PublishContainers(ctx, containers)
	if err != nil {
		return nil, err
	}

	event := kafka.NewEvent("emodal.container.published", "emodal-integration", map[string]interface{}{
		"containers": published,
		"timestamp":  time.Now().UTC(),
	})
	if pubErr := s.kafkaProducer.Publish(ctx, kafka.Topics.EModalContainerPublished, event); pubErr != nil {
		s.log.Errorw("Failed to publish container-published event", "error", pubErr)
	}

	return published, nil
}

// GetTerminals retrieves terminal info for a port from eModal.
func (s *EModalService) GetTerminals(ctx context.Context, portCode string) ([]domain.TerminalInfo, error) {
	return s.eModalClient.GetTerminals(ctx, portCode)
}
