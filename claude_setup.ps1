# create-agentic-repo-structure.ps1
# Creates root-level agent behavior files and a docs/specs structure
# Safe to run multiple times (will not overwrite existing files)

$rootFiles = @{
"CLAUDE.md" = @"
# CLAUDE.md

## Purpose
Defines Claude's operating behavior within this repository.
This file contains no project-specific information.

## Agent Operating Rules
1. Prefer /delegate for scoped, non-authoritative processing or evaluation tasks.
2. Do not make architectural, cross-module, or repo-wide decisions unless explicitly requested or delegated.
3. Keep planning, execution, and review separate unless explicitly instructed to merge them.
4. When information stabilizes, persist it in files and treat prior discussion as disposable.
5. Unless specified otherwise:
   - Temporary files go under /tmp/<app-or-process>/
   - Logs go under /log/<producer>/
   - Source data resides under /data/<source>/
   - Executables belong in appropriate bin/ directories  
   Discover and respect existing structure before creating new paths.
6. Pay attention to leftover files produced by builds, installs, and tooling; do not assume a clean workspace.
7. Minimize change scope; prefer localized modifications over broad rewrites unless explicitly directed.
8. After analysis or delegation, retain only summaries and durable artifacts; discard intermediate reasoning.
"@

"PROJECT.md" = @"
# Project Overview

Describe what this system is, why it exists, and its major components.
This document is authoritative for system intent and scope.
"@

"PLAN.md" = @"
# Current Plan

Describe current goals, in-progress work, trade-offs, and near-term tasks.
This document is expected to change frequently.
"@
}

$specFiles = @{
"docs/specs/claude_overview.md" = @"
# Project Overview

High-level system description and user-facing surfaces.
"@

"docs/specs/claude_invariants.md" = @"
# Core Invariants

Non-negotiable rules governing immutability, auditability, and idempotency.
"@

"docs/specs/claude_domain.md" = @"
# Domain Model

Canonical entity names and domain vocabulary.
"@

"docs/specs/claude_spatial.md" = @"
# Spatial Model

Parking geometry, position semantics, and enforcement context.
"@

"docs/specs/claude_observations_evidence.md" = @"
# Observations and Evidence

Observation lifecycle, evidence handling, and immutability rules.
"@

"docs/specs/claude_mobile_offline.md" = @"
# Mobile Offline Behavior

Offline-first capture and synchronization expectations.
"@

"docs/specs/claude_violations_timelines.md" = @"
# Violations and Timelines

Violation derivation, escalation logic, and event timelines.
"@

"docs/specs/claude_handicapped.md" = @"
# Handicapped Enforcement

Progressive clarification and eligibility handling.
"@

"docs/specs/claude_notices.md" = @"
# Notices

Notice issuance, payload structure, and reprint behavior.
"@

"docs/specs/claude_recipient_access.md" = @"
# Recipient Access

QR access flow, authentication, and access logging.
"@

"docs/specs/claude_api_backend.md" = @"
# API and Backend Rules

Authentication, auditing, idempotency, and secure evidence access.
"@

"docs/specs/claude_testing.md" = @"
# Testing Expectations

Required unit and integration coverage for core invariants.
"@

"docs/specs/claude_extension.md" = @"
# Feature Extension Guidance

Rules for adding features without breaking historical integrity.
"@

"docs/specs/claude_priorities.md" = @"
# Implementation Priorities

Correctness and auditability before optimization or automation.
"@
}

function Initialize-File {
    param ($Path, $Content)

    $dir = Split-Path $Path -Parent
    if ($dir -and -not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        Write-Host "Created directory $dir"
    }

    if (-not (Test-Path $Path)) {
        Set-Content -Path $Path -Value $Content -Encoding UTF8
        Write-Host "Created $Path"
    } else {
        Write-Host "Skipped $Path (already exists)"
    }
}

foreach ($file in $rootFiles.GetEnumerator()) {
    Initialize-File -Path $file.Key -Content $file.Value
}

foreach ($file in $specFiles.GetEnumerator()) {
    Initialize-File -Path $file.Key -Content $file.Value
}
