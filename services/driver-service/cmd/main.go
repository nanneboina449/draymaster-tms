package main

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq"
	"google.golang.org/grpc"
	"google.golang.org/grpc/health"
	"google.golang.org/grpc/health/grpc_health_v1"
	"google.golang.org/grpc/reflection"

	"github.com/draymaster/services/driver-service/internal/repository"
	"github.com/draymaster/services/driver-service/internal/service"
	"github.com/draymaster/shared/pkg/config"
	"github.com/draymaster/shared/pkg/kafka"
	"github.com/draymaster/shared/pkg/logger"
)

func main() {
	// Initialize logger
	log := logger.NewLogger("driver-service")
	defer log.Sync()

	log.Info("Starting driver-service...")

	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		log.Fatalw("Failed to load configuration", "error", err)
	}

	// Connect to PostgreSQL
	db, err := sqlx.Connect("postgres", cfg.DatabaseURL)
	if err != nil {
		log.Fatalw("Failed to connect to database", "error", err)
	}
	defer db.Close()

	// Configure connection pool
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(10)
	db.SetConnMaxLifetime(5 * time.Minute)

	log.Info("Connected to database")

	// Initialize Kafka producer
	eventProducer, err := kafka.NewProducer(cfg.KafkaBrokers)
	if err != nil {
		log.Fatalw("Failed to create Kafka producer", "error", err)
	}
	defer eventProducer.Close()

	log.Info("Connected to Kafka")

	// Initialize repositories
	driverRepo := repository.NewPostgresDriverRepository(db)
	hosLogRepo := repository.NewPostgresHOSLogRepository(db)
	violationRepo := repository.NewPostgresViolationRepository(db)
	alertRepo := repository.NewPostgresAlertRepository(db)
	documentRepo := repository.NewPostgresDocumentRepository(db)

	// Initialize service
	driverService := service.NewDriverService(
		driverRepo,
		hosLogRepo,
		violationRepo,
		alertRepo,
		documentRepo,
		eventProducer,
		log,
	)

	// Create gRPC server
	grpcServer := grpc.NewServer(
		grpc.UnaryInterceptor(loggingInterceptor(log)),
	)

	// Register gRPC services
	// pb.RegisterDriverServiceServer(grpcServer, grpcHandler.NewDriverHandler(driverService))

	// Register health check
	healthServer := health.NewServer()
	grpc_health_v1.RegisterHealthServer(grpcServer, healthServer)
	healthServer.SetServingStatus("driver-service", grpc_health_v1.HealthCheckResponse_SERVING)

	// Enable reflection for development
	reflection.Register(grpcServer)

	// Start gRPC server
	grpcListener, err := net.Listen("tcp", fmt.Sprintf(":%d", cfg.GRPCPort))
	if err != nil {
		log.Fatalw("Failed to listen on gRPC port", "error", err, "port", cfg.GRPCPort)
	}

	go func() {
		log.Infow("gRPC server listening", "port", cfg.GRPCPort)
		if err := grpcServer.Serve(grpcListener); err != nil {
			log.Fatalw("gRPC server failed", "error", err)
		}
	}()

	// Start HTTP health/metrics server
	httpServer := &http.Server{
		Addr:         fmt.Sprintf(":%d", cfg.HTTPPort),
		Handler:      httpHandler(driverService, log),
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
	}

	go func() {
		log.Infow("HTTP server listening", "port", cfg.HTTPPort)
		if err := httpServer.ListenAndServe(); err != http.ErrServerClosed {
			log.Fatalw("HTTP server failed", "error", err)
		}
	}()

	// Start background compliance checker
	go startComplianceChecker(driverService, log)

	// Wait for shutdown signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Info("Shutting down driver-service...")

	// Graceful shutdown
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	grpcServer.GracefulStop()
	if err := httpServer.Shutdown(ctx); err != nil {
		log.Errorw("HTTP server shutdown error", "error", err)
	}

	log.Info("Driver-service stopped")
}

func httpHandler(svc *service.DriverService, log *logger.Logger) http.Handler {
	mux := http.NewServeMux()

	// Health check endpoint
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"healthy"}`))
	})

	// Ready check endpoint
	mux.HandleFunc("/ready", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"ready"}`))
	})

	// Metrics endpoint
	mux.HandleFunc("/metrics", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	return mux
}

func loggingInterceptor(log *logger.Logger) grpc.UnaryServerInterceptor {
	return func(ctx context.Context, req interface{}, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (interface{}, error) {
		start := time.Now()

		resp, err := handler(ctx, req)

		duration := time.Since(start)
		log.Infow("gRPC request",
			"method", info.FullMethod,
			"duration_ms", duration.Milliseconds(),
			"error", err,
		)

		return resp, err
	}
}

// startComplianceChecker runs periodic compliance checks
func startComplianceChecker(svc *service.DriverService, log *logger.Logger) {
	ticker := time.NewTicker(1 * time.Hour)
	defer ticker.Stop()

	log.Info("Started compliance checker")

	for range ticker.C {
		log.Info("Running scheduled compliance check")
		// Would iterate through all active drivers and check compliance
		// This would create alerts for expiring documents
	}
}
