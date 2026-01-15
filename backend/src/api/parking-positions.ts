import { Router, Request, Response } from 'express';
import Database from 'better-sqlite3';
import { ParkingPositionService } from '../domain';
import { CreateParkingPositionRequest, UpdateParkingPositionRequest } from '@cedar-terrace/shared';

export function createParkingPositionRoutes(db: Database.Database): Router {
  const router = Router();
  const service = new ParkingPositionService(db);

  // Create parking position
  router.post('/', (req: Request, res: Response) => {
    try {
      const request = req.body as CreateParkingPositionRequest;
      const position = service.create(request);
      res.status(201).json(position);
    } catch (error) {
      res.status(400).json({ error: String(error) });
    }
  });

  // Get parking position by ID
  router.get('/:id', (req: Request, res: Response) => {
    try {
      const position = service.getById(req.params.id);
      res.json(position);
    } catch (error) {
      res.status(404).json({ error: String(error) });
    }
  });

  // Update parking position
  router.patch('/:id', (req: Request, res: Response) => {
    try {
      const request = req.body as UpdateParkingPositionRequest;
      const position = service.update(req.params.id, request);
      res.json(position);
    } catch (error) {
      res.status(400).json({ error: String(error) });
    }
  });

  // Get all positions for a site
  router.get('/site/:siteId', (req: Request, res: Response) => {
    try {
      const positions = service.getBySite(req.params.siteId);
      res.json(positions);
    } catch (error) {
      res.status(400).json({ error: String(error) });
    }
  });

  // Soft delete parking position
  router.delete('/:id', (req: Request, res: Response) => {
    try {
      service.softDelete(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(404).json({ error: String(error) });
    }
  });

  // Find position at point (for observation matching)
  router.post('/find-at-point', (req: Request, res: Response) => {
    try {
      const { lotImageId, x, y } = req.body;
      const position = service.findPositionAtPoint(lotImageId, x, y);
      res.json(position);
    } catch (error) {
      res.status(400).json({ error: String(error) });
    }
  });

  return router;
}
