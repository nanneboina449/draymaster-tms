package domain

import (
	"time"

	"github.com/google/uuid"
)

// InvoiceStatus represents the status of an invoice
type InvoiceStatus string

const (
	InvoiceStatusDraft     InvoiceStatus = "DRAFT"
	InvoiceStatusPending   InvoiceStatus = "PENDING"
	InvoiceStatusSent      InvoiceStatus = "SENT"
	InvoiceStatusPaid      InvoiceStatus = "PAID"
	InvoiceStatusPartial   InvoiceStatus = "PARTIAL"
	InvoiceStatusOverdue   InvoiceStatus = "OVERDUE"
	InvoiceStatusVoid      InvoiceStatus = "VOID"
)

// ChargeType represents the type of charge
type ChargeType string

const (
	ChargeTypeLineHaul     ChargeType = "LINE_HAUL"
	ChargeTypeFuelSurcharge ChargeType = "FUEL_SURCHARGE"
	ChargeTypeDetention    ChargeType = "DETENTION"
	ChargeTypeDemurrage    ChargeType = "DEMURRAGE"
	ChargeTypePerDiem      ChargeType = "PER_DIEM"
	ChargeTypeChassis      ChargeType = "CHASSIS"
	ChargeTypeStorage      ChargeType = "STORAGE"
	ChargeTypeRedelivery   ChargeType = "REDELIVERY"
	ChargeTypeDryRun       ChargeType = "DRY_RUN"
	ChargeTypeWaiting      ChargeType = "WAITING"
	ChargeTypeOverweight   ChargeType = "OVERWEIGHT"
	ChargeTypeHazmat       ChargeType = "HAZMAT"
	ChargeTypeReefer       ChargeType = "REEFER"
	ChargeTypePrepull      ChargeType = "PREPULL"
	ChargeTypeOther        ChargeType = "OTHER"
)

// Invoice represents a customer invoice
type Invoice struct {
	ID              uuid.UUID     `json:"id" db:"id"`
	InvoiceNumber   string        `json:"invoice_number" db:"invoice_number"`
	CustomerID      uuid.UUID     `json:"customer_id" db:"customer_id"`
	CustomerName    string        `json:"customer_name,omitempty"`
	ShipmentID      *uuid.UUID    `json:"shipment_id,omitempty" db:"shipment_id"`
	Status          InvoiceStatus `json:"status" db:"status"`
	
	// Dates
	InvoiceDate     time.Time  `json:"invoice_date" db:"invoice_date"`
	DueDate         time.Time  `json:"due_date" db:"due_date"`
	SentDate        *time.Time `json:"sent_date,omitempty" db:"sent_date"`
	PaidDate        *time.Time `json:"paid_date,omitempty" db:"paid_date"`
	
	// Amounts
	Subtotal        float64    `json:"subtotal" db:"subtotal"`
	TaxRate         float64    `json:"tax_rate" db:"tax_rate"`
	TaxAmount       float64    `json:"tax_amount" db:"tax_amount"`
	TotalAmount     float64    `json:"total_amount" db:"total_amount"`
	PaidAmount      float64    `json:"paid_amount" db:"paid_amount"`
	BalanceDue      float64    `json:"balance_due" db:"balance_due"`
	
	// Terms
	PaymentTerms    string     `json:"payment_terms" db:"payment_terms"` // NET30, NET45, etc.
	Currency        string     `json:"currency" db:"currency"`
	
	// Reference
	PONumber        string     `json:"po_number,omitempty" db:"po_number"`
	BOLNumber       string     `json:"bol_number,omitempty" db:"bol_number"`
	Notes           string     `json:"notes,omitempty" db:"notes"`
	
	// QuickBooks/Accounting
	QBInvoiceID     string     `json:"qb_invoice_id,omitempty" db:"qb_invoice_id"`
	SyncedAt        *time.Time `json:"synced_at,omitempty" db:"synced_at"`
	
	CreatedAt       time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at" db:"updated_at"`
	CreatedBy       string     `json:"created_by" db:"created_by"`
	
	// Associations
	LineItems       []InvoiceLineItem `json:"line_items,omitempty"`
	Payments        []Payment         `json:"payments,omitempty"`
}

// IsOverdue checks if invoice is overdue
func (i *Invoice) IsOverdue() bool {
	return i.Status != InvoiceStatusPaid && 
		   i.Status != InvoiceStatusVoid && 
		   time.Now().After(i.DueDate)
}

// InvoiceLineItem represents a line item on an invoice
type InvoiceLineItem struct {
	ID              uuid.UUID  `json:"id" db:"id"`
	InvoiceID       uuid.UUID  `json:"invoice_id" db:"invoice_id"`
	TripID          *uuid.UUID `json:"trip_id,omitempty" db:"trip_id"`
	OrderID         *uuid.UUID `json:"order_id,omitempty" db:"order_id"`
	ChargeType      ChargeType `json:"charge_type" db:"charge_type"`
	Description     string     `json:"description" db:"description"`
	Quantity        float64    `json:"quantity" db:"quantity"`
	UnitPrice       float64    `json:"unit_price" db:"unit_price"`
	Amount          float64    `json:"amount" db:"amount"`
	ContainerNumber string     `json:"container_number,omitempty" db:"container_number"`
	TripNumber      string     `json:"trip_number,omitempty" db:"trip_number"`
	CreatedAt       time.Time  `json:"created_at" db:"created_at"`
}

// Payment represents a payment received
type Payment struct {
	ID              uuid.UUID `json:"id" db:"id"`
	InvoiceID       uuid.UUID `json:"invoice_id" db:"invoice_id"`
	PaymentNumber   string    `json:"payment_number" db:"payment_number"`
	PaymentDate     time.Time `json:"payment_date" db:"payment_date"`
	Amount          float64   `json:"amount" db:"amount"`
	PaymentMethod   string    `json:"payment_method" db:"payment_method"` // check, ach, wire, credit_card
	ReferenceNumber string    `json:"reference_number,omitempty" db:"reference_number"` // check number, transaction ID
	Notes           string    `json:"notes,omitempty" db:"notes"`
	CreatedAt       time.Time `json:"created_at" db:"created_at"`
	CreatedBy       string    `json:"created_by" db:"created_by"`
}

// Rate represents a customer rate
type Rate struct {
	ID              uuid.UUID  `json:"id" db:"id"`
	CustomerID      uuid.UUID  `json:"customer_id" db:"customer_id"`
	Name            string     `json:"name" db:"name"`
	Description     string     `json:"description,omitempty" db:"description"`
	RateType        string     `json:"rate_type" db:"rate_type"` // flat, per_mile, per_hour
	
	// Origin/Destination
	OriginType      string     `json:"origin_type" db:"origin_type"` // terminal, port, zone, any
	OriginID        *uuid.UUID `json:"origin_id,omitempty" db:"origin_id"`
	OriginZone      string     `json:"origin_zone,omitempty" db:"origin_zone"`
	DestinationType string     `json:"destination_type" db:"destination_type"`
	DestinationID   *uuid.UUID `json:"destination_id,omitempty" db:"destination_id"`
	DestinationZone string     `json:"destination_zone,omitempty" db:"destination_zone"`
	
	// Container specifics
	ContainerSize   string     `json:"container_size,omitempty" db:"container_size"` // 20, 40, 45, any
	ContainerType   string     `json:"container_type,omitempty" db:"container_type"` // dry, reefer, any
	
	// Amounts
	BaseRate        float64    `json:"base_rate" db:"base_rate"`
	FuelSurcharge   float64    `json:"fuel_surcharge" db:"fuel_surcharge"` // percentage or flat
	FuelSurchargeType string   `json:"fuel_surcharge_type" db:"fuel_surcharge_type"` // percent, flat
	
	// Validity
	EffectiveDate   time.Time  `json:"effective_date" db:"effective_date"`
	ExpirationDate  *time.Time `json:"expiration_date,omitempty" db:"expiration_date"`
	IsActive        bool       `json:"is_active" db:"is_active"`
	
	CreatedAt       time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at" db:"updated_at"`
}

// AccessorialRate represents rates for accessorial charges
type AccessorialRate struct {
	ID              uuid.UUID  `json:"id" db:"id"`
	CustomerID      *uuid.UUID `json:"customer_id,omitempty" db:"customer_id"` // null = default for all
	ChargeType      ChargeType `json:"charge_type" db:"charge_type"`
	Description     string     `json:"description" db:"description"`
	RateType        string     `json:"rate_type" db:"rate_type"` // flat, per_hour, per_day, per_mile
	Rate            float64    `json:"rate" db:"rate"`
	MinCharge       float64    `json:"min_charge" db:"min_charge"`
	MaxCharge       float64    `json:"max_charge" db:"max_charge"`
	FreeTime        int        `json:"free_time" db:"free_time"` // minutes of free time before charge applies
	IsActive        bool       `json:"is_active" db:"is_active"`
	CreatedAt       time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at" db:"updated_at"`
}

// DriverSettlement represents driver pay settlement
type DriverSettlement struct {
	ID              uuid.UUID `json:"id" db:"id"`
	DriverID        uuid.UUID `json:"driver_id" db:"driver_id"`
	SettlementNumber string   `json:"settlement_number" db:"settlement_number"`
	PeriodStart     time.Time `json:"period_start" db:"period_start"`
	PeriodEnd       time.Time `json:"period_end" db:"period_end"`
	Status          string    `json:"status" db:"status"` // draft, approved, paid
	
	// Earnings
	GrossEarnings   float64   `json:"gross_earnings" db:"gross_earnings"`
	TotalMiles      float64   `json:"total_miles" db:"total_miles"`
	TotalTrips      int       `json:"total_trips" db:"total_trips"`
	
	// Deductions
	FuelDeductions  float64   `json:"fuel_deductions" db:"fuel_deductions"`
	AdvanceDeductions float64 `json:"advance_deductions" db:"advance_deductions"`
	OtherDeductions float64   `json:"other_deductions" db:"other_deductions"`
	TotalDeductions float64   `json:"total_deductions" db:"total_deductions"`
	
	// Net
	NetPay          float64   `json:"net_pay" db:"net_pay"`
	
	// Payment
	PaidDate        *time.Time `json:"paid_date,omitempty" db:"paid_date"`
	PaymentMethod   string    `json:"payment_method,omitempty" db:"payment_method"`
	PaymentReference string   `json:"payment_reference,omitempty" db:"payment_reference"`
	
	Notes           string    `json:"notes,omitempty" db:"notes"`
	ApprovedBy      string    `json:"approved_by,omitempty" db:"approved_by"`
	ApprovedAt      *time.Time `json:"approved_at,omitempty" db:"approved_at"`
	CreatedAt       time.Time `json:"created_at" db:"created_at"`
	UpdatedAt       time.Time `json:"updated_at" db:"updated_at"`
	
	// Line items
	LineItems       []SettlementLineItem `json:"line_items,omitempty"`
}

// SettlementLineItem represents a line item on driver settlement
type SettlementLineItem struct {
	ID              uuid.UUID `json:"id" db:"id"`
	SettlementID    uuid.UUID `json:"settlement_id" db:"settlement_id"`
	TripID          *uuid.UUID `json:"trip_id,omitempty" db:"trip_id"`
	TripNumber      string    `json:"trip_number,omitempty" db:"trip_number"`
	TripDate        *time.Time `json:"trip_date,omitempty" db:"trip_date"`
	Type            string    `json:"type" db:"type"` // trip_pay, accessorial, bonus, deduction
	Description     string    `json:"description" db:"description"`
	Miles           float64   `json:"miles" db:"miles"`
	Rate            float64   `json:"rate" db:"rate"`
	Amount          float64   `json:"amount" db:"amount"`
	CreatedAt       time.Time `json:"created_at" db:"created_at"`
}

// DriverPayRate represents driver pay rates
type DriverPayRate struct {
	ID              uuid.UUID  `json:"id" db:"id"`
	DriverID        uuid.UUID  `json:"driver_id" db:"driver_id"`
	PayType         string     `json:"pay_type" db:"pay_type"` // per_mile, per_load, percentage, hourly
	Rate            float64    `json:"rate" db:"rate"`
	
	// For percentage-based pay
	PercentageOf    string     `json:"percentage_of,omitempty" db:"percentage_of"` // gross, line_haul
	
	// Specifics
	ContainerSize   string     `json:"container_size,omitempty" db:"container_size"`
	TripType        string     `json:"trip_type,omitempty" db:"trip_type"`
	
	EffectiveDate   time.Time  `json:"effective_date" db:"effective_date"`
	ExpirationDate  *time.Time `json:"expiration_date,omitempty" db:"expiration_date"`
	IsActive        bool       `json:"is_active" db:"is_active"`
	
	CreatedAt       time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at" db:"updated_at"`
}

// BillingQueue represents orders ready to be billed
type BillingQueue struct {
	OrderID         uuid.UUID `json:"order_id"`
	OrderNumber     string    `json:"order_number"`
	CustomerID      uuid.UUID `json:"customer_id"`
	CustomerName    string    `json:"customer_name"`
	ContainerNumber string    `json:"container_number"`
	TripID          *uuid.UUID `json:"trip_id,omitempty"`
	TripNumber      string    `json:"trip_number,omitempty"`
	CompletedAt     time.Time `json:"completed_at"`
	LineHaulRate    float64   `json:"line_haul_rate"`
	AccessorialCharges float64 `json:"accessorial_charges"`
	TotalEstimate   float64   `json:"total_estimate"`
	DaysInQueue     int       `json:"days_in_queue"`
}

// ARAgingSummary represents accounts receivable aging
type ARAgingSummary struct {
	CustomerID      uuid.UUID `json:"customer_id"`
	CustomerName    string    `json:"customer_name"`
	Current         float64   `json:"current"`         // 0-30 days
	Days31To60      float64   `json:"days_31_to_60"`
	Days61To90      float64   `json:"days_61_to_90"`
	Over90Days      float64   `json:"over_90_days"`
	TotalOutstanding float64  `json:"total_outstanding"`
	CreditLimit     float64   `json:"credit_limit"`
	OnCreditHold    bool      `json:"on_credit_hold"`
}
