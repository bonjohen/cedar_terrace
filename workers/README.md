# Cedar Terrace Workers

Background worker services for asynchronous processing of violations, emails, and offline observation sync.

## Overview

The workers package contains three independent worker services that process SQS queue messages and perform background operations:

1. **Timeline Worker** - Evaluates violation timelines and transitions states based on time thresholds
2. **Email Worker** - Sends recipient activation and notice notification emails via SES
3. **Ingestion Worker** - Processes observations from mobile sync and derives violations

## Architecture

### Timeline Worker

**Purpose**: Automatically evaluate violation timelines and transition states (ESCALATED, TOW_ELIGIBLE) based on configured time thresholds.

**Triggers**:
- Scheduled evaluation (every 5 minutes by default)
- SQS messages from backend when violations are created/updated
- Initial evaluation of all active violations on startup

**Timeline Rules**:
```typescript
HANDICAPPED_NO_PERMIT:
  - Notice eligible: Immediate
  - Escalation: 7 days after notice
  - Tow eligible: 14 days after notice

FIRE_LANE:
  - Notice eligible: Immediate
  - Escalation: 1 day after notice
  - Tow eligible: 3 days after notice

PURCHASED_UNAUTHORIZED:
  - Notice eligible: Immediate
  - Escalation: 3 days after notice
  - Tow eligible: 7 days after notice

REGISTRATION_EXPIRED:
  - Notice eligible: Immediate
  - Escalation: 14 days after notice
  - Tow eligible: 30 days after notice

GENERAL_VIOLATION:
  - Notice eligible: Immediate
  - Escalation: 7 days after notice
  - Tow eligible: 21 days after notice
```

**State Transitions**:
- `DETECTED` → `NOTICE_ISSUED` (manual, via Notice API)
- `NOTICE_ISSUED` → `ESCALATED` (automatic, after escalation threshold)
- `ESCALATED` → `TOW_ELIGIBLE` (automatic, after tow threshold)
- Any state → `RESOLVED` (manual, via Admin or Recipient action)

### Email Worker

**Purpose**: Send transactional emails to ticket recipients via AWS SES.

**Email Types**:
1. **Activation Email**: Sent when recipient initiates ticket access
   - Contains activation link (24-hour expiry)
   - Contains ticket access link
   - Triggers profile completion flow

2. **Notice Issued Email**: Sent when a notice is issued for a violation
   - Contains ticket details (vehicle, category)
   - Contains deadlines and resolution instructions
   - Direct link to ticket page

**Templates**: HTML and plain-text versions with responsive design

**Error Handling**: Failed messages become visible again after visibility timeout. Consider implementing a dead-letter queue for repeated failures.

### Ingestion Worker

**Purpose**: Process observations submitted from mobile app and derive violations based on parking rules.

**Process Flow**:
1. Receive observation ID from SQS
2. Load observation and evidence from database
3. Validate minimum evidence requirement
4. Check for existing violations
5. Derive violations based on:
   - Parking position type (HANDICAPPED, PURCHASED, RESERVED, OPEN)
   - Vehicle eligibility
   - Evidence (e.g., handicapped placard presence)
6. Create violation records
7. Link violations to observation

**Violation Derivation**:
- **HANDICAPPED_NO_PERMIT**: Vehicle in handicapped position without placard evidence
- **PURCHASED_UNAUTHORIZED**: Vehicle in purchased/reserved position without authorization
- Additional categories can be added based on business rules

## Project Structure

```
workers/
├── src/
│   ├── timeline/
│   │   └── handler.ts          # Timeline evaluation worker
│   ├── email/
│   │   ├── handler.ts          # Email sending worker
│   │   └── templates.ts        # Email templates (HTML + text)
│   ├── ingestion/
│   │   └── handler.ts          # Observation processing worker
│   ├── utils/
│   │   ├── database.ts         # PostgreSQL connection pool
│   │   ├── sqs.ts              # SQS client utilities
│   │   └── logger.ts           # Structured JSON logger
│   ├── config.ts               # Environment configuration
│   └── index.ts                # Main entry point
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

## Configuration

Create a `.env` file based on `.env.example`:

```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/cedar_terrace

# AWS Services
AWS_REGION=us-west-2
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key

# SQS Queues
TIMELINE_QUEUE_URL=https://sqs.us-west-2.amazonaws.com/123456789/cedar-terrace-timeline
EMAIL_QUEUE_URL=https://sqs.us-west-2.amazonaws.com/123456789/cedar-terrace-email
INGESTION_QUEUE_URL=https://sqs.us-west-2.amazonaws.com/123456789/cedar-terrace-ingestion

# Email (SES)
SES_SENDER_EMAIL=noreply@cedarterrace.example.com
RECIPIENT_PORTAL_URL=https://tickets.cedarterrace.example.com

# Worker Configuration
TIMELINE_POLL_INTERVAL_MS=300000    # 5 minutes
EMAIL_POLL_INTERVAL_MS=5000         # 5 seconds
INGESTION_POLL_INTERVAL_MS=10000    # 10 seconds
MAX_MESSAGES_PER_BATCH=10
```

## Development

### Setup
```bash
cd workers
npm install
```

### Run All Workers
```bash
npm run dev
# or
ts-node src/index.ts --all
```

### Run Individual Workers
```bash
# Timeline worker only
npm run timeline
# or
ts-node src/timeline/handler.ts

# Email worker only
npm run email
# or
ts-node src/email/handler.ts

# Ingestion worker only
npm run ingestion
# or
ts-node src/ingestion/handler.ts
```

### Run Specific Workers Together
```bash
ts-node src/index.ts --timeline --email
```

### Build
```bash
npm run build
```

### Run Built Code
```bash
node dist/index.js --all
```

## Deployment

### AWS Lambda (Recommended)

Each worker can be deployed as a separate Lambda function:

1. **Timeline Worker**: EventBridge cron (e.g., `rate(5 minutes)`)
2. **Email Worker**: SQS trigger (EMAIL_QUEUE_URL)
3. **Ingestion Worker**: SQS trigger (INGESTION_QUEUE_URL)

**Lambda Handler Example**:
```typescript
import { timelineWorker } from './timeline/handler';

export async function handler(event: any) {
  if (event.source === 'aws.events') {
    // EventBridge cron trigger
    await timelineWorker.processMessages();
  } else if (event.Records) {
    // SQS trigger - process batch
    for (const record of event.Records) {
      const message = JSON.parse(record.body);
      await timelineWorker.evaluateViolationTimeline(message.violationId);
    }
  }
}
```

### Docker Container

Build and run all workers in a single container:

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY . .
RUN npm run build

CMD ["node", "dist/index.js", "--all"]
```

### ECS/Fargate

Deploy as long-running services:
- One task per worker type
- Auto-scaling based on queue depth metrics
- CloudWatch logs integration

## Monitoring

### Structured Logging

All logs are output as JSON for easy parsing:

```json
{
  "timestamp": "2026-01-15T15:30:00.000Z",
  "level": "info",
  "service": "timeline-worker",
  "message": "Violation escalated",
  "context": {
    "violationId": "uuid-here",
    "daysSinceNotice": 7
  }
}
```

### CloudWatch Metrics

Recommended custom metrics:
- `MessagesProcessed`: Count of successfully processed messages
- `ProcessingErrors`: Count of processing failures
- `TimelineTransitions`: Count of state transitions by type
- `EmailsSent`: Count of emails sent by type

### Alarms

Set up CloudWatch alarms for:
- High error rate (> 5% of messages)
- Queue depth growing (> 100 messages)
- Long processing time (> 60 seconds per message)
- Lambda timeout errors

## Testing

### Unit Tests

```bash
npm test
```

### Integration Tests

Requires running PostgreSQL and LocalStack (for SQS/SES):

```bash
# Start dependencies
docker-compose -f ../local/docker-compose.yml up -d

# Run tests
npm test
```

### Manual Testing

Send test messages to queues:

```bash
# Timeline message
aws sqs send-message \
  --queue-url $TIMELINE_QUEUE_URL \
  --message-body '{"violationId":"uuid-here","action":"evaluate"}'

# Email message
aws sqs send-message \
  --queue-url $EMAIL_QUEUE_URL \
  --message-body '{
    "type":"ACTIVATION",
    "data":{
      "email":"test@example.com",
      "activationToken":"token-here",
      "qrToken":"qr-token-here"
    }
  }'

# Ingestion message
aws sqs send-message \
  --queue-url $INGESTION_QUEUE_URL \
  --message-body '{
    "action":"PROCESS_OBSERVATION",
    "observationId":"uuid-here",
    "submittedBy":"user-id"
  }'
```

## Error Handling

### Retry Logic

- Failed messages are retried automatically via SQS visibility timeout
- Visibility timeout: 60 seconds
- Max receive count: 3 (recommended)
- Dead-letter queue: Capture messages that fail repeatedly

### Idempotency

- Timeline worker: Multiple evaluations of same violation are safe (no duplicate transitions)
- Email worker: SES handles duplicate prevention (within 24 hours)
- Ingestion worker: Checks for existing violations before creating new ones

## Performance

### Throughput

- Timeline worker: ~10-20 violations per second
- Email worker: Limited by SES send rate (14 emails/sec by default)
- Ingestion worker: ~5-10 observations per second

### Optimization

- Increase `MAX_MESSAGES_PER_BATCH` for higher throughput
- Use batching for database operations
- Consider connection pooling for high-volume scenarios
- Monitor database query performance with indexes

## Security

### IAM Permissions

Workers require:
- SQS: `ReceiveMessage`, `DeleteMessage`, `SendMessage`
- SES: `SendEmail`
- RDS/Secrets: Database access
- CloudWatch: `PutMetricData`, `CreateLogStream`, `PutLogEvents`

### Secrets Management

Use AWS Secrets Manager or Parameter Store for:
- Database credentials
- AWS access keys (if not using IAM roles)

## Future Enhancements

1. **Dead-Letter Queue**: Capture and analyze failed messages
2. **Batch Processing**: Process multiple violations/emails in parallel
3. **Circuit Breaker**: Prevent cascading failures
4. **Metrics Dashboard**: CloudWatch dashboard for monitoring
5. **Rate Limiting**: Prevent SES throttling
6. **Priority Queues**: Process urgent violations first
7. **Webhook Integration**: Notify external systems of state changes

## License

Private - Cedar Terrace Project
