import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ParkingPositionService } from './parking-position';
import { ParkingPositionType } from '@cedar-terrace/shared';

describe('ParkingPositionService', () => {
  let db: Database.Database;
  let service: ParkingPositionService;

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
    service = new ParkingPositionService(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('create', () => {
    it('should create a new parking position', () => {
      // Create test site and lot image first
      db.prepare(
        'INSERT INTO sites (id, name, address) VALUES (?, ?, ?)'
      ).run('site-1', 'Test Site', '123 Test St');

      db.prepare(
        'INSERT INTO lot_images (id, site_id, s3_key, width, height) VALUES (?, ?, ?, ?, ?)'
      ).run('lot-1', 'site-1', 'test.jpg', 1000, 1000);

      const request = {
        siteId: 'site-1',
        lotImageId: 'lot-1',
        type: ParkingPositionType.OPEN,
        centerX: 100,
        centerY: 200,
        radius: 50,
      };

      const result = service.create(request);

      expect(result.id).toBeDefined();
      expect(result.type).toBe(ParkingPositionType.OPEN);
      expect(result.centerX).toBe(100);
      expect(result.centerY).toBe(200);
      expect(result.radius).toBe(50);
      expect(result.siteId).toBe('site-1');
      expect(result.lotImageId).toBe('lot-1');

      // Verify in database
      const dbRow = db.prepare('SELECT * FROM parking_positions WHERE id = ?').get(result.id);
      expect(dbRow).toBeDefined();
    });
  });

  describe('isVehicleAuthorized', () => {
    it('should return true for OPEN positions', () => {
      const position: any = {
        type: ParkingPositionType.OPEN,
      };

      expect(service.isVehicleAuthorized(position, 'any-vehicle')).toBe(true);
      expect(service.isVehicleAuthorized(position, null)).toBe(true);
    });

    it('should check vehicle assignment for PURCHASED positions', () => {
      const position: any = {
        type: ParkingPositionType.PURCHASED,
        assignedVehicleId: 'vehicle-1',
      };

      expect(service.isVehicleAuthorized(position, 'vehicle-1')).toBe(true);
      expect(service.isVehicleAuthorized(position, 'vehicle-2')).toBe(false);
      expect(service.isVehicleAuthorized(position, null)).toBe(false);
    });

    it('should return false for HANDICAPPED positions (requires evidence)', () => {
      const position: any = {
        type: ParkingPositionType.HANDICAPPED,
      };

      expect(service.isVehicleAuthorized(position, 'any-vehicle')).toBe(false);
    });
  });

  describe('findPositionAtPoint', () => {
    it('should find position containing the point', () => {
      // Create test site, lot image, and parking position
      db.prepare(
        'INSERT INTO sites (id, name, address) VALUES (?, ?, ?)'
      ).run('site-1', 'Test Site', '123 Test St');

      db.prepare(
        'INSERT INTO lot_images (id, site_id, s3_key, width, height) VALUES (?, ?, ?, ?, ?)'
      ).run('lot-1', 'site-1', 'test.jpg', 1000, 1000);

      db.prepare(
        `INSERT INTO parking_positions (id, site_id, lot_image_id, type, center_x, center_y, radius)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run('pos-1', 'site-1', 'lot-1', 'OPEN', 100, 100, 50);

      const result = service.findPositionAtPoint('lot-1', 110, 110);

      expect(result).not.toBeNull();
      expect(result!.id).toBe('pos-1');
      expect(result!.centerX).toBe(100);
      expect(result!.centerY).toBe(100);
      expect(result!.radius).toBe(50);
    });

    it('should return null if no position contains the point', () => {
      // Create test site and lot image without positions
      db.prepare(
        'INSERT INTO sites (id, name, address) VALUES (?, ?, ?)'
      ).run('site-1', 'Test Site', '123 Test St');

      db.prepare(
        'INSERT INTO lot_images (id, site_id, s3_key, width, height) VALUES (?, ?, ?, ?, ?)'
      ).run('lot-1', 'site-1', 'test.jpg', 1000, 1000);

      const result = service.findPositionAtPoint('lot-1', 999, 999);

      expect(result).toBeNull();
    });
  });

  describe('softDelete', () => {
    it('should soft delete a position', () => {
      // Create test site, lot image, and parking position
      db.prepare(
        'INSERT INTO sites (id, name, address) VALUES (?, ?, ?)'
      ).run('site-1', 'Test Site', '123 Test St');

      db.prepare(
        'INSERT INTO lot_images (id, site_id, s3_key, width, height) VALUES (?, ?, ?, ?, ?)'
      ).run('lot-1', 'site-1', 'test.jpg', 1000, 1000);

      db.prepare(
        `INSERT INTO parking_positions (id, site_id, lot_image_id, type, center_x, center_y, radius)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run('pos-1', 'site-1', 'lot-1', 'OPEN', 100, 100, 50);

      service.softDelete('pos-1');

      // Verify soft delete
      const row = db.prepare('SELECT deleted_at FROM parking_positions WHERE id = ?').get('pos-1') as any;
      expect(row.deleted_at).not.toBeNull();

      // Verify excluded from normal queries
      const result = db.prepare(
        'SELECT * FROM parking_positions WHERE id = ? AND deleted_at IS NULL'
      ).get('pos-1');
      expect(result).toBeUndefined();
    });

    it('should throw error if position not found', () => {
      expect(() => service.softDelete('invalid-id')).toThrow(
        'Parking position not found'
      );
    });
  });
});
