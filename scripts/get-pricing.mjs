#!/usr/bin/env node
/**
 * Script to query pricing from Supabase
 * Used by the /pricing skill to get dynamic pricing data
 *
 * Usage: node scripts/get-pricing.mjs [--format json|table|markdown]
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_ANON_KEY must be set');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Parse format argument
let format = 'markdown'; // default
if (process.argv.includes('--json')) format = 'json';
else if (process.argv.includes('--table')) format = 'table';
else if (process.argv.includes('--markdown')) format = 'markdown';
else if (process.argv[2]?.startsWith('--format=')) {
  format = process.argv[2].replace('--format=', '');
}

async function getPricing() {
  try {
    const { data: plans, error } = await supabase
      .from('subscription_plans')
      .select('*')
      .order('price_monthly', { ascending: true });

    if (error) throw error;

    if (!plans || plans.length === 0) {
      console.log('No pricing plans found in database.');
      return;
    }

    // Format output
    switch (format) {
      case 'json':
        console.log(JSON.stringify(plans, null, 2));
        break;

      case 'table':
        console.log('\n┌─────────────┬────────────┬────────────────┬──────────────┐');
        console.log('│ Plan        │ Precio/mes │ Moneditas/mes  │ Historial    │');
        console.log('├─────────────┼────────────┼────────────────┼──────────────┤');
        for (const plan of plans) {
          const price = plan.price_monthly === 0 ? 'Gratis' : `$${Number(plan.price_monthly).toLocaleString('es-CO')}`;
          const moneditas = plan.moneditas_monthly || getDefaultMoneditas(plan.id);
          const history = plan.history_days || getDefaultHistory(plan.id);
          console.log(`│ ${plan.name.padEnd(11)} │ ${price.padEnd(10)} │ ${String(moneditas).padEnd(14)} │ ${String(history) + ' días'.padEnd(12)} │`);
        }
        console.log('└─────────────┴────────────┴────────────────┴──────────────┘\n');
        break;

      case 'markdown':
      default:
        console.log('\n## Planes de Suscripción (desde Supabase)\n');
        console.log('| Plan | Precio/mes | Moneditas/mes | Historial |');
        console.log('|------|------------|---------------|-----------|');
        for (const plan of plans) {
          const price = plan.price_monthly === 0 ? 'Gratis' : `$${Number(plan.price_monthly).toLocaleString('es-CO')} COP`;
          const moneditas = plan.moneditas_monthly || getDefaultMoneditas(plan.id);
          const history = plan.history_days || getDefaultHistory(plan.id);
          console.log(`| **${plan.name}** | ${price} | ${moneditas} | ${history} días |`);
        }
        console.log('\n### Detalles por Plan\n');
        for (const plan of plans) {
          const price = plan.price_monthly === 0 ? 'Gratis' : `$${Number(plan.price_monthly).toLocaleString('es-CO')} COP`;
          const moneditas = plan.moneditas_monthly || getDefaultMoneditas(plan.id);
          console.log(`#### ${plan.name} - ${price}/mes`);
          console.log(`- **Moneditas:** ${moneditas}/mes (~${Math.round(moneditas / 5)} gastos)`);
          console.log(`- **Historial:** ${plan.history_days || getDefaultHistory(plan.id)} días`);
          console.log(`- **Presupuestos:** ${plan.limit_budgets === -1 ? 'Ilimitados' : plan.limit_budgets}`);
          console.log(`- **Exportar CSV:** ${plan.can_export_csv ? 'Sí' : 'No'}`);
          console.log(`- **Exportar PDF:** ${plan.can_export_pdf ? 'Sí' : 'No'}`);
          console.log('');
        }
        break;
    }
  } catch (error) {
    console.error('Error querying Supabase:', error.message);
    process.exit(1);
  }
}

function getDefaultMoneditas(planId) {
  const defaults = { free: 50, basic: 1200, premium: 3500 };
  return defaults[planId] || 50;
}

function getDefaultHistory(planId) {
  const defaults = { free: 30, basic: 180, premium: 365 };
  return defaults[planId] || 30;
}

getPricing();
