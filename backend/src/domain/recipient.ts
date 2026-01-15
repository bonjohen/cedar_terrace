import Database from 'better-sqlite3';
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
    private db: Database.Database,
    private noticeService: NoticeService,
    private violationService: ViolationService,
    private storageService: StorageService
  ) {}

  /**
   * Initiate ticket access from QR code
   * Creates or updates recipient account and sends activation email
   */
  initiateAccess(request: InitiateTicketAccessRequest): InitiateTicketAccessResponse {
    const transaction = this.db.transaction(() => {
      // Verify QR token exists
      const notice = this.noticeService.getByQrToken(request.qrToken);
      if (!notice) {
        throw new Error('Invalid QR token');
      }

      // Find or create recipient account
      let account = this.findByEmail(request.email);

      if (!account) {
        // Create new account
        const activationToken = this.generateActivationToken();
        const accountId = uuidv4();
        const now = new Date().toISOString();

        const stmt = this.db.prepare(
          `INSERT INTO recipient_accounts (id, email, activation_token, activation_sent_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        );

        stmt.run(accountId, request.email, activationToken, now, now, now);

        account = this.getById(accountId);
        if (!account) {
          throw new Error('Failed to create recipient account');
        }

        // Queue activation email (would be sent by email worker)
        // For now, we'll just log it
        console.log(`Activation email queued for ${request.email} with token ${activationToken}`);
      } else if (!account.emailVerifiedAt) {
        // Resend activation if not verified
        const activationToken = this.generateActivationToken();
        const now = new Date().toISOString();

        const updateStmt = this.db.prepare(
          `UPDATE recipient_accounts
           SET activation_token = ?, activation_sent_at = ?
           WHERE id = ?`
        );

        updateStmt.run(activationToken, now, account.id);

        console.log(`Activation email re-queued for ${request.email} with token ${activationToken}`);
      }

      return {
        recipientAccountId: account.id,
        activationRequired: !account.emailVerifiedAt,
      };
    });

    return transaction();
  }

  /**
   * Activate recipient account using emailed token
   */
  activateAccount(activationToken: string): RecipientAccount {
    const now = new Date().toISOString();

    const stmt = this.db.prepare(
      `UPDATE recipient_accounts
       SET email_verified_at = ?, activation_token = NULL
       WHERE activation_token = ? AND deleted_at IS NULL`
    );

    const result = stmt.run(now, activationToken);

    if (result.changes === 0) {
      throw new Error('Invalid or expired activation token');
    }

    // Get the updated account
    const getStmt = this.db.prepare(
      'SELECT * FROM recipient_accounts WHERE email_verified_at = ? AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 1'
    );
    const row = getStmt.get(now) as any;

    if (!row) {
      throw new Error('Failed to retrieve activated account');
    }

    return this.mapAccountRow(row);
  }

  /**
   * Complete recipient profile (required before viewing ticket)
   */
  completeProfile(
    accountId: string,
    request: CompleteRecipientProfileRequest
  ): RecipientAccount {
    const now = new Date().toISOString();

    const stmt = this.db.prepare(
      `UPDATE recipient_accounts
       SET first_name = ?, last_name = ?, phone_number = ?,
           profile_completed_at = ?
       WHERE id = ? AND deleted_at IS NULL`
    );

    const result = stmt.run(
      request.firstName,
      request.lastName,
      request.phoneNumber || null,
      now,
      accountId
    );

    if (result.changes === 0) {
      throw new Error('Recipient account not found');
    }

    const account = this.getById(accountId);
    if (!account) {
      throw new Error('Failed to retrieve updated account');
    }

    return account;
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
    // Verify account and profile completion
    const account = this.getById(accountId);
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
    const notice = this.noticeService.getByQrToken(qrToken);
    if (!notice) {
      throw new Error('Notice not found');
    }

    // Log access (within transaction)
    const transaction = this.db.transaction(() => {
      const logId = uuidv4();
      const now = new Date().toISOString();

      const logStmt = this.db.prepare(
        `INSERT INTO recipient_access_logs (
          id, recipient_account_id, notice_id, ip_address, user_agent, accessed_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      );

      logStmt.run(
        logId,
        accountId,
        notice.id,
        ipAddress || null,
        userAgent || null,
        now,
        now,
        now
      );
    });

    transaction();

    // Get violation details
    const violation = this.violationService.getById(notice.violationId);
    if (!violation) {
      throw new Error('Violation not found');
    }

    // Get vehicle details
    const vehicleStmt = this.db.prepare(
      'SELECT license_plate, issuing_state FROM vehicles WHERE id = ?'
    );
    const vehicle = vehicleStmt.get(violation.vehicleId) as any;

    if (!vehicle) {
      throw new Error('Vehicle not found');
    }

    // Get evidence items
    const evidenceStmt = this.db.prepare(
      `SELECT ei.s3_key
       FROM evidence_items ei
       JOIN violation_events ve ON ve.observation_id = ei.observation_id
       WHERE ve.violation_id = ?
         AND ei.type = 'PHOTO'
         AND ei.deleted_at IS NULL
         AND ve.deleted_at IS NULL
       LIMIT 10`
    );
    const evidenceRows = evidenceStmt.all(violation.id) as any[];

    // Generate pre-signed URLs for evidence
    const evidenceUrls: string[] = [];
    for (const row of evidenceRows) {
      if (row.s3_key) {
        const url = await this.storageService.getDownloadUrl(row.s3_key, 3600);
        evidenceUrls.push(url);
      }
    }

    // Parse notice payload
    const payload = JSON.parse(notice.textPayload);

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
  }

  /**
   * Get recipient account by ID
   */
  getById(id: string): RecipientAccount | null {
    const stmt = this.db.prepare(
      'SELECT * FROM recipient_accounts WHERE id = ? AND deleted_at IS NULL'
    );
    const row = stmt.get(id) as any;

    return row ? this.mapAccountRow(row) : null;
  }

  /**
   * Find recipient account by email
   */
  findByEmail(email: string): RecipientAccount | null {
    const stmt = this.db.prepare(
      'SELECT * FROM recipient_accounts WHERE email = ? AND deleted_at IS NULL'
    );
    const row = stmt.get(email) as any;

    return row ? this.mapAccountRow(row) : null;
  }

  /**
   * Get access logs for a notice
   */
  getAccessLogs(noticeId: string): RecipientAccessLog[] {
    const stmt = this.db.prepare(
      `SELECT * FROM recipient_access_logs
       WHERE notice_id = ? AND deleted_at IS NULL
       ORDER BY accessed_at DESC`
    );
    const rows = stmt.all(noticeId);

    return rows.map((row) => this.mapAccessLogRow(row as any));
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
