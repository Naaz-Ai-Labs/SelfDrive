-- Supabase Production Schema Fix & Sync Migration
-- Execute this SQL in your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/puymlkdcoqpptajslucu/sql

-- 1. Add missing left_at column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS left_at TIMESTAMP WITH TIME ZONE;

-- 2. Create missing staff_history table
CREATE TABLE IF NOT EXISTS staff_history (
  id BIGSERIAL PRIMARY KEY,
  staff_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  performed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  detail TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_staff_history_staff ON staff_history(staff_id);

-- 3. Add missing financial ledger columns to payments table
ALTER TABLE payments ADD COLUMN IF NOT EXISTS amount_paise BIGINT NOT NULL DEFAULT 0;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'INR';
ALTER TABLE payments ADD COLUMN IF NOT EXISTS razorpay_order_id TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS razorpay_payment_id TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS razorpay_signature TEXT;

CREATE INDEX IF NOT EXISTS idx_payments_rzp_order ON payments(razorpay_order_id);
CREATE INDEX IF NOT EXISTS idx_payments_rzp_payment ON payments(razorpay_payment_id);

-- 4. Create missing payment_events webhook audit trail table
CREATE TABLE IF NOT EXISTS payment_events (
  id BIGSERIAL PRIMARY KEY,
  transaction_id BIGINT REFERENCES payments(id) ON DELETE SET NULL,
  event_id TEXT UNIQUE,
  event_type TEXT NOT NULL,
  razorpay_order_id TEXT,
  razorpay_payment_id TEXT,
  payload TEXT NOT NULL,
  signature_verified INTEGER NOT NULL DEFAULT 1,
  processed INTEGER NOT NULL DEFAULT 0,
  processing_error TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX IF NOT EXISTS idx_payment_events_event_id ON payment_events(event_id);
