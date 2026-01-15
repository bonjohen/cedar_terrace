-- Cedar Terrace Parking Enforcement System
-- Initial schema migration (SQLite)

-- Sites table
CREATE TABLE IF NOT EXISTS sites (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
    name TEXT NOT NULL,
    address TEXT NOT NULL,
    timezone TEXT NOT NULL DEFAULT 'UTC',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_sites_active ON sites(is_active) WHERE deleted_at IS NULL;

-- Lot images table
CREATE TABLE IF NOT EXISTS lot_images (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
    site_id TEXT NOT NULL REFERENCES sites(id),
    s3_key TEXT NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_lot_images_site ON lot_images(site_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_lot_images_active ON lot_images(is_active) WHERE deleted_at IS NULL;

-- Parking positions table
-- Type: OPEN, PURCHASED, RESERVED, HANDICAPPED (stored as TEXT)
CREATE TABLE IF NOT EXISTS parking_positions (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
    site_id TEXT NOT NULL REFERENCES sites(id),
    lot_image_id TEXT NOT NULL REFERENCES lot_images(id),
    type TEXT NOT NULL CHECK(type IN ('OPEN', 'PURCHASED', 'RESERVED', 'HANDICAPPED')),
    center_x REAL NOT NULL,
    center_y REAL NOT NULL,
    radius REAL NOT NULL,
    identifier TEXT,
    rental_info TEXT,
    assigned_vehicle_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_parking_positions_site ON parking_positions(site_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_parking_positions_lot_image ON parking_positions(lot_image_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_parking_positions_type ON parking_positions(type) WHERE deleted_at IS NULL;

-- Vehicles table
CREATE TABLE IF NOT EXISTS vehicles (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
    license_plate TEXT NOT NULL,
    issuing_state TEXT NOT NULL,
    make TEXT,
    model TEXT,
    color TEXT,
    last_observed_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicles_plate_state ON vehicles(license_plate, issuing_state) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_vehicles_last_observed ON vehicles(last_observed_at) WHERE deleted_at IS NULL;

-- Observations table
CREATE TABLE IF NOT EXISTS observations (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
    site_id TEXT NOT NULL REFERENCES sites(id),
    vehicle_id TEXT REFERENCES vehicles(id),
    parking_position_id TEXT REFERENCES parking_positions(id),
    observed_at TEXT NOT NULL,
    license_plate TEXT,
    issuing_state TEXT,
    registration_month INTEGER CHECK (registration_month BETWEEN 1 AND 12),
    registration_year INTEGER CHECK (registration_year > 2000),
    idempotency_key TEXT NOT NULL,
    submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
    submitted_by TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_observations_idempotency ON observations(idempotency_key) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_observations_site ON observations(site_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_observations_vehicle ON observations(vehicle_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_observations_position ON observations(parking_position_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_observations_observed_at ON observations(observed_at) WHERE deleted_at IS NULL;

-- Evidence items table
-- Type: PHOTO, TEXT_NOTE
-- Intent: PRIMARY_VEHICLE, SECONDARY_VEHICLE, REGISTRATION_UPDATE, HANDICAPPED_PLACARD, GENERAL
CREATE TABLE IF NOT EXISTS evidence_items (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
    observation_id TEXT NOT NULL REFERENCES observations(id),
    type TEXT NOT NULL CHECK(type IN ('PHOTO', 'TEXT_NOTE')),
    s3_key TEXT,
    s3_hash TEXT,
    captured_at TEXT,
    intent TEXT CHECK(intent IN ('PRIMARY_VEHICLE', 'SECONDARY_VEHICLE', 'REGISTRATION_UPDATE', 'HANDICAPPED_PLACARD', 'GENERAL')),
    note_text TEXT,
    metadata TEXT DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT,
    CONSTRAINT photo_fields_check CHECK (
        (type = 'PHOTO' AND s3_key IS NOT NULL) OR
        (type = 'TEXT_NOTE' AND note_text IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_evidence_observation ON evidence_items(observation_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_evidence_type ON evidence_items(type) WHERE deleted_at IS NULL;

-- Violations table
-- Category: UNAUTHORIZED_STALL, HANDICAPPED_NO_PLACARD, EXPIRED_REGISTRATION, FIRE_LANE, NO_PARKING_ZONE
-- Status: DETECTED, NOTICE_ELIGIBLE, NOTICE_ISSUED, ESCALATED, TOW_ELIGIBLE, RESOLVED, DISMISSED
CREATE TABLE IF NOT EXISTS violations (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
    site_id TEXT NOT NULL REFERENCES sites(id),
    vehicle_id TEXT REFERENCES vehicles(id),
    parking_position_id TEXT REFERENCES parking_positions(id),
    category TEXT NOT NULL CHECK(category IN ('UNAUTHORIZED_STALL', 'HANDICAPPED_NO_PLACARD', 'EXPIRED_REGISTRATION', 'FIRE_LANE', 'NO_PARKING_ZONE')),
    status TEXT NOT NULL DEFAULT 'DETECTED' CHECK(status IN ('DETECTED', 'NOTICE_ELIGIBLE', 'NOTICE_ISSUED', 'ESCALATED', 'TOW_ELIGIBLE', 'RESOLVED', 'DISMISSED')),
    detected_at TEXT NOT NULL,
    resolved_at TEXT,
    dismissed_at TEXT,
    dismissal_reason TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_violations_site ON violations(site_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_violations_vehicle ON violations(vehicle_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_violations_position ON violations(parking_position_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_violations_category ON violations(category) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_violations_status ON violations(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_violations_detected_at ON violations(detected_at) WHERE deleted_at IS NULL;

-- Violation events table
-- Event type: DETECTED, OBSERVATION_ADDED, NOTICE_ELIGIBLE, NOTICE_ISSUED, ESCALATED, TOW_ELIGIBLE, RESOLVED, DISMISSED
CREATE TABLE IF NOT EXISTS violation_events (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
    violation_id TEXT NOT NULL REFERENCES violations(id),
    event_type TEXT NOT NULL CHECK(event_type IN ('DETECTED', 'OBSERVATION_ADDED', 'NOTICE_ELIGIBLE', 'NOTICE_ISSUED', 'ESCALATED', 'TOW_ELIGIBLE', 'RESOLVED', 'DISMISSED')),
    event_at TEXT NOT NULL DEFAULT (datetime('now')),
    observation_id TEXT REFERENCES observations(id),
    notice_id TEXT,
    notes TEXT,
    performed_by TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_violation_events_violation ON violation_events(violation_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_violation_events_type ON violation_events(event_type) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_violation_events_time ON violation_events(event_at) WHERE deleted_at IS NULL;

-- Notices table
CREATE TABLE IF NOT EXISTS notices (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
    violation_id TEXT NOT NULL REFERENCES violations(id),
    issued_at TEXT NOT NULL DEFAULT (datetime('now')),
    issued_by TEXT NOT NULL,
    qr_token TEXT NOT NULL,
    text_payload TEXT NOT NULL,
    printed_at TEXT,
    idempotency_key TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notices_qr_token ON notices(qr_token) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_notices_idempotency ON notices(idempotency_key) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notices_violation ON notices(violation_id) WHERE deleted_at IS NULL;

-- Recipient accounts table
CREATE TABLE IF NOT EXISTS recipient_accounts (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
    email TEXT NOT NULL,
    email_verified_at TEXT,
    first_name TEXT,
    last_name TEXT,
    phone_number TEXT,
    profile_completed_at TEXT,
    activation_token TEXT,
    activation_sent_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_recipient_accounts_email ON recipient_accounts(email) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_recipient_accounts_activation ON recipient_accounts(activation_token) WHERE deleted_at IS NULL AND activation_token IS NOT NULL;

-- Recipient access logs table
CREATE TABLE IF NOT EXISTS recipient_access_logs (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
    recipient_account_id TEXT NOT NULL REFERENCES recipient_accounts(id),
    notice_id TEXT NOT NULL REFERENCES notices(id),
    accessed_at TEXT NOT NULL DEFAULT (datetime('now')),
    ip_address TEXT,
    user_agent TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_recipient_access_logs_account ON recipient_access_logs(recipient_account_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_recipient_access_logs_notice ON recipient_access_logs(notice_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_recipient_access_logs_time ON recipient_access_logs(accessed_at) WHERE deleted_at IS NULL;

-- Updated_at triggers
CREATE TRIGGER IF NOT EXISTS update_sites_updated_at
AFTER UPDATE ON sites FOR EACH ROW
BEGIN
    UPDATE sites SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_lot_images_updated_at
AFTER UPDATE ON lot_images FOR EACH ROW
BEGIN
    UPDATE lot_images SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_parking_positions_updated_at
AFTER UPDATE ON parking_positions FOR EACH ROW
BEGIN
    UPDATE parking_positions SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_vehicles_updated_at
AFTER UPDATE ON vehicles FOR EACH ROW
BEGIN
    UPDATE vehicles SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_observations_updated_at
AFTER UPDATE ON observations FOR EACH ROW
BEGIN
    UPDATE observations SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_evidence_items_updated_at
AFTER UPDATE ON evidence_items FOR EACH ROW
BEGIN
    UPDATE evidence_items SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_violations_updated_at
AFTER UPDATE ON violations FOR EACH ROW
BEGIN
    UPDATE violations SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_violation_events_updated_at
AFTER UPDATE ON violation_events FOR EACH ROW
BEGIN
    UPDATE violation_events SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_notices_updated_at
AFTER UPDATE ON notices FOR EACH ROW
BEGIN
    UPDATE notices SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_recipient_accounts_updated_at
AFTER UPDATE ON recipient_accounts FOR EACH ROW
BEGIN
    UPDATE recipient_accounts SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_recipient_access_logs_updated_at
AFTER UPDATE ON recipient_access_logs FOR EACH ROW
BEGIN
    UPDATE recipient_access_logs SET updated_at = datetime('now') WHERE id = NEW.id;
END;
