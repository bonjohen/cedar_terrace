# CLAUDE.md

## Project Overview

This project implements a parking enforcement and stall management system with three user-facing surfaces: an Admin web application, an offline-first mobile capture application, and a secure ticket recipient portal accessed via QR codes. The system manages parking positions, vehicle observations, violations with category-specific timelines, and printed notices that contain text and a QR pointer. Rendered sticker images are never stored.

The system is designed to be auditable, tolerant of incomplete evidence, and practical in real-world enforcement conditions where visibility and compliance may evolve over time.

---

## Core Invariants

Parking positions are the authoritative spatial anchors. They are represented as point-based circles with a center position and radius and are stored as canonical records. Visual geometry exists to support interaction and context, not to retroactively reinterpret history.

Observations are immutable once submitted. Evidence attached to an observation—photos or text notes—is immutable. Corrections, remediation, or clarification are always represented by new observations.

Violations are event-driven state machines. Violation state is never overwritten. All changes are recorded as explicit timeline events.

Soft deletes apply to all domain entities. Soft-deleted records are excluded from normal queries but preserved for audit and historical integrity. Evidence is never deleted through normal workflows.

QR codes are pointers only. Possession of a QR code does not grant access. Ticket recipients must authenticate, activate via email, and complete required profile information before viewing ticket details.

Rendered sticker images are never persisted. Notices store structured text payloads and QR token references only.

Idempotency is mandatory for observation submission and notice issuance.

---

## Domain Entities

Use the following entity names consistently across schemas, APIs, and code:

Site
LotImage
ParkingPosition
Vehicle
Observation
EvidenceItem
Violation
ViolationEvent
Notice
RecipientAccount
RecipientAccessLog

---

## Spatial and Parking Model

Parking positions are modeled as circles with a center coordinate and radius relative to the lot image. Each position has a semantic type, including open parking, purchased or reserved parking, and handicapped parking. Purchased positions may include rental or assignment metadata.

Not all legal parking corresponds to a fixed position. Open areas without marked stalls are treated as generally permissible zones and do not require position matching for enforcement, provided the vehicle meets eligibility requirements.

Restricted areas such as fire lanes are enforced through observation context and rules rather than precise geometric matching.

---

## Observation and Evidence Model

An observation represents a single enforcement encounter. Each observation must include at least one evidence item. Evidence may be photos, text notes, or both.

Photos may be tagged with an intent label describing what they document, such as primary vehicle view, secondary vehicle view, registration update, or handicapped placard. Intent labels are descriptive only and do not affect immutability or storage rules.

Text notes are free-form annotations used to document conditions not easily captured visually. Notes are timestamped and immutable.

Once submitted, observations and evidence cannot be edited or removed.

---

## Mobile Capture Requirements

The mobile application must operate offline-first. It must allow capture of photos, entry of text notes, review and editing of extracted fields, and optional association with a parking position without network connectivity.

Captured observations are queued locally and synchronized when connectivity is available. Synchronization must be idempotent and tolerant of retries and partial failures.

---

## Violation Model and Timelines

Violations are derived from observations based on parking position type, vehicle eligibility, accumulated evidence, and existing active violations.

Each violation belongs to a category with its own timeline rules, including detection, notice eligibility, escalation thresholds, and tow eligibility. Categories such as fire lane violations escalate more rapidly than administrative compliance issues.

Timeline progression is evaluated asynchronously. State transitions are recorded as ViolationEvent records and never overwrite prior state.

Multiple observations may attach to a single violation over time to document continued non-compliance, clarification, or remediation.

---

## Handicapped Parking Handling

Handicapped enforcement must account for eligibility evidence that may not be externally visible. An observation in a handicapped position without visible placard evidence may create a violation. Subsequent observations may add placard photos or text confirmation. Violations may be resolved or downgraded based on this evidence.

The system must support this progressive clarification workflow without retroactively modifying prior observations.

---

## Notice Issuance

Notices are issued from active violations. Issuance generates a structured text payload containing violation details, deadlines, and instructions, along with a QR token referencing the ticket page.

Printed output is generated on demand from stored payloads. Reprinting reproduces the same payload unless a new notice is explicitly issued.

---

## Ticket Recipient Access

Ticket recipients access their ticket by scanning a QR code. They must authenticate using email, activate their account via an emailed link, and complete required profile information before viewing ticket details.

Ticket pages are read-only and display violation summaries, evidence references, deadlines, and resolution instructions. All access is logged.

---

## API and Backend Expectations

All mutating operations must be authenticated and audited. Observation submission and notice issuance must enforce idempotency using client-generated keys.

Default queries must exclude soft-deleted records unless explicitly requested.

Evidence access must be time-limited and authorized. Sensitive data must never be embedded directly in URLs.

---

## Testing Expectations

Unit tests must cover violation derivation, timeline transitions, evidence requirements, idempotency enforcement, and soft-delete filtering.

Integration tests must cover offline capture and synchronization, multi-evidence observations, handicapped resolution workflows, notice issuance, recipient authentication and profile gating, and secured ticket access.

Immutability and auditability are treated as invariants and must be enforced by tests.

---

## Feature Extension Guidance

When adding features, preserve all core invariants. Parking positions remain authoritative spatial anchors. Geometry changes must not reinterpret historical observations. Enforcement behavior changes must be introduced through new rule definitions or events, not retroactive mutation.

Hard delete workflows, rule versioning, AI-assisted position suggestion, multi-site support, external integrations, and advanced reporting may be added in the future but must not break existing domain contracts or historical integrity.

---

## Implementation Priorities

Focus first on correctness and auditability. Ensure observation immutability, event-driven violation timelines, idempotent ingestion, and secure ticket access before adding optimization or automation features.
