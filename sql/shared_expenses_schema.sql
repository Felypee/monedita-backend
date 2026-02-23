-- Shared Expenses Schema for Monedita
-- Run this in Supabase SQL Editor to create the necessary tables

-- Expense Groups table
CREATE TABLE IF NOT EXISTS expense_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(phone) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Group Members table
CREATE TABLE IF NOT EXISTS group_members (
  group_id TEXT NOT NULL REFERENCES expense_groups(id) ON DELETE CASCADE,
  member_phone TEXT NOT NULL REFERENCES users(phone) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (group_id, member_phone)
);

-- Shared Expenses table
CREATE TABLE IF NOT EXISTS shared_expenses (
  id SERIAL PRIMARY KEY,
  group_id TEXT REFERENCES expense_groups(id) ON DELETE CASCADE,
  creator_phone TEXT NOT NULL REFERENCES users(phone) ON DELETE CASCADE,
  amount DECIMAL(15, 2) NOT NULL,
  category TEXT NOT NULL,
  description TEXT DEFAULT '',
  split_type TEXT NOT NULL DEFAULT 'equal' CHECK (split_type IN ('equal', 'custom')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Expense Splits table
CREATE TABLE IF NOT EXISTS expense_splits (
  id SERIAL PRIMARY KEY,
  expense_id INTEGER NOT NULL REFERENCES shared_expenses(id) ON DELETE CASCADE,
  member_phone TEXT NOT NULL REFERENCES users(phone) ON DELETE CASCADE,
  amount DECIMAL(15, 2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
  paid_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_expense_groups_created_by ON expense_groups(created_by);
CREATE INDEX IF NOT EXISTS idx_group_members_phone ON group_members(member_phone);
CREATE INDEX IF NOT EXISTS idx_shared_expenses_group ON shared_expenses(group_id);
CREATE INDEX IF NOT EXISTS idx_shared_expenses_creator ON shared_expenses(creator_phone);
CREATE INDEX IF NOT EXISTS idx_expense_splits_expense ON expense_splits(expense_id);
CREATE INDEX IF NOT EXISTS idx_expense_splits_member ON expense_splits(member_phone);
CREATE INDEX IF NOT EXISTS idx_expense_splits_status ON expense_splits(status);

-- Trigger to update updated_at on expense_groups
CREATE OR REPLACE FUNCTION update_expense_groups_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER expense_groups_updated_at
  BEFORE UPDATE ON expense_groups
  FOR EACH ROW
  EXECUTE FUNCTION update_expense_groups_updated_at();

-- Trigger to update updated_at on shared_expenses
CREATE OR REPLACE FUNCTION update_shared_expenses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER shared_expenses_updated_at
  BEFORE UPDATE ON shared_expenses
  FOR EACH ROW
  EXECUTE FUNCTION update_shared_expenses_updated_at();

-- Enable RLS (Row Level Security) - optional, enable if needed
-- ALTER TABLE expense_groups ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE shared_expenses ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE expense_splits ENABLE ROW LEVEL SECURITY;
