/**
 * Wompi Webhook Handler
 * Processes payment events from Wompi and updates user subscriptions
 */

import {
  verifyWebhookSignature,
  parsePaymentReference,
  getPendingPayment,
  removePendingPayment,
  getTransactionStatus,
  formatPriceCOP,
  SUBSCRIPTION_PLANS,
} from "../services/wompiService.js";
import { createPaymentSource } from "../services/wompiRecurringService.js";
import { UserSubscriptionDB, BillingHistoryDB } from "../database/index.js";
import { sendTextMessage } from "../utils/whatsappClient.js";
import { getMessage } from "../utils/languageUtils.js";
import { UserDB } from "../database/index.js";

/**
 * Handle incoming Wompi webhook event
 * @param {object} payload - Webhook payload from Wompi
 * @param {string} signature - X-Event-Checksum header
 * @param {string} timestamp - X-Event-Timestamp header
 */
export async function handleWompiWebhook(payload, signature, timestamp) {
  console.log("[wompi webhook] ========================================");
  console.log("[wompi webhook] Received event:", payload.event);
  console.log("[wompi webhook] Full payload:", JSON.stringify(payload, null, 2));

  // Verify signature in production
  if (process.env.NODE_ENV === "production") {
    if (!verifyWebhookSignature(payload, signature, timestamp)) {
      console.error("[wompi webhook] Invalid signature");
      throw new Error("Invalid webhook signature");
    }
  }

  const event = payload.event;
  const data = payload.data;

  // We only care about transaction updates
  if (event !== "transaction.updated") {
    console.log("[wompi webhook] Ignoring event:", event);
    return;
  }

  const transaction = data.transaction;
  const status = transaction.status;
  const paymentLinkId = transaction.payment_link_id;

  console.log(`[wompi webhook] Transaction ${transaction.id}: ${status}`);
  console.log(`[wompi webhook] Payment Link ID: ${paymentLinkId}`);

  // Look up pending payment by link ID
  const pendingPayment = getPendingPayment(paymentLinkId);

  // Only process approved transactions
  if (status !== "APPROVED") {
    console.log(`[wompi webhook] Transaction not approved: ${status}`);

    // Notify user of failed payment
    if (status === "DECLINED" || status === "ERROR") {
      if (pendingPayment) {
        await notifyPaymentFailed(pendingPayment.phone, status);
      }
    }
    return;
  }

  // If no pending payment by link, check if it's a recurring payment by reference
  if (!pendingPayment) {
    // Check if this is a recurring payment (reference contains "monedita_recurring_")
    const reference = transaction.reference;
    if (reference && reference.includes("monedita_recurring_")) {
      console.log("[wompi webhook] Processing recurring payment confirmation");
      await handleRecurringPaymentWebhook(transaction);
      return;
    }

    console.error("[wompi webhook] No pending payment found for link:", paymentLinkId);
    return;
  }

  const { phone, planId } = pendingPayment;

  // Remove from pending after processing
  removePendingPayment(paymentLinkId);
  const plan = SUBSCRIPTION_PLANS[planId];

  if (!plan) {
    console.error("[wompi webhook] Unknown plan:", planId);
    return;
  }

  console.log(`[wompi webhook] Upgrading ${phone} to ${planId}`);

  try {
    // Update user subscription
    console.log(`[wompi webhook] Calling UserSubscriptionDB.upgradePlan...`);
    const updatedSubscription = await UserSubscriptionDB.upgradePlan(phone, planId);
    console.log(`[wompi webhook] Subscription updated:`, JSON.stringify(updatedSubscription));

    // Try to create payment source for recurring payments
    // Card token is in transaction.payment_method.extra.card_token for card payments
    const paymentMethod = transaction.payment_method;
    if (paymentMethod?.type === "CARD" && paymentMethod?.extra?.card_token) {
      console.log(`[wompi webhook] Found card token, creating payment source...`);
      const cardInfo = {
        lastFour: paymentMethod.extra?.last_four,
        brand: paymentMethod.extra?.brand,
      };
      const sourceResult = await createPaymentSource(phone, paymentMethod.extra.card_token, cardInfo);

      if (sourceResult.success) {
        console.log(`[wompi webhook] ✅ Payment source created: ${sourceResult.paymentSourceId}`);

        // Enable auto-renewal and set next billing date
        const nextBilling = new Date();
        nextBilling.setDate(nextBilling.getDate() + 30);
        await UserSubscriptionDB.update(phone, {
          autoRenew: true,
          nextBillingDate: nextBilling.toISOString(),
        });
      } else {
        console.log(`[wompi webhook] ⚠️ Could not create payment source: ${sourceResult.error}`);
      }
    }

    // Get user language for notification
    const user = await UserDB.get(phone);
    const lang = user?.language || "es";

    // Notify user via WhatsApp
    console.log(`[wompi webhook] Sending success notification to ${phone}...`);
    await notifyPaymentSuccess(phone, plan, lang);

    console.log(`[wompi webhook] ✅ Successfully upgraded ${phone} to ${planId}`);
    console.log("[wompi webhook] ========================================");
  } catch (error) {
    console.error("[wompi webhook] ❌ Error upgrading user:", error);
    throw error;
  }
}

/**
 * Notify user of successful payment
 * @param {string} phone - User's phone number
 * @param {object} plan - Plan details
 * @param {string} lang - User's language
 */
async function notifyPaymentSuccess(phone, plan, lang) {
  const messages = {
    es: `🎉 *¡Pago exitoso!*

Tu plan ha sido actualizado a *${plan.name}*.

Ahora tienes acceso a:
${getPlanFeatures(plan.id, "es")}

¡Gracias por confiar en Monedita!`,
    en: `🎉 *Payment successful!*

Your plan has been upgraded to *${plan.name}*.

You now have access to:
${getPlanFeatures(plan.id, "en")}

Thank you for trusting Monedita!`,
    pt: `🎉 *Pagamento realizado!*

Seu plano foi atualizado para *${plan.name}*.

Agora você tem acesso a:
${getPlanFeatures(plan.id, "pt")}

Obrigado por confiar no Monedita!`,
  };

  const message = messages[lang] || messages.es;
  await sendTextMessage(phone, message);
}

/**
 * Notify user of failed payment
 * @param {string} phone - User's phone number
 * @param {string} status - Transaction status
 */
async function notifyPaymentFailed(phone, status) {
  const user = await UserDB.get(phone);
  const lang = user?.language || "es";

  const messages = {
    es: `❌ *Pago no procesado*

Tu pago no pudo ser procesado (${status}).

Por favor intenta de nuevo o usa otro método de pago.

Escribe *upgrade* para ver las opciones de pago.`,
    en: `❌ *Payment not processed*

Your payment could not be processed (${status}).

Please try again or use a different payment method.

Type *upgrade* to see payment options.`,
    pt: `❌ *Pagamento não processado*

Seu pagamento não pôde ser processado (${status}).

Por favor, tente novamente ou use outro método de pagamento.

Digite *upgrade* para ver as opções de pagamento.`,
  };

  const message = messages[lang] || messages.es;
  await sendTextMessage(phone, message);
}

/**
 * Get plan features as formatted list
 * @param {string} planId - Plan ID
 * @param {string} lang - Language code
 * @returns {string}
 */
function getPlanFeatures(planId, lang) {
  const features = {
    basic: {
      es: `• 150 mensajes de texto/mes
• 30 mensajes de voz/mes
• 20 escaneos de recibos/mes
• 5 presupuestos
• Exportar a CSV`,
      en: `• 150 text messages/month
• 30 voice messages/month
• 20 receipt scans/month
• 5 budgets
• Export to CSV`,
      pt: `• 150 mensagens de texto/mês
• 30 mensagens de voz/mês
• 20 digitalizações de recibos/mês
• 5 orçamentos
• Exportar para CSV`,
    },
    premium: {
      es: `• Mensajes de texto ilimitados
• 100 mensajes de voz/mes
• 50 escaneos de recibos/mes
• Presupuestos ilimitados
• Exportar a CSV y PDF`,
      en: `• Unlimited text messages
• 100 voice messages/month
• 50 receipt scans/month
• Unlimited budgets
• Export to CSV and PDF`,
      pt: `• Mensagens de texto ilimitadas
• 100 mensagens de voz/mês
• 50 digitalizações de recibos/mês
• Orçamentos ilimitados
• Exportar para CSV e PDF`,
    },
  };

  return features[planId]?.[lang] || features[planId]?.es || "";
}

/**
 * Handle webhook for recurring payments (payment_source charges)
 * @param {object} transaction - Transaction data from webhook
 */
async function handleRecurringPaymentWebhook(transaction) {
  const reference = transaction.reference;
  const status = transaction.status;
  const transactionId = transaction.id;

  console.log(`[wompi webhook] Recurring payment ${transactionId}: ${status}`);

  // Parse reference: monedita_recurring_premium_573114740716_1771987308735
  const parts = reference.split("_");
  if (parts.length < 4) {
    console.error("[wompi webhook] Invalid recurring reference format:", reference);
    return;
  }

  const planId = parts[2];
  const phone = parts[3];
  const plan = SUBSCRIPTION_PLANS[planId];

  if (!plan) {
    console.error("[wompi webhook] Unknown plan in recurring payment:", planId);
    return;
  }

  // Find billing record by reference or transaction ID
  const billingRecords = await BillingHistoryDB.getByPhone(phone, 5);
  const billingRecord = billingRecords.find(
    (r) => r.wompiTransactionId === transactionId || r.status === "pending"
  );

  if (status === "APPROVED") {
    console.log(`[wompi webhook] ✅ Recurring payment approved for ${phone}`);

    // Update billing record if found
    if (billingRecord) {
      await BillingHistoryDB.update(billingRecord.id, {
        status: "approved",
        wompiTransactionId: transactionId,
      });
    }

    // Notify user
    const user = await UserDB.get(phone);
    const lang = user?.language || "es";
    await notifyPaymentSuccess(phone, plan, lang);

  } else if (status === "DECLINED" || status === "ERROR") {
    console.log(`[wompi webhook] ❌ Recurring payment failed for ${phone}: ${status}`);

    // Update billing record
    if (billingRecord) {
      await BillingHistoryDB.update(billingRecord.id, {
        status: "declined",
        wompiTransactionId: transactionId,
        errorMessage: `Webhook: ${status}`,
      });
    }

    // Notify user
    await notifyPaymentFailed(phone, status);
  }
}

export default { handleWompiWebhook };
