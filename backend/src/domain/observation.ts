import { Pool } from 'pg';
import {
  Observation,
  EvidenceItem,
  Vehicle,
  SubmitObservationRequest,
  SubmitObservationResponse,
  EvidenceIntent,
} from '@cedar-terrace/shared';
import { v4 as uuidv4 } from 'uuid';

export class ObservationService {
  constructor(private pool: Pool) {}

  /**
   * Submit a new observation with evidence (idempotent)
   * Returns existing observation if idempotency key matches
   */
  async submit(
    request: SubmitObservationRequest,
    submittedBy: string
  ): Promise<SubmitObservationResponse> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Check for existing observation with this idempotency key
      const existingResult = await client.query<Observation>(
        'SELECT * FROM observations WHERE idempotency_key = $1 AND deleted_at IS NULL',
        [request.idempotencyKey]
      );

      if (existingResult.rows.length > 0) {
        const existing = existingResult.rows[0];
        await client.query('COMMIT');

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
        vehicleId = await this.findOrCreateVehicle(
          client,
          request.licensePlate,
          request.issuingState,
          new Date(request.observedAt)
        );
      }

      // Create observation
      const observationResult = await client.query<Observation>(
        `INSERT INTO observations (
          site_id, vehicle_id, parking_position_id, observed_at,
          license_plate, issuing_state, registration_month, registration_year,
          idempotency_key, submitted_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *`,
        [
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
        ]
      );

      const observation = observationResult.rows[0];

      // Create evidence items
      for (const evidence of request.evidence) {
        await client.query(
          `INSERT INTO evidence_items (
            observation_id, type, s3_key, captured_at, intent, note_text
          ) VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            observation.id,
            evidence.type,
            evidence.s3Key || null,
            evidence.capturedAt || null,
            evidence.intent || null,
            evidence.noteText || null,
          ]
        );
      }

      await client.query('COMMIT');

      return {
        observationId: observation.id,
        vehicleId: vehicleId || undefined,
        violationIds: [], // Violations will be derived asynchronously
        created: true,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getById(id: string): Promise<Observation | null> {
    const result = await this.pool.query<Observation>(
      'SELECT * FROM observations WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );

    return result.rows.length > 0 ? this.mapObservationRow(result.rows[0]) : null;
  }

  async getEvidence(observationId: string): Promise<EvidenceItem[]> {
    const result = await this.pool.query(
      `SELECT * FROM evidence_items
       WHERE observation_id = $1 AND deleted_at IS NULL
       ORDER BY created_at`,
      [observationId]
    );

    return result.rows.map(this.mapEvidenceRow);
  }

  async getByVehicle(vehicleId: string, limit = 50): Promise<Observation[]> {
    const result = await this.pool.query<Observation>(
      `SELECT * FROM observations
       WHERE vehicle_id = $1 AND deleted_at IS NULL
       ORDER BY observed_at DESC
       LIMIT $2`,
      [vehicleId, limit]
    );

    return result.rows.map(this.mapObservationRow);
  }

  async getByPosition(positionId: string, limit = 50): Promise<Observation[]> {
    const result = await this.pool.query<Observation>(
      `SELECT * FROM observations
       WHERE parking_position_id = $1 AND deleted_at IS NULL
       ORDER BY observed_at DESC
       LIMIT $2`,
      [positionId, limit]
    );

    return result.rows.map(this.mapObservationRow);
  }

  /**
   * Check if observation has specific type of evidence
   */
  async hasEvidenceType(observationId: string, intent: EvidenceIntent): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT COUNT(*) as count FROM evidence_items
       WHERE observation_id = $1 AND intent = $2 AND deleted_at IS NULL`,
      [observationId, intent]
    );

    return parseInt(result.rows[0].count) > 0;
  }

  /**
   * Find or create vehicle record
   */
  private async findOrCreateVehicle(
    client: any,
    licensePlate: string,
    issuingState: string,
    observedAt: Date
  ): Promise<string> {
    // Try to find existing vehicle
    const existing = await client.query<Vehicle>(
      `SELECT * FROM vehicles
       WHERE license_plate = $1 AND issuing_state = $2 AND deleted_at IS NULL`,
      [licensePlate, issuingState]
    );

    if (existing.rows.length > 0) {
      const vehicle = existing.rows[0];

      // Update last observed time
      await client.query(
        'UPDATE vehicles SET last_observed_at = $1 WHERE id = $2',
        [observedAt, vehicle.id]
      );

      return vehicle.id;
    }

    // Create new vehicle
    const newVehicle = await client.query<Vehicle>(
      `INSERT INTO vehicles (license_plate, issuing_state, last_observed_at)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [licensePlate, issuingState, observedAt]
    );

    return newVehicle.rows[0].id;
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
