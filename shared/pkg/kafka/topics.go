package kafka

// TopicRegistry defines all Kafka topics used in the system
type TopicRegistry struct {
	// Order Service topics
	ShipmentCreated      string
	ContainerAdded       string
	OrderCreated         string
	OrderStatusChanged   string
	AppointmentRequested string
	AppointmentConfirmed string
	AppointmentCancelled string
	AppointmentRescheduled string
	AppointmentArrival   string
	AppointmentCompleted string

	// Dispatch Service topics
	TripCreated         string
	TripAssigned        string
	TripDispatched      string
	TripCompleted       string
	StopCompleted       string
	StreetTurnMatched   string
	ExceptionCreated    string
	ExceptionUpdated    string
	ExceptionResolved   string

	// Tracking Service topics
	LocationUpdated     string
	MilestoneRecorded   string
	GeofenceEntered     string
	GeofenceExited      string

	// Driver Service topics
	HOSViolation        string
	DriverAvailable     string
	DriverUnavailable   string
	DocumentExpiring    string

	// Billing Service topics
	InvoiceCreated      string
	PaymentReceived     string
	SettlementGenerated string

	// System topics
	NotificationSent    string
	AlertTriggered      string
}

// Topics is the global topic registry
var Topics = TopicRegistry{
	// Order Service
	ShipmentCreated:      "orders.shipment.created",
	ContainerAdded:       "orders.container.added",
	OrderCreated:         "orders.order.created",
	OrderStatusChanged:   "orders.order.status_changed",
	AppointmentRequested: "orders.appointment.requested",
	AppointmentConfirmed: "orders.appointment.confirmed",
	AppointmentCancelled: "orders.appointment.cancelled",
	AppointmentRescheduled: "orders.appointment.rescheduled",
	AppointmentArrival:   "orders.appointment.arrival",
	AppointmentCompleted: "orders.appointment.completed",

	// Dispatch Service
	TripCreated:       "dispatch.trip.created",
	TripAssigned:      "dispatch.trip.assigned",
	TripDispatched:    "dispatch.trip.dispatched",
	TripCompleted:     "dispatch.trip.completed",
	StopCompleted:     "dispatch.stop.completed",
	StreetTurnMatched: "dispatch.street_turn.matched",
	ExceptionCreated:  "dispatch.exception.created",
	ExceptionUpdated:  "dispatch.exception.updated",
	ExceptionResolved: "dispatch.exception.resolved",

	// Tracking Service
	LocationUpdated:   "tracking.location.updated",
	MilestoneRecorded: "tracking.milestone.recorded",
	GeofenceEntered:   "tracking.geofence.entered",
	GeofenceExited:    "tracking.geofence.exited",

	// Driver Service
	HOSViolation:      "drivers.hos.violation",
	DriverAvailable:   "drivers.driver.available",
	DriverUnavailable: "drivers.driver.unavailable",
	DocumentExpiring:  "drivers.document.expiring",

	// Billing Service
	InvoiceCreated:      "billing.invoice.created",
	PaymentReceived:     "billing.payment.received",
	SettlementGenerated: "billing.settlement.generated",

	// System
	NotificationSent: "system.notification.sent",
	AlertTriggered:   "system.alert.triggered",
}

// GetAllTopics returns a list of all topic names
func (t *TopicRegistry) GetAllTopics() []string {
	return []string{
		// Order Service
		t.ShipmentCreated,
		t.ContainerAdded,
		t.OrderCreated,
		t.OrderStatusChanged,
		t.AppointmentRequested,
		t.AppointmentConfirmed,
		t.AppointmentCancelled,
		t.AppointmentRescheduled,
		t.AppointmentArrival,
		t.AppointmentCompleted,

		// Dispatch Service
		t.TripCreated,
		t.TripAssigned,
		t.TripDispatched,
		t.TripCompleted,
		t.StopCompleted,
		t.StreetTurnMatched,
		t.ExceptionCreated,
		t.ExceptionUpdated,
		t.ExceptionResolved,

		// Tracking Service
		t.LocationUpdated,
		t.MilestoneRecorded,
		t.GeofenceEntered,
		t.GeofenceExited,

		// Driver Service
		t.HOSViolation,
		t.DriverAvailable,
		t.DriverUnavailable,
		t.DocumentExpiring,

		// Billing Service
		t.InvoiceCreated,
		t.PaymentReceived,
		t.SettlementGenerated,

		// System
		t.NotificationSent,
		t.AlertTriggered,
	}
}
