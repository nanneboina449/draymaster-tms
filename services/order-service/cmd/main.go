package main

import (
	"context"
	"fmt"
	"net"
	"os"
	"os/signal"
	"syscall"

	"google.golang.org/grpc"
	"google.golang.org/grpc/health"
	"google.golang.org/grpc/health/grpc_health_v1"
	"google.golang.org/grpc/reflection"

	"github.com/draymaster/shared/pkg/config"
	"github.com/draymaster/shared/pkg/database"
	"github.com/draymaster/shared/pkg/kafka"
	"github.com/draymaster/shared/pkg/logger"

	"github.com/draymaster/services/order-service/internal/repository"
	"github.com/draymaster/services/order-service/internal/service"
	grpcHandler "github.com/draymaster/services/order-service/internal/grpc"
)

var (
	Version   = "dev"
	BuildTime = "unknown"
)

func main() {
	// Load configuration
	cfg := config.Load()
	cfg.Service.Name = "order-service"

	// Initialize logger
	log, err := logger.New(cfg.Service.Name, cfg.Service.Environment, cfg.Service.LogLevel)
	if err != nil {
		fmt.Printf("Failed to initialize logger: %v\n", err)
		os.Exit(1)
	}
	defer log.Sync()

	log.Infow("Starting service",
		"service", cfg.Service.Name,
		"version", Version,
		"build_time", BuildTime,
		"environment", cfg.Service.Environment,
	)

	// Create context with cancellation
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Initialize database
	db, err := database.New(ctx, cfg.Database)
	if err != nil {
		log.Fatal("Failed to connect to database", "error", err)
	}
	defer db.Close()
	log.Info("Connected to database")

	// Initialize Kafka producer
	producer := kafka.NewProducer(cfg.Kafka.Brokers, log)
	defer producer.Close()
	log.Info("Kafka producer initialized")

	// Initialize repositories
	shipmentRepo := repository.NewPostgresShipmentRepository(db.Pool)
	containerRepo := repository.NewPostgresContainerRepository(db.Pool)
	orderRepo := repository.NewPostgresOrderRepository(db.Pool)
	locationRepo := repository.NewPostgresLocationRepository(db.Pool)

	// Initialize service
	orderService := service.NewOrderService(
		shipmentRepo,
		containerRepo,
		orderRepo,
		locationRepo,
		producer,
		log,
	)

	// Initialize gRPC server
	grpcServer := grpc.NewServer(
		grpc.ChainUnaryInterceptor(
			grpcHandler.LoggingInterceptor(log),
			grpcHandler.RecoveryInterceptor(log),
		),
	)

	// Register gRPC handlers
	grpcHandler.RegisterOrderServiceServer(grpcServer, orderService)

	// Register health check
	healthServer := health.NewServer()
	grpc_health_v1.RegisterHealthServer(grpcServer, healthServer)
	healthServer.SetServingStatus(cfg.Service.Name, grpc_health_v1.HealthCheckResponse_SERVING)

	// Enable reflection for development
	if cfg.Service.Environment != "production" {
		reflection.Register(grpcServer)
	}

	// Start gRPC server
	listener, err := net.Listen("tcp", fmt.Sprintf(":%d", cfg.Server.GRPCPort))
	if err != nil {
		log.Fatal("Failed to create listener", "port", cfg.Server.GRPCPort, "error", err)
	}

	go func() {
		log.Infow("gRPC server starting", "port", cfg.Server.GRPCPort)
		if err := grpcServer.Serve(listener); err != nil {
			log.Fatal("gRPC server failed", "error", err)
		}
	}()

	// Wait for shutdown signal
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan

	log.Info("Shutting down...")

	// Graceful shutdown
	healthServer.SetServingStatus(cfg.Service.Name, grpc_health_v1.HealthCheckResponse_NOT_SERVING)
	grpcServer.GracefulStop()

	log.Info("Service stopped")
}
