-- Staging Database Initialization Script
-- This script initializes the staging database with test data and schema.
-- It is idempotent: scripts/reset-staging.sh re-applies it after every reset,
-- so every statement must be safe to run against an already-initialized database.

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create schemas
CREATE SCHEMA IF NOT EXISTS public;

-- Grant permissions to staging user
GRANT ALL PRIVILEGES ON DATABASE stellar_veriphy_staging TO staging_user;
GRANT ALL PRIVILEGES ON SCHEMA public TO staging_user;

-- Create tables for content verification
CREATE TABLE IF NOT EXISTS content_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    content_hash VARCHAR(64) UNIQUE NOT NULL,
    creator_address VARCHAR(56) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'draft',
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Create table for verification proofs
CREATE TABLE IF NOT EXISTS verification_proofs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    content_id UUID NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
    proof_hash VARCHAR(64) NOT NULL,
    verifier_address VARCHAR(56) NOT NULL,
    proof_data JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    verified_at TIMESTAMP
);

-- Create table for provenance tracking
CREATE TABLE IF NOT EXISTS provenance_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    content_id UUID NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
    from_address VARCHAR(56) NOT NULL,
    to_address VARCHAR(56),
    transaction_hash VARCHAR(64),
    operation_type VARCHAR(50),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_content_creator ON content_items(creator_address);
CREATE INDEX IF NOT EXISTS idx_content_hash ON content_items(content_hash);
CREATE INDEX IF NOT EXISTS idx_content_status ON content_items(status);
CREATE INDEX IF NOT EXISTS idx_verification_content ON verification_proofs(content_id);
CREATE INDEX IF NOT EXISTS idx_verification_verifier ON verification_proofs(verifier_address);
CREATE INDEX IF NOT EXISTS idx_provenance_content ON provenance_records(content_id);
CREATE INDEX IF NOT EXISTS idx_provenance_timestamp ON provenance_records(timestamp);

-- Grant table permissions to staging_user
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO staging_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO staging_user;

-- Insert sample test data for staging
INSERT INTO content_items (title, description, content_hash, creator_address, status)
VALUES
    ('Test Document 1', 'Sample document for testing', 'abc123def456abc123def456abc123def456abc123def456abc123def456abc1', 'GBVFMWQ5VP5RVVQTWGBDPLQM7JKXQW7', 'published'),
    ('Test Document 2', 'Another sample document', 'def456ghi789def456ghi789def456ghi789def456ghi789def456ghi789def456', 'GBVFMWQ5VP5RVVQTWGBDPLQM7JKXQW7', 'published')
ON CONFLICT DO NOTHING;

-- Create view for recent content
CREATE OR REPLACE VIEW recent_content AS
SELECT id, title, creator_address, created_at, status
FROM content_items
ORDER BY created_at DESC
LIMIT 100;

-- Grant view permissions
GRANT SELECT ON recent_content TO staging_user;

-- Create function for updating updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for content_items
DROP TRIGGER IF EXISTS update_content_items_updated_at ON content_items;
CREATE TRIGGER update_content_items_updated_at
BEFORE UPDATE ON content_items
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Vacuum and analyze
VACUUM ANALYZE;
