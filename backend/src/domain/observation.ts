import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import {
  Observation,
  EvidenceItem,
  SubmitObservationRequest,
  SubmitObservationResponse,
  EvidenceIntent,
} from '@cedar-terrace/shared';

export class ObservationService {
  constructor(private db: Database.Database) {}

  /**
   * Submit a new observation with evidence (idempotent)
   * Returns existing observation if idempotency key matches
   */
  submit(
    request: SubmitObservationRequest,
    submittedBy: string
  ): SubmitObservationResponse {
    const transaction = this.db.transaction(() => {
      // Check for existing observation with this idempotency key
      const existingStmt = this.db.prepare(
        'SELECT * FROM observations WHERE idempotency_key = ? AND deleted_at IS NULL'
      );
      const existing = existingStmt.get(request.idempotencyKey) as any;

      if (existing) {
        // Return existing observation (idempotent)
        return {
          observationId: existing.id,
          vehicleId: existing.vehicle_id || undefined,
          violationIds: [], // Would need to query violations
          created: false,
        };
      }

      // Validate evidence requirements
      if (!request.evidence || request.evidence.length === 0) {
        throw new Error('At least one evidence item is required');
      }

      // Find or create vehicle if license plate provided
      let vehicleId: string | null = null;
      if (request.licensePlate && request.issuingState) {
        vehicleId = this.findOrCreateVehicle(
          request.licensePlate,
          request.issuingState,
          new Date(request.observedAt)
        );
      }

      // Create observation
      const observationId = uuidv4();
      const now = new Date().toISOString();

      const observationStmt = this.db.prepare(
        `INSERT INTO observations (
          id, site_id, vehicle_id, parking_position_id, observed_at,
          license_plate, issuing_state, registration_month, registration_year,
          idempotency_key, submitted_by, submitted_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );

      observationStmt.run(
        observationId,
        request.siteId,
        vehicleId,
        request.parkingPositionId || null,
        request.observedAt,
        request.licensePlate || null,
        request.issuingState || null,
        request.registrationMonth || null,
        request.registrationYear || null,
        request.idempotencyKey,
        submittedBy,
        now,
        now,
        now
      );

      // Create evidence items
      const evidenceStmt = this.db.prepare(
        `INSERT INTO evidence_items (
          id, observation_id, type, s3_key, captured_at, intent, note_text, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );

      for (const evidence of request.evidence) {
        evidenceStmt.run(
          uuidv4(),
          observationId,
          evidence.type,
          evidence.s3Key || null,
          evidence.capturedAt || null,
          evidence.intent || null,
          evidence.noteText || null,
          now,
          now
        );
      }

      return {
        observationId,
        vehicleId: vehicleId || undefined,
        violationIds: [], // Violations will be derived asynchronously
        created: true,
      };
    });

    return transaction();
  }

  getById(id: string): Observation | null {
    const stmt = this.db.prepare(
      'SELECT * FROM observations WHERE id = ? AND deleted_at IS NULL'
    );
    const row = stmt.get(id) as any;

    return row ? this.mapObservationRow(row) : null;
  }

  getEvidence(observationId: string): EvidenceItem[] {
    const stmt = this.db.prepare(
      `SELECT * FROM evidence_items
       WHERE observation_id = ? AND deleted_at IS NULL
       ORDER BY created_at`
    );
    const rows = stmt.all(observationId);

    return rows.map((row) => this.mapEvidenceRow(row as any));
  }

  getByVehicle(vehicleId: string, limit = 50): Observation[] {
    const stmt = this.db.prepare(
      `SELECT * FROM observations
       WHERE vehicle_id = ? AND deleted_at IS NULL
       ORDER BY observed_at DESC
       LIMIT ?`
    );
    const rows = stmt.all(vehicleId, limit);

    return rows.map((row) => this.mapObservationRow(row as any));
  }

  getByPosition(positionId: string, limit = 50): Observation[] {
    const stmt = this.db.prepare(
      `SELECT * FROM observations
       WHERE parking_position_id = ? AND deleted_at IS NULL
       ORDER BY observed_at DESC
       LIMIT ?`
    );
    const rows = stmt.all(positionId, limit);

    return rows.map((row) => this.mapObservationRow(row as any));
  }

  /**
   * Check if observation has specific type of evidence
   */
  hasEvidenceType(observationId: string, intent: EvidenceIntent): boolean {
    const stmt = this.db.prepare(
      `SELECT COUNT(*) as count FROM evidence_items
       WHERE observation_id = ? AND intent = ? AND deleted_at IS NULL`
    );
    const result = stmt.get(observationId, intent) as any;

    return parseInt(result.count) > 0;
  }

  /**
   * Find or create vehicle record
   */
  private findOrCreateVehicle(
    licensePlate: string,
    issuingState: string,
    observedAt: Date
  ): string {
    // Try to find existing vehicle
    const findStmt = this.db.prepare(
      `SELECT * FROM vehicles
       WHERE license_plate = ? AND issuing_state = ? AND deleted_at IS NULL`
    );
    const existing = findStmt.get(licensePlate, issuingState) as any;

    if (existing) {
      // Update last observed time
      const updateStmt = this.db.prepare(
        'UPDATE vehicles SET last_observed_at = ? WHERE id = ?'
      );
      updateStmt.run(observedAt.toISOString(), existing.id);

      return existing.id;
    }

    // Create new vehicle
    const vehicleId = uuidv4();
    const now = new Date().toISOString();

    const insertStmt = this.db.prepare(
      `INSERT INTO vehicles (id, license_plate, issuing_state, last_observed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    insertStmt.run(vehicleId, licensePlate, issuingState, observedAt.toISOString(), now, now);

    return vehicleId;
  }

  private mapObservationRow(row: any): Observation {
    return {
      id: row.id,
      siteId: row.site_id,
      vehicleId: row.vehicle_id,
      parkingPositionId: row.parking_position_id,
      observedAt: row.observed_at,
      licensePlate: row.license_plate,
      issuingState: row.issuing_state,
      registrationMonth: row.registration_month,
      registrationYear: row.registration_year,
      idempotencyKey: row.idempotency_key,
      submittedAt: row.submitted_at,
      submittedBy: row.submitted_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
    };
  }

  private mapEvidenceRow(row: any): EvidenceItem {
    return {
      id: row.id,
      observationId: row.observation_id,
      type: row.type,
      s3Key: row.s3_key,
      s3Hash: row.s3_hash,
      capturedAt: row.captured_at,
      intent: row.intent as EvidenceIntent | null,
      noteText: row.note_text,
      metadata: row.metadata || {},
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
    };
  }
}
