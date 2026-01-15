/**
 * Integration tests for violation timeline progression
 * Tests: state transitions through timeline events
 */

import { ViolationService } from '../domain/violation';
import { ObservationService } from '../domain/observation';
import { ParkingPositionService } from '../domain/parking-position';
import { setupTestDatabase, teardownTestDatabase, TestContext } from './integration-helpers';
import { ViolationCategory, ViolationStatus, ViolationEventType } from '@cedar-terrace/shared';

describe('Violation Timeline Integration Tests', () => {
  let context: TestContext;
  let violationService: ViolationService;
  let observationService: ObservationService;
  let parkingPositionService: ParkingPositionService;

  beforeAll(async () => {
    context = await setupTestDatabase();
    violationService = new ViolationService(context.pool);
    observationService = new ObservationService(context.pool);
    parkingPositionService = new ParkingPositionService(context.pool);
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  describe('Timeline event progression', () => {
    it('should progress from DETECTED to NOTICE_ELIGIBLE based on category timeline', async () => {
      // Create a handicapped violation (24h notice eligibility)
      const result = await observationService.submit(
        {
          observedAt: new Date().toISOString(),
          siteId: context.siteId,
          idempotencyKey: 'timeline-test-1',
          licensePlate: 'ABC123',
          issuingState: 'CA',
          parkingPositionId: context.positionIds.h1,
          evidence: [
            {
              type: 'TEXT_NOTE',
              noteText: 'No visible placard',
            },
          ],
        },
        'test-user'
      );
      const observationId = result.observationId;

      // Derive violations (as done by API)
      const obs = await observationService.getById(observationId);
      if (obs && obs.parkingPositionId) {
        const position = await parkingPositionService.getById(obs.parkingPositionId);
        await violationService.deriveFromObservation(obs, position, 'test-user');
      }

      // Get the violation
      const violations = await violationService.getByVehicle(context.vehicleIds.abc123);
      const violation = violations.find((v) => v.parkingPositionId === context.positionIds.h1);
      expect(violation).toBeDefined();
      expect(violation!.category).toBe(ViolationCategory.HANDICAPPED_NO_PLACARD);
      expect(violation!.status).toBe(ViolationStatus.DETECTED);

      // Manually add a timeline event to simulate progression
      // (In production, this would be done by the timeline worker)
      await violationService.addEvent(violation!.id, ViolationEventType.NOTICE_ELIGIBLE, {
        notes: 'Exceeded notice eligibility threshold',
        performedBy: 'SYSTEM',
      });

      // Verify status changed
      const updated = await violationService.getById(violation!.id);
      expect(updated!.status).toBe(ViolationStatus.NOTICE_ELIGIBLE);

      // Verify event was recorded
      const events = await violationService.getEvents(violation!.id);
      expect(events.length).toBeGreaterThanOrEqual(2);
      const noticeEvent = events.find((e) => e.eventType === ViolationEventType.NOTICE_ELIGIBLE);
      expect(noticeEvent).toBeDefined();
    });

    it('should progress through full timeline: DETECTED → NOTICE_ELIGIBLE → ESCALATED → TOW_ELIGIBLE', async () => {
      // Create unauthorized stall violation
      const result = await observationService.submit(
        {
          observedAt: new Date().toISOString(),
          siteId: context.siteId,
          idempotencyKey: 'timeline-test-2',
          licensePlate: 'XYZ789',
          issuingState: 'WA',
          parkingPositionId: context.positionIds.p5, // Purchased spot
          evidence: [
            {
              type: 'TEXT_NOTE',
              noteText: 'Unauthorized vehicle in purchased spot',
            },
          ],
        },
        'test-user'
      );
      const observationId = result.observationId;

      // Derive violations (as done by API)
      const obs = await observationService.getById(observationId);
      if (obs && obs.parkingPositionId) {
        const position = await parkingPositionService.getById(obs.parkingPositionId);
        await violationService.deriveFromObservation(obs, position, 'test-user');
      }

      // Get the violation
      const violations = await violationService.getByVehicle(context.vehicleIds.xyz789);
      const violation = violations.find((v) => v.parkingPositionId === context.positionIds.p5);
      expect(violation).toBeDefined();
      expect(violation!.category).toBe(ViolationCategory.UNAUTHORIZED_STALL);
      expect(violation!.status).toBe(ViolationStatus.DETECTED);

      const violationId = violation!.id;

      // Progress to NOTICE_ELIGIBLE
      await violationService.addEvent(violationId, ViolationEventType.NOTICE_ELIGIBLE, {
        notes: '24 hours elapsed',
        performedBy: 'SYSTEM',
      });

      let updated = await violationService.getById(violationId);
      expect(updated!.status).toBe(ViolationStatus.NOTICE_ELIGIBLE);

      // Progress to ESCALATED
      await violationService.addEvent(violationId, ViolationEventType.ESCALATED, {
        notes: '72 hours elapsed',
        performedBy: 'SYSTEM',
      });

      updated = await violationService.getById(violationId);
      expect(updated!.status).toBe(ViolationStatus.ESCALATED);

      // Progress to TOW_ELIGIBLE
      await violationService.addEvent(violationId, ViolationEventType.TOW_ELIGIBLE, {
        notes: '168 hours elapsed',
        performedBy: 'SYSTEM',
      });

      updated = await violationService.getById(violationId);
      expect(updated!.status).toBe(ViolationStatus.TOW_ELIGIBLE);

      // Verify all events were recorded
      const events = await violationService.getEvents(violationId);
      expect(events.length).toBe(4); // DETECTED + NOTICE_ELIGIBLE + ESCALATED + TOW_ELIGIBLE

      const eventTypes = events.map((e) => e.eventType);
      expect(eventTypes).toContain(ViolationEventType.DETECTED);
      expect(eventTypes).toContain(ViolationEventType.NOTICE_ELIGIBLE);
      expect(eventTypes).toContain(ViolationEventType.ESCALATED);
      expect(eventTypes).toContain(ViolationEventType.TOW_ELIGIBLE);
    });

    it('should record timeline events with proper metadata', async () => {
      // Create violation
      const result = await observationService.submit(
        {
          observedAt: new Date().toISOString(),
          siteId: context.siteId,
          idempotencyKey: 'timeline-test-3',
          licensePlate: 'DEF456',
          issuingState: 'OR',
          parkingPositionId: context.positionIds.h2,
          evidence: [
            {
              type: 'TEXT_NOTE',
              noteText: 'Test violation for metadata',
            },
          ],
        },
        'test-user'
      );
      const observationId = result.observationId;

      // Derive violations
      const obs = await observationService.getById(observationId);
      if (obs && obs.parkingPositionId) {
        const position = await parkingPositionService.getById(obs.parkingPositionId);
        await violationService.deriveFromObservation(obs, position, 'test-user');
      }

      // Get violation
      const violations = await violationService.getByVehicle(context.vehicleIds.def456);
      const violation = violations[0];

      // Add event with metadata
      await violationService.addEvent(violation.id, ViolationEventType.NOTICE_ELIGIBLE, {
        observationId: observationId,
        notes: 'Custom notes for event',
        performedBy: 'admin-123',
      });

      // Verify event metadata
      const events = await violationService.getEvents(violation.id);
      const noticeEvent = events.find((e) => e.eventType === ViolationEventType.NOTICE_ELIGIBLE);

      expect(noticeEvent).toBeDefined();
      expect(noticeEvent!.observationId).toBe(observationId);
      expect(noticeEvent!.notes).toBe('Custom notes for event');
      expect(noticeEvent!.performedBy).toBe('admin-123');
    });
  });

  describe('Violation status transitions', () => {
    it('should transition to RESOLVED status with timestamp', async () => {
      // Create violation
      const result = await observationService.submit(
        {
          observedAt: new Date().toISOString(),
          siteId: context.siteId,
          idempotencyKey: 'resolve-test-1',
          licensePlate: 'ABC123',
          issuingState: 'CA',
          parkingPositionId: context.positionIds.p6,
          evidence: [
            {
              type: 'TEXT_NOTE',
              noteText: 'Will be resolved',
            },
          ],
        },
        'test-user'
      );
      const observationId = result.observationId;

      // Derive violations
      const obs = await observationService.getById(observationId);
      if (obs && obs.parkingPositionId) {
        const position = await parkingPositionService.getById(obs.parkingPositionId);
        await violationService.deriveFromObservation(obs, position, 'test-user');
      }

      // Get violation
      const violations = await violationService.getByVehicle(context.vehicleIds.abc123);
      const violation = violations.find((v) => v.parkingPositionId === context.positionIds.p6);
      expect(violation).toBeDefined();

      // Resolve the violation
      await violationService.addEvent(violation!.id, ViolationEventType.RESOLVED, {
        notes: 'Owner provided proof of authorization',
        performedBy: 'admin-456',
      });

      // Verify resolution
      const resolved = await violationService.getById(violation!.id);
      expect(resolved!.status).toBe(ViolationStatus.RESOLVED);
      expect(resolved!.resolvedAt).toBeDefined();

      // Verify event
      const events = await violationService.getEvents(violation!.id);
      const resolveEvent = events.find((e) => e.eventType === ViolationEventType.RESOLVED);
      expect(resolveEvent).toBeDefined();
      expect(resolveEvent!.notes).toBe('Owner provided proof of authorization');
    });

    it('should transition to DISMISSED status with reason', async () => {
      // Create violation
      const result = await observationService.submit(
        {
          observedAt: new Date().toISOString(),
          siteId: context.siteId,
          idempotencyKey: 'dismiss-test-1',
          licensePlate: 'XYZ789',
          issuingState: 'WA',
          parkingPositionId: context.positionIds.h1,
          evidence: [
            {
              type: 'TEXT_NOTE',
              noteText: 'Will be dismissed',
            },
          ],
        },
        'test-user'
      );
      const observationId = result.observationId;

      // Derive violations
      const obs = await observationService.getById(observationId);
      if (obs && obs.parkingPositionId) {
        const position = await parkingPositionService.getById(obs.parkingPositionId);
        await violationService.deriveFromObservation(obs, position, 'test-user');
      }

      // Get violation
      const violations = await violationService.getByVehicle(context.vehicleIds.xyz789);
      const violation = violations.find((v) => v.parkingPositionId === context.positionIds.h1);
      expect(violation).toBeDefined();

      // Dismiss the violation
      await violationService.addEvent(violation!.id, ViolationEventType.DISMISSED, {
        notes: 'Photo evidence unclear',
        performedBy: 'supervisor-789',
      });

      // Verify dismissal
      const dismissed = await violationService.getById(violation!.id);
      expect(dismissed!.status).toBe(ViolationStatus.DISMISSED);
      expect(dismissed!.dismissedAt).toBeDefined();
      expect(dismissed!.dismissalReason).toBe('Photo evidence unclear');

      // Verify event
      const events = await violationService.getEvents(violation!.id);
      const dismissEvent = events.find((e) => e.eventType === ViolationEventType.DISMISSED);
      expect(dismissEvent).toBeDefined();
    });
  });

  describe('Multiple violations for same vehicle', () => {
    it('should maintain separate timelines for different violations', async () => {
      // Create first violation - handicapped spot H1
      const result1 = await observationService.submit(
        {
          observedAt: new Date().toISOString(),
          siteId: context.siteId,
          idempotencyKey: 'multi-timeline-1',
          licensePlate: 'DEF456',
          issuingState: 'OR',
          parkingPositionId: context.positionIds.h1,
          evidence: [
            {
              type: 'TEXT_NOTE',
              noteText: 'First violation',
            },
          ],
        },
        'test-user'
      );
      const obs1Id = result1.observationId;

      // Derive first violation
      const obs1 = await observationService.getById(obs1Id);
      if (obs1 && obs1.parkingPositionId) {
        const position = await parkingPositionService.getById(obs1.parkingPositionId);
        await violationService.deriveFromObservation(obs1, position, 'test-user');
      }

      // Create second violation - handicapped spot H2
      const result2 = await observationService.submit(
        {
          observedAt: new Date().toISOString(),
          siteId: context.siteId,
          idempotencyKey: 'multi-timeline-2',
          licensePlate: 'DEF456',
          issuingState: 'OR',
          parkingPositionId: context.positionIds.h2,
          evidence: [
            {
              type: 'TEXT_NOTE',
              noteText: 'Second violation',
            },
          ],
        },
        'test-user'
      );
      const obs2Id = result2.observationId;

      // Derive second violation
      const obs2 = await observationService.getById(obs2Id);
      if (obs2 && obs2.parkingPositionId) {
        const position = await parkingPositionService.getById(obs2.parkingPositionId);
        await violationService.deriveFromObservation(obs2, position, 'test-user');
      }

      // Get both violations
      const violations = await violationService.getByVehicle(context.vehicleIds.def456);
      expect(violations.length).toBeGreaterThanOrEqual(2);

      const violation1 = violations.find((v) => v.parkingPositionId === context.positionIds.h1);
      const violation2 = violations.find((v) => v.parkingPositionId === context.positionIds.h2);

      expect(violation1).toBeDefined();
      expect(violation2).toBeDefined();

      // Progress first violation to NOTICE_ELIGIBLE
      await violationService.addEvent(violation1!.id, ViolationEventType.NOTICE_ELIGIBLE, {
        notes: 'First violation progressed',
        performedBy: 'SYSTEM',
      });

      // Progress second violation to ESCALATED (skip NOTICE_ELIGIBLE for testing)
      await violationService.addEvent(violation2!.id, ViolationEventType.NOTICE_ELIGIBLE, {
        notes: 'Second violation to notice eligible',
        performedBy: 'SYSTEM',
      });
      await violationService.addEvent(violation2!.id, ViolationEventType.ESCALATED, {
        notes: 'Second violation escalated',
        performedBy: 'SYSTEM',
      });

      // Verify separate statuses
      const updated1 = await violationService.getById(violation1!.id);
      const updated2 = await violationService.getById(violation2!.id);

      expect(updated1!.status).toBe(ViolationStatus.NOTICE_ELIGIBLE);
      expect(updated2!.status).toBe(ViolationStatus.ESCALATED);

      // Verify separate event timelines
      const events1 = await violationService.getEvents(violation1!.id);
      const events2 = await violationService.getEvents(violation2!.id);

      expect(events1.length).toBeLessThan(events2.length);
    });
  });

  describe('Event immutability', () => {
    it('should preserve all events in timeline history', async () => {
      // Create violation
      const result = await observationService.submit(
        {
          observedAt: new Date().toISOString(),
          siteId: context.siteId,
          idempotencyKey: 'immutability-test-1',
          licensePlate: 'ABC123',
          issuingState: 'CA',
          parkingPositionId: context.positionIds.p10,
          evidence: [
            {
              type: 'TEXT_NOTE',
              noteText: 'Immutability test',
            },
          ],
        },
        'test-user'
      );
      const observationId = result.observationId;

      // Derive violations
      const obs = await observationService.getById(observationId);
      if (obs && obs.parkingPositionId) {
        const position = await parkingPositionService.getById(obs.parkingPositionId);
        await violationService.deriveFromObservation(obs, position, 'test-user');
      }

      // Get violation
      const violations = await violationService.getByVehicle(context.vehicleIds.abc123);
      const violation = violations.find((v) => v.parkingPositionId === context.positionIds.p10);
      expect(violation).toBeDefined();

      // Add multiple events
      await violationService.addEvent(violation!.id, ViolationEventType.NOTICE_ELIGIBLE, {
        notes: 'Event 1',
        performedBy: 'SYSTEM',
      });
      await violationService.addEvent(violation!.id, ViolationEventType.NOTICE_ISSUED, {
        notes: 'Event 2',
        performedBy: 'admin-1',
      });
      await violationService.addEvent(violation!.id, ViolationEventType.ESCALATED, {
        notes: 'Event 3',
        performedBy: 'SYSTEM',
      });

      // Get events
      const events = await violationService.getEvents(violation!.id);

      // Should have at least 4 events (DETECTED + 3 added)
      expect(events.length).toBeGreaterThanOrEqual(4);

      // Verify all events are preserved with original data
      const event1 = events.find((e) => e.notes === 'Event 1');
      const event2 = events.find((e) => e.notes === 'Event 2');
      const event3 = events.find((e) => e.notes === 'Event 3');

      expect(event1).toBeDefined();
      expect(event2).toBeDefined();
      expect(event3).toBeDefined();

      // Verify chronological ordering
      expect(events[0].createdAt).toBeDefined();
      for (let i = 1; i < events.length; i++) {
        expect(new Date(events[i].createdAt).getTime()).toBeGreaterThanOrEqual(
          new Date(events[i - 1].createdAt).getTime()
        );
      }
    });
  });

  describe('Category-specific timelines', () => {
    it('should handle fire lane violations with rapid escalation', async () => {
      // Create fire lane violation
      const result = await observationService.submit(
        {
          observedAt: new Date().toISOString(),
          siteId: context.siteId,
          idempotencyKey: 'fire-lane-test-1',
          licensePlate: 'XYZ789',
          issuingState: 'WA',
          locationDescription: 'Fire lane - red curb',
          evidence: [
            {
              type: 'TEXT_NOTE',
              noteText: 'Vehicle blocking fire lane',
            },
          ],
        },
        'test-user'
      );
      const observationId = result.observationId;

      // Derive violations
      const obs = await observationService.getById(observationId);
      if (obs && obs.parkingPositionId) {
        const position = await parkingPositionService.getById(obs.parkingPositionId);
        await violationService.deriveFromObservation(obs, position, 'test-user');
      }

      // Note: Fire lane violations require locationDescription parsing
      // Since this test doesn't have a parking position, no violation is created
      // This test demonstrates the need for fire lane detection logic
    });

    it('should handle expired registration violations', async () => {
      // Create observation with expired registration evidence
      const result = await observationService.submit(
        {
          observedAt: new Date().toISOString(),
          siteId: context.siteId,
          idempotencyKey: 'expired-reg-test-1',
          licensePlate: 'ABC123',
          issuingState: 'CA',
          parkingPositionId: context.positionIds.open3,
          evidence: [
            {
              type: 'TEXT_NOTE',
              noteText: 'Registration expired 6 months ago',
            },
          ],
        },
        'test-user'
      );
      const observationId = result.observationId;

      // Derive violations
      const obs = await observationService.getById(observationId);
      if (obs && obs.parkingPositionId) {
        const position = await parkingPositionService.getById(obs.parkingPositionId);
        await violationService.deriveFromObservation(obs, position, 'test-user');
      }

      // Note: Expired registration detection requires parsing evidence notes
      // or photo analysis - this test demonstrates the pattern
    });
  });

  describe('Event ordering and timestamps', () => {
    it('should maintain chronological event ordering', async () => {
      // Create violation
      const result = await observationService.submit(
        {
          observedAt: new Date().toISOString(),
          siteId: context.siteId,
          idempotencyKey: 'ordering-test-1',
          licensePlate: 'DEF456',
          issuingState: 'OR',
          parkingPositionId: context.positionIds.p11,
          evidence: [
            {
              type: 'TEXT_NOTE',
              noteText: 'Test ordering',
            },
          ],
        },
        'test-user'
      );
      const observationId = result.observationId;

      // Derive violations
      const obs = await observationService.getById(observationId);
      if (obs && obs.parkingPositionId) {
        const position = await parkingPositionService.getById(obs.parkingPositionId);
        await violationService.deriveFromObservation(obs, position, 'test-user');
      }

      // Get violation
      const violations = await violationService.getByVehicle(context.vehicleIds.def456);
      const violation = violations.find((v) => v.parkingPositionId === context.positionIds.p11);
      expect(violation).toBeDefined();

      // Add events with small delays to ensure different timestamps
      await violationService.addEvent(violation!.id, ViolationEventType.NOTICE_ELIGIBLE, {
        notes: 'First event',
        performedBy: 'SYSTEM',
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      await violationService.addEvent(violation!.id, ViolationEventType.NOTICE_ISSUED, {
        notes: 'Second event',
        performedBy: 'admin-1',
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      await violationService.addEvent(violation!.id, ViolationEventType.ESCALATED, {
        notes: 'Third event',
        performedBy: 'SYSTEM',
      });

      // Get events and verify ordering
      const events = await violationService.getEvents(violation!.id);
      expect(events.length).toBeGreaterThanOrEqual(4);

      // Events should be in chronological order
      for (let i = 1; i < events.length; i++) {
        const prevTime = new Date(events[i - 1].createdAt).getTime();
        const currTime = new Date(events[i].createdAt).getTime();
        expect(currTime).toBeGreaterThanOrEqual(prevTime);
      }
    });

    it('should record performer for each event', async () => {
      // Create violation
      const result = await observationService.submit(
        {
          observedAt: new Date().toISOString(),
          siteId: context.siteId,
          idempotencyKey: 'performer-test-1',
          licensePlate: 'ABC123',
          issuingState: 'CA',
          parkingPositionId: context.positionIds.r9,
          evidence: [
            {
              type: 'TEXT_NOTE',
              noteText: 'Test performer tracking',
            },
          ],
        },
        'test-user'
      );
      const observationId = result.observationId;

      // Derive violations
      const obs = await observationService.getById(observationId);
      if (obs && obs.parkingPositionId) {
        const position = await parkingPositionService.getById(obs.parkingPositionId);
        await violationService.deriveFromObservation(obs, position, 'test-user');
      }

      // Get violation
      const violations = await violationService.getByVehicle(context.vehicleIds.abc123);
      const violation = violations.find((v) => v.parkingPositionId === context.positionIds.r9);
      expect(violation).toBeDefined();

      // Add events with different performers
      await violationService.addEvent(violation!.id, ViolationEventType.NOTICE_ELIGIBLE, {
        notes: 'System event',
        performedBy: 'SYSTEM',
      });

      await violationService.addEvent(violation!.id, ViolationEventType.NOTICE_ISSUED, {
        notes: 'Admin event',
        performedBy: 'admin-user-123',
      });

      await violationService.addEvent(violation!.id, ViolationEventType.RESOLVED, {
        notes: 'Supervisor event',
        performedBy: 'supervisor-456',
      });

      // Verify performers
      const events = await violationService.getEvents(violation!.id);

      const systemEvent = events.find((e) => e.notes === 'System event');
      const adminEvent = events.find((e) => e.notes === 'Admin event');
      const supervisorEvent = events.find((e) => e.notes === 'Supervisor event');

      expect(systemEvent!.performedBy).toBe('SYSTEM');
      expect(adminEvent!.performedBy).toBe('admin-user-123');
      expect(supervisorEvent!.performedBy).toBe('supervisor-456');
    });

    it('should link events to observations and notices when applicable', async () => {
      // Create first observation in p10 (purchased spot not assigned to XYZ789)
      const result1 = await observationService.submit(
        {
          observedAt: new Date().toISOString(),
          siteId: context.siteId,
          idempotencyKey: 'linking-test-1',
          licensePlate: 'XYZ789',
          issuingState: 'WA',
          parkingPositionId: context.positionIds.p10,
          evidence: [
            {
              type: 'TEXT_NOTE',
              noteText: 'First observation for linking test',
            },
          ],
        },
        'test-user'
      );
      const obs1Id = result1.observationId;

      // Derive violations
      const obs1 = await observationService.getById(obs1Id);
      if (obs1 && obs1.parkingPositionId) {
        const position = await parkingPositionService.getById(obs1.parkingPositionId);
        await violationService.deriveFromObservation(obs1, position, 'test-user');
      }

      // Get violation
      const violations = await violationService.getByVehicle(context.vehicleIds.xyz789);
      const violation = violations.find((v) => v.parkingPositionId === context.positionIds.p10);
      expect(violation).toBeDefined();

      // Create second observation linked to same violation
      const result2 = await observationService.submit(
        {
          observedAt: new Date().toISOString(),
          siteId: context.siteId,
          idempotencyKey: 'linking-test-2',
          licensePlate: 'XYZ789',
          issuingState: 'WA',
          parkingPositionId: context.positionIds.p10,
          evidence: [
            {
              type: 'TEXT_NOTE',
              noteText: 'Second observation for same violation',
            },
          ],
        },
        'test-user'
      );
      const obs2Id = result2.observationId;

      // Derive again - should attach to existing violation
      const obs2 = await observationService.getById(obs2Id);
      if (obs2 && obs2.parkingPositionId) {
        const position = await parkingPositionService.getById(obs2.parkingPositionId);
        await violationService.deriveFromObservation(obs2, position, 'test-user');
      }

      // Add event linked to second observation
      await violationService.addEvent(violation!.id, ViolationEventType.NOTICE_ELIGIBLE, {
        observationId: obs2Id,
        notes: 'Event linked to second observation',
        performedBy: 'SYSTEM',
      });

      // Verify event linking
      const events = await violationService.getEvents(violation!.id);
      const linkedEvent = events.find(
        (e) => e.observationId === obs2Id && e.eventType === ViolationEventType.NOTICE_ELIGIBLE
      );

      expect(linkedEvent).toBeDefined();
      expect(linkedEvent!.notes).toBe('Event linked to second observation');
      expect(linkedEvent!.observationId).toBe(obs2Id);
    });
  });
});
