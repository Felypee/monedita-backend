/**
 * Moneditas Service - Unified cost-based token system
 *
 * 1 Monedita = $0.002 USD (real cost)
 * Each operation cost includes: Claude API + Whisper (if applicable) + WhatsApp response
 */

import { UserSubscriptionDB, SubscriptionPlanDB, MoneditasDB } from "../database/index.js";
import { getMessage } from "../utils/languageUtils.js";

/**
 * Operation costs in moneditas
 * Based on real API costs (February 2026):
 * - Claude Sonnet 4: $3/M input, $15/M output
 * - OpenAI Whisper: $0.006/minute (~$0.003 for 30sec)
 * - WhatsApp Business API: $0.0008/message (Colombia)
 *
 * 1 monedita = $0.002 USD
 */
export const OPERATION_COSTS = {
  TEXT_MESSAGE: 5,      // ~$0.010 (Claude $0.009 + WA $0.0008)
  IMAGE_RECEIPT: 6,     // ~$0.012 (Claude Vision $0.010 + WA $0.0008)
  AUDIO_MESSAGE: 4,     // ~$0.008 (Whisper $0.003 + Claude $0.004 + WA $0.0008)
  WEEKLY_SUMMARY: 5,    // ~$0.010 (Claude $0.009 + WA $0.0008)
  REMINDER: 1,          // ~$0.002 (Simple text, no Claude call)
};

/**
 * Check if user has enough moneditas for an operation
 * @param {string} phone - User's phone number
 * @param {number} cost - Cost in moneditas (use OPERATION_COSTS)
 * @returns {Promise<{allowed: boolean, used: number, limit: number, remaining: number}>}
 */
export async function checkMoneditas(phone, cost) {
  try {
    const plan = await UserSubscriptionDB.getPlan(phone);
    const used = await MoneditasDB.getUsage(phone);
    const limit = plan.moneditasMonthly;

    const remaining = Math.max(0, limit - used);
    const allowed = remaining >= cost;

    return {
      allowed,
      used,
      limit,
      remaining,
      cost,
    };
  } catch (error) {
    console.error("[moneditasService] Error checking moneditas:", error);
    // Default to blocking on error to prevent abuse
    return { allowed: false, used: 0, limit: 0, remaining: 0, cost, error: true };
  }
}

/**
 * Consume moneditas for an operation
 * Call this AFTER the operation is successful
 * @param {string} phone - User's phone number
 * @param {number} cost - Cost in moneditas (use OPERATION_COSTS)
 * @param {string} operationType - Type of operation for logging
 * @returns {Promise<number>} New total usage
 */
export async function consumeMoneditas(phone, cost, operationType = "unknown") {
  try {
    const newUsage = await MoneditasDB.increment(phone, cost, operationType);
    console.log(`[moneditasService] ${phone}: consumed ${cost} moneditas for ${operationType}, total: ${newUsage}`);
    return newUsage;
  } catch (error) {
    console.error("[moneditasService] Error consuming moneditas:", error);
    return 0;
  }
}

/**
 * Get user's moneditas status
 * @param {string} phone - User's phone number
 * @returns {Promise<{plan: object, used: number, limit: number, remaining: number, periodStart: Date}>}
 */
export async function getMoneditasStatus(phone) {
  try {
    const subscription = await UserSubscriptionDB.getOrCreate(phone);
    const plan = await SubscriptionPlanDB.get(subscription.planId);
    const used = await MoneditasDB.getUsage(phone);
    const periodStart = await UserSubscriptionDB.getBillingPeriodStart(phone);

    const limit = plan.moneditasMonthly;
    const remaining = Math.max(0, limit - used);

    return {
      plan: {
        id: plan.id,
        name: plan.name,
        priceMonthly: plan.priceMonthly,
        moneditasMonthly: plan.moneditasMonthly,
        historyDays: plan.historyDays,
      },
      used,
      limit,
      remaining,
      periodStart,
      subscriptionStartedAt: subscription.startedAt,
    };
  } catch (error) {
    console.error("[moneditasService] Error getting status:", error);
    // Return a default free plan status on error
    return {
      plan: { id: "free", name: "Free", priceMonthly: 0, moneditasMonthly: 50, historyDays: 30 },
      used: 0,
      limit: 50,
      remaining: 50,
      error: true,
    };
  }
}

/**
 * Get localized message when moneditas are exhausted
 * @param {string} lang - Language code
 * @param {object} details - { used, limit, remaining, cost }
 * @returns {string}
 */
export function getMonediasExhaustedMessage(lang, details) {
  const baseMessage = getMessage("moneditas_exhausted", lang, {
    used: details.used,
    limit: details.limit,
  });

  return baseMessage;
}

/**
 * Get localized upgrade call-to-action message
 * @param {string} currentPlan - Current plan ID
 * @param {string} lang - Language code
 * @returns {string}
 */
export function getUpgradeMessage(currentPlan, lang) {
  if (currentPlan === "free") {
    return getMessage("upgrade_cta_free", lang);
  } else if (currentPlan === "basic") {
    return getMessage("upgrade_cta_basic", lang);
  }
  return "";
}

/**
 * Format moneditas status for display
 * @param {object} status - Result from getMoneditasStatus
 * @param {string} lang - Language code
 * @returns {string}
 */
export function formatMoneditasStatus(status, lang) {
  const lines = [
    getMessage("subscription_status_title", lang, { plan: status.plan.name }),
    "",
    getMessage("moneditas_status", lang, {
      used: status.used,
      limit: status.limit,
      remaining: status.remaining,
    }),
    "",
  ];

  // Show what they can do with remaining moneditas
  if (status.remaining > 0) {
    const textOps = Math.floor(status.remaining / OPERATION_COSTS.TEXT_MESSAGE);
    const imageOps = Math.floor(status.remaining / OPERATION_COSTS.IMAGE_RECEIPT);
    const audioOps = Math.floor(status.remaining / OPERATION_COSTS.AUDIO_MESSAGE);

    lines.push(getMessage("moneditas_can_do", lang));
    lines.push(`• ${textOps} ${getMessage("moneditas_text_ops", lang)}`);
    lines.push(`• ${imageOps} ${getMessage("moneditas_image_ops", lang)}`);
    lines.push(`• ${audioOps} ${getMessage("moneditas_audio_ops", lang)}`);
  }

  // History retention
  lines.push("");
  lines.push(getMessage("history_retention", lang, { days: status.plan.historyDays }));

  return lines.join("\n");
}

/**
 * Upgrade user to a new plan and reset moneditas
 * @param {string} phone - User's phone number
 * @param {string} planId - New plan ID
 * @returns {Promise<object>}
 */
export async function upgradePlan(phone, planId) {
  try {
    const subscription = await UserSubscriptionDB.upgradePlan(phone, planId);
    const plan = await SubscriptionPlanDB.get(planId);

    // Reset moneditas usage for new billing period
    await MoneditasDB.resetPeriod(phone);

    return { success: true, subscription, plan };
  } catch (error) {
    console.error("[moneditasService] Error upgrading plan:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Get all available plans
 * @returns {Promise<Array>}
 */
export async function getAvailablePlans() {
  try {
    return await SubscriptionPlanDB.getAll();
  } catch (error) {
    console.error("[moneditasService] Error getting plans:", error);
    return [];
  }
}

export default {
  OPERATION_COSTS,
  checkMoneditas,
  consumeMoneditas,
  getMoneditasStatus,
  getMonediasExhaustedMessage,
  getUpgradeMessage,
  formatMoneditasStatus,
  upgradePlan,
  getAvailablePlans,
};
