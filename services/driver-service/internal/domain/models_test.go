package domain

import (
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestDriver_FullName(t *testing.T) {
	tests := []struct {
		name      string
		firstName string
		lastName  string
		want      string
	}{
		{
			name:      "normal names",
			firstName: "John",
			lastName:  "Doe",
			want:      "John Doe",
		},
		{
			name:      "single first name",
			firstName: "Prince",
			lastName:  "",
			want:      "Prince ",
		},
		{
			name:      "empty names",
			firstName: "",
			lastName:  "",
			want:      " ",
		},
		{
			name:      "hyphenated last name",
			firstName: "Mary",
			lastName:  "Smith-Jones",
			want:      "Mary Smith-Jones",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			d := &Driver{
				FirstName: tt.firstName,
				LastName:  tt.lastName,
			}
			if got := d.FullName(); got != tt.want {
				t.Errorf("Driver.FullName() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestDriver_IsCompliant(t *testing.T) {
	now := time.Now()
	futureDate := now.Add(30 * 24 * time.Hour)
	pastDate := now.Add(-7 * 24 * time.Hour)

	tests := []struct {
		name   string
		driver Driver
		want   bool
	}{
		{
			name: "fully compliant driver",
			driver: Driver{
				LicenseExpiration:     &futureDate,
				MedicalCardExpiration: &futureDate,
				HasTWIC:               true,
				TWICExpiration:        &futureDate,
			},
			want: true,
		},
		{
			name: "expired license",
			driver: Driver{
				LicenseExpiration:     &pastDate,
				MedicalCardExpiration: &futureDate,
			},
			want: false,
		},
		{
			name: "expired medical card",
			driver: Driver{
				LicenseExpiration:     &futureDate,
				MedicalCardExpiration: &pastDate,
			},
			want: false,
		},
		{
			name: "expired TWIC with TWIC required",
			driver: Driver{
				LicenseExpiration:     &futureDate,
				MedicalCardExpiration: &futureDate,
				HasTWIC:               true,
				TWICExpiration:        &pastDate,
			},
			want: false,
		},
		{
			name: "expired TWIC without TWIC required",
			driver: Driver{
				LicenseExpiration:     &futureDate,
				MedicalCardExpiration: &futureDate,
				HasTWIC:               false,
				TWICExpiration:        &pastDate,
			},
			want: true,
		},
		{
			name: "nil expiration dates",
			driver: Driver{
				LicenseExpiration:     nil,
				MedicalCardExpiration: nil,
			},
			want: true,
		},
		{
			name: "only license set and valid",
			driver: Driver{
				LicenseExpiration: &futureDate,
			},
			want: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.driver.IsCompliant(); got != tt.want {
				t.Errorf("Driver.IsCompliant() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestDriver_CanDrive(t *testing.T) {
	tests := []struct {
		name         string
		driver       Driver
		requiredMins int
		want         bool
	}{
		{
			name: "sufficient time available",
			driver: Driver{
				AvailableDriveMins:  660, // 11 hours
				AvailableDutyMins:   840, // 14 hours
				AvailableCycleMins:  4200, // 70 hours
			},
			requiredMins: 120,
			want:         true,
		},
		{
			name: "exact time available",
			driver: Driver{
				AvailableDriveMins:  120,
				AvailableDutyMins:   120,
				AvailableCycleMins:  120,
			},
			requiredMins: 120,
			want:         true,
		},
		{
			name: "insufficient drive time",
			driver: Driver{
				AvailableDriveMins:  60,
				AvailableDutyMins:   840,
				AvailableCycleMins:  4200,
			},
			requiredMins: 120,
			want:         false,
		},
		{
			name: "insufficient duty time",
			driver: Driver{
				AvailableDriveMins:  660,
				AvailableDutyMins:   60,
				AvailableCycleMins:  4200,
			},
			requiredMins: 120,
			want:         false,
		},
		{
			name: "insufficient cycle time",
			driver: Driver{
				AvailableDriveMins:  660,
				AvailableDutyMins:   840,
				AvailableCycleMins:  60,
			},
			requiredMins: 120,
			want:         false,
		},
		{
			name: "zero time available",
			driver: Driver{
				AvailableDriveMins:  0,
				AvailableDutyMins:   0,
				AvailableCycleMins:  0,
			},
			requiredMins: 120,
			want:         false,
		},
		{
			name: "zero required time",
			driver: Driver{
				AvailableDriveMins:  0,
				AvailableDutyMins:   0,
				AvailableCycleMins:  0,
			},
			requiredMins: 0,
			want:         true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.driver.CanDrive(tt.requiredMins); got != tt.want {
				t.Errorf("Driver.CanDrive(%d) = %v, want %v", tt.requiredMins, got, tt.want)
			}
		})
	}
}

func TestDriverStatus_Values(t *testing.T) {
	// Test that all expected status values are correct
	tests := []struct {
		status DriverStatus
		want   string
	}{
		{DriverStatusAvailable, "AVAILABLE"},
		{DriverStatusOnDuty, "ON_DUTY"},
		{DriverStatusDriving, "DRIVING"},
		{DriverStatusSleeper, "SLEEPER"},
		{DriverStatusOffDuty, "OFF_DUTY"},
		{DriverStatusInactive, "INACTIVE"},
	}

	for _, tt := range tests {
		t.Run(tt.want, func(t *testing.T) {
			if string(tt.status) != tt.want {
				t.Errorf("DriverStatus = %v, want %v", tt.status, tt.want)
			}
		})
	}
}

func TestHOSStatus_Values(t *testing.T) {
	tests := []struct {
		status HOSStatus
		want   string
	}{
		{HOSStatusOffDuty, "OFF_DUTY"},
		{HOSStatusSleeperBerth, "SLEEPER_BERTH"},
		{HOSStatusDriving, "DRIVING"},
		{HOSStatusOnDutyNotDriv, "ON_DUTY_NOT_DRIVING"},
	}

	for _, tt := range tests {
		t.Run(tt.want, func(t *testing.T) {
			if string(tt.status) != tt.want {
				t.Errorf("HOSStatus = %v, want %v", tt.status, tt.want)
			}
		})
	}
}

func TestHOSLog_Structure(t *testing.T) {
	now := time.Now()
	driverID := uuid.New()
	tripID := uuid.New()

	log := HOSLog{
		ID:        uuid.New(),
		DriverID:  driverID,
		Status:    HOSStatusDriving,
		StartTime: now,
		TripID:    &tripID,
		Source:    "eld",
	}

	if log.DriverID != driverID {
		t.Errorf("HOSLog.DriverID = %v, want %v", log.DriverID, driverID)
	}

	if log.Status != HOSStatusDriving {
		t.Errorf("HOSLog.Status = %v, want %v", log.Status, HOSStatusDriving)
	}

	if log.TripID == nil || *log.TripID != tripID {
		t.Errorf("HOSLog.TripID = %v, want %v", log.TripID, tripID)
	}

	if log.Source != "eld" {
		t.Errorf("HOSLog.Source = %v, want eld", log.Source)
	}
}

func TestHOSViolation_Types(t *testing.T) {
	now := time.Now()
	driverID := uuid.New()

	violations := []struct {
		violationType string
		description   string
	}{
		{"11_HOUR", "Exceeded 11-hour driving limit"},
		{"14_HOUR", "Exceeded 14-hour duty limit"},
		{"30_MIN_BREAK", "Required break not taken"},
		{"70_HOUR", "Exceeded 70-hour cycle limit"},
	}

	for _, v := range violations {
		t.Run(v.violationType, func(t *testing.T) {
			violation := HOSViolation{
				ID:           uuid.New(),
				DriverID:     driverID,
				Type:         v.violationType,
				OccurredAt:   now,
				Description:  v.description,
				Acknowledged: false,
				CreatedAt:    now,
			}

			if violation.Type != v.violationType {
				t.Errorf("HOSViolation.Type = %v, want %v", violation.Type, v.violationType)
			}

			if violation.Acknowledged {
				t.Error("New violation should not be acknowledged")
			}
		})
	}
}

func TestComplianceAlert_Severity(t *testing.T) {
	now := time.Now()
	driverID := uuid.New()

	tests := []struct {
		severity  string
		daysUntil int
		alertType string
	}{
		{"critical", 3, "license_expiring"},
		{"warning", 20, "medical_expiring"},
		{"critical", 5, "twic_expiring"},
		{"warning", 25, "hazmat_expiring"},
	}

	for _, tt := range tests {
		t.Run(tt.alertType+"_"+tt.severity, func(t *testing.T) {
			alert := ComplianceAlert{
				ID:        uuid.New(),
				DriverID:  driverID,
				Type:      tt.alertType,
				Severity:  tt.severity,
				DaysUntil: tt.daysUntil,
				CreatedAt: now,
			}

			if alert.Severity != tt.severity {
				t.Errorf("ComplianceAlert.Severity = %v, want %v", alert.Severity, tt.severity)
			}

			if alert.DaysUntil != tt.daysUntil {
				t.Errorf("ComplianceAlert.DaysUntil = %v, want %v", alert.DaysUntil, tt.daysUntil)
			}
		})
	}
}

func TestDriverDocument_Structure(t *testing.T) {
	now := time.Now()
	expiry := now.Add(365 * 24 * time.Hour)
	driverID := uuid.New()

	doc := DriverDocument{
		ID:         uuid.New(),
		DriverID:   driverID,
		Type:       "license",
		FileName:   "cdl_front.jpg",
		FilePath:   "/documents/drivers/" + driverID.String() + "/cdl_front.jpg",
		FileSize:   2048000,
		MimeType:   "image/jpeg",
		ExpiresAt:  &expiry,
		UploadedAt: now,
		UploadedBy: "admin@draymaster.com",
	}

	if doc.Type != "license" {
		t.Errorf("DriverDocument.Type = %v, want license", doc.Type)
	}

	if doc.MimeType != "image/jpeg" {
		t.Errorf("DriverDocument.MimeType = %v, want image/jpeg", doc.MimeType)
	}

	if doc.FileSize != 2048000 {
		t.Errorf("DriverDocument.FileSize = %v, want 2048000", doc.FileSize)
	}
}

func TestDriverPerformance_Structure(t *testing.T) {
	driverID := uuid.New()
	startDate := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)
	endDate := time.Date(2024, 1, 31, 23, 59, 59, 0, time.UTC)

	perf := DriverPerformance{
		DriverID:         driverID,
		Period:           "monthly",
		StartDate:        startDate,
		EndDate:          endDate,
		TotalTrips:       50,
		CompletedTrips:   48,
		OnTimeDeliveries: 45,
		LateDeliveries:   3,
		TotalMiles:       12500.5,
		TotalRevenue:     45000.00,
		FuelEfficiency:   7.2,
		IdleTimePercent:  12.5,
		HOSViolations:    1,
		DetentionMins:    180,
		AvgTripDuration:  4.5,
	}

	if perf.Period != "monthly" {
		t.Errorf("DriverPerformance.Period = %v, want monthly", perf.Period)
	}

	if perf.TotalTrips != 50 {
		t.Errorf("DriverPerformance.TotalTrips = %v, want 50", perf.TotalTrips)
	}

	completionRate := float64(perf.CompletedTrips) / float64(perf.TotalTrips) * 100
	if completionRate != 96.0 {
		t.Errorf("Completion rate = %v%%, want 96%%", completionRate)
	}

	onTimeRate := float64(perf.OnTimeDeliveries) / float64(perf.CompletedTrips) * 100
	expectedRate := 93.75
	if onTimeRate != expectedRate {
		t.Errorf("On-time rate = %v%%, want %v%%", onTimeRate, expectedRate)
	}
}
