import { Router, Request, Response } from 'express';
import Database from 'better-sqlite3';
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

export function createRecipientRoutes(db: Database.Database): Router {
  const router = Router();
  const violationService = new ViolationService(db);
  const noticeService = new NoticeService(db, violationService);
  const storageService = new StorageService();
  const recipientService = new RecipientService(
    db,
    noticeService,
    violationService,
    storageService
  );

  // Initiate ticket access from QR code
  router.post('/initiate-access', (req: Request, res: Response) => {
    try {
      const request = req.body as InitiateTicketAccessRequest;
      const result = recipientService.initiateAccess(request);
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: String(error) });
    }
  });

  // Activate account with token
  router.post('/activate', (req: Request, res: Response) => {
    try {
      const { activationToken } = req.body;
      const account = recipientService.activateAccount(activationToken);
      res.json(account);
    } catch (error) {
      res.status(400).json({ error: String(error) });
    }
  });

  // Complete recipient profile
  router.post('/:accountId/profile', (req: Request, res: Response) => {
    try {
      const request = req.body as CompleteRecipientProfileRequest;
      const account = recipientService.completeProfile(req.params.accountId, request);
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
  router.get('/:accountId', (req: Request, res: Response) => {
    try {
      const account = recipientService.getById(req.params.accountId);
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
  router.get('/logs/notice/:noticeId', (req: Request, res: Response) => {
    try {
      const logs = recipientService.getAccessLogs(req.params.noticeId);
      res.json(logs);
    } catch (error) {
      res.status(400).json({ error: String(error) });
    }
  });

  return router;
}
