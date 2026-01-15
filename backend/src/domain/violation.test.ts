import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ViolationService } from './violation';
import {
  ViolationCategory,
  ViolationStatus,
  ViolationEventType,
  ParkingPositionType,
} from '@cedar-terrace/shared';

describe('ViolationService', () => {
  let db: Database.Database;
  let service: ViolationService;

  beforeEach(() => {
    // Create in-memory database
    db = new Database(':memory:');

    // Run migration to create schema
    const migrationSql = readFileSync(
      join(__dirname, '../db/migrations/001_initial_schema.sql'),
      'utf-8'
    );
    db.exec(migrationSql);

    // Initialize service
    service = new ViolationService(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('addEvent', () => {
    it('should add event and update violation status', () => {
      // Create test data
      db.prepare('INSERT INTO sites (id, name, address) VALUES (?, ?, ?)').run(
        'site-1',
        'Test Site',
        '123 Test St'
      );
      db.prepare('INSERT INTO vehicles (id, license_plate, issuing_state, last_observed_at) VALUES (?, ?, ?, ?)').run(
        'vehicle-1',
        'ABC123',
        'CA',
        new Date().toISOString()
      );
      db.prepare(
        `INSERT INTO violations (id, site_id, vehicle_id, category, status, detected_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        'violation-1',
        'site-1',
        'vehicle-1',
        ViolationCategory.FIRE_LANE,
        ViolationStatus.DETECTED,
        new Date().toISOString()
      );

      const result = service.addEvent('violation-1', ViolationEventType.NOTICE_ISSUED, {
        noticeId: 'notice-1',
        performedBy: 'ADMIN',
      });

      expect(result.id).toBeDefined();
      expect(result.eventType).toBe(ViolationEventType.NOTICE_ISSUED);
      expect(result.violationId).toBe('violation-1');
      expect(result.noticeId).toBe('notice-1');

      // Verify violation status updated
      const violation = db.prepare('SELECT status FROM violations WHERE id = ?').get('violation-1') as any;
      expect(violation.status).toBe(ViolationStatus.NOTICE_ISSUED);

      // Verify event in database
      const event = db.prepare('SELECT * FROM violation_events WHERE id = ?').get(result.id);
      expect(event).toBeDefined();
    });

    it('should handle RESOLVED event and set resolved_at', () => {
      // Create test data
      db.prepare('INSERT INTO sites (id, name, address) VALUES (?, ?, ?)').run(
        'site-1',
        'Test Site',
        '123 Test St'
      );
      db.prepare('INSERT INTO vehicles (id, license_plate, issuing_state, last_observed_at) VALUES (?, ?, ?, ?)').run(
        'vehicle-1',
        'ABC123',
        'CA',
        new Date().toISOString()
      );
      db.prepare(
        `INSERT INTO violations (id, site_id, vehicle_id, category, status, detected_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        'violation-1',
        'site-1',
        'vehicle-1',
        ViolationCategory.FIRE_LANE,
        ViolationStatus.NOTICE_ISSUED,
        new Date().toISOString()
      );

      service.addEvent('violation-1', ViolationEventType.RESOLVED, {
        notes: 'Fixed',
        performedBy: 'ADMIN',
      });

      // Verify resolved_at was set
      const violation = db.prepare('SELECT resolved_at, status FROM violations WHERE id = ?').get('violation-1') as any;
      expect(violation.resolved_at).not.toBeNull();
      expect(violation.status).toBe(ViolationStatus.RESOLVED);
    });
  });

  describe('deriveFromObservation - unauthorized stall', () => {
    it('should create violation for unauthorized vehicle in purchased stall', () => {
      // Create test data
      db.prepare('INSERT INTO sites (id, name, address) VALUES (?, ?, ?)').run(
        'site-1',
        'Test Site',
        '123 Test St'
      );
      db.prepare('INSERT INTO vehicles (id, license_plate, issuing_state, last_observed_at) VALUES (?, ?, ?, ?)').run(
        'vehicle-1',
        'ABC123',
        'CA',
        new Date().toISOString()
      );
      db.prepare('INSERT INTO vehicles (id, license_plate, issuing_state, last_observed_at) VALUES (?, ?, ?, ?)').run(
        'vehicle-2',
        'XYZ789',
        'CA',
        new Date().toISOString()
      );
      db.prepare('INSERT INTO lot_images (id, site_id, s3_key, width, height) VALUES (?, ?, ?, ?, ?)').run(
        'lot-1',
        'site-1',
        'test.jpg',
        1000,
        1000
      );
      // Create parking position
      db.prepare(
        `INSERT INTO parking_positions (id, site_id, lot_image_id, type, center_x, center_y, radius, assigned_vehicle_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run('pos-1', 'site-1', 'lot-1', 'PURCHASED', 100, 100, 50, 'vehicle-2');

      const observedAt = new Date().toISOString();
      // Create observation in database
      db.prepare(
        `INSERT INTO observations (id, site_id, vehicle_id, parking_position_id, observed_at,
         license_plate, issuing_state, idempotency_key, submitted_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run('obs-1', 'site-1', 'vehicle-1', 'pos-1', observedAt, 'ABC123', 'CA', 'idem-1', 'ADMIN');

      const observation: any = {
        id: 'obs-1',
        siteId: 'site-1',
        vehicleId: 'vehicle-1',
        parkingPositionId: 'pos-1',
        observedAt: observedAt,
      };

      const position: any = {
        id: 'pos-1',
        type: ParkingPositionType.PURCHASED,
        assignedVehicleId: 'vehicle-2', // Different vehicle
      };

      const violationIds = service.deriveFromObservation(
        observation,
        position,
        'ADMIN'
      );

      expect(violationIds.length).toBeGreaterThan(0);

      // Verify violation was created
      const violation = db.prepare(
        'SELECT * FROM violations WHERE id = ? AND category = ?'
      ).get(violationIds[0], ViolationCategory.UNAUTHORIZED_STALL) as any;
      expect(violation).toBeDefined();
      expect(violation.vehicle_id).toBe('vehicle-1');
      expect(violation.parking_position_id).toBe('pos-1');
    });

    it('should not create violation for authorized vehicle', () => {
      // Create test data
      db.prepare('INSERT INTO sites (id, name, address) VALUES (?, ?, ?)').run(
        'site-1',
        'Test Site',
        '123 Test St'
      );
      db.prepare('INSERT INTO vehicles (id, license_plate, issuing_state, last_observed_at) VALUES (?, ?, ?, ?)').run(
        'vehicle-1',
        'ABC123',
        'CA',
        new Date().toISOString()
      );

      const observation: any = {
        id: 'obs-1',
        siteId: 'site-1',
        vehicleId: 'vehicle-1',
        parkingPositionId: 'pos-1',
        observedAt: new Date().toISOString(),
      };

      const position: any = {
        id: 'pos-1',
        type: ParkingPositionType.PURCHASED,
        assignedVehicleId: 'vehicle-1', // Same vehicle
      };

      const violationIds = service.deriveFromObservation(
        observation,
        position,
        'ADMIN'
      );

      expect(violationIds).toEqual([]);
    });

    it('should add observation to existing violation', () => {
      // Create test data
      db.prepare('INSERT INTO sites (id, name, address) VALUES (?, ?, ?)').run(
        'site-1',
        'Test Site',
        '123 Test St'
      );
      db.prepare('INSERT INTO vehicles (id, license_plate, issuing_state, last_observed_at) VALUES (?, ?, ?, ?)').run(
        'vehicle-1',
        'ABC123',
        'CA',
        new Date().toISOString()
      );
      db.prepare('INSERT INTO vehicles (id, license_plate, issuing_state, last_observed_at) VALUES (?, ?, ?, ?)').run(
        'vehicle-2',
        'XYZ789',
        'CA',
        new Date().toISOString()
      );
      db.prepare('INSERT INTO lot_images (id, site_id, s3_key, width, height) VALUES (?, ?, ?, ?, ?)').run(
        'lot-1',
        'site-1',
        'test.jpg',
        1000,
        1000
      );
      // Create parking position
      db.prepare(
        `INSERT INTO parking_positions (id, site_id, lot_image_id, type, center_x, center_y, radius, assigned_vehicle_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run('pos-1', 'site-1', 'lot-1', 'PURCHASED', 100, 100, 50, 'vehicle-2');

      // Create existing violation
      db.prepare(
        `INSERT INTO violations (id, site_id, vehicle_id, parking_position_id, category, status, detected_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        'existing-violation',
        'site-1',
        'vehicle-1',
        'pos-1',
        ViolationCategory.UNAUTHORIZED_STALL,
        ViolationStatus.DETECTED,
        new Date().toISOString()
      );

      const observedAt = new Date().toISOString();
      // Create observation in database
      db.prepare(
        `INSERT INTO observations (id, site_id, vehicle_id, parking_position_id, observed_at,
         license_plate, issuing_state, idempotency_key, submitted_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run('obs-2', 'site-1', 'vehicle-1', 'pos-1', observedAt, 'ABC123', 'CA', 'idem-2', 'ADMIN');

      const observation: any = {
        id: 'obs-2',
        siteId: 'site-1',
        vehicleId: 'vehicle-1',
        parkingPositionId: 'pos-1',
        observedAt: observedAt,
      };

      const position: any = {
        id: 'pos-1',
        type: ParkingPositionType.PURCHASED,
        assignedVehicleId: 'vehicle-2',
      };

      const violationIds = service.deriveFromObservation(
        observation,
        position,
        'ADMIN'
      );

      expect(violationIds).toContain('existing-violation');

      // Verify OBSERVATION_ADDED event was created
      const events = db.prepare(
        'SELECT * FROM violation_events WHERE violation_id = ? AND event_type = ?'
      ).all('existing-violation', ViolationEventType.OBSERVATION_ADDED);
      expect(events.length).toBeGreaterThan(0);
    });
  });

  describe('deriveFromObservation - expired registration', () => {
    it('should create violation for expired registration', () => {
      // Create test data
      db.prepare('INSERT INTO sites (id, name, address) VALUES (?, ?, ?)').run(
        'site-1',
        'Test Site',
        '123 Test St'
      );
      db.prepare('INSERT INTO vehicles (id, license_plate, issuing_state, last_observed_at) VALUES (?, ?, ?, ?)').run(
        'vehicle-1',
        'ABC123',
        'CA',
        new Date().toISOString()
      );

      const observedAt = new Date().toISOString();
      // Create observation in database
      db.prepare(
        `INSERT INTO observations (id, site_id, vehicle_id, observed_at, license_plate, issuing_state,
         registration_year, registration_month, idempotency_key, submitted_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run('obs-1', 'site-1', 'vehicle-1', observedAt, 'ABC123', 'CA', 2020, 1, 'idem-1', 'ADMIN');

      const observation: any = {
        id: 'obs-1',
        siteId: 'site-1',
        vehicleId: 'vehicle-1',
        registrationYear: 2020,
        registrationMonth: 1,
        observedAt: observedAt,
      };

      const violationIds = service.deriveFromObservation(
        observation,
        null,
        'ADMIN'
      );

      expect(violationIds.length).toBeGreaterThan(0);

      // Verify violation was created
      const violation = db.prepare(
        'SELECT * FROM violations WHERE id = ? AND category = ?'
      ).get(violationIds[0], ViolationCategory.EXPIRED_REGISTRATION) as any;
      expect(violation).toBeDefined();
      expect(violation.vehicle_id).toBe('vehicle-1');
    });

    it('should not create violation for current registration', () => {
      // Create test data
      db.prepare('INSERT INTO sites (id, name, address) VALUES (?, ?, ?)').run(
        'site-1',
        'Test Site',
        '123 Test St'
      );
      db.prepare('INSERT INTO vehicles (id, license_plate, issuing_state, last_observed_at) VALUES (?, ?, ?, ?)').run(
        'vehicle-1',
        'ABC123',
        'CA',
        new Date().toISOString()
      );

      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);

      const observation: any = {
        id: 'obs-1',
        siteId: 'site-1',
        vehicleId: 'vehicle-1',
        registrationYear: futureDate.getFullYear(),
        registrationMonth: futureDate.getMonth() + 1,
        observedAt: new Date().toISOString(),
      };

      const violationIds = service.deriveFromObservation(
        observation,
        null,
        'ADMIN'
      );

      expect(violationIds).toEqual([]);
    });
  });

  describe('evaluateTimelines', () => {
    it('should transition violations based on timeline rules', () => {
      // Create test data
      db.prepare('INSERT INTO sites (id, name, address) VALUES (?, ?, ?)').run(
        'site-1',
        'Test Site',
        '123 Test St'
      );
      db.prepare('INSERT INTO vehicles (id, license_plate, issuing_state, last_observed_at) VALUES (?, ?, ?, ?)').run(
        'vehicle-1',
        'ABC123',
        'CA',
        new Date().toISOString()
      );

      // Create a violation that's old enough to be eligible for notice
      // FIRE_LANE has noticeEligibleAfterHours: 0, so any old violation should transition
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      db.prepare(
        `INSERT INTO violations (id, site_id, vehicle_id, category, status, detected_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        'violation-1',
        'site-1',
        'vehicle-1',
        ViolationCategory.FIRE_LANE,
        ViolationStatus.DETECTED,
        twoHoursAgo
      );

      const count = service.evaluateTimelines();

      expect(count).toBeGreaterThan(0);

      // Verify status was updated
      const violation = db.prepare('SELECT status FROM violations WHERE id = ?').get('violation-1') as any;
      expect(violation.status).toBe(ViolationStatus.NOTICE_ELIGIBLE);

      // Verify event was created
      const events = db.prepare(
        'SELECT * FROM violation_events WHERE violation_id = ? AND event_type = ?'
      ).all('violation-1', ViolationEventType.NOTICE_ELIGIBLE);
      expect(events.length).toBeGreaterThan(0);
    });
  });
});
