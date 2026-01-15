import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { ParkingPositionService } from '../domain';
import { CreateParkingPositionRequest, UpdateParkingPositionRequest } from '@cedar-terrace/shared';

export function createParkingPositionRoutes(pool: Pool): Router {
  const router = Router();
  const service = new ParkingPositionService(pool);

  // Create parking position
  router.post('/', async (req: Request, res: Response) => {
    try {
      const request = req.body as CreateParkingPositionRequest;
      const position = await service.create(request);
      res.status(201).json(position);
    } catch (error) {
      res.status(400).json({ error: String(error) });
    }
  });

  // Get parking position by ID
  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const position = await service.getById(req.params.id);
      res.json(position);
    } catch (error) {
      res.status(404).json({ error: String(error) });
    }
  });

  // Update parking position
  router.patch('/:id', async (req: Request, res: Response) => {
    try {
      const request = req.body as UpdateParkingPositionRequest;
      const position = await service.update(req.params.id, request);
      res.json(position);
    } catch (error) {
      res.status(400).json({ error: String(error) });
    }
  });

  // Get all positions for a site
  router.get('/site/:siteId', async (req: Request, res: Response) => {
    try {
      const positions = await service.getBySite(req.params.siteId);
      res.json(positions);
    } catch (error) {
      res.status(400).json({ error: String(error) });
    }
  });

  // Soft delete parking position
  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      await service.softDelete(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(404).json({ error: String(error) });
    }
  });

  // Find position at point (for observation matching)
  router.post('/find-at-point', async (req: Request, res: Response) => {
    try {
      const { lotImageId, x, y } = req.body;
      const position = await service.findPositionAtPoint(lotImageId, x, y);
      res.json(position);
    } catch (error) {
      res.status(400).json({ error: String(error) });
    }
  });

  return router;
}
