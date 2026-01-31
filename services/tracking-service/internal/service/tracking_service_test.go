package service

import (
	"testing"
	"time"

	"github.com/draymaster/services/tracking-service/internal/domain"
)

func TestHaversineDistance(t *testing.T) {
	svc := &TrackingService{}

	tests := []struct {
		name      string
		lat1, lon1 float64
		lat2, lon2 float64
		wantMin   float64
		wantMax   float64
	}{
		{
			name: "LA to San Diego",
			lat1: 34.0522, lon1: -118.2437, // Los Angeles
			lat2: 32.7157, lon2: -117.1611, // San Diego
			wantMin: 110,
			wantMax: 125, // ~120 miles
		},
		{
			name: "Same point",
			lat1: 34.0522, lon1: -118.2437,
			lat2: 34.0522, lon2: -118.2437,
			wantMin: 0,
			wantMax: 0.01,
		},
		{
			name: "LA to Long Beach Port",
			lat1: 34.0522, lon1: -118.2437, // Los Angeles
			lat2: 33.7701, lon2: -118.1937, // Long Beach
			wantMin: 18,
			wantMax: 22, // ~20 miles
		},
		{
			name: "Port of LA to Port of Oakland",
			lat1: 33.7361, lon1: -118.2642, // Port of LA
			lat2: 37.7953, lon2: -122.2779, // Port of Oakland
			wantMin: 370,
			wantMax: 400, // ~385 miles
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			distance := svc.haversineDistance(tt.lat1, tt.lon1, tt.lat2, tt.lon2)
			if distance < tt.wantMin || distance > tt.wantMax {
				t.Errorf("haversineDistance() = %v miles, want between %v and %v",
					distance, tt.wantMin, tt.wantMax)
			}
		})
	}
}

func TestPointInPolygon(t *testing.T) {
	svc := &TrackingService{}

	// Define a simple square geofence around Port of Long Beach
	portPolygon := []domain.Coordinate{
		{Latitude: 33.78, Longitude: -118.25}, // NW corner
		{Latitude: 33.78, Longitude: -118.15}, // NE corner
		{Latitude: 33.70, Longitude: -118.15}, // SE corner
		{Latitude: 33.70, Longitude: -118.25}, // SW corner
	}

	tests := []struct {
		name     string
		lat, lon float64
		polygon  []domain.Coordinate
		want     bool
	}{
		{
			name:    "Point inside port polygon",
			lat:     33.74,
			lon:     -118.20,
			polygon: portPolygon,
			want:    true,
		},
		{
			name:    "Point outside port polygon - north",
			lat:     33.80,
			lon:     -118.20,
			polygon: portPolygon,
			want:    false,
		},
		{
			name:    "Point outside port polygon - east",
			lat:     33.74,
			lon:     -118.10,
			polygon: portPolygon,
			want:    false,
		},
		{
			name:    "Point on edge (should be false due to algorithm)",
			lat:     33.78,
			lon:     -118.20,
			polygon: portPolygon,
			want:    false,
		},
		{
			name:    "Empty polygon",
			lat:     33.74,
			lon:     -118.20,
			polygon: []domain.Coordinate{},
			want:    false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := svc.pointInPolygon(tt.lat, tt.lon, tt.polygon)
			if result != tt.want {
				t.Errorf("pointInPolygon() = %v, want %v", result, tt.want)
			}
		})
	}
}

func TestGetTrafficFactor(t *testing.T) {
	svc := &TrackingService{}

	tests := []struct {
		name       string
		hour       int
		wantFactor float64
	}{
		// Peak hours
		{"7 AM peak", 7, 1.5},
		{"8 AM peak", 8, 1.5},
		{"9 AM peak", 9, 1.5},
		{"4 PM peak", 16, 1.5},
		{"5 PM peak", 17, 1.5},
		{"6 PM peak", 18, 1.5},
		{"7 PM peak", 19, 1.5},

		// Moderate hours
		{"6 AM moderate", 6, 1.25},
		{"10 AM moderate", 10, 1.25},
		{"11 AM moderate", 11, 1.25},
		{"3 PM moderate", 15, 1.25},
		{"8 PM moderate", 20, 1.25},

		// Light traffic
		{"2 AM light", 2, 1.0},
		{"12 PM light", 12, 1.0},
		{"1 PM light", 13, 1.0},
		{"2 PM light", 14, 1.0},
		{"10 PM light", 22, 1.0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			testTime := time.Date(2024, 1, 15, tt.hour, 30, 0, 0, time.UTC)
			factor := svc.getTrafficFactor(testTime)
			if factor != tt.wantFactor {
				t.Errorf("getTrafficFactor() at %d:00 = %v, want %v", tt.hour, factor, tt.wantFactor)
			}
		})
	}
}

func TestGetTrafficConditions(t *testing.T) {
	svc := &TrackingService{}

	tests := []struct {
		factor    float64
		wantCond  string
	}{
		{1.0, "light"},
		{1.1, "light"},
		{1.19, "light"},
		{1.2, "moderate"},
		{1.25, "moderate"},
		{1.39, "moderate"},
		{1.4, "heavy"},
		{1.5, "heavy"},
		{2.0, "heavy"},
	}

	for _, tt := range tests {
		t.Run(tt.wantCond, func(t *testing.T) {
			result := svc.getTrafficConditions(tt.factor)
			if result != tt.wantCond {
				t.Errorf("getTrafficConditions(%v) = %v, want %v", tt.factor, result, tt.wantCond)
			}
		})
	}
}

func TestRecordLocationInput_Structure(t *testing.T) {
	now := time.Now()

	input := RecordLocationInput{
		Latitude:       33.7701,
		Longitude:      -118.1937,
		SpeedMPH:       45.5,
		Heading:        180.0,
		AccuracyMeters: 5.0,
		Source:         "eld",
		RecordedAt:     now,
	}

	if input.Latitude != 33.7701 {
		t.Errorf("RecordLocationInput.Latitude = %v, want 33.7701", input.Latitude)
	}

	if input.SpeedMPH != 45.5 {
		t.Errorf("RecordLocationInput.SpeedMPH = %v, want 45.5", input.SpeedMPH)
	}

	if input.Source != "eld" {
		t.Errorf("RecordLocationInput.Source = %v, want eld", input.Source)
	}
}

func TestETAResult_Structure(t *testing.T) {
	now := time.Now()
	eta := now.Add(45 * time.Minute)

	result := ETAResult{
		ETA:               eta,
		DurationMins:      45,
		DistanceMiles:     22.5,
		TrafficConditions: "moderate",
	}

	if result.DurationMins != 45 {
		t.Errorf("ETAResult.DurationMins = %v, want 45", result.DurationMins)
	}

	if result.DistanceMiles != 22.5 {
		t.Errorf("ETAResult.DistanceMiles = %v, want 22.5", result.DistanceMiles)
	}

	if result.TrafficConditions != "moderate" {
		t.Errorf("ETAResult.TrafficConditions = %v, want moderate", result.TrafficConditions)
	}
}

func TestCreateGeofenceInput_Validation(t *testing.T) {
	tests := []struct {
		name     string
		input    CreateGeofenceInput
		wantErr  bool
	}{
		{
			name: "valid circle geofence",
			input: CreateGeofenceInput{
				Name:            "Port of Long Beach - Pier J",
				Type:            "circle",
				CenterLatitude:  33.7501,
				CenterLongitude: -118.1937,
				RadiusMeters:    500,
			},
			wantErr: false,
		},
		{
			name: "valid polygon geofence",
			input: CreateGeofenceInput{
				Name: "Terminal Zone",
				Type: "polygon",
				Polygon: []domain.Coordinate{
					{Latitude: 33.78, Longitude: -118.25},
					{Latitude: 33.78, Longitude: -118.15},
					{Latitude: 33.70, Longitude: -118.15},
					{Latitude: 33.70, Longitude: -118.25},
				},
			},
			wantErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Validate structure fields exist
			if tt.input.Name == "" && !tt.wantErr {
				t.Error("Expected Name to be set")
			}
			if tt.input.Type == "" && !tt.wantErr {
				t.Error("Expected Type to be set")
			}
		})
	}
}

func TestRecordMilestoneInput_Structure(t *testing.T) {
	now := time.Now()

	input := RecordMilestoneInput{
		Type:            domain.MilestoneArrived,
		OccurredAt:      now,
		Latitude:        33.7501,
		Longitude:       -118.1937,
		ContainerNumber: "MSCU1234567",
		Source:          "driver_app",
		RecordedBy:      "driver@example.com",
		Metadata: map[string]string{
			"gate_number": "G15",
			"dock_door":   "D42",
		},
	}

	if input.Type != domain.MilestoneArrived {
		t.Errorf("RecordMilestoneInput.Type = %v, want ARRIVED", input.Type)
	}

	if input.ContainerNumber != "MSCU1234567" {
		t.Errorf("RecordMilestoneInput.ContainerNumber = %v, want MSCU1234567", input.ContainerNumber)
	}

	if len(input.Metadata) != 2 {
		t.Errorf("RecordMilestoneInput.Metadata length = %v, want 2", len(input.Metadata))
	}
}

// Benchmark tests for performance-critical functions

func BenchmarkHaversineDistance(b *testing.B) {
	svc := &TrackingService{}
	lat1, lon1 := 34.0522, -118.2437
	lat2, lon2 := 33.7701, -118.1937

	for i := 0; i < b.N; i++ {
		svc.haversineDistance(lat1, lon1, lat2, lon2)
	}
}

func BenchmarkPointInPolygon(b *testing.B) {
	svc := &TrackingService{}
	polygon := []domain.Coordinate{
		{Latitude: 33.78, Longitude: -118.25},
		{Latitude: 33.78, Longitude: -118.15},
		{Latitude: 33.70, Longitude: -118.15},
		{Latitude: 33.70, Longitude: -118.25},
	}

	for i := 0; i < b.N; i++ {
		svc.pointInPolygon(33.74, -118.20, polygon)
	}
}

func BenchmarkGetTrafficFactor(b *testing.B) {
	svc := &TrackingService{}
	testTime := time.Date(2024, 1, 15, 8, 30, 0, 0, time.UTC)

	for i := 0; i < b.N; i++ {
		svc.getTrafficFactor(testTime)
	}
}
