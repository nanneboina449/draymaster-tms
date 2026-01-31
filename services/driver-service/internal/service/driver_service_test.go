package service

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/draymaster/services/driver-service/internal/domain"
)

// =============================================================================
// MOCK REPOSITORIES
// =============================================================================

type mockDriverRepo struct {
	drivers    map[uuid.UUID]*domain.Driver
	createErr  error
	getErr     error
	updateErr  error
	deleteErr  error
}

func newMockDriverRepo() *mockDriverRepo {
	return &mockDriverRepo{
		drivers: make(map[uuid.UUID]*domain.Driver),
	}
}

func (m *mockDriverRepo) Create(ctx context.Context, driver *domain.Driver) error {
	if m.createErr != nil {
		return m.createErr
	}
	m.drivers[driver.ID] = driver
	return nil
}

func (m *mockDriverRepo) GetByID(ctx context.Context, id uuid.UUID) (*domain.Driver, error) {
	if m.getErr != nil {
		return nil, m.getErr
	}
	driver, ok := m.drivers[id]
	if !ok {
		return nil, errors.New("driver not found")
	}
	return driver, nil
}

func (m *mockDriverRepo) GetByEmployeeNumber(ctx context.Context, employeeNumber string) (*domain.Driver, error) {
	for _, d := range m.drivers {
		if d.EmployeeNumber == employeeNumber {
			return d, nil
		}
	}
	return nil, errors.New("driver not found")
}

func (m *mockDriverRepo) GetAll(ctx context.Context) ([]domain.Driver, error) {
	var drivers []domain.Driver
	for _, d := range m.drivers {
		drivers = append(drivers, *d)
	}
	return drivers, nil
}

func (m *mockDriverRepo) GetByStatus(ctx context.Context, status domain.DriverStatus) ([]domain.Driver, error) {
	var drivers []domain.Driver
	for _, d := range m.drivers {
		if d.Status == status {
			drivers = append(drivers, *d)
		}
	}
	return drivers, nil
}

func (m *mockDriverRepo) GetAvailable(ctx context.Context) ([]domain.Driver, error) {
	var drivers []domain.Driver
	for _, d := range m.drivers {
		if d.Status == domain.DriverStatusAvailable {
			drivers = append(drivers, *d)
		}
	}
	return drivers, nil
}

func (m *mockDriverRepo) GetByTerminalID(ctx context.Context, terminalID uuid.UUID) ([]domain.Driver, error) {
	var drivers []domain.Driver
	for _, d := range m.drivers {
		if d.HomeTerminalID != nil && *d.HomeTerminalID == terminalID {
			drivers = append(drivers, *d)
		}
	}
	return drivers, nil
}

func (m *mockDriverRepo) Update(ctx context.Context, driver *domain.Driver) error {
	if m.updateErr != nil {
		return m.updateErr
	}
	m.drivers[driver.ID] = driver
	return nil
}

func (m *mockDriverRepo) UpdateStatus(ctx context.Context, id uuid.UUID, status domain.DriverStatus) error {
	if m.updateErr != nil {
		return m.updateErr
	}
	if d, ok := m.drivers[id]; ok {
		d.Status = status
	}
	return nil
}

func (m *mockDriverRepo) UpdateLocation(ctx context.Context, id uuid.UUID, lat, lon float64) error {
	if d, ok := m.drivers[id]; ok {
		d.CurrentLatitude = lat
		d.CurrentLongitude = lon
	}
	return nil
}

func (m *mockDriverRepo) UpdateHOS(ctx context.Context, id uuid.UUID, driveMins, dutyMins, cycleMins int) error {
	if d, ok := m.drivers[id]; ok {
		d.AvailableDriveMins = driveMins
		d.AvailableDutyMins = dutyMins
		d.AvailableCycleMins = cycleMins
	}
	return nil
}

func (m *mockDriverRepo) Delete(ctx context.Context, id uuid.UUID) error {
	if m.deleteErr != nil {
		return m.deleteErr
	}
	delete(m.drivers, id)
	return nil
}

func (m *mockDriverRepo) GetExpiringDocuments(ctx context.Context, daysUntilExpiry int) ([]domain.Driver, error) {
	var drivers []domain.Driver
	now := time.Now()
	deadline := now.Add(time.Duration(daysUntilExpiry) * 24 * time.Hour)

	for _, d := range m.drivers {
		if d.LicenseExpiration != nil && d.LicenseExpiration.Before(deadline) {
			drivers = append(drivers, *d)
		}
	}
	return drivers, nil
}

// Mock HOS Log Repository
type mockHOSLogRepo struct {
	logs      map[uuid.UUID]*domain.HOSLog
	createErr error
}

func newMockHOSLogRepo() *mockHOSLogRepo {
	return &mockHOSLogRepo{
		logs: make(map[uuid.UUID]*domain.HOSLog),
	}
}

func (m *mockHOSLogRepo) Create(ctx context.Context, log *domain.HOSLog) error {
	if m.createErr != nil {
		return m.createErr
	}
	m.logs[log.ID] = log
	return nil
}

func (m *mockHOSLogRepo) GetByID(ctx context.Context, id uuid.UUID) (*domain.HOSLog, error) {
	log, ok := m.logs[id]
	if !ok {
		return nil, errors.New("log not found")
	}
	return log, nil
}

func (m *mockHOSLogRepo) GetByDriverID(ctx context.Context, driverID uuid.UUID, startTime, endTime time.Time) ([]domain.HOSLog, error) {
	var logs []domain.HOSLog
	for _, l := range m.logs {
		if l.DriverID == driverID && l.StartTime.After(startTime) && l.StartTime.Before(endTime) {
			logs = append(logs, *l)
		}
	}
	return logs, nil
}

func (m *mockHOSLogRepo) GetCurrentStatus(ctx context.Context, driverID uuid.UUID) (*domain.HOSLog, error) {
	var latest *domain.HOSLog
	for _, l := range m.logs {
		if l.DriverID == driverID && l.EndTime == nil {
			if latest == nil || l.StartTime.After(latest.StartTime) {
				latest = l
			}
		}
	}
	if latest == nil {
		return nil, errors.New("no current status")
	}
	return latest, nil
}

func (m *mockHOSLogRepo) GetByDateRange(ctx context.Context, driverID uuid.UUID, date time.Time) ([]domain.HOSLog, error) {
	startOfDay := time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, date.Location())
	endOfDay := startOfDay.Add(24 * time.Hour)
	return m.GetByDriverID(ctx, driverID, startOfDay, endOfDay)
}

func (m *mockHOSLogRepo) GetLast8Days(ctx context.Context, driverID uuid.UUID) ([]domain.HOSLog, error) {
	now := time.Now()
	startTime := now.AddDate(0, 0, -8)
	return m.GetByDriverID(ctx, driverID, startTime, now)
}

func (m *mockHOSLogRepo) Update(ctx context.Context, log *domain.HOSLog) error {
	m.logs[log.ID] = log
	return nil
}

func (m *mockHOSLogRepo) CloseCurrentLog(ctx context.Context, driverID uuid.UUID, endTime time.Time) error {
	for _, l := range m.logs {
		if l.DriverID == driverID && l.EndTime == nil {
			l.EndTime = &endTime
			l.DurationMins = int(endTime.Sub(l.StartTime).Minutes())
		}
	}
	return nil
}

// Mock Violation Repository
type mockViolationRepo struct {
	violations map[uuid.UUID]*domain.HOSViolation
}

func newMockViolationRepo() *mockViolationRepo {
	return &mockViolationRepo{
		violations: make(map[uuid.UUID]*domain.HOSViolation),
	}
}

func (m *mockViolationRepo) Create(ctx context.Context, violation *domain.HOSViolation) error {
	m.violations[violation.ID] = violation
	return nil
}

func (m *mockViolationRepo) GetByID(ctx context.Context, id uuid.UUID) (*domain.HOSViolation, error) {
	v, ok := m.violations[id]
	if !ok {
		return nil, errors.New("violation not found")
	}
	return v, nil
}

func (m *mockViolationRepo) GetByDriverID(ctx context.Context, driverID uuid.UUID, startTime, endTime time.Time) ([]domain.HOSViolation, error) {
	var violations []domain.HOSViolation
	for _, v := range m.violations {
		if v.DriverID == driverID && v.OccurredAt.After(startTime) && v.OccurredAt.Before(endTime) {
			violations = append(violations, *v)
		}
	}
	return violations, nil
}

func (m *mockViolationRepo) GetUnacknowledged(ctx context.Context, driverID uuid.UUID) ([]domain.HOSViolation, error) {
	var violations []domain.HOSViolation
	for _, v := range m.violations {
		if v.DriverID == driverID && !v.Acknowledged {
			violations = append(violations, *v)
		}
	}
	return violations, nil
}

func (m *mockViolationRepo) Acknowledge(ctx context.Context, id uuid.UUID) error {
	if v, ok := m.violations[id]; ok {
		v.Acknowledged = true
	}
	return nil
}

// Mock Alert Repository
type mockAlertRepo struct {
	alerts map[uuid.UUID]*domain.ComplianceAlert
}

func newMockAlertRepo() *mockAlertRepo {
	return &mockAlertRepo{
		alerts: make(map[uuid.UUID]*domain.ComplianceAlert),
	}
}

func (m *mockAlertRepo) Create(ctx context.Context, alert *domain.ComplianceAlert) error {
	m.alerts[alert.ID] = alert
	return nil
}

func (m *mockAlertRepo) GetByID(ctx context.Context, id uuid.UUID) (*domain.ComplianceAlert, error) {
	a, ok := m.alerts[id]
	if !ok {
		return nil, errors.New("alert not found")
	}
	return a, nil
}

func (m *mockAlertRepo) GetByDriverID(ctx context.Context, driverID uuid.UUID) ([]domain.ComplianceAlert, error) {
	var alerts []domain.ComplianceAlert
	for _, a := range m.alerts {
		if a.DriverID == driverID {
			alerts = append(alerts, *a)
		}
	}
	return alerts, nil
}

func (m *mockAlertRepo) GetActive(ctx context.Context) ([]domain.ComplianceAlert, error) {
	var alerts []domain.ComplianceAlert
	for _, a := range m.alerts {
		if !a.Acknowledged {
			alerts = append(alerts, *a)
		}
	}
	return alerts, nil
}

func (m *mockAlertRepo) Acknowledge(ctx context.Context, id uuid.UUID) error {
	if a, ok := m.alerts[id]; ok {
		a.Acknowledged = true
	}
	return nil
}

func (m *mockAlertRepo) DeleteExpired(ctx context.Context) error {
	return nil
}

// Mock Document Repository
type mockDocumentRepo struct {
	documents map[uuid.UUID]*domain.DriverDocument
}

func newMockDocumentRepo() *mockDocumentRepo {
	return &mockDocumentRepo{
		documents: make(map[uuid.UUID]*domain.DriverDocument),
	}
}

func (m *mockDocumentRepo) Create(ctx context.Context, doc *domain.DriverDocument) error {
	m.documents[doc.ID] = doc
	return nil
}

func (m *mockDocumentRepo) GetByID(ctx context.Context, id uuid.UUID) (*domain.DriverDocument, error) {
	d, ok := m.documents[id]
	if !ok {
		return nil, errors.New("document not found")
	}
	return d, nil
}

func (m *mockDocumentRepo) GetByDriverID(ctx context.Context, driverID uuid.UUID) ([]domain.DriverDocument, error) {
	var docs []domain.DriverDocument
	for _, d := range m.documents {
		if d.DriverID == driverID {
			docs = append(docs, *d)
		}
	}
	return docs, nil
}

func (m *mockDocumentRepo) GetByType(ctx context.Context, driverID uuid.UUID, docType string) (*domain.DriverDocument, error) {
	for _, d := range m.documents {
		if d.DriverID == driverID && d.Type == docType {
			return d, nil
		}
	}
	return nil, errors.New("document not found")
}

func (m *mockDocumentRepo) Update(ctx context.Context, doc *domain.DriverDocument) error {
	m.documents[doc.ID] = doc
	return nil
}

func (m *mockDocumentRepo) Delete(ctx context.Context, id uuid.UUID) error {
	delete(m.documents, id)
	return nil
}

// =============================================================================
// SERVICE TESTS
// =============================================================================

func createTestService() (*DriverService, *mockDriverRepo, *mockHOSLogRepo, *mockViolationRepo, *mockAlertRepo) {
	driverRepo := newMockDriverRepo()
	hosLogRepo := newMockHOSLogRepo()
	violationRepo := newMockViolationRepo()
	alertRepo := newMockAlertRepo()
	documentRepo := newMockDocumentRepo()

	svc := &DriverService{
		driverRepo:    driverRepo,
		hosLogRepo:    hosLogRepo,
		violationRepo: violationRepo,
		alertRepo:     alertRepo,
		documentRepo:  documentRepo,
		eventProducer: nil, // Not testing events
		logger:        nil, // Not testing logging
	}

	return svc, driverRepo, hosLogRepo, violationRepo, alertRepo
}

func TestDriverService_CreateDriver(t *testing.T) {
	svc, driverRepo, hosLogRepo, _, _ := createTestService()
	ctx := context.Background()

	futureDate := time.Now().Add(365 * 24 * time.Hour)
	input := CreateDriverInput{
		EmployeeNumber:    "EMP001",
		FirstName:         "John",
		LastName:          "Doe",
		Email:             "john.doe@example.com",
		Phone:             "555-123-4567",
		LicenseNumber:     "DL12345",
		LicenseState:      "CA",
		LicenseClass:      "A",
		LicenseExpiration: &futureDate,
	}

	driver, err := svc.CreateDriver(ctx, input)
	if err != nil {
		t.Fatalf("CreateDriver() error = %v", err)
	}

	if driver == nil {
		t.Fatal("CreateDriver() returned nil driver")
	}

	if driver.FirstName != input.FirstName {
		t.Errorf("CreateDriver() FirstName = %v, want %v", driver.FirstName, input.FirstName)
	}

	if driver.LastName != input.LastName {
		t.Errorf("CreateDriver() LastName = %v, want %v", driver.LastName, input.LastName)
	}

	if driver.Status != domain.DriverStatusAvailable {
		t.Errorf("CreateDriver() Status = %v, want %v", driver.Status, domain.DriverStatusAvailable)
	}

	// Check initial HOS values
	if driver.AvailableDriveMins != 660 {
		t.Errorf("CreateDriver() AvailableDriveMins = %v, want 660", driver.AvailableDriveMins)
	}

	if driver.AvailableDutyMins != 840 {
		t.Errorf("CreateDriver() AvailableDutyMins = %v, want 840", driver.AvailableDutyMins)
	}

	if driver.AvailableCycleMins != 4200 {
		t.Errorf("CreateDriver() AvailableCycleMins = %v, want 4200", driver.AvailableCycleMins)
	}

	// Verify driver was stored
	if len(driverRepo.drivers) != 1 {
		t.Errorf("Expected 1 driver in repo, got %d", len(driverRepo.drivers))
	}

	// Verify initial HOS log was created
	if len(hosLogRepo.logs) != 1 {
		t.Errorf("Expected 1 HOS log in repo, got %d", len(hosLogRepo.logs))
	}
}

func TestDriverService_CreateDriver_Error(t *testing.T) {
	svc, driverRepo, _, _, _ := createTestService()
	ctx := context.Background()

	driverRepo.createErr = errors.New("database error")

	input := CreateDriverInput{
		FirstName: "John",
		LastName:  "Doe",
	}

	_, err := svc.CreateDriver(ctx, input)
	if err == nil {
		t.Error("CreateDriver() expected error, got nil")
	}
}

func TestDriverService_GetDriver(t *testing.T) {
	svc, driverRepo, _, _, _ := createTestService()
	ctx := context.Background()

	// Add a driver directly to the mock
	driverID := uuid.New()
	driverRepo.drivers[driverID] = &domain.Driver{
		ID:        driverID,
		FirstName: "Jane",
		LastName:  "Smith",
	}

	driver, err := svc.GetDriver(ctx, driverID)
	if err != nil {
		t.Fatalf("GetDriver() error = %v", err)
	}

	if driver.FirstName != "Jane" {
		t.Errorf("GetDriver() FirstName = %v, want Jane", driver.FirstName)
	}
}

func TestDriverService_GetDriver_NotFound(t *testing.T) {
	svc, _, _, _, _ := createTestService()
	ctx := context.Background()

	_, err := svc.GetDriver(ctx, uuid.New())
	if err == nil {
		t.Error("GetDriver() expected error for non-existent driver")
	}
}

func TestDriverService_GetAvailableDrivers(t *testing.T) {
	svc, driverRepo, _, _, _ := createTestService()
	ctx := context.Background()

	futureDate := time.Now().Add(365 * 24 * time.Hour)

	// Create available driver with sufficient time
	availableDriver := &domain.Driver{
		ID:                 uuid.New(),
		FirstName:          "John",
		LastName:           "Doe",
		Status:             domain.DriverStatusAvailable,
		LicenseExpiration:  &futureDate,
		AvailableDriveMins: 660,
		AvailableDutyMins:  840,
		AvailableCycleMins: 4200,
		HasHazmatEndorsement: true,
		HasTWIC:            true,
	}
	driverRepo.drivers[availableDriver.ID] = availableDriver

	// Create non-available driver
	busyDriver := &domain.Driver{
		ID:        uuid.New(),
		FirstName: "Jane",
		LastName:  "Smith",
		Status:    domain.DriverStatusDriving,
	}
	driverRepo.drivers[busyDriver.ID] = busyDriver

	// Create driver with insufficient time
	tiredDriver := &domain.Driver{
		ID:                 uuid.New(),
		FirstName:          "Bob",
		LastName:           "Jones",
		Status:             domain.DriverStatusAvailable,
		LicenseExpiration:  &futureDate,
		AvailableDriveMins: 30,
		AvailableDutyMins:  840,
		AvailableCycleMins: 4200,
	}
	driverRepo.drivers[tiredDriver.ID] = tiredDriver

	// Test without special requirements
	drivers, err := svc.GetAvailableDrivers(ctx, 60, false, false)
	if err != nil {
		t.Fatalf("GetAvailableDrivers() error = %v", err)
	}

	if len(drivers) != 1 {
		t.Errorf("GetAvailableDrivers() returned %d drivers, want 1", len(drivers))
	}

	// Test with hazmat requirement
	drivers, err = svc.GetAvailableDrivers(ctx, 60, true, false)
	if err != nil {
		t.Fatalf("GetAvailableDrivers() error = %v", err)
	}

	if len(drivers) != 1 {
		t.Errorf("GetAvailableDrivers() with hazmat returned %d drivers, want 1", len(drivers))
	}

	// Test with TWIC requirement
	drivers, err = svc.GetAvailableDrivers(ctx, 60, false, true)
	if err != nil {
		t.Fatalf("GetAvailableDrivers() error = %v", err)
	}

	if len(drivers) != 1 {
		t.Errorf("GetAvailableDrivers() with TWIC returned %d drivers, want 1", len(drivers))
	}
}

func TestDriverService_UpdateDriverStatus(t *testing.T) {
	svc, driverRepo, _, _, _ := createTestService()
	ctx := context.Background()

	driverID := uuid.New()
	driverRepo.drivers[driverID] = &domain.Driver{
		ID:     driverID,
		Status: domain.DriverStatusAvailable,
	}

	err := svc.UpdateDriverStatus(ctx, driverID, domain.DriverStatusDriving)
	if err != nil {
		t.Fatalf("UpdateDriverStatus() error = %v", err)
	}

	if driverRepo.drivers[driverID].Status != domain.DriverStatusDriving {
		t.Errorf("UpdateDriverStatus() Status = %v, want DRIVING", driverRepo.drivers[driverID].Status)
	}
}

func TestDriverService_GetComplianceAlerts(t *testing.T) {
	svc, _, _, _, alertRepo := createTestService()
	ctx := context.Background()

	driverID := uuid.New()
	alertID := uuid.New()

	alertRepo.alerts[alertID] = &domain.ComplianceAlert{
		ID:        alertID,
		DriverID:  driverID,
		Type:      "license_expiring",
		Severity:  "warning",
		DaysUntil: 25,
	}

	alerts, err := svc.GetComplianceAlerts(ctx, driverID)
	if err != nil {
		t.Fatalf("GetComplianceAlerts() error = %v", err)
	}

	if len(alerts) != 1 {
		t.Errorf("GetComplianceAlerts() returned %d alerts, want 1", len(alerts))
	}

	if alerts[0].Type != "license_expiring" {
		t.Errorf("GetComplianceAlerts() Type = %v, want license_expiring", alerts[0].Type)
	}
}

func TestDriverService_AcknowledgeViolation(t *testing.T) {
	svc, _, _, violationRepo, _ := createTestService()
	ctx := context.Background()

	violationID := uuid.New()
	violationRepo.violations[violationID] = &domain.HOSViolation{
		ID:           violationID,
		Type:         "11_HOUR",
		Acknowledged: false,
	}

	err := svc.AcknowledgeViolation(ctx, violationID)
	if err != nil {
		t.Fatalf("AcknowledgeViolation() error = %v", err)
	}

	if !violationRepo.violations[violationID].Acknowledged {
		t.Error("AcknowledgeViolation() did not set Acknowledged = true")
	}
}

func TestNeedsBreak(t *testing.T) {
	svc, _, _, _, _ := createTestService()
	now := time.Now()

	tests := []struct {
		name     string
		logs     []domain.HOSLog
		expected bool
	}{
		{
			name: "no driving - no break needed",
			logs: []domain.HOSLog{
				{Status: domain.HOSStatusOffDuty, StartTime: now.Add(-2 * time.Hour), DurationMins: 120},
			},
			expected: false,
		},
		{
			name: "under 8 hours driving - no break needed",
			logs: []domain.HOSLog{
				{Status: domain.HOSStatusDriving, StartTime: now.Add(-4 * time.Hour), DurationMins: 240},
			},
			expected: false,
		},
		{
			name: "8+ hours driving without break - needs break",
			logs: []domain.HOSLog{
				{Status: domain.HOSStatusDriving, StartTime: now.Add(-9 * time.Hour), DurationMins: 540},
			},
			expected: true,
		},
		{
			name: "8+ hours driving with 30-min break - no break needed",
			logs: []domain.HOSLog{
				{Status: domain.HOSStatusDriving, StartTime: now.Add(-5 * time.Hour), DurationMins: 240},
				{Status: domain.HOSStatusOffDuty, StartTime: now.Add(-4*time.Hour - 30*time.Minute), DurationMins: 30},
				{Status: domain.HOSStatusDriving, StartTime: now.Add(-4 * time.Hour), DurationMins: 240},
			},
			expected: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := svc.needsBreak(tt.logs)
			if result != tt.expected {
				t.Errorf("needsBreak() = %v, want %v", result, tt.expected)
			}
		})
	}
}

func TestGetMinsUntilBreak(t *testing.T) {
	svc, _, _, _, _ := createTestService()
	now := time.Now()

	tests := []struct {
		name     string
		logs     []domain.HOSLog
		expected int
	}{
		{
			name: "no driving - full 8 hours",
			logs: []domain.HOSLog{
				{Status: domain.HOSStatusOffDuty, StartTime: now.Add(-2 * time.Hour), DurationMins: 120},
			},
			expected: 480,
		},
		{
			name: "4 hours driving - 4 hours until break",
			logs: []domain.HOSLog{
				{Status: domain.HOSStatusDriving, StartTime: now.Add(-4 * time.Hour), DurationMins: 240},
			},
			expected: 240,
		},
		{
			name: "7 hours driving - 1 hour until break",
			logs: []domain.HOSLog{
				{Status: domain.HOSStatusDriving, StartTime: now.Add(-7 * time.Hour), DurationMins: 420},
			},
			expected: 60,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := svc.getMinsUntilBreak(tt.logs)
			if result != tt.expected {
				t.Errorf("getMinsUntilBreak() = %v, want %v", result, tt.expected)
			}
		})
	}
}

func TestMax(t *testing.T) {
	tests := []struct {
		a, b     int
		expected int
	}{
		{5, 3, 5},
		{3, 5, 5},
		{5, 5, 5},
		{0, 5, 5},
		{-5, 3, 3},
		{-5, -3, -3},
	}

	for _, tt := range tests {
		result := max(tt.a, tt.b)
		if result != tt.expected {
			t.Errorf("max(%d, %d) = %d, want %d", tt.a, tt.b, result, tt.expected)
		}
	}
}

func TestTimePtr(t *testing.T) {
	now := time.Now()
	ptr := timePtr(now)

	if ptr == nil {
		t.Error("timePtr() returned nil")
	}

	if *ptr != now {
		t.Errorf("timePtr() = %v, want %v", *ptr, now)
	}
}
