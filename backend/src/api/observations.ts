import { Router, Request, Response } from 'express';
import Database from 'better-sqlite3';
import { ObservationService, ViolationService, ParkingPositionService } from '../domain';
import { HandicappedEnforcementService } from '../domain/handicapped';
import { SubmitObservationRequest, EvidenceIntent } from '@cedar-terrace/shared';

export function createObservationRoutes(db: Database.Database): Router {
  const router = Router();
  const observationService = new ObservationService(db);
  const violationService = new ViolationService(db);
  const positionService = new ParkingPositionService(db);
  const handicappedService = new HandicappedEnforcementService(db, violationService);

  // Submit observation (idempotent)
  router.post('/submit', (req: Request, res: Response) => {
    try {
      const request = req.body as SubmitObservationRequest;
      const submittedBy = req.headers['x-user-id'] as string || 'ADMIN';

      // Submit observation
      const result = observationService.submit(request, submittedBy);

      // If this is a new observation, derive violations
      if (result.created && result.observationId) {
        const observation = observationService.getById(result.observationId);
        if (observation) {
          // Get parking position if referenced
          let position = null;
          if (observation.parkingPositionId) {
            position = positionService.getById(observation.parkingPositionId);
          }

          // Derive violations
          const violationIds = violationService.deriveFromObservation(
            observation,
            position,
            submittedBy
          );

          result.violationIds = violationIds;

          // Check for handicapped placard evidence and re-evaluate
          const evidence = observationService.getEvidence(observation.id);
          const hasPlacardEvidence = evidence.some(
            (e) => e.intent === EvidenceIntent.HANDICAPPED_PLACARD
          );

          if (hasPlacardEvidence && observation.vehicleId) {
            handicappedService.evaluateHandicappedCompliance(
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
  router.get('/:id', (req: Request, res: Response) => {
    try {
      const observation = observationService.getById(req.params.id);
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
  router.get('/:id/evidence', (req: Request, res: Response) => {
    try {
      const evidence = observationService.getEvidence(req.params.id);
      res.json(evidence);
    } catch (error) {
      res.status(400).json({ error: String(error) });
    }
  });

  // Get observations for vehicle
  router.get('/vehicle/:vehicleId', (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const observations = observationService.getByVehicle(req.params.vehicleId, limit);
      res.json(observations);
    } catch (error) {
      res.status(400).json({ error: String(error) });
    }
  });

  // Get observations for parking position
  router.get('/position/:positionId', (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const observations = observationService.getByPosition(req.params.positionId, limit);
      res.json(observations);
    } catch (error) {
      res.status(400).json({ error: String(error) });
    }
  });

  return router;
}
