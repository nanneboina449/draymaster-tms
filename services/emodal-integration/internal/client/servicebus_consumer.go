package client

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/draymaster/services/emodal-integration/internal/domain"
	"github.com/draymaster/shared/pkg/logger"
)

// ServiceBusConfig holds configuration for the Azure Service Bus connection.
type ServiceBusConfig struct {
	Namespace        string // e.g. sb-emodalpro.servicebus.windows.net
	SASToken         string // SharedAccessSignature token value
	TopicName        string // eModal topic (e.g. containerupdates)
	SubscriptionName string // Consumer subscription (e.g. draymaster)
}

// ServiceBusConsumer reads container status events pushed by eModal via Azure Service Bus.
// Uses the REST receive-and-delete pattern: HTTP DELETE on the messages/head endpoint.
// No Azure SDK dependency — pure HTTP against the Service Bus REST API.
type ServiceBusConsumer struct {
	namespace        string
	sasToken         string
	topicName        string
	subscriptionName string
	httpClient       *http.Client
	log              *logger.Logger
}

// NewServiceBusConsumer creates a new Service Bus consumer.
func NewServiceBusConsumer(cfg ServiceBusConfig, log *logger.Logger) *ServiceBusConsumer {
	return &ServiceBusConsumer{
		namespace:        cfg.Namespace,
		sasToken:         cfg.SASToken,
		topicName:        cfg.TopicName,
		subscriptionName: cfg.SubscriptionName,
		httpClient:       &http.Client{Timeout: 60 * time.Second},
		log:              log,
	}
}

// Start begins consuming events. Blocks until ctx is cancelled.
// handler is called for each received event. Errors are logged but do not stop the loop
// since the message has already been destructively consumed (receive-and-delete).
func (s *ServiceBusConsumer) Start(ctx context.Context, handler func(event domain.ContainerStatusEvent) error) error {
	s.log.Infow("Service Bus consumer started",
		"namespace", s.namespace,
		"topic", s.topicName,
		"subscription", s.subscriptionName,
	)

	for {
		select {
		case <-ctx.Done():
			s.log.Info("Service Bus consumer shutting down")
			return ctx.Err()
		default:
		}

		event, err := s.receiveMessage(ctx)
		if err != nil {
			if ctx.Err() != nil {
				return ctx.Err()
			}
			s.log.Warnw("Receive failed, retrying in 2s", "error", err)
			time.Sleep(2 * time.Second)
			continue
		}

		// nil = no message available (204 No Content)
		if event == nil {
			continue
		}

		if err := handler(*event); err != nil {
			s.log.Errorw("Handler failed for container event",
				"error", err,
				"container", event.ContainerNumber,
			)
		}
	}
}

// receiveMessage performs a single receive-and-delete from Service Bus.
// Returns nil if no message is available.
func (s *ServiceBusConsumer) receiveMessage(ctx context.Context) (*domain.ContainerStatusEvent, error) {
	url := fmt.Sprintf("https://%s/%s/subscriptions/%s/messages/head?timeout=30",
		s.namespace, s.topicName, s.subscriptionName)

	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, url, nil)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Authorization", "SharedAccessSignature "+s.sasToken)

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("HTTP request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNoContent {
		return nil, nil // no messages
	}
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("Service Bus HTTP %d: %s", resp.StatusCode, string(body))
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read body: %w", err)
	}

	event, err := s.parseMessage(body)
	if err != nil {
		// Message is already consumed — log and skip rather than blocking forever
		s.log.Errorw("Malformed Service Bus message, skipping", "error", err)
		return nil, nil
	}
	return event, nil
}

// eModalEvent matches the JSON structure that eModal pushes via Service Bus.
type eModalEvent struct {
	ContainerNumber string         `json:"ContainerNumber"`
	EventTimestamp  time.Time      `json:"EventTimestamp"`
	UnitStatusInfo  unitStatusInfo `json:"UnitStatusInfo"`
	CurrentLocation locationInfo   `json:"CurrentLocationInfo"`
}

type unitStatusInfo struct {
	StatusCode        string `json:"StatusCode"`
	StatusDescription string `json:"StatusDescription"`
}

type locationInfo struct {
	FacilityName string `json:"FacilityName"`
	TerminalCode string `json:"TerminalCode"`
	City         string `json:"City"`
	State        string `json:"State"`
}

// parseMessage converts raw JSON from eModal into a ContainerStatusEvent.
func (s *ServiceBusConsumer) parseMessage(data []byte) (*domain.ContainerStatusEvent, error) {
	var raw eModalEvent
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("unmarshal: %w", err)
	}
	if raw.ContainerNumber == "" {
		return nil, fmt.Errorf("missing ContainerNumber")
	}

	location := raw.CurrentLocation.FacilityName
	if raw.CurrentLocation.City != "" {
		location += ", " + raw.CurrentLocation.City
		if raw.CurrentLocation.State != "" {
			location += ", " + raw.CurrentLocation.State
		}
	}

	return &domain.ContainerStatusEvent{
		ContainerNumber:     raw.ContainerNumber,
		Status:              domain.MapStatusCode(raw.UnitStatusInfo.StatusCode),
		TerminalCode:        raw.CurrentLocation.TerminalCode,
		TerminalName:        raw.CurrentLocation.FacilityName,
		LocationDescription: location,
		OccurredAt:          raw.EventTimestamp,
	}, nil
}
