import Database from 'better-sqlite3';
import { Notice, IssueNoticeRequest, IssueNoticeResponse, Violation } from '@cedar-terrace/shared';
import { v4 as uuidv4 } from 'uuid';
import { ViolationService } from './violation';
import { ViolationEventType } from '@cedar-terrace/shared';

interface NoticePayload {
  violationId: string;
  category: string;
  detectedAt: string;
  vehicleLicensePlate?: string;
  parkingPositionIdentifier?: string;
  deadlines: {
    paymentDue?: string;
    appealDue?: string;
  };
  instructions: string;
  qrToken: string;
}

export class NoticeService {
  constructor(
    private db: Database.Database,
    private violationService: ViolationService
  ) {}

  /**
   * Issue a notice for a violation (idempotent)
   */
  issue(
    request: IssueNoticeRequest,
    issuedBy: string
  ): IssueNoticeResponse {
    const transaction = this.db.transaction(() => {
      // Check for existing notice with this idempotency key
      const existingStmt = this.db.prepare(
        'SELECT * FROM notices WHERE idempotency_key = ? AND deleted_at IS NULL'
      );
      const existing = existingStmt.get(request.idempotencyKey) as any;

      if (existing) {
        return {
          noticeId: existing.id,
          qrToken: existing.qr_token,
          textPayload: existing.text_payload,
          created: false,
        };
      }

      // Get violation details
      const violation = this.violationService.getById(request.violationId);
      if (!violation) {
        throw new Error('Violation not found');
      }

      // Generate QR token
      const qrToken = this.generateQrToken();

      // Get additional details for notice
      const details = this.getViolationDetails(violation);

      // Generate notice payload
      const payload = this.generatePayload(violation, details, qrToken);

      // Create notice
      const noticeId = uuidv4();
      const now = new Date().toISOString();

      const noticeStmt = this.db.prepare(
        `INSERT INTO notices (
          id, violation_id, issued_by, qr_token, text_payload, idempotency_key, issued_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );

      noticeStmt.run(
        noticeId,
        request.violationId,
        issuedBy,
        qrToken,
        JSON.stringify(payload),
        request.idempotencyKey,
        now,
        now,
        now
      );

      // Add violation event
      this.violationService.addEvent(
        request.violationId,
        ViolationEventType.NOTICE_ISSUED,
        {
          noticeId,
          performedBy: issuedBy,
        }
      );

      return {
        noticeId,
        qrToken,
        textPayload: JSON.stringify(payload),
        created: true,
      };
    });

    return transaction();
  }

  /**
   * Get notice by ID
   */
  getById(id: string): Notice | null {
    const stmt = this.db.prepare(
      'SELECT * FROM notices WHERE id = ? AND deleted_at IS NULL'
    );
    const row = stmt.get(id) as any;

    return row ? this.mapRow(row) : null;
  }

  /**
   * Get notice by QR token
   */
  getByQrToken(qrToken: string): Notice | null {
    const stmt = this.db.prepare(
      'SELECT * FROM notices WHERE qr_token = ? AND deleted_at IS NULL'
    );
    const row = stmt.get(qrToken) as any;

    return row ? this.mapRow(row) : null;
  }

  /**
   * Get all notices for a violation
   */
  getByViolation(violationId: string): Notice[] {
    const stmt = this.db.prepare(
      `SELECT * FROM notices
       WHERE violation_id = ? AND deleted_at IS NULL
       ORDER BY issued_at DESC`
    );
    const rows = stmt.all(violationId);

    return rows.map((row) => this.mapRow(row as any));
  }

  /**
   * Mark notice as printed
   */
  markPrinted(id: string): void {
    const stmt = this.db.prepare(
      'UPDATE notices SET printed_at = datetime(\'now\') WHERE id = ? AND deleted_at IS NULL'
    );
    const result = stmt.run(id);

    if (result.changes === 0) {
      throw new Error('Notice not found');
    }
  }

  /**
   * Generate a unique QR token
   */
  private generateQrToken(): string {
    return `NT-${uuidv4().substring(0, 8).toUpperCase()}`;
  }

  /**
   * Get additional violation details for notice generation
   */
  private getViolationDetails(
    violation: Violation
  ): { licensePlate?: string; positionIdentifier?: string } {
    const details: { licensePlate?: string; positionIdentifier?: string } = {};

    // Get vehicle license plate
    if (violation.vehicleId) {
      const vehicleStmt = this.db.prepare(
        'SELECT license_plate, issuing_state FROM vehicles WHERE id = ?'
      );
      const vehicle = vehicleStmt.get(violation.vehicleId) as any;

      if (vehicle) {
        details.licensePlate = `${vehicle.license_plate} (${vehicle.issuing_state})`;
      }
    }

    // Get parking position identifier
    if (violation.parkingPositionId) {
      const positionStmt = this.db.prepare(
        'SELECT identifier FROM parking_positions WHERE id = ?'
      );
      const position = positionStmt.get(violation.parkingPositionId) as any;

      if (position && position.identifier) {
        details.positionIdentifier = position.identifier;
      }
    }

    return details;
  }

  /**
   * Generate structured notice payload
   */
  private generatePayload(
    violation: Violation,
    details: { licensePlate?: string; positionIdentifier?: string },
    qrToken: string
  ): NoticePayload {
    const detectedDate = new Date(violation.detectedAt);
    const paymentDueDate = new Date(detectedDate);
    const appealDueDate = new Date(detectedDate);

    // Set deadlines based on violation category
    switch (violation.category) {
      case 'FIRE_LANE':
      case 'NO_PARKING_ZONE':
        paymentDueDate.setDate(paymentDueDate.getDate() + 7);
        appealDueDate.setDate(appealDueDate.getDate() + 14);
        break;
      case 'HANDICAPPED_NO_PLACARD':
      case 'UNAUTHORIZED_STALL':
        paymentDueDate.setDate(paymentDueDate.getDate() + 14);
        appealDueDate.setDate(appealDueDate.getDate() + 21);
        break;
      case 'EXPIRED_REGISTRATION':
        paymentDueDate.setDate(paymentDueDate.getDate() + 21);
        appealDueDate.setDate(appealDueDate.getDate() + 30);
        break;
    }

    const instructions = this.generateInstructions(violation.category);

    return {
      violationId: violation.id,
      category: violation.category,
      detectedAt: typeof violation.detectedAt === 'string' ? violation.detectedAt : violation.detectedAt.toISOString(),
      vehicleLicensePlate: details.licensePlate,
      parkingPositionIdentifier: details.positionIdentifier,
      deadlines: {
        paymentDue: paymentDueDate.toISOString(),
        appealDue: appealDueDate.toISOString(),
      },
      instructions,
      qrToken,
    };
  }

  /**
   * Generate category-specific instructions
   */
  private generateInstructions(category: string): string {
    const baseInstructions = `
To view full violation details and evidence, scan this QR code or visit the ticket portal.

Payment Options:
- Online payment via ticket portal
- Mail check to: Cedar Terrace Management, PO Box 123, City, State ZIP

Appeal Process:
- Submit appeal through ticket portal with supporting documentation
- Appeals must be received by the appeal deadline
- You will receive a response within 14 business days

Questions?
Contact: management@cedarterrace.example.com
Phone: (555) 123-4567
`;

    const categorySpecific: Record<string, string> = {
      FIRE_LANE: 'FIRE LANE VIOLATION - This is a safety hazard and may result in immediate towing.',
      HANDICAPPED_NO_PLACARD:
        'HANDICAPPED PARKING VIOLATION - If you have a valid placard, please provide evidence through the appeal process.',
      UNAUTHORIZED_STALL:
        'UNAUTHORIZED STALL USAGE - This parking space is reserved. Continued violations may result in towing.',
      EXPIRED_REGISTRATION:
        'EXPIRED REGISTRATION - Please update your vehicle registration and provide proof through the ticket portal.',
      NO_PARKING_ZONE: 'NO PARKING ZONE VIOLATION - Parking in this area is not permitted at any time.',
    };

    return `${categorySpecific[category] || 'PARKING VIOLATION'}\n${baseInstructions}`;
  }

  private mapRow(row: any): Notice {
    return {
      id: row.id,
      violationId: row.violation_id,
      issuedAt: row.issued_at,
      issuedBy: row.issued_by,
      qrToken: row.qr_token,
      textPayload: row.text_payload,
      printedAt: row.printed_at,
      idempotencyKey: row.idempotency_key,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
    };
  }
}
