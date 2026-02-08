-- Tutorials table for tracking onboarding progress
-- Run this in your Supabase SQL editor

CREATE TABLE IF NOT EXISTS tutorials (
  id SERIAL PRIMARY KEY,
  phone TEXT UNIQUE NOT NULL,
  current_step INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster lookups by phone
CREATE INDEX IF NOT EXISTS idx_tutorials_phone ON tutorials(phone);

-- Enable RLS (Row Level Security) if needed
-- ALTER TABLE tutorials ENABLE ROW LEVEL SECURITY;
