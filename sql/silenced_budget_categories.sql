-- Migration: Add silenced_budget_categories to users table
-- This stores categories where the user has silenced the "no budget" prompt
-- Each entry has: { category: string, silenced_at: timestamp }
-- Entries older than 30 days are ignored (user will be prompted again)

ALTER TABLE users
ADD COLUMN IF NOT EXISTS silenced_budget_categories JSONB DEFAULT '[]';

-- Add index for faster queries (optional, but helpful if we filter by this)
CREATE INDEX IF NOT EXISTS idx_users_silenced_budget_categories
ON users USING GIN (silenced_budget_categories);

-- Example of data structure:
-- [
--   { "category": "comida", "silenced_at": "2024-02-28T10:00:00Z" },
--   { "category": "entretenimiento", "silenced_at": "2024-02-15T10:00:00Z" }
-- ]
