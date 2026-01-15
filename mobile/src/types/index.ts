// Re-export shared types
export type {
  Site,
  ParkingPosition,
  Observation,
  EvidenceItem,
  EvidenceIntent,
  SubmitObservationRequest,
  SubmitObservationResponse,
  EvidenceSubmission,
} from '@cedar-terrace/shared';

// Local types for mobile app
export type QueueStatus = 'pending' | 'uploading' | 'submitting' | 'submitted' | 'failed';

export interface QueueObservation {
  id: string;                      // Local UUID
  idempotencyKey: string;          // For backend submission
  siteId: string;
  observedAt: string;              // ISO 8601
  licensePlate?: string;
  issuingState?: string;
  registrationMonth?: number;
  registrationYear?: number;
  parkingPositionId?: string;
  status: QueueStatus;
  errorMessage?: string;
  backendObservationId?: string;   // After successful submission
  createdAt: string;
}

export interface QueueEvidence {
  id: string;                      // Local UUID
  queueObservationId: string;      // FK to queue_observations
  type: 'PHOTO' | 'TEXT_NOTE';
  intent?: string;                 // EvidenceIntent
  noteText?: string;
  localPhotoUri?: string;          // Device file path
  s3Key?: string;                  // After upload
  capturedAt?: string;             // ISO 8601
}

export interface LocalPhoto {
  uri: string;
  intent: string;
  capturedAt: string;
}

export interface TextNote {
  text: string;
  intent?: string;
}
