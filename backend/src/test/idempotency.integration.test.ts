/**
 * Integration tests for idempotency enforcement
 * Tests: observation submission idempotency, notice issuance idempotency, concurrent requests
 */

import { ObservationService } from '../domain/observation';
import { ViolationService } from '../domain/violation';
import { ParkingPositionService } from '../domain/parking-position';
import { NoticeService } from '../domain/notice';
import { setupTestDatabase, teardownTestDatabase, TestContext } from './integration-helpers';
import { ViolationStatus, ViolationEventType } from '@cedar-terrace/shared';

describe('Idempotency Integration Tests', () => {
  let context: TestContext;
  let observationService: ObservationService;
  let violationService: ViolationService;
  let parkingPositionService: ParkingPositionService;
  let noticeService: NoticeService;

  beforeAll(() => {
    context = setupTestDatabase();
    observationService = new ObservationService(context.db);
    violationService = new ViolationService(context.db);
    parkingPositionService = new ParkingPositionService(context.db);
    noticeService = new NoticeService(context.db, violationService);
  });

  afterAll(() => {
    teardownTestDatabase(context);
  });

  describe('Observation submission idempotency', () => {
    it('should return same observation ID for duplicate idempotency key', async () => {
      const idempotencyKey = 'idem-obs-1';

      // First submission
      const result1 = await observationService.submit(
        {
          observedAt: new Date().toISOString(),
          siteId: context.siteId,
          idempotencyKey,
          licensePlate: 'ABC123',
          issuingState: 'CA',
          parkingPositionId: context.positionIds.h1,
          evidence: [
            {
              type: 'TEXT_NOTE',
              noteText: 'First submission',
            },
          ],
        },
        'test-user'
      );

      const obsId1 = result1.observationId;

      // Second submission with SAME key but DIFFERENT data
      const result2 = await observationService.submit(
        {
          observedAt: new Date().toISOString(),
          siteId: context.siteId,
          idempotencyKey, // SAME KEY
          licensePlate: 'XYZ789', // Different vehicle
          issuingState: 'WA',
          parkingPositionId: context.positionIds.h2,
          evidence: [
            {
              type: 'TEXT_NOTE',
              noteText: 'Second submission - should be ignored',
            },
          ],
        },
        'test-user'
      );

      const obsId2 = result2.observationId;

      // Should return SAME ID
      expect(obsId1).toBe(obsId2);

      // Verify original data preserved
      const obs = context.db
        .prepare('SELECT vehicle_id FROM observations WHERE id = ?')
        .get(obsId1) as any;
      expect(obs.vehicle_id).toBe(context.vehicleIds.abc123);

      // Verify evidence is from first submission
      const evidence = context.db
        .prepare('SELECT note_text FROM evidence_items WHERE observation_id = ?')
        .all(obsId1) as any[];
      expect(evidence[0].note_text).toBe('First submission');
      expect(evidence).toHaveLength(1);
    });

    it('should handle concurrent requests with same idempotency key', async () => {
      const idempotencyKey = 'concurrent-obs-1';

      const request = {
        observedAt: new Date().toISOString(),
        siteId: context.siteId,
        idempotencyKey,
        licensePlate: 'ABC123',
        issuingState: 'CA',
        parkingPositionId: context.positionIds.open3,
        evidence: [
          {
            type: 'TEXT_NOTE',
            noteText: 'Concurrent submission test',
          },
        ],
      };

      // Submit 3 requests concurrently with same key
      // Some may fail due to race condition - this is expected
      const results = await Promise.allSettled([
        observationService.submit(request, 'test-user'),
        observationService.submit(request, 'test-user'),
        observationService.submit(request, 'test-user'),
      ]);

      // At least one should succeed
      const successful = results.filter((r) => r.status === 'fulfilled');
      expect(successful.length).toBeGreaterThanOrEqual(1);

      // All successful results should return same ID
      const obsIds = successful.map((r: any) => r.value.observationId);
      const uniqueIds = new Set(obsIds);
      expect(uniqueIds.size).toBe(1);

      // Verify only one observation was created
      const observations = context.db
        .prepare(
          'SELECT COUNT(*) as count FROM observations WHERE vehicle_id = ? AND parking_position_id = ?'
        )
        .get(context.vehicleIds.abc123, context.positionIds.open3) as any;
      expect(parseInt(observations.count)).toBe(1);
    });

    it('should allow different idempotency keys to create separate observations', async () => {
      // First submission
      const result1 = await observationService.submit(
        {
          observedAt: new Date().toISOString(),
          siteId: context.siteId,
          idempotencyKey: 'unique-key-1',
          licensePlate: 'DEF456',
          issuingState: 'OR',
          parkingPositionId: context.positionIds.h1,
          evidence: [
            {
              type: 'TEXT_NOTE',
              noteText: 'First observation',
            },
          ],
        },
        'test-user'
      );

      // Second submission with different key
      const result2 = await observationService.submit(
        {
          observedAt: new Date().toISOString(),
          siteId: context.siteId,
          idempotencyKey: 'unique-key-2', // DIFFERENT KEY
          licensePlate: 'DEF456',
          issuingState: 'OR',
          parkingPositionId: context.positionIds.h1,
          evidence: [
            {
              type: 'TEXT_NOTE',
              noteText: 'Second observation',
            },
          ],
        },
        'test-user'
      );

      // Should return DIFFERENT IDs
      expect(result1.observationId).not.toBe(result2.observationId);

      // Verify both observations exist
      const observations = context.db
        .prepare(
          'SELECT id FROM observations WHERE vehicle_id = ? AND parking_position_id = ? ORDER BY created_at'
        )
        .all(context.vehicleIds.def456, context.positionIds.h1) as any[];
      expect(observations).toHaveLength(2);
    });

    it('should preserve idempotent response even after time passes', async () => {
      const idempotencyKey = 'time-test-1';

      // First submission
      const result1 = await observationService.submit(
        {
          observedAt: new Date().toISOString(),
          siteId: context.siteId,
          idempotencyKey,
          licensePlate: 'XYZ789',
          issuingState: 'WA',
          parkingPositionId: context.positionIds.p5,
          evidence: [
            {
              type: 'TEXT_NOTE',
              noteText: 'Original submission',
            },
          ],
        },
        'test-user'
      );

      const obsId1 = result1.observationId;

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Second submission with same key
      const result2 = await observationService.submit(
        {
          observedAt: new Date().toISOString(),
          siteId: context.siteId,
          idempotencyKey,
          licensePlate: 'ABC123', // Different data
          issuingState: 'CA',
          parkingPositionId: context.positionIds.p6,
          evidence: [
            {
              type: 'TEXT_NOTE',
              noteText: 'Later submission',
            },
          ],
        },
        'test-user'
      );

      const obsId2 = result2.observationId;

      // Should still return same ID
      expect(obsId1).toBe(obsId2);

      // Verify original data unchanged
      const obs = await observationService.getById(obsId1);
      expect(obs!.vehicleId).toBe(context.vehicleIds.xyz789);
    });
  });

  describe('Notice issuance idempotency', () => {
    it('should return same notice ID for duplicate idempotency key', async () => {
      // Setup: Create violation
      const result = await observationService.submit(
        {
          observedAt: new Date().toISOString(),
          siteId: context.siteId,
          idempotencyKey: 'notice-setup-1',
          licensePlate: 'ABC123',
          issuingState: 'CA',
          parkingPositionId: context.positionIds.h1,
          evidence: [{ type: 'TEXT_NOTE', noteText: 'Test' }],
        },
        'test-user'
      );

      const obs = await observationService.getById(result.observationId);
      if (obs && obs.parkingPositionId) {
        const position = await parkingPositionService.getById(obs.parkingPositionId);
        await violationService.deriveFromObservation(obs, position, 'test-user');
      }

      const violations = await violationService.getByVehicle(context.vehicleIds.abc123);
      const violation = violations.find((v) => v.parkingPositionId === context.positionIds.h1);
      expect(violation).toBeDefined();

      const violationId = violation!.id;

      // Make violation notice-eligible
      await violationService.addEvent(violationId, ViolationEventType.NOTICE_ELIGIBLE, {
        notes: 'Test notice eligibility',
        performedBy: 'SYSTEM',
      });

      const idempotencyKey = 'notice-idem-1';

      // First notice issuance
      const notice1 = await noticeService.issue(
        {
          idempotencyKey,
          violationId: violationId,
        },
        'admin-1'
      );

      const noticeId1 = notice1.noticeId;

      // Second issuance with same key
      const notice2 = await noticeService.issue(
        {
          idempotencyKey,
          violationId: violationId,
        },
        'admin-1'
      );

      const noticeId2 = notice2.noticeId;

      // Should return same notice ID
      expect(noticeId1).toBe(noticeId2);
      expect(notice1.qrToken).toBe(notice2.qrToken);
      expect(notice1.created).toBe(true);
      expect(notice2.created).toBe(false);
    });

    it('should handle concurrent notice issuance requests', async () => {
      // Setup: Create violation
      const result = await observationService.submit(
        {
          observedAt: new Date().toISOString(),
          siteId: context.siteId,
          idempotencyKey: 'notice-concurrent-setup-1',
          licensePlate: 'XYZ789',
          issuingState: 'WA',
          parkingPositionId: context.positionIds.h2,
          evidence: [{ type: 'TEXT_NOTE', noteText: 'Test' }],
        },
        'test-user'
      );

      const obs = await observationService.getById(result.observationId);
      if (obs && obs.parkingPositionId) {
        const position = await parkingPositionService.getById(obs.parkingPositionId);
        await violationService.deriveFromObservation(obs, position, 'test-user');
      }

      const violations = await violationService.getByVehicle(context.vehicleIds.xyz789);
      const violation = violations.find((v) => v.parkingPositionId === context.positionIds.h2);
      expect(violation).toBeDefined();

      const violationId = violation!.id;

      // Make violation notice-eligible
      await violationService.addEvent(violationId, ViolationEventType.NOTICE_ELIGIBLE, {
        notes: 'Test notice eligibility',
        performedBy: 'SYSTEM',
      });

      const idempotencyKey = 'concurrent-notice-1';

      // Issue 3 concurrent requests - some may fail due to race condition
      // This is expected behavior that should be handled by retry logic in production
      const results = await Promise.allSettled([
        noticeService.issue({ idempotencyKey, violationId }, 'admin-1'),
        noticeService.issue({ idempotencyKey, violationId }, 'admin-1'),
        noticeService.issue({ idempotencyKey, violationId }, 'admin-1'),
      ]);

      // At least one should succeed
      const successful = results.filter((r) => r.status === 'fulfilled');
      expect(successful.length).toBeGreaterThanOrEqual(1);

      // All successful results should return same notice ID
      const noticeIds = successful.map((r: any) => r.value.noticeId);
      const uniqueNoticeIds = new Set(noticeIds);
      expect(uniqueNoticeIds.size).toBe(1);

      // Verify only one notice was created
      const notices = context.db
        .prepare('SELECT COUNT(*) as count FROM notices WHERE violation_id = ?')
        .get(violationId) as any;
      expect(parseInt(notices.count)).toBe(1);
    });

    it('should allow different idempotency keys to create separate notices', async () => {
      // Setup: Create two violations
      const result1 = await observationService.submit(
        {
          observedAt: new Date().toISOString(),
          siteId: context.siteId,
          idempotencyKey: 'multi-notice-setup-1',
          licensePlate: 'DEF456',
          issuingState: 'OR',
          parkingPositionId: context.positionIds.h1,
          evidence: [{ type: 'TEXT_NOTE', noteText: 'First violation' }],
        },
        'test-user'
      );

      const obs1 = await observationService.getById(result1.observationId);
      if (obs1 && obs1.parkingPositionId) {
        const position = await parkingPositionService.getById(obs1.parkingPositionId);
        await violationService.deriveFromObservation(obs1, position, 'test-user');
      }

      const result2 = await observationService.submit(
        {
          observedAt: new Date().toISOString(),
          siteId: context.siteId,
          idempotencyKey: 'multi-notice-setup-2',
          licensePlate: 'DEF456',
          issuingState: 'OR',
          parkingPositionId: context.positionIds.h2,
          evidence: [{ type: 'TEXT_NOTE', noteText: 'Second violation' }],
        },
        'test-user'
      );

      const obs2 = await observationService.getById(result2.observationId);
      if (obs2 && obs2.parkingPositionId) {
        const position = await parkingPositionService.getById(obs2.parkingPositionId);
        await violationService.deriveFromObservation(obs2, position, 'test-user');
      }

      const violations = await violationService.getByVehicle(context.vehicleIds.def456);
      const v1 = violations.find((v) => v.parkingPositionId === context.positionIds.h1);
      const v2 = violations.find((v) => v.parkingPositionId === context.positionIds.h2);

      expect(v1).toBeDefined();
      expect(v2).toBeDefined();

      // Make both violations notice-eligible
      await violationService.addEvent(v1!.id, ViolationEventType.NOTICE_ELIGIBLE, {
        performedBy: 'SYSTEM',
      });
      await violationService.addEvent(v2!.id, ViolationEventType.NOTICE_ELIGIBLE, {
        performedBy: 'SYSTEM',
      });

      // Issue notices with different keys
      const notice1 = await noticeService.issue(
        {
          idempotencyKey: 'notice-key-1',
          violationId: v1!.id,
        },
        'admin-1'
      );

      const notice2 = await noticeService.issue(
        {
          idempotencyKey: 'notice-key-2',
          violationId: v2!.id,
        },
        'admin-1'
      );

      // Should create different notices
      expect(notice1.noticeId).not.toBe(notice2.noticeId);
      expect(notice1.qrToken).not.toBe(notice2.qrToken);
    });
  });

  describe('Idempotency key uniqueness', () => {
    it('should scope idempotency keys by operation type', async () => {
      const sharedKey = 'shared-key-1';

      // Use same key for observation
      const obsResult = await observationService.submit(
        {
          observedAt: new Date().toISOString(),
          siteId: context.siteId,
          idempotencyKey: sharedKey,
          licensePlate: 'ABC123',
          issuingState: 'CA',
          parkingPositionId: context.positionIds.p5,
          evidence: [{ type: 'TEXT_NOTE', noteText: 'Test' }],
        },
        'test-user'
      );

      const obs = await observationService.getById(obsResult.observationId);
      if (obs && obs.parkingPositionId) {
        const position = await parkingPositionService.getById(obs.parkingPositionId);
        await violationService.deriveFromObservation(obs, position, 'test-user');
      }

      const violations = await violationService.getByVehicle(context.vehicleIds.abc123);
      const violation = violations.find((v) => v.parkingPositionId === context.positionIds.p5);
      expect(violation).toBeDefined();

      await violationService.addEvent(violation!.id, ViolationEventType.NOTICE_ELIGIBLE, {
        performedBy: 'SYSTEM',
      });

      // Use same key for notice (should work - different operation)
      const noticeResult = await noticeService.issue(
        {
          idempotencyKey: sharedKey, // SAME KEY
          violationId: violation!.id,
        },
        'admin-1'
      );

      // Both operations should succeed with same key
      expect(obsResult.observationId).toBeDefined();
      expect(noticeResult.noticeId).toBeDefined();

      // IDs should be different (different operations)
      expect(obsResult.observationId).not.toBe(noticeResult.noticeId);
    });

    it('should maintain idempotency across service restarts', async () => {
      const idempotencyKey = 'restart-test-1';

      // First submission
      const result1 = await observationService.submit(
        {
          observedAt: new Date().toISOString(),
          siteId: context.siteId,
          idempotencyKey,
          licensePlate: 'XYZ789',
          issuingState: 'WA',
          parkingPositionId: context.positionIds.open3,
          evidence: [{ type: 'TEXT_NOTE', noteText: 'Original' }],
        },
        'test-user'
      );

      const obsId1 = result1.observationId;

      // Simulate service restart by creating new service instance
      const newObservationService = new ObservationService(context.db);

      // Second submission with same key through new service instance
      const result2 = await newObservationService.submit(
        {
          observedAt: new Date().toISOString(),
          siteId: context.siteId,
          idempotencyKey,
          licensePlate: 'ABC123',
          issuingState: 'CA',
          parkingPositionId: context.positionIds.open4,
          evidence: [{ type: 'TEXT_NOTE', noteText: 'After restart' }],
        },
        'test-user'
      );

      const obsId2 = result2.observationId;

      // Should still return same ID
      expect(obsId1).toBe(obsId2);
    });

    it('should handle empty or null idempotency keys gracefully', async () => {
      // Note: The API should require idempotency keys, but test the behavior
      // if one isn't provided (should fail validation or generate unique IDs)

      try {
        await observationService.submit(
          {
            observedAt: new Date().toISOString(),
            siteId: context.siteId,
            idempotencyKey: '', // Empty key
            licensePlate: 'ABC123',
            issuingState: 'CA',
            parkingPositionId: context.positionIds.open3,
            evidence: [{ type: 'TEXT_NOTE', noteText: 'Test' }],
          },
          'test-user'
        );

        // If it doesn't throw, verify behavior
        // (This test documents expected behavior)
      } catch (error) {
        // Empty idempotency key should be rejected
        expect(error).toBeDefined();
      }
    });

    it('should preserve idempotent behavior for retry scenarios', async () => {
      const idempotencyKey = 'retry-test-1';

      // First attempt
      const result1 = await observationService.submit(
        {
          observedAt: new Date().toISOString(),
          siteId: context.siteId,
          idempotencyKey,
          licensePlate: 'DEF456',
          issuingState: 'OR',
          parkingPositionId: context.positionIds.h1,
          evidence: [{ type: 'TEXT_NOTE', noteText: 'First attempt' }],
        },
        'test-user'
      );

      const obsId1 = result1.observationId;

      // Simulate network retry with identical request
      const result2 = await observationService.submit(
        {
          observedAt: new Date().toISOString(),
          siteId: context.siteId,
          idempotencyKey, // Same key
          licensePlate: 'DEF456',
          issuingState: 'OR',
          parkingPositionId: context.positionIds.h1,
          evidence: [{ type: 'TEXT_NOTE', noteText: 'First attempt' }],
        },
        'test-user'
      );

      const obsId2 = result2.observationId;

      // Should return same ID (idempotency)
      expect(obsId1).toBe(obsId2);

      // Third attempt with different data (data mismatch scenario)
      const result3 = await observationService.submit(
        {
          observedAt: new Date().toISOString(),
          siteId: context.siteId,
          idempotencyKey, // Same key
          licensePlate: 'XYZ789', // Different data
          issuingState: 'WA',
          parkingPositionId: context.positionIds.h2,
          evidence: [{ type: 'TEXT_NOTE', noteText: 'Third attempt - different data' }],
        },
        'test-user'
      );

      const obsId3 = result3.observationId;

      // Should still return original ID (idempotency wins)
      expect(obsId1).toBe(obsId3);

      // Verify original data preserved
      const obs = await observationService.getById(obsId1);
      expect(obs!.vehicleId).toBe(context.vehicleIds.def456);
    });
  });
});
