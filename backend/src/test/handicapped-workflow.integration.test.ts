/**
 * Integration tests for handicapped parking enforcement workflow
 * Tests: progressive evidence evaluation, placard detection, resolution
 */

import { ObservationService } from '../domain/observation';
import { ViolationService } from '../domain/violation';
import { ParkingPositionService } from '../domain/parking-position';
import { HandicappedEnforcementService } from '../domain/handicapped';
import { setupTestDatabase, teardownTestDatabase, TestContext } from './integration-helpers';
import { ViolationCategory, ViolationStatus, EvidenceIntent } from '@cedar-terrace/shared';

describe('Handicapped Workflow Integration Tests', () => {
  let context: TestContext;
  let observationService: ObservationService;
  let violationService: ViolationService;
  let parkingPositionService: ParkingPositionService;
  let handicappedService: HandicappedEnforcementService;

  beforeAll(() => {
    context = setupTestDatabase();
    observationService = new ObservationService(context.db);
    violationService = new ViolationService(context.db);
    parkingPositionService = new ParkingPositionService(context.db);
    handicappedService = new HandicappedEnforcementService(context.db, violationService);
  });

  afterAll(() => {
    teardownTestDatabase(context);
  });

  describe('Progressive evidence evaluation', () => {
    it('should create violation when no placard is visible', async () => {
      // First observation - no placard visible
      const result = await observationService.submit(
        {
          observedAt: new Date().toISOString(),
          siteId: context.siteId,
          idempotencyKey: 'handicap-no-placard-1',
          licensePlate: 'ABC123',
          issuingState: 'CA',
          parkingPositionId: context.positionIds.h1,
          evidence: [
            {
              type: 'TEXT_NOTE',
              noteText: 'No placard visible from outside',
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

      // Verify violation was created
      const violations = await violationService.getByVehicle(context.vehicleIds.abc123);
      const violation = violations.find((v) => v.parkingPositionId === context.positionIds.h1);

      expect(violation).toBeDefined();
      expect(violation!.category).toBe(ViolationCategory.HANDICAPPED_NO_PLACARD);
      expect(violation!.status).toBe(ViolationStatus.DETECTED);
    });

    it('should resolve violation when placard evidence is found', async () => {
      // First observation - no placard visible
      const result1 = await observationService.submit(
        {
          observedAt: new Date().toISOString(),
          siteId: context.siteId,
          idempotencyKey: 'handicap-resolve-1',
          licensePlate: 'XYZ789',
          issuingState: 'WA',
          parkingPositionId: context.positionIds.h2,
          evidence: [
            {
              type: 'TEXT_NOTE',
              noteText: 'No placard visible from outside',
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

      // Verify violation was created
      let violations = await violationService.getByVehicle(context.vehicleIds.xyz789);
      let violation = violations.find((v) => v.parkingPositionId === context.positionIds.h2);

      expect(violation).toBeDefined();
      expect(violation!.status).toBe(ViolationStatus.DETECTED);

      const violationId = violation!.id;

      // Second observation - placard found
      const result2 = await observationService.submit(
        {
          observedAt: new Date().toISOString(),
          siteId: context.siteId,
          idempotencyKey: 'handicap-resolve-2',
          licensePlate: 'XYZ789',
          issuingState: 'WA',
          parkingPositionId: context.positionIds.h2,
          evidence: [
            {
              type: 'PHOTO',
              s3Key: 'evidence/placard-visible.jpg',
              intent: EvidenceIntent.HANDICAPPED_PLACARD,
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

      // Evaluate handicapped violations
      await handicappedService.evaluateHandicappedCompliance(context.vehicleIds.xyz789, obs2Id);

      // Verify violation was resolved
      const resolved = await violationService.getById(violationId);
      expect(resolved!.status).toBe(ViolationStatus.RESOLVED);
      expect(resolved!.resolvedAt).toBeDefined();

      // Verify resolution event
      const events = await violationService.getEvents(violationId);
      const resolveEvent = events.find((e) => e.eventType === 'RESOLVED');

      expect(resolveEvent).toBeDefined();
      expect(resolveEvent!.observationId).toBe(obs2Id);
    });

    it('should detect placard from photo evidence with intent', async () => {
      // Observation with placard photo
      const result = await observationService.submit(
        {
          observedAt: new Date().toISOString(),
          siteId: context.siteId,
          idempotencyKey: 'handicap-photo-1',
          licensePlate: 'DEF456',
          issuingState: 'OR',
          parkingPositionId: context.positionIds.h1,
          evidence: [
            {
              type: 'PHOTO',
              s3Key: 'evidence/vehicle-with-placard.jpg',
              intent: EvidenceIntent.HANDICAPPED_PLACARD,
            },
            {
              type: 'TEXT_NOTE',
              noteText: 'Valid handicapped placard visible',
            },
          ],
        },
        'test-user'
      );

      const observationId = result.observationId;

      // Derive violations - should not create violation since placard is present
      const obs = await observationService.getById(observationId);
      if (obs && obs.parkingPositionId) {
        const position = await parkingPositionService.getById(obs.parkingPositionId);
        await violationService.deriveFromObservation(obs, position, 'test-user');
      }

      // Check for placard evidence
      const hasPlacardEvidence = await handicappedService.vehicleHasPlacardEvidence(
        context.vehicleIds.def456
      );

      expect(hasPlacardEvidence).toBe(true);
    });

    it('should handle text note confirmation of placard', async () => {
      // First observation - no placard visible
      const result1 = await observationService.submit(
        {
          observedAt: new Date().toISOString(),
          siteId: context.siteId,
          idempotencyKey: 'handicap-text-1',
          licensePlate: 'ABC123',
          issuingState: 'CA',
          parkingPositionId: context.positionIds.h2,
          evidence: [
            {
              type: 'TEXT_NOTE',
              noteText: 'No placard visible initially',
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

      // Verify violation was created
      let violations = await violationService.getByVehicle(context.vehicleIds.abc123);
      let violation = violations.find((v) => v.parkingPositionId === context.positionIds.h2);

      expect(violation).toBeDefined();
      const violationId = violation!.id;

      // Second observation - placard found with photo evidence
      const result2 = await observationService.submit(
        {
          observedAt: new Date().toISOString(),
          siteId: context.siteId,
          idempotencyKey: 'handicap-text-2',
          licensePlate: 'ABC123',
          issuingState: 'CA',
          parkingPositionId: context.positionIds.h2,
          evidence: [
            {
              type: 'PHOTO',
              s3Key: 'evidence/placard-found.jpg',
              intent: EvidenceIntent.HANDICAPPED_PLACARD,
            },
            {
              type: 'TEXT_NOTE',
              noteText: 'Owner showed valid handicapped placard',
            },
          ],
        },
        'test-user'
      );

      const obs2Id = result2.observationId;

      // Derive and evaluate
      const obs2 = await observationService.getById(obs2Id);
      if (obs2 && obs2.parkingPositionId) {
        const position = await parkingPositionService.getById(obs2.parkingPositionId);
        await violationService.deriveFromObservation(obs2, position, 'test-user');
      }

      await handicappedService.evaluateHandicappedCompliance(context.vehicleIds.abc123, obs2Id);

      // Verify resolution
      const resolved = await violationService.getById(violationId);
      expect(resolved!.status).toBe(ViolationStatus.RESOLVED);
    });
  });

  describe('Multiple handicapped violations', () => {
    it('should resolve only violations with matching evidence', async () => {
      // Create two violations for same vehicle at different spots
      const result1 = await observationService.submit(
        {
          observedAt: new Date().toISOString(),
          siteId: context.siteId,
          idempotencyKey: 'multi-handicap-1',
          licensePlate: 'DEF456',
          issuingState: 'OR',
          parkingPositionId: context.positionIds.h1,
          evidence: [
            {
              type: 'TEXT_NOTE',
              noteText: 'No placard at H1',
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

      const result2 = await observationService.submit(
        {
          observedAt: new Date().toISOString(),
          siteId: context.siteId,
          idempotencyKey: 'multi-handicap-2',
          licensePlate: 'DEF456',
          issuingState: 'OR',
          parkingPositionId: context.positionIds.h2,
          evidence: [
            {
              type: 'TEXT_NOTE',
              noteText: 'No placard at H2',
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

      // Verify both violations exist
      let violations = await violationService.getByVehicle(context.vehicleIds.def456);
      const violation1 = violations.find((v) => v.parkingPositionId === context.positionIds.h1);
      const violation2 = violations.find((v) => v.parkingPositionId === context.positionIds.h2);

      expect(violation1).toBeDefined();
      expect(violation2).toBeDefined();

      const v1Id = violation1!.id;
      const v2Id = violation2!.id;

      // Add placard evidence linked to first violation only
      const result3 = await observationService.submit(
        {
          observedAt: new Date().toISOString(),
          siteId: context.siteId,
          idempotencyKey: 'multi-handicap-3',
          licensePlate: 'DEF456',
          issuingState: 'OR',
          parkingPositionId: context.positionIds.h1,
          evidence: [
            {
              type: 'PHOTO',
              s3Key: 'evidence/placard-at-h1.jpg',
              intent: EvidenceIntent.HANDICAPPED_PLACARD,
            },
          ],
        },
        'test-user'
      );

      const obs3Id = result3.observationId;

      // Derive and evaluate
      const obs3 = await observationService.getById(obs3Id);
      if (obs3 && obs3.parkingPositionId) {
        const position = await parkingPositionService.getById(obs3.parkingPositionId);
        await violationService.deriveFromObservation(obs3, position, 'test-user');
      }

      await handicappedService.evaluateHandicappedCompliance(context.vehicleIds.def456, obs3Id);

      // Verify only first violation is resolved
      const v1Updated = await violationService.getById(v1Id);
      const v2Updated = await violationService.getById(v2Id);

      expect(v1Updated!.status).toBe(ViolationStatus.RESOLVED);
      expect(v2Updated!.status).toBe(ViolationStatus.DETECTED);
    });

    it('should resolve all active handicapped violations when placard evidence is found', async () => {
      // Create violation
      const result1 = await observationService.submit(
        {
          observedAt: new Date().toISOString(),
          siteId: context.siteId,
          idempotencyKey: 'resolve-all-1',
          licensePlate: 'XYZ789',
          issuingState: 'WA',
          parkingPositionId: context.positionIds.h1,
          evidence: [
            {
              type: 'TEXT_NOTE',
              noteText: 'No placard visible',
            },
          ],
        },
        'test-user'
      );

      const obs1Id = result1.observationId;

      // Derive violation
      const obs1 = await observationService.getById(obs1Id);
      if (obs1 && obs1.parkingPositionId) {
        const position = await parkingPositionService.getById(obs1.parkingPositionId);
        await violationService.deriveFromObservation(obs1, position, 'test-user');
      }

      // Get violation
      let violations = await violationService.getByVehicle(context.vehicleIds.xyz789);
      let violation = violations.find((v) => v.parkingPositionId === context.positionIds.h1);

      expect(violation).toBeDefined();
      const violationId = violation!.id;

      // Add placard evidence
      const result2 = await observationService.submit(
        {
          observedAt: new Date().toISOString(),
          siteId: context.siteId,
          idempotencyKey: 'resolve-all-2',
          licensePlate: 'XYZ789',
          issuingState: 'WA',
          parkingPositionId: context.positionIds.h1,
          evidence: [
            {
              type: 'PHOTO',
              s3Key: 'evidence/valid-placard.jpg',
              intent: EvidenceIntent.HANDICAPPED_PLACARD,
            },
          ],
        },
        'test-user'
      );

      const obs2Id = result2.observationId;

      // Derive and evaluate
      const obs2 = await observationService.getById(obs2Id);
      if (obs2 && obs2.parkingPositionId) {
        const position = await parkingPositionService.getById(obs2.parkingPositionId);
        await violationService.deriveFromObservation(obs2, position, 'test-user');
      }

      await handicappedService.evaluateHandicappedCompliance(context.vehicleIds.xyz789, obs2Id);

      // Verify resolution
      const resolved = await violationService.getById(violationId);
      expect(resolved!.status).toBe(ViolationStatus.RESOLVED);
    });
  });

  describe('Violation immutability with progressive evidence', () => {
    it('should not modify original observation when adding new evidence', async () => {
      // First observation
      const result1 = await observationService.submit(
        {
          observedAt: new Date().toISOString(),
          siteId: context.siteId,
          idempotencyKey: 'immutable-1',
          licensePlate: 'ABC123',
          issuingState: 'CA',
          parkingPositionId: context.positionIds.h1,
          evidence: [
            {
              type: 'TEXT_NOTE',
              noteText: 'Original observation - no placard',
            },
          ],
        },
        'test-user'
      );

      const obs1Id = result1.observationId;

      // Derive violation
      const obs1 = await observationService.getById(obs1Id);
      if (obs1 && obs1.parkingPositionId) {
        const position = await parkingPositionService.getById(obs1.parkingPositionId);
        await violationService.deriveFromObservation(obs1, position, 'test-user');
      }

      // Second observation with placard
      const result2 = await observationService.submit(
        {
          observedAt: new Date().toISOString(),
          siteId: context.siteId,
          idempotencyKey: 'immutable-2',
          licensePlate: 'ABC123',
          issuingState: 'CA',
          parkingPositionId: context.positionIds.h1,
          evidence: [
            {
              type: 'PHOTO',
              s3Key: 'evidence/placard-second-look.jpg',
              intent: EvidenceIntent.HANDICAPPED_PLACARD,
            },
          ],
        },
        'test-user'
      );

      const obs2Id = result2.observationId;

      // Derive and evaluate
      const obs2 = await observationService.getById(obs2Id);
      if (obs2 && obs2.parkingPositionId) {
        const position = await parkingPositionService.getById(obs2.parkingPositionId);
        await violationService.deriveFromObservation(obs2, position, 'test-user');
      }

      await handicappedService.evaluateHandicappedCompliance(context.vehicleIds.abc123, obs2Id);

      // Verify original observation is unchanged
      const originalObs = await observationService.getById(obs1Id);
      expect(originalObs).toBeDefined();
      expect(originalObs!.id).toBe(obs1Id);

      // Verify evidence on original observation
      const evidence1 = context.db
        .prepare('SELECT * FROM evidence_items WHERE observation_id = ?')
        .all(obs1Id) as any[];
      expect(evidence1).toHaveLength(1);
      expect(evidence1[0].note_text).toBe('Original observation - no placard');

      // Verify evidence on second observation
      const evidence2 = context.db
        .prepare('SELECT * FROM evidence_items WHERE observation_id = ?')
        .all(obs2Id) as any[];
      expect(evidence2).toHaveLength(1);
      expect(evidence2[0].intent).toBe(EvidenceIntent.HANDICAPPED_PLACARD);
    });

    it('should track enforcement decisions through violation events', async () => {
      // Create violation
      const result1 = await observationService.submit(
        {
          observedAt: new Date().toISOString(),
          siteId: context.siteId,
          idempotencyKey: 'event-tracking-1',
          licensePlate: 'DEF456',
          issuingState: 'OR',
          parkingPositionId: context.positionIds.h2,
          evidence: [
            {
              type: 'TEXT_NOTE',
              noteText: 'Initial violation',
            },
          ],
        },
        'test-user'
      );

      const obs1Id = result1.observationId;

      // Derive violation
      const obs1 = await observationService.getById(obs1Id);
      if (obs1 && obs1.parkingPositionId) {
        const position = await parkingPositionService.getById(obs1.parkingPositionId);
        await violationService.deriveFromObservation(obs1, position, 'test-user');
      }

      // Get violation
      let violations = await violationService.getByVehicle(context.vehicleIds.def456);
      let violation = violations.find((v) => v.parkingPositionId === context.positionIds.h2);

      expect(violation).toBeDefined();
      const violationId = violation!.id;

      // Add placard evidence
      const result2 = await observationService.submit(
        {
          observedAt: new Date().toISOString(),
          siteId: context.siteId,
          idempotencyKey: 'event-tracking-2',
          licensePlate: 'DEF456',
          issuingState: 'OR',
          parkingPositionId: context.positionIds.h2,
          evidence: [
            {
              type: 'PHOTO',
              s3Key: 'evidence/placard-found-later.jpg',
              intent: EvidenceIntent.HANDICAPPED_PLACARD,
            },
          ],
        },
        'test-user'
      );

      const obs2Id = result2.observationId;

      // Derive and evaluate
      const obs2 = await observationService.getById(obs2Id);
      if (obs2 && obs2.parkingPositionId) {
        const position = await parkingPositionService.getById(obs2.parkingPositionId);
        await violationService.deriveFromObservation(obs2, position, 'test-user');
      }

      await handicappedService.evaluateHandicappedCompliance(context.vehicleIds.def456, obs2Id);

      // Verify events track the resolution
      const events = await violationService.getEvents(violationId);

      const detectedEvent = events.find((e) => e.eventType === 'DETECTED');
      const resolvedEvent = events.find((e) => e.eventType === 'RESOLVED');

      expect(detectedEvent).toBeDefined();
      expect(resolvedEvent).toBeDefined();
      expect(resolvedEvent!.observationId).toBe(obs2Id);
      expect(resolvedEvent!.performedBy).toBe('SYSTEM');
    });

    it('should preserve audit trail when violations are resolved', async () => {
      // Create violation
      const result1 = await observationService.submit(
        {
          observedAt: new Date().toISOString(),
          siteId: context.siteId,
          idempotencyKey: 'audit-trail-1',
          licensePlate: 'XYZ789',
          issuingState: 'WA',
          parkingPositionId: context.positionIds.h2,
          evidence: [
            {
              type: 'TEXT_NOTE',
              noteText: 'Audit trail test',
            },
          ],
        },
        'test-user'
      );

      const obs1Id = result1.observationId;

      // Derive violation
      const obs1 = await observationService.getById(obs1Id);
      if (obs1 && obs1.parkingPositionId) {
        const position = await parkingPositionService.getById(obs1.parkingPositionId);
        await violationService.deriveFromObservation(obs1, position, 'test-user');
      }

      // Get violation
      let violations = await violationService.getByVehicle(context.vehicleIds.xyz789);
      let violation = violations.find((v) => v.parkingPositionId === context.positionIds.h2);

      expect(violation).toBeDefined();
      const violationId = violation!.id;

      // Add placard evidence
      const result2 = await observationService.submit(
        {
          observedAt: new Date().toISOString(),
          siteId: context.siteId,
          idempotencyKey: 'audit-trail-2',
          licensePlate: 'XYZ789',
          issuingState: 'WA',
          parkingPositionId: context.positionIds.h2,
          evidence: [
            {
              type: 'PHOTO',
              s3Key: 'evidence/placard-audit.jpg',
              intent: EvidenceIntent.HANDICAPPED_PLACARD,
            },
          ],
        },
        'test-user'
      );

      const obs2Id = result2.observationId;

      // Derive and evaluate
      const obs2 = await observationService.getById(obs2Id);
      if (obs2 && obs2.parkingPositionId) {
        const position = await parkingPositionService.getById(obs2.parkingPositionId);
        await violationService.deriveFromObservation(obs2, position, 'test-user');
      }

      await handicappedService.evaluateHandicappedCompliance(context.vehicleIds.xyz789, obs2Id);

      // Verify violation still exists but is resolved
      const resolved = await violationService.getById(violationId);
      expect(resolved).toBeDefined();
      expect(resolved!.status).toBe(ViolationStatus.RESOLVED);
      expect(resolved!.resolvedAt).toBeDefined();

      // Verify both observations still exist
      const obs1Final = await observationService.getById(obs1Id);
      const obs2Final = await observationService.getById(obs2Id);

      expect(obs1Final).toBeDefined();
      expect(obs2Final).toBeDefined();

      // Verify all events are preserved
      const events = await violationService.getEvents(violationId);
      expect(events.length).toBeGreaterThanOrEqual(2);
    });

    it('should handle multiple resolutions for same vehicle across different spots', async () => {
      // Create first violation
      const result1 = await observationService.submit(
        {
          observedAt: new Date().toISOString(),
          siteId: context.siteId,
          idempotencyKey: 'multi-resolution-1',
          licensePlate: 'ABC123',
          issuingState: 'CA',
          parkingPositionId: context.positionIds.h1,
          evidence: [
            {
              type: 'TEXT_NOTE',
              noteText: 'H1 violation',
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

      // Add placard evidence for first violation
      const result2 = await observationService.submit(
        {
          observedAt: new Date().toISOString(),
          siteId: context.siteId,
          idempotencyKey: 'multi-resolution-2',
          licensePlate: 'ABC123',
          issuingState: 'CA',
          parkingPositionId: context.positionIds.h1,
          evidence: [
            {
              type: 'PHOTO',
              s3Key: 'evidence/placard-h1.jpg',
              intent: EvidenceIntent.HANDICAPPED_PLACARD,
            },
          ],
        },
        'test-user'
      );

      const obs2Id = result2.observationId;

      // Derive and evaluate first violation
      const obs2 = await observationService.getById(obs2Id);
      if (obs2 && obs2.parkingPositionId) {
        const position = await parkingPositionService.getById(obs2.parkingPositionId);
        await violationService.deriveFromObservation(obs2, position, 'test-user');
      }

      await handicappedService.evaluateHandicappedCompliance(context.vehicleIds.abc123, obs2Id);

      // Create second violation at different spot
      const result3 = await observationService.submit(
        {
          observedAt: new Date().toISOString(),
          siteId: context.siteId,
          idempotencyKey: 'multi-resolution-3',
          licensePlate: 'ABC123',
          issuingState: 'CA',
          parkingPositionId: context.positionIds.h2,
          evidence: [
            {
              type: 'TEXT_NOTE',
              noteText: 'H2 violation',
            },
          ],
        },
        'test-user'
      );

      const obs3Id = result3.observationId;

      // Derive second violation
      const obs3 = await observationService.getById(obs3Id);
      if (obs3 && obs3.parkingPositionId) {
        const position = await parkingPositionService.getById(obs3.parkingPositionId);
        await violationService.deriveFromObservation(obs3, position, 'test-user');
      }

      // Add placard evidence for second violation
      const result4 = await observationService.submit(
        {
          observedAt: new Date().toISOString(),
          siteId: context.siteId,
          idempotencyKey: 'multi-resolution-4',
          licensePlate: 'ABC123',
          issuingState: 'CA',
          parkingPositionId: context.positionIds.h2,
          evidence: [
            {
              type: 'PHOTO',
              s3Key: 'evidence/placard-h2.jpg',
              intent: EvidenceIntent.HANDICAPPED_PLACARD,
            },
          ],
        },
        'test-user'
      );

      const obs4Id = result4.observationId;

      // Derive and evaluate second violation
      const obs4 = await observationService.getById(obs4Id);
      if (obs4 && obs4.parkingPositionId) {
        const position = await parkingPositionService.getById(obs4.parkingPositionId);
        await violationService.deriveFromObservation(obs4, position, 'test-user');
      }

      await handicappedService.evaluateHandicappedCompliance(context.vehicleIds.abc123, obs4Id);

      // Verify both violations are resolved
      const violations = await violationService.getByVehicle(context.vehicleIds.abc123);
      const v1 = violations.find((v) => v.parkingPositionId === context.positionIds.h1);
      const v2 = violations.find((v) => v.parkingPositionId === context.positionIds.h2);

      expect(v1).toBeDefined();
      expect(v2).toBeDefined();
      expect(v1!.status).toBe(ViolationStatus.RESOLVED);
      expect(v2!.status).toBe(ViolationStatus.RESOLVED);
    });
  });
});
