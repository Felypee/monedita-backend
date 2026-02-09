/**
 * Tool: Upgrade Info
 * Shows available subscription upgrade options
 */

import { getMessage } from "../utils/languageUtils.js";
import {
  getSubscriptionStatus,
  getAvailablePlans,
  formatUpgradePlans,
} from "../services/subscriptionService.js";

export const definition = {
  name: "upgrade_info",
  description: "Show available subscription plans and upgrade options. Use when user asks about upgrading, pricing, or available plans. Examples: 'upgrade', 'pricing', 'plans', 'how to upgrade'",
  input_schema: {
    type: "object",
    properties: {},
    required: []
  }
};

export async function handler(phone, params, lang, userCurrency) {
  try {
    const status = await getSubscriptionStatus(phone);
    const plans = await getAvailablePlans();
    return { success: true, message: formatUpgradePlans(plans, status.plan.id, lang) };
  } catch (error) {
    console.error("Error getting upgrade options:", error);
    return { success: false, message: getMessage('error_generic', lang) };
  }
}

export default { definition, handler };
