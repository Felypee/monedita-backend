#!/usr/bin/env node
/**
 * Test Billing Script
 * Simulates the billing flow for testing purposes
 *
 * Usage:
 *   node scripts/test-billing.js --phone 573001234567
 *   node scripts/test-billing.js --phone 573001234567 --plan premium
 *   node scripts/test-billing.js --phone 573001234567 --dry-run
 *   node scripts/test-billing.js --phone 573001234567 --setup-only
 */

import dotenv from 'dotenv';
dotenv.config();

// Parse arguments
const args = process.argv.slice(2);
const getArg = (name) => {
  const index = args.indexOf(`--${name}`);
  if (index === -1) return null;
  return args[index + 1] || true;
};

const phone = getArg('phone');
const planId = getArg('plan') || 'premium';
const dryRun = args.includes('--dry-run');
const setupOnly = args.includes('--setup-only');
const help = args.includes('--help') || args.includes('-h');

if (help || !phone) {
  console.log(`
📋 Test Billing Script

Simula el flujo de cobro recurrente de Wompi para testing.

Uso:
  node scripts/test-billing.js --phone <numero> [opciones]

Opciones:
  --phone <numero>   Número de teléfono (requerido, ej: 573001234567)
  --plan <plan>      Plan a cobrar (default: premium)
  --dry-run          Solo mostrar qué haría, sin ejecutar
  --setup-only       Solo configurar usuario, no ejecutar cobro
  --help             Mostrar esta ayuda

Ejemplos:
  node scripts/test-billing.js --phone 573001234567
  node scripts/test-billing.js --phone 573001234567 --plan basic --dry-run
  node scripts/test-billing.js --phone 573001234567 --setup-only
`);
  process.exit(0);
}

console.log(`
╔════════════════════════════════════════════╗
║     🧪 Test Billing - Monedita            ║
╚════════════════════════════════════════════╝
`);

async function main() {
  try {
    // Dynamic imports (ES modules)
    const { UserDB } = await import('../src/database/index.js');
    const { UserSubscriptionDB, PaymentSourceDB, BillingHistoryDB } = await import('../src/database/index.js');
    const { triggerRenewals } = await import('../src/services/billingScheduler.js');
    const { chargeRecurringPayment, getSubscriptionStatus } = await import('../src/services/wompiRecurringService.js');
    const { SUBSCRIPTION_PLANS } = await import('../src/services/wompiService.js');

    const plan = SUBSCRIPTION_PLANS[planId];
    if (!plan) {
      console.error(`❌ Plan no encontrado: ${planId}`);
      console.log(`   Planes disponibles: ${Object.keys(SUBSCRIPTION_PLANS).join(', ')}`);
      process.exit(1);
    }

    console.log(`📱 Teléfono: ${phone}`);
    console.log(`📦 Plan: ${plan.name} ($${plan.priceUSD} USD / $${plan.priceCOP} COP)`);
    console.log(`🔄 Modo: ${dryRun ? 'DRY RUN (sin cambios)' : setupOnly ? 'SETUP ONLY' : 'EJECUCIÓN COMPLETA'}`);
    console.log('');

    // Step 1: Check/Create user
    console.log('1️⃣  Verificando usuario...');
    let user = await UserDB.get(phone);
    if (!user) {
      if (dryRun) {
        console.log('   ⚪ Usuario no existe, se crearía');
      } else {
        user = await UserDB.create(phone, { currency: 'COP', language: 'es' });
        console.log('   ✅ Usuario creado');
      }
    } else {
      console.log(`   ✅ Usuario encontrado: ${user.name || '(sin nombre)'}`);
    }

    // Step 2: Check/Create subscription
    console.log('');
    console.log('2️⃣  Verificando suscripción...');
    let subscription = await UserSubscriptionDB.get(phone);

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    if (!subscription) {
      if (dryRun) {
        console.log('   ⚪ No hay suscripción, se crearía con nextBillingDate = ayer');
      } else {
        subscription = await UserSubscriptionDB.create(phone, {
          planId: planId,
          startedAt: new Date().toISOString(),
          nextBillingDate: yesterday.toISOString(),
          autoRenew: true,
        });
        console.log('   ✅ Suscripción creada');
        console.log(`      Plan: ${planId}`);
        console.log(`      Próximo cobro: ${yesterday.toLocaleDateString()} (VENCIDO - listo para cobrar)`);
      }
    } else {
      console.log(`   ✅ Suscripción existente: ${subscription.planId}`);
      console.log(`      Auto-renew: ${subscription.autoRenew ? 'Sí' : 'No'}`);
      console.log(`      Próximo cobro: ${subscription.nextBillingDate || 'No definido'}`);

      // Update to make it due for renewal
      if (!dryRun) {
        await UserSubscriptionDB.update(phone, {
          planId: planId,
          nextBillingDate: yesterday.toISOString(),
          autoRenew: true,
          cancelledAt: null,
        });
        console.log('   🔄 Actualizado: nextBillingDate = ayer (listo para cobrar)');
      }
    }

    // Step 3: Check/Create payment source
    console.log('');
    console.log('3️⃣  Verificando método de pago...');
    let paymentSource = await PaymentSourceDB.get(phone);

    if (!paymentSource) {
      if (dryRun) {
        console.log('   ⚪ No hay método de pago');
        console.log('   ⚠️  Para probar cobros reales, primero completa el flujo de suscripción:');
        console.log('      1. Envía "upgrade" por WhatsApp');
        console.log('      2. Completa el pago con tarjeta sandbox: 4242 4242 4242 4242');
      } else {
        // Create a mock payment source for testing
        // Note: This won't work with real Wompi charges unless you have a real card token
        console.log('   ⚠️  No hay PaymentSource real');
        console.log('');
        console.log('   Para crear un PaymentSource de prueba:');
        console.log('   1. Envía "upgrade" por WhatsApp al bot');
        console.log('   2. Abre el link de suscripción');
        console.log('   3. Usa la tarjeta sandbox: 4242 4242 4242 4242');
        console.log('   4. Vuelve a ejecutar este script');

        if (!setupOnly) {
          console.log('');
          console.log('   ¿Quieres crear un PaymentSource MOCK para testing local?');
          console.log('   (No funcionará con Wompi real, solo para probar el flujo)');

          // Create mock payment source
          paymentSource = await PaymentSourceDB.create(phone, {
            wompiPaymentSourceId: `mock_${Date.now()}`,
            cardLastFour: '4242',
            cardBrand: 'VISA',
            status: 'active',
          });
          console.log('   ✅ PaymentSource MOCK creado (solo para testing)');
        }
      }
    } else {
      console.log(`   ✅ Método de pago encontrado`);
      console.log(`      Tarjeta: ${paymentSource.cardBrand} ****${paymentSource.cardLastFour}`);
      console.log(`      Estado: ${paymentSource.status}`);
      console.log(`      Wompi ID: ${paymentSource.wompiPaymentSourceId}`);
    }

    if (setupOnly) {
      console.log('');
      console.log('═══════════════════════════════════════════════');
      console.log('✅ Setup completado. Ejecuta sin --setup-only para cobrar.');
      process.exit(0);
    }

    if (dryRun) {
      console.log('');
      console.log('═══════════════════════════════════════════════');
      console.log('🔍 DRY RUN completado. Ejecuta sin --dry-run para aplicar cambios.');
      process.exit(0);
    }

    // Step 4: Execute billing
    console.log('');
    console.log('4️⃣  Ejecutando cobro...');
    console.log('');

    if (!paymentSource || paymentSource.wompiPaymentSourceId.startsWith('mock_')) {
      console.log('   ⚠️  PaymentSource es MOCK - el cobro fallará con Wompi real');
      console.log('   ⚠️  Pero el flujo se ejecutará para testing');
      console.log('');
    }

    const result = await chargeRecurringPayment(phone, planId);

    console.log('');
    console.log('═══════════════════════════════════════════════');
    if (result.success) {
      console.log('✅ ¡COBRO EXITOSO!');
      console.log(`   Transaction ID: ${result.transactionId}`);
      console.log(`   Monto: $${plan.priceCOP} COP`);

      // Show updated subscription
      const status = await getSubscriptionStatus(phone);
      console.log(`   Próximo cobro: ${new Date(status.nextBillingDate).toLocaleDateString()}`);
    } else {
      console.log('❌ COBRO FALLIDO');
      console.log(`   Error: ${result.error}`);

      if (result.error.includes('payment_source') || result.error.includes('not found')) {
        console.log('');
        console.log('   💡 Tip: El PaymentSource no es válido en Wompi.');
        console.log('   Para probar con Wompi real:');
        console.log('   1. Asegúrate de tener WOMPI_PRIVATE_KEY configurado');
        console.log('   2. Completa un pago real con tarjeta sandbox');
      }
    }
    console.log('═══════════════════════════════════════════════');

    // Show billing history
    console.log('');
    console.log('📜 Historial de cobros reciente:');
    const history = await BillingHistoryDB.getByPhone(phone, 5);
    if (history && history.length > 0) {
      for (const record of history) {
        const date = new Date(record.createdAt).toLocaleDateString();
        const status = record.status === 'approved' ? '✅' : record.status === 'pending' ? '⏳' : '❌';
        console.log(`   ${status} ${date} - $${record.amountCop} COP - ${record.status}`);
      }
    } else {
      console.log('   (sin historial)');
    }

  } catch (error) {
    console.error('');
    console.error('❌ Error:', error.message);
    console.error('');
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

main();
