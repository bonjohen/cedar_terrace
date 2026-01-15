const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { Migrator } = require('../dist/db/migrator');

async function main() {
  const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'cedar_terrace.db');

  // Ensure the data directory exists
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');

  try {
    const migrator = new Migrator(db);
    migrator.migrate();
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    db.close();
  }
}

main();
