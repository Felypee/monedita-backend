/**
 * Wompi Recurring Payments Service
 * Handles tokenization and recurring charges for subscriptions
 *
 * Flow:
 * 1. First payment: User pays via link -> card gets tokenized -> payment_source saved
 * 2. Monthly renewal: Cron job charges automatically using payment_source
 * 3. Failed payment: 3 retries (day 1, 3, 7) -> if all fail, cancel subscription
 *
 * Docs: https://docs.wompi.co/en/docs/colombia/tokenizacion-de-tarjetas
 */

import crypto from "crypto";
import { PaymentSourceDB, BillingHistoryDB, UserSubscriptionDB } from "../database/index.js";
import { UserDB } from "../database/index.js";
import { sendTextMessage } from "../utils/whatsappClient.js";
import { SUBSCRIPTION_PLANS } from "./wompiService.js";

const WOMPI_API_URL = process.env.WOMPI_ENV === "production"
  ? "https://production.wompi.co/v1"
  : "https://sandbox.wompi.co/v1";

const WOMPI_PUBLIC_KEY = process.env.WOMPI_PUBLIC_KEY;
const WOMPI_PRIVATE_KEY = process.env.WOMPI_PRIVATE_KEY;

// Retry schedule: day 1, day 3, day 7
const RETRY_DAYS = [1, 3, 7];

/**
 * Get Wompi acceptance token (required for creating payment sources)
 * @returns {Promise<{acceptanceToken: string, permalink: string}>}
 */
export async function getAcceptanceToken() {
  try {
    const response = await fetch(`${WOMPI_API_URL}/merchants/${WOMPI_PUBLIC_KEY}`);
    const data = await response.json();

    if (!response.ok) {
      console.error("[wompi recurring] Error getting acceptance token:", data);
      return null;
    }

    return {
      acceptanceToken: data.data.presigned_acceptance.acceptance_token,
      permalink: data.data.presigned_acceptance.permalink,
    };
  } catch (error) {
    console.error("[wompi recurring] Error:", error);
    return null;
  }
}

/**
 * Create a payment source from a tokenized card
 * Called after first successful payment with card token
 *
 * @param {string} phone - User's phone number
 * @param {string} cardToken - Token from Wompi (from transaction.payment_method.extra.card_token)
 * @param {object} cardInfo - Card info (last_four, brand)
 * @returns {Promise<object>}
 */
export async function createPaymentSource(phone, cardToken, cardInfo = {}) {
  try {
    // Get acceptance token
    const acceptance = await getAcceptanceToken();
    if (!acceptance) {
      return { success: false, error: "No se pudo obtener token de aceptación" };
    }

    // Get user's email (required by Wompi)
    const user = await UserDB.get(phone);
    const email = user?.email || `${phone}@monedita.app`; // Fallback email

    const response = await fetch(`${WOMPI_API_URL}/payment_sources`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${WOMPI_PRIVATE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "CARD",
        token: cardToken,
        customer_email: email,
        acceptance_token: acceptance.acceptanceToken,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("[wompi recurring] Error creating payment source:", data);
      return {
        success: false,
        error: data.error?.message || "Error creando fuente de pago",
      };
    }

    const paymentSourceId = data.data.id;
    console.log(`[wompi recurring] Payment source created: ${paymentSourceId} for ${phone}`);

    // Save to database
    const savedSource = await PaymentSourceDB.create(phone, {
      wompiPaymentSourceId: paymentSourceId,
      cardLastFour: cardInfo.lastFour || data.data.public_data?.last_four,
      cardBrand: cardInfo.brand || data.data.public_data?.type,
    });

    return {
      success: true,
      paymentSourceId,
      source: savedSource,
    };
  } catch (error) {
    console.error("[wompi recurring] createPaymentSource Error:", error.message || error);
    console.error("[wompi recurring] Full error:", JSON.stringify(error, null, 2));
    return { success: false, error: error.message || "Error de conexión con Wompi" };
  }
}

/**
 * Charge a recurring payment using stored payment source
 *
 * @param {string} phone - User's phone number
 * @param {string} planId - Plan to charge for
 * @returns {Promise<object>}
 */
export async function chargeRecurringPayment(phone, planId) {
  try {
    const plan = SUBSCRIPTION_PLANS[planId];
    if (!plan) {
      return { success: false, error: `Plan desconocido: ${planId}` };
    }

    // Get payment source
    const paymentSource = await PaymentSourceDB.get(phone);
    if (!paymentSource || paymentSource.status !== 'active') {
      return { success: false, error: "No hay método de pago activo" };
    }

    const reference = `monedita_recurring_${planId}_${phone}_${Date.now()}`;
    const amountInCents = plan.priceCOP * 100;

    // Create billing record
    const billingRecord = await BillingHistoryDB.create({
      phone,
      planId,
      amountCop: plan.priceCOP,
      status: 'pending',
    });

    const transactionBody = {
      amount_in_cents: amountInCents,
      currency: "COP",
      customer_email: `${phone}@monedita.app`,
      reference,
      payment_source_id: parseInt(paymentSource.wompiPaymentSourceId),
      payment_method: {
        installments: 1,  // Single payment, no installments
      },
    };

    console.log("[wompi recurring] Creating transaction:", JSON.stringify(transactionBody, null, 2));

    const response = await fetch(`${WOMPI_API_URL}/transactions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${WOMPI_PRIVATE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(transactionBody),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("[wompi recurring] Error charging payment:", JSON.stringify(data, null, 2));

      // Update billing record with failure
      await BillingHistoryDB.update(billingRecord.id, {
        status: 'declined',
        errorMessage: data.error?.message || 'Error desconocido',
        retryCount: 1,
        nextRetryAt: getNextRetryDate(1),
      });

      return {
        success: false,
        error: data.error?.message || "Error al procesar cobro",
        billingId: billingRecord.id,
      };
    }

    const transaction = data.data;
    const status = transaction.status;

    console.log(`[wompi recurring] Transaction ${transaction.id}: ${status}`);

    if (status === "APPROVED") {
      // Update billing record
      await BillingHistoryDB.update(billingRecord.id, {
        status: 'approved',
        wompiTransactionId: transaction.id,
      });

      // Extend subscription
      await extendSubscription(phone, planId);

      // Notify user
      await notifyRenewalSuccess(phone, plan);

      return {
        success: true,
        transactionId: transaction.id,
        billingId: billingRecord.id,
      };
    } else {
      // Payment not approved
      await BillingHistoryDB.update(billingRecord.id, {
        status: 'declined',
        wompiTransactionId: transaction.id,
        errorMessage: `Status: ${status}`,
        retryCount: 1,
        nextRetryAt: getNextRetryDate(1),
      });

      return {
        success: false,
        error: `Pago ${status}`,
        transactionId: transaction.id,
        billingId: billingRecord.id,
      };
    }
  } catch (error) {
    console.error("[wompi recurring] chargeRecurringPayment Error:", error.message || error);
    console.error("[wompi recurring] Full error:", JSON.stringify(error, null, 2));
    return { success: false, error: error.message || "Error de conexión con Wompi" };
  }
}

/**
 * Retry a failed payment
 * @param {object} billingRecord - Billing record to retry
 * @returns {Promise<object>}
 */
export async function retryFailedPayment(billingRecord) {
  const { phone, planId, retryCount } = billingRecord;

  console.log(`[wompi recurring] Retrying payment for ${phone}, attempt ${retryCount + 1}`);

  const result = await chargeRecurringPayment(phone, planId);

  if (!result.success) {
    const newRetryCount = retryCount + 1;

    if (newRetryCount >= 3) {
      // Max retries reached, cancel subscription
      console.log(`[wompi recurring] Max retries reached for ${phone}, cancelling subscription`);
      await cancelAutoRenewal(phone);
      await notifySubscriptionCancelled(phone);

      await BillingHistoryDB.update(billingRecord.id, {
        status: 'error',
        retryCount: newRetryCount,
        nextRetryAt: null,
        errorMessage: 'Max retries exceeded',
      });
    } else {
      // Schedule next retry
      await BillingHistoryDB.update(billingRecord.id, {
        retryCount: newRetryCount,
        nextRetryAt: getNextRetryDate(newRetryCount),
      });

      await notifyPaymentRetryScheduled(phone, newRetryCount);
    }
  }

  return result;
}

/**
 * Cancel auto-renewal for a user
 * @param {string} phone - User's phone number
 * @returns {Promise<object>}
 */
export async function cancelAutoRenewal(phone) {
  try {
    // Update subscription
    const subscription = await UserSubscriptionDB.get(phone);
    if (subscription) {
      await UserSubscriptionDB.update(phone, {
        autoRenew: false,
        cancelledAt: new Date().toISOString(),
      });
    }

    // Cancel payment source
    await PaymentSourceDB.cancel(phone);

    console.log(`[wompi recurring] Auto-renewal cancelled for ${phone}`);
    return { success: true };
  } catch (error) {
    console.error("[wompi recurring] Error cancelling:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Reactivate auto-renewal for a user
 * @param {string} phone - User's phone number
 * @returns {Promise<object>}
 */
export async function reactivateAutoRenewal(phone) {
  try {
    // Check if they have a payment source
    const paymentSource = await PaymentSourceDB.get(phone);
    if (!paymentSource) {
      return { success: false, error: "No hay método de pago registrado" };
    }

    // Reactivate payment source
    await PaymentSourceDB.reactivate(phone);

    // Update subscription
    await UserSubscriptionDB.update(phone, {
      autoRenew: true,
      cancelledAt: null,
    });

    console.log(`[wompi recurring] Auto-renewal reactivated for ${phone}`);
    return { success: true };
  } catch (error) {
    console.error("[wompi recurring] Error reactivating:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Get subscription status including auto-renewal info
 * @param {string} phone - User's phone number
 * @returns {Promise<object>}
 */
export async function getSubscriptionStatus(phone) {
  const subscription = await UserSubscriptionDB.getOrCreate(phone);
  const paymentSource = await PaymentSourceDB.get(phone);
  const latestBilling = await BillingHistoryDB.getLatest(phone);

  return {
    planId: subscription.planId,
    startedAt: subscription.startedAt,
    expiresAt: subscription.expiresAt,
    nextBillingDate: subscription.nextBillingDate,
    autoRenew: subscription.autoRenew || false,
    cancelledAt: subscription.cancelledAt,
    hasPaymentMethod: !!paymentSource && paymentSource.status === 'active',
    cardLastFour: paymentSource?.cardLastFour,
    cardBrand: paymentSource?.cardBrand,
    lastBillingStatus: latestBilling?.status,
    lastBillingDate: latestBilling?.createdAt,
  };
}

/**
 * Extend subscription by one month
 * @param {string} phone - User's phone number
 * @param {string} planId - Plan ID
 */
async function extendSubscription(phone, planId) {
  const now = new Date();
  const nextBilling = new Date(now);
  nextBilling.setDate(nextBilling.getDate() + 30);

  await UserSubscriptionDB.update(phone, {
    planId,
    startedAt: now.toISOString(),
    nextBillingDate: nextBilling.toISOString(),
    autoRenew: true,
    cancelledAt: null,
  });
}

/**
 * Get next retry date based on retry count
 * @param {number} retryCount - Current retry count
 * @returns {string} ISO date string
 */
function getNextRetryDate(retryCount) {
  const daysUntilRetry = RETRY_DAYS[retryCount - 1] || 7;
  const date = new Date();
  date.setDate(date.getDate() + daysUntilRetry);
  return date.toISOString();
}

/**
 * Notify user of successful renewal
 */
async function notifyRenewalSuccess(phone, plan) {
  const user = await UserDB.get(phone);
  const lang = user?.language || "es";

  const messages = {
    es: `Hemos renovado tu plan *${plan.name}* por un mes más. ¡Gracias por confiar en Monedita!`,
    en: `Your *${plan.name}* plan has been renewed for another month. Thanks for trusting Monedita!`,
    pt: `Renovamos seu plano *${plan.name}* por mais um mês. Obrigado por confiar no Monedita!`,
  };

  await sendTextMessage(phone, messages[lang] || messages.es);
}

/**
 * Notify user of scheduled retry
 */
async function notifyPaymentRetryScheduled(phone, retryCount) {
  const user = await UserDB.get(phone);
  const lang = user?.language || "es";
  const daysUntilRetry = RETRY_DAYS[retryCount - 1] || 7;

  const messages = {
    es: `No pudimos procesar tu pago de renovación. Intentaremos de nuevo en ${daysUntilRetry} días. Por favor verifica que tu tarjeta esté activa.`,
    en: `We couldn't process your renewal payment. We'll try again in ${daysUntilRetry} days. Please verify your card is active.`,
    pt: `Não conseguimos processar seu pagamento de renovação. Tentaremos novamente em ${daysUntilRetry} dias. Por favor, verifique se seu cartão está ativo.`,
  };

  await sendTextMessage(phone, messages[lang] || messages.es);
}

/**
 * Notify user that subscription was cancelled due to payment failures
 */
async function notifySubscriptionCancelled(phone) {
  const user = await UserDB.get(phone);
  const lang = user?.language || "es";

  const messages = {
    es: `Tu suscripción ha sido cancelada porque no pudimos procesar el pago después de varios intentos.

Tu plan actual sigue activo hasta el fin del período. Escribe *upgrade* para renovar manualmente.`,
    en: `Your subscription has been cancelled because we couldn't process the payment after multiple attempts.

Your current plan remains active until the end of the period. Type *upgrade* to renew manually.`,
    pt: `Sua assinatura foi cancelada porque não conseguimos processar o pagamento após várias tentativas.

Seu plano atual permanece ativo até o final do período. Digite *upgrade* para renovar manualmente.`,
  };

  await sendTextMessage(phone, messages[lang] || messages.es);
}

export default {
  getAcceptanceToken,
  createPaymentSource,
  chargeRecurringPayment,
  retryFailedPayment,
  cancelAutoRenewal,
  reactivateAutoRenewal,
  getSubscriptionStatus,
};
