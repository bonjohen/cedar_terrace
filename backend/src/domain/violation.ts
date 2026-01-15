import { Pool } from 'pg';
import {
  Violation,
  ViolationEvent,
  ViolationCategory,
  ViolationStatus,
  ViolationEventType,
  ParkingPosition,
  Observation,
} from '@cedar-terrace/shared';

interface TimelineRule {
  category: ViolationCategory;
  noticeEligibleAfterHours: number;
  escalationAfterHours: number;
  towEligibleAfterHours: number;
}

const TIMELINE_RULES: TimelineRule[] = [
  {
    category: ViolationCategory.FIRE_LANE,
    noticeEligibleAfterHours: 0, // Immediate
    escalationAfterHours: 24,
    towEligibleAfterHours: 48,
  },
  {
    category: ViolationCategory.HANDICAPPED_NO_PLACARD,
    noticeEligibleAfterHours: 24,
    escalationAfterHours: 72,
    towEligibleAfterHours: 168, // 7 days
  },
  {
    category: ViolationCategory.UNAUTHORIZED_STALL,
    noticeEligibleAfterHours: 24,
    escalationAfterHours: 72,
    towEligibleAfterHours: 168,
  },
  {
    category: ViolationCategory.EXPIRED_REGISTRATION,
    noticeEligibleAfterHours: 48,
    escalationAfterHours: 168,
    towEligibleAfterHours: 336, // 14 days
  },
  {
    category: ViolationCategory.NO_PARKING_ZONE,
    noticeEligibleAfterHours: 0,
    escalationAfterHours: 48,
    towEligibleAfterHours: 96,
  },
];

export class ViolationService {
  constructor(private pool: Pool) {}

  /**
   * Derive violations from a new observation
   * This is called after an observation is submitted
   */
  async deriveFromObservation(
    observation: Observation,
    position: ParkingPosition | null,
    performedBy: string
  ): Promise<string[]> {
    const client = await this.pool.connect();
    const violationIds: string[] = [];

    try {
      await client.query('BEGIN');

      // Check for unauthorized stall usage
      if (position) {
        const unauthorizedViolation = await this.checkUnauthorizedStall(
          client,
          observation,
          position,
          performedBy
        );
        if (unauthorizedViolation) {
          violationIds.push(unauthorizedViolation);
        }

        // Check for handicapped violations
        const handicappedViolation = await this.checkHandicappedViolation(
          client,
          observation,
          position,
          performedBy
        );
        if (handicappedViolation) {
          violationIds.push(handicappedViolation);
        }
      }

      // Check for expired registration
      const expiredRegViolation = await this.checkExpiredRegistration(
        client,
        observation,
        position,
        performedBy
      );
      if (expiredRegViolation) {
        violationIds.push(expiredRegViolation);
      }

      await client.query('COMMIT');
      return violationIds;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Add an event to a violation timeline
   */
  async addEvent(
    violationId: string,
    eventType: ViolationEventType,
    options: {
      observationId?: string;
      noticeId?: string;
      notes?: string;
      performedBy?: string;
    }
  ): Promise<ViolationEvent> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Insert event
      const eventResult = await client.query<ViolationEvent>(
        `INSERT INTO violation_events (
          violation_id, event_type, observation_id, notice_id, notes, performed_by
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *`,
        [
          violationId,
          eventType,
          options.observationId || null,
          options.noticeId || null,
          options.notes || null,
          options.performedBy || 'SYSTEM',
        ]
      );

      // Update violation status based on event type
      const newStatus = this.eventTypeToStatus(eventType);
      if (newStatus) {
        await client.query(
          'UPDATE violations SET status = $1 WHERE id = $2',
          [newStatus, violationId]
        );
      }

      // Handle resolved/dismissed events
      if (eventType === ViolationEventType.RESOLVED) {
        await client.query(
          'UPDATE violations SET resolved_at = CURRENT_TIMESTAMP WHERE id = $1',
          [violationId]
        );
      } else if (eventType === ViolationEventType.DISMISSED) {
        await client.query(
          'UPDATE violations SET dismissed_at = CURRENT_TIMESTAMP, dismissal_reason = $1 WHERE id = $2',
          [options.notes || 'Dismissed', violationId]
        );
      }

      await client.query('COMMIT');
      return this.mapEventRow(eventResult.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Evaluate timeline transitions for all active violations
   * Called periodically by scheduled worker
   */
  async evaluateTimelines(): Promise<number> {
    const activeViolations = await this.pool.query<Violation>(
      `SELECT * FROM violations
       WHERE status NOT IN ('RESOLVED', 'DISMISSED')
         AND deleted_at IS NULL`
    );

    let transitionCount = 0;

    for (const violation of activeViolations.rows) {
      const rule = TIMELINE_RULES.find((r) => r.category === violation.category);
      if (!rule) continue;

      const hoursSinceDetection =
        (Date.now() - new Date((violation as any).detected_at).getTime()) / (1000 * 60 * 60);

      // Check for state transitions
      if (
        violation.status === ViolationStatus.DETECTED &&
        hoursSinceDetection >= rule.noticeEligibleAfterHours
      ) {
        await this.addEvent(violation.id, ViolationEventType.NOTICE_ELIGIBLE, {
          notes: 'Auto-transitioned by timeline evaluation',
        });
        transitionCount++;
      } else if (
        violation.status === ViolationStatus.NOTICE_ISSUED &&
        hoursSinceDetection >= rule.escalationAfterHours
      ) {
        await this.addEvent(violation.id, ViolationEventType.ESCALATED, {
          notes: 'Auto-escalated by timeline evaluation',
        });
        transitionCount++;
      } else if (
        violation.status === ViolationStatus.ESCALATED &&
        hoursSinceDetection >= rule.towEligibleAfterHours
      ) {
        await this.addEvent(violation.id, ViolationEventType.TOW_ELIGIBLE, {
          notes: 'Auto-transitioned to tow eligible',
        });
        transitionCount++;
      }
    }

    return transitionCount;
  }

  async getById(id: string): Promise<Violation | null> {
    const result = await this.pool.query<Violation>(
      'SELECT * FROM violations WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );

    return result.rows.length > 0 ? this.mapViolationRow(result.rows[0]) : null;
  }

  async getEvents(violationId: string): Promise<ViolationEvent[]> {
    const result = await this.pool.query<ViolationEvent>(
      `SELECT * FROM violation_events
       WHERE violation_id = $1 AND deleted_at IS NULL
       ORDER BY event_at ASC`,
      [violationId]
    );

    return result.rows.map(this.mapEventRow);
  }

  async getByVehicle(vehicleId: string): Promise<Violation[]> {
    const result = await this.pool.query<Violation>(
      `SELECT * FROM violations
       WHERE vehicle_id = $1 AND deleted_at IS NULL
       ORDER BY detected_at DESC`,
      [vehicleId]
    );

    return result.rows.map(this.mapViolationRow);
  }

  /**
   * Check for unauthorized stall usage
   */
  private async checkUnauthorizedStall(
    client: any,
    observation: Observation,
    position: ParkingPosition,
    performedBy: string
  ): Promise<string | null> {
    // Only applies to PURCHASED/RESERVED positions
    if (
      position.type !== 'PURCHASED' &&
      position.type !== 'RESERVED'
    ) {
      return null;
    }

    // Check if vehicle is authorized
    if (position.assignedVehicleId === observation.vehicleId) {
      return null; // Authorized
    }

    // Check for existing active violation
    const existing = await client.query(
      `SELECT id FROM violations
       WHERE parking_position_id = $1
         AND vehicle_id = $2
         AND category = $3
         AND status NOT IN ('RESOLVED', 'DISMISSED')
         AND deleted_at IS NULL`,
      [position.id, observation.vehicleId, ViolationCategory.UNAUTHORIZED_STALL]
    );

    if (existing.rows.length > 0) {
      // Add observation to existing violation
      await this.addEvent(existing.rows[0].id, ViolationEventType.OBSERVATION_ADDED, {
        observationId: observation.id,
        performedBy,
      });
      return existing.rows[0].id;
    }

    // Create new violation
    const violation = await client.query(
      `INSERT INTO violations (
        site_id, vehicle_id, parking_position_id, category, detected_at
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *`,
      [
        observation.siteId,
        observation.vehicleId,
        position.id,
        ViolationCategory.UNAUTHORIZED_STALL,
        observation.observedAt,
      ]
    );

    // Create initial event
    await client.query(
      `INSERT INTO violation_events (
        violation_id, event_type, observation_id, performed_by
      ) VALUES ($1, $2, $3, $4)`,
      [violation.rows[0].id, ViolationEventType.DETECTED, observation.id, performedBy]
    );

    return violation.rows[0].id;
  }

  /**
   * Check for handicapped violations (preliminary - may be resolved with later evidence)
   */
  private async checkHandicappedViolation(
    client: any,
    observation: Observation,
    position: ParkingPosition,
    performedBy: string
  ): Promise<string | null> {
    if (position.type !== 'HANDICAPPED') {
      return null;
    }

    // This would check for placard evidence in the observation
    // For now, we'll create a violation that can be resolved later
    // when placard evidence is added

    const existing = await client.query(
      `SELECT id FROM violations
       WHERE parking_position_id = $1
         AND vehicle_id = $2
         AND category = $3
         AND status NOT IN ('RESOLVED', 'DISMISSED')
         AND deleted_at IS NULL`,
      [position.id, observation.vehicleId, ViolationCategory.HANDICAPPED_NO_PLACARD]
    );

    if (existing.rows.length > 0) {
      await this.addEvent(existing.rows[0].id, ViolationEventType.OBSERVATION_ADDED, {
        observationId: observation.id,
        performedBy,
      });
      return existing.rows[0].id;
    }

    // Create violation (may be resolved when placard evidence is found)
    const violation = await client.query(
      `INSERT INTO violations (
        site_id, vehicle_id, parking_position_id, category, detected_at
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *`,
      [
        observation.siteId,
        observation.vehicleId,
        position.id,
        ViolationCategory.HANDICAPPED_NO_PLACARD,
        observation.observedAt,
      ]
    );

    await client.query(
      `INSERT INTO violation_events (
        violation_id, event_type, observation_id, performed_by
      ) VALUES ($1, $2, $3, $4)`,
      [violation.rows[0].id, ViolationEventType.DETECTED, observation.id, performedBy]
    );

    return violation.rows[0].id;
  }

  /**
   * Check for expired registration
   */
  private async checkExpiredRegistration(
    client: any,
    observation: Observation,
    position: ParkingPosition | null,
    performedBy: string
  ): Promise<string | null> {
    if (!observation.registrationYear || !observation.registrationMonth) {
      return null; // Cannot determine expiration
    }

    const now = new Date();
    const expirationDate = new Date(
      observation.registrationYear,
      observation.registrationMonth,
      0
    );

    if (expirationDate >= now) {
      return null; // Not expired
    }

    // Check for existing violation
    const existing = await client.query(
      `SELECT id FROM violations
       WHERE vehicle_id = $1
         AND category = $2
         AND status NOT IN ('RESOLVED', 'DISMISSED')
         AND deleted_at IS NULL`,
      [observation.vehicleId, ViolationCategory.EXPIRED_REGISTRATION]
    );

    if (existing.rows.length > 0) {
      await this.addEvent(existing.rows[0].id, ViolationEventType.OBSERVATION_ADDED, {
        observationId: observation.id,
        performedBy,
      });
      return existing.rows[0].id;
    }

    const violation = await client.query(
      `INSERT INTO violations (
        site_id, vehicle_id, parking_position_id, category, detected_at
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *`,
      [
        observation.siteId,
        observation.vehicleId,
        position?.id || null,
        ViolationCategory.EXPIRED_REGISTRATION,
        observation.observedAt,
      ]
    );

    await client.query(
      `INSERT INTO violation_events (
        violation_id, event_type, observation_id, performed_by
      ) VALUES ($1, $2, $3, $4)`,
      [violation.rows[0].id, ViolationEventType.DETECTED, observation.id, performedBy]
    );

    return violation.rows[0].id;
  }

  private eventTypeToStatus(eventType: ViolationEventType): ViolationStatus | null {
    const mapping: Record<ViolationEventType, ViolationStatus | null> = {
      [ViolationEventType.DETECTED]: ViolationStatus.DETECTED,
      [ViolationEventType.OBSERVATION_ADDED]: null,
      [ViolationEventType.NOTICE_ELIGIBLE]: ViolationStatus.NOTICE_ELIGIBLE,
      [ViolationEventType.NOTICE_ISSUED]: ViolationStatus.NOTICE_ISSUED,
      [ViolationEventType.ESCALATED]: ViolationStatus.ESCALATED,
      [ViolationEventType.TOW_ELIGIBLE]: ViolationStatus.TOW_ELIGIBLE,
      [ViolationEventType.RESOLVED]: ViolationStatus.RESOLVED,
      [ViolationEventType.DISMISSED]: ViolationStatus.DISMISSED,
    };

    return mapping[eventType];
  }

  private mapViolationRow(row: any): Violation {
    return {
      id: row.id,
      siteId: row.site_id,
      vehicleId: row.vehicle_id,
      parkingPositionId: row.parking_position_id,
      category: row.category as ViolationCategory,
      status: row.status as ViolationStatus,
      detectedAt: row.detected_at,
      resolvedAt: row.resolved_at,
      dismissedAt: row.dismissed_at,
      dismissalReason: row.dismissal_reason,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
    };
  }

  private mapEventRow(row: any): ViolationEvent {
    return {
      id: row.id,
      violationId: row.violation_id,
      eventType: row.event_type as ViolationEventType,
      eventAt: row.event_at,
      observationId: row.observation_id,
      noticeId: row.notice_id,
      notes: row.notes,
      performedBy: row.performed_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
    };
  }
}
