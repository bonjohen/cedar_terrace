# Cedar Terrace - Local Development Guide

Complete guide for running the entire Cedar Terrace parking enforcement system on your local machine.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Infrastructure Setup](#infrastructure-setup)
- [Running Each Component](#running-each-component)
- [Configuration](#configuration)
- [Testing Workflows](#testing-workflows)
- [Troubleshooting](#troubleshooting)
- [Development Tips](#development-tips)

## Prerequisites

### Required Software

- **Node.js 18+** and **npm 9+**
  - Download: https://nodejs.org/
  - Verify: `node --version` and `npm --version`

- **Docker Desktop**
  - Download: https://www.docker.com/products/docker-desktop
  - Required for: PostgreSQL, MinIO (S3), MailHog (email testing)
  - Verify: `docker --version`

- **Git**
  - Download: https://git-scm.com/
  - Verify: `git --version`

### Optional Tools

- **PostgreSQL Client** (psql, pgAdmin, or DBeaver) for database inspection
- **Postman** or **REST Client** extension (VS Code) for API testing
- **React Developer Tools** (browser extension) for frontend debugging
- **Expo Go** app (iOS/Android) for testing mobile app on physical device

## Quick Start

### 1. Clone and Setup

```bash
# Clone repository
git clone <repository-url>
cd cedar_terrace

# Run automated setup (Windows)
.\setup.ps1

# OR manually (all platforms)
npm install
cd backend && npm run migrate && npm run seed
```

**The setup script will:**
- Install all npm dependencies
- Start Docker containers (PostgreSQL, MinIO, MailHog)
- Run database migrations
- Seed test data
- Create necessary S3 buckets

**Save the output** - you'll need the Site ID and Lot Image ID!

### 2. Start Backend API

```bash
cd backend
npm run dev
```

Server: http://localhost:3000
Health check: http://localhost:3000/health

### 3. Start Admin Frontend

```bash
cd frontend-admin
npm run dev
```

Admin UI: http://localhost:3001

### 4. Configure Admin UI

1. Open http://localhost:3001
2. Enter the **Site ID** and **Lot Image ID** from the seed output
3. Click "Save Configuration"
4. Navigate through the sidebar to explore features

## Infrastructure Setup

### Docker Services

All infrastructure runs in Docker containers defined in `local/docker-compose.yml`.

#### Start Infrastructure

```bash
cd local
docker-compose up -d
```

#### Stop Infrastructure

```bash
cd local
docker-compose down
```

#### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f postgres
docker-compose logs -f minio
docker-compose logs -f mailhog
```

### Service URLs

| Service | URL | Credentials | Purpose |
|---------|-----|-------------|---------|
| **Backend API** | http://localhost:3000 | - | REST API server |
| **Admin Frontend** | http://localhost:3001 | - | Admin web UI |
| **Ticket Portal** | http://localhost:3002 | - | Recipient ticket portal |
| **PostgreSQL** | localhost:5432 | `postgres` / `postgres` | Database |
| **MinIO Console** | http://localhost:9001 | `minio` / `minio123` | S3-compatible storage |
| **MailHog Web UI** | http://localhost:8025 | - | Email testing |

### MinIO (S3) Setup

MinIO provides S3-compatible object storage for evidence photos.

**Access Console**: http://localhost:9001
- Username: `minio`
- Password: `minio123`

**Create Buckets** (if not already created):
1. Login to MinIO console
2. Create bucket: `parking-evidence`
3. Set access policy to "public" (for local development only)

**Backend Configuration**:
```env
S3_ENDPOINT=http://localhost:9000
S3_BUCKET=parking-evidence
```

### MailHog (Email Testing)

MailHog captures all outgoing emails in local development.

**Access UI**: http://localhost:8025

**How it works**:
- Backend sends emails to SMTP port 1025
- MailHog captures them (no actual delivery)
- View emails in web interface
- Test activation links and notice notifications

## Running Each Component

### Backend API

```bash
cd backend

# Development mode (hot reload)
npm run dev

# Build TypeScript
npm run build

# Run tests
npm test

# Run integration tests (sequential)
npm test -- --runInBand

# Database migrations
npm run migrate

# Seed test data
npm run seed

# Reset database (migrate + seed)
npm run db:reset
```

**Environment Variables** (`backend/.env`):
```env
ENV=local
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/parking_dev
S3_ENDPOINT=http://localhost:9000
S3_BUCKET=parking-evidence
EMAIL_MODE=local
AUTH_MODE=stub
API_BASE_URL=http://localhost:3000
```

**API Endpoints**:
- Health: `GET /health`
- Parking Positions: `GET /api/v1/parking-positions/site/:siteId`
- Submit Observation: `POST /api/v1/observations/submit`
- Violations: `GET /api/v1/violations/:id`
- Notices: `POST /api/v1/notices/issue`
- Recipient Portal: `POST /api/v1/recipients/initiate-access`

### Admin Frontend

```bash
cd frontend-admin

# Development mode
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Lint
npm run lint
```

**Environment Variables** (`frontend-admin/.env`):
```env
VITE_API_BASE_URL=http://localhost:3000
```

**Key Features**:
- Dashboard with statistics
- Lot Editor (visual parking position management)
- Observation submission with photo upload
- Violations list with timeline events
- Notice issuance with printable output

**First-Time Setup**:
1. Enter Site ID and Lot Image ID (from seed data)
2. Configuration saved to localStorage
3. Navigate to Lot Editor to view parking positions
4. Submit test observations via Observations page

### Ticket Recipient Portal

```bash
cd frontend-recipient

# Development mode
npm run dev

# Build for production
npm run build
```

Server: http://localhost:3002

**Environment Variables** (`frontend-recipient/.env`):
```env
VITE_API_BASE_URL=http://localhost:3000
```

**Testing Flow**:
1. Issue a notice via Admin UI
2. Get QR token from notice details
3. Visit: http://localhost:3002/ticket/{qrToken}
4. Enter email to initiate access
5. Check MailHog for activation email
6. Click activation link
7. Complete profile (name, phone)
8. View ticket details

### Mobile App

```bash
cd mobile

# Start Expo dev server
npm start

# Run on Android
npm run android

# Run on iOS
npm run ios

# Run in web browser
npm run web
```

**Environment Variables** (`mobile/.env`):
```env
EXPO_PUBLIC_API_BASE_URL=http://localhost:3000
```

**Testing on Physical Device**:
1. Install Expo Go app from App Store / Play Store
2. Run `npm start`
3. Scan QR code with camera (iOS) or Expo Go app (Android)
4. App loads on your device

**Testing Capture Flow**:
1. Tap "Capture" tab
2. Enter license plate and state
3. Tap "Add Photo" to capture evidence
4. Select photo intent (e.g., "Primary Vehicle View")
5. Review and submit to queue
6. Tap "Queue" tab to see pending observation
7. Tap "Sync Now" to upload to backend
8. Check Admin UI for new observation

**Note**: Camera requires physical device. Web/simulator will show permission prompt but cannot capture photos.

### Worker Services

```bash
cd workers

# Run all workers
npm run dev
# OR
ts-node src/index.ts --all

# Run individual workers
npm run timeline   # Timeline evaluation
npm run email      # Email sending
npm run ingestion  # Observation processing

# Run specific combination
ts-node src/index.ts --timeline --email
```

**Environment Variables** (`workers/.env`):
```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/parking_dev
AWS_REGION=us-west-2
TIMELINE_QUEUE_URL=https://sqs.us-west-2.amazonaws.com/.../cedar-terrace-timeline
EMAIL_QUEUE_URL=https://sqs.us-west-2.amazonaws.com/.../cedar-terrace-email
INGESTION_QUEUE_URL=https://sqs.us-west-2.amazonaws.com/.../cedar-terrace-ingestion
SES_SENDER_EMAIL=noreply@cedarterrace.local
RECIPIENT_PORTAL_URL=http://localhost:3002
TIMELINE_POLL_INTERVAL_MS=300000
EMAIL_POLL_INTERVAL_MS=5000
INGESTION_POLL_INTERVAL_MS=10000
```

**Local Development Notes**:
- Workers require AWS SQS queues (not included in Docker setup)
- For local testing without SQS:
  - Timeline: Call `evaluateViolationTimeline(violationId)` directly
  - Email: Call `processEmailMessage(message)` directly
  - Ingestion: Call `processObservation(observationId)` directly
- Production deployment uses SQS + Lambda/ECS

## Configuration

### Backend Configuration

**Database Connection**:
- Connection string format: `postgresql://user:password@host:port/database`
- Default: `postgresql://postgres:postgres@localhost:5432/parking_dev`

**S3/MinIO**:
- Endpoint: `http://localhost:9000` (MinIO) or AWS S3 URL
- Bucket: `parking-evidence`
- Access Key/Secret: Configure in backend environment

**Email**:
- `EMAIL_MODE=local`: Uses MailHog (SMTP port 1025)
- `EMAIL_MODE=production`: Uses AWS SES

**Authentication**:
- `AUTH_MODE=stub`: No real authentication (local dev)
- `AUTH_MODE=cognito`: AWS Cognito (production)

### Frontend Configuration

Both admin and recipient portals use Vite environment variables:

**Development** (`.env`):
```env
VITE_API_BASE_URL=http://localhost:3000
```

**Production** (`.env.production`):
```env
VITE_API_BASE_URL=https://api.cedarterrace.com
```

### Mobile Configuration

**Development** (`.env`):
```env
# For Android emulator
EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:3000

# For iOS simulator
EXPO_PUBLIC_API_BASE_URL=http://localhost:3000

# For physical device (replace with your computer's IP)
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.100:3000
```

**Finding Your IP**:
```bash
# Windows
ipconfig

# Mac/Linux
ifconfig
```

Look for your local network IP (usually 192.168.x.x).

## Testing Workflows

### Complete End-to-End Flow

**1. Create Parking Positions** (Admin UI → Lot Editor)
- Add handicapped position at (150, 200)
- Add open positions
- Save positions

**2. Submit Observation** (Mobile App or Admin UI)
- Enter vehicle: `ABC123`, state: `CA`
- Add photo evidence
- Select parking position (optional)
- Submit

**3. Verify Observation** (Admin UI → Observations)
- Find submitted observation
- View evidence photos
- Check vehicle information

**4. Check Violation Derivation** (Admin UI → Violations)
- Violation automatically created if rules matched
- View violation category and status
- Check timeline events

**5. Issue Notice** (Admin UI → Notices)
- Select violation
- Click "Issue Notice"
- Generate printable notice
- Note QR token

**6. Recipient Access** (Ticket Portal)
- Visit `/ticket/{qrToken}`
- Enter email address
- Check MailHog for activation email
- Click activation link
- Complete profile
- View ticket details and evidence

**7. Timeline Progression** (Worker or Manual)
- Wait for timeline thresholds
- Run timeline worker: `cd workers && npm run timeline`
- Check violation status updates (ESCALATED, TOW_ELIGIBLE)

### API Testing Examples

**Submit Observation**:
```bash
POST http://localhost:3000/api/v1/observations/submit
Content-Type: application/json

{
  "idempotencyKey": "test-001",
  "siteId": "your-site-id-here",
  "observedAt": "2026-01-15T12:00:00Z",
  "licensePlate": "XYZ789",
  "issuingState": "CA",
  "parkingPositionId": "position-id-here",
  "evidence": [
    {
      "type": "TEXT_NOTE",
      "noteText": "Vehicle parked in handicapped space without placard"
    }
  ]
}
```

**Upload Photo Evidence**:
```bash
# 1. Get upload URL
GET http://localhost:3000/api/v1/storage/upload-url?key=evidence/photo-001.jpg

# 2. Upload to S3 (MinIO)
PUT {presignedUrl}
Content-Type: image/jpeg
Body: [binary photo data]

# 3. Submit observation with S3 key
POST http://localhost:3000/api/v1/observations/submit
{
  "evidence": [
    {
      "type": "PHOTO",
      "s3Key": "evidence/photo-001.jpg",
      "intent": "PRIMARY_VEHICLE"
    }
  ]
}
```

**Evaluate Violation Timeline**:
```bash
POST http://localhost:3000/api/v1/violations/{violationId}/evaluate-timeline
```

**Issue Notice**:
```bash
POST http://localhost:3000/api/v1/notices/issue
Content-Type: application/json

{
  "idempotencyKey": "notice-001",
  "violationId": "violation-id-here"
}
```

### Database Queries

Connect to PostgreSQL:
```bash
# Using psql
psql -h localhost -p 5432 -U postgres -d parking_dev

# Using Docker
docker exec -it parking-postgres psql -U postgres -d parking_dev
```

**Useful Queries**:
```sql
-- View all observations
SELECT * FROM observations ORDER BY created_at DESC LIMIT 10;

-- View all violations with status
SELECT id, category, status, detected_at, notice_issued_at
FROM violations
WHERE deleted_at IS NULL
ORDER BY detected_at DESC;

-- View violation timeline events
SELECT v.id, v.category, v.status, ve.event_type, ve.occurred_at, ve.event_data
FROM violations v
LEFT JOIN violation_events ve ON v.id = ve.violation_id
WHERE v.id = 'violation-id-here'
ORDER BY ve.occurred_at;

-- View notices
SELECT n.id, n.qr_token, v.category, v.status
FROM notices n
JOIN violations v ON n.violation_id = v.id
WHERE n.deleted_at IS NULL;

-- View parking positions
SELECT id, identifier, type, center_x, center_y, radius
FROM parking_positions
WHERE site_id = 'site-id-here'
AND deleted_at IS NULL;
```

## Troubleshooting

### Docker Issues

**Docker Desktop Not Running**:
```bash
# Check if Docker is running
docker ps

# Start Docker Desktop manually
# Windows: Start Menu → Docker Desktop
# Mac: Applications → Docker

# Wait 1-2 minutes for Docker to fully start
```

**Containers Not Starting**:
```bash
# Check container status
docker ps -a

# View logs
docker logs parking-postgres
docker logs parking-minio
docker logs parking-mailhog

# Restart specific container
docker restart parking-postgres

# Restart all containers
cd local
docker-compose restart

# Nuclear option: remove and recreate
docker-compose down -v
docker-compose up -d
```

**Port Conflicts**:
```bash
# Check what's using port 5432
netstat -ano | findstr :5432

# Kill process (Windows, use PID from above)
taskkill /PID <pid> /F

# Or change port in docker-compose.yml
ports:
  - "5433:5432"  # Use port 5433 instead
```

### Database Issues

**Connection Refused**:
```bash
# Verify PostgreSQL is running
docker ps | grep postgres

# Check logs
docker logs parking-postgres

# Test connection
psql -h localhost -p 5432 -U postgres -d parking_dev

# Verify DATABASE_URL in backend/.env
```

**Migration Failures**:
```bash
cd backend

# Drop and recreate database
npm run db:reset

# Or manually
psql -h localhost -U postgres -c "DROP DATABASE IF EXISTS parking_dev;"
psql -h localhost -U postgres -c "CREATE DATABASE parking_dev;"
npm run migrate
npm run seed
```

**Data Inconsistencies**:
```bash
# Reset to clean state
cd backend
npm run db:reset

# This will:
# 1. Drop all tables
# 2. Run migrations
# 3. Seed test data
```

### Backend Issues

**Port 3000 Already in Use**:
```bash
# Option 1: Kill process using port 3000
# Windows
netstat -ano | findstr :3000
taskkill /PID <pid> /F

# Mac/Linux
lsof -ti:3000 | xargs kill -9

# Option 2: Use different port
PORT=3001 npm run dev
```

**Module Not Found Errors**:
```bash
# Rebuild dependencies
cd backend
rm -rf node_modules package-lock.json
npm install

# Rebuild shared package
cd ../shared
npm run build

# Try backend again
cd ../backend
npm run dev
```

**TypeScript Errors**:
```bash
# Clean build
cd backend
rm -rf dist
npm run build

# If errors persist, check tsconfig.json
```

### Frontend Issues

**Admin UI Not Loading**:
```bash
# Check if backend is running
curl http://localhost:3000/health

# Check browser console for errors
# Clear browser cache and localStorage
# Restart dev server
cd frontend-admin
npm run dev
```

**CORS Errors**:
- Backend should allow `http://localhost:3001` origin
- Check backend CORS configuration
- Verify `VITE_API_BASE_URL` in frontend `.env`

**S3 Upload Failures**:
```bash
# Check MinIO is running
docker ps | grep minio

# Access MinIO console
# http://localhost:9001

# Verify bucket exists: parking-evidence
# Check bucket policy (should allow public access for local dev)
```

### Mobile App Issues

**Cannot Connect to Backend**:
```bash
# Android Emulator: Use 10.0.2.2 instead of localhost
EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:3000

# iOS Simulator: localhost should work
EXPO_PUBLIC_API_BASE_URL=http://localhost:3000

# Physical Device: Use your computer's local IP
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.100:3000
```

**Camera Not Working**:
- Camera only works on physical devices
- iOS simulator/Android emulator don't support camera
- Test on real iPhone/Android device using Expo Go

**SQLite Errors**:
```bash
# Clear app data
# iOS: Uninstall and reinstall app
# Android: Settings → Apps → Expo Go → Clear Data
```

### Worker Issues

**Workers Not Processing**:
- Workers require SQS queues (not provided in local Docker)
- For local testing, call worker functions directly:

```typescript
// timeline/handler.ts
import { evaluateViolationTimeline } from './src/timeline/handler';
await evaluateViolationTimeline('violation-id-here');

// email/handler.ts
import { processEmailMessage } from './src/email/handler';
await processEmailMessage({
  type: 'ACTIVATION',
  data: { email: 'test@example.com', activationToken: 'token', qrToken: 'qr' }
});
```

## Development Tips

### Hot Reload

- **Backend**: ts-node-dev watches for changes and restarts server
- **Frontend**: Vite HMR (Hot Module Replacement) updates instantly
- **Mobile**: Expo Fast Refresh updates on save

### Debugging

**Backend**:
```bash
# Enable debug logging
DEBUG=* npm run dev

# Use VS Code debugger
# Add breakpoints, press F5
```

**Frontend**:
- Use React DevTools browser extension
- Open browser console (F12)
- Check Network tab for API calls

**Database**:
```bash
# Watch queries in real-time
docker logs -f parking-postgres
```

### Code Quality

```bash
# Lint all packages
npm run lint --workspaces

# Format code
npx prettier --write .

# Type check
cd backend && npx tsc --noEmit
cd frontend-admin && npx tsc --noEmit
```

### Performance

**Backend**:
- Add indexes to frequently queried columns
- Use connection pooling (already configured)
- Enable query logging to identify slow queries

**Frontend**:
- Use React DevTools Profiler
- Check bundle size: `npm run build` shows sizes
- Lazy load routes and components

### Testing

**Unit Tests**:
```bash
cd backend
npm test

# Watch mode
npm test -- --watch

# Coverage
npm test -- --coverage
```

**Integration Tests**:
```bash
cd backend
npm test -- --runInBand

# Specific test file
npm test observation-flow.integration.test.ts
```

**Manual Testing Checklist**:
- [ ] Submit observation via Admin UI
- [ ] Submit observation via Mobile App
- [ ] View observation evidence (photos and notes)
- [ ] Verify violation derivation
- [ ] Issue notice
- [ ] Recipient activation flow
- [ ] Complete profile and view ticket
- [ ] Timeline progression (escalation)
- [ ] Print notice from Admin UI

## Next Steps

Once your local environment is working:

1. **Test All Features**: Go through the complete workflow
2. **Review Documentation**: Read `docs/` for architecture and design
3. **Deploy to AWS**: See `infra/` for CDK deployment
4. **Production Configuration**: Update environment variables for production
5. **Monitoring**: Set up CloudWatch logs and metrics

## Additional Resources

- [GETTING_STARTED.md](./GETTING_STARTED.md) - Quick start guide
- [README.md](./README.md) - Project overview
- [docs/architecture.md](./docs/architecture.md) - System architecture
- [docs/implementation-status.md](./docs/implementation-status.md) - Feature status
- [backend/README.md](./backend/README.md) - Backend API documentation
- [mobile/README.md](./mobile/README.md) - Mobile app documentation
- [workers/README.md](./workers/README.md) - Worker services documentation

## Support

If you encounter issues not covered here:

1. Check the logs (backend, Docker containers)
2. Review the error messages carefully
3. Search existing issues in the repository
4. Create a detailed bug report with:
   - Steps to reproduce
   - Error messages
   - Environment details (OS, Node version, Docker version)
   - Logs from relevant services

---

**Happy Developing!** 🚀

The Cedar Terrace system is now ready for local development and testing.
