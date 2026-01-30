# 🤖 Copilot Instructions for DrayMaster TMS

## Project Overview
- **DrayMaster TMS** is a cloud-native Transportation Management System for port container drayage, built as a distributed microservices architecture in Go, with a Next.js frontend and event-driven backend.
- **Major components:**
  - `services/`: Go microservices (order, dispatch, tracking, billing, driver, equipment, api-gateway)
  - `shared/`: Shared Go code, Protocol Buffers, Kafka event schemas
  - `web/`: Next.js 14 frontend (TypeScript, App Router)
  - `infrastructure/`: Terraform, Kubernetes, Docker configs

## Architecture & Data Flow
- **API Gateway** (GraphQL + gRPC) routes client requests to backend services.
- **gRPC** is used for internal service-to-service communication; **Kafka** is used for async event streaming (see `shared/events/`).
- **PostgreSQL** (orders, dispatch), **TimescaleDB** (tracking), **Redis** (cache), and **S3** (documents) are primary data stores.
- **Protobuf definitions** are in `shared/proto/` and must be generated with `make proto`.

## Developer Workflows
- **Start infrastructure:** `make infra-up` (Postgres, Kafka, Redis)
- **Generate protobufs:** `make proto`
- **Run all services:** `make run-all` or individual (e.g., `make run-order`)
- **Start frontend:** `make run-web`
- **Testing:** `make test`, `make test-coverage`, `make test-integration`, `make test-e2e`
- **Docker Compose:** `docker-compose up -d` (see `docker-compose.yml`)
- **Kubernetes deploy:** `make deploy-dev` or `make deploy-prod`
- **Terraform:** `cd infrastructure/terraform/environments/dev && terraform [init|plan|apply]`

## Project Conventions & Patterns
- **Service boundaries:** Each service has its own domain, repository, service, handler, and gRPC layers under `internal/`.
- **Shared code:** Use `shared/pkg/` for common Go utilities, `shared/proto/` for Protobuf, and `shared/events/` for Kafka schemas.
- **GraphQL schema:** Defined in `services/api-gateway/graph/schema.graphql`.
- **Environment config:** Managed via `.env` files and `shared/config/`.
- **Observability:** OpenTelemetry, Grafana, Jaeger, Prometheus (see monitoring URLs in README).
- **Security:** OAuth2 + JWT, RBAC, TLS, Vault, K8s network policies.

## Integration Points
- **gRPC:** All inter-service calls use Protobuf/gRPC (see `shared/proto/`).
- **Kafka:** Event-driven flows use topics like `orders.*`, `dispatch.*` (see `shared/events/`).
- **Frontend:** Next.js app in `web/` communicates via GraphQL to API Gateway.

## Examples
- **Add a new service:** Copy structure from an existing service in `services/`, update Protobufs, register with API Gateway and Kafka.
- **Add a new event:** Define schema in `shared/events/`, update producer/consumer logic in relevant services.
- **Update GraphQL API:** Edit `services/api-gateway/graph/schema.graphql`, regenerate code, and update resolvers.

## Key Files & Directories
- `services/` — Go microservices
- `shared/proto/` — Protobuf definitions
- `shared/events/` — Kafka event schemas
- `web/` — Next.js frontend
- `infrastructure/` — Terraform, K8s, Docker
- `Makefile` — Developer automation
- `README.md` — Architecture, workflows, and monitoring

---
For more, see the [README.md](../README.md) and service-specific docs. When in doubt, follow the structure and patterns of existing services.
