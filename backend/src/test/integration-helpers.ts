import { Pool } from 'pg';
import { getPool, closePool } from '../db/connection';
import { clear } from '../db/seed';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

/**
 * Integration test helpers for database setup and teardown
 */

export interface TestContext {
  pool: Pool;
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
export async function setupTestDatabase(): Promise<TestContext> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Clear existing data
    await clear();

    // Create test site
    const siteResult = await client.query(
      `INSERT INTO sites (name, address, timezone, is_active)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      ['Test Site', '123 Test St', 'America/Los_Angeles', true]
    );
    const siteId = siteResult.rows[0].id;

    // Create lot image
    const lotImageResult = await client.query(
      `INSERT INTO lot_images (site_id, s3_key, width, height, is_active)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [siteId, 'test-lot.png', 1200, 800, true]
    );
    const lotImageId = lotImageResult.rows[0].id;

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
    for (const pos of positions) {
      const result = await client.query(
        `INSERT INTO parking_positions
         (site_id, lot_image_id, type, center_x, center_y, radius, identifier)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [siteId, lotImageId, pos.type, pos.x, pos.y, 60, pos.identifier]
      );
      positionIds[pos.key] = result.rows[0].id;
    }

    // Create test vehicles
    const vehicleIds: any = {};

    const abc123Result = await client.query(
      `INSERT INTO vehicles (license_plate, issuing_state, make, model, color, last_observed_at)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
       RETURNING id`,
      ['ABC123', 'CA', 'Toyota', 'Camry', 'Blue']
    );
    vehicleIds.abc123 = abc123Result.rows[0].id;

    const xyz789Result = await client.query(
      `INSERT INTO vehicles (license_plate, issuing_state, make, model, color, last_observed_at)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
       RETURNING id`,
      ['XYZ789', 'WA', 'Honda', 'Civic', 'Red']
    );
    vehicleIds.xyz789 = xyz789Result.rows[0].id;

    const def456Result = await client.query(
      `INSERT INTO vehicles (license_plate, issuing_state, make, model, color, last_observed_at)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
       RETURNING id`,
      ['DEF456', 'OR', 'Ford', 'F150', 'Black']
    );
    vehicleIds.def456 = def456Result.rows[0].id;

    await client.query('COMMIT');

    return {
      pool,
      siteId,
      lotImageId,
      vehicleIds,
      positionIds,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Clean up test database
 */
export async function teardownTestDatabase(): Promise<void> {
  await clear();
  await closePool();
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
