# CLAUDE.md

## Purpose
Defines Claude’s operating behavior within this repository.
This file contains **no project-specific logic, domain rules, or plans**.

## Agent Operating Rules
1. Prefer `/delegate` for scoped, non-authoritative processing or evaluation tasks.
2. Do not make architectural, cross-module, or repo-wide decisions unless explicitly requested or delegated.
3. Keep planning, execution, and review separate unless explicitly instructed to merge them.
4. When information stabilizes, persist it in files and treat prior discussion as disposable.
5. Unless specified otherwise:
   - Temporary files go under `/tmp/<app-or-process>/`
   - Logs go under `/log/<producer>/`
   - Source data resides under `/data/<source>/`
   - Executables belong in appropriate `bin/` directories  
   Discover and respect existing structure before creating new paths.
6. Pay attention to leftover files produced by builds, installs, and tooling; do not assume a clean workspace.
7. Minimize change scope; prefer localized modifications over broad rewrites unless explicitly directed.
8. After analysis or delegation, retain only summaries and durable artifacts; discard intermediate reasoning.

## Spec Index
Use these documents selectively as needed. They are authoritative for their respective scopes.

- **docs/specs/claude_overview.md** — system intent, product surfaces, high-level mental model  
- **docs/specs/claude_invariants.md** — immutability, auditability, idempotency, non-negotiables  
- **docs/specs/claude_domain.md** — canonical entity names and domain vocabulary  
- **docs/specs/claude_spatial.md** — parking geometry, position semantics, enforcement context  
- **docs/specs/claude_observations_evidence.md** — observations, evidence handling, immutability rules  
- **docs/specs/claude_mobile_offline.md** — offline-first capture and synchronization behavior  
- **docs/specs/claude_violations_timelines.md** — violation derivation, timelines, escalation rules  
- **docs/specs/claude_handicapped.md** — progressive clarification for handicapped enforcement  
- **docs/specs/claude_notices.md** — notice issuance, payloads, printing, reprints  
- **docs/specs/claude_recipient_access.md** — QR access, authentication, profile gating, access logging  
- **docs/specs/claude_api_backend.md** — authentication, auditing, idempotency, evidence access  
- **docs/specs/claude_testing.md** — unit and integration testing expectations  
- **docs/specs/claude_extension.md** — feature evolution and non-breaking change guidance  
- **docs/specs/claude_priorities.md** — implementation priorities and trade-off guidance
