import * as SQLite from 'expo-sqlite';
import type { QueueObservation, QueueEvidence, QueueStatus } from '../types';

const DB_NAME = 'cedar_terrace.db';

let db: SQLite.SQLiteDatabase | null = null;

/**
 * Initialize and open the database
 */
export async function initDatabase(): Promise<void> {
  try {
    db = await SQLite.openDatabaseAsync(DB_NAME);
    await createTables();
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Failed to initialize database:', error);
    throw error;
  }
}

/**
 * Create database tables if they don't exist
 */
async function createTables(): Promise<void> {
  if (!db) throw new Error('Database not initialized');

  // Queue observations table
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS queue_observations (
      id TEXT PRIMARY KEY,
      idempotency_key TEXT NOT NULL UNIQUE,
      site_id TEXT NOT NULL,
      observed_at TEXT NOT NULL,
      license_plate TEXT,
      issuing_state TEXT,
      registration_month INTEGER,
      registration_year INTEGER,
      parking_position_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      error_message TEXT,
      backend_observation_id TEXT,
      created_at TEXT NOT NULL
    );
  `);

  // Queue evidence table
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS queue_evidence (
      id TEXT PRIMARY KEY,
      queue_observation_id TEXT NOT NULL,
      type TEXT NOT NULL,
      intent TEXT,
      note_text TEXT,
      local_photo_uri TEXT,
      s3_key TEXT,
      captured_at TEXT,
      FOREIGN KEY (queue_observation_id) REFERENCES queue_observations(id) ON DELETE CASCADE
    );
  `);

  // Create indexes for performance
  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_queue_observations_status
    ON queue_observations(status);
  `);

  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_queue_evidence_observation_id
    ON queue_evidence(queue_observation_id);
  `);
}

/**
 * Get the database instance
 */
export function getDatabase(): SQLite.SQLiteDatabase {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

/**
 * Insert a new queue observation
 */
export async function insertQueueObservation(
  observation: QueueObservation
): Promise<void> {
  const database = getDatabase();

  await database.runAsync(
    `INSERT INTO queue_observations (
      id, idempotency_key, site_id, observed_at, license_plate,
      issuing_state, registration_month, registration_year,
      parking_position_id, status, error_message,
      backend_observation_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      observation.id,
      observation.idempotencyKey,
      observation.siteId,
      observation.observedAt,
      observation.licensePlate || null,
      observation.issuingState || null,
      observation.registrationMonth || null,
      observation.registrationYear || null,
      observation.parkingPositionId || null,
      observation.status,
      observation.errorMessage || null,
      observation.backendObservationId || null,
      observation.createdAt,
    ]
  );
}

/**
 * Insert queue evidence items
 */
export async function insertQueueEvidence(
  evidence: QueueEvidence[]
): Promise<void> {
  const database = getDatabase();

  for (const item of evidence) {
    await database.runAsync(
      `INSERT INTO queue_evidence (
        id, queue_observation_id, type, intent, note_text,
        local_photo_uri, s3_key, captured_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id,
        item.queueObservationId,
        item.type,
        item.intent || null,
        item.noteText || null,
        item.localPhotoUri || null,
        item.s3Key || null,
        item.capturedAt || null,
      ]
    );
  }
}

/**
 * Get all queue observations
 */
export async function getAllQueueObservations(): Promise<QueueObservation[]> {
  const database = getDatabase();

  const rows = await database.getAllAsync<QueueObservation>(
    'SELECT * FROM queue_observations ORDER BY created_at DESC'
  );

  return rows.map(mapRowToObservation);
}

/**
 * Get queue observations by status
 */
export async function getQueueObservationsByStatus(
  status: QueueStatus
): Promise<QueueObservation[]> {
  const database = getDatabase();

  const rows = await database.getAllAsync<QueueObservation>(
    'SELECT * FROM queue_observations WHERE status = ? ORDER BY created_at ASC',
    [status]
  );

  return rows.map(mapRowToObservation);
}

/**
 * Get pending or failed observations for sync
 */
export async function getPendingObservations(): Promise<QueueObservation[]> {
  const database = getDatabase();

  const rows = await database.getAllAsync<QueueObservation>(
    `SELECT * FROM queue_observations
     WHERE status IN ('pending', 'failed')
     ORDER BY created_at ASC`
  );

  return rows.map(mapRowToObservation);
}

/**
 * Get evidence for a queue observation
 */
export async function getQueueEvidence(
  queueObservationId: string
): Promise<QueueEvidence[]> {
  const database = getDatabase();

  const rows = await database.getAllAsync<QueueEvidence>(
    'SELECT * FROM queue_evidence WHERE queue_observation_id = ?',
    [queueObservationId]
  );

  return rows.map(mapRowToEvidence);
}

/**
 * Update queue observation status
 */
export async function updateObservationStatus(
  id: string,
  status: QueueStatus,
  errorMessage?: string
): Promise<void> {
  const database = getDatabase();

  await database.runAsync(
    'UPDATE queue_observations SET status = ?, error_message = ? WHERE id = ?',
    [status, errorMessage || null, id]
  );
}

/**
 * Update backend observation ID after successful submission
 */
export async function updateBackendObservationId(
  id: string,
  backendObservationId: string
): Promise<void> {
  const database = getDatabase();

  await database.runAsync(
    'UPDATE queue_observations SET backend_observation_id = ? WHERE id = ?',
    [backendObservationId, id]
  );
}

/**
 * Update evidence s3Key after upload
 */
export async function updateEvidenceS3Key(
  id: string,
  s3Key: string
): Promise<void> {
  const database = getDatabase();

  await database.runAsync(
    'UPDATE queue_evidence SET s3_key = ? WHERE id = ?',
    [s3Key, id]
  );
}

/**
 * Delete a queue observation and its evidence
 */
export async function deleteQueueObservation(id: string): Promise<void> {
  const database = getDatabase();

  // Evidence will be deleted automatically due to CASCADE
  await database.runAsync(
    'DELETE FROM queue_observations WHERE id = ?',
    [id]
  );
}

/**
 * Delete all submitted observations (cleanup)
 */
export async function deleteSubmittedObservations(): Promise<number> {
  const database = getDatabase();

  const result = await database.runAsync(
    'DELETE FROM queue_observations WHERE status = ?',
    ['submitted']
  );

  return result.changes;
}

/**
 * Clear all data (for testing/debugging)
 */
export async function clearAllData(): Promise<void> {
  const database = getDatabase();

  await database.execAsync(`
    DELETE FROM queue_evidence;
    DELETE FROM queue_observations;
  `);
}

/**
 * Get queue statistics
 */
export async function getQueueStats(): Promise<{
  pending: number;
  uploading: number;
  submitting: number;
  submitted: number;
  failed: number;
  total: number;
}> {
  const database = getDatabase();

  const rows = await database.getAllAsync<{ status: QueueStatus; count: number }>(
    'SELECT status, COUNT(*) as count FROM queue_observations GROUP BY status'
  );

  const stats = {
    pending: 0,
    uploading: 0,
    submitting: 0,
    submitted: 0,
    failed: 0,
    total: 0,
  };

  for (const row of rows) {
    stats[row.status] = row.count;
    stats.total += row.count;
  }

  return stats;
}

/**
 * Helper: Map database row to QueueObservation
 */
function mapRowToObservation(row: any): QueueObservation {
  return {
    id: row.id,
    idempotencyKey: row.idempotency_key,
    siteId: row.site_id,
    observedAt: row.observed_at,
    licensePlate: row.license_plate || undefined,
    issuingState: row.issuing_state || undefined,
    registrationMonth: row.registration_month || undefined,
    registrationYear: row.registration_year || undefined,
    parkingPositionId: row.parking_position_id || undefined,
    status: row.status,
    errorMessage: row.error_message || undefined,
    backendObservationId: row.backend_observation_id || undefined,
    createdAt: row.created_at,
  };
}

/**
 * Helper: Map database row to QueueEvidence
 */
function mapRowToEvidence(row: any): QueueEvidence {
  return {
    id: row.id,
    queueObservationId: row.queue_observation_id,
    type: row.type,
    intent: row.intent || undefined,
    noteText: row.note_text || undefined,
    localPhotoUri: row.local_photo_uri || undefined,
    s3Key: row.s3_key || undefined,
    capturedAt: row.captured_at || undefined,
  };
}
