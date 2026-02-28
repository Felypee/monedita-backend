#!/usr/bin/env node
/**
 * Script to delete all data for a specific user
 * Usage: node scripts/deleteUserData.js <phone>
 * Example: node scripts/deleteUserData.js 3114740716
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function deleteUserData(phone) {
  console.log(`\n🗑️  Deleting all data for phone: ${phone}\n`);

  const tables = [
    { name: 'expenses', column: 'phone' },
    { name: 'budgets', column: 'phone' },
    { name: 'moneditas_usage', column: 'phone' },
    { name: 'usage_tracking', column: 'phone' },
    { name: 'user_subscriptions', column: 'phone' },
    { name: 'unprocessed_cases', column: 'phone' },
    { name: 'bank_links', column: 'phone' },
    { name: 'shared_expense_participants', column: 'phone' },
    { name: 'recurring_payment_history', column: 'phone' },
    { name: 'users', column: 'phone' },
  ];

  for (const { name, column } of tables) {
    try {
      const { data, error, count } = await supabase
        .from(name)
        .delete()
        .eq(column, phone)
        .select();

      if (error) {
        if (error.code === '42P01') {
          console.log(`  ⏭️  ${name}: table doesn't exist, skipping`);
        } else {
          console.log(`  ❌ ${name}: ${error.message}`);
        }
      } else {
        const deleted = data?.length || 0;
        if (deleted > 0) {
          console.log(`  ✅ ${name}: deleted ${deleted} row(s)`);
        } else {
          console.log(`  ⚪ ${name}: no data found`);
        }
      }
    } catch (err) {
      console.log(`  ❌ ${name}: ${err.message}`);
    }
  }

  console.log('\n✨ Done!\n');
}

// Get phone from command line
const phone = process.argv[2];

if (!phone) {
  console.error('Usage: node scripts/deleteUserData.js <phone>');
  console.error('Example: node scripts/deleteUserData.js 3114740716');
  process.exit(1);
}

deleteUserData(phone);
