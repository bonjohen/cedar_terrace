import type { EvidenceSubmission } from '@cedar-terrace/shared';
import { apiClient, ApiError } from './client';
import * as queueService from '../services/queue';
import type { QueueObservation, QueueEvidence } from '../types';
import * as storage from '../services/storage';

/**
 * Sync Service
 * Handles background synchronization of queued observations
 */
class SyncService {
  private isSyncing = false;

  /**
   * Sync all pending observations to backend
   */
  async syncQueue(): Promise<{
    synced: number;
    failed: number;
    errors: Array<{ id: string; error: string }>;
  }> {
    if (this.isSyncing) {
      console.log('Sync already in progress');
      return { synced: 0, failed: 0, errors: [] };
    }

    this.isSyncing = true;
    const results = { synced: 0, failed: 0, errors: [] as Array<{ id: string; error: string }> };

    try {
      // Get all pending or failed observations
      const observations = await queueService.getPendingForSync();
      console.log(`Starting sync for ${observations.length} observations`);

      // Process each observation
      for (const obs of observations) {
        try {
          await this.syncObservation(obs);
          results.synced++;
        } catch (error) {
          results.failed++;
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          results.errors.push({ id: obs.id, error: errorMessage });
          console.error(`Failed to sync observation ${obs.id}:`, error);
        }
      }

      // Update last sync timestamp
      await storage.setSyncTimestamp(new Date());

      console.log(`Sync complete: ${results.synced} synced, ${results.failed} failed`);
    } finally {
      this.isSyncing = false;
    }

    return results;
  }

  /**
   * Sync a single observation
   */
  private async syncObservation(obs: QueueObservation): Promise<void> {
    // Update status to uploading
    await queueService.updateStatus(obs.id, 'uploading');

    // Load evidence items
    const evidence = await queueService.getEvidence(obs.id);

    // Upload photos and build evidence submissions
    const uploadedEvidence: EvidenceSubmission[] = [];

    for (const item of evidence) {
      if (item.type === 'PHOTO') {
        // Upload photo if not already uploaded
        if (!item.s3Key && item.localPhotoUri) {
          try {
            const s3Key = await this.uploadPhoto(item.localPhotoUri);

            // Update evidence record with s3Key
            await queueService.updateEvidenceS3Key(item.id, s3Key);
            item.s3Key = s3Key;
          } catch (error) {
            console.error(`Failed to upload photo for evidence ${item.id}:`, error);
            throw new Error(`Photo upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }

        // Add photo evidence
        uploadedEvidence.push({
          type: 'PHOTO',
          s3Key: item.s3Key!,
          intent: item.intent,
          capturedAt: item.capturedAt,
        });
      } else if (item.type === 'TEXT_NOTE') {
        // Add text note evidence
        uploadedEvidence.push({
          type: 'TEXT_NOTE',
          noteText: item.noteText!,
          intent: item.intent,
        });
      }
    }

    // Update status to submitting
    await queueService.updateStatus(obs.id, 'submitting');

    // Submit observation to backend (idempotent)
    try {
      const response = await apiClient.submitObservation({
        idempotencyKey: obs.idempotencyKey,
        siteId: obs.siteId,
        observedAt: obs.observedAt,
        licensePlate: obs.licensePlate,
        issuingState: obs.issuingState,
        registrationMonth: obs.registrationMonth,
        registrationYear: obs.registrationYear,
        parkingPositionId: obs.parkingPositionId,
        evidence: uploadedEvidence,
      });

      // Mark as submitted
      await queueService.updateStatus(obs.id, 'submitted');

      // Store backend observation ID
      await queueService.updateBackendId(obs.id, response.observationId);

      console.log(`Successfully synced observation ${obs.id} -> ${response.observationId}`);
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 409) {
        // HTTP 409 = idempotency conflict = already submitted
        console.log(`Observation ${obs.id} already submitted (idempotency)`);
        await queueService.updateStatus(obs.id, 'submitted');
      } else {
        // Other errors = mark as failed
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        await queueService.updateStatus(obs.id, 'failed', errorMessage);
        throw error;
      }
    }
  }

  /**
   * Upload a single photo to S3
   */
  private async uploadPhoto(localPhotoUri: string): Promise<string> {
    // Extract filename from URI
    const fileName = this.extractFileName(localPhotoUri);

    // Request pre-signed URL
    const { uploadUrl, s3Key } = await apiClient.getUploadUrl(fileName, 'image/jpeg');

    // Upload to S3
    await apiClient.uploadPhoto(uploadUrl, localPhotoUri, 'image/jpeg');

    return s3Key;
  }

  /**
   * Extract filename from URI
   */
  private extractFileName(uri: string): string {
    const parts = uri.split('/');
    const fileName = parts[parts.length - 1];

    // Ensure .jpg extension
    if (!fileName.includes('.')) {
      return `${fileName}.jpg`;
    }

    return fileName;
  }

  /**
   * Check if sync is in progress
   */
  isSyncInProgress(): boolean {
    return this.isSyncing;
  }
}

// Export singleton instance
export const syncService = new SyncService();
