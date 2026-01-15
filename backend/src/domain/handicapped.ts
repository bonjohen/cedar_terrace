import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
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
    private db: Database.Database,
    private violationService: ViolationService
  ) {}

  /**
   * Evaluate handicapped violations for a vehicle based on all observations
   * This is called when new evidence is added that might contain placard photos
   */
  evaluateHandicappedCompliance(
    vehicleId: string,
    newObservationId: string
  ): void {
    const transaction = this.db.transaction(() => {
      // Find all active handicapped violations for this vehicle
      const violationsStmt = this.db.prepare(
        `SELECT * FROM violations
         WHERE vehicle_id = ?
           AND category = ?
           AND status NOT IN ('RESOLVED', 'DISMISSED')
           AND deleted_at IS NULL`
      );
      const violations = violationsStmt.all(
        vehicleId,
        ViolationCategory.HANDICAPPED_NO_PLACARD
      ) as any[];

      for (const violationRow of violations) {
        // Check if we now have placard evidence
        const hasPlacard = this.hasPlacardEvidence(violationRow.id);

        if (hasPlacard) {
          // Resolve the violation with explanation
          this.violationService.addEvent(
            violationRow.id,
            ViolationEventType.RESOLVED,
            {
              observationId: newObservationId,
              notes: 'Resolved: Handicapped placard evidence found in subsequent observation',
              performedBy: 'SYSTEM',
            }
          );
        }
      }
    });

    transaction();
  }

  /**
   * Check if any observation for this violation has placard evidence
   */
  private hasPlacardEvidence(violationId: string): boolean {
    const stmt = this.db.prepare(
      `SELECT COUNT(*) as count
       FROM evidence_items ei
       JOIN violation_events ve ON ve.observation_id = ei.observation_id
       WHERE ve.violation_id = ?
         AND ei.intent = ?
         AND ei.deleted_at IS NULL
         AND ve.deleted_at IS NULL`
    );
    const result = stmt.get(violationId, EvidenceIntent.HANDICAPPED_PLACARD) as any;

    return parseInt(result.count) > 0;
  }

  /**
   * Check if vehicle has general placard evidence across all observations
   * Used for administrative queries, not enforcement decisions
   */
  vehicleHasPlacardEvidence(vehicleId: string): boolean {
    const stmt = this.db.prepare(
      `SELECT COUNT(*) as count
       FROM evidence_items ei
       JOIN observations o ON o.id = ei.observation_id
       WHERE o.vehicle_id = ?
         AND ei.intent = ?
         AND ei.deleted_at IS NULL
         AND o.deleted_at IS NULL`
    );
    const result = stmt.get(vehicleId, EvidenceIntent.HANDICAPPED_PLACARD) as any;

    return parseInt(result.count) > 0;
  }

  /**
   * Get all placard evidence for a vehicle
   */
  getPlacardEvidence(vehicleId: string): EvidenceItem[] {
    const stmt = this.db.prepare(
      `SELECT ei.*
       FROM evidence_items ei
       JOIN observations o ON o.id = ei.observation_id
       WHERE o.vehicle_id = ?
         AND ei.intent = ?
         AND ei.deleted_at IS NULL
         AND o.deleted_at IS NULL
       ORDER BY ei.captured_at DESC`
    );
    const rows = stmt.all(vehicleId, EvidenceIntent.HANDICAPPED_PLACARD);

    return rows.map((row) => this.mapEvidenceRow(row as any));
  }

  /**
   * Manually resolve a handicapped violation with admin notes
   * Used when admin confirms placard through other means
   */
  manuallyResolveWithPlacard(
    violationId: string,
    adminNotes: string,
    performedBy: string
  ): void {
    this.violationService.addEvent(violationId, ViolationEventType.RESOLVED, {
      notes: `Manually resolved by admin: ${adminNotes}`,
      performedBy,
    });
  }

  /**
   * Create a text note documenting placard visibility
   * This can be added to an observation when placard is visible but not photographed
   */
  addPlacardNote(
    observationId: string,
    noteText: string
  ): void {
    const transaction = this.db.transaction(() => {
      const evidenceId = uuidv4();
      const now = new Date().toISOString();

      const insertStmt = this.db.prepare(
        `INSERT INTO evidence_items (
          id, observation_id, type, note_text, intent, created_at, updated_at
        ) VALUES (?, ?, 'TEXT_NOTE', ?, ?, ?, ?)`
      );

      insertStmt.run(
        evidenceId,
        observationId,
        noteText,
        EvidenceIntent.HANDICAPPED_PLACARD,
        now,
        now
      );

      // Re-evaluate compliance for this vehicle
      const observationStmt = this.db.prepare(
        'SELECT vehicle_id FROM observations WHERE id = ?'
      );
      const observation = observationStmt.get(observationId) as any;

      if (observation && observation.vehicle_id) {
        this.evaluateHandicappedCompliance(
          observation.vehicle_id,
          observationId
        );
      }
    });

    transaction();
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
