import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Integration test helpers for database setup and teardown
 */

export interface TestContext {
  db: Database.Database;
  siteId: string;
  lotImageId: string;
  vehicleIds: {
    abc123: string;
    xyz789: string;
    def456: string;
  };
  positionIds: {
    h1: string;
    h2: string;
    open3: string;
    open4: string;
    p5: string;
    p6: string;
    open7: string;
    open8: string;
    r9: string;
    p10: string;
    p11: string;
    open12: string;
  };
}

/**
 * Set up test database with seed data
 */
export function setupTestDatabase(): TestContext {
  // Create in-memory database
  const db = new Database(':memory:');

  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  // Run migration to create schema
  const migrationSql = readFileSync(
    join(__dirname, '../db/migrations/001_initial_schema.sql'),
    'utf-8'
  );
  db.exec(migrationSql);

  // Create test site
  const siteId = uuidv4();
  db.prepare(
    `INSERT INTO sites (id, name, address, timezone, is_active)
     VALUES (?, ?, ?, ?, ?)`
  ).run(siteId, 'Test Site', '123 Test St', 'America/Los_Angeles', 1);

  // Create lot image
  const lotImageId = uuidv4();
  db.prepare(
    `INSERT INTO lot_images (id, site_id, s3_key, width, height, is_active)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(lotImageId, siteId, 'test-lot.png', 1200, 800, 1);

  // Create parking positions
  const positions = [
    { x: 150, y: 200, type: 'HANDICAPPED', identifier: 'H1', key: 'h1' },
    { x: 300, y: 200, type: 'HANDICAPPED', identifier: 'H2', key: 'h2' },
    { x: 450, y: 200, type: 'OPEN', identifier: '3', key: 'open3' },
    { x: 600, y: 200, type: 'OPEN', identifier: '4', key: 'open4' },
    { x: 750, y: 200, type: 'PURCHASED', identifier: 'P5', key: 'p5' },
    { x: 900, y: 200, type: 'PURCHASED', identifier: 'P6', key: 'p6' },
    { x: 150, y: 600, type: 'OPEN', identifier: '7', key: 'open7' },
    { x: 300, y: 600, type: 'OPEN', identifier: '8', key: 'open8' },
    { x: 450, y: 600, type: 'RESERVED', identifier: 'R9', key: 'r9' },
    { x: 600, y: 600, type: 'PURCHASED', identifier: 'P10', key: 'p10' },
    { x: 750, y: 600, type: 'PURCHASED', identifier: 'P11', key: 'p11' },
    { x: 900, y: 600, type: 'OPEN', identifier: '12', key: 'open12' },
  ];

  const positionIds: any = {};
  const insertPosition = db.prepare(
    `INSERT INTO parking_positions
     (id, site_id, lot_image_id, type, center_x, center_y, radius, identifier)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );

  for (const pos of positions) {
    const id = uuidv4();
    insertPosition.run(id, siteId, lotImageId, pos.type, pos.x, pos.y, 60, pos.identifier);
    positionIds[pos.key] = id;
  }

  // Create test vehicles
  const vehicleIds: any = {};

  const abc123Id = uuidv4();
  db.prepare(
    `INSERT INTO vehicles (id, license_plate, issuing_state, make, model, color, last_observed_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
  ).run(abc123Id, 'ABC123', 'CA', 'Toyota', 'Camry', 'Blue');
  vehicleIds.abc123 = abc123Id;

  const xyz789Id = uuidv4();
  db.prepare(
    `INSERT INTO vehicles (id, license_plate, issuing_state, make, model, color, last_observed_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
  ).run(xyz789Id, 'XYZ789', 'WA', 'Honda', 'Civic', 'Red');
  vehicleIds.xyz789 = xyz789Id;

  const def456Id = uuidv4();
  db.prepare(
    `INSERT INTO vehicles (id, license_plate, issuing_state, make, model, color, last_observed_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
  ).run(def456Id, 'DEF456', 'OR', 'Ford', 'F150', 'Black');
  vehicleIds.def456 = def456Id;

  return {
    db,
    siteId,
    lotImageId,
    vehicleIds,
    positionIds,
  };
}

/**
 * Clean up test database
 */
export function teardownTestDatabase(context: TestContext): void {
  context.db.close();
}

/**
 * Wait for a condition to be true (with timeout)
 */
export async function waitForCondition(
  condition: () => Promise<boolean>,
  timeoutMs = 5000,
  intervalMs = 100
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    if (await condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`Condition not met within ${timeoutMs}ms`);
}

/**
 * Helper to submit observation with siteId from context
 */
export function createObservationRequest(context: TestContext, request: any) {
  return {
    ...request,
    siteId: context.siteId,
  };
}
