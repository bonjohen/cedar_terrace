/**
 * Core domain entities for the parking enforcement system
 * All entities support soft delete via deletedAt timestamp
 */

export interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface Site extends BaseEntity {
  name: string;
  address: string;
  timezone: string;
  isActive: boolean;
}

export interface LotImage extends BaseEntity {
  siteId: string;
  s3Key: string;
  width: number;
  height: number;
  uploadedAt: Date;
  isActive: boolean;
}

export enum ParkingPositionType {
  OPEN = 'OPEN',
  PURCHASED = 'PURCHASED',
  RESERVED = 'RESERVED',
  HANDICAPPED = 'HANDICAPPED',
}

export interface ParkingPosition extends BaseEntity {
  siteId: string;
  lotImageId: string;
  type: ParkingPositionType;
  centerX: number;
  centerY: number;
  radius: number;
  identifier: string | null; // e.g., stall number for purchased/reserved
  rentalInfo: string | null; // metadata for purchased stalls
  assignedVehicleId: string | null; // for purchased/reserved stalls
}

export interface Vehicle extends BaseEntity {
  licensePlate: string;
  issuingState: string;
  make: string | null;
  model: string | null;
  color: string | null;
  lastObservedAt: Date;
}

export enum EvidenceIntent {
  PRIMARY_VEHICLE = 'PRIMARY_VEHICLE',
  SECONDARY_VEHICLE = 'SECONDARY_VEHICLE',
  REGISTRATION_UPDATE = 'REGISTRATION_UPDATE',
  HANDICAPPED_PLACARD = 'HANDICAPPED_PLACARD',
  GENERAL = 'GENERAL',
}

export interface EvidenceItem extends BaseEntity {
  observationId: string;
  type: 'PHOTO' | 'TEXT_NOTE';
  // Photo fields
  s3Key: string | null;
  s3Hash: string | null;
  capturedAt: Date | null;
  intent: EvidenceIntent | null;
  // Text note fields
  noteText: string | null;
  // Metadata
  metadata: Record<string, unknown>;
}

export interface Observation extends BaseEntity {
  siteId: string;
  vehicleId: string | null;
  parkingPositionId: string | null;
  observedAt: Date;
  licensePlate: string | null;
  issuingState: string | null;
  registrationMonth: number | null;
  registrationYear: number | null;
  idempotencyKey: string; // client-generated for sync
  submittedAt: Date;
  submittedBy: string; // admin user ID
}

export enum ViolationCategory {
  UNAUTHORIZED_STALL = 'UNAUTHORIZED_STALL',
  HANDICAPPED_NO_PLACARD = 'HANDICAPPED_NO_PLACARD',
  EXPIRED_REGISTRATION = 'EXPIRED_REGISTRATION',
  FIRE_LANE = 'FIRE_LANE',
  NO_PARKING_ZONE = 'NO_PARKING_ZONE',
}

export enum ViolationStatus {
  DETECTED = 'DETECTED',
  NOTICE_ELIGIBLE = 'NOTICE_ELIGIBLE',
  NOTICE_ISSUED = 'NOTICE_ISSUED',
  ESCALATED = 'ESCALATED',
  TOW_ELIGIBLE = 'TOW_ELIGIBLE',
  RESOLVED = 'RESOLVED',
  DISMISSED = 'DISMISSED',
}

export interface Violation extends BaseEntity {
  siteId: string;
  vehicleId: string | null;
  parkingPositionId: string | null;
  category: ViolationCategory;
  status: ViolationStatus;
  detectedAt: Date;
  resolvedAt: Date | null;
  dismissedAt: Date | null;
  dismissalReason: string | null;
}

export enum ViolationEventType {
  DETECTED = 'DETECTED',
  OBSERVATION_ADDED = 'OBSERVATION_ADDED',
  NOTICE_ELIGIBLE = 'NOTICE_ELIGIBLE',
  NOTICE_ISSUED = 'NOTICE_ISSUED',
  ESCALATED = 'ESCALATED',
  TOW_ELIGIBLE = 'TOW_ELIGIBLE',
  RESOLVED = 'RESOLVED',
  DISMISSED = 'DISMISSED',
}

export interface ViolationEvent extends BaseEntity {
  violationId: string;
  eventType: ViolationEventType;
  eventAt: Date;
  observationId: string | null;
  noticeId: string | null;
  notes: string | null;
  performedBy: string | null; // admin user ID or 'SYSTEM'
}

export interface Notice extends BaseEntity {
  violationId: string;
  issuedAt: Date;
  issuedBy: string; // admin user ID
  qrToken: string; // unique token for ticket access
  textPayload: string; // structured JSON containing notice details
  printedAt: Date | null;
  idempotencyKey: string;
}

export interface RecipientAccount extends BaseEntity {
  email: string;
  emailVerifiedAt: Date | null;
  firstName: string | null;
  lastName: string | null;
  phoneNumber: string | null;
  profileCompletedAt: Date | null;
  activationToken: string | null;
  activationSentAt: Date | null;
}

export interface RecipientAccessLog extends BaseEntity {
  recipientAccountId: string;
  noticeId: string;
  accessedAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
}
