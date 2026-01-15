import { Pool } from 'pg';
import {
  Violation,
  ViolationCategory,
  ViolationEventType,
  EvidenceIntent,
  EvidenceItem,
} from '@cedar-terrace/shared';
import { ViolationService } from './violation';

/**
 * Handicapped enforcement logic
 * Handles progressive evidence evaluation where placard visibility may improve over time
 */
export class HandicappedEnforcementService {
  constructor(
    private pool: Pool,
    private violationService: ViolationService
  ) {}

  /**
   * Evaluate handicapped violations for a vehicle based on all observations
   * This is called when new evidence is added that might contain placard photos
   */
  async evaluateHandicappedCompliance(
    vehicleId: string,
    newObservationId: string
  ): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Find all active handicapped violations for this vehicle
      const violations = await client.query<Violation>(
        `SELECT * FROM violations
         WHERE vehicle_id = $1
           AND category = $2
           AND status NOT IN ('RESOLVED', 'DISMISSED')
           AND deleted_at IS NULL`,
        [vehicleId, ViolationCategory.HANDICAPPED_NO_PLACARD]
      );

      for (const violation of violations.rows) {
        // Check if we now have placard evidence
        const hasPlacard = await this.hasPlacardEvidence(client, violation.id);

        if (hasPlacard) {
          // Resolve the violation with explanation
          await this.violationService.addEvent(
            violation.id,
            ViolationEventType.RESOLVED,
            {
              observationId: newObservationId,
              notes: 'Resolved: Handicapped placard evidence found in subsequent observation',
              performedBy: 'SYSTEM',
            }
          );
        }
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Check if any observation for this violation has placard evidence
   */
  private async hasPlacardEvidence(client: any, violationId: string): Promise<boolean> {
    const result = await client.query(
      `SELECT COUNT(*) as count
       FROM evidence_items ei
       JOIN violation_events ve ON ve.observation_id = ei.observation_id
       WHERE ve.violation_id = $1
         AND ei.intent = $2
         AND ei.deleted_at IS NULL
         AND ve.deleted_at IS NULL`,
      [violationId, EvidenceIntent.HANDICAPPED_PLACARD]
    );

    return parseInt(result.rows[0].count) > 0;
  }

  /**
   * Check if vehicle has general placard evidence across all observations
   * Used for administrative queries, not enforcement decisions
   */
  async vehicleHasPlacardEvidence(vehicleId: string): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT COUNT(*) as count
       FROM evidence_items ei
       JOIN observations o ON o.id = ei.observation_id
       WHERE o.vehicle_id = $1
         AND ei.intent = $2
         AND ei.deleted_at IS NULL
         AND o.deleted_at IS NULL`,
      [vehicleId, EvidenceIntent.HANDICAPPED_PLACARD]
    );

    return parseInt(result.rows[0].count) > 0;
  }

  /**
   * Get all placard evidence for a vehicle
   */
  async getPlacardEvidence(vehicleId: string): Promise<EvidenceItem[]> {
    const result = await this.pool.query(
      `SELECT ei.*
       FROM evidence_items ei
       JOIN observations o ON o.id = ei.observation_id
       WHERE o.vehicle_id = $1
         AND ei.intent = $2
         AND ei.deleted_at IS NULL
         AND o.deleted_at IS NULL
       ORDER BY ei.captured_at DESC`,
      [vehicleId, EvidenceIntent.HANDICAPPED_PLACARD]
    );

    return result.rows.map(this.mapEvidenceRow);
  }

  /**
   * Manually resolve a handicapped violation with admin notes
   * Used when admin confirms placard through other means
   */
  async manuallyResolveWithPlacard(
    violationId: string,
    adminNotes: string,
    performedBy: string
  ): Promise<void> {
    await this.violationService.addEvent(violationId, ViolationEventType.RESOLVED, {
      notes: `Manually resolved by admin: ${adminNotes}`,
      performedBy,
    });
  }

  /**
   * Create a text note documenting placard visibility
   * This can be added to an observation when placard is visible but not photographed
   */
  async addPlacardNote(
    observationId: string,
    noteText: string
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO evidence_items (
        observation_id, type, note_text, intent
      ) VALUES ($1, 'TEXT_NOTE', $2, $3)`,
      [observationId, noteText, EvidenceIntent.HANDICAPPED_PLACARD]
    );

    // Re-evaluate compliance for this vehicle
    const observation = await this.pool.query(
      'SELECT vehicle_id FROM observations WHERE id = $1',
      [observationId]
    );

    if (observation.rows.length > 0 && observation.rows[0].vehicle_id) {
      await this.evaluateHandicappedCompliance(
        observation.rows[0].vehicle_id,
        observationId
      );
    }
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
