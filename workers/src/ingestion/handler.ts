import { config } from '../config';
import { query } from '../utils/database';
import { receiveMessages, deleteMessage } from '../utils/sqs';
import { createLogger } from '../utils/logger';

const logger = createLogger('ingestion-worker');

interface IngestionMessage {
  action: 'PROCESS_OBSERVATION';
  observationId: string;
  submittedBy: string;
}

interface ObservationRow {
  id: string;
  site_id: string;
  observed_at: Date;
  license_plate: string | null;
  issuing_state: string | null;
  parking_position_id: string | null;
  submitted_by: string;
}

interface EvidenceItemRow {
  id: string;
  observation_id: string;
  type: 'PHOTO' | 'TEXT_NOTE';
  s3_key: string | null;
  note_text: string | null;
  intent: string | null;
}

async function processObservation(observationId: string): Promise<void> {
  logger.info('Processing observation', { observationId });

  // Fetch observation details
  const observations = await query<ObservationRow>(
    `SELECT id, site_id, observed_at, license_plate, issuing_state,
            parking_position_id, submitted_by
     FROM observations
     WHERE id = $1 AND deleted_at IS NULL`,
    [observationId]
  );

  if (observations.length === 0) {
    logger.warn('Observation not found', { observationId });
    return;
  }

  const observation = observations[0];

  // Fetch evidence items
  const evidence = await query<EvidenceItemRow>(
    `SELECT id, observation_id, type, s3_key, note_text, intent
     FROM evidence_items
     WHERE observation_id = $1 AND deleted_at IS NULL`,
    [observationId]
  );

  logger.info('Observation loaded', {
    observationId,
    evidenceCount: evidence.length,
    hasLicensePlate: !!observation.license_plate,
    hasPosition: !!observation.parking_position_id,
  });

  // Validate observation has minimum evidence
  if (evidence.length === 0) {
    logger.error('Observation has no evidence', { observationId });
    return;
  }

  // Check if violations already exist for this observation
  const existingViolations = await query(
    `SELECT id FROM violations
     WHERE id IN (
       SELECT violation_id FROM observation_violations
       WHERE observation_id = $1
     ) AND deleted_at IS NULL`,
    [observationId]
  );

  if (existingViolations.length > 0) {
    logger.info('Violations already exist for observation', {
      observationId,
      violationCount: existingViolations.length,
    });
    return;
  }

  // Derive violations based on parking position and vehicle eligibility
  const violations = await deriveViolations(observation);

  if (violations.length === 0) {
    logger.info('No violations derived from observation', { observationId });
    return;
  }

  logger.info('Violations derived', {
    observationId,
    violationCount: violations.length,
    categories: violations.map((v) => v.category),
  });

  // Create violation records and link to observation
  for (const violation of violations) {
    const violationId = await createViolation(violation);
    await linkObservationToViolation(observationId, violationId);
    logger.info('Violation created and linked', {
      observationId,
      violationId,
      category: violation.category,
    });
  }
}

interface ViolationDerivation {
  category: string;
  vehicleId: string;
  siteId: string;
  parkingPositionId: string | null;
}

async function deriveViolations(
  observation: ObservationRow
): Promise<ViolationDerivation[]> {
  const violations: ViolationDerivation[] = [];

  // Get or create vehicle record
  let vehicleId: string | null = null;

  if (observation.license_plate && observation.issuing_state) {
    const vehicles = await query<{ id: string }>(
      `SELECT id FROM vehicles
       WHERE license_plate = $1 AND issuing_state = $2 AND deleted_at IS NULL`,
      [observation.license_plate, observation.issuing_state]
    );

    if (vehicles.length > 0) {
      vehicleId = vehicles[0].id;
    } else {
      // Create new vehicle record
      const newVehicles = await query<{ id: string }>(
        `INSERT INTO vehicles (id, license_plate, issuing_state)
         VALUES (gen_random_uuid(), $1, $2)
         RETURNING id`,
        [observation.license_plate, observation.issuing_state]
      );
      vehicleId = newVehicles[0].id;
      logger.info('Created new vehicle record', {
        vehicleId,
        licensePlate: observation.license_plate,
      });
    }
  }

  if (!vehicleId) {
    logger.warn('Cannot derive violations without vehicle information', {
      observationId: observation.id,
    });
    return violations;
  }

  // Check if observation is at a specific parking position
  if (observation.parking_position_id) {
    const positions = await query<{ type: string }>(
      `SELECT type FROM parking_positions
       WHERE id = $1 AND deleted_at IS NULL`,
      [observation.parking_position_id]
    );

    if (positions.length === 0) {
      logger.warn('Parking position not found', {
        positionId: observation.parking_position_id,
      });
      return violations;
    }

    const position = positions[0];

    // Derive violation based on position type
    if (position.type === 'HANDICAPPED') {
      // Check for handicapped placard evidence
      const placardEvidence = await query(
        `SELECT id FROM evidence_items
         WHERE observation_id = $1
           AND intent = 'HANDICAPPED_PLACARD'
           AND deleted_at IS NULL`,
        [observation.id]
      );

      if (placardEvidence.length === 0) {
        violations.push({
          category: 'HANDICAPPED_NO_PERMIT',
          vehicleId,
          siteId: observation.site_id,
          parkingPositionId: observation.parking_position_id,
        });
      }
    } else if (position.type === 'PURCHASED' || position.type === 'RESERVED') {
      // Check if vehicle is authorized for this position
      // (This would require vehicle authorization records - simplified for now)
      violations.push({
        category: 'PURCHASED_UNAUTHORIZED',
        vehicleId,
        siteId: observation.site_id,
        parkingPositionId: observation.parking_position_id,
      });
    }
  }

  return violations;
}

async function createViolation(violation: ViolationDerivation): Promise<string> {
  const result = await query<{ id: string }>(
    `INSERT INTO violations (id, category, status, vehicle_id, site_id, parking_position_id, detected_at)
     VALUES (gen_random_uuid(), $1, 'DETECTED', $2, $3, $4, NOW())
     RETURNING id`,
    [
      violation.category,
      violation.vehicleId,
      violation.siteId,
      violation.parkingPositionId,
    ]
  );

  return result[0].id;
}

async function linkObservationToViolation(
  observationId: string,
  violationId: string
): Promise<void> {
  await query(
    `INSERT INTO observation_violations (observation_id, violation_id)
     VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [observationId, violationId]
  );
}

async function processMessages(): Promise<void> {
  try {
    const messages = await receiveMessages<IngestionMessage>(
      config.queues.ingestion,
      config.worker.maxMessagesPerBatch
    );

    if (messages.length === 0) {
      logger.debug('No messages to process');
      return;
    }

    logger.info('Processing ingestion messages', { count: messages.length });

    for (const message of messages) {
      try {
        if (message.body.action === 'PROCESS_OBSERVATION') {
          await processObservation(message.body.observationId);
        } else {
          logger.warn('Unknown action', { action: message.body.action });
        }

        await deleteMessage(config.queues.ingestion, message.receiptHandle);
        logger.debug('Message processed successfully', { messageId: message.id });
      } catch (error) {
        logger.error('Failed to process message', {
          messageId: message.id,
          error: error instanceof Error ? error.message : String(error),
        });
        // Message will become visible again after visibility timeout
      }
    }
  } catch (error) {
    logger.error('Failed to receive messages', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function start(): Promise<void> {
  logger.info('Ingestion worker starting', {
    pollInterval: config.worker.ingestionPollInterval,
    queueUrl: config.queues.ingestion,
  });

  // Start message processing loop
  setInterval(processMessages, config.worker.ingestionPollInterval);

  logger.info('Ingestion worker started successfully');
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.info('Ingestion worker shutting down');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Ingestion worker shutting down');
  process.exit(0);
});

// Start the worker
if (require.main === module) {
  start().catch((error) => {
    logger.error('Failed to start ingestion worker', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  });
}

export { start, processMessages, processObservation };
