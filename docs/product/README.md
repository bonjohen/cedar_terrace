# Cedar Terrace - Product Documentation

Documentation for setting up, operating, and using the Cedar Terrace parking enforcement system.

## 🚀 Getting Started

### Setup & Installation

- **[Security Checklist](./security-checklist.md)** - Complete security configuration for local and production environments
- **[Test Parking Lot](./test-parking-lot.md)** - Reference parking lot layout for testing

### Quick Links

- **Root README**: `../../README.md` - Project overview
- **Getting Started**: `../../GETTING_STARTED.md` - Quick start for developers
- **Local Development**: `../../LOCAL_DEVELOPMENT.md` - Complete local environment guide

## 📖 User Guides

### Admin Users

#### Dashboard
- View system statistics (positions, observations, violations)
- Quick actions for common tasks
- Configure site and lot image settings

#### Lot Editor
- Visual parking position management
- Create, edit, and delete positions
- Color-coded position types:
  - **Blue**: Handicapped
  - **Green**: Open parking
  - **Yellow**: Purchased/assigned
  - **Orange**: Reserved

#### Observation Management
- Submit new observations with evidence
- Upload photos with intent tagging
- Add text notes for context
- View all observations and evidence

#### Violation Management
- View active and resolved violations
- Check timeline events and state transitions
- Issue notices for violations
- Monitor escalation status

#### Notice Issuance
- Select violations for notice generation
- Print formatted notices with QR codes
- Track notice issuance and printing
- View recipient access logs

### Field Enforcement (Mobile App)

#### Capture Workflow
1. **Vehicle Information**: Enter license plate, state, registration
2. **Evidence Collection**:
   - Capture photos with camera
   - Select photo intent (primary vehicle, registration, placard, etc.)
   - Add text notes for additional context
3. **Review & Submit**: Verify all information and submit to queue

#### Sync Queue
- View pending observations
- Monitor upload progress
- Retry failed submissions
- See sync statistics

#### Offline Operation
- Capture observations without network
- Photos stored locally
- Automatic sync when online
- Idempotent submission prevents duplicates

### Ticket Recipients (Portal)

#### Access Ticket
1. Scan QR code on notice or visit link
2. Enter email address
3. Check email for activation link (24-hour expiry)
4. Complete profile (name, phone)
5. View ticket details

#### Ticket Details
- Violation category and status
- Vehicle information
- Detection timestamp
- Evidence photos (if applicable)
- Deadlines:
  - Payment deadline
  - Appeal deadline
  - Tow eligibility date
- Resolution instructions

## 🔧 Administration

### Local Environment Setup

**Prerequisites**:
- Node.js 18+
- Docker Desktop
- Git

**Quick Start**:
```bash
# Run setup script
.\setup.ps1

# Start backend
cd backend && npm run dev

# Start admin UI
cd frontend-admin && npm run dev

# Start ticket portal
cd frontend-recipient && npm run dev
```

**Services**:
- Backend API: http://localhost:3000
- Admin UI: http://localhost:3001
- Ticket Portal: http://localhost:3002
- PostgreSQL: localhost:5432
- MinIO Console: http://localhost:9001
- MailHog: http://localhost:8025

See [LOCAL_DEVELOPMENT.md](../../LOCAL_DEVELOPMENT.md) for complete guide.

### Security Configuration

**Local Development (Default Credentials)**:
- PostgreSQL: `postgres` / `postgres`
- MinIO: `minio` / `minio123`
- MailHog: No auth required

**Production Deployment**:
- Follow [Security Checklist](./security-checklist.md)
- Change all default passwords
- Configure AWS services (S3, SES, SQS, Cognito)
- Enable SSL/HTTPS
- Set up monitoring and alerts

⚠️ **CRITICAL**: Never use default credentials in production!

### Monitoring

**CloudWatch Logs** (Production):
- Backend API errors and requests
- Worker processing logs
- Email delivery status
- Timeline evaluation events

**Metrics to Monitor**:
- API error rate
- Database connection pool usage
- SQS queue depth
- S3 upload success rate
- Email bounce/complaint rates
- Violation escalation counts

**Alarms to Configure**:
- High error rate (> 5%)
- Database CPU > 80%
- Queue depth > 100 messages
- Failed login attempts > 10/min
- S3 unauthorized access attempts

See [Security Checklist](./security-checklist.md) for complete monitoring setup.

## 🎯 Common Tasks

### Submit an Observation (API)

```bash
POST http://localhost:3000/api/v1/observations/submit
Content-Type: application/json

{
  "idempotencyKey": "unique-key-here",
  "siteId": "site-id-from-seed",
  "observedAt": "2026-01-15T12:00:00Z",
  "licensePlate": "ABC123",
  "issuingState": "CA",
  "evidence": [
    {
      "type": "TEXT_NOTE",
      "noteText": "Vehicle in handicapped space without placard"
    }
  ]
}
```

### Issue a Notice

1. Navigate to Violations page in Admin UI
2. Select violation from list
3. Click "Issue Notice"
4. Review notice details
5. Confirm issuance
6. Print notice or copy QR link

### Evaluate Timelines (Manual)

```bash
POST http://localhost:3000/api/v1/violations/{violationId}/evaluate-timeline
```

Or run timeline worker:
```bash
cd workers
npm run timeline
```

### Check Email (Local)

1. Visit http://localhost:8025
2. View captured emails
3. Click activation links to test flow

### Database Queries

```sql
-- View recent observations
SELECT * FROM observations
WHERE deleted_at IS NULL
ORDER BY created_at DESC LIMIT 10;

-- View active violations
SELECT id, category, status, detected_at
FROM violations
WHERE resolved_at IS NULL
AND deleted_at IS NULL;

-- View timeline events
SELECT v.id, v.status, ve.event_type, ve.occurred_at
FROM violations v
LEFT JOIN violation_events ve ON v.id = ve.violation_id
WHERE v.id = 'violation-id-here'
ORDER BY ve.occurred_at;
```

## 🐛 Troubleshooting

### Common Issues

**Backend won't start**:
- Check if PostgreSQL is running: `docker ps`
- Verify DATABASE_URL in backend/.env
- Check logs: `docker logs parking-postgres`

**Can't upload photos**:
- Verify MinIO is running: `docker ps | grep minio`
- Check bucket exists: http://localhost:9001
- Verify S3_ENDPOINT in backend/.env

**Emails not sending (local)**:
- Check MailHog is running: `docker ps | grep mailhog`
- View captured emails: http://localhost:8025
- Verify EMAIL_MODE=local in backend/.env

**Mobile app can't connect**:
- Android emulator: Use `10.0.2.2` instead of `localhost`
- Physical device: Use computer's local IP (e.g., `192.168.1.100`)
- Check backend is running: `curl http://localhost:3000/health`

See [LOCAL_DEVELOPMENT.md](../../LOCAL_DEVELOPMENT.md) for complete troubleshooting guide.

## 📚 Reference

### Test Data (Seed)

After running `npm run seed` in backend:
- **Site**: "Cedar Terrace Test Site"
- **12 Parking Positions**: H1-H2 (handicapped), 3-4, 7-8, 12 (open), P5-P6, P10-P11 (purchased), R9 (reserved)
- **3 Test Vehicles**: Various license plates

See [Test Parking Lot](./test-parking-lot.md) for visual diagram.

### Violation Categories

1. **HANDICAPPED_NO_PERMIT**: No placard in handicapped space
2. **PURCHASED_UNAUTHORIZED**: Unauthorized vehicle in purchased space
3. **FIRE_LANE**: Vehicle in fire lane
4. **REGISTRATION_EXPIRED**: Expired registration tags
5. **GENERAL_VIOLATION**: Other violations

### Timeline Rules

| Category | Notice Eligible | Escalation | Tow Eligible |
|----------|----------------|------------|--------------|
| Handicapped | Immediate | 7 days | 14 days |
| Fire Lane | Immediate | 1 day | 3 days |
| Purchased | Immediate | 3 days | 7 days |
| Registration | Immediate | 14 days | 30 days |
| General | Immediate | 7 days | 21 days |

### Evidence Intent Types

- **PRIMARY_VEHICLE**: Main photo of vehicle
- **SECONDARY_VEHICLE**: Additional angle or detail
- **REGISTRATION_UPDATE**: License plate or tags
- **HANDICAPPED_PLACARD**: Visible placard or tag
- **GENERAL**: Other documentation

## 🔗 External Resources

- **AWS Documentation**: https://docs.aws.amazon.com/
- **PostgreSQL Docs**: https://www.postgresql.org/docs/
- **React Documentation**: https://react.dev/
- **Expo Documentation**: https://docs.expo.dev/

---

**For technical architecture and development guides, see [../project/](../project/README.md)**
