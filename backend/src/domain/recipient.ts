import { Pool } from 'pg';
import {
  RecipientAccount,
  RecipientAccessLog,
  InitiateTicketAccessRequest,
  InitiateTicketAccessResponse,
  CompleteRecipientProfileRequest,
  TicketDetailResponse,
} from '@cedar-terrace/shared';
import { v4 as uuidv4 } from 'uuid';
import { NoticeService } from './notice';
import { ViolationService } from './violation';
import { StorageService } from '../services/storage';

export class RecipientService {
  constructor(
    private pool: Pool,
    private noticeService: NoticeService,
    private violationService: ViolationService,
    private storageService: StorageService
  ) {}

  /**
   * Initiate ticket access from QR code
   * Creates or updates recipient account and sends activation email
   */
  async initiateAccess(request: InitiateTicketAccessRequest): Promise<InitiateTicketAccessResponse> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Verify QR token exists
      const notice = await this.noticeService.getByQrToken(request.qrToken);
      if (!notice) {
        throw new Error('Invalid QR token');
      }

      // Find or create recipient account
      let account = await this.findByEmail(request.email);

      if (!account) {
        // Create new account
        const activationToken = this.generateActivationToken();

        const result = await client.query<RecipientAccount>(
          `INSERT INTO recipient_accounts (email, activation_token, activation_sent_at)
           VALUES ($1, $2, CURRENT_TIMESTAMP)
           RETURNING *`,
          [request.email, activationToken]
        );

        account = this.mapAccountRow(result.rows[0]);

        // Queue activation email (would be sent by email worker)
        // For now, we'll just log it
        console.log(`Activation email queued for ${request.email} with token ${activationToken}`);
      } else if (!account.emailVerifiedAt) {
        // Resend activation if not verified
        const activationToken = this.generateActivationToken();

        await client.query(
          `UPDATE recipient_accounts
           SET activation_token = $1, activation_sent_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [activationToken, account.id]
        );

        console.log(`Activation email re-queued for ${request.email} with token ${activationToken}`);
      }

      await client.query('COMMIT');

      return {
        recipientAccountId: account.id,
        activationRequired: !account.emailVerifiedAt,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Activate recipient account using emailed token
   */
  async activateAccount(activationToken: string): Promise<RecipientAccount> {
    const result = await this.pool.query<RecipientAccount>(
      `UPDATE recipient_accounts
       SET email_verified_at = CURRENT_TIMESTAMP, activation_token = NULL
       WHERE activation_token = $1 AND deleted_at IS NULL
       RETURNING *`,
      [activationToken]
    );

    if (result.rows.length === 0) {
      throw new Error('Invalid or expired activation token');
    }

    return this.mapAccountRow(result.rows[0]);
  }

  /**
   * Complete recipient profile (required before viewing ticket)
   */
  async completeProfile(
    accountId: string,
    request: CompleteRecipientProfileRequest
  ): Promise<RecipientAccount> {
    const result = await this.pool.query<RecipientAccount>(
      `UPDATE recipient_accounts
       SET first_name = $1, last_name = $2, phone_number = $3,
           profile_completed_at = CURRENT_TIMESTAMP
       WHERE id = $4 AND deleted_at IS NULL
       RETURNING *`,
      [request.firstName, request.lastName, request.phoneNumber || null, accountId]
    );

    if (result.rows.length === 0) {
      throw new Error('Recipient account not found');
    }

    return this.mapAccountRow(result.rows[0]);
  }

  /**
   * Get ticket details for recipient (requires profile completion)
   */
  async getTicketDetails(
    accountId: string,
    qrToken: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<TicketDetailResponse> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Verify account and profile completion
      const account = await this.getById(accountId);
      if (!account) {
        throw new Error('Recipient account not found');
      }

      if (!account.emailVerifiedAt) {
        throw new Error('Email not verified');
      }

      if (!account.profileCompletedAt) {
        throw new Error('Profile not completed');
      }

      // Get notice
      const notice = await this.noticeService.getByQrToken(qrToken);
      if (!notice) {
        throw new Error('Notice not found');
      }

      // Log access
      await client.query(
        `INSERT INTO recipient_access_logs (
          recipient_account_id, notice_id, ip_address, user_agent
        ) VALUES ($1, $2, $3, $4)`,
        [accountId, notice.id, ipAddress || null, userAgent || null]
      );

      // Get violation details
      const violation = await this.violationService.getById(notice.violationId);
      if (!violation) {
        throw new Error('Violation not found');
      }

      // Get vehicle details
      const vehicleResult = await client.query(
        'SELECT license_plate, issuing_state FROM vehicles WHERE id = $1',
        [violation.vehicleId]
      );

      if (vehicleResult.rows.length === 0) {
        throw new Error('Vehicle not found');
      }

      const vehicle = vehicleResult.rows[0];

      // Get evidence items
      const evidenceResult = await client.query(
        `SELECT ei.s3_key
         FROM evidence_items ei
         JOIN violation_events ve ON ve.observation_id = ei.observation_id
         WHERE ve.violation_id = $1
           AND ei.type = 'PHOTO'
           AND ei.deleted_at IS NULL
           AND ve.deleted_at IS NULL
         LIMIT 10`,
        [violation.id]
      );

      // Generate pre-signed URLs for evidence
      const evidenceUrls: string[] = [];
      for (const row of evidenceResult.rows) {
        if (row.s3_key) {
          const url = await this.storageService.getDownloadUrl(row.s3_key, 3600);
          evidenceUrls.push(url);
        }
      }

      // Parse notice payload
      const payload = JSON.parse(notice.textPayload);

      await client.query('COMMIT');

      return {
        violation: {
          category: violation.category,
          status: violation.status,
          detectedAt: violation.detectedAt.toISOString(),
        },
        vehicle: {
          licensePlate: vehicle.license_plate,
          issuingState: vehicle.issuing_state,
        },
        notice: {
          issuedAt: notice.issuedAt.toISOString(),
          deadlines: payload.deadlines || {},
          instructions: payload.instructions || '',
        },
        evidenceUrls,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get recipient account by ID
   */
  async getById(id: string): Promise<RecipientAccount | null> {
    const result = await this.pool.query<RecipientAccount>(
      'SELECT * FROM recipient_accounts WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );

    return result.rows.length > 0 ? this.mapAccountRow(result.rows[0]) : null;
  }

  /**
   * Find recipient account by email
   */
  async findByEmail(email: string): Promise<RecipientAccount | null> {
    const result = await this.pool.query<RecipientAccount>(
      'SELECT * FROM recipient_accounts WHERE email = $1 AND deleted_at IS NULL',
      [email]
    );

    return result.rows.length > 0 ? this.mapAccountRow(result.rows[0]) : null;
  }

  /**
   * Get access logs for a notice
   */
  async getAccessLogs(noticeId: string): Promise<RecipientAccessLog[]> {
    const result = await this.pool.query<RecipientAccessLog>(
      `SELECT * FROM recipient_access_logs
       WHERE notice_id = $1 AND deleted_at IS NULL
       ORDER BY accessed_at DESC`,
      [noticeId]
    );

    return result.rows.map(this.mapAccessLogRow);
  }

  /**
   * Generate activation token
   */
  private generateActivationToken(): string {
    return `ACT-${uuidv4()}`;
  }

  private mapAccountRow(row: any): RecipientAccount {
    return {
      id: row.id,
      email: row.email,
      emailVerifiedAt: row.email_verified_at,
      firstName: row.first_name,
      lastName: row.last_name,
      phoneNumber: row.phone_number,
      profileCompletedAt: row.profile_completed_at,
      activationToken: row.activation_token,
      activationSentAt: row.activation_sent_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
    };
  }

  private mapAccessLogRow(row: any): RecipientAccessLog {
    return {
      id: row.id,
      recipientAccountId: row.recipient_account_id,
      noticeId: row.notice_id,
      accessedAt: row.accessed_at,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
    };
  }
}
