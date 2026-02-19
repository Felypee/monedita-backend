/**
 * Subscription Service - Business logic for subscription limits and usage tracking
 *
 * This service now uses the unified moneditas system where:
 * - 1 monedita = $0.002 USD (real cost)
 * - TEXT_MESSAGE = 5 moneditas
 * - IMAGE_RECEIPT = 6 moneditas
 * - AUDIO_MESSAGE = 4 moneditas
 * - WEEKLY_SUMMARY = 5 moneditas
 */

import {
  SubscriptionPlanDB,
  UserSubscriptionDB,
  UsageDB,
  MoneditasDB,
} from "../database/index.js";
import { getMessage } from "../utils/languageUtils.js";

// Re-export operation costs from moneditasService for convenience
export { OPERATION_COSTS } from "./moneditasService.js";

/**
 * Legacy usage types (kept for backward compatibility)
 * New code should use OPERATION_COSTS from moneditasService.js
 */
export const USAGE_TYPES = {
  TEXT: "text",
  VOICE: "voice",
  IMAGE: "image",
  AI_CONVERSATION: "ai_conversation",
  BUDGET: "budget",
};

/**
 * Check if user should bypass limits
 * @param {string} phone - User's phone number
 * @returns {Promise<boolean>}
 */
export async function shouldBypassLimits(phone) {
  // No bypasses - all users are subject to limits
  return false;
}

/**
 * Check if an action is allowed based on moneditas
 * @param {string} phone - User's phone number
 * @param {string} usageType - Type of usage (for backward compatibility)
 * @returns {Promise<{allowed: boolean, used: number, limit: number, remaining: number}>}
 */
export async function checkLimit(phone, usageType) {
  try {
    // Check if user should bypass limits
    if (await shouldBypassLimits(phone)) {
      return { allowed: true, used: 0, limit: -1, remaining: -1, bypassed: true };
    }

    // Use new moneditas system
    const result = await UsageDB.checkLimit(phone, usageType);
    return result;
  } catch (error) {
    console.error("[subscriptionService] Error checking limit:", error);
    // Default to blocking on error to prevent abuse
    return { allowed: false, used: 0, limit: 0, remaining: 0, error: true };
  }
}

/**
 * Track usage after a successful operation (legacy - use moneditasService for new code)
 * @param {string} phone - User's phone number
 * @param {string} usageType - Type of usage
 * @returns {Promise<number>} New usage count
 */
export async function trackUsage(phone, usageType) {
  try {
    // Don't track if bypassing limits
    if (await shouldBypassLimits(phone)) {
      return 0;
    }

    return await UsageDB.increment(phone, usageType);
  } catch (error) {
    console.error("[subscriptionService] Error tracking usage:", error);
    return 0;
  }
}

/**
 * Check if export is allowed for user's plan
 * All plans now support CSV export, PDF export for basic+
 * @param {string} phone - User's phone number
 * @param {string} exportType - 'csv' or 'pdf'
 * @returns {Promise<boolean>}
 */
export async function canExport(phone, exportType) {
  try {
    const plan = await UserSubscriptionDB.getPlan(phone);
    if (exportType === "csv") {
      return plan.canExportCsv;
    } else if (exportType === "pdf") {
      return plan.canExportPdf;
    }
    return false;
  } catch (error) {
    console.error("[subscriptionService] Error checking export:", error);
    return false;
  }
}

/**
 * Get user's subscription status with plan details and moneditas usage
 * @param {string} phone - User's phone number
 * @returns {Promise<object>}
 */
export async function getSubscriptionStatus(phone) {
  try {
    const subscription = await UserSubscriptionDB.getOrCreate(phone);
    const plan = await SubscriptionPlanDB.get(subscription.planId);
    const moneditasUsed = await MoneditasDB.getUsage(phone);
    const periodStart = await UserSubscriptionDB.getBillingPeriodStart(phone);

    return {
      plan: {
        id: plan.id,
        name: plan.name,
        priceMonthly: plan.priceMonthly,
        moneditasMonthly: plan.moneditasMonthly,
        historyDays: plan.historyDays,
      },
      moneditas: {
        used: moneditasUsed,
        limit: plan.moneditasMonthly,
        remaining: Math.max(0, plan.moneditasMonthly - moneditasUsed),
      },
      // Legacy fields for backward compatibility
      limits: {
        text: plan.moneditasMonthly,
        voice: plan.moneditasMonthly,
        image: plan.moneditasMonthly,
        ai_conversation: plan.moneditasMonthly,
        budget: -1, // Unlimited budgets
      },
      usage: {
        text: moneditasUsed,
        voice: moneditasUsed,
        image: moneditasUsed,
        ai_conversation: moneditasUsed,
        budget: 0,
      },
      features: {
        canExportCsv: plan.canExportCsv,
        canExportPdf: plan.canExportPdf,
      },
      billingPeriodStart: periodStart,
      subscriptionStartedAt: subscription.startedAt,
    };
  } catch (error) {
    console.error("[subscriptionService] Error getting status:", error);
    // Return a default free plan status on error
    return {
      plan: { id: "free", name: "Free", priceMonthly: 0, moneditasMonthly: 50, historyDays: 30 },
      moneditas: { used: 0, limit: 50, remaining: 50 },
      limits: { text: 50, voice: 50, image: 50, ai_conversation: 50, budget: -1 },
      usage: { text: 0, voice: 0, image: 0, ai_conversation: 0, budget: 0 },
      features: { canExportCsv: true, canExportPdf: false },
      error: true,
    };
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
    console.error("[subscriptionService] Error getting plans:", error);
    return [];
  }
}

/**
 * Upgrade user to a new plan
 * @param {string} phone - User's phone number
 * @param {string} planId - New plan ID
 * @returns {Promise<object>}
 */
export async function upgradePlan(phone, planId) {
  try {
    const subscription = await UserSubscriptionDB.upgradePlan(phone, planId);
    const plan = await SubscriptionPlanDB.get(planId);

    // Reset moneditas for new billing period
    await MoneditasDB.resetPeriod(phone);

    return { success: true, subscription, plan };
  } catch (error) {
    console.error("[subscriptionService] Error upgrading plan:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Get localized message for limit exceeded (moneditas exhausted)
 * @param {string} usageType - Type of usage that exceeded limit
 * @param {string} lang - Language code
 * @param {object} details - { used, limit, remaining }
 * @returns {string}
 */
export function getLimitExceededMessage(usageType, lang, details) {
  // Use unified moneditas message
  return getMessage("moneditas_exhausted", lang, {
    used: details.used,
    limit: details.limit,
  });
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
 * Format subscription status for display
 * @param {object} status - Result from getSubscriptionStatus
 * @param {string} lang - Language code
 * @returns {string}
 */
export function formatSubscriptionStatus(status, lang) {
  const planName = status.plan.name;
  const lines = [getMessage("subscription_status_title", lang, { plan: planName })];

  // Moneditas status
  lines.push("");
  lines.push(getMessage("moneditas_status", lang, {
    used: status.moneditas.used,
    limit: status.moneditas.limit,
    remaining: status.moneditas.remaining,
  }));

  // What can they do with remaining moneditas
  if (status.moneditas.remaining > 0) {
    const textOps = Math.floor(status.moneditas.remaining / 5);  // TEXT_MESSAGE cost
    const imageOps = Math.floor(status.moneditas.remaining / 6); // IMAGE_RECEIPT cost
    const audioOps = Math.floor(status.moneditas.remaining / 4); // AUDIO_MESSAGE cost

    lines.push("");
    lines.push(getMessage("moneditas_can_do", lang));
    lines.push(`• ${textOps} ${getMessage("moneditas_text_ops", lang)}`);
    lines.push(`• ${imageOps} ${getMessage("moneditas_image_ops", lang)}`);
    lines.push(`• ${audioOps} ${getMessage("moneditas_audio_ops", lang)}`);
  }

  // History retention
  lines.push("");
  lines.push(getMessage("history_retention", lang, { days: status.plan.historyDays }));

  // Features
  lines.push("");
  lines.push(getMessage("subscription_features", lang));
  lines.push(`• CSV ${getMessage("export", lang)}: ${status.features.canExportCsv ? "✓" : "✗"}`);
  lines.push(`• PDF ${getMessage("export", lang)}: ${status.features.canExportPdf ? "✓" : "✗"}`);

  return lines.join("\n");
}

/**
 * Format available plans for upgrade display
 * @param {Array} plans - List of plans
 * @param {string} currentPlanId - Current user's plan
 * @param {string} lang - Language code
 * @returns {string}
 */
export function formatUpgradePlans(plans, currentPlanId, lang) {
  const lines = [getMessage("upgrade_title", lang)];

  for (const plan of plans) {
    if (plan.id === currentPlanId) continue; // Skip current plan
    if (plan.id === "free" && currentPlanId !== "free") continue; // Can't downgrade

    lines.push("");
    const price = plan.priceMonthly === 0 ? getMessage("free_label", lang) : `$${plan.priceMonthly}/mo`;
    lines.push(`*${plan.name}* - ${price}`);

    // Highlight moneditas and features
    const features = [];
    features.push(`${plan.moneditasMonthly} moneditas/mes`);

    const textOps = Math.floor(plan.moneditasMonthly / 5);
    features.push(`~${textOps} ${getMessage("moneditas_text_ops", lang)}`);

    if (plan.historyDays >= 180) {
      features.push(`${plan.historyDays} ${getMessage("days_history", lang)}`);
    }

    if (plan.canExportPdf) {
      features.push(getMessage("feature_pdf_export", lang));
    }

    for (const feature of features) {
      lines.push(`  • ${feature}`);
    }
  }

  lines.push("");
  lines.push(getMessage("upgrade_instructions", lang));

  return lines.join("\n");
}
