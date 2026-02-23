#!/usr/bin/env node
/**
 * Run Belvo Schema Migration
 *
 * Usage:
 *   SUPABASE_DB_PASSWORD=your_password node scripts/run-belvo-migration.js
 *
 * Or get the password from Supabase Dashboard:
 *   Project Settings > Database > Connection string > Password
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get database credentials from environment
const SUPABASE_URL = process.env.SUPABASE_URL;
const DB_PASSWORD = process.env.SUPABASE_DB_PASSWORD;

if (!SUPABASE_URL) {
  console.error('❌ SUPABASE_URL not set in environment');
  process.exit(1);
}

if (!DB_PASSWORD) {
  console.error('❌ SUPABASE_DB_PASSWORD not set');
  console.error('');
  console.error('To get your database password:');
  console.error('1. Go to Supabase Dashboard: https://supabase.com/dashboard');
  console.error('2. Select your project');
  console.error('3. Go to Project Settings > Database');
  console.error('4. Copy the password from "Connection string"');
  console.error('');
  console.error('Then run:');
  console.error('  SUPABASE_DB_PASSWORD=your_password node scripts/run-belvo-migration.js');
  process.exit(1);
}

// Extract project ref from URL
const projectRef = SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
if (!projectRef) {
  console.error('❌ Could not extract project ref from SUPABASE_URL');
  process.exit(1);
}

// Construct connection string
const connectionString = `postgresql://postgres.${projectRef}:${DB_PASSWORD}@aws-0-us-west-1.pooler.supabase.com:6543/postgres`;

async function runMigration() {
  console.log('🚀 Running Belvo Open Banking migration...');
  console.log(`📦 Project: ${projectRef}`);

  // Read SQL file
  const sqlPath = path.join(__dirname, '..', 'sql', 'belvo_schema.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  // Connect to database
  const client = new pg.Client({ connectionString });

  try {
    await client.connect();
    console.log('✅ Connected to database');

    // Run migration
    await client.query(sql);
    console.log('✅ Migration completed successfully!');

    // Verify tables exist
    const result = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('bank_links', 'bank_import_usage')
    `);

    console.log('');
    console.log('📋 Created tables:');
    result.rows.forEach(row => console.log(`   - ${row.table_name}`));

    // Check columns added to expenses
    const expenseColumns = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'expenses'
      AND column_name IN ('source', 'external_id')
    `);

    console.log('');
    console.log('📋 Added columns to expenses:');
    expenseColumns.rows.forEach(row => console.log(`   - ${row.column_name}`));

    // Check subscription_plans columns
    const planColumns = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'subscription_plans'
      AND column_name IN ('bank_connections', 'bank_transactions_per_month')
    `);

    console.log('');
    console.log('📋 Added columns to subscription_plans:');
    planColumns.rows.forEach(row => console.log(`   - ${row.column_name}`));

    // Check Premium plan has Open Banking limits
    const premiumPlan = await client.query(`
      SELECT id, bank_connections, bank_transactions_per_month
      FROM subscription_plans
      WHERE id = 'premium'
    `);

    if (premiumPlan.rows.length > 0) {
      const plan = premiumPlan.rows[0];
      console.log('');
      console.log('📋 Premium plan Open Banking limits:');
      console.log(`   - bank_connections: ${plan.bank_connections}`);
      console.log(`   - bank_transactions_per_month: ${plan.bank_transactions_per_month}`);
    }

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();
