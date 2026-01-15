const { Pool } = require('pg');
const { Migrator } = require('../dist/db/migrator');

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    const migrator = new Migrator(pool);
    await migrator.migrate();
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
