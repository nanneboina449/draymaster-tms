package service

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/draymaster/services/emodal-integration/internal/client"
	"github.com/draymaster/services/emodal-integration/internal/domain"
	"github.com/draymaster/shared/pkg/kafka"
	"github.com/draymaster/shared/pkg/logger"
)

// containerAddedEvent matches the event payload published by order-service
// on the orders.container.added topic when a new container is added to a shipment.
type containerAddedEvent struct {
	ContainerNumber string `json:"containerNumber"`
	TerminalCode    string `json:"terminalCode"`
	PortCode        string `json:"portCode"`
	ShipmentID      string `json:"shipmentId"`
}

// ContainerPublisher listens for container.added Kafka events from order-service
// and automatically publishes new containers to eModal for real-time status tracking.
type ContainerPublisher struct {
	eModalClient *client.EModalClient
	log          *logger.Logger
}

// NewContainerPublisher creates a new ContainerPublisher.
func NewContainerPublisher(eModalClient *client.EModalClient, log *logger.Logger) *ContainerPublisher {
	return &ContainerPublisher{
		eModalClient: eModalClient,
		log:          log,
	}
}

// HandleEvent processes a container.added Kafka event.
// Extracts the container details and publishes them to eModal for tracking.
func (p *ContainerPublisher) HandleEvent(ctx context.Context, event *kafka.Event) error {
	data, err := json.Marshal(event.Data)
	if err != nil {
		return fmt.Errorf("marshal event data: %w", err)
	}

	var added containerAddedEvent
	if err := json.Unmarshal(data, &added); err != nil {
		return fmt.Errorf("unmarshal container event: %w", err)
	}

	if added.ContainerNumber == "" || added.TerminalCode == "" {
		p.log.Warnw("Skipping incomplete container event",
			"containerNumber", added.ContainerNumber,
			"terminalCode", added.TerminalCode,
		)
		return nil
	}

	containers := []domain.PublishedContainer{
		{
			ContainerNumber: added.ContainerNumber,
			TerminalCode:    added.TerminalCode,
			PortCode:        added.PortCode,
			PublishedAt:     time.Now(),
		},
	}

	published, err := p.eModalClient.PublishContainers(ctx, containers)
	if err != nil {
		return fmt.Errorf("publish container %s: %w", added.ContainerNumber, err)
	}

	p.log.Infow("Auto-published container to eModal",
		"containerNumber", added.ContainerNumber,
		"shipmentId", added.ShipmentID,
		"published", published,
	)
	return nil
}
