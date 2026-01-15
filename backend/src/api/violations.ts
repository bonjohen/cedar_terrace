import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { ViolationService } from '../domain';
import { ViolationEventType } from '@cedar-terrace/shared';

export function createViolationRoutes(pool: Pool): Router {
  const router = Router();
  const service = new ViolationService(pool);

  // Get violation by ID
  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const violation = await service.getById(req.params.id);
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
  router.get('/:id/events', async (req: Request, res: Response) => {
    try {
      const events = await service.getEvents(req.params.id);
      res.json(events);
    } catch (error) {
      res.status(400).json({ error: String(error) });
    }
  });

  // Get violations for vehicle
  router.get('/vehicle/:vehicleId', async (req: Request, res: Response) => {
    try {
      const violations = await service.getByVehicle(req.params.vehicleId);
      res.json(violations);
    } catch (error) {
      res.status(400).json({ error: String(error) });
    }
  });

  // Add event to violation (resolve, dismiss, etc.)
  router.post('/:id/events', async (req: Request, res: Response) => {
    try {
      const { eventType, notes } = req.body;
      const performedBy = req.headers['x-user-id'] as string || 'ADMIN';

      const event = await service.addEvent(req.params.id, eventType as ViolationEventType, {
        notes,
        performedBy,
      });

      res.status(201).json(event);
    } catch (error) {
      res.status(400).json({ error: String(error) });
    }
  });

  // Evaluate timelines (admin trigger for scheduled job)
  router.post('/evaluate-timelines', async (_req: Request, res: Response) => {
    try {
      const count = await service.evaluateTimelines();
      res.json({ transitionsApplied: count });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  return router;
}
