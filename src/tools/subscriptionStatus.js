/**
 * Tool: Subscription Status
 * Shows user's subscription plan and usage
 */

import { getMessage } from "../utils/languageUtils.js";
import {
  getSubscriptionStatus,
  formatSubscriptionStatus,
} from "../services/subscriptionService.js";

export const definition = {
  name: "subscription_status",
  description: "Show user's current subscription plan, usage limits, and features. Use when user asks about their plan, subscription, or account status. Examples: 'my plan', 'subscription', 'account status', 'what plan am I on'",
  input_schema: {
    type: "object",
    properties: {},
    required: []
  }
};

export async function handler(phone, params, lang, userCurrency) {
  try {
    const status = await getSubscriptionStatus(phone);
    return { success: true, message: formatSubscriptionStatus(status, lang) };
  } catch (error) {
    console.error("Error getting subscription status:", error);
    return { success: false, message: getMessage('error_generic', lang) };
  }
}

export default { definition, handler };
