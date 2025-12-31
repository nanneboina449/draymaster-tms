module github.com/draymaster/services/order-service

go 1.21

require (
	github.com/draymaster/shared v0.0.0
	github.com/google/uuid v1.5.0
	github.com/grpc-ecosystem/go-grpc-middleware/v2 v2.0.1
	github.com/jackc/pgx/v5 v5.5.1
	go.uber.org/zap v1.26.0
	google.golang.org/grpc v1.60.1
	google.golang.org/protobuf v1.32.0
)

replace github.com/draymaster/shared => ../../shared/pkg
