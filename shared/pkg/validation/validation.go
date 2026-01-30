package validation

import (
	"fmt"
	"regexp"
	"time"
)

// ContainerNumberValidator validates ISO 6346 container numbers
type ContainerNumberValidator struct{}

func NewContainerNumberValidator() *ContainerNumberValidator {
	return &ContainerNumberValidator{}
}

// Validate checks if container number follows ISO 6346 format
// Format: 4 letters (owner code) + 1 letter (category) + 6 digits + 1 check digit
func (v *ContainerNumberValidator) Validate(number string) error {
	if len(number) != 11 {
		return fmt.Errorf("container number must be 11 characters, got %d", len(number))
	}

	// First 4 characters must be letters (owner code)
	ownerCode := number[0:4]
	if !regexp.MustCompile(`^[A-Z]{4}$`).MatchString(ownerCode) {
		return fmt.Errorf("invalid owner code: must be 4 uppercase letters")
	}

	// 5th character must be U, J, or Z (equipment category)
	category := number[4]
	if category != 'U' && category != 'J' && category != 'Z' {
		return fmt.Errorf("invalid category identifier: must be U, J, or Z")
	}

	// Next 6 characters must be digits (serial number)
	serialNumber := number[5:11]
	if !regexp.MustCompile(`^[0-9]{6}$`).MatchString(serialNumber) {
		return fmt.Errorf("invalid serial number: must be 6 digits")
	}

	// Validate check digit (last digit)
	if !v.validateCheckDigit(number) {
		return fmt.Errorf("invalid check digit")
	}

	return nil
}

// validateCheckDigit verifies the ISO 6346 check digit
func (v *ContainerNumberValidator) validateCheckDigit(number string) bool {
	// ISO 6346 check digit calculation
	values := map[rune]int{
		'A': 10, 'B': 12, 'C': 13, 'D': 14, 'E': 15, 'F': 16, 'G': 17,
		'H': 18, 'I': 19, 'J': 20, 'K': 21, 'L': 23, 'M': 24, 'N': 25,
		'O': 26, 'P': 27, 'Q': 28, 'R': 29, 'S': 30, 'T': 31, 'U': 32,
		'V': 34, 'W': 35, 'X': 36, 'Y': 37, 'Z': 38,
	}

	sum := 0
	for i := 0; i < 10; i++ {
		char := rune(number[i])
		var value int
		if char >= 'A' && char <= 'Z' {
			value = values[char]
		} else {
			value = int(char - '0')
		}
		sum += value * (1 << i) // Multiply by 2^i
	}

	checkDigit := (sum % 11) % 10
	expectedCheckDigit := int(number[10] - '0')

	return checkDigit == expectedCheckDigit
}

// WeightValidator validates container weights
type WeightValidator struct {
	MaxWeightLbs int
}

func NewWeightValidator(maxWeightLbs int) *WeightValidator {
	if maxWeightLbs == 0 {
		maxWeightLbs = 67200 // Max gross weight for highway in most states
	}
	return &WeightValidator{MaxWeightLbs: maxWeightLbs}
}

func (v *WeightValidator) Validate(weightLbs int) error {
	if weightLbs <= 0 {
		return fmt.Errorf("weight must be positive, got %d", weightLbs)
	}
	if weightLbs > v.MaxWeightLbs {
		return fmt.Errorf("weight %d lbs exceeds maximum allowed %d lbs", weightLbs, v.MaxWeightLbs)
	}
	return nil
}

// IsOverweight checks if container is overweight (> 44,000 lbs typically triggers overweight permit)
func (v *WeightValidator) IsOverweight(weightLbs int, threshold int) bool {
	if threshold == 0 {
		threshold = 44000 // Standard threshold for overweight permits
	}
	return weightLbs > threshold
}

// CoordinateValidator validates latitude and longitude
type CoordinateValidator struct{}

func NewCoordinateValidator() *CoordinateValidator {
	return &CoordinateValidator{}
}

func (v *CoordinateValidator) ValidateLatitude(lat float64) error {
	if lat < -90 || lat > 90 {
		return fmt.Errorf("latitude must be between -90 and 90, got %f", lat)
	}
	return nil
}

func (v *CoordinateValidator) ValidateLongitude(lon float64) error {
	if lon < -180 || lon > 180 {
		return fmt.Errorf("longitude must be between -180 and 180, got %f", lon)
	}
	return nil
}

func (v *CoordinateValidator) ValidateCoordinates(lat, lon float64) error {
	if err := v.ValidateLatitude(lat); err != nil {
		return err
	}
	if err := v.ValidateLongitude(lon); err != nil {
		return err
	}
	return nil
}

// DateValidator validates date logic for shipments
type DateValidator struct{}

func NewDateValidator() *DateValidator {
	return &DateValidator{}
}

// ValidateShipmentDates ensures dates are in logical order
func (v *DateValidator) ValidateShipmentDates(vesselETA, lastFreeDay, portCutoff, docCutoff *time.Time) error {
	now := time.Now()

	// Vessel ETA should be in the future or recent past
	if vesselETA != nil && vesselETA.Before(now.AddDate(0, 0, -30)) {
		return fmt.Errorf("vessel ETA is too far in the past")
	}

	// Last Free Day must be after Vessel ETA for imports
	if vesselETA != nil && lastFreeDay != nil {
		if lastFreeDay.Before(*vesselETA) {
			return fmt.Errorf("last free day cannot be before vessel ETA")
		}
	}

	// Port cutoff must be after doc cutoff for exports
	if portCutoff != nil && docCutoff != nil {
		if portCutoff.Before(*docCutoff) {
			return fmt.Errorf("port cutoff cannot be before documentation cutoff")
		}
	}

	return nil
}

// ValidateAppointmentTime ensures appointment is valid
func (v *DateValidator) ValidateAppointmentTime(appointmentTime time.Time, minAdvanceHours int) error {
	now := time.Now()

	if appointmentTime.Before(now) {
		return fmt.Errorf("appointment time cannot be in the past")
	}

	if minAdvanceHours > 0 {
		minTime := now.Add(time.Duration(minAdvanceHours) * time.Hour)
		if appointmentTime.Before(minTime) {
			return fmt.Errorf("appointment must be scheduled at least %d hours in advance", minAdvanceHours)
		}
	}

	return nil
}

// HazmatValidator validates hazmat information
type HazmatValidator struct{}

func NewHazmatValidator() *HazmatValidator {
	return &HazmatValidator{}
}

func (v *HazmatValidator) Validate(isHazmat bool, hazmatClass, unNumber string) error {
	if !isHazmat {
		return nil
	}

	// If hazmat, must have class and UN number
	if hazmatClass == "" {
		return fmt.Errorf("hazmat class is required for hazardous materials")
	}

	if unNumber == "" {
		return fmt.Errorf("UN number is required for hazardous materials")
	}

	// Validate UN number format (UN followed by 4 digits)
	if !regexp.MustCompile(`^UN[0-9]{4}$`).MatchString(unNumber) {
		return fmt.Errorf("invalid UN number format: must be UN followed by 4 digits (e.g., UN1203)")
	}

	// Validate hazmat class (1-9 with possible subdivisions)
	if !regexp.MustCompile(`^[1-9](\.[1-9])?$`).MatchString(hazmatClass) {
		return fmt.Errorf("invalid hazmat class: must be 1-9 with optional subdivision (e.g., 3, 2.1)")
	}

	return nil
}

// ReeferValidator validates refrigerated container settings
type ReeferValidator struct{}

func NewReeferValidator() *ReeferValidator {
	return &ReeferValidator{}
}

func (v *ReeferValidator) Validate(isReefer bool, tempSetpoint *float64) error {
	if !isReefer {
		return nil
	}

	if tempSetpoint == nil {
		return fmt.Errorf("temperature setpoint is required for reefer containers")
	}

	// Typical reefer range: -30°C to +30°C (-22°F to 86°F)
	if *tempSetpoint < -30 || *tempSetpoint > 30 {
		return fmt.Errorf("temperature setpoint must be between -30°C and +30°C, got %f°C", *tempSetpoint)
	}

	return nil
}

// StringValidator validates string fields
type StringValidator struct{}

func NewStringValidator() *StringValidator {
	return &StringValidator{}
}

func (v *StringValidator) ValidateRequired(value, fieldName string) error {
	if value == "" {
		return fmt.Errorf("%s is required", fieldName)
	}
	return nil
}

func (v *StringValidator) ValidateLength(value, fieldName string, minLen, maxLen int) error {
	length := len(value)
	if minLen > 0 && length < minLen {
		return fmt.Errorf("%s must be at least %d characters, got %d", fieldName, minLen, length)
	}
	if maxLen > 0 && length > maxLen {
		return fmt.Errorf("%s must be at most %d characters, got %d", fieldName, maxLen, length)
	}
	return nil
}

func (v *StringValidator) ValidateFormat(value, fieldName, pattern string) error {
	matched, err := regexp.MatchString(pattern, value)
	if err != nil {
		return fmt.Errorf("invalid pattern for %s validation", fieldName)
	}
	if !matched {
		return fmt.Errorf("%s has invalid format", fieldName)
	}
	return nil
}
