/**
 * Wompi Payment Service
 * Handles payment link generation and webhook verification for subscriptions
 *
 * Docs: https://docs.wompi.co/en/docs/colombia/
 */

import crypto from "crypto";
import { UserDB } from "../database/index.js";

const WOMPI_API_URL = process.env.WOMPI_ENV === "production"
  ? "https://production.wompi.co/v1"
  : "https://sandbox.wompi.co/v1";

const WOMPI_PUBLIC_KEY = process.env.WOMPI_PUBLIC_KEY;
const WOMPI_PRIVATE_KEY = process.env.WOMPI_PRIVATE_KEY;
const WOMPI_EVENTS_SECRET = process.env.WOMPI_EVENTS_SECRET;
const WOMPI_INTEGRITY_SECRET = process.env.WOMPI_INTEGRITY_SECRET;

// WhatsApp number for redirect after payment
const WHATSAPP_BOT_NUMBER = process.env.WHATSAPP_BOT_NUMBER || "573000000000";

// In-memory store for pending payments (in production, use database)
// Maps payment_link_id -> { phone, planId, createdAt }
const pendingPayments = new Map();

// Subscription plans with COP prices
export const SUBSCRIPTION_PLANS = {
  basic: {
    id: "basic",
    name: "Basic",
    priceUSD: 2.99,
    priceCOP: 12000, // ~$2.99 USD
    description: "150 mensajes/mes, 30 audios, exportar CSV",
  },
  premium: {
    id: "premium",
    name: "Premium",
    priceUSD: 7.99,
    priceCOP: 32000, // ~$7.99 USD
    description: "Mensajes ilimitados, 100 audios, exportar PDF",
  },
};

/**
 * Generate a payment link for a subscription upgrade
 * @param {string} phone - User's phone number (used as reference)
 * @param {string} planId - Plan to upgrade to (basic or premium)
 * @returns {Promise<{success: boolean, paymentUrl?: string, error?: string}>}
 */
export async function createPaymentLink(phone, planId) {
  const plan = SUBSCRIPTION_PLANS[planId];

  if (!plan) {
    return { success: false, error: `Plan desconocido: ${planId}` };
  }

  if (!WOMPI_PRIVATE_KEY) {
    console.error("[wompi] WOMPI_PRIVATE_KEY not configured");
    return { success: false, error: "Pagos no configurados" };
  }

  try {
    // Generate unique reference for this payment
    const reference = `monedita_${planId}_${phone}_${Date.now()}`;

    // Amount in cents (COP doesn't use decimals, but Wompi expects cents)
    const amountInCents = plan.priceCOP * 100;

    // Redirect to WhatsApp chat after payment (bot sends welcome message via webhook)
    const redirectUrl = process.env.WOMPI_REDIRECT_URL ||
      `https://landing-nu-lovat.vercel.app/gracias.html`;

    // Format phone for Wompi (needs country code format)
    const formattedPhone = phone.startsWith("+") ? phone : `+${phone}`;

    // Get user's name from database
    const user = await UserDB.get(phone);
    const userName = user?.name || `Usuario ${phone.slice(-4)}`;

    const response = await fetch(`${WOMPI_API_URL}/payment_links`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${WOMPI_PRIVATE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: reference, // Use reference as name to track user/plan
        description: `${plan.name}: ${plan.description}`,
        single_use: true,
        collect_shipping: false,
        collect_customer_legal_id: false, // Don't ask for ID
        currency: "COP",
        amount_in_cents: amountInCents,
        redirect_url: redirectUrl,
        expires_at: getExpirationDate(24), // 24 hours
        // Pre-fill customer data from WhatsApp
        customer_data: {
          phone_number: formattedPhone,
          full_name: userName,
        },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("[wompi] Error creating payment link:", data);
      return { success: false, error: data.error?.message || "Error creando link de pago" };
    }

    const linkId = data.data.id;
    console.log("[wompi] Payment link created:", linkId);

    // Store pending payment for webhook lookup
    pendingPayments.set(linkId, {
      phone,
      planId,
      createdAt: new Date(),
    });
    console.log("[wompi] Stored pending payment:", linkId, "->", { phone, planId });

    return {
      success: true,
      paymentUrl: data.data.payment_link_url || `https://checkout.wompi.co/l/${linkId}`,
      linkId,
      reference,
    };
  } catch (error) {
    console.error("[wompi] Error:", error);
    return { success: false, error: "Error de conexión con Wompi" };
  }
}

/**
 * Create a checkout session using Wompi's widget approach
 * This generates a signature for the checkout widget
 * @param {string} phone - User's phone number
 * @param {string} planId - Plan to upgrade to
 * @returns {object} Checkout session data
 */
export async function createCheckoutSession(phone, planId) {
  const plan = SUBSCRIPTION_PLANS[planId];

  if (!plan) {
    return { success: false, error: `Plan desconocido: ${planId}` };
  }

  const reference = `monedita_${planId}_${phone}_${Date.now()}`;
  const amountInCents = plan.priceCOP * 100;
  const currency = "COP";

  // Generate integrity signature
  // Format: reference + amount_in_cents + currency + integrity_secret
  const integrityString = `${reference}${amountInCents}${currency}${WOMPI_INTEGRITY_SECRET}`;
  const integritySignature = crypto
    .createHash("sha256")
    .update(integrityString)
    .digest("hex");

  return {
    success: true,
    publicKey: WOMPI_PUBLIC_KEY,
    reference,
    amountInCents,
    currency,
    integritySignature,
    redirectUrl: process.env.WOMPI_REDIRECT_URL || "https://landing-nu-lovat.vercel.app/gracias.html",
    plan,
  };
}

/**
 * Verify webhook signature from Wompi
 * @param {object} payload - Webhook payload
 * @param {string} signature - X-Signature header from Wompi
 * @param {string} timestamp - X-Timestamp header from Wompi
 * @returns {boolean}
 */
export function verifyWebhookSignature(payload, signature, timestamp) {
  if (!WOMPI_EVENTS_SECRET) {
    console.warn("[wompi] WOMPI_EVENTS_SECRET not configured, skipping verification");
    return true; // Allow in development
  }

  try {
    // Wompi signature format: timestamp + payload + events_secret
    const signatureString = `${timestamp}${JSON.stringify(payload)}${WOMPI_EVENTS_SECRET}`;
    const expectedSignature = crypto
      .createHash("sha256")
      .update(signatureString)
      .digest("hex");

    return signature === expectedSignature;
  } catch (error) {
    console.error("[wompi] Error verifying signature:", error);
    return false;
  }
}

/**
 * Parse reference to extract user phone and plan
 * @param {string} reference - Payment reference (format: monedita_planId_phone_timestamp)
 * @returns {{phone: string, planId: string} | null}
 */
export function parsePaymentReference(reference) {
  if (!reference || !reference.startsWith("monedita_")) {
    return null;
  }

  const parts = reference.split("_");
  if (parts.length < 4) {
    return null;
  }

  return {
    planId: parts[1],
    phone: parts[2],
  };
}

/**
 * Get transaction status from Wompi
 * @param {string} transactionId - Wompi transaction ID
 * @returns {Promise<object>}
 */
export async function getTransactionStatus(transactionId) {
  try {
    const response = await fetch(`${WOMPI_API_URL}/transactions/${transactionId}`, {
      headers: {
        "Authorization": `Bearer ${WOMPI_PRIVATE_KEY}`,
      },
    });

    const data = await response.json();
    return data.data;
  } catch (error) {
    console.error("[wompi] Error getting transaction:", error);
    return null;
  }
}

/**
 * Get expiration date ISO string
 * @param {number} hours - Hours from now
 * @returns {string}
 */
function getExpirationDate(hours) {
  const date = new Date();
  date.setHours(date.getHours() + hours);
  return date.toISOString();
}

/**
 * Format price for display
 * @param {number} amount - Amount in COP
 * @returns {string}
 */
export function formatPriceCOP(amount) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Get pending payment by link ID
 * @param {string} linkId - Wompi payment link ID
 * @returns {{phone: string, planId: string} | null}
 */
export function getPendingPayment(linkId) {
  const payment = pendingPayments.get(linkId);
  if (payment) {
    console.log("[wompi] Found pending payment for link:", linkId, "->", payment);
    return payment;
  }
  console.log("[wompi] No pending payment found for link:", linkId);
  return null;
}

/**
 * Remove pending payment after processing
 * @param {string} linkId - Wompi payment link ID
 */
export function removePendingPayment(linkId) {
  pendingPayments.delete(linkId);
  console.log("[wompi] Removed pending payment:", linkId);
}

/**
 * Clean up old pending payments (older than 48 hours)
 */
export function cleanupPendingPayments() {
  const now = Date.now();
  const maxAge = 48 * 60 * 60 * 1000; // 48 hours

  for (const [linkId, payment] of pendingPayments.entries()) {
    if (now - payment.createdAt.getTime() > maxAge) {
      pendingPayments.delete(linkId);
      console.log("[wompi] Cleaned up expired pending payment:", linkId);
    }
  }
}

export default {
  createPaymentLink,
  createCheckoutSession,
  verifyWebhookSignature,
  parsePaymentReference,
  getTransactionStatus,
  formatPriceCOP,
  getPendingPayment,
  removePendingPayment,
  cleanupPendingPayments,
  SUBSCRIPTION_PLANS,
};
