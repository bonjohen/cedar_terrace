import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from './connection';

interface SeedData {
  siteId: string;
  lotImageId: string;
}

/**
 * Seed the database with test data
 * Creates a test site, lot image, and parking positions
 */
function seed(): SeedData {
  const db = getDatabase();

  const transaction = db.transaction(() => {
    console.log('Seeding database with test data...');

    // Create test site
    const siteId = uuidv4();
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO sites (id, name, address, timezone, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      siteId,
      'Cedar Terrace Test Site',
      '123 Main St, Test City, TS 12345',
      'America/Los_Angeles',
      1,
      now,
      now
    );
    console.log(`Created site: ${siteId}`);

    // Create lot image record
    // For testing, we'll use a placeholder image reference
    // In production, this would be uploaded to S3
    const lotImageId = uuidv4();
    db.prepare(
      `INSERT INTO lot_images (id, site_id, s3_key, width, height, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      lotImageId,
      siteId,
      'test-lot-images/parking-lot-test.png',
      1200,
      800,
      1,
      now,
      now
    );
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
    const insertPosition = db.prepare(
      `INSERT INTO parking_positions
       (id, site_id, lot_image_id, type, center_x, center_y, radius, identifier, rental_info, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    for (const pos of positions) {
      insertPosition.run(
        uuidv4(),
        siteId,
        lotImageId,
        pos.type,
        pos.x,
        pos.y,
        60,
        pos.identifier,
        pos.info,
        now,
        now
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

    const insertVehicle = db.prepare(
      `INSERT INTO vehicles (id, license_plate, issuing_state, make, model, color, last_observed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    for (const vehicle of vehicles) {
      insertVehicle.run(
        uuidv4(),
        vehicle.plate,
        vehicle.state,
        vehicle.make,
        vehicle.model,
        vehicle.color,
        now,
        now,
        now
      );
    }
    console.log(`Created ${vehicles.length} test vehicles`);

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
  });

  return transaction();
}

/**
 * Clear all data (for testing)
 */
function clear(): void {
  const db = getDatabase();

  console.log('Clearing database...');

  // Delete in reverse dependency order
  db.prepare('DELETE FROM recipient_access_logs').run();
  db.prepare('DELETE FROM recipient_accounts').run();
  db.prepare('DELETE FROM notices').run();
  db.prepare('DELETE FROM violation_events').run();
  db.prepare('DELETE FROM violations').run();
  db.prepare('DELETE FROM evidence_items').run();
  db.prepare('DELETE FROM observations').run();
  db.prepare('DELETE FROM vehicles').run();
  db.prepare('DELETE FROM parking_positions').run();
  db.prepare('DELETE FROM lot_images').run();
  db.prepare('DELETE FROM sites').run();

  console.log('Database cleared successfully!');
}

// Run seed if called directly
if (require.main === module) {
  const command = process.argv[2];

  if (command === 'clear') {
    try {
      clear();
      process.exit(0);
    } catch (err) {
      console.error(err);
      process.exit(1);
    }
  } else {
    try {
      seed();
      process.exit(0);
    } catch (err) {
      console.error(err);
      process.exit(1);
    }
  }
}

export { seed, clear };
