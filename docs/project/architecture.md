# Architecture Document

**Parking Enforcement and Stall Management System**

## 1. Overview

The system consists of an Admin web application for configuration and enforcement management, a mobile capture application that operates offline-first, a secure ticket recipient portal accessed from QR codes, and a cloud backend that provides authenticated APIs, asynchronous processing, durable storage, and auditability. The design emphasizes low operational overhead, reliable ingestion under intermittent connectivity, explicit timelines for violations, and strict access control for ticket data.

## 2. Cloud Provider and Runtime Platform

AWS is the target cloud provider. The system is deployed using managed, serverless-first services to keep idle cost low while supporting bursty activity during enforcement sweeps and initial lot setup. The primary runtime consists of API Gateway for HTTP ingress, AWS Lambda for synchronous request handling, Amazon SQS for durable queues, and Lambda workers for background processing. CloudFront distributes web assets and accelerates content delivery, while S3 provides object storage for evidence images.

## 3. Clients and User-Facing Surfaces

The Admin Web UI is a single-page application delivered from S3 through CloudFront. It provides lot configuration, parking position editing, searching, violation management, notice issuance, and audit review. The lot visualization overlays parking position circles on top of the overhead image and color-codes positions based on violation status.

The Mobile Capture App is a dedicated client optimized for camera capture, field data entry, and offline operation. It queues captures locally, performs optional local extraction of plate and tab information, and syncs evidence and metadata when a network becomes available.

The Ticket Recipient Portal is a web experience accessed via QR codes printed on notices. It is delivered from the same web hosting tier as the Admin UI or as a separate build routed under a distinct path. It requires authentication, email activation, and profile completion before ticket details are displayed.

## 4. Backend API Layer

The synchronous API layer is implemented as API Gateway endpoints backed by Lambda functions. This layer handles authentication and authorization, validation, CRUD operations over core entities, issuance of pre-signed S3 upload URLs, observation ingestion with idempotency, violation and timeline operations, notice issuance, recipient activation flows, and secured ticket retrieval.

The API layer enforces invariants that are critical to auditability. Observations are immutable after submission. Evidence references are immutable. Violation history is event-driven and represented as appended events rather than overwritten state. Soft delete filtering is applied by default for all entities that support it.

## 5. Asynchronous Processing and Scheduling

Time-based behavior and heavy or retry-prone work are executed asynchronously. SQS is used as the durable queue between synchronous triggers and workers. Worker Lambdas process queued jobs such as evaluating violations approaching escalation thresholds, applying timeline transitions, sending activation emails, generating printable notice payloads, and reconciling ingestion workflows when offline clients reconnect.

Scheduled execution is implemented using EventBridge rules that periodically enqueue “timeline evaluation” jobs. These jobs query the database for violations near transition boundaries and emit state transitions as new timeline events.

## 6. Data Storage

The system-of-record for local development is SQLite with a single-user, file-based database. For production AWS deployment, the system uses PostgreSQL hosted on Amazon Aurora Serverless v2. Both database implementations store all domain entities including site configuration, lot images, parking positions, vehicles, observations, violations, timeline events, notices, recipient accounts, and access logs. Soft delete fields are present on all relevant tables, and normal queries exclude soft-deleted records.

**Local Development (SQLite):**
- File-based storage: `data/cedar_terrace.db`
- WAL mode enabled for better concurrency
- Synchronous API (better-sqlite3)
- No external database service required
- Ideal for single-user, cost-sensitive deployments

**Production (PostgreSQL/Aurora):**
- Aurora Serverless v2 for managed scaling
- Asynchronous connection pooling
- Multi-user concurrent access
- Automated backups and replication

Evidence images are stored in S3 as immutable objects (or local MinIO for development). Observations store S3 object keys, hashes, timestamps, and related metadata. The system does not store rendered sticker images. Notices store the structured text payload and a QR token reference used to resolve the secured ticket page.

## 7. Authentication and Authorization

Admin authentication is managed through Amazon Cognito. Admin endpoints require valid tokens and enforce MFA where configured. The recipient authentication flow is also backed by Cognito or a dedicated identity pool configured for recipient accounts, depending on separation preferences. Recipient access requires email activation. After authentication, recipients must complete required profile fields before being allowed to view the final ticket details page.

QR codes contain only a token that references a ticket record. The token is treated as a pointer, not a credential. Possession of the QR code does not grant access. Ticket views require authentication and profile completion, and all access is logged.

## 8. Evidence Access and Media Delivery

Evidence objects in S3 are private. When the Admin UI needs to display an evidence image, the backend issues time-limited pre-signed URLs scoped to authorized users. The Ticket Portal follows the same pattern, issuing pre-signed access only after authentication and gating rules pass. CloudFront may be used to accelerate delivery when combined with signed URLs or origin access controls, but direct pre-signed S3 URLs are acceptable initially.

## 9. Observability, Audit, and Diagnostics

Operational telemetry is captured using CloudWatch logs, metrics, and alarms. This covers API latency and error rates, Lambda failures, queue depth, worker throughput, and scheduled job success. Domain auditability is captured in the database through explicit event records. Violation state transitions, notice issuance, admin actions, and recipient access events are recorded as structured data, enabling reconstruction of enforcement history independently of infrastructure logs.

## 10. Development Tooling

Development is organized as a monorepo or tightly coordinated multi-repo with shared domain models and DTOs. TypeScript is used across frontend and backend or combined with Python in backend workers if desired, but the domain model and invariants remain consistent regardless of language. Local development uses SQLite for the database (no Docker required) and local MinIO for S3-compatible storage emulation. Developers run the Admin UI and ticket portal locally against a local API and database, using MailHog for email testing and stubbed integrations when appropriate.

## 11. Testing Infrastructure

Unit tests cover domain logic such as violation derivation, timeline transitions, idempotency, evidence requirements, and soft delete behavior. Tests use in-memory SQLite databases (`:memory:`) for fast, isolated execution without external dependencies. Integration tests validate end-to-end flows including offline capture ingestion, evidence upload and metadata submission, notice issuance, recipient activation and profile gating, and secured ticket retrieval. Contract tests validate request and response shapes for API endpoints used by clients. Test environments are deployed via infrastructure-as-code and seeded with fixture data for repeatability.

## 12. Deployment Pipeline and Environments

The system is deployed through a CI/CD pipeline that builds the Admin SPA and ticket portal assets, packages Lambda functions, and applies infrastructure-as-code changes. Deployments promote changes through environments such as dev, staging, and production. Database migrations are applied as controlled steps with backward compatibility to support phased client updates. Feature flags are used to gate incomplete workflows without requiring redeployment of all clients at once.

## 13. Security Posture

The system enforces least-privilege IAM across components. S3 buckets use private access with restricted policies. Secrets and configuration values are stored in AWS managed secret storage and injected at runtime. Sensitive information is never embedded directly into URLs. All access to ticket details is authenticated and logged. Soft deletes preserve history for audit and dispute handling, and evidence is treated as immutable once captured.

## 14. Scalability and Performance Characteristics

The architecture is sized for low baseline usage with occasional bursts. Serverless compute scales horizontally with request volume. Aurora Serverless v2 scales database capacity with demand. SQS absorbs bursty ingestion and background workload. Offline-first capture decouples field operations from immediate backend availability. The design supports growth in the number of observations and sites without requiring structural change, provided partitioning and indexing are implemented appropriately.
