# Detailed Design Document

**Parking Enforcement and Stall Management System**

---

## 1. Purpose and Operating Model

This system supports parking enforcement and stall management for a defined parking site. It combines administrative configuration, offline-capable field capture, automated violation timelines, and a secure ticket recipient experience. The system is designed to be auditable, tolerant of incomplete or evolving evidence, and practical for real-world enforcement where visibility and compliance are not always immediate or unambiguous.

This document defines **product behavior and workflows** in sufficient detail that the system can be implemented, tested, and deployed without further interpretation. It describes how the product behaves in context of the previously defined architecture, but it does not restate infrastructure details except where necessary to explain behavior.

---

## 2. Spatial Representation of the Parking Lot

The parking lot is visually represented using an overhead image. This image is used for orientation and interaction only; it does not encode enforcement authority by itself. All actionable spatial meaning is expressed through parking positions.

Parking positions are modeled as circles representing the center of a place where a vehicle may legally park. Each circle has a position relative to the lot image and a radius that defines its effective area. These circles are the authoritative spatial references used throughout the system.

Not all legal parking requires a fixed position. Some areas allow parking without individually marked stalls. Vehicles parked in these open regions are considered valid so long as they meet general eligibility requirements, such as having current registration. These regions do not contain individual parking positions and are not used for stall-based enforcement matching.

Certain areas prohibit parking entirely, such as fire lanes. These areas are handled through enforcement rules and observation context rather than precise geometric matching.

---

## 3. Parking Position Model

Each parking position is a canonical record in the database. It represents a real-world parking opportunity and persists independently of any observation or violation.

A parking position includes a center coordinate, a radius, and a semantic type. Supported types include open parking positions that anyone may use, purchased or reserved stalls that are typically covered or assigned, and handicapped stalls that require specific eligibility. Purchased stalls may include rental or assignment metadata linking them to authorized vehicles or users.

Parking positions can be created, moved, resized, and soft-deleted by an Admin. These actions immediately affect how the lot is displayed and how future observations are interpreted. Parking positions are descriptive anchors; they provide context and eligibility rules but do not retroactively alter historical observations.

---

## 4. Lot Configuration Workflow

The Admin configures the parking lot through a web-based editor. The overhead image is displayed as a background, and parking positions appear as circles that can be manipulated directly.

The Admin may create a new parking position by clicking on the image, adjust its position and radius by dragging, and edit its metadata inline. Positions may be removed through soft deletion when stalls are retired or reconfigured. The editor is designed for rapid iteration and correction as real-world conditions change.

All configuration changes are persisted immediately. There is no separate publish or draft mechanism, as parking positions are not used to reinterpret past enforcement activity.

---

## 5. Observation Capture Philosophy

An observation represents a single enforcement encounter. It captures what was known and visible at a specific moment in time. Observations are immutable once submitted, forming the foundation of all enforcement decisions and historical review.

The system assumes that evidence may be incomplete at first and may become complete over time through additional observations. It is designed to support progressive clarification rather than demanding perfect evidence in a single step.

---

## 6. Unified Evidence Model

Each observation must include evidence. Evidence may take the form of photos, text notes, or both. At least one evidence item is required for submission. This rule ensures that every observation is supported by either visual documentation or explicit human annotation.

Photos and text notes are treated as first-class, immutable evidence objects. Once an observation is submitted, its evidence cannot be edited or removed. If circumstances change or new information becomes available, a new observation must be recorded.

---

## 7. Photo Capture Behavior

The system allows multiple photos to be attached to a single observation. Each photo may be tagged with an intent that describes what it represents.

A primary vehicle photo typically captures the rear of the vehicle, including the license plate and registration tabs when visible. A secondary vehicle photo may be used when the plate or tabs are located on the opposite end of the vehicle. A registration update photo documents the application of a new tab after a prior violation. A handicapped placard photo captures dashboard or mirror-mounted placards that are not visible from exterior angles.

These intent tags are descriptive and do not alter storage or immutability rules. All photos are stored as evidence and referenced by the observation.

---

## 8. Text Notes and Annotations

Text notes may be added to an observation to document conditions that are not easily captured in photos. Notes are free-form, timestamped, and immutable after submission.

Text notes may be used alone when photos are impractical, but photos are encouraged whenever possible. Notes are especially important for documenting subjective judgments, temporary visibility issues, or interactions that occur in real time.

---

## 9. Mobile Capture Workflow

Observation capture is designed to be offline-first. The mobile application allows the Admin to capture photos, add notes, and edit extracted fields without network connectivity.

During capture, the Admin may optionally select a nearby parking position to provide context. The system may suggest positions based on proximity, but selection is not mandatory. The Admin reviews automatically extracted fields such as license plate, issuing state, and tab dates, and may edit them before submission.

Prior data associated with the selected parking position or vehicle may be displayed to speed confirmation. Selecting prior data pre-fills structured fields while preserving new evidence.

When connectivity is available, the mobile app uploads evidence and submits observation metadata using an idempotent workflow. Observations remain queued locally until confirmed by the backend.

---

## 10. Observation Persistence Rules

Once submitted, an observation is immutable. Its associated evidence, timestamps, extracted fields, and references cannot be changed.

Corrections, updates, or remediation are always represented by new observations. This preserves a clear and auditable sequence of events and avoids retroactive modification of enforcement history.

Observations may reference a parking position, a vehicle identity, or both. An observation may also stand alone when precise context is unavailable.

---

## 11. Violation Derivation and Association

Violations are derived from observations based on parking position type, vehicle eligibility, and accumulated evidence. The system allows multiple observations to attach to a single violation over time.

Examples include misuse of a purchased stall by an unauthorized vehicle, occupancy of a handicapped stall without visible eligibility evidence, or administrative violations such as expired registration tabs. The system supports attaching subsequent observations that document compliance, continued non-compliance, or remediation.

Violations are not assumed to be permanent. They evolve based on evidence and time.

---

## 12. Handicapped Parking Handling

Handicapped enforcement requires special handling because eligibility evidence is often not visible from the exterior of a vehicle.

When a vehicle is observed in a handicapped parking position without visible placard evidence, a violation may be created. Subsequent observations may add placard photos or text notes confirming eligibility. The violation may then be resolved or downgraded based on this new evidence.

This workflow is designed to reflect real-world conditions and to avoid penalizing compliant drivers due to temporary visibility limitations.

---

## 13. Violation Timeline and Escalation

Each violation category defines its own timeline, including detection, notice eligibility, escalation thresholds, and tow eligibility. Categories such as fire lane violations escalate more rapidly than administrative compliance issues.

Timeline progression is event-driven and evaluated asynchronously. State transitions are recorded as explicit events rather than overwriting previous state. This allows the full enforcement history to be reconstructed and reviewed.

---

## 14. Notice Issuance and Stickers

From an active violation, the Admin may issue a notice. The system generates a structured text payload containing violation details, deadlines, and instructions, along with a QR token pointing to the ticket page.

Printed stickers are generated on demand from this payload. The system does not store rendered images of stickers. Reprinting a notice reproduces the same payload unless a new notice is explicitly issued.

---

## 15. Ticket Recipient Experience

Ticket recipients access their ticket by scanning the QR code on the notice. The QR code directs them to a landing page where they must authenticate using email. An activation link is sent to confirm identity.

After activation, the recipient must complete required profile information before accessing the final ticket details page. This gate ensures accountability and prevents anonymous access.

Ticket pages are read-only and present the violation summary, evidence references, deadlines, and resolution instructions. All access is logged.

---

## 16. Search, Review, and Audit

Admins may search vehicles, parking positions, and violations. Search results and detail views present complete historical context, including all related observations and timeline events.

Soft-deleted records are excluded from normal views but retained for audit and compliance. Evidence is never deleted through normal workflows.

---

## 17. Deletion Semantics

All deletions are soft deletes. Records remain in the system with deletion metadata and are excluded from standard queries. Evidence objects are never deleted as part of soft deletion.

Permanent deletion is intentionally excluded from current behavior and handled only through a future, explicit workflow.

---

## 18. Testing Expectations

The system must be testable at multiple levels. Unit tests validate violation derivation logic, timeline progression, evidence requirements, and position matching. Integration tests validate offline capture and sync, multi-photo observations, handicapped resolution workflows, notice issuance, and ticket recipient access. Historical immutability and idempotency are treated as invariant properties and must be enforced by tests.

---

## 19. Behavioral Requirements for Implementation

Observations are immutable. Evidence is immutable. Parking positions are authoritative spatial anchors but do not retroactively alter history. Violations evolve through events, not mutation. Notices store structured payloads, not rendered images. QR tokens are pointers, not credentials. All enforcement decisions must be reconstructible from stored data.

These requirements are binding and must be reflected in implementation, testing, and deployment.
