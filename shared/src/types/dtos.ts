/**
 * Data Transfer Objects for API requests and responses
 */

import {
  ParkingPositionType,
  ViolationCategory,
  ViolationStatus,
  EvidenceIntent,
} from './entities';

// Observation submission DTOs
export interface SubmitObservationRequest {
  idempotencyKey: string;
  siteId: string;
  observedAt: string; // ISO 8601
  licensePlate?: string;
  issuingState?: string;
  registrationMonth?: number;
  registrationYear?: number;
  parkingPositionId?: string;
  evidence: EvidenceSubmission[];
}

export interface EvidenceSubmission {
  type: 'PHOTO' | 'TEXT_NOTE';
  // For photos
  s3Key?: string;
  capturedAt?: string; // ISO 8601
  intent?: EvidenceIntent;
  // For text notes
  noteText?: string;
}

export interface SubmitObservationResponse {
  observationId: string;
  vehicleId?: string;
  violationIds: string[];
  created: boolean; // false if idempotency key matched existing
}

// Parking Position DTOs
export interface CreateParkingPositionRequest {
  siteId: string;
  lotImageId: string;
  type: ParkingPositionType;
  centerX: number;
  centerY: number;
  radius: number;
  identifier?: string;
  rentalInfo?: string;
  assignedVehicleId?: string;
}

export interface UpdateParkingPositionRequest {
  centerX?: number;
  centerY?: number;
  radius?: number;
  type?: ParkingPositionType;
  identifier?: string;
  rentalInfo?: string;
  assignedVehicleId?: string;
}

// Violation DTOs
export interface ViolationSummary {
  id: string;
  category: ViolationCategory;
  status: ViolationStatus;
  detectedAt: string;
  vehicleLicensePlate?: string;
  parkingPositionIdentifier?: string;
  noticeCount: number;
  observationCount: number;
}

export interface ViolationDetail extends ViolationSummary {
  events: ViolationEventDTO[];
  observations: ObservationSummary[];
  notices: NoticeSummary[];
}

export interface ViolationEventDTO {
  id: string;
  eventType: string;
  eventAt: string;
  notes?: string;
  performedBy?: string;
}

export interface ObservationSummary {
  id: string;
  observedAt: string;
  evidenceCount: number;
  submittedBy: string;
}

export interface NoticeSummary {
  id: string;
  issuedAt: string;
  issuedBy: string;
  qrToken: string;
  printedAt?: string;
}

// Notice issuance DTOs
export interface IssueNoticeRequest {
  violationId: string;
  idempotencyKey: string;
}

export interface IssueNoticeResponse {
  noticeId: string;
  qrToken: string;
  textPayload: string;
  created: boolean;
}

// Ticket recipient DTOs
export interface InitiateTicketAccessRequest {
  qrToken: string;
  email: string;
}

export interface InitiateTicketAccessResponse {
  recipientAccountId: string;
  activationRequired: boolean;
}

export interface CompleteRecipientProfileRequest {
  firstName: string;
  lastName: string;
  phoneNumber?: string;
}

export interface TicketDetailResponse {
  violation: {
    category: ViolationCategory;
    status: ViolationStatus;
    detectedAt: string;
  };
  vehicle: {
    licensePlate: string;
    issuingState: string;
  };
  notice: {
    issuedAt: string;
    deadlines: {
      paymentDue?: string;
      appealDue?: string;
    };
    instructions: string;
  };
  evidenceUrls: string[]; // pre-signed URLs
}

// Pre-signed URL request
export interface GetUploadUrlRequest {
  fileName: string;
  contentType: string;
}

export interface GetUploadUrlResponse {
  uploadUrl: string;
  s3Key: string;
  expiresAt: string;
}
