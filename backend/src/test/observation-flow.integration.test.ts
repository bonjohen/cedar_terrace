/**
 * Integration tests for observation submission flow
 * Tests: observation creation, violation derivation, evidence attachment, idempotency
 */

import { ObservationService } from '../domain/observation';
import { ViolationService } from '../domain/violation';
import { ParkingPositionService } from '../domain/parking-position';
import { setupTestDatabase, teardownTestDatabase, TestContext } from './integration-helpers';
import { ViolationCategory, ViolationStatus } from '@cedar-terrace/shared';

describe('Observation Flow Integration Tests', () => {
  let context: TestContext;
  let observationService: ObservationService;
  let violationService: ViolationService;
  let parkingPositionService: ParkingPositionService;

  beforeAll(() => {
    context = setupTestDatabase();
    observationService = new ObservationService(context.db);
    violationService = new ViolationService(context.db);
    parkingPositionService = new ParkingPositionService(context.db);
  });

  afterAll(() => {
    teardownTestDatabase(context);
  });

  describe('Observation submission with violation derivation', () => {
    it('should create observation and derive violation for unauthorized parking', async () => {
      // Submit observation: vehicle in handicapped spot without placard
      const result = await observationService.submit(
        {
          observedAt: new Date().toISOString(),
          siteId: context.siteId,
          idempotencyKey: 'test-obs-1',
          licensePlate: 'ABC123',
          issuingState: 'CA',
          parkingPositionId: context.positionIds.h1,
          locationDescription: 'Handicapped spot H1',
          evidence: [
            {
              type: 'TEXT_NOTE',
              noteText: 'Vehicle in handicapped spot, no visible placard',
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

      // Verify observation was created
      expect(observationId).toBeDefined();

      // Check that a violation was derived
      const violations = await violationService.getByVehicle(context.vehicleIds.abc123);
      expect(violations).toHaveLength(1);

      const violation = violations[0];
      expect(violation.vehicleId).toBe(context.vehicleIds.abc123);
      expect(violation.parkingPositionId).toBe(context.positionIds.h1);
      expect(violation.category).toBe(ViolationCategory.HANDICAPPED_NO_PLACARD);
      expect(violation.status).toBe(ViolationStatus.DETECTED);
      expect(violation.detectedAt).toBeDefined();

      // Check that violation event was created
      const events = await violationService.getEvents(violation.id);
      expect(events.length).toBeGreaterThan(0);
      expect(events[0].eventType).toBe('DETECTED');
    });

    it('should create observation for vehicle in purchased spot without violation if authorized', async () => {
      // First, assign vehicle to the purchased spot
      await parkingPositionService.update(context.positionIds.p5, {
        assignedVehicleId: context.vehicleIds.xyz789,
      });

      // Submit observation for authorized vehicle
      const result = await observationService.submit(
        {
          observedAt: new Date().toISOString(),
          siteId: context.siteId,
          idempotencyKey: 'test-obs-2',
          licensePlate: 'XYZ789',
          issuingState: 'WA',
          parkingPositionId: context.positionIds.p5,
          locationDescription: 'Purchased spot P5',
          evidence: [
            {
              type: 'TEXT_NOTE',
              noteText: 'Vehicle in assigned purchased spot',
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

      expect(observationId).toBeDefined();

      // Should NOT create a violation
      const violations = await violationService.getByVehicle(context.vehicleIds.xyz789);
      expect(violations).toHaveLength(0);
    });

    it('should create violation for unauthorized vehicle in purchased spot', async () => {
      const result = await observationService.submit(
        {
          observedAt: new Date().toISOString(),
          siteId: context.siteId,
          idempotencyKey: 'test-obs-3',
          licensePlate: 'DEF456',
          issuingState: 'OR',
          parkingPositionId: context.positionIds.p5,
          locationDescription: 'Unauthorized in purchased spot P5',
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

      expect(observationId).toBeDefined();

      // Should create unauthorized stall violation
      const violations = await violationService.getByVehicle(context.vehicleIds.def456);
      expect(violations).toHaveLength(1);
      expect(violations[0].category).toBe(ViolationCategory.UNAUTHORIZED_STALL);
      expect(violations[0].status).toBe(ViolationStatus.DETECTED);
    });

    it('should NOT create violation for vehicle in open parking spot', async () => {
      const result = await observationService.submit(
        {
          observedAt: new Date().toISOString(),
          siteId: context.siteId,
          idempotencyKey: 'test-obs-4',
          licensePlate: 'ABC123',
          issuingState: 'CA',
          parkingPositionId: context.positionIds.open3,
          locationDescription: 'Open spot 3',
          evidence: [
            {
              type: 'TEXT_NOTE',
              noteText: 'Vehicle parked in open spot',
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

      expect(observationId).toBeDefined();

      // Check violations - should still only have the handicapped violation from earlier test
      const violations = await violationService.getByVehicle(context.vehicleIds.abc123);
      const openSpotViolations = violations.filter(
        (v) => v.parkingPositionId === context.positionIds.open3
      );
      expect(openSpotViolations).toHaveLength(0);
    });
  });

  describe('Idempotency enforcement', () => {
    it('should return same observation ID for duplicate idempotency key', async () => {
      const idempotencyKey = 'idem-key-1';

      // First submission
      const result1 = await observationService.submit(
        {
          observedAt: new Date().toISOString(),
          siteId: context.siteId,
          idempotencyKey,
          licensePlate: 'ABC123',
          issuingState: 'CA',
          parkingPositionId: context.positionIds.open4,
          evidence: [
            {
              type: 'TEXT_NOTE',
              noteText: 'First submission',
            },
          ],
        },
        'test-user'
      );

      const observationId1 = result1.observationId;

      // Derive violations for first submission
      const obs1 = await observationService.getById(observationId1);
      if (obs1 && obs1.parkingPositionId) {
        const position = await parkingPositionService.getById(obs1.parkingPositionId);
        await violationService.deriveFromObservation(obs1, position, 'test-user');
      }

      // Second submission with same key
      const result2 = await observationService.submit(
        {
          observedAt: new Date().toISOString(),
          siteId: context.siteId,
          idempotencyKey,
          licensePlate: 'XYZ789',
          issuingState: 'WA', // Different vehicle
          parkingPositionId: context.positionIds.open7, // Different position
          locationDescription: 'Different location',
          evidence: [
            {
              type: 'TEXT_NOTE',
              noteText: 'Second submission - should be ignored',
            },
          ],
        },
        'test-user'
      );

      const observationId2 = result2.observationId;

      // Should return same observation ID
      expect(observationId1).toBe(observationId2);

      // Verify that the observation has the original data
      const checkResult = context.db
        .prepare('SELECT vehicle_id FROM observations WHERE id = ?')
        .get(observationId1) as any;
      expect(checkResult.vehicle_id).toBe(context.vehicleIds.abc123);
    });
  });

  describe('Evidence attachment', () => {
    it('should attach multiple evidence items to observation', async () => {
      const result = await observationService.submit(
        {
          observedAt: new Date().toISOString(),
          siteId: context.siteId,
          idempotencyKey: 'multi-evidence-1',
          licensePlate: 'ABC123',
          issuingState: 'CA',
          parkingPositionId: context.positionIds.h2,
          evidence: [
            {
              type: 'PHOTO',
              s3Key: 'evidence/photo1.jpg',
              intent: 'PRIMARY_VEHICLE',
            },
            {
              type: 'PHOTO',
              s3Key: 'evidence/photo2.jpg',
              intent: 'SECONDARY_VEHICLE',
            },
            {
              type: 'TEXT_NOTE',
              noteText: 'No visible placard observed',
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

      // Verify evidence items were created
      const evidenceResult = context.db
        .prepare('SELECT * FROM evidence_items WHERE observation_id = ? ORDER BY created_at')
        .all(observationId) as any[];

      expect(evidenceResult).toHaveLength(3);
      expect(evidenceResult[0].type).toBe('PHOTO');
      expect(evidenceResult[1].type).toBe('PHOTO');
      expect(evidenceResult[2].type).toBe('TEXT_NOTE');
      expect(evidenceResult[2].note_text).toBe('No visible placard observed');
    });

    it('should enforce at least one evidence item requirement', () => {
      expect(() =>
        observationService.submit(
          {
            observedAt: new Date().toISOString(),
            siteId: context.siteId,
            idempotencyKey: 'no-evidence-1',
            licensePlate: 'ABC123',
            issuingState: 'CA',
            parkingPositionId: context.positionIds.open3,
            evidence: [],
          },
          'test-user'
        )
      ).toThrow('At least one evidence item is required');
    });
  });

  describe('Multiple observations for same vehicle and position', () => {
    it('should attach multiple observations to existing violation', async () => {
      // First observation
      const result1 = await observationService.submit(
        {
          observedAt: new Date().toISOString(),
          siteId: context.siteId,
          idempotencyKey: 'multi-obs-1',
          licensePlate: 'DEF456',
          issuingState: 'OR',
          parkingPositionId: context.positionIds.h2,
          evidence: [
            {
              type: 'TEXT_NOTE',
              noteText: 'First observation - no placard visible',
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

      // Get the violation
      let violations = await violationService.getByVehicle(context.vehicleIds.def456);
      const h2Violation = violations.find((v) => v.parkingPositionId === context.positionIds.h2);
      expect(h2Violation).toBeDefined();

      // Second observation - should attach to same violation
      const result2 = await observationService.submit(
        {
          observedAt: new Date().toISOString(),
          siteId: context.siteId,
          idempotencyKey: 'multi-obs-2',
          licensePlate: 'DEF456',
          issuingState: 'OR',
          parkingPositionId: context.positionIds.h2,
          evidence: [
            {
              type: 'TEXT_NOTE',
              noteText: 'Second observation - still no placard',
            },
          ],
        },
        'test-user'
      );

      const obs2Id = result2.observationId;

      // Derive violations
      const obs2 = await observationService.getById(obs2Id);
      if (obs2 && obs2.parkingPositionId) {
        const position = await parkingPositionService.getById(obs2.parkingPositionId);
        await violationService.deriveFromObservation(obs2, position, 'test-user');
      }

      // Should still be only one violation
      violations = await violationService.getByVehicle(context.vehicleIds.def456);
      const h2Violations = violations.filter(
        (v) => v.parkingPositionId === context.positionIds.h2
      );
      expect(h2Violations).toHaveLength(1);

      // Verify both observations exist for same vehicle and position
      const obsResult = context.db
        .prepare(
          'SELECT id FROM observations WHERE vehicle_id = ? AND parking_position_id = ? ORDER BY created_at'
        )
        .all(context.vehicleIds.def456, context.positionIds.h2) as any[];
      expect(obsResult.length).toBe(2);
    });
  });
});
