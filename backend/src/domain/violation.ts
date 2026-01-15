import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
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
  constructor(private db: Database.Database) {}

  /**
   * Derive violations from a new observation
   * This is called after an observation is submitted
   */
  deriveFromObservation(
    observation: Observation,
    position: ParkingPosition | null,
    performedBy: string
  ): string[] {
    const transaction = this.db.transaction(() => {
      const violationIds: string[] = [];

      // Check for unauthorized stall usage
      if (position) {
        const unauthorizedViolation = this.checkUnauthorizedStall(
          observation,
          position,
          performedBy
        );
        if (unauthorizedViolation) {
          violationIds.push(unauthorizedViolation);
        }

        // Check for handicapped violations
        const handicappedViolation = this.checkHandicappedViolation(
          observation,
          position,
          performedBy
        );
        if (handicappedViolation) {
          violationIds.push(handicappedViolation);
        }
      }

      // Check for expired registration
      const expiredRegViolation = this.checkExpiredRegistration(
        observation,
        position,
        performedBy
      );
      if (expiredRegViolation) {
        violationIds.push(expiredRegViolation);
      }

      return violationIds;
    });

    return transaction();
  }

  /**
   * Add an event to a violation timeline
   */
  addEvent(
    violationId: string,
    eventType: ViolationEventType,
    options: {
      observationId?: string;
      noticeId?: string;
      notes?: string;
      performedBy?: string;
    }
  ): ViolationEvent {
    const transaction = this.db.transaction(() => {
      // Insert event
      const eventId = uuidv4();
      const now = new Date().toISOString();

      const eventStmt = this.db.prepare(
        `INSERT INTO violation_events (
          id, violation_id, event_type, observation_id, notice_id, notes, performed_by, event_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );

      eventStmt.run(
        eventId,
        violationId,
        eventType,
        options.observationId || null,
        options.noticeId || null,
        options.notes || null,
        options.performedBy || 'SYSTEM',
        now,
        now,
        now
      );

      // Update violation status based on event type
      const newStatus = this.eventTypeToStatus(eventType);
      if (newStatus) {
        const updateStatusStmt = this.db.prepare(
          'UPDATE violations SET status = ? WHERE id = ?'
        );
        updateStatusStmt.run(newStatus, violationId);
      }

      // Handle resolved/dismissed events
      if (eventType === ViolationEventType.RESOLVED) {
        const resolveStmt = this.db.prepare(
          'UPDATE violations SET resolved_at = datetime(\'now\') WHERE id = ?'
        );
        resolveStmt.run(violationId);
      } else if (eventType === ViolationEventType.DISMISSED) {
        const dismissStmt = this.db.prepare(
          'UPDATE violations SET dismissed_at = datetime(\'now\'), dismissal_reason = ? WHERE id = ?'
        );
        dismissStmt.run(options.notes || 'Dismissed', violationId);
      }

      // Retrieve and return the created event
      const getEventStmt = this.db.prepare(
        'SELECT * FROM violation_events WHERE id = ?'
      );
      const event = getEventStmt.get(eventId) as any;

      return this.mapEventRow(event);
    });

    return transaction();
  }

  /**
   * Evaluate timeline transitions for all active violations
   * Called periodically by scheduled worker
   */
  evaluateTimelines(): number {
    const stmt = this.db.prepare(
      `SELECT * FROM violations
       WHERE status NOT IN ('RESOLVED', 'DISMISSED')
         AND deleted_at IS NULL`
    );
    const activeViolations = stmt.all();

    let transitionCount = 0;

    for (const violationRow of activeViolations) {
      const violation = this.mapViolationRow(violationRow as any);
      const rule = TIMELINE_RULES.find((r) => r.category === violation.category);
      if (!rule) continue;

      const hoursSinceDetection =
        (Date.now() - new Date(violation.detectedAt).getTime()) / (1000 * 60 * 60);

      // Check for state transitions
      if (
        violation.status === ViolationStatus.DETECTED &&
        hoursSinceDetection >= rule.noticeEligibleAfterHours
      ) {
        this.addEvent(violation.id, ViolationEventType.NOTICE_ELIGIBLE, {
          notes: 'Auto-transitioned by timeline evaluation',
        });
        transitionCount++;
      } else if (
        violation.status === ViolationStatus.NOTICE_ISSUED &&
        hoursSinceDetection >= rule.escalationAfterHours
      ) {
        this.addEvent(violation.id, ViolationEventType.ESCALATED, {
          notes: 'Auto-escalated by timeline evaluation',
        });
        transitionCount++;
      } else if (
        violation.status === ViolationStatus.ESCALATED &&
        hoursSinceDetection >= rule.towEligibleAfterHours
      ) {
        this.addEvent(violation.id, ViolationEventType.TOW_ELIGIBLE, {
          notes: 'Auto-transitioned to tow eligible',
        });
        transitionCount++;
      }
    }

    return transitionCount;
  }

  getById(id: string): Violation | null {
    const stmt = this.db.prepare(
      'SELECT * FROM violations WHERE id = ? AND deleted_at IS NULL'
    );
    const row = stmt.get(id) as any;

    return row ? this.mapViolationRow(row) : null;
  }

  getEvents(violationId: string): ViolationEvent[] {
    const stmt = this.db.prepare(
      `SELECT * FROM violation_events
       WHERE violation_id = ? AND deleted_at IS NULL
       ORDER BY event_at ASC`
    );
    const rows = stmt.all(violationId);

    return rows.map((row) => this.mapEventRow(row as any));
  }

  getByVehicle(vehicleId: string): Violation[] {
    const stmt = this.db.prepare(
      `SELECT * FROM violations
       WHERE vehicle_id = ? AND deleted_at IS NULL
       ORDER BY detected_at DESC`
    );
    const rows = stmt.all(vehicleId);

    return rows.map((row) => this.mapViolationRow(row as any));
  }

  /**
   * Check for unauthorized stall usage
   */
  private checkUnauthorizedStall(
    observation: Observation,
    position: ParkingPosition,
    performedBy: string
  ): string | null {
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
    const existingStmt = this.db.prepare(
      `SELECT id FROM violations
       WHERE parking_position_id = ?
         AND vehicle_id = ?
         AND category = ?
         AND status NOT IN ('RESOLVED', 'DISMISSED')
         AND deleted_at IS NULL`
    );
    const existing = existingStmt.get(
      position.id,
      observation.vehicleId,
      ViolationCategory.UNAUTHORIZED_STALL
    ) as any;

    if (existing) {
      // Add observation to existing violation
      this.addEvent(existing.id, ViolationEventType.OBSERVATION_ADDED, {
        observationId: observation.id,
        performedBy,
      });
      return existing.id;
    }

    // Create new violation
    const violationId = uuidv4();
    const now = new Date().toISOString();

    const violationStmt = this.db.prepare(
      `INSERT INTO violations (
        id, site_id, vehicle_id, parking_position_id, category, status, detected_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    violationStmt.run(
      violationId,
      observation.siteId,
      observation.vehicleId,
      position.id,
      ViolationCategory.UNAUTHORIZED_STALL,
      ViolationStatus.DETECTED,
      observation.observedAt,
      now,
      now
    );

    // Create initial event
    const eventId = uuidv4();
    const eventStmt = this.db.prepare(
      `INSERT INTO violation_events (
        id, violation_id, event_type, observation_id, performed_by, event_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );

    eventStmt.run(
      eventId,
      violationId,
      ViolationEventType.DETECTED,
      observation.id,
      performedBy,
      now,
      now,
      now
    );

    return violationId;
  }

  /**
   * Check for handicapped violations (preliminary - may be resolved with later evidence)
   */
  private checkHandicappedViolation(
    observation: Observation,
    position: ParkingPosition,
    performedBy: string
  ): string | null {
    if (position.type !== 'HANDICAPPED') {
      return null;
    }

    // This would check for placard evidence in the observation
    // For now, we'll create a violation that can be resolved later
    // when placard evidence is added

    const existingStmt = this.db.prepare(
      `SELECT id FROM violations
       WHERE parking_position_id = ?
         AND vehicle_id = ?
         AND category = ?
         AND status NOT IN ('RESOLVED', 'DISMISSED')
         AND deleted_at IS NULL`
    );
    const existing = existingStmt.get(
      position.id,
      observation.vehicleId,
      ViolationCategory.HANDICAPPED_NO_PLACARD
    ) as any;

    if (existing) {
      this.addEvent(existing.id, ViolationEventType.OBSERVATION_ADDED, {
        observationId: observation.id,
        performedBy,
      });
      return existing.id;
    }

    // Create violation (may be resolved when placard evidence is found)
    const violationId = uuidv4();
    const now = new Date().toISOString();

    const violationStmt = this.db.prepare(
      `INSERT INTO violations (
        id, site_id, vehicle_id, parking_position_id, category, status, detected_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    violationStmt.run(
      violationId,
      observation.siteId,
      observation.vehicleId,
      position.id,
      ViolationCategory.HANDICAPPED_NO_PLACARD,
      ViolationStatus.DETECTED,
      observation.observedAt,
      now,
      now
    );

    const eventId = uuidv4();
    const eventStmt = this.db.prepare(
      `INSERT INTO violation_events (
        id, violation_id, event_type, observation_id, performed_by, event_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );

    eventStmt.run(
      eventId,
      violationId,
      ViolationEventType.DETECTED,
      observation.id,
      performedBy,
      now,
      now,
      now
    );

    return violationId;
  }

  /**
   * Check for expired registration
   */
  private checkExpiredRegistration(
    observation: Observation,
    position: ParkingPosition | null,
    performedBy: string
  ): string | null {
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
    const existingStmt = this.db.prepare(
      `SELECT id FROM violations
       WHERE vehicle_id = ?
         AND category = ?
         AND status NOT IN ('RESOLVED', 'DISMISSED')
         AND deleted_at IS NULL`
    );
    const existing = existingStmt.get(
      observation.vehicleId,
      ViolationCategory.EXPIRED_REGISTRATION
    ) as any;

    if (existing) {
      this.addEvent(existing.id, ViolationEventType.OBSERVATION_ADDED, {
        observationId: observation.id,
        performedBy,
      });
      return existing.id;
    }

    const violationId = uuidv4();
    const nowStr = new Date().toISOString();

    const violationStmt = this.db.prepare(
      `INSERT INTO violations (
        id, site_id, vehicle_id, parking_position_id, category, status, detected_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    violationStmt.run(
      violationId,
      observation.siteId,
      observation.vehicleId,
      position?.id || null,
      ViolationCategory.EXPIRED_REGISTRATION,
      ViolationStatus.DETECTED,
      observation.observedAt,
      nowStr,
      nowStr
    );

    const eventId = uuidv4();
    const eventStmt = this.db.prepare(
      `INSERT INTO violation_events (
        id, violation_id, event_type, observation_id, performed_by, event_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );

    eventStmt.run(
      eventId,
      violationId,
      ViolationEventType.DETECTED,
      observation.id,
      performedBy,
      nowStr,
      nowStr,
      nowStr
    );

    return violationId;
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
