# Cedar Terrace Parking Enforcement System

A comprehensive parking enforcement and stall management system with offline-capable mobile capture, administrative web interface, and secure ticket recipient portal.

## Overview

This system provides:

- **Admin Web Application**: Lot configuration, parking position management, violation tracking, and notice issuance
- **Mobile Capture App**: Offline-first evidence collection with automatic sync
- **Ticket Recipient Portal**: Secure, QR-accessed ticket viewing with authentication and profile gating

## Architecture

- **Cloud Provider**: AWS
- **Database**: PostgreSQL (Aurora Serverless v2)
- **Storage**: S3 for evidence images
- **Compute**: Lambda functions for API and workers
- **Queues**: SQS for async processing
- **Auth**: Cognito for admin and recipient authentication
- **IaC**: AWS CDK (TypeScript)

See [docs/architecture.md](docs/architecture.md) for detailed architecture documentation.

## Project Structure

```
cedar_terrace/
├── backend/              # API and worker Lambda functions
├── frontend-admin/       # Admin web application (React)
├── mobile/              # Mobile capture application
├── shared/              # Shared domain models and types
├── infra/               # Infrastructure as Code (AWS CDK)
├── local/               # Local development infrastructure
├── scripts/             # Build and deployment scripts
└── docs/                # Documentation
```

## Getting Started

### Prerequisites

- Node.js 18+ and npm 9+
- Docker Desktop
- Git
- PowerShell (for Windows setup script)

### Local Development Setup

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd cedar_terrace
   ```

2. **Run the setup script** (Windows):
   ```powershell
   .\setup.ps1
   ```

   This script will:
   - Verify required tools (Docker, Node, npm, git)
   - Start Docker Desktop if needed
   - Create local infrastructure (PostgreSQL, MinIO, MailHog)
   - Install npm dependencies for all packages
   - Create `.env.local` configuration

3. **Run database migrations**:
   ```bash
   cd backend
   npm run migrate
   ```

4. **Start development servers**:

   Terminal 1 - Backend API:
   ```bash
   cd backend
   npm run dev
   ```

   Terminal 2 - Admin Web App:
   ```bash
   cd frontend-admin
   npm run dev
   ```

### Local Services

After running `setup.ps1`, the following services are available:

- **PostgreSQL**: `localhost:5432`
  - Database: `parking_dev`
  - User: `postgres`
  - Password: `postgres`

- **MinIO** (S3-compatible storage): `http://localhost:9001`
  - User: `minio`
  - Password: `minio123`

- **MailHog** (Email testing): `http://localhost:8025`

- **Backend API**: `http://localhost:3000`

- **Admin Web App**: `http://localhost:3001`

## Core Domain Entities

The system manages these primary entities:

- **Site**: Parking lot location and configuration
- **LotImage**: Overhead image of the parking lot
- **ParkingPosition**: Individual parking stalls (circles with center and radius)
- **Vehicle**: Tracked vehicles with license plate information
- **Observation**: Immutable enforcement encounters with evidence
- **EvidenceItem**: Photos or text notes attached to observations
- **Violation**: Event-driven state machine for enforcement actions
- **ViolationEvent**: Timeline events tracking violation progression
- **Notice**: Printed notices with QR codes for ticket access
- **RecipientAccount**: Ticket recipient authentication and profile
- **RecipientAccessLog**: Audit trail of ticket access

## Core Invariants

The system enforces these critical rules:

1. **Observations are immutable** - Once submitted, observations and evidence cannot be edited
2. **Parking positions are authoritative** - All spatial enforcement is based on position records
3. **Violations are event-driven** - State changes are recorded as explicit events, never overwritten
4. **Soft deletes throughout** - Records are marked deleted but retained for audit
5. **QR codes are pointers only** - Possession doesn't grant access; authentication required
6. **Idempotency required** - Observation submission and notice issuance use client keys
7. **Rendered stickers never stored** - Notices store structured payloads, not images

See [CLAUDE.md](claude.md) for complete project requirements and invariants.

## Development Workflow

### Monorepo Structure

This is a npm workspaces monorepo. Install dependencies from the root:

```bash
npm install
```

### Building

Build all packages:
```bash
npm run build
```

Build specific package:
```bash
npm run build -w backend
npm run build -w frontend-admin
npm run build -w shared
```

### Testing

Run all tests:
```bash
npm test
```

Run tests for specific package:
```bash
npm test -w backend
npm test -w shared
```

### Linting

Lint all packages:
```bash
npm run lint
```

## Database Migrations

Create a new migration:
```bash
cd backend
npm run migrate:create <migration-name>
```

Apply migrations:
```bash
cd backend
npm run migrate
```

Migrations are stored in `backend/src/db/migrations/` and are applied in order.

## Deployment

### Infrastructure

Deploy infrastructure using CDK:

```bash
cd infra
npm install
npm run build
npm run deploy
```

This creates:
- VPC and networking
- Aurora Serverless v2 PostgreSQL cluster
- S3 buckets for evidence and web hosting
- SQS queues for async processing
- Cognito user pools for authentication
- CloudFront distributions (when configured)

### Application Deployment

(To be implemented - CI/CD pipeline)

## Documentation

- [CLAUDE.md](claude.md) - Project requirements and core invariants
- [docs/architecture.md](docs/architecture.md) - System architecture
- [docs/design.md](docs/design.md) - Detailed product design
- [docs/project_plan.dot](docs/project_plan.dot) - Project plan graph

## Testing Philosophy

- **Unit tests** validate domain logic, timeline transitions, idempotency, and evidence requirements
- **Integration tests** validate end-to-end flows including offline sync, notice issuance, and ticket access
- **Immutability and auditability** are treated as invariants enforced by tests

## Security Considerations

- All API endpoints require authentication
- Evidence stored in private S3 buckets with pre-signed URLs
- Sensitive data never embedded in URLs
- All ticket access is authenticated and logged
- Soft deletes preserve audit history
- Least-privilege IAM policies throughout

## License

(To be specified)

## Contributing

(To be specified)
