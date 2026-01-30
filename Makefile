.PHONY: all build test clean proto run-% docker-% deploy-%

# Go parameters
GOCMD=go
GOBUILD=$(GOCMD) build
GOTEST=$(GOCMD) test
GOMOD=$(GOCMD) mod
GOVET=$(GOCMD) vet

# Services
SERVICES=order-service dispatch-service tracking-service billing-service driver-service equipment-service emodal-integration api-gateway

# Docker
DOCKER_COMPOSE=docker-compose
DOCKER=docker

# Version
VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
BUILD_TIME=$(shell date -u '+%Y-%m-%d_%H:%M:%S')
LDFLAGS=-ldflags "-X main.Version=$(VERSION) -X main.BuildTime=$(BUILD_TIME)"

###################
# Development
###################

all: proto build

## Build all services
build: $(addprefix build-,$(SERVICES))

build-%:
	@echo "Building $*..."
	@cd services/$* && $(GOBUILD) $(LDFLAGS) -o bin/$* ./cmd/...

## Run individual service
run-%:
	@echo "Running $*..."
	@cd services/$* && $(GOCMD) run ./cmd/main.go

## Run all services (development)
run-all:
	@$(DOCKER_COMPOSE) -f docker-compose.dev.yml up -d postgres redis kafka
	@sleep 5
	@for svc in $(SERVICES); do \
		echo "Starting $$svc..."; \
		cd services/$$svc && $(GOCMD) run ./cmd/main.go & \
	done
	@wait

###################
# Protobuf
###################

## Generate protobuf code
proto:
	@echo "Generating protobuf code..."
	@find shared/proto -name "*.proto" -exec protoc \
		--go_out=. --go_opt=paths=source_relative \
		--go-grpc_out=. --go-grpc_opt=paths=source_relative \
		{} \;
	@echo "Protobuf generation complete"

proto-install:
	@go install google.golang.org/protobuf/cmd/protoc-gen-go@latest
	@go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest

###################
# Testing
###################

## Run all tests
test:
	@for svc in $(SERVICES); do \
		echo "Testing $$svc..."; \
		cd services/$$svc && $(GOTEST) -v ./... || exit 1; \
	done

## Run tests with coverage
test-coverage:
	@for svc in $(SERVICES); do \
		echo "Testing $$svc with coverage..."; \
		cd services/$$svc && $(GOTEST) -coverprofile=coverage.out ./...; \
		$(GOCMD) tool cover -html=coverage.out -o coverage.html; \
	done

## Run integration tests
test-integration:
	@$(DOCKER_COMPOSE) -f docker-compose.test.yml up -d
	@sleep 10
	@$(GOTEST) -tags=integration ./...
	@$(DOCKER_COMPOSE) -f docker-compose.test.yml down

## Run linter
lint:
	@golangci-lint run ./...

## Run go vet
vet:
	@$(GOVET) ./...

###################
# Dependencies
###################

## Download dependencies
deps:
	@for svc in $(SERVICES); do \
		cd services/$$svc && $(GOMOD) download; \
	done
	@cd shared/pkg && $(GOMOD) download

## Tidy dependencies
tidy:
	@for svc in $(SERVICES); do \
		cd services/$$svc && $(GOMOD) tidy; \
	done

###################
# Docker
###################

## Start infrastructure
infra-up:
	@$(DOCKER_COMPOSE) -f infrastructure/docker/docker-compose.infra.yml up -d

## Stop infrastructure
infra-down:
	@$(DOCKER_COMPOSE) -f infrastructure/docker/docker-compose.infra.yml down

## Build Docker images
docker-build: $(addprefix docker-build-,$(SERVICES))

docker-build-%:
	@echo "Building Docker image for $*..."
	@$(DOCKER) build -t draymaster/$*:$(VERSION) -f services/$*/Dockerfile services/$*

## Push Docker images
docker-push: $(addprefix docker-push-,$(SERVICES))

docker-push-%:
	@echo "Pushing Docker image for $*..."
	@$(DOCKER) push draymaster/$*:$(VERSION)

## Run with Docker Compose
docker-up:
	@$(DOCKER_COMPOSE) up -d

docker-down:
	@$(DOCKER_COMPOSE) down

docker-logs:
	@$(DOCKER_COMPOSE) logs -f

###################
# Database
###################

## Run database migrations
migrate-up:
	@for svc in order dispatch billing driver equipment; do \
		echo "Running migrations for $$svc-service..."; \
		migrate -path services/$$svc-service/migrations -database "$(DATABASE_URL)" up; \
	done

migrate-down:
	@for svc in order dispatch billing driver equipment; do \
		echo "Rolling back migrations for $$svc-service..."; \
		migrate -path services/$$svc-service/migrations -database "$(DATABASE_URL)" down 1; \
	done

migrate-create:
	@read -p "Service name: " svc; \
	read -p "Migration name: " name; \
	migrate create -ext sql -dir services/$$svc-service/migrations -seq $$name

###################
# Kubernetes
###################

## Deploy to development
deploy-dev:
	@kubectl apply -k infrastructure/k8s/overlays/dev

## Deploy to staging
deploy-staging:
	@kubectl apply -k infrastructure/k8s/overlays/staging

## Deploy to production
deploy-prod:
	@kubectl apply -k infrastructure/k8s/overlays/prod

## Check deployment status
k8s-status:
	@kubectl get pods -n draymaster
	@kubectl get services -n draymaster

###################
# Frontend
###################

## Install frontend dependencies
web-install:
	@cd web && npm install

## Run frontend development server
web-dev:
	@cd web && npm run dev

## Build frontend
web-build:
	@cd web && npm run build

###################
# Code Generation
###################

## Generate GraphQL code
gql-gen:
	@cd services/api-gateway && go run github.com/99designs/gqlgen generate

## Generate mocks
mocks:
	@mockgen -source=services/order-service/internal/repository/repository.go -destination=services/order-service/internal/repository/mocks/mock_repository.go

###################
# Utilities
###################

## Clean build artifacts
clean:
	@for svc in $(SERVICES); do \
		rm -rf services/$$svc/bin; \
	done
	@rm -rf coverage.out coverage.html

## Format code
fmt:
	@gofmt -s -w .

## Install development tools
tools:
	@go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest
	@go install github.com/golang-migrate/migrate/v4/cmd/migrate@latest
	@go install github.com/99designs/gqlgen@latest
	@go install github.com/golang/mock/mockgen@latest
	@go install google.golang.org/protobuf/cmd/protoc-gen-go@latest
	@go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest

## Show help
help:
	@echo "DrayMaster TMS - Available commands:"
	@echo ""
	@echo "Development:"
	@echo "  make build          - Build all services"
	@echo "  make run-<service>  - Run a specific service"
	@echo "  make run-all        - Run all services"
	@echo ""
	@echo "Testing:"
	@echo "  make test           - Run all tests"
	@echo "  make test-coverage  - Run tests with coverage"
	@echo "  make lint           - Run linter"
	@echo ""
	@echo "Docker:"
	@echo "  make infra-up       - Start infrastructure"
	@echo "  make docker-build   - Build all Docker images"
	@echo "  make docker-up      - Run with Docker Compose"
	@echo ""
	@echo "Database:"
	@echo "  make migrate-up     - Run migrations"
	@echo "  make migrate-down   - Rollback migrations"
	@echo ""
	@echo "Kubernetes:"
	@echo "  make deploy-dev     - Deploy to development"
	@echo "  make deploy-prod    - Deploy to production"
