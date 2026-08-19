-- Migration: Add permissions column to users table for granular staff service scopes
ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions TEXT;

COMMENT ON COLUMN users.permissions IS 'JSON array of authorized service scopes (e.g. ["bookings", "vehicles", "enquiries"])';
