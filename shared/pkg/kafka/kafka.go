package kafka

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/segmentio/kafka-go"
	
	"github.com/draymaster/shared/pkg/logger"
)

// Event represents a domain event
type Event struct {
	ID            string                 `json:"id"`
	Type          string                 `json:"type"`
	Source        string                 `json:"source"`
	Time          time.Time              `json:"time"`
	Data          interface{}            `json:"data"`
	Metadata      map[string]string      `json:"metadata,omitempty"`
	CorrelationID string                 `json:"correlation_id,omitempty"`
}

// NewEvent creates a new event
func NewEvent(eventType, source string, data interface{}) *Event {
	return &Event{
		ID:     uuid.New().String(),
		Type:   eventType,
		Source: source,
		Time:   time.Now().UTC(),
		Data:   data,
	}
}

// WithCorrelationID adds correlation ID to event
func (e *Event) WithCorrelationID(id string) *Event {
	e.CorrelationID = id
	return e
}

// WithMetadata adds metadata to event
func (e *Event) WithMetadata(key, value string) *Event {
	if e.Metadata == nil {
		e.Metadata = make(map[string]string)
	}
	e.Metadata[key] = value
	return e
}

// Producer handles publishing events to Kafka
type Producer struct {
	writer *kafka.Writer
	logger *logger.Logger
}

// NewProducer creates a new Kafka producer
func NewProducer(brokers []string, log *logger.Logger) *Producer {
	writer := &kafka.Writer{
		Addr:         kafka.TCP(brokers...),
		Balancer:     &kafka.LeastBytes{},
		BatchTimeout: 10 * time.Millisecond,
		RequiredAcks: kafka.RequireAll,
		Async:        false,
	}

	return &Producer{
		writer: writer,
		logger: log,
	}
}

// Publish publishes an event to a topic
func (p *Producer) Publish(ctx context.Context, topic string, event *Event) error {
	data, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("failed to marshal event: %w", err)
	}

	msg := kafka.Message{
		Topic: topic,
		Key:   []byte(event.ID),
		Value: data,
		Time:  event.Time,
		Headers: []kafka.Header{
			{Key: "event_type", Value: []byte(event.Type)},
			{Key: "source", Value: []byte(event.Source)},
		},
	}

	if event.CorrelationID != "" {
		msg.Headers = append(msg.Headers, kafka.Header{
			Key:   "correlation_id",
			Value: []byte(event.CorrelationID),
		})
	}

	if err := p.writer.WriteMessages(ctx, msg); err != nil {
		p.logger.Errorw("Failed to publish event",
			"topic", topic,
			"event_type", event.Type,
			"error", err,
		)
		return fmt.Errorf("failed to publish event: %w", err)
	}

	p.logger.Debugw("Event published",
		"topic", topic,
		"event_id", event.ID,
		"event_type", event.Type,
	)

	return nil
}

// Close closes the producer
func (p *Producer) Close() error {
	return p.writer.Close()
}

// Consumer handles consuming events from Kafka
type Consumer struct {
	reader *kafka.Reader
	logger *logger.Logger
}

// NewConsumer creates a new Kafka consumer
func NewConsumer(brokers []string, groupID, topic string, log *logger.Logger) *Consumer {
	reader := kafka.NewReader(kafka.ReaderConfig{
		Brokers:        brokers,
		GroupID:        groupID,
		Topic:          topic,
		MinBytes:       10e3, // 10KB
		MaxBytes:       10e6, // 10MB
		MaxWait:        1 * time.Second,
		StartOffset:    kafka.LastOffset,
		CommitInterval: time.Second,
	})

	return &Consumer{
		reader: reader,
		logger: log,
	}
}

// Handler is a function that handles events
type Handler func(ctx context.Context, event *Event) error

// Consume starts consuming events and calls the handler for each
func (c *Consumer) Consume(ctx context.Context, handler Handler) error {
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
			msg, err := c.reader.FetchMessage(ctx)
			if err != nil {
				if ctx.Err() != nil {
					return ctx.Err()
				}
				c.logger.Errorw("Failed to fetch message", "error", err)
				continue
			}

			var event Event
			if err := json.Unmarshal(msg.Value, &event); err != nil {
				c.logger.Errorw("Failed to unmarshal event",
					"error", err,
					"topic", msg.Topic,
				)
				// Commit anyway to avoid stuck consumer
				_ = c.reader.CommitMessages(ctx, msg)
				continue
			}

			c.logger.Debugw("Event received",
				"topic", msg.Topic,
				"event_id", event.ID,
				"event_type", event.Type,
			)

			if err := handler(ctx, &event); err != nil {
				c.logger.Errorw("Failed to handle event",
					"error", err,
					"event_id", event.ID,
					"event_type", event.Type,
				)
				// Could implement retry logic or dead letter queue here
			}

			if err := c.reader.CommitMessages(ctx, msg); err != nil {
				c.logger.Errorw("Failed to commit message", "error", err)
			}
		}
	}
}

// Close closes the consumer
func (c *Consumer) Close() error {
	return c.reader.Close()
}

// Topics contains all event topics
var Topics = struct {
	// Order Service
	ShipmentCreated   string
	ShipmentUpdated   string
	ContainerAdded    string
	ContainerUpdated  string
	OrderCreated      string
	OrderStatusChanged string
	
	// Dispatch Service
	TripCreated       string
	TripAssigned      string
	TripDispatched    string
	TripStarted       string
	TripCompleted     string
	TripCancelled     string
	StopCompleted     string
	StreetTurnMatched string
	
	// Tracking Service
	LocationUpdated   string
	GeofenceEntered   string
	GeofenceExited    string
	MilestoneRecorded string
	ETAUpdated        string
	
	// Driver Service
	DriverCreated     string
	DriverUpdated     string
	HOSUpdated        string
	ComplianceAlert   string
	
	// Billing Service
	InvoiceGenerated  string
	InvoiceSent       string
	PaymentReceived   string
}{
	ShipmentCreated:    "orders.shipment.created",
	ShipmentUpdated:    "orders.shipment.updated",
	ContainerAdded:     "orders.container.added",
	ContainerUpdated:   "orders.container.updated",
	OrderCreated:       "orders.order.created",
	OrderStatusChanged: "orders.order.status_changed",
	
	TripCreated:        "dispatch.trip.created",
	TripAssigned:       "dispatch.trip.assigned",
	TripDispatched:     "dispatch.trip.dispatched",
	TripStarted:        "dispatch.trip.started",
	TripCompleted:      "dispatch.trip.completed",
	TripCancelled:      "dispatch.trip.cancelled",
	StopCompleted:      "dispatch.stop.completed",
	StreetTurnMatched:  "dispatch.street_turn.matched",
	
	LocationUpdated:    "tracking.location.updated",
	GeofenceEntered:    "tracking.geofence.entered",
	GeofenceExited:     "tracking.geofence.exited",
	MilestoneRecorded:  "tracking.milestone.recorded",
	ETAUpdated:         "tracking.eta.updated",
	
	DriverCreated:      "drivers.driver.created",
	DriverUpdated:      "drivers.driver.updated",
	HOSUpdated:         "drivers.hos.updated",
	ComplianceAlert:    "drivers.compliance.alert",
	
	InvoiceGenerated:   "billing.invoice.generated",
	InvoiceSent:        "billing.invoice.sent",
	PaymentReceived:    "billing.payment.received",
}
