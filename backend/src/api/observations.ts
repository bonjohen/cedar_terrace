import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { ObservationService, ViolationService, ParkingPositionService } from '../domain';
import { HandicappedEnforcementService } from '../domain/handicapped';
import { SubmitObservationRequest, EvidenceIntent } from '@cedar-terrace/shared';

export function createObservationRoutes(pool: Pool): Router {
  const router = Router();
  const observationService = new ObservationService(pool);
  const violationService = new ViolationService(pool);
  const positionService = new ParkingPositionService(pool);
  const handicappedService = new HandicappedEnforcementService(pool, violationService);

  // Submit observation (idempotent)
  router.post('/submit', async (req: Request, res: Response) => {
    try {
      const request = req.body as SubmitObservationRequest;
      const submittedBy = req.headers['x-user-id'] as string || 'ADMIN';

      // Submit observation
      const result = await observationService.submit(request, submittedBy);

      // If this is a new observation, derive violations
      if (result.created && result.observationId) {
        const observation = await observationService.getById(result.observationId);
        if (observation) {
          // Get parking position if referenced
          let position = null;
          if (observation.parkingPositionId) {
            position = await positionService.getById(observation.parkingPositionId);
          }

          // Derive violations
          const violationIds = await violationService.deriveFromObservation(
            observation,
            position,
            submittedBy
          );

          result.violationIds = violationIds;

          // Check for handicapped placard evidence and re-evaluate
          const evidence = await observationService.getEvidence(observation.id);
          const hasPlacardEvidence = evidence.some(
            (e) => e.intent === EvidenceIntent.HANDICAPPED_PLACARD
          );

          if (hasPlacardEvidence && observation.vehicleId) {
            await handicappedService.evaluateHandicappedCompliance(
              observation.vehicleId,
              observation.id
            );
          }
        }
      }

      res.status(result.created ? 201 : 200).json(result);
    } catch (error) {
      res.status(400).json({ error: String(error) });
    }
  });

  // Get observation by ID
  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const observation = await observationService.getById(req.params.id);
      if (!observation) {
        res.status(404).json({ error: 'Observation not found' });
        return;
      }
      res.json(observation);
    } catch (error) {
      res.status(400).json({ error: String(error) });
    }
  });

  // Get evidence for observation
  router.get('/:id/evidence', async (req: Request, res: Response) => {
    try {
      const evidence = await observationService.getEvidence(req.params.id);
      res.json(evidence);
    } catch (error) {
      res.status(400).json({ error: String(error) });
    }
  });

  // Get observations for vehicle
  router.get('/vehicle/:vehicleId', async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const observations = await observationService.getByVehicle(req.params.vehicleId, limit);
      res.json(observations);
    } catch (error) {
      res.status(400).json({ error: String(error) });
    }
  });

  // Get observations for parking position
  router.get('/position/:positionId', async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const observations = await observationService.getByPosition(req.params.positionId, limit);
      res.json(observations);
    } catch (error) {
      res.status(400).json({ error: String(error) });
    }
  });

  return router;
}
