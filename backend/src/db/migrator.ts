import Database from 'better-sqlite3';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

export class Migrator {
  constructor(private db: Database.Database) {}

  init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version TEXT NOT NULL UNIQUE,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
  }

  getAppliedMigrations(): string[] {
    const stmt = this.db.prepare('SELECT version FROM schema_migrations ORDER BY version');
    const rows = stmt.all() as Array<{ version: string }>;
    return rows.map((row) => row.version);
  }

  applyMigration(version: string, sql: string) {
    const transaction = this.db.transaction(() => {
      this.db.exec(sql);
      const stmt = this.db.prepare('INSERT INTO schema_migrations (version) VALUES (?)');
      stmt.run(version);
      console.log(`Applied migration: ${version}`);
    });

    transaction();
  }

  migrate() {
    this.init();

    const migrationsDir = join(__dirname, 'migrations');
    const migrationFiles = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    const applied = this.getAppliedMigrations();

    for (const file of migrationFiles) {
      const version = file.replace('.sql', '');
      if (applied.includes(version)) {
        console.log(`Skipping already applied migration: ${version}`);
        continue;
      }

      const sql = readFileSync(join(migrationsDir, file), 'utf-8');
      this.applyMigration(version, sql);
    }

    console.log('All migrations applied successfully');
  }
}
