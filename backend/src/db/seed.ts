import { getPool } from './connection';

interface SeedData {
  siteId: string;
  lotImageId: string;
}

/**
 * Seed the database with test data
 * Creates a test site, lot image, and parking positions
 */
async function seed(): Promise<SeedData> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('Seeding database with test data...');

    // Create test site
    const siteResult = await client.query(
      `INSERT INTO sites (name, address, timezone, is_active)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      ['Cedar Terrace Test Site', '123 Main St, Test City, TS 12345', 'America/Los_Angeles', true]
    );
    const siteId = siteResult.rows[0].id;
    console.log(`Created site: ${siteId}`);

    // Create lot image record
    // For testing, we'll use a placeholder image reference
    // In production, this would be uploaded to S3
    const lotImageResult = await client.query(
      `INSERT INTO lot_images (site_id, s3_key, width, height, is_active)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [siteId, 'test-lot-images/parking-lot-test.png', 1200, 800, true]
    );
    const lotImageId = lotImageResult.rows[0].id;
    console.log(`Created lot image: ${lotImageId}`);

    // Create parking positions
    // Layout: 12 total spaces in 2 rows of 6
    // Row 1 (top): Spaces 1-6 (y=200)
    // Row 2 (bottom): Spaces 7-12 (y=600)

    const positions = [
      // Row 1 - Top row
      { x: 150, y: 200, type: 'HANDICAPPED', identifier: 'H1', info: 'Handicapped space 1' },
      { x: 300, y: 200, type: 'HANDICAPPED', identifier: 'H2', info: 'Handicapped space 2' },
      { x: 450, y: 200, type: 'OPEN', identifier: '3', info: 'Open parking' },
      { x: 600, y: 200, type: 'OPEN', identifier: '4', info: 'Open parking' },
      { x: 750, y: 200, type: 'PURCHASED', identifier: 'P5', info: 'Reserved for unit 101' },
      { x: 900, y: 200, type: 'PURCHASED', identifier: 'P6', info: 'Reserved for unit 102' },

      // Row 2 - Bottom row
      { x: 150, y: 600, type: 'OPEN', identifier: '7', info: 'Open parking' },
      { x: 300, y: 600, type: 'OPEN', identifier: '8', info: 'Open parking' },
      { x: 450, y: 600, type: 'RESERVED', identifier: 'R9', info: 'Reserved for management' },
      { x: 600, y: 600, type: 'PURCHASED', identifier: 'P10', info: 'Reserved for unit 103' },
      { x: 750, y: 600, type: 'PURCHASED', identifier: 'P11', info: 'Reserved for unit 104' },
      { x: 900, y: 600, type: 'OPEN', identifier: '12', info: 'Open parking' },
    ];

    let positionCount = 0;
    for (const pos of positions) {
      await client.query(
        `INSERT INTO parking_positions
         (site_id, lot_image_id, type, center_x, center_y, radius, identifier, rental_info)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [siteId, lotImageId, pos.type, pos.x, pos.y, 60, pos.identifier, pos.info]
      );
      positionCount++;
    }
    console.log(`Created ${positionCount} parking positions`);

    // Create a few test vehicles
    const vehicles = [
      { plate: 'ABC123', state: 'CA', make: 'Toyota', model: 'Camry', color: 'Blue' },
      { plate: 'XYZ789', state: 'WA', make: 'Honda', model: 'Civic', color: 'Red' },
      { plate: 'DEF456', state: 'OR', make: 'Ford', model: 'F150', color: 'Black' },
    ];

    for (const vehicle of vehicles) {
      await client.query(
        `INSERT INTO vehicles (license_plate, issuing_state, make, model, color, last_observed_at)
         VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
        [vehicle.plate, vehicle.state, vehicle.make, vehicle.model, vehicle.color]
      );
    }
    console.log(`Created ${vehicles.length} test vehicles`);

    await client.query('COMMIT');
    console.log('Database seeding completed successfully!');
    console.log('\nTest Data Summary:');
    console.log(`Site ID: ${siteId}`);
    console.log(`Lot Image ID: ${lotImageId}`);
    console.log(`Parking Layout:`);
    console.log(`  Row 1 (top):    H1  H2  3   4   P5  P6`);
    console.log(`  Row 2 (bottom): 7   8   R9  P10 P11 12`);
    console.log(`\nPosition Types:`);
    console.log(`  H1, H2: Handicapped`);
    console.log(`  3, 4, 7, 8, 12: Open`);
    console.log(`  P5, P6, P10, P11: Purchased`);
    console.log(`  R9: Reserved`);

    return { siteId, lotImageId };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error seeding database:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Clear all data (for testing)
 */
async function clear(): Promise<void> {
  const pool = getPool();

  console.log('Clearing database...');

  // Delete in reverse dependency order
  await pool.query('DELETE FROM recipient_access_logs');
  await pool.query('DELETE FROM recipient_accounts');
  await pool.query('DELETE FROM notices');
  await pool.query('DELETE FROM violation_events');
  await pool.query('DELETE FROM violations');
  await pool.query('DELETE FROM evidence_items');
  await pool.query('DELETE FROM observations');
  await pool.query('DELETE FROM vehicles');
  await pool.query('DELETE FROM parking_positions');
  await pool.query('DELETE FROM lot_images');
  await pool.query('DELETE FROM sites');

  console.log('Database cleared successfully!');
}

// Run seed if called directly
if (require.main === module) {
  const command = process.argv[2];

  if (command === 'clear') {
    clear()
      .then(() => process.exit(0))
      .catch((err) => {
        console.error(err);
        process.exit(1);
      });
  } else {
    seed()
      .then(() => process.exit(0))
      .catch((err) => {
        console.error(err);
        process.exit(1);
      });
  }
}

export { seed, clear };
