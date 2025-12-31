package repository

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/draymaster/services/order-service/internal/domain"
)

// PostgresShipmentRepository implements ShipmentRepository using PostgreSQL
type PostgresShipmentRepository struct {
	pool *pgxpool.Pool
}

// NewPostgresShipmentRepository creates a new PostgreSQL shipment repository
func NewPostgresShipmentRepository(pool *pgxpool.Pool) *PostgresShipmentRepository {
	return &PostgresShipmentRepository{pool: pool}
}

// Create creates a new shipment
func (r *PostgresShipmentRepository) Create(ctx context.Context, shipment *domain.Shipment) error {
	query := `
		INSERT INTO shipments (
			id, type, reference_number, customer_id, steamship_line_id,
			port_id, terminal_id, vessel_name, voyage_number, vessel_eta, vessel_ata,
			last_free_day, port_cutoff, doc_cutoff, earliest_return_date,
			consignee_id, shipper_id, empty_return_location_id, empty_pickup_location_id,
			status, special_instructions, created_at, updated_at
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
			$16, $17, $18, $19, $20, $21, $22, $23
		)`

	now := time.Now()
	if shipment.ID == uuid.Nil {
		shipment.ID = uuid.New()
	}
	shipment.CreatedAt = now
	shipment.UpdatedAt = now

	_, err := r.pool.Exec(ctx, query,
		shipment.ID,
		shipment.Type,
		shipment.ReferenceNumber,
		shipment.CustomerID,
		shipment.SteamshipLineID,
		shipment.PortID,
		shipment.TerminalID,
		shipment.VesselName,
		shipment.VoyageNumber,
		shipment.VesselETA,
		shipment.VesselATA,
		shipment.LastFreeDay,
		shipment.PortCutoff,
		shipment.DocCutoff,
		shipment.EarliestReturnDate,
		shipment.ConsigneeID,
		shipment.ShipperID,
		shipment.EmptyReturnLocationID,
		shipment.EmptyPickupLocationID,
		shipment.Status,
		shipment.SpecialInstructions,
		shipment.CreatedAt,
		shipment.UpdatedAt,
	)

	if err != nil {
		return fmt.Errorf("failed to create shipment: %w", err)
	}

	return nil
}

// GetByID retrieves a shipment by ID
func (r *PostgresShipmentRepository) GetByID(ctx context.Context, id uuid.UUID) (*domain.Shipment, error) {
	query := `
		SELECT 
			s.id, s.type, s.reference_number, s.customer_id, s.steamship_line_id,
			s.port_id, s.terminal_id, s.vessel_name, s.voyage_number, s.vessel_eta, s.vessel_ata,
			s.last_free_day, s.port_cutoff, s.doc_cutoff, s.earliest_return_date,
			s.consignee_id, s.shipper_id, s.empty_return_location_id, s.empty_pickup_location_id,
			s.status, s.special_instructions, s.created_at, s.updated_at,
			c.name as customer_name,
			ssl.name as steamship_line_name,
			t.name as terminal_name,
			(SELECT COUNT(*) FROM containers WHERE shipment_id = s.id) as total_containers,
			(SELECT COUNT(*) FROM orders o 
			 JOIN containers ct ON o.container_id = ct.id 
			 WHERE ct.shipment_id = s.id AND o.status = 'COMPLETED') as completed_containers
		FROM shipments s
		LEFT JOIN customers c ON s.customer_id = c.id
		LEFT JOIN steamship_lines ssl ON s.steamship_line_id = ssl.id
		LEFT JOIN locations t ON s.terminal_id = t.id
		WHERE s.id = $1`

	shipment := &domain.Shipment{}
	err := r.pool.QueryRow(ctx, query, id).Scan(
		&shipment.ID,
		&shipment.Type,
		&shipment.ReferenceNumber,
		&shipment.CustomerID,
		&shipment.SteamshipLineID,
		&shipment.PortID,
		&shipment.TerminalID,
		&shipment.VesselName,
		&shipment.VoyageNumber,
		&shipment.VesselETA,
		&shipment.VesselATA,
		&shipment.LastFreeDay,
		&shipment.PortCutoff,
		&shipment.DocCutoff,
		&shipment.EarliestReturnDate,
		&shipment.ConsigneeID,
		&shipment.ShipperID,
		&shipment.EmptyReturnLocationID,
		&shipment.EmptyPickupLocationID,
		&shipment.Status,
		&shipment.SpecialInstructions,
		&shipment.CreatedAt,
		&shipment.UpdatedAt,
		&shipment.CustomerName,
		&shipment.SteamshipLineName,
		&shipment.TerminalName,
		&shipment.TotalContainers,
		&shipment.CompletedContainers,
	)

	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, fmt.Errorf("shipment not found: %s", id)
		}
		return nil, fmt.Errorf("failed to get shipment: %w", err)
	}

	return shipment, nil
}

// GetByReferenceNumber retrieves a shipment by reference number
func (r *PostgresShipmentRepository) GetByReferenceNumber(ctx context.Context, refNum string) (*domain.Shipment, error) {
	query := `SELECT id FROM shipments WHERE reference_number = $1`
	
	var id uuid.UUID
	err := r.pool.QueryRow(ctx, query, refNum).Scan(&id)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, fmt.Errorf("shipment not found: %s", refNum)
		}
		return nil, fmt.Errorf("failed to get shipment: %w", err)
	}

	return r.GetByID(ctx, id)
}

// List retrieves shipments based on filter criteria
func (r *PostgresShipmentRepository) List(ctx context.Context, filter ShipmentFilter) ([]*domain.Shipment, int64, error) {
	var conditions []string
	var args []interface{}
	argNum := 1

	if filter.Type != "" {
		conditions = append(conditions, fmt.Sprintf("s.type = $%d", argNum))
		args = append(args, filter.Type)
		argNum++
	}

	if filter.Status != "" {
		conditions = append(conditions, fmt.Sprintf("s.status = $%d", argNum))
		args = append(args, filter.Status)
		argNum++
	}

	if filter.CustomerID != nil {
		conditions = append(conditions, fmt.Sprintf("s.customer_id = $%d", argNum))
		args = append(args, *filter.CustomerID)
		argNum++
	}

	if filter.LFDBefore != nil {
		conditions = append(conditions, fmt.Sprintf("s.last_free_day <= $%d", argNum))
		args = append(args, *filter.LFDBefore)
		argNum++
	}

	if filter.LFDAfter != nil {
		conditions = append(conditions, fmt.Sprintf("s.last_free_day >= $%d", argNum))
		args = append(args, *filter.LFDAfter)
		argNum++
	}

	whereClause := ""
	if len(conditions) > 0 {
		whereClause = "WHERE " + strings.Join(conditions, " AND ")
	}

	// Count total
	countQuery := fmt.Sprintf(`SELECT COUNT(*) FROM shipments s %s`, whereClause)
	var total int64
	err := r.pool.QueryRow(ctx, countQuery, args...).Scan(&total)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to count shipments: %w", err)
	}

	// Get data with pagination
	sortBy := "created_at"
	if filter.SortBy != "" {
		sortBy = filter.SortBy
	}
	sortOrder := "DESC"
	if filter.SortOrder == "asc" {
		sortOrder = "ASC"
	}

	pageSize := 20
	if filter.PageSize > 0 && filter.PageSize <= 100 {
		pageSize = filter.PageSize
	}
	page := 1
	if filter.Page > 0 {
		page = filter.Page
	}
	offset := (page - 1) * pageSize

	query := fmt.Sprintf(`
		SELECT 
			s.id, s.type, s.reference_number, s.customer_id, s.steamship_line_id,
			s.port_id, s.terminal_id, s.vessel_name, s.voyage_number, s.vessel_eta,
			s.last_free_day, s.status, s.created_at, s.updated_at,
			c.name as customer_name,
			ssl.name as steamship_line_name,
			(SELECT COUNT(*) FROM containers WHERE shipment_id = s.id) as total_containers
		FROM shipments s
		LEFT JOIN customers c ON s.customer_id = c.id
		LEFT JOIN steamship_lines ssl ON s.steamship_line_id = ssl.id
		%s
		ORDER BY s.%s %s
		LIMIT $%d OFFSET $%d`,
		whereClause, sortBy, sortOrder, argNum, argNum+1)

	args = append(args, pageSize, offset)

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to list shipments: %w", err)
	}
	defer rows.Close()

	var shipments []*domain.Shipment
	for rows.Next() {
		s := &domain.Shipment{}
		err := rows.Scan(
			&s.ID,
			&s.Type,
			&s.ReferenceNumber,
			&s.CustomerID,
			&s.SteamshipLineID,
			&s.PortID,
			&s.TerminalID,
			&s.VesselName,
			&s.VoyageNumber,
			&s.VesselETA,
			&s.LastFreeDay,
			&s.Status,
			&s.CreatedAt,
			&s.UpdatedAt,
			&s.CustomerName,
			&s.SteamshipLineName,
			&s.TotalContainers,
		)
		if err != nil {
			return nil, 0, fmt.Errorf("failed to scan shipment: %w", err)
		}
		shipments = append(shipments, s)
	}

	return shipments, total, nil
}

// Update updates a shipment
func (r *PostgresShipmentRepository) Update(ctx context.Context, shipment *domain.Shipment) error {
	query := `
		UPDATE shipments SET
			vessel_eta = $2,
			vessel_ata = $3,
			last_free_day = $4,
			port_cutoff = $5,
			doc_cutoff = $6,
			consignee_id = $7,
			shipper_id = $8,
			empty_return_location_id = $9,
			empty_pickup_location_id = $10,
			status = $11,
			special_instructions = $12,
			updated_at = $13
		WHERE id = $1`

	shipment.UpdatedAt = time.Now()

	result, err := r.pool.Exec(ctx, query,
		shipment.ID,
		shipment.VesselETA,
		shipment.VesselATA,
		shipment.LastFreeDay,
		shipment.PortCutoff,
		shipment.DocCutoff,
		shipment.ConsigneeID,
		shipment.ShipperID,
		shipment.EmptyReturnLocationID,
		shipment.EmptyPickupLocationID,
		shipment.Status,
		shipment.SpecialInstructions,
		shipment.UpdatedAt,
	)

	if err != nil {
		return fmt.Errorf("failed to update shipment: %w", err)
	}

	if result.RowsAffected() == 0 {
		return fmt.Errorf("shipment not found: %s", shipment.ID)
	}

	return nil
}

// UpdateStatus updates shipment status
func (r *PostgresShipmentRepository) UpdateStatus(ctx context.Context, id uuid.UUID, status domain.ShipmentStatus) error {
	query := `UPDATE shipments SET status = $2, updated_at = $3 WHERE id = $1`
	
	result, err := r.pool.Exec(ctx, query, id, status, time.Now())
	if err != nil {
		return fmt.Errorf("failed to update shipment status: %w", err)
	}

	if result.RowsAffected() == 0 {
		return fmt.Errorf("shipment not found: %s", id)
	}

	return nil
}

// Delete deletes a shipment
func (r *PostgresShipmentRepository) Delete(ctx context.Context, id uuid.UUID) error {
	query := `DELETE FROM shipments WHERE id = $1`
	
	result, err := r.pool.Exec(ctx, query, id)
	if err != nil {
		return fmt.Errorf("failed to delete shipment: %w", err)
	}

	if result.RowsAffected() == 0 {
		return fmt.Errorf("shipment not found: %s", id)
	}

	return nil
}
