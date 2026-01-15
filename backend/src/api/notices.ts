import { Router, Request, Response } from 'express';
import Database from 'better-sqlite3';
import { NoticeService, ViolationService } from '../domain';
import { IssueNoticeRequest } from '@cedar-terrace/shared';

export function createNoticeRoutes(db: Database.Database): Router {
  const router = Router();
  const violationService = new ViolationService(db);
  const noticeService = new NoticeService(db, violationService);

  // Issue notice (idempotent)
  router.post('/issue', (req: Request, res: Response) => {
    try {
      const request = req.body as IssueNoticeRequest;
      const issuedBy = req.headers['x-user-id'] as string || 'ADMIN';

      const result = noticeService.issue(request, issuedBy);
      res.status(result.created ? 201 : 200).json(result);
    } catch (error) {
      res.status(400).json({ error: String(error) });
    }
  });

  // Get notice by ID
  router.get('/:id', (req: Request, res: Response) => {
    try {
      const notice = noticeService.getById(req.params.id);
      if (!notice) {
        res.status(404).json({ error: 'Notice not found' });
        return;
      }
      res.json(notice);
    } catch (error) {
      res.status(400).json({ error: String(error) });
    }
  });

  // Get notices for violation
  router.get('/violation/:violationId', (req: Request, res: Response) => {
    try {
      const notices = noticeService.getByViolation(req.params.violationId);
      res.json(notices);
    } catch (error) {
      res.status(400).json({ error: String(error) });
    }
  });

  // Mark notice as printed
  router.post('/:id/printed', (req: Request, res: Response) => {
    try {
      noticeService.markPrinted(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(404).json({ error: String(error) });
    }
  });

  return router;
}
