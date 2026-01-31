package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/draymaster/services/emodal-integration/internal/domain"
)

// Repository provides read/write access to the eModal integration tables.
type Repository struct {
	pool *pgxpool.Pool
}

// NewRepository creates a new Repository backed by the given connection pool.
func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

// UpsertPublishedContainer inserts or updates a published container record.
func (r *Repository) UpsertPublishedContainer(ctx context.Context, pc domain.PublishedContainer) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO published_containers (container_number, terminal_code, port_code, published_at, current_status)
		 VALUES ($1, $2, $3, $4, $5)
		 ON CONFLICT (container_number) DO UPDATE SET
			 terminal_code   = EXCLUDED.terminal_code,
			 port_code       = COALESCE(EXCLUDED.port_code, published_containers.port_code),
			 current_status  = COALESCE(EXCLUDED.current_status, published_containers.current_status)`,
		pc.ContainerNumber, pc.TerminalCode, pc.PortCode, pc.PublishedAt, nilIfEmpty(string(pc.CurrentStatus)),
	)
	return err
}

// UpdateContainerStatus sets the current status and last_status_at for a tracked container.
func (r *Repository) UpdateContainerStatus(ctx context.Context, containerNumber string, status domain.ContainerStatus, statusAt time.Time) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE published_containers
		 SET current_status = $1, last_status_at = $2
		 WHERE container_number = $3`,
		string(status), statusAt, containerNumber,
	)
	return err
}

// GetContainerStatuses returns the tracked state of the requested containers.
// Containers not found in the table are simply omitted from the result.
func (r *Repository) GetContainerStatuses(ctx context.Context, containerNumbers []string) ([]domain.PublishedContainer, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT container_number, terminal_code, port_code, published_at, last_status_at, current_status
		 FROM published_containers
		 WHERE container_number = ANY($1)`,
		containerNumbers,
	)
	if err != nil {
		return nil, fmt.Errorf("query container statuses: %w", err)
	}
	defer rows.Close()

	var results []domain.PublishedContainer
	for rows.Next() {
		var pc domain.PublishedContainer
		var status *string
		if err := rows.Scan(
			&pc.ContainerNumber, &pc.TerminalCode, &pc.PortCode,
			&pc.PublishedAt, &pc.LastStatusAt, &status,
		); err != nil {
			return nil, fmt.Errorf("scan row: %w", err)
		}
		if status != nil {
			pc.CurrentStatus = domain.ContainerStatus(*status)
		}
		results = append(results, pc)
	}
	return results, rows.Err()
}

// InsertGateFee persists a new gate fee record.
func (r *Repository) InsertGateFee(ctx context.Context, fee domain.GateFee) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO gate_fees (id, container_id, container_number, order_id, terminal_id, type, amount, currency, billable_to, status, emodal_fee_id, assessed_at, paid_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
		fee.ID, fee.ContainerID, fee.ContainerNumber, fee.OrderID, fee.TerminalID,
		string(fee.Type), fee.Amount, fee.Currency, fee.BillableTo,
		string(fee.Status), fee.EModalFeeID, fee.AssessedAt, fee.PaidAt,
	)
	return err
}

// GetGateFees retrieves gate fees for a container.  If containerID is non-nil it is
// preferred; otherwise containerNumber is used.
func (r *Repository) GetGateFees(ctx context.Context, containerID *uuid.UUID, containerNumber string) ([]domain.GateFee, float64, error) {
	var rows pgx.Rows
	var err error

	if containerID != nil {
		rows, err = r.pool.Query(ctx,
			`SELECT id, container_id, container_number, order_id, terminal_id, type, amount, currency, billable_to, status, emodal_fee_id, assessed_at, paid_at
			 FROM gate_fees WHERE container_id = $1 ORDER BY assessed_at DESC`,
			*containerID,
		)
	} else {
		rows, err = r.pool.Query(ctx,
			`SELECT id, container_id, container_number, order_id, terminal_id, type, amount, currency, billable_to, status, emodal_fee_id, assessed_at, paid_at
			 FROM gate_fees WHERE container_number = $1 ORDER BY assessed_at DESC`,
			containerNumber,
		)
	}
	if err != nil {
		return nil, 0, fmt.Errorf("query gate fees: %w", err)
	}
	defer rows.Close()

	var fees []domain.GateFee
	var total float64
	for rows.Next() {
		var fee domain.GateFee
		var contID, termID *uuid.UUID
		var feeType, feeStatus string
		if err := rows.Scan(
			&fee.ID, &contID, &fee.ContainerNumber,
			&fee.OrderID, &termID, &feeType, &fee.Amount,
			&fee.Currency, &fee.BillableTo, &feeStatus,
			&fee.EModalFeeID, &fee.AssessedAt, &fee.PaidAt,
		); err != nil {
			return nil, 0, fmt.Errorf("scan row: %w", err)
		}
		if contID != nil {
			fee.ContainerID = *contID
		}
		if termID != nil {
			fee.TerminalID = *termID
		}
		fee.Type = domain.GateFeeType(feeType)
		fee.Status = domain.GateFeeStatus(feeStatus)
		fees = append(fees, fee)
		total += fee.Amount
	}
	return fees, total, rows.Err()
}

func nilIfEmpty(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
