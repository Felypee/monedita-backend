-- Belvo Open Banking Schema
-- Run this migration to enable bank connection features

-- Table for bank connections (Belvo Links)
CREATE TABLE IF NOT EXISTS bank_links (
  id SERIAL PRIMARY KEY,
  phone TEXT NOT NULL,
  link_id TEXT UNIQUE NOT NULL,           -- Belvo link ID
  institution TEXT NOT NULL,              -- Bank name (e.g., "Bancolombia")
  institution_id TEXT NOT NULL,           -- Belvo institution ID
  status TEXT DEFAULT 'pending',          -- pending, active, error, revoked
  last_sync_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for bank_links
CREATE INDEX IF NOT EXISTS idx_bank_links_phone ON bank_links(phone);
CREATE INDEX IF NOT EXISTS idx_bank_links_status ON bank_links(status);
CREATE INDEX IF NOT EXISTS idx_bank_links_link_id ON bank_links(link_id);

-- Add source and external_id columns to expenses table
-- source: 'manual' (default), 'bank_import', 'receipt_scan'
-- external_id: for deduplication of bank transactions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'expenses' AND column_name = 'source'
  ) THEN
    ALTER TABLE expenses ADD COLUMN source TEXT DEFAULT 'manual';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'expenses' AND column_name = 'external_id'
  ) THEN
    ALTER TABLE expenses ADD COLUMN external_id TEXT;
  END IF;
END $$;

-- Create unique index for external_id to prevent duplicate bank transactions
CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_external_id
  ON expenses(phone, external_id)
  WHERE external_id IS NOT NULL;

-- Add Open Banking limits to subscription_plans
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscription_plans' AND column_name = 'bank_connections'
  ) THEN
    ALTER TABLE subscription_plans ADD COLUMN bank_connections INTEGER DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscription_plans' AND column_name = 'bank_transactions_per_month'
  ) THEN
    ALTER TABLE subscription_plans ADD COLUMN bank_transactions_per_month INTEGER DEFAULT 0;
  END IF;
END $$;

-- Update Premium plan with Open Banking limits
UPDATE subscription_plans
SET bank_connections = 1,
    bank_transactions_per_month = 500
WHERE id = 'premium';

-- Table for tracking bank transaction imports per period
CREATE TABLE IF NOT EXISTS bank_import_usage (
  id SERIAL PRIMARY KEY,
  phone TEXT NOT NULL,
  period_start TIMESTAMP WITH TIME ZONE NOT NULL,
  transactions_imported INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(phone, period_start)
);

CREATE INDEX IF NOT EXISTS idx_bank_import_usage_phone ON bank_import_usage(phone);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_bank_links_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS trigger_bank_links_updated_at ON bank_links;
CREATE TRIGGER trigger_bank_links_updated_at
  BEFORE UPDATE ON bank_links
  FOR EACH ROW
  EXECUTE FUNCTION update_bank_links_updated_at();
