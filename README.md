# 🚛 DrayMaster TMS

A modern, cloud-native Transportation Management System for Port Container Drayage built with cutting-edge technologies.

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENTS                                         │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                      │
│   │   Next.js    │  │   Flutter    │  │   External   │                      │
│   │   Web App    │  │  Mobile App  │  │     APIs     │                      │
│   └──────┬───────┘  └──────┬───────┘  └──────┬───────┘                      │
└──────────┼─────────────────┼─────────────────┼──────────────────────────────┘
           │                 │                 │
           └─────────────────┼─────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────────────────┐
│                     API Gateway (GraphQL + gRPC)                             │
│                 Authentication │ Rate Limiting │ Routing                     │
└────────────────────────────────────────┬────────────────────────────────────┘
                                         │ gRPC
         ┌───────────────┬───────────────┼───────────────┬───────────────┐
         │               │               │               │               │
         ▼               ▼               ▼               ▼               ▼
┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│   Order     │ │  Dispatch   │ │  Tracking   │ │   Billing   │ │   Driver    │
│   Service   │ │   Service   │ │   Service   │ │   Service   │ │   Service   │
│    (Go)     │ │    (Go)     │ │    (Go)     │ │    (Go)     │ │    (Go)     │
└──────┬──────┘ └──────┬──────┘ └──────┬──────┘ └──────┬──────┘ └──────┬──────┘
       │               │               │               │               │
       └───────────────┴───────────────┼───────────────┴───────────────┘
                                       │
┌──────────────────────────────────────▼──────────────────────────────────────┐
│                         Apache Kafka (Event Bus)                             │
│         orders.* │ dispatch.* │ tracking.* │ billing.* │ drivers.*          │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
       ┌───────────────┬───────────────┴───────────────┬───────────────┐
       │               │                               │               │
       ▼               ▼                               ▼               ▼
┌─────────────┐ ┌─────────────┐                ┌─────────────┐ ┌─────────────┐
│ PostgreSQL  │ │ TimescaleDB │                │    Redis    │ │     S3      │
│  (Orders,   │ │   (GPS,     │                │   (Cache,   │ │ (Documents) │
│  Dispatch)  │ │  Tracking)  │                │   Realtime) │ │             │
└─────────────┘ └─────────────┘                └─────────────┘ └─────────────┘
```

## 🛠️ Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Backend Services** | Go 1.21+ | High-performance microservices |
| **Inter-service Comm** | gRPC + Protocol Buffers | Fast, type-safe communication |
| **API Gateway** | GraphQL (gqlgen) | Flexible client API |
| **Event Streaming** | Apache Kafka | Async event-driven architecture |
| **Primary Database** | PostgreSQL 15 | Transactional data |
| **Time-Series DB** | TimescaleDB | GPS tracking data |
| **Cache** | Redis 7 | Real-time state, caching |
| **Search** | Elasticsearch | Full-text search |
| **Frontend** | Next.js 14 + TypeScript | Modern React with App Router |
| **Mobile** | Flutter | Cross-platform driver app |
| **Infrastructure** | Terraform | Infrastructure as Code |
| **Container Orchestration** | Kubernetes | Production deployment |
| **CI/CD** | GitHub Actions | Automated pipelines |
| **Observability** | OpenTelemetry + Grafana | Distributed tracing, metrics |

## 📁 Project Structure

```
draymaster-tms/
├── services/                    # Go microservices
│   ├── order-service/          # Shipments, containers, orders
│   ├── dispatch-service/       # Trips, assignments, street turns
│   ├── tracking-service/       # GPS, milestones, ETAs
│   ├── billing-service/        # Rates, invoices, settlements
│   ├── driver-service/         # Drivers, compliance, HOS
│   ├── equipment-service/      # Tractors, chassis
│   └── api-gateway/            # GraphQL gateway
├── shared/                     # Shared code
│   ├── proto/                  # Protocol Buffer definitions
│   ├── events/                 # Kafka event schemas
│   └── pkg/                    # Shared Go packages
├── web/                        # Next.js frontend
├── mobile/                     # Flutter driver app
├── infrastructure/             # IaC
│   ├── terraform/              # Cloud infrastructure
│   ├── k8s/                    # Kubernetes manifests
│   └── docker/                 # Docker configurations
└── docs/                       # Documentation
```

## 🚀 Quick Start

### Prerequisites
- Go 1.21+
- Node.js 20+
- Docker & Docker Compose
- Make

### Development Setup

```bash
# Clone the repository
git clone https://github.com/yourusername/draymaster-tms.git
cd draymaster-tms

# Start infrastructure (Postgres, Kafka, Redis)
make infra-up

# Generate protobuf code
make proto

# Run all services
make run-all

# Or run individual service
make run-order

# Start frontend
make run-web
```

### Using Docker Compose

```bash
# Build and start everything
docker-compose up -d

# View logs
docker-compose logs -f

# Stop all services
docker-compose down
```

## 📚 API Documentation

### GraphQL Playground
Once running, access GraphQL playground at: `http://localhost:8080/playground`

### Example Queries

```graphql
# Get shipment with containers
query GetShipment($id: ID!) {
  shipment(id: $id) {
    id
    referenceNumber
    type
    status
    vessel {
      name
      voyage
      eta
    }
    containers {
      containerNumber
      size
      type
      status
      customsStatus
    }
    lastFreeDay
    daysUntilLFD
  }
}

# Create a new trip
mutation CreateTrip($input: CreateTripInput!) {
  createTrip(input: $input) {
    id
    tripNumber
    type
    status
    stops {
      sequence
      location {
        name
        address
      }
      activityType
      appointmentTime
    }
    driver {
      name
      phone
    }
  }
}
```

## 🧪 Testing

```bash
# Run all tests
make test

# Run with coverage
make test-coverage

# Run integration tests
make test-integration

# Run E2E tests
make test-e2e
```

## 📦 Deployment

### Kubernetes

```bash
# Deploy to development
make deploy-dev

# Deploy to production
make deploy-prod

# Check status
kubectl get pods -n draymaster
```

### Terraform

```bash
cd infrastructure/terraform/environments/dev

# Initialize
terraform init

# Plan
terraform plan

# Apply
terraform apply
```

## 📊 Monitoring

- **Grafana Dashboards**: `http://localhost:3000`
- **Jaeger Tracing**: `http://localhost:16686`
- **Prometheus Metrics**: `http://localhost:9090`

## 🔐 Security

- OAuth 2.0 + JWT authentication
- Role-based access control (RBAC)
- TLS encryption for all communications
- Secrets management with HashiCorp Vault
- Network policies in Kubernetes

## 📄 License

Copyright © 2024 DrayMaster. All rights reserved.
