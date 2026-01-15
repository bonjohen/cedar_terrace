# Cedar Terrace - Project Documentation

Technical documentation for developers and architects working on the Cedar Terrace system.

## 📐 Architecture & Design

- **[Architecture](./architecture.md)** - System architecture, components, and technology stack
- **[Design](./design.md)** - Domain model, data flow, and design decisions
- **[Project Plan](./project_plan.dot)** - Dependency graph of project phases (Graphviz format)

## 📊 Project Status

- **[Implementation Status](./implementation-status.md)** - Current progress, completed features, and roadmap

## 🔍 Quick Reference

### System Components

1. **Backend API** (Node.js + Express + PostgreSQL)
2. **Admin Frontend** (React + Vite + Tailwind)
3. **Ticket Recipient Portal** (React + Vite + Tailwind)
4. **Mobile App** (Expo + React Native)
5. **Worker Services** (Node.js background jobs)
6. **Infrastructure** (AWS CDK)

### Core Technologies

- **Language**: TypeScript
- **Database**: PostgreSQL 16
- **Storage**: AWS S3 (MinIO locally)
- **Queues**: AWS SQS
- **Email**: AWS SES (MailHog locally)
- **Auth**: AWS Cognito (stub locally)

### Development Workflow

1. Read [Architecture](./architecture.md) for system overview
2. Review [Design](./design.md) for domain model
3. Check [Implementation Status](./implementation-status.md) for current progress
4. See [Project Plan](./project_plan.dot) for dependencies

### Related Documentation

- **Product Documentation**: `../product/` - User guides, setup, monitoring
- **Getting Started**: `../../GETTING_STARTED.md` - Quick start for developers
- **Local Development**: `../../LOCAL_DEVELOPMENT.md` - Complete local setup guide

## 📋 Project Principles

### Core Invariants

1. **Parking positions are authoritative** - Spatial anchors for all enforcement
2. **Observations are immutable** - Evidence cannot be changed after submission
3. **Violations are event-driven** - All state changes recorded as events
4. **Soft deletes everywhere** - Nothing is truly deleted, preserved for audit
5. **QR codes are pointers only** - Possession doesn't grant access without auth
6. **Rendered stickers never stored** - Generated on-demand from structured data
7. **Idempotency is mandatory** - All submissions can be safely retried

See [CLAUDE.md](../../CLAUDE.md) for complete invariants and guidelines.

## 🎯 Implementation Progress

**Overall: ~93% Complete**

- ✅ Backend API (100%)
- ✅ Backend Testing (100%)
- ✅ Admin Frontend (80%)
- ✅ Ticket Portal (100%)
- ✅ Mobile App (80%)
- ✅ Worker Services (100%)

See [Implementation Status](./implementation-status.md) for detailed breakdown.

## 🏗️ Architecture Highlights

### Offline-First Design

- Mobile app captures observations without connectivity
- SQLite local queue with background sync
- Idempotent submission prevents duplicates

### Event-Driven Violations

- State machine: DETECTED → NOTICE_ISSUED → ESCALATED → TOW_ELIGIBLE → RESOLVED
- Timeline rules per violation category
- All transitions recorded as immutable events

### Progressive Evidence

- Handicapped enforcement tolerates incomplete initial evidence
- Subsequent observations add clarification (e.g., placard photos)
- Violations can be downgraded based on new evidence

### Secure Ticket Access

- QR code contains token, not ticket data
- Email-based activation required
- Profile completion gate before viewing
- All access logged for audit

## 📚 Additional Resources

- **API Endpoints**: See backend README
- **Database Schema**: `backend/src/db/migrations/`
- **Shared Types**: `shared/src/types/`
- **Domain Services**: `backend/src/domain/services/`

---

**For product documentation (setup, monitoring, user guides), see [../product/](../product/README.md)**
