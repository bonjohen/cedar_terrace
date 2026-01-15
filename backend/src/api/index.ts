import { Router } from 'express';
import Database from 'better-sqlite3';
import { createParkingPositionRoutes } from './parking-positions';
import { createObservationRoutes } from './observations';
import { createViolationRoutes } from './violations';
import { createStorageRoutes } from './storage';
import { createNoticeRoutes } from './notices';
import { createRecipientRoutes } from './recipients';

export function createApiRouter(db: Database.Database): Router {
  const router = Router();

  // API versioned routes
  const v1 = Router();

  v1.use('/parking-positions', createParkingPositionRoutes(db));
  v1.use('/observations', createObservationRoutes(db));
  v1.use('/violations', createViolationRoutes(db));
  v1.use('/notices', createNoticeRoutes(db));
  v1.use('/recipients', createRecipientRoutes(db));
  v1.use('/storage', createStorageRoutes());

  router.use('/v1', v1);

  return router;
}
