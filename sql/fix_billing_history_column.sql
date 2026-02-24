-- Fix billing_history table: add error_message column if missing
-- Run this if you get "Could not find the 'error_message' column" error

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'billing_history' AND column_name = 'error_message'
  ) THEN
    ALTER TABLE billing_history ADD COLUMN error_message TEXT;
    RAISE NOTICE 'Added error_message column to billing_history';
  ELSE
    RAISE NOTICE 'error_message column already exists';
  END IF;
END $$;
