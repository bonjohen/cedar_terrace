import { Router } from 'express';
import { Pool } from 'pg';
import { createParkingPositionRoutes } from './parking-positions';
import { createObservationRoutes } from './observations';
import { createViolationRoutes } from './violations';
import { createStorageRoutes } from './storage';

export function createApiRouter(pool: Pool): Router {
  const router = Router();

  // API versioned routes
  const v1 = Router();

  v1.use('/parking-positions', createParkingPositionRoutes(pool));
  v1.use('/observations', createObservationRoutes(pool));
  v1.use('/violations', createViolationRoutes(pool));
  v1.use('/storage', createStorageRoutes());

  router.use('/v1', v1);

  return router;
}
