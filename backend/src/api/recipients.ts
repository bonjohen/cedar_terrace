import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import {
  RecipientService,
  NoticeService,
  ViolationService,
} from '../domain';
import { StorageService } from '../services';
import {
  InitiateTicketAccessRequest,
  CompleteRecipientProfileRequest,
} from '@cedar-terrace/shared';

export function createRecipientRoutes(pool: Pool): Router {
  const router = Router();
  const violationService = new ViolationService(pool);
  const noticeService = new NoticeService(pool, violationService);
  const storageService = new StorageService();
  const recipientService = new RecipientService(
    pool,
    noticeService,
    violationService,
    storageService
  );

  // Initiate ticket access from QR code
  router.post('/initiate-access', async (req: Request, res: Response) => {
    try {
      const request = req.body as InitiateTicketAccessRequest;
      const result = await recipientService.initiateAccess(request);
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: String(error) });
    }
  });

  // Activate account with token
  router.post('/activate', async (req: Request, res: Response) => {
    try {
      const { activationToken } = req.body;
      const account = await recipientService.activateAccount(activationToken);
      res.json(account);
    } catch (error) {
      res.status(400).json({ error: String(error) });
    }
  });

  // Complete recipient profile
  router.post('/:accountId/profile', async (req: Request, res: Response) => {
    try {
      const request = req.body as CompleteRecipientProfileRequest;
      const account = await recipientService.completeProfile(req.params.accountId, request);
      res.json(account);
    } catch (error) {
      res.status(400).json({ error: String(error) });
    }
  });

  // Get ticket details (requires authenticated recipient)
  router.get('/:accountId/ticket/:qrToken', async (req: Request, res: Response) => {
    try {
      const ipAddress = req.ip || req.headers['x-forwarded-for'] as string;
      const userAgent = req.headers['user-agent'];

      const ticketDetails = await recipientService.getTicketDetails(
        req.params.accountId,
        req.params.qrToken,
        ipAddress,
        userAgent
      );

      res.json(ticketDetails);
    } catch (error) {
      const errorMessage = String(error);
      if (errorMessage.includes('not verified') || errorMessage.includes('not completed')) {
        res.status(403).json({ error: errorMessage });
      } else {
        res.status(400).json({ error: errorMessage });
      }
    }
  });

  // Get recipient account
  router.get('/:accountId', async (req: Request, res: Response) => {
    try {
      const account = await recipientService.getById(req.params.accountId);
      if (!account) {
        res.status(404).json({ error: 'Recipient account not found' });
        return;
      }
      res.json(account);
    } catch (error) {
      res.status(400).json({ error: String(error) });
    }
  });

  // Get access logs for a notice (admin only)
  router.get('/logs/notice/:noticeId', async (req: Request, res: Response) => {
    try {
      const logs = await recipientService.getAccessLogs(req.params.noticeId);
      res.json(logs);
    } catch (error) {
      res.status(400).json({ error: String(error) });
    }
  });

  return router;
}
