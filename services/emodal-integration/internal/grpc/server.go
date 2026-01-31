package grpc

import (
	"context"
	"time"

	"github.com/google/uuid"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/timestamppb"

	pb "github.com/draymaster/shared/proto/emodal/v1"

	"github.com/draymaster/services/emodal-integration/internal/domain"
	"github.com/draymaster/services/emodal-integration/internal/repository"
	"github.com/draymaster/services/emodal-integration/internal/service"
	"github.com/draymaster/shared/pkg/logger"
)

// Server implements the EModalIntegrationService gRPC API.
type Server struct {
	pb.UnimplementedEModalIntegrationServiceServer
	svc  *service.EModalService
	repo *repository.Repository
	log  *logger.Logger
}

// NewServer creates a new gRPC Server.
func NewServer(svc *service.EModalService, repo *repository.Repository, log *logger.Logger) *Server {
	return &Server{svc: svc, repo: repo, log: log}
}

func (s *Server) GetAppointmentAvailability(ctx context.Context, req *pb.AvailabilityRequest) (*pb.AvailabilityResponse, error) {
	if req.GetTerminalId() == "" {
		return nil, status.Error(codes.InvalidArgument, "terminal_id is required")
	}

	date := time.Now()
	if req.GetDate() != nil {
		date = req.GetDate().AsTime()
	}

	slots, err := s.svc.GetAppointmentAvailability(ctx, req.GetTerminalId(), date, domain.MoveType(req.GetMoveType()))
	if err != nil {
		return nil, status.Errorf(codes.Internal, "get availability: %v", err)
	}

	pbSlots := make([]*pb.AppointmentSlot, len(slots))
	for i, slot := range slots {
		pbSlots[i] = &pb.AppointmentSlot{
			SlotTime:  timestamppb.New(slot.Time),
			Capacity:  int32(slot.Capacity),
			Available: int32(slot.Available),
			MoveType:  string(slot.MoveType),
		}
	}
	return &pb.AvailabilityResponse{Slots: pbSlots}, nil
}

func (s *Server) GetDwellStats(ctx context.Context, req *pb.DwellStatsRequest) (*pb.DwellStatsResponse, error) {
	if req.GetTerminalId() == "" {
		return nil, status.Error(codes.InvalidArgument, "terminal_id is required")
	}
	if req.GetStartDate() == nil || req.GetEndDate() == nil {
		return nil, status.Error(codes.InvalidArgument, "start_date and end_date are required")
	}

	stats, avgHours, err := s.svc.GetDwellStats(ctx,
		req.GetTerminalId(),
		req.GetStartDate().AsTime(),
		req.GetEndDate().AsTime(),
		req.GetContainerNumbers(),
	)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "get dwell stats: %v", err)
	}

	pbStats := make([]*pb.DwellStat, len(stats))
	for i, stat := range stats {
		ds := &pb.DwellStat{
			TerminalCode:    stat.TerminalCode,
			ContainerNumber: stat.ContainerNumber,
			DwellHours:      stat.DwellHours,
		}
		if stat.DischargeDate != nil {
			ds.DischargeDate = timestamppb.New(*stat.DischargeDate)
		}
		if stat.GateOutDate != nil {
			ds.GateOutDate = timestamppb.New(*stat.GateOutDate)
		}
		pbStats[i] = ds
	}
	return &pb.DwellStatsResponse{Stats: pbStats, AverageDwellHours: avgHours}, nil
}

func (s *Server) PublishContainers(ctx context.Context, req *pb.PublishContainersRequest) (*pb.PublishContainersResponse, error) {
	if len(req.GetContainers()) == 0 {
		return nil, status.Error(codes.InvalidArgument, "at least one container is required")
	}

	containers := make([]domain.PublishedContainer, len(req.GetContainers()))
	for i, c := range req.GetContainers() {
		containers[i] = domain.PublishedContainer{
			ContainerNumber: c.GetContainerNumber(),
			TerminalCode:    c.GetTerminalCode(),
			PortCode:        c.GetPortCode(),
			PublishedAt:     time.Now(),
		}
	}

	published, err := s.svc.PublishContainers(ctx, containers)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "publish containers: %v", err)
	}

	return &pb.PublishContainersResponse{
		Success:             true,
		Message:             "containers published successfully",
		PublishedContainers: published,
	}, nil
}

func (s *Server) GetGateFees(ctx context.Context, req *pb.GateFeesRequest) (*pb.GateFeesResponse, error) {
	if req.GetContainerId() == "" && req.GetContainerNumber() == "" {
		return nil, status.Error(codes.InvalidArgument, "container_id or container_number is required")
	}

	var containerID *uuid.UUID
	if req.GetContainerId() != "" {
		id, err := uuid.Parse(req.GetContainerId())
		if err != nil {
			return nil, status.Error(codes.InvalidArgument, "container_id is not a valid UUID")
		}
		containerID = &id
	}

	fees, total, err := s.repo.GetGateFees(ctx, containerID, req.GetContainerNumber())
	if err != nil {
		return nil, status.Errorf(codes.Internal, "get gate fees: %v", err)
	}

	pbFees := make([]*pb.GateFee, len(fees))
	for i, fee := range fees {
		gf := &pb.GateFee{
			Id:              fee.ID.String(),
			ContainerNumber: fee.ContainerNumber,
			Type:            string(fee.Type),
			Amount:          fee.Amount,
			Currency:        fee.Currency,
			BillableTo:      fee.BillableTo,
			Status:          string(fee.Status),
			EmodalFeeId:     fee.EModalFeeID,
		}
		if fee.ContainerID != uuid.Nil {
			gf.ContainerId = fee.ContainerID.String()
		}
		if fee.OrderID != nil {
			gf.OrderId = fee.OrderID.String()
		}
		if fee.TerminalID != uuid.Nil {
			gf.TerminalId = fee.TerminalID.String()
		}
		if !fee.AssessedAt.IsZero() {
			gf.AssessedAt = timestamppb.New(fee.AssessedAt)
		}
		if fee.PaidAt != nil {
			gf.PaidAt = timestamppb.New(*fee.PaidAt)
		}
		pbFees[i] = gf
	}

	return &pb.GateFeesResponse{Fees: pbFees, TotalAmount: total}, nil
}

func (s *Server) GetContainerStatus(ctx context.Context, req *pb.ContainerStatusRequest) (*pb.ContainerStatusResponse, error) {
	if len(req.GetContainerNumbers()) == 0 {
		return nil, status.Error(codes.InvalidArgument, "at least one container_number is required")
	}

	containers, err := s.repo.GetContainerStatuses(ctx, req.GetContainerNumbers())
	if err != nil {
		return nil, status.Errorf(codes.Internal, "get container statuses: %v", err)
	}

	pbStatuses := make([]*pb.ContainerStatusInfo, len(containers))
	for i, c := range containers {
		info := &pb.ContainerStatusInfo{
			ContainerNumber: c.ContainerNumber,
			Status:          string(c.CurrentStatus),
			TerminalCode:    c.TerminalCode,
		}
		if c.LastStatusAt != nil {
			info.LastUpdated = timestamppb.New(*c.LastStatusAt)
		}
		pbStatuses[i] = info
	}

	return &pb.ContainerStatusResponse{Statuses: pbStatuses}, nil
}
