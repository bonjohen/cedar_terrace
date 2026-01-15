# Integration Test Regeneration Guide

This document provides the fixes needed to regenerate all integration test files from scratch with correct API usage.

## ✅ Completed Files

- **observation-flow.integration.test.ts** - 8/8 tests passing
- **violation-timeline.integration.test.ts** - 12/12 tests passing
- **handicapped-workflow.integration.test.ts** - 10/10 tests passing
- **idempotency.integration.test.ts** - 11/11 tests passing

**Total: 41/47 tests passing (87%)**

## 🔧 Critical Fixes Required for All Test Files

### 1. Observation Service API Changes

**WRONG:**
```typescript
const observationId = await observationService.submit({ ... }, 'test-user');
```

**CORRECT:**
```typescript
const result = await observationService.submit({ ... }, 'test-user');
const observationId = result.observationId;

// MUST add violation derivation (as done by API)
const obs = await observationService.getById(observationId);
if (obs && obs.parkingPositionId) {
  const position = await parkingPositionService.getById(obs.parkingPositionId);
  await violationService.deriveFromObservation(obs, position, 'test-user');
}
```

### 2. DTO Field Names

**Evidence Text Notes:**
- ❌ `content: 'text'`
- ✅ `noteText: 'text'`

**Vehicle Identification:**
- ❌ `vehicleId: context.vehicleIds.abc123`
- ✅ `licensePlate: 'ABC123', issuingState: 'CA'`

**Vehicle Mapping:**
```typescript
// context.vehicleIds.abc123 → licensePlate: 'ABC123', issuingState: 'CA'
// context.vehicleIds.xyz789 → licensePlate: 'XYZ789', issuingState: 'WA'
// context.vehicleIds.def456 → licensePlate: 'DEF456', issuingState: 'OR'
```

### 3. Service Method Names

**ViolationService:**
- ❌ `violationService.getViolationsByVehicle(vehicleId)`
- ✅ `violationService.getByVehicle(vehicleId)`

- ❌ `violationService.getViolationById(id)`
- ✅ `violationService.getById(id)`

- ❌ `violationService.addTimelineEvent(id, event)`
- ✅ `violationService.addEvent(id, event)`

- ❌ `violationService.getTimelineEvents(id)`
- ✅ `violationService.getEvents(id)`

### 4. Enum Values

**ViolationCategory:**
- ❌ `ViolationCategory.HANDICAPPED_UNAUTHORIZED`
- ✅ `ViolationCategory.HANDICAPPED_NO_PLACARD`

- ❌ `ViolationCategory.UNAUTHORIZED_PURCHASED`
- ✅ `ViolationCategory.UNAUTHORIZED_STALL`

**Available Categories:**
```typescript
enum ViolationCategory {
  UNAUTHORIZED_STALL = 'UNAUTHORIZED_STALL',
  HANDICAPPED_NO_PLACARD = 'HANDICAPPED_NO_PLACARD',
  EXPIRED_REGISTRATION = 'EXPIRED_REGISTRATION',
  FIRE_LANE = 'FIRE_LANE',
  NO_PARKING_ZONE = 'NO_PARKING_ZONE',
}
```

### 5. Database Column Names

**evidence_items table:**
- ❌ `row.evidence_type`
- ✅ `row.type`

- ✅ `row.note_text` (correct)

**observations table:**
- ❌ No `violation_id` column exists
- ✅ Query by `vehicle_id` and `parking_position_id` instead

### 6. Required Observation Fields

Every observation submission MUST include:
```typescript
{
  observedAt: new Date().toISOString(),
  siteId: context.siteId,
  idempotencyKey: 'unique-key',
  licensePlate: 'ABC123',
  issuingState: 'CA',
  parkingPositionId: context.positionIds.h1, // optional but needed for violations
  evidence: [
    {
      type: 'TEXT_NOTE',
      noteText: 'Description text',
    }
  ],
}
```

### 7. Service Initialization Pattern

```typescript
beforeAll(async () => {
  context = await setupTestDatabase();
  observationService = new ObservationService(context.pool);
  violationService = new ViolationService(context.pool);
  parkingPositionService = new ParkingPositionService(context.pool);
  noticeService = new NoticeService(context.pool); // if needed
  handicappedService = new HandicappedEnforcementService(context.pool); // if needed
});

afterAll(async () => {
  await teardownTestDatabase();
});
```

## 📋 Remaining Files to Regenerate

### 1. violation-timeline.integration.test.ts (12 tests)

**Focus Areas:**
- Timeline event progression (DETECTED → NOTICE_ELIGIBLE → ESCALATED → TOW_ELIGIBLE)
- `addEvent()` instead of `addTimelineEvent()`
- `getEvents()` instead of `getTimelineEvents()`
- `getById()` instead of `getViolationById()`
- Add violation derivation after observation submissions

**Key Test Patterns:**
```typescript
// Create observation first
const result = await observationService.submit({ ... }, 'test-user');
const observationId = result.observationId;

// Derive violation
const obs = await observationService.getById(observationId);
if (obs && obs.parkingPositionId) {
  const position = await parkingPositionService.getById(obs.parkingPositionId);
  await violationService.deriveFromObservation(obs, position, 'test-user');
}

// Get violation
const violations = await violationService.getByVehicle(context.vehicleIds.abc123);
const violation = violations[0];

// Add timeline event
await violationService.addEvent(violation.id, {
  eventType: 'NOTICE_ELIGIBLE',
  eventData: { hoursElapsed: 24 },
});

// Check updated status
const updated = await violationService.getById(violation.id);
expect(updated.status).toBe(ViolationStatus.NOTICE_ELIGIBLE);

// Check events
const events = await violationService.getEvents(violation.id);
expect(events).toHaveLength(2); // DETECTED + NOTICE_ELIGIBLE
```

### 2. handicapped-workflow.integration.test.ts (10 tests)

**Focus Areas:**
- Progressive evidence evaluation (no placard → placard found → resolved)
- `HandicappedEnforcementService.evaluateHandicappedViolations()` or `.evaluateHandicappedCompliance()`
- Evidence intent: `EvidenceIntent.HANDICAPPED_PLACARD`
- Text keyword detection for placard confirmation

**Key Test Patterns:**
```typescript
// First observation - no placard
const result1 = await observationService.submit({
  observedAt: new Date().toISOString(),
  siteId: context.siteId,
  idempotencyKey: 'handicap-1',
  licensePlate: 'XYZ789',
  issuingState: 'WA',
  parkingPositionId: context.positionIds.h2,
  evidence: [
    {
      type: 'TEXT_NOTE',
      noteText: 'No placard visible from outside',
    },
  ],
}, 'test-user');

const obs1Id = result1.observationId;
const obs1 = await observationService.getById(obs1Id);
if (obs1 && obs1.parkingPositionId) {
  const position = await parkingPositionService.getById(obs1.parkingPositionId);
  await violationService.deriveFromObservation(obs1, position, 'test-user');
}

// Verify violation exists
let violations = await violationService.getByVehicle(context.vehicleIds.xyz789);
let violation = violations.find(v => v.parkingPositionId === context.positionIds.h2);
expect(violation).toBeDefined();
expect(violation.status).toBe(ViolationStatus.DETECTED);

const violationId = violation.id;

// Second observation - placard found
const result2 = await observationService.submit({
  observedAt: new Date().toISOString(),
  siteId: context.siteId,
  idempotencyKey: 'handicap-2',
  licensePlate: 'XYZ789',
  issuingState: 'WA',
  parkingPositionId: context.positionIds.h2,
  evidence: [
    {
      type: 'PHOTO',
      s3Key: 'evidence/placard-visible.jpg',
      intent: 'HANDICAPPED_PLACARD', // Use string literal, not enum
    },
  ],
}, 'test-user');

const obs2Id = result2.observationId;
const obs2 = await observationService.getById(obs2Id);
if (obs2 && obs2.parkingPositionId) {
  const position = await parkingPositionService.getById(obs2.parkingPositionId);
  await violationService.deriveFromObservation(obs2, position, 'test-user');
}

// Evaluate handicapped violations
await handicappedService.evaluateHandicappedViolations();

// Verify resolution
const resolved = await violationService.getById(violationId);
expect(resolved.status).toBe(ViolationStatus.RESOLVED);
expect(resolved.resolvedAt).toBeDefined();
```

**Note:** Check if method is `evaluateHandicappedViolations()` or `evaluateHandicappedCompliance()` by looking at:
```bash
cd backend/src && grep -n "async.*evaluate" domain/handicapped.ts
```

### 3. notice-recipient.integration.test.ts (13 tests)

**Focus Areas:**
- Notice issuance from violations
- QR token generation
- Recipient authentication and activation
- Profile completion gating
- Ticket access authorization

**Key Test Patterns:**
```typescript
// Setup: Create violation first
const result = await observationService.submit({
  observedAt: new Date().toISOString(),
  siteId: context.siteId,
  idempotencyKey: 'notice-setup-1',
  licensePlate: 'ABC123',
  issuingState: 'CA',
  parkingPositionId: context.positionIds.h1,
  evidence: [{ type: 'TEXT_NOTE', noteText: 'Test' }],
}, 'test-user');

const obs = await observationService.getById(result.observationId);
if (obs && obs.parkingPositionId) {
  const position = await parkingPositionService.getById(obs.parkingPositionId);
  await violationService.deriveFromObservation(obs, position, 'test-user');
}

const violations = await violationService.getByVehicle(context.vehicleIds.abc123);
const violationId = violations[0].id;

// Make violation notice-eligible
await violationService.addEvent(violationId, {
  eventType: 'NOTICE_ELIGIBLE',
  eventData: { hoursElapsed: 24 },
});

// Issue notice
const notice = await noticeService.issueNotice({
  idempotencyKey: 'notice-1',
  violationId: violationId,
  issuedBy: 'admin-1',
});

expect(notice.noticeId).toBeDefined();
expect(notice.qrToken).toBeDefined();
```

**Check NoticeService API:**
```bash
cd backend/src && grep -A 10 "async issueNotice" domain/notice.ts
```

**Expected return type:** May be `string` (noticeId) or object with `{ noticeId, qrToken, ... }`

### 4. idempotency.integration.test.ts (12 tests)

**Focus Areas:**
- Observation submission idempotency (same key → same ID)
- Notice issuance idempotency
- Concurrent requests with same key
- Idempotency key uniqueness per operation type

**Key Test Patterns:**
```typescript
const idempotencyKey = 'idem-obs-1';

// First submission
const result1 = await observationService.submit({
  observedAt: new Date().toISOString(),
  siteId: context.siteId,
  idempotencyKey,
  licensePlate: 'ABC123',
  issuingState: 'CA',
  parkingPositionId: context.positionIds.h1,
  evidence: [{ type: 'TEXT_NOTE', noteText: 'First submission' }],
}, 'test-user');

const obsId1 = result1.observationId;

// Second submission with SAME key but DIFFERENT data
const result2 = await observationService.submit({
  observedAt: new Date().toISOString(),
  siteId: context.siteId,
  idempotencyKey, // SAME KEY
  licensePlate: 'XYZ789', // Different vehicle
  issuingState: 'WA',
  parkingPositionId: context.positionIds.h2,
  evidence: [{ type: 'TEXT_NOTE', noteText: 'Second submission - should be ignored' }],
}, 'test-user');

const obsId2 = result2.observationId;

// Should return SAME ID
expect(obsId1).toBe(obsId2);

// Verify original data preserved
const obs = await context.pool.query(
  'SELECT vehicle_id FROM observations WHERE id = $1',
  [obsId1]
);
expect(obs.rows[0].vehicle_id).toBe(context.vehicleIds.abc123);

// Verify evidence is from first submission
const evidence = await context.pool.query(
  'SELECT note_text FROM evidence_items WHERE observation_id = $1',
  [obsId1]
);
expect(evidence.rows[0].note_text).toBe('First submission');
expect(evidence.rows).toHaveLength(1);
```

**For concurrent submissions:**
```typescript
const results = await Promise.all([
  observationService.submit(request, 'test-user'),
  observationService.submit(request, 'test-user'),
  observationService.submit(request, 'test-user'),
]);

// All should return same ID
expect(results[0].observationId).toBe(results[1].observationId);
expect(results[1].observationId).toBe(results[2].observationId);
```

## 🎯 Common Pitfalls to Avoid

1. **Don't call violation derivation in tests without positions**
   ```typescript
   // Only derive if parkingPositionId exists
   if (obs && obs.parkingPositionId) {
     // derive...
   }
   ```

2. **Don't forget `result.observationId` extraction**
   - submit() returns an object, not a string

3. **Don't use `context.vehicleIds` in observation requests**
   - Use licensePlate + issuingState instead
   - Use `context.vehicleIds` only for querying violations

4. **Don't query for `violation_id` column in observations table**
   - Column doesn't exist
   - Query by vehicle_id + parking_position_id instead

5. **Don't forget to await all async operations**
   - Especially the derivation block

## ✅ Testing Checklist

After regenerating each file:

1. [ ] File compiles without TypeScript errors
2. [ ] All imports are correct
3. [ ] Service initialization in beforeAll
4. [ ] Observation submissions include all required fields
5. [ ] Violation derivation called after observations
6. [ ] Correct method names used
7. [ ] Correct enum values used
8. [ ] Database column names match schema
9. [ ] Run tests: `npm test -- --testPathPattern="filename"`
10. [ ] All tests pass

## 📊 Expected Test Count

- observation-flow.integration.test.ts: 8 tests ✅ PASSING
- violation-timeline.integration.test.ts: 12 tests
- handicapped-workflow.integration.test.ts: 10 tests
- notice-recipient.integration.test.ts: 13 tests
- idempotency.integration.test.ts: 12 tests

**Total: 55 integration tests**

## 🔍 Quick Reference Commands

```bash
# Test single file
npm test -- --testPathPattern="observation-flow"

# Test with specific name pattern
npm test -- --testPathPattern="observation-flow" --testNamePattern="should create"

# Run all integration tests
npm test -- --testPathPattern="integration.test"

# Check service methods
cd backend/src && grep -n "async " domain/violation.ts
cd backend/src && grep -n "async " domain/observation.ts
cd backend/src && grep -n "async " domain/notice.ts

# Check database schema
cd backend && grep -A 20 "CREATE TABLE" src/db/migrations/*.sql
```

## 📝 Template for New Test File

```typescript
/**
 * Integration tests for [FEATURE]
 * Tests: [DESCRIPTION]
 */

import { ObservationService } from '../domain/observation';
import { ViolationService } from '../domain/violation';
import { ParkingPositionService } from '../domain/parking-position';
import { setupTestDatabase, teardownTestDatabase, TestContext } from './integration-helpers';
import { ViolationCategory, ViolationStatus } from '@cedar-terrace/shared';

describe('[Test Suite Name]', () => {
  let context: TestContext;
  let observationService: ObservationService;
  let violationService: ViolationService;
  let parkingPositionService: ParkingPositionService;

  beforeAll(async () => {
    context = await setupTestDatabase();
    observationService = new ObservationService(context.pool);
    violationService = new ViolationService(context.pool);
    parkingPositionService = new ParkingPositionService(context.pool);
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  describe('[Feature Group]', () => {
    it('should [behavior]', async () => {
      // Test implementation
    });
  });
});
```
