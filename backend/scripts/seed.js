const { seed } = require('../dist/db/seed');

try {
  seed();
  console.log('\nSeed completed successfully');
  process.exit(0);
} catch (err) {
  console.error('Seed failed:', err);
  process.exit(1);
}
