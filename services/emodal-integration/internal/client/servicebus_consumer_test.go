package client

import (
	"testing"
	"time"

	"github.com/draymaster/services/emodal-integration/internal/domain"
	"github.com/draymaster/shared/pkg/logger"
)

func newTestLogger(t *testing.T) *logger.Logger {
	t.Helper()
	log, err := logger.New("test", "development", "debug")
	if err != nil {
		t.Fatalf("failed to create logger: %v", err)
	}
	return log
}

func TestParseMessage_ValidEvent(t *testing.T) {
	consumer := &ServiceBusConsumer{log: newTestLogger(t)}

	payload := []byte(`{
		"ContainerNumber": "MSCU1234567",
		"EventTimestamp": "2024-06-15T10:30:00Z",
		"UnitStatusInfo": {
			"StatusCode": "Y",
			"StatusDescription": "Container in yard"
		},
		"CurrentLocationInfo": {
			"FacilityName": "Port of LA — Maersk",
			"TerminalCode": "POLA",
			"City": "Los Angeles",
			"State": "CA"
		}
	}`)

	event, err := consumer.parseMessage(payload)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if event.ContainerNumber != "MSCU1234567" {
		t.Errorf("ContainerNumber = %q, want %q", event.ContainerNumber, "MSCU1234567")
	}
	if event.Status != domain.StatusInYard {
		t.Errorf("Status = %q, want %q", event.Status, domain.StatusInYard)
	}
	if event.TerminalCode != "POLA" {
		t.Errorf("TerminalCode = %q, want %q", event.TerminalCode, "POLA")
	}
	if event.TerminalName != "Port of LA — Maersk" {
		t.Errorf("TerminalName = %q, want %q", event.TerminalName, "Port of LA — Maersk")
	}
	if event.LocationDescription != "Port of LA — Maersk, Los Angeles, CA" {
		t.Errorf("LocationDescription = %q", event.LocationDescription)
	}

	expected := time.Date(2024, 6, 15, 10, 30, 0, 0, time.UTC)
	if !event.OccurredAt.Equal(expected) {
		t.Errorf("OccurredAt = %v, want %v", event.OccurredAt, expected)
	}
}

func TestParseMessage_MissingContainerNumber(t *testing.T) {
	consumer := &ServiceBusConsumer{log: newTestLogger(t)}

	payload := []byte(`{
		"EventTimestamp": "2024-06-15T10:30:00Z",
		"UnitStatusInfo": {"StatusCode": "Y"}
	}`)

	_, err := consumer.parseMessage(payload)
	if err == nil {
		t.Fatal("expected error for missing ContainerNumber, got nil")
	}
}

func TestParseMessage_InvalidJSON(t *testing.T) {
	consumer := &ServiceBusConsumer{log: newTestLogger(t)}

	_, err := consumer.parseMessage([]byte(`not json`))
	if err == nil {
		t.Fatal("expected error for invalid JSON, got nil")
	}
}

func TestParseMessage_UnknownStatusCode(t *testing.T) {
	consumer := &ServiceBusConsumer{log: newTestLogger(t)}

	payload := []byte(`{
		"ContainerNumber": "ABCD1234567",
		"EventTimestamp": "2024-01-01T00:00:00Z",
		"UnitStatusInfo": {"StatusCode": "X"},
		"CurrentLocationInfo": {"TerminalCode": "TEST"}
	}`)

	event, err := consumer.parseMessage(payload)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// Unknown code falls back to IN_YARD
	if event.Status != domain.StatusInYard {
		t.Errorf("Status = %q, want %q for unknown code", event.Status, domain.StatusInYard)
	}
}

func TestParseMessage_LocationCityOnly(t *testing.T) {
	consumer := &ServiceBusConsumer{log: newTestLogger(t)}

	payload := []byte(`{
		"ContainerNumber": "ABCD1234567",
		"EventTimestamp": "2024-01-01T00:00:00Z",
		"UnitStatusInfo": {"StatusCode": "D"},
		"CurrentLocationInfo": {
			"FacilityName": "Terminal X",
			"TerminalCode": "TX",
			"City": "Oakland"
		}
	}`)

	event, err := consumer.parseMessage(payload)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if event.LocationDescription != "Terminal X, Oakland" {
		t.Errorf("LocationDescription = %q, want %q", event.LocationDescription, "Terminal X, Oakland")
	}
}
