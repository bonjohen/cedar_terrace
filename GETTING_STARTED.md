# Getting Started with Cedar Terrace

Quick start guide for local development.

## Prerequisites

- Node.js 18+ and npm 9+
- Docker Desktop
- Git
- PowerShell (Windows) or Bash (Linux/Mac)

## Initial Setup

### 1. Run the Setup Script

**Windows:**
```powershell
.\setup.ps1
```

This will:
- Verify required tools
- Start Docker Desktop if needed
- Create local infrastructure (MinIO, MailHog)
- Install npm dependencies for all packages
- Create `.env.local` configuration
- Create `data/` directory for SQLite database

### 2. Run Database Migrations

```bash
cd backend
npm run migrate
```

This creates the SQLite database file (`data/cedar_terrace.db`) with all tables and indexes.

### 3. Seed Test Data

```bash
npm run seed
```

This creates:
- Test site "Cedar Terrace Test Site"
- 12 parking positions (see `docs/test-parking-lot.svg`)
- 3 test vehicles

**Save the output!** It will show:
- Site ID
- Lot Image ID

You'll need these for API testing.

## Start Development

### Backend API

```bash
cd backend
npm run dev
```

Server runs at: `http://localhost:3000`

Health check: `http://localhost:3000/health`

### Admin Frontend

```bash
cd frontend-admin
npm run dev
```

App runs at: `http://localhost:3001`

## Local Services

After running `setup.ps1`:

| Service | URL | Credentials |
|---------|-----|-------------|
| Backend API | http://localhost:3000 | - |
| Admin UI | http://localhost:3001 | - |
| SQLite Database | `backend/data/cedar_terrace.db` | (file-based) |
| MinIO Console | http://localhost:9001 | minio / minio123 |
| MailHog | http://localhost:8025 | - |

## Testing the API

### Example: Submit an Observation

```bash
POST http://localhost:3000/api/v1/observations/submit
Content-Type: application/json

{
  "idempotencyKey": "test-obs-001",
  "siteId": "<SITE_ID_FROM_SEED>",
  "observedAt": "2026-01-14T12:00:00Z",
  "licensePlate": "ABC123",
  "issuingState": "CA",
  "evidence": [
    {
      "type": "TEXT_NOTE",
      "noteText": "Test observation in parking space H1"
    }
  ]
}
```

### Example: Get Parking Positions

```bash
GET http://localhost:3000/api/v1/parking-positions/site/<SITE_ID>
```

### Example: Find Position at Point

```bash
POST http://localhost:3000/api/v1/parking-positions/find-at-point
Content-Type: application/json

{
  "lotImageId": "<LOT_IMAGE_ID_FROM_SEED>",
  "x": 150,
  "y": 200
}
```

This should return position H1 (handicapped space).

## Running Tests

```bash
cd backend
npm test
```

All 16 unit tests should pass.

## Common Commands

### Backend
```bash
cd backend

npm run dev           # Start dev server with hot reload
npm run build         # Build TypeScript
npm run test          # Run unit tests
npm run migrate       # Run database migrations
npm run seed          # Seed test data
npm run db:reset      # Migrate and seed (clean start)
```

### Shared Package
```bash
cd shared

npm run build         # Build type definitions
```

### Reset Everything
```bash
# From backend directory
npm run db:reset      # Recreate database and seed
```

## Project Structure

```
cedar_terrace/
├── backend/              # Express API + Domain Services
│   ├── src/
│   │   ├── api/         # REST endpoints
│   │   ├── domain/      # Business logic
│   │   ├── services/    # External services (S3, etc.)
│   │   └── db/          # Database migrations & seed
│   └── scripts/         # Build and utility scripts
│
├── frontend-admin/       # React admin UI (Vite)
├── mobile/              # Mobile capture app
├── shared/              # Shared types and models
├── infra/               # AWS CDK infrastructure
├── docs/                # Documentation
└── local/               # Docker dev environment
```

## Test Parking Lot

See `docs/test-parking-lot.svg` for a visual diagram.

**12 Spaces:**
- H1, H2: Handicapped (blue)
- 3, 4, 7, 8, 12: Open (green)
- P5, P6, P10, P11: Purchased (yellow)
- R9: Reserved (orange)

## Troubleshooting

### Docker Not Starting
```powershell
# Manually start Docker Desktop
& "C:\Program Files\Docker\Docker\Docker Desktop.exe"

# Wait a minute, then retry setup
.\setup.ps1
```

### Database File Issues
```bash
# Check if database file exists
ls backend/data/cedar_terrace.db

# If missing or corrupted, recreate it
cd backend
npm run migrate

# Reset database (clean slate)
rm data/cedar_terrace.db data/cedar_terrace.db-*
npm run db:reset
```

### Port Already in Use
```bash
# Check what's using port 3000
netstat -ano | findstr :3000

# Or use a different port
PORT=3001 npm run dev
```

### NPM Dependencies Out of Sync
```bash
# From project root
npm install

# Rebuild shared package
cd shared && npm run build
```

## Next Steps

1. ✅ Backend API is complete and running
2. 📋 Build admin frontend UI
3. 📋 Build mobile capture app
4. 📋 Build ticket recipient portal
5. 📋 Deploy to AWS

See `docs/implementation-status.md` for detailed progress.

## Additional Resources

- [Architecture](docs/architecture.md)
- [Design](docs/design.md)
- [Project Plan](docs/project_plan.dot)
- [Test Parking Lot](docs/test-parking-lot.md)
- [Implementation Status](docs/implementation-status.md)

## Questions?

Check the README.md or review the documentation in the `docs/` directory.
