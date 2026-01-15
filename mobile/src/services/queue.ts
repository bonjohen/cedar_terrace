import { v4 as uuidv4 } from 'uuid';
import type { QueueObservation, QueueEvidence, QueueStatus } from '../types';
import * as db from './database';

/**
 * Add observation to queue
 */
export async function addToQueue(
  observation: Omit<QueueObservation, 'id' | 'idempotencyKey' | 'status' | 'createdAt'>,
  evidence: Omit<QueueEvidence, 'id' | 'queueObservationId'>[]
): Promise<string> {
  const observationId = uuidv4();
  const idempotencyKey = `mobile-${uuidv4()}`;

  const queueObservation: QueueObservation = {
    ...observation,
    id: observationId,
    idempotencyKey,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  const queueEvidence: QueueEvidence[] = evidence.map((item) => ({
    ...item,
    id: uuidv4(),
    queueObservationId: observationId,
  }));

  // Insert into database
  await db.insertQueueObservation(queueObservation);
  await db.insertQueueEvidence(queueEvidence);

  return observationId;
}

/**
 * Get all observations in queue
 */
export async function getQueue(): Promise<QueueObservation[]> {
  return db.getAllQueueObservations();
}

/**
 * Get observations by status
 */
export async function getQueueByStatus(status: QueueStatus): Promise<QueueObservation[]> {
  return db.getQueueObservationsByStatus(status);
}

/**
 * Get pending observations for sync
 */
export async function getPendingForSync(): Promise<QueueObservation[]> {
  return db.getPendingObservations();
}

/**
 * Get evidence for an observation
 */
export async function getEvidence(queueObservationId: string): Promise<QueueEvidence[]> {
  return db.getQueueEvidence(queueObservationId);
}

/**
 * Update observation status
 */
export async function updateStatus(
  id: string,
  status: QueueStatus,
  errorMessage?: string
): Promise<void> {
  await db.updateObservationStatus(id, status, errorMessage);
}

/**
 * Update backend observation ID after submission
 */
export async function updateBackendId(
  id: string,
  backendObservationId: string
): Promise<void> {
  await db.updateBackendObservationId(id, backendObservationId);
}

/**
 * Update evidence S3 key after upload
 */
export async function updateEvidenceS3Key(
  evidenceId: string,
  s3Key: string
): Promise<void> {
  await db.updateEvidenceS3Key(evidenceId, s3Key);
}

/**
 * Remove observation from queue
 */
export async function removeFromQueue(id: string): Promise<void> {
  await db.deleteQueueObservation(id);
}

/**
 * Clear submitted observations
 */
export async function clearSubmitted(): Promise<number> {
  return db.deleteSubmittedObservations();
}

/**
 * Get queue statistics
 */
export async function getQueueStats() {
  return db.getQueueStats();
}

/**
 * Clear all queue data (for debugging)
 */
export async function clearAllQueue(): Promise<void> {
  await db.clearAllData();
}
