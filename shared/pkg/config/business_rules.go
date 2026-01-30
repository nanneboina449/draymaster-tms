package config

import "time"

// BusinessRules contains configurable business rules for the TMS
type BusinessRules struct {
	Weight     WeightRules
	Distance   DistanceRules
	Time       TimeRules
	Rates      RateRules
	Detention  DetentionRules
	PerDiem    PerDiemRules
	Demurrage  DemurrageRules
}

// WeightRules contains weight-related configuration
type WeightRules struct {
	MaxGrossWeightLbs       int     // Maximum legal gross weight
	OverweightThresholdLbs  int     // Threshold for overweight permit requirement
	TareWeight20ftLbs       int     // Empty 20ft container weight
	TareWeight40ftLbs       int     // Empty 40ft container weight
	TareWeight45ftLbs       int     // Empty 45ft container weight
	MaxPayloadLbs           int     // Maximum payload weight
}

// DistanceRules contains distance and routing configuration
type DistanceRules struct {
	AverageSpeedMPH         float64 // Average speed for ETA calculation
	DrayageAverageSpeedMPH  float64 // Average speed for local drayage
	HighwaySpeedMPH         float64 // Highway speed
	TerminalDwellMins       int     // Average time at terminal
	WarehouseDwellMins      int     // Average time at warehouse
}

// TimeRules contains time-related configuration
type TimeRules struct {
	MinAppointmentAdvanceHours int           // Minimum hours before appointment
	AppointmentWindowMins      int           // Appointment window duration
	DefaultFreeTimeMins        int           // Default free time at location
	LiveLoadFreeTimeMins       int           // Free time for live load
	LiveUnloadFreeTimeMins     int           // Free time for live unload
	DropHookFreeTimeMins       int           // Free time for drop and hook
	TerminalFreeTimeMins       int           // Free time at terminal gate
}

// RateRules contains rate calculation configuration
type RateRules struct {
	BaseRatePerMile         float64 // Base rate per mile
	MinimumCharge           float64 // Minimum charge per move
	FuelSurchargePercent    float64 // Fuel surcharge as percentage
	HazmatCharge            float64 // Additional charge for hazmat
	OverweightCharge        float64 // Additional charge for overweight
	ReeferCharge            float64 // Additional charge for reefer
	TWICRequiredCharge      float64 // Additional charge for TWIC required
	PrePullDiscount         float64 // Discount for pre-pull
	StreetTurnDiscount      float64 // Discount for street turn
}

// DetentionRules contains detention charge configuration
type DetentionRules struct {
	FreeTimeMins            int     // Free time before detention starts
	RatePerHour             float64 // Detention rate per hour
	MaxDailyCharge          float64 // Maximum detention charge per day
	GracePeriodMins         int     // Grace period before charges start
}

// PerDiemRules contains per-diem storage charge configuration
type PerDiemRules struct {
	FreeDays                int               // Free days before charges start
	Rates                   map[string][]TierRate // Rates by container size
}

// DemurrageRules contains demurrage charge configuration (steamship line charges)
type DemurrageRules struct {
	FreeDays                int               // Free days before demurrage starts
	Rates                   map[string][]TierRate // Rates by container size
}

// TierRate represents a tiered pricing structure
type TierRate struct {
	FromDay int     // Starting day (inclusive)
	ToDay   int     // Ending day (inclusive), 0 means unlimited
	Rate    float64 // Rate per day for this tier
}

// DefaultBusinessRules returns default business rules
func DefaultBusinessRules() *BusinessRules {
	return &BusinessRules{
		Weight: WeightRules{
			MaxGrossWeightLbs:      67200, // 80,000 lbs total - 12,800 lbs tractor/chassis
			OverweightThresholdLbs: 44000, // Standard threshold
			TareWeight20ftLbs:      4850,  // Typical 20ft container
			TareWeight40ftLbs:      8400,  // Typical 40ft container
			TareWeight45ftLbs:      10200, // Typical 45ft container
			MaxPayloadLbs:          58000, // Practical maximum
		},
		Distance: DistanceRules{
			AverageSpeedMPH:        45.0, // General average
			DrayageAverageSpeedMPH: 35.0, // Local drayage (more stops, traffic)
			HighwaySpeedMPH:        55.0, // Highway cruising
			TerminalDwellMins:      30,   // Typical terminal processing
			WarehouseDwellMins:     45,   // Warehouse processing
		},
		Time: TimeRules{
			MinAppointmentAdvanceHours: 2,   // Minimum 2 hours advance
			AppointmentWindowMins:      30,  // 30-minute window
			DefaultFreeTimeMins:        30,  // Default free time
			LiveLoadFreeTimeMins:       120, // 2 hours for live load
			LiveUnloadFreeTimeMins:     120, // 2 hours for live unload
			DropHookFreeTimeMins:       30,  // 30 minutes for drop/hook
			TerminalFreeTimeMins:       60,  // 1 hour at terminal
		},
		Rates: RateRules{
			BaseRatePerMile:      3.50,  // $3.50 per mile base
			MinimumCharge:        150.00, // $150 minimum
			FuelSurchargePercent: 15.0,   // 15% fuel surcharge
			HazmatCharge:         150.00, // $150 hazmat fee
			OverweightCharge:     100.00, // $100 overweight fee
			ReeferCharge:         75.00,  // $75 reefer fee
			TWICRequiredCharge:   50.00,  // $50 TWIC required fee
			PrePullDiscount:      25.00,  // $25 pre-pull discount
			StreetTurnDiscount:   50.00,  // $50 street turn discount
		},
		Detention: DetentionRules{
			FreeTimeMins:   120,   // 2 hours free time
			RatePerHour:    75.00, // $75 per hour
			MaxDailyCharge: 600.00, // $600 max per day
			GracePeriodMins: 15,   // 15-minute grace period
		},
		PerDiem: PerDiemRules{
			FreeDays: 5, // 5 free days (typical for drayage company storage)
			Rates: map[string][]TierRate{
				"20": {
					{FromDay: 6, ToDay: 10, Rate: 25.00},
					{FromDay: 11, ToDay: 20, Rate: 35.00},
					{FromDay: 21, ToDay: 0, Rate: 50.00}, // 0 means unlimited
				},
				"40": {
					{FromDay: 6, ToDay: 10, Rate: 35.00},
					{FromDay: 11, ToDay: 20, Rate: 50.00},
					{FromDay: 21, ToDay: 0, Rate: 75.00},
				},
				"45": {
					{FromDay: 6, ToDay: 10, Rate: 40.00},
					{FromDay: 11, ToDay: 20, Rate: 60.00},
					{FromDay: 21, ToDay: 0, Rate: 85.00},
				},
			},
		},
		Demurrage: DemurrageRules{
			FreeDays: 0, // Demurrage starts after Last Free Day (set by SSL)
			Rates: map[string][]TierRate{
				"20": {
					{FromDay: 1, ToDay: 5, Rate: 75.00},
					{FromDay: 6, ToDay: 10, Rate: 150.00},
					{FromDay: 11, ToDay: 20, Rate: 300.00},
					{FromDay: 21, ToDay: 0, Rate: 500.00},
				},
				"40": {
					{FromDay: 1, ToDay: 5, Rate: 100.00},
					{FromDay: 6, ToDay: 10, Rate: 200.00},
					{FromDay: 11, ToDay: 20, Rate: 400.00},
					{FromDay: 21, ToDay: 0, Rate: 750.00},
				},
				"45": {
					{FromDay: 1, ToDay: 5, Rate: 125.00},
					{FromDay: 6, ToDay: 10, Rate: 250.00},
					{FromDay: 11, ToDay: 20, Rate: 500.00},
					{FromDay: 21, ToDay: 0, Rate: 1000.00},
				},
			},
		},
	}
}

// CalculateTieredRate calculates rate based on tiered structure
func CalculateTieredRate(days int, tiers []TierRate) float64 {
	if days <= 0 {
		return 0
	}

	var totalCharge float64

	for _, tier := range tiers {
		if days < tier.FromDay {
			break
		}

		// Calculate how many days fall in this tier
		endDay := tier.ToDay
		if endDay == 0 || endDay > days {
			endDay = days
		}

		daysInTier := endDay - tier.FromDay + 1
		if daysInTier > 0 {
			totalCharge += float64(daysInTier) * tier.Rate
		}

		if tier.ToDay != 0 && days <= tier.ToDay {
			break
		}
	}

	return totalCharge
}

// CalculateDetention calculates detention charges
func (r *DetentionRules) Calculate(actualMins, freeMins int) (float64, int) {
	if freeMins == 0 {
		freeMins = r.FreeTimeMins
	}

	totalFreeTime := freeMins + r.GracePeriodMins
	if actualMins <= totalFreeTime {
		return 0, 0
	}

	detentionMins := actualMins - totalFreeTime
	hours := float64(detentionMins) / 60.0
	charge := hours * r.RatePerHour

	// Apply daily cap
	if charge > r.MaxDailyCharge {
		charge = r.MaxDailyCharge
	}

	return charge, detentionMins
}

// GetFreeTime returns appropriate free time based on activity
func (r *TimeRules) GetFreeTime(activityType string) int {
	switch activityType {
	case "LIVE_LOAD":
		return r.LiveLoadFreeTimeMins
	case "LIVE_UNLOAD":
		return r.LiveUnloadFreeTimeMins
	case "DROP_HOOK":
		return r.DropHookFreeTimeMins
	case "TERMINAL_GATE":
		return r.TerminalFreeTimeMins
	default:
		return r.DefaultFreeTimeMins
	}
}

// CalculateETA calculates estimated arrival time
func (r *DistanceRules) CalculateETA(distanceMiles float64, trafficFactor float64) time.Duration {
	if trafficFactor == 0 {
		trafficFactor = 1.0
	}

	hours := distanceMiles / r.DrayageAverageSpeedMPH
	adjustedHours := hours * trafficFactor

	return time.Duration(adjustedHours * float64(time.Hour))
}
