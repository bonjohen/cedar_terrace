import { Pool } from 'pg';
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
    private pool: Pool,
    private violationService: ViolationService
  ) {}

  /**
   * Issue a notice for a violation (idempotent)
   */
  async issue(
    request: IssueNoticeRequest,
    issuedBy: string
  ): Promise<IssueNoticeResponse> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Check for existing notice with this idempotency key
      const existingResult = await client.query<Notice>(
        'SELECT * FROM notices WHERE idempotency_key = $1 AND deleted_at IS NULL',
        [request.idempotencyKey]
      );

      if (existingResult.rows.length > 0) {
        const existing = existingResult.rows[0];
        await client.query('COMMIT');

        return {
          noticeId: existing.id,
          qrToken: existing.qr_token,
          textPayload: existing.text_payload,
          created: false,
        };
      }

      // Get violation details
      const violation = await this.violationService.getById(request.violationId);
      if (!violation) {
        throw new Error('Violation not found');
      }

      // Generate QR token
      const qrToken = this.generateQrToken();

      // Get additional details for notice
      const details = await this.getViolationDetails(client, violation);

      // Generate notice payload
      const payload = this.generatePayload(violation, details, qrToken);

      // Create notice
      const noticeResult = await client.query<Notice>(
        `INSERT INTO notices (
          violation_id, issued_by, qr_token, text_payload, idempotency_key
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING *`,
        [
          request.violationId,
          issuedBy,
          qrToken,
          JSON.stringify(payload),
          request.idempotencyKey,
        ]
      );

      const notice = noticeResult.rows[0];

      // Add violation event
      await this.violationService.addEvent(
        request.violationId,
        ViolationEventType.NOTICE_ISSUED,
        {
          noticeId: notice.id,
          performedBy: issuedBy,
        }
      );

      await client.query('COMMIT');

      return {
        noticeId: notice.id,
        qrToken,
        textPayload: JSON.stringify(payload),
        created: true,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get notice by ID
   */
  async getById(id: string): Promise<Notice | null> {
    const result = await this.pool.query<Notice>(
      'SELECT * FROM notices WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );

    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Get notice by QR token
   */
  async getByQrToken(qrToken: string): Promise<Notice | null> {
    const result = await this.pool.query<Notice>(
      'SELECT * FROM notices WHERE qr_token = $1 AND deleted_at IS NULL',
      [qrToken]
    );

    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Get all notices for a violation
   */
  async getByViolation(violationId: string): Promise<Notice[]> {
    const result = await this.pool.query<Notice>(
      `SELECT * FROM notices
       WHERE violation_id = $1 AND deleted_at IS NULL
       ORDER BY issued_at DESC`,
      [violationId]
    );

    return result.rows.map(this.mapRow);
  }

  /**
   * Mark notice as printed
   */
  async markPrinted(id: string): Promise<void> {
    const result = await this.pool.query(
      'UPDATE notices SET printed_at = CURRENT_TIMESTAMP WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );

    if (result.rowCount === 0) {
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
  private async getViolationDetails(
    client: any,
    violation: Violation
  ): Promise<{ licensePlate?: string; positionIdentifier?: string }> {
    const details: { licensePlate?: string; positionIdentifier?: string } = {};

    // Get vehicle license plate
    if (violation.vehicleId) {
      const vehicleResult = await client.query(
        'SELECT license_plate, issuing_state FROM vehicles WHERE id = $1',
        [violation.vehicleId]
      );
      if (vehicleResult.rows.length > 0) {
        const vehicle = vehicleResult.rows[0];
        details.licensePlate = `${vehicle.license_plate} (${vehicle.issuing_state})`;
      }
    }

    // Get parking position identifier
    if (violation.parkingPositionId) {
      const positionResult = await client.query(
        'SELECT identifier FROM parking_positions WHERE id = $1',
        [violation.parkingPositionId]
      );
      if (positionResult.rows.length > 0 && positionResult.rows[0].identifier) {
        details.positionIdentifier = positionResult.rows[0].identifier;
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
      detectedAt: violation.detectedAt.toISOString(),
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
