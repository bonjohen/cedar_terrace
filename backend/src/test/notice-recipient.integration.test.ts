/**
 * Integration tests for notice issuance and recipient access flow
 * Tests: QR token generation, recipient authentication, profile gating, ticket access
 */

import { NoticeService } from '../domain/notice';
import { RecipientService } from '../domain/recipient';
import { ViolationService } from '../domain/violation';
import { ObservationService } from '../domain/observation';
import { ParkingPositionService } from '../domain/parking-position';
import { StorageService } from '../services/storage';
import { setupTestDatabase, teardownTestDatabase, TestContext } from './integration-helpers';
import { ViolationStatus, ViolationEventType } from '@cedar-terrace/shared';

describe('Notice Issuance and Recipient Access Integration Tests', () => {
  let context: TestContext;
  let noticeService: NoticeService;
  let recipientService: RecipientService;
  let violationService: ViolationService;
  let observationService: ObservationService;
  let parkingPositionService: ParkingPositionService;
  let storageService: StorageService;

  beforeAll(async () => {
    context = await setupTestDatabase();
    observationService = new ObservationService(context.pool);
    violationService = new ViolationService(context.pool);
    parkingPositionService = new ParkingPositionService(context.pool);
    noticeService = new NoticeService(context.pool, violationService);
    storageService = new StorageService();
    recipientService = new RecipientService(
      context.pool,
      noticeService,
      violationService,
      storageService
    );
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  describe('Notice issuance', () => {
    it('should issue notice for eligible violation and generate QR token', async () => {
      // Create observation and violation
      const result = await observationService.submit(
        {
          observedAt: new Date().toISOString(),
          siteId: context.siteId,
          idempotencyKey: 'notice-test-1',
          licensePlate: 'ABC123',
          issuingState: 'CA',
          parkingPositionId: context.positionIds.h1,
          evidence: [{ type: 'TEXT_NOTE', noteText: 'No placard visible' }],
        },
        'test-user'
      );

      const observationId = result.observationId;

      // Derive violation
      const obs = await observationService.getById(observationId);
      if (obs && obs.parkingPositionId) {
        const position = await parkingPositionService.getById(obs.parkingPositionId);
        await violationService.deriveFromObservation(obs, position, 'test-user');
      }

      const violations = await violationService.getByVehicle(context.vehicleIds.abc123);
      const violation = violations.find((v) => v.parkingPositionId === context.positionIds.h1);
      expect(violation).toBeDefined();

      // Make violation notice eligible
      await violationService.addEvent(violation!.id, ViolationEventType.NOTICE_ELIGIBLE, {
        hoursElapsed: 24,
        performedBy: 'system',
      });

      // Issue notice
      const issueResponse = await noticeService.issue(
        {
          idempotencyKey: 'notice-issue-1',
          violationId: violation!.id,
        },
        'admin-user-1'
      );

      expect(issueResponse.noticeId).toBeDefined();
      expect(issueResponse.qrToken).toBeDefined();
      expect(issueResponse.textPayload).toBeDefined();
      expect(issueResponse.created).toBe(true);

      // Verify notice was created
      const notice = await noticeService.getById(issueResponse.noticeId);
      expect(notice).toBeDefined();
      expect(notice!.violationId).toBe(violation!.id);
      expect(notice!.qrToken).toBeDefined();
      expect(notice!.qrToken.length).toBeGreaterThan(5);
      expect(notice!.textPayload).toBeDefined();
      expect(notice!.issuedBy).toBe('admin-user-1');
      expect(notice!.printedAt).toBeNull();

      // Verify payload contains required information
      const payload = JSON.parse(notice!.textPayload);
      expect(payload.category).toBeDefined();
      expect(payload.violationId).toBe(violation!.id);
      expect(payload.deadlines).toBeDefined();
      expect(payload.instructions).toBeDefined();

      // Verify violation status updated
      const updated = await violationService.getById(violation!.id);
      expect(updated!.status).toBe(ViolationStatus.NOTICE_ISSUED);
    });

    it('should enforce idempotency for notice issuance', async () => {
      // Create observation and violation
      const result = await observationService.submit(
        {
          observedAt: new Date().toISOString(),
          siteId: context.siteId,
          idempotencyKey: 'notice-idem-1',
          licensePlate: 'XYZ789',
          issuingState: 'WA',
          parkingPositionId: context.positionIds.h2,
          evidence: [{ type: 'TEXT_NOTE', noteText: 'Test violation' }],
        },
        'test-user'
      );

      const obs = await observationService.getById(result.observationId);
      if (obs && obs.parkingPositionId) {
        const position = await parkingPositionService.getById(obs.parkingPositionId);
        await violationService.deriveFromObservation(obs, position, 'test-user');
      }

      const violations = await violationService.getByVehicle(context.vehicleIds.xyz789);
      const violation = violations.find((v) => v.parkingPositionId === context.positionIds.h2);

      await violationService.addEvent(violation!.id, ViolationEventType.NOTICE_ELIGIBLE, {
        hoursElapsed: 24,
        performedBy: 'system',
      });

      const idempotencyKey = 'notice-idem-key-1';

      // First issuance
      const response1 = await noticeService.issue(
        {
          idempotencyKey,
          violationId: violation!.id,
        },
        'admin-1'
      );

      expect(response1.created).toBe(true);
      const noticeId1 = response1.noticeId;

      // Second issuance with same key
      const response2 = await noticeService.issue(
        {
          idempotencyKey,
          violationId: violation!.id,
        },
        'admin-2' // Different issuer
      );

      expect(response2.created).toBe(false);
      const noticeId2 = response2.noticeId;

      // Should return same notice ID
      expect(noticeId1).toBe(noticeId2);

      // Verify only one notice exists
      const noticesForViolation = await noticeService.getByViolation(violation!.id);
      expect(noticesForViolation).toHaveLength(1);
      expect(noticesForViolation[0].issuedBy).toBe('admin-1'); // Original issuer
    });

    it('should allow multiple notices for same violation with different idempotency keys', async () => {
      // Create observation and violation
      const result = await observationService.submit(
        {
          observedAt: new Date().toISOString(),
          siteId: context.siteId,
          idempotencyKey: 'notice-multi-1',
          licensePlate: 'DEF456',
          issuingState: 'OR',
          parkingPositionId: context.positionIds.p10,
          evidence: [{ type: 'TEXT_NOTE', noteText: 'Unauthorized parking' }],
        },
        'test-user'
      );

      const obs = await observationService.getById(result.observationId);
      if (obs && obs.parkingPositionId) {
        const position = await parkingPositionService.getById(obs.parkingPositionId);
        await violationService.deriveFromObservation(obs, position, 'test-user');
      }

      const violations = await violationService.getByVehicle(context.vehicleIds.def456);
      const violation = violations.find((v) => v.parkingPositionId === context.positionIds.p10);

      await violationService.addEvent(violation!.id, ViolationEventType.NOTICE_ELIGIBLE, {
        hoursElapsed: 24,
        performedBy: 'system',
      });

      // Issue first notice
      const response1 = await noticeService.issue(
        {
          idempotencyKey: 'notice-key-1',
          violationId: violation!.id,
        },
        'admin-1'
      );

      const notice1Id = response1.noticeId;
      expect(response1.created).toBe(true);

      // Issue second notice (e.g., reprint with updated info)
      const response2 = await noticeService.issue(
        {
          idempotencyKey: 'notice-key-2',
          violationId: violation!.id,
        },
        'admin-1'
      );

      const notice2Id = response2.noticeId;
      expect(response2.created).toBe(true);

      expect(notice1Id).not.toBe(notice2Id);

      // Verify both notices exist
      const notices = await noticeService.getByViolation(violation!.id);
      expect(notices).toHaveLength(2);
    });

    it('should mark notice as printed', async () => {
      // Create observation and violation
      const result = await observationService.submit(
        {
          observedAt: new Date().toISOString(),
          siteId: context.siteId,
          idempotencyKey: 'print-test-1',
          licensePlate: 'ABC123',
          issuingState: 'CA',
          parkingPositionId: context.positionIds.p6,
          evidence: [{ type: 'TEXT_NOTE', noteText: 'Test' }],
        },
        'test-user'
      );

      const obs = await observationService.getById(result.observationId);
      if (obs && obs.parkingPositionId) {
        const position = await parkingPositionService.getById(obs.parkingPositionId);
        await violationService.deriveFromObservation(obs, position, 'test-user');
      }

      const violations = await violationService.getByVehicle(context.vehicleIds.abc123);
      const violation = violations.find((v) => v.parkingPositionId === context.positionIds.p6);

      await violationService.addEvent(violation!.id, ViolationEventType.NOTICE_ELIGIBLE, {
        hoursElapsed: 24,
        performedBy: 'system',
      });

      const response = await noticeService.issue(
        {
          idempotencyKey: 'print-notice-1',
          violationId: violation!.id,
        },
        'admin-1'
      );

      const noticeId = response.noticeId;

      // Mark as printed
      await noticeService.markPrinted(noticeId);

      // Verify printed status
      const notice = await noticeService.getById(noticeId);
      expect(notice!.printedAt).toBeDefined();
      expect(notice!.printedAt).not.toBeNull();
    });
  });

  describe('Recipient authentication and activation', () => {
    it('should initiate recipient access with email and send activation', async () => {
      // Create observation, violation, and notice
      const result = await observationService.submit(
        {
          observedAt: new Date().toISOString(),
          siteId: context.siteId,
          idempotencyKey: 'recipient-test-1',
          licensePlate: 'XYZ789',
          issuingState: 'WA',
          parkingPositionId: context.positionIds.h1,
          evidence: [{ type: 'TEXT_NOTE', noteText: 'Test violation for recipient' }],
        },
        'test-user'
      );

      const obs = await observationService.getById(result.observationId);
      if (obs && obs.parkingPositionId) {
        const position = await parkingPositionService.getById(obs.parkingPositionId);
        await violationService.deriveFromObservation(obs, position, 'test-user');
      }

      const violations = await violationService.getByVehicle(context.vehicleIds.xyz789);
      const violation = violations[violations.length - 1];

      await violationService.addEvent(violation.id, ViolationEventType.NOTICE_ELIGIBLE, {
        hoursElapsed: 24,
        performedBy: 'system',
      });

      const issueResponse = await noticeService.issue(
        {
          idempotencyKey: 'recipient-notice-1',
          violationId: violation.id,
        },
        'admin-1'
      );

      const notice = await noticeService.getById(issueResponse.noticeId);

      // Initiate access
      const initiateResult = await recipientService.initiateAccess({
        qrToken: notice!.qrToken,
        email: 'recipient@example.com',
      });

      expect(initiateResult.recipientAccountId).toBeDefined();
      expect(initiateResult.activationRequired).toBe(true);

      // Verify account created
      const account = await context.pool.query(
        'SELECT * FROM recipient_accounts WHERE id = $1',
        [initiateResult.recipientAccountId]
      );
      expect(account.rows).toHaveLength(1);
      expect(account.rows[0].email).toBe('recipient@example.com');
      expect(account.rows[0].email_verified_at).toBeNull();
      expect(account.rows[0].activation_token).toBeDefined();
    });

    it('should activate recipient account with valid activation token', async () => {
      // Create account
      const accountResult = await context.pool.query(
        `INSERT INTO recipient_accounts (email, activation_token, email_verified_at)
         VALUES ($1, $2, $3)
         RETURNING id, activation_token`,
        ['test-activate@example.com', 'test-activation-token-123', null]
      );
      const accountId = accountResult.rows[0].id;
      const activationToken = accountResult.rows[0].activation_token;

      // Activate
      const activatedAccount = await recipientService.activateAccount(activationToken);

      expect(activatedAccount.id).toBe(accountId);
      expect(activatedAccount.emailVerifiedAt).toBeDefined();
      expect(activatedAccount.profileCompletedAt).toBeNull();

      // Verify activation
      const account = await context.pool.query(
        'SELECT email_verified_at FROM recipient_accounts WHERE id = $1',
        [accountId]
      );
      expect(account.rows[0].email_verified_at).not.toBeNull();
    });

    it('should reject invalid activation token', async () => {
      await expect(recipientService.activateAccount('invalid-token-xyz')).rejects.toThrow();
    });
  });

  describe('Profile completion gating', () => {
    it('should require profile completion before ticket access', async () => {
      // Create activated account without profile
      const accountResult = await context.pool.query(
        `INSERT INTO recipient_accounts (email, email_verified_at, first_name, last_name)
         VALUES ($1, CURRENT_TIMESTAMP, $2, $3)
         RETURNING id`,
        ['incomplete-profile@example.com', null, null]
      );
      const accountId = accountResult.rows[0].id;

      // Attempt to get ticket details should fail
      await expect(
        recipientService.getTicketDetails(accountId, 'any-token')
      ).rejects.toThrow(/profile/i);
    });

    it('should allow profile completion', async () => {
      // Create activated account
      const accountResult = await context.pool.query(
        `INSERT INTO recipient_accounts (email, email_verified_at)
         VALUES ($1, CURRENT_TIMESTAMP)
         RETURNING id`,
        ['complete-profile@example.com']
      );
      const accountId = accountResult.rows[0].id;

      // Complete profile
      const completedAccount = await recipientService.completeProfile(accountId, {
        firstName: 'John',
        lastName: 'Doe',
        phoneNumber: '555-123-4567',
      });

      expect(completedAccount.firstName).toBe('John');
      expect(completedAccount.lastName).toBe('Doe');
      expect(completedAccount.phoneNumber).toBe('555-123-4567');
      expect(completedAccount.profileCompletedAt).toBeDefined();

      // Verify profile in database
      const account = await context.pool.query(
        'SELECT first_name, last_name, phone_number, profile_completed_at FROM recipient_accounts WHERE id = $1',
        [accountId]
      );
      expect(account.rows[0].first_name).toBe('John');
      expect(account.rows[0].last_name).toBe('Doe');
      expect(account.rows[0].phone_number).toBe('555-123-4567');
      expect(account.rows[0].profile_completed_at).not.toBeNull();
    });
  });

  describe('Ticket access and viewing', () => {
    it('should provide ticket details for authorized and profiled recipient', async () => {
      // Create observation, violation, and notice
      const result = await observationService.submit(
        {
          observedAt: new Date().toISOString(),
          siteId: context.siteId,
          idempotencyKey: 'ticket-access-1',
          licensePlate: 'ABC123',
          issuingState: 'CA',
          parkingPositionId: context.positionIds.h1,
          evidence: [
            {
              type: 'PHOTO',
              s3Key: 'evidence/ticket-test-1.jpg',
            },
            {
              type: 'TEXT_NOTE',
              noteText: 'Violation for ticket access test',
            },
          ],
        },
        'test-user'
      );

      const obs = await observationService.getById(result.observationId);
      if (obs && obs.parkingPositionId) {
        const position = await parkingPositionService.getById(obs.parkingPositionId);
        await violationService.deriveFromObservation(obs, position, 'test-user');
      }

      const violations = await violationService.getByVehicle(context.vehicleIds.abc123);
      const violation = violations.find((v) => v.parkingPositionId === context.positionIds.h1);

      await violationService.addEvent(violation!.id, ViolationEventType.NOTICE_ELIGIBLE, {
        hoursElapsed: 24,
        performedBy: 'system',
      });

      const issueResponse = await noticeService.issue(
        {
          idempotencyKey: 'ticket-access-notice-1',
          violationId: violation!.id,
        },
        'admin-1'
      );

      const notice = await noticeService.getById(issueResponse.noticeId);

      // Create complete recipient account
      const accountResult = await context.pool.query(
        `INSERT INTO recipient_accounts (
          email, email_verified_at, first_name, last_name, phone_number, profile_completed_at
         )
         VALUES ($1, CURRENT_TIMESTAMP, $2, $3, $4, CURRENT_TIMESTAMP)
         RETURNING id`,
        ['ticket-viewer@example.com', 'Jane', 'Smith', '555-987-6543']
      );
      const accountId = accountResult.rows[0].id;

      // Get ticket details
      const ticket = await recipientService.getTicketDetails(accountId, notice!.qrToken);

      expect(ticket.violation).toBeDefined();
      expect(ticket.violation.category).toBeDefined();
      expect(ticket.violation.status).toBeDefined();
      expect(ticket.violation.detectedAt).toBeDefined();
      expect(ticket.vehicle).toBeDefined();
      expect(ticket.vehicle.licensePlate).toBe('ABC123');
      expect(ticket.vehicle.issuingState).toBe('CA');
      expect(ticket.notice).toBeDefined();
      expect(ticket.notice.issuedAt).toBeDefined();
      expect(ticket.notice.deadlines).toBeDefined();
      expect(ticket.notice.instructions).toBeDefined();
      expect(ticket.evidenceUrls).toBeDefined();

      // Verify access was logged
      const accessLog = await context.pool.query(
        'SELECT * FROM recipient_access_logs WHERE recipient_account_id = $1',
        [accountId]
      );
      expect(accessLog.rows.length).toBeGreaterThan(0);
    });

    it('should prevent access without email verification', async () => {
      // Create unverified account
      const accountResult = await context.pool.query(
        `INSERT INTO recipient_accounts (email, email_verified_at, first_name, last_name, profile_completed_at)
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
         RETURNING id`,
        ['unverified@example.com', null, 'Test', 'User']
      );
      const accountId = accountResult.rows[0].id;

      // Attempt to access ticket
      await expect(
        recipientService.getTicketDetails(accountId, 'any-qr-token')
      ).rejects.toThrow(/email/i);
    });

    it('should prevent access without profile completion', async () => {
      // Create verified account without profile
      const accountResult = await context.pool.query(
        `INSERT INTO recipient_accounts (email, email_verified_at, profile_completed_at)
         VALUES ($1, CURRENT_TIMESTAMP, $2)
         RETURNING id`,
        ['verified-no-profile@example.com', null]
      );
      const accountId = accountResult.rows[0].id;

      // Attempt to access ticket
      await expect(
        recipientService.getTicketDetails(accountId, 'any-qr-token')
      ).rejects.toThrow(/profile/i);
    });
  });

  describe('Access logging', () => {
    it('should log all recipient access attempts', async () => {
      // Create complete recipient account
      const accountResult = await context.pool.query(
        `INSERT INTO recipient_accounts (
          email, email_verified_at, first_name, last_name, profile_completed_at
         )
         VALUES ($1, CURRENT_TIMESTAMP, $2, $3, CURRENT_TIMESTAMP)
         RETURNING id`,
        ['logging-test@example.com', 'Test', 'User']
      );
      const accountId = accountResult.rows[0].id;

      // Create observation, violation, and notice
      const result = await observationService.submit(
        {
          observedAt: new Date().toISOString(),
          siteId: context.siteId,
          idempotencyKey: 'logging-test-1',
          licensePlate: 'ABC123',
          issuingState: 'CA',
          parkingPositionId: context.positionIds.h2,
          evidence: [{ type: 'TEXT_NOTE', noteText: 'Test' }],
        },
        'test-user'
      );

      const obs = await observationService.getById(result.observationId);
      if (obs && obs.parkingPositionId) {
        const position = await parkingPositionService.getById(obs.parkingPositionId);
        await violationService.deriveFromObservation(obs, position, 'test-user');
      }

      const violations = await violationService.getByVehicle(context.vehicleIds.abc123);
      const violation = violations.find((v) => v.parkingPositionId === context.positionIds.h2);

      await violationService.addEvent(violation!.id, ViolationEventType.NOTICE_ELIGIBLE, {
        hoursElapsed: 24,
        performedBy: 'system',
      });

      const issueResponse = await noticeService.issue(
        {
          idempotencyKey: 'logging-notice-1',
          violationId: violation!.id,
        },
        'admin-1'
      );

      const notice = await noticeService.getById(issueResponse.noticeId);

      // Clear any existing logs for this account
      await context.pool.query(
        'DELETE FROM recipient_access_logs WHERE recipient_account_id = $1',
        [accountId]
      );

      // Access ticket twice
      await recipientService.getTicketDetails(
        accountId,
        notice!.qrToken,
        '192.168.1.1',
        'Mozilla/5.0'
      );
      await recipientService.getTicketDetails(
        accountId,
        notice!.qrToken,
        '192.168.1.1',
        'Mozilla/5.0'
      );

      // Verify logs
      const logs = await context.pool.query(
        'SELECT * FROM recipient_access_logs WHERE recipient_account_id = $1 ORDER BY accessed_at',
        [accountId]
      );
      expect(logs.rows.length).toBe(2);
      expect(logs.rows[0].notice_id).toBe(notice!.id);
      expect(logs.rows[1].notice_id).toBe(notice!.id);
    });
  });
});
