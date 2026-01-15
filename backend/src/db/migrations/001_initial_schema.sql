-- Cedar Terrace Parking Enforcement System
-- Initial schema migration

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Sites table
CREATE TABLE sites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    address TEXT NOT NULL,
    timezone VARCHAR(100) NOT NULL DEFAULT 'UTC',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_sites_active ON sites(is_active) WHERE deleted_at IS NULL;

-- Lot images table
CREATE TABLE lot_images (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    site_id UUID NOT NULL REFERENCES sites(id),
    s3_key VARCHAR(500) NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_lot_images_site ON lot_images(site_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_lot_images_active ON lot_images(is_active) WHERE deleted_at IS NULL;

-- Parking positions table
CREATE TYPE parking_position_type AS ENUM ('OPEN', 'PURCHASED', 'RESERVED', 'HANDICAPPED');

CREATE TABLE parking_positions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    site_id UUID NOT NULL REFERENCES sites(id),
    lot_image_id UUID NOT NULL REFERENCES lot_images(id),
    type parking_position_type NOT NULL,
    center_x NUMERIC(10, 2) NOT NULL,
    center_y NUMERIC(10, 2) NOT NULL,
    radius NUMERIC(10, 2) NOT NULL,
    identifier VARCHAR(50),
    rental_info TEXT,
    assigned_vehicle_id UUID,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_parking_positions_site ON parking_positions(site_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_parking_positions_lot_image ON parking_positions(lot_image_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_parking_positions_type ON parking_positions(type) WHERE deleted_at IS NULL;

-- Vehicles table
CREATE TABLE vehicles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    license_plate VARCHAR(20) NOT NULL,
    issuing_state VARCHAR(10) NOT NULL,
    make VARCHAR(100),
    model VARCHAR(100),
    color VARCHAR(50),
    last_observed_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE UNIQUE INDEX idx_vehicles_plate_state ON vehicles(license_plate, issuing_state) WHERE deleted_at IS NULL;
CREATE INDEX idx_vehicles_last_observed ON vehicles(last_observed_at) WHERE deleted_at IS NULL;

-- Observations table
CREATE TABLE observations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    site_id UUID NOT NULL REFERENCES sites(id),
    vehicle_id UUID REFERENCES vehicles(id),
    parking_position_id UUID REFERENCES parking_positions(id),
    observed_at TIMESTAMP WITH TIME ZONE NOT NULL,
    license_plate VARCHAR(20),
    issuing_state VARCHAR(10),
    registration_month INTEGER CHECK (registration_month BETWEEN 1 AND 12),
    registration_year INTEGER CHECK (registration_year > 2000),
    idempotency_key VARCHAR(100) NOT NULL,
    submitted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    submitted_by VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE UNIQUE INDEX idx_observations_idempotency ON observations(idempotency_key) WHERE deleted_at IS NULL;
CREATE INDEX idx_observations_site ON observations(site_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_observations_vehicle ON observations(vehicle_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_observations_position ON observations(parking_position_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_observations_observed_at ON observations(observed_at) WHERE deleted_at IS NULL;

-- Evidence items table
CREATE TYPE evidence_type AS ENUM ('PHOTO', 'TEXT_NOTE');
CREATE TYPE evidence_intent AS ENUM ('PRIMARY_VEHICLE', 'SECONDARY_VEHICLE', 'REGISTRATION_UPDATE', 'HANDICAPPED_PLACARD', 'GENERAL');

CREATE TABLE evidence_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    observation_id UUID NOT NULL REFERENCES observations(id),
    type evidence_type NOT NULL,
    s3_key VARCHAR(500),
    s3_hash VARCHAR(100),
    captured_at TIMESTAMP WITH TIME ZONE,
    intent evidence_intent,
    note_text TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT photo_fields_check CHECK (
        (type = 'PHOTO' AND s3_key IS NOT NULL) OR
        (type = 'TEXT_NOTE' AND note_text IS NOT NULL)
    )
);

CREATE INDEX idx_evidence_observation ON evidence_items(observation_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_evidence_type ON evidence_items(type) WHERE deleted_at IS NULL;

-- Violations table
CREATE TYPE violation_category AS ENUM (
    'UNAUTHORIZED_STALL',
    'HANDICAPPED_NO_PLACARD',
    'EXPIRED_REGISTRATION',
    'FIRE_LANE',
    'NO_PARKING_ZONE'
);

CREATE TYPE violation_status AS ENUM (
    'DETECTED',
    'NOTICE_ELIGIBLE',
    'NOTICE_ISSUED',
    'ESCALATED',
    'TOW_ELIGIBLE',
    'RESOLVED',
    'DISMISSED'
);

CREATE TABLE violations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    site_id UUID NOT NULL REFERENCES sites(id),
    vehicle_id UUID REFERENCES vehicles(id),
    parking_position_id UUID REFERENCES parking_positions(id),
    category violation_category NOT NULL,
    status violation_status NOT NULL DEFAULT 'DETECTED',
    detected_at TIMESTAMP WITH TIME ZONE NOT NULL,
    resolved_at TIMESTAMP WITH TIME ZONE,
    dismissed_at TIMESTAMP WITH TIME ZONE,
    dismissal_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_violations_site ON violations(site_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_violations_vehicle ON violations(vehicle_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_violations_position ON violations(parking_position_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_violations_category ON violations(category) WHERE deleted_at IS NULL;
CREATE INDEX idx_violations_status ON violations(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_violations_detected_at ON violations(detected_at) WHERE deleted_at IS NULL;

-- Violation events table
CREATE TYPE violation_event_type AS ENUM (
    'DETECTED',
    'OBSERVATION_ADDED',
    'NOTICE_ELIGIBLE',
    'NOTICE_ISSUED',
    'ESCALATED',
    'TOW_ELIGIBLE',
    'RESOLVED',
    'DISMISSED'
);

CREATE TABLE violation_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    violation_id UUID NOT NULL REFERENCES violations(id),
    event_type violation_event_type NOT NULL,
    event_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    observation_id UUID REFERENCES observations(id),
    notice_id UUID,
    notes TEXT,
    performed_by VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_violation_events_violation ON violation_events(violation_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_violation_events_type ON violation_events(event_type) WHERE deleted_at IS NULL;
CREATE INDEX idx_violation_events_time ON violation_events(event_at) WHERE deleted_at IS NULL;

-- Notices table
CREATE TABLE notices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    violation_id UUID NOT NULL REFERENCES violations(id),
    issued_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    issued_by VARCHAR(100) NOT NULL,
    qr_token VARCHAR(100) NOT NULL,
    text_payload TEXT NOT NULL,
    printed_at TIMESTAMP WITH TIME ZONE,
    idempotency_key VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE UNIQUE INDEX idx_notices_qr_token ON notices(qr_token) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX idx_notices_idempotency ON notices(idempotency_key) WHERE deleted_at IS NULL;
CREATE INDEX idx_notices_violation ON notices(violation_id) WHERE deleted_at IS NULL;

-- Recipient accounts table
CREATE TABLE recipient_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) NOT NULL,
    email_verified_at TIMESTAMP WITH TIME ZONE,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    phone_number VARCHAR(20),
    profile_completed_at TIMESTAMP WITH TIME ZONE,
    activation_token VARCHAR(100),
    activation_sent_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE UNIQUE INDEX idx_recipient_accounts_email ON recipient_accounts(email) WHERE deleted_at IS NULL;
CREATE INDEX idx_recipient_accounts_activation ON recipient_accounts(activation_token) WHERE deleted_at IS NULL AND activation_token IS NOT NULL;

-- Recipient access logs table
CREATE TABLE recipient_access_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recipient_account_id UUID NOT NULL REFERENCES recipient_accounts(id),
    notice_id UUID NOT NULL REFERENCES notices(id),
    accessed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ip_address VARCHAR(50),
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_recipient_access_logs_account ON recipient_access_logs(recipient_account_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_recipient_access_logs_notice ON recipient_access_logs(notice_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_recipient_access_logs_time ON recipient_access_logs(accessed_at) WHERE deleted_at IS NULL;

-- Updated_at triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_sites_updated_at BEFORE UPDATE ON sites FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_lot_images_updated_at BEFORE UPDATE ON lot_images FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_parking_positions_updated_at BEFORE UPDATE ON parking_positions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_vehicles_updated_at BEFORE UPDATE ON vehicles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_observations_updated_at BEFORE UPDATE ON observations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_evidence_items_updated_at BEFORE UPDATE ON evidence_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_violations_updated_at BEFORE UPDATE ON violations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_violation_events_updated_at BEFORE UPDATE ON violation_events FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_notices_updated_at BEFORE UPDATE ON notices FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_recipient_accounts_updated_at BEFORE UPDATE ON recipient_accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_recipient_access_logs_updated_at BEFORE UPDATE ON recipient_access_logs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
