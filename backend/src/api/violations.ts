import { Router, Request, Response } from 'express';
import Database from 'better-sqlite3';
import { ViolationService } from '../domain';
import { ViolationEventType } from '@cedar-terrace/shared';

export function createViolationRoutes(db: Database.Database): Router {
  const router = Router();
  const service = new ViolationService(db);

  // Get violation by ID
  router.get('/:id', (req: Request, res: Response) => {
    try {
      const violation = service.getById(req.params.id);
      if (!violation) {
        res.status(404).json({ error: 'Violation not found' });
        return;
      }
      res.json(violation);
    } catch (error) {
      res.status(400).json({ error: String(error) });
    }
  });

  // Get violation timeline events
  router.get('/:id/events', (req: Request, res: Response) => {
    try {
      const events = service.getEvents(req.params.id);
      res.json(events);
    } catch (error) {
      res.status(400).json({ error: String(error) });
    }
  });

  // Get violations for vehicle
  router.get('/vehicle/:vehicleId', (req: Request, res: Response) => {
    try {
      const violations = service.getByVehicle(req.params.vehicleId);
      res.json(violations);
    } catch (error) {
      res.status(400).json({ error: String(error) });
    }
  });

  // Add event to violation (resolve, dismiss, etc.)
  router.post('/:id/events', (req: Request, res: Response) => {
    try {
      const { eventType, notes } = req.body;
      const performedBy = req.headers['x-user-id'] as string || 'ADMIN';

      const event = service.addEvent(req.params.id, eventType as ViolationEventType, {
        notes,
        performedBy,
      });

      res.status(201).json(event);
    } catch (error) {
      res.status(400).json({ error: String(error) });
    }
  });

  // Evaluate timelines (admin trigger for scheduled job)
  router.post('/evaluate-timelines', (_req: Request, res: Response) => {
    try {
      const count = service.evaluateTimelines();
      res.json({ transitionsApplied: count });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  return router;
}
