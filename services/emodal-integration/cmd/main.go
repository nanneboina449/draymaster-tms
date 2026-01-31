package main

import (
	"context"
	"fmt"
	"net"
	"os"
	"os/signal"
	"syscall"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/health"
	"google.golang.org/grpc/health/grpc_health_v1"
	"google.golang.org/grpc/reflection"

	"github.com/draymaster/shared/pkg/config"
	"github.com/draymaster/shared/pkg/database"
	"github.com/draymaster/shared/pkg/kafka"
	"github.com/draymaster/shared/pkg/logger"
	pb "github.com/draymaster/shared/proto/emodal/v1"

	"github.com/draymaster/services/emodal-integration/internal/client"
	"github.com/draymaster/services/emodal-integration/internal/domain"
	grpcHandler "github.com/draymaster/services/emodal-integration/internal/grpc"
	"github.com/draymaster/services/emodal-integration/internal/repository"
	"github.com/draymaster/services/emodal-integration/internal/service"
)

var (
	Version   = "dev"
	BuildTime = "unknown"
)

func main() {
	cfg := config.Load()
	cfg.Service.Name = "emodal-integration"

	log, err := logger.New(cfg.Service.Name, cfg.Service.Environment, cfg.Service.LogLevel)
	if err != nil {
		fmt.Printf("Failed to initialize logger: %v\n", err)
		os.Exit(1)
	}
	defer log.Sync()

	log.Infow("Starting eModal integration service",
		"service", cfg.Service.Name,
		"version", Version,
		"buildTime", BuildTime,
		"environment", cfg.Service.Environment,
	)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Database
	db, err := database.New(ctx, cfg.Database)
	if err != nil {
		log.Fatalw("Failed to connect to database", "error", err)
	}
	defer db.Close()
	log.Info("Database connected")

	repo := repository.NewRepository(db.Pool)

	// Kafka producer — publishes internal events for other services
	kafkaProducer := kafka.NewProducer(cfg.Kafka.Brokers, log)
	defer kafkaProducer.Close()
	log.Info("Kafka producer initialized")

	// eModal EDS REST client
	eModalClient := client.NewEModalClient(client.EModalConfig{
		BaseURL: getEnv("EMODAL_BASE_URL", "https://apigateway.emodal.com"),
		APIKey:  getEnv("EMODAL_API_KEY", ""),
		Timeout: getDuration("EMODAL_TIMEOUT", 30*time.Second),
	}, log)
	log.Info("eModal EDS client initialized")

	// Core service — handles event processing and query proxying
	eModalService := service.NewEModalService(eModalClient, repo, kafkaProducer, log)

	// Container publisher — auto-publishes new containers to eModal when order-service fires container.added
	containerPublisher := service.NewContainerPublisher(eModalClient, log)
	containerConsumer := kafka.NewConsumer(cfg.Kafka.Brokers, "emodal-integration", kafka.Topics.ContainerAdded, log)
	defer containerConsumer.Close()

	go func() {
		if err := containerConsumer.Consume(ctx, containerPublisher.HandleEvent); err != nil {
			if ctx.Err() == nil {
				log.Fatalw("Container consumer failed", "error", err)
			}
		}
	}()
	log.Info("Container publisher consumer started")

	// Service Bus consumer — receives live container status events from eModal
	sbNamespace := getEnv("SERVICEBUS_NAMESPACE", "")
	sbSASToken := getEnv("SERVICEBUS_SAS_TOKEN", "")

	if sbNamespace != "" && sbSASToken != "" {
		sbConsumer := client.NewServiceBusConsumer(client.ServiceBusConfig{
			Namespace:        sbNamespace,
			SASToken:         sbSASToken,
			TopicName:        getEnv("SERVICEBUS_TOPIC", "containerupdates"),
			SubscriptionName: getEnv("SERVICEBUS_SUBSCRIPTION", "draymaster"),
		}, log)

		go func() {
			if err := sbConsumer.Start(ctx, func(event domain.ContainerStatusEvent) error {
				return eModalService.ProcessContainerEvent(ctx, event)
			}); err != nil {
				if ctx.Err() == nil {
					log.Fatalw("Service Bus consumer failed", "error", err)
				}
			}
		}()
		log.Info("Service Bus consumer started")
	} else {
		log.Warn("SERVICEBUS_NAMESPACE or SERVICEBUS_SAS_TOKEN not set — Service Bus consumer disabled")
	}

	// gRPC server
	grpcServer := grpc.NewServer(
		grpc.ChainUnaryInterceptor(
			grpcHandler.LoggingInterceptor(log),
			grpcHandler.RecoveryInterceptor(log),
		),
	)

	pb.RegisterEModalIntegrationServiceServer(grpcServer, grpcHandler.NewServer(eModalService, repo, log))

	healthServer := health.NewServer()
	grpc_health_v1.RegisterHealthServer(grpcServer, healthServer)
	healthServer.SetServingStatus(cfg.Service.Name, grpc_health_v1.HealthCheckResponse_SERVING)

	if cfg.Service.Environment != "production" {
		reflection.Register(grpcServer)
	}

	listener, err := net.Listen("tcp", fmt.Sprintf(":%d", cfg.Server.GRPCPort))
	if err != nil {
		log.Fatalw("Failed to create listener", "port", cfg.Server.GRPCPort, "error", err)
	}

	go func() {
		log.Infow("gRPC server starting", "port", cfg.Server.GRPCPort)
		if err := grpcServer.Serve(listener); err != nil {
			log.Fatalw("gRPC server failed", "error", err)
		}
	}()

	// Graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan

	log.Info("Shutting down...")
	healthServer.SetServingStatus(cfg.Service.Name, grpc_health_v1.HealthCheckResponse_NOT_SERVING)
	cancel()
	grpcServer.GracefulStop()
	log.Info("eModal integration service stopped")
}

func getEnv(key, defaultVal string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return defaultVal
}

func getDuration(key string, defaultVal time.Duration) time.Duration {
	if val := os.Getenv(key); val != "" {
		if d, err := time.ParseDuration(val); err == nil {
			return d
		}
	}
	return defaultVal
}
