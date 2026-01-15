# Cedar Terrace - Documentation

Complete documentation for the Cedar Terrace parking enforcement and stall management system.

## 📚 Documentation Categories

### 🔧 [Project Documentation](./project/)
Technical documentation for developers and architects

- System architecture and design
- Implementation status and roadmap
- Development guidelines and invariants
- Technology stack details

**Start here if you're**: Building features, understanding the codebase, or contributing to development

### 📖 [Product Documentation](./product/)
Operational guides for setup, administration, and end-users

- Setup and installation guides
- Security configuration checklist
- User guides (Admin UI, Mobile App, Ticket Portal)
- Troubleshooting and monitoring

**Start here if you're**: Setting up the system, administering it, or using it for parking enforcement

---

## 🚀 Quick Links

### New to Cedar Terrace?
1. Read the [Project README](../README.md) for an overview
2. Follow [GETTING_STARTED.md](../GETTING_STARTED.md) for quick setup
3. Review [LOCAL_DEVELOPMENT.md](../LOCAL_DEVELOPMENT.md) for complete local environment guide

### Developer?
- [Project Architecture](./project/architecture.md)
- [Design Decisions](./project/design.md)
- [Implementation Status](./project/implementation-status.md)
- [Project Plan Graph](./project/project_plan.dot)

### Administrator?
- [Security Checklist](./product/security-checklist.md)
- [Local Development Guide](../LOCAL_DEVELOPMENT.md)
- [Product User Guides](./product/)

### End User?
- [Product Documentation](./product/) - Admin UI, Mobile App, Ticket Portal guides
- [Test Parking Lot Reference](./product/test-parking-lot.md)

---

## 📁 Documentation Structure

```
docs/
├── README.md                    # This file
├── project/                     # Technical/Development docs
│   ├── README.md               # Project docs index
│   ├── architecture.md         # System architecture
│   ├── design.md               # Domain model & design
│   ├── implementation-status.md # Current progress
│   └── project_plan.dot        # Dependency graph
└── product/                     # Operational/User docs
    ├── README.md               # Product docs index
    ├── security-checklist.md   # Security configuration
    ├── test-parking-lot.md     # Test data reference
    └── test-parking-lot.svg    # Visual diagram
```

---

## 🎯 Common Tasks

### I want to...

**...set up the system locally**
→ [LOCAL_DEVELOPMENT.md](../LOCAL_DEVELOPMENT.md)

**...understand the architecture**
→ [project/architecture.md](./project/architecture.md)

**...configure security for production**
→ [product/security-checklist.md](./product/security-checklist.md)

**...use the Admin UI**
→ [product/README.md](./product/README.md#admin-users)

**...use the Mobile App**
→ [product/README.md](./product/README.md#field-enforcement-mobile-app)

**...access a ticket (recipient)**
→ [product/README.md](./product/README.md#ticket-recipients-portal)

**...check implementation progress**
→ [project/implementation-status.md](./project/implementation-status.md)

**...troubleshoot an issue**
→ [LOCAL_DEVELOPMENT.md#troubleshooting](../LOCAL_DEVELOPMENT.md#troubleshooting)

**...deploy to AWS**
→ [product/security-checklist.md](./product/security-checklist.md) (Production section)

---

## 🔍 Key Concepts

### System Components

1. **Backend API** - Express.js REST API with PostgreSQL
2. **Admin Frontend** - React web application for enforcement management
3. **Ticket Recipient Portal** - React web application for viewing tickets
4. **Mobile App** - Expo/React Native offline-first capture application
5. **Worker Services** - Background jobs for timelines, emails, and sync
6. **Infrastructure** - AWS CDK for cloud deployment

### Core Features

- **Offline-first mobile capture** with background sync
- **Event-driven violation timeline** with automatic state transitions
- **QR-based secure ticket access** with email activation
- **Immutable observations and evidence** for audit trail
- **Progressive handicapped enforcement** with evidence clarification
- **Idempotent operations** to prevent duplicates

### Domain Entities

- **Sites** - Physical parking locations
- **Lot Images** - Visual reference for parking layouts
- **Parking Positions** - Individual parking spaces (circle geometry)
- **Vehicles** - Registered vehicles by license plate
- **Observations** - Field enforcement encounters
- **Evidence Items** - Photos and text notes
- **Violations** - Derived parking rule violations
- **Violation Events** - Timeline state transitions
- **Notices** - Printed violation notices with QR codes
- **Recipient Accounts** - Ticket viewer accounts

---

## 📊 Project Status

**Overall Progress**: ~93% complete

- ✅ Backend API (100%)
- ✅ Backend Testing (100%)
- ✅ Admin Frontend (80%)
- ✅ Ticket Portal (100%)
- ✅ Mobile App (80%)
- ✅ Worker Services (100%)

See [implementation-status.md](./project/implementation-status.md) for details.

---

## 🤝 Contributing

### Development Setup
1. Clone repository
2. Run `.\setup.ps1` (Windows) or follow [LOCAL_DEVELOPMENT.md](../LOCAL_DEVELOPMENT.md)
3. Read [CLAUDE.md](../CLAUDE.md) for project invariants
4. Check [project/implementation-status.md](./project/implementation-status.md) for current work

### Code Guidelines
- Follow TypeScript strict mode
- Use shared types from `@cedar-terrace/shared`
- Write tests for new features
- Maintain immutability of observations and events
- Preserve soft delete semantics

---

## 📞 Support

For issues or questions:
1. Check [Troubleshooting](../LOCAL_DEVELOPMENT.md#troubleshooting)
2. Review relevant documentation sections
3. Check implementation status for known issues
4. Create an issue with detailed reproduction steps

---

## 📄 License

Private - Cedar Terrace Project

---

**Navigation**: [← Back to Project Root](../) | [Project Docs →](./project/) | [Product Docs →](./product/)
