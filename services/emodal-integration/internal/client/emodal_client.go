package client

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/draymaster/services/emodal-integration/internal/domain"
	"github.com/draymaster/shared/pkg/logger"
)

// EModalConfig holds configuration for the eModal EDS REST API.
type EModalConfig struct {
	BaseURL string        // e.g. https://apigateway.emodal.com
	APIKey  string        // X-API-KEY header value
	Timeout time.Duration // HTTP client timeout
}

// EModalClient is the REST API client for eModal Data Services (EDS).
// All requests authenticate via the X-API-KEY header.
type EModalClient struct {
	baseURL    string
	apiKey     string
	httpClient *http.Client
	log        *logger.Logger
}

// NewEModalClient creates a new eModal EDS API client.
func NewEModalClient(cfg EModalConfig, log *logger.Logger) *EModalClient {
	timeout := cfg.Timeout
	if timeout == 0 {
		timeout = 30 * time.Second
	}
	return &EModalClient{
		baseURL:    cfg.BaseURL,
		apiKey:     cfg.APIKey,
		httpClient: &http.Client{Timeout: timeout},
		log:        log,
	}
}

// --- Request / Response types matching eModal EDS JSON format ---

type publishRequest struct {
	ServiceOrders []serviceOrderItem `json:"ServiceOrders"`
}

type serviceOrderItem struct {
	ContainerNumber string `json:"ContainerNumber"`
	TerminalCode    string `json:"TerminalCode"`
	PortCode        string `json:"PortCode"`
}

type publishResponse struct {
	Success             bool     `json:"Success"`
	Message             string   `json:"Message"`
	PublishedContainers []string `json:"PublishedContainers"`
}

type availabilityResponse struct {
	Slots []slotItem `json:"Slots"`
}

type slotItem struct {
	Time      time.Time `json:"Time"`
	Capacity  int       `json:"Capacity"`
	Available int       `json:"Available"`
	MoveType  string    `json:"MoveType"`
}

type dwellStatsResponse struct {
	Stats             []dwellStatItem `json:"Stats"`
	AverageDwellHours float64        `json:"AverageDwellHours"`
}

type dwellStatItem struct {
	TerminalCode    string     `json:"TerminalCode"`
	ContainerNumber string     `json:"ContainerNumber"`
	DischargeDate   *time.Time `json:"DischargeDate"`
	GateOutDate     *time.Time `json:"GateOutDate"`
	DwellHours      float64    `json:"DwellHours"`
}

type terminalInfoResponse struct {
	Terminals []terminalItem `json:"Terminals"`
}

type terminalItem struct {
	TerminalID      string   `json:"TerminalId"`
	TerminalName    string   `json:"TerminalName"`
	PortCode        string   `json:"PortCode"`
	SupportedMoves  []string `json:"SupportedMoves"`
	AppointmentType string   `json:"AppointmentType"`
}

// --- API Methods ---

// PublishContainers registers containers with eModal for real-time status tracking.
// After publishing, eModal pushes status updates via Azure Service Bus.
func (c *EModalClient) PublishContainers(ctx context.Context, containers []domain.PublishedContainer) ([]string, error) {
	items := make([]serviceOrderItem, len(containers))
	for i, ct := range containers {
		items[i] = serviceOrderItem{
			ContainerNumber: ct.ContainerNumber,
			TerminalCode:    ct.TerminalCode,
			PortCode:        ct.PortCode,
		}
	}

	resp, err := c.doRequest(ctx, http.MethodPost, "/eds/ServiceOrder/ServiceOrders", publishRequest{ServiceOrders: items})
	if err != nil {
		return nil, fmt.Errorf("publish containers: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("publish containers: HTTP %d: %s", resp.StatusCode, string(body))
	}

	var result publishResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("publish containers: decode: %w", err)
	}
	if !result.Success {
		return nil, fmt.Errorf("publish containers: %s", result.Message)
	}

	c.log.Infow("Published containers to eModal", "count", len(result.PublishedContainers))
	return result.PublishedContainers, nil
}

// GetAppointmentAvailability queries eModal for available gate appointment slots
// at a terminal for a specific date and move type.
func (c *EModalClient) GetAppointmentAvailability(ctx context.Context, terminalID string, date time.Time, moveType domain.MoveType) ([]domain.AppointmentSlot, error) {
	path := fmt.Sprintf("/eds/terminals/%s/appointments?date=%s&moveType=%s",
		terminalID, date.Format("2006-01-02"), string(moveType))

	resp, err := c.doRequest(ctx, http.MethodGet, path, nil)
	if err != nil {
		return nil, fmt.Errorf("get availability: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("get availability: HTTP %d: %s", resp.StatusCode, string(body))
	}

	var result availabilityResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("get availability: decode: %w", err)
	}

	slots := make([]domain.AppointmentSlot, len(result.Slots))
	for i, s := range result.Slots {
		slots[i] = domain.AppointmentSlot{
			Time:      s.Time,
			Capacity:  s.Capacity,
			Available: s.Available,
			MoveType:  domain.MoveType(s.MoveType),
		}
	}
	return slots, nil
}

// GetDwellStats retrieves container dwell time statistics from eModal.
func (c *EModalClient) GetDwellStats(ctx context.Context, terminalID string, startDate, endDate time.Time, containerNumbers []string) ([]domain.DwellStats, float64, error) {
	path := fmt.Sprintf("/eds/terminals/%s/dwell?startDate=%s&endDate=%s",
		terminalID, startDate.Format("2006-01-02"), endDate.Format("2006-01-02"))
	for _, cn := range containerNumbers {
		path += "&container=" + cn
	}

	resp, err := c.doRequest(ctx, http.MethodGet, path, nil)
	if err != nil {
		return nil, 0, fmt.Errorf("get dwell stats: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, 0, fmt.Errorf("get dwell stats: HTTP %d: %s", resp.StatusCode, string(body))
	}

	var result dwellStatsResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, 0, fmt.Errorf("get dwell stats: decode: %w", err)
	}

	stats := make([]domain.DwellStats, len(result.Stats))
	for i, s := range result.Stats {
		stats[i] = domain.DwellStats{
			TerminalCode:      s.TerminalCode,
			ContainerNumber:   s.ContainerNumber,
			DischargeDate:     s.DischargeDate,
			GateOutDate:       s.GateOutDate,
			DwellHours:        s.DwellHours,
			AverageDwellHours: result.AverageDwellHours,
		}
	}
	return stats, result.AverageDwellHours, nil
}

// GetTerminals retrieves terminal info for a port from eModal.
func (c *EModalClient) GetTerminals(ctx context.Context, portCode string) ([]domain.TerminalInfo, error) {
	resp, err := c.doRequest(ctx, http.MethodGet, "/eds/terminals/"+portCode, nil)
	if err != nil {
		return nil, fmt.Errorf("get terminals: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("get terminals: HTTP %d: %s", resp.StatusCode, string(body))
	}

	var result terminalInfoResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("get terminals: decode: %w", err)
	}

	terminals := make([]domain.TerminalInfo, len(result.Terminals))
	for i, t := range result.Terminals {
		moves := make([]domain.MoveType, len(t.SupportedMoves))
		for j, m := range t.SupportedMoves {
			moves[j] = domain.MoveType(m)
		}
		terminals[i] = domain.TerminalInfo{
			TerminalID:      t.TerminalID,
			TerminalName:    t.TerminalName,
			PortCode:        t.PortCode,
			SupportedMoves:  moves,
			AppointmentType: t.AppointmentType,
		}
	}
	return terminals, nil
}

// doRequest executes an authenticated HTTP request against the eModal EDS API.
func (c *EModalClient) doRequest(ctx context.Context, method, path string, body interface{}) (*http.Response, error) {
	var bodyReader io.Reader
	if body != nil {
		jsonBody, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("marshal body: %w", err)
		}
		bodyReader = bytes.NewReader(jsonBody)
	}

	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, bodyReader)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}

	req.Header.Set("X-API-KEY", c.apiKey)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	c.log.Debugw("eModal API request", "method", method, "path", path)
	return c.httpClient.Do(req)
}
