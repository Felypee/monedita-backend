/**
 * Subscription Service - Business logic for subscription limits and usage tracking
 */

import {
  SubscriptionPlanDB,
  UserSubscriptionDB,
  UsageDB,
} from "../database/index.js";
import { getMessage } from "../utils/languageUtils.js";

/**
 * Usage types that can be tracked
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
 * Check if an action is allowed based on subscription limits
 * @param {string} phone - User's phone number
 * @param {string} usageType - Type of usage (text, voice, image, ai_conversation, budget)
 * @returns {Promise<{allowed: boolean, used: number, limit: number, remaining: number}>}
 */
export async function checkLimit(phone, usageType) {
  try {
    // Check if user should bypass limits
    if (await shouldBypassLimits(phone)) {
      return { allowed: true, used: 0, limit: -1, remaining: -1, bypassed: true };
    }

    const result = await UsageDB.checkLimit(phone, usageType);
    return result;
  } catch (error) {
    console.error("[subscriptionService] Error checking limit:", error);
    // Default to blocking on error to prevent abuse
    return { allowed: false, used: 0, limit: 0, remaining: 0, error: true };
  }
}

/**
 * Track usage after a successful operation
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
 * Get user's subscription status with plan details and current usage
 * @param {string} phone - User's phone number
 * @returns {Promise<object>}
 */
export async function getSubscriptionStatus(phone) {
  try {
    const subscription = await UserSubscriptionDB.getOrCreate(phone);
    const plan = await SubscriptionPlanDB.get(subscription.planId);
    const usage = await UsageDB.getAllUsage(phone);
    const periodStart = await UserSubscriptionDB.getBillingPeriodStart(phone);

    return {
      plan: {
        id: plan.id,
        name: plan.name,
        priceMonthly: plan.priceMonthly,
      },
      limits: {
        text: plan.limitTextMessages,
        voice: plan.limitVoiceMessages,
        image: plan.limitImageMessages,
        ai_conversation: plan.limitAiConversations,
        budget: plan.limitBudgets,
      },
      usage,
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
      plan: { id: "free", name: "Free", priceMonthly: 0 },
      limits: { text: 30, voice: 5, image: 5, ai_conversation: 10, budget: 1 },
      usage: { text: 0, voice: 0, image: 0, ai_conversation: 0, budget: 0 },
      features: { canExportCsv: false, canExportPdf: false },
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
    return { success: true, subscription, plan };
  } catch (error) {
    console.error("[subscriptionService] Error upgrading plan:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Get localized message for limit exceeded
 * @param {string} usageType - Type of usage that exceeded limit
 * @param {string} lang - Language code
 * @param {object} details - { used, limit, remaining }
 * @returns {string}
 */
export function getLimitExceededMessage(usageType, lang, details) {
  const key = `limit_${usageType}_exceeded`;
  return getMessage(key, lang, {
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

  // Format usage for each type
  const usageTypes = [
    { key: "text", label: getMessage("usage_text_label", lang) },
    { key: "voice", label: getMessage("usage_voice_label", lang) },
    { key: "image", label: getMessage("usage_image_label", lang) },
    { key: "ai_conversation", label: getMessage("usage_ai_label", lang) },
    { key: "budget", label: getMessage("usage_budget_label", lang) },
  ];

  lines.push("");
  lines.push(getMessage("subscription_usage", lang));

  for (const { key, label } of usageTypes) {
    const used = status.usage[key] || 0;
    const limit = status.limits[key];
    if (limit === -1) {
      lines.push(`• ${label}: ${used} / ${getMessage("unlimited", lang)}`);
    } else {
      lines.push(`• ${label}: ${used} / ${limit}`);
    }
  }

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

    // Highlight key features
    const features = [];
    if (plan.limitTextMessages === -1) {
      features.push(getMessage("feature_unlimited_text", lang));
    } else {
      features.push(`${plan.limitTextMessages} ${getMessage("feature_text_messages", lang)}`);
    }
    if (plan.limitVoiceMessages > 5) {
      features.push(`${plan.limitVoiceMessages} ${getMessage("feature_voice_messages", lang)}`);
    }
    if (plan.canExportCsv) {
      features.push(getMessage("feature_csv_export", lang));
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
