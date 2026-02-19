/**
 * In-memory database for subscription management
 * Mirrors the Supabase implementation for local development/testing
 *
 * New moneditas-based system (February 2026):
 * - 1 monedita = $0.002 USD
 * - Costs: TEXT=5, IMAGE=6, AUDIO=4, WEEKLY_SUMMARY=5
 */

// Static plan definitions with moneditas
const PLANS = {
  free: {
    id: 'free',
    name: 'Free',
    priceMonthly: 0,
    moneditasMonthly: 50,      // ~$0.10 max cost
    historyDays: 30,
    // Legacy fields (kept for backward compatibility during migration)
    limitTextMessages: 50,
    limitVoiceMessages: 50,
    limitImageMessages: 50,
    limitAiConversations: 50,
    limitBudgets: -1,          // Unlimited budgets for all plans
    canExportCsv: true,        // All plans can export
    canExportPdf: false,
  },
  basic: {
    id: 'basic',
    name: 'Basic',
    priceMonthly: 2.99,
    moneditasMonthly: 1200,    // ~$2.40 max cost (neto $2.62 - margen 6%)
    historyDays: 180,
    // Legacy fields
    limitTextMessages: 1200,
    limitVoiceMessages: 1200,
    limitImageMessages: 1200,
    limitAiConversations: 1200,
    limitBudgets: -1,
    canExportCsv: true,
    canExportPdf: true,
  },
  premium: {
    id: 'premium',
    name: 'Premium',
    priceMonthly: 7.99,
    moneditasMonthly: 3500,    // ~$7.00 max cost (neto $7.45 - margen 5%)
    historyDays: 365,
    // Legacy fields
    limitTextMessages: 3500,
    limitVoiceMessages: 3500,
    limitImageMessages: 3500,
    limitAiConversations: 3500,
    limitBudgets: -1,
    canExportCsv: true,
    canExportPdf: true,
  },
};

// User subscriptions: phone -> subscription data
const subscriptions = new Map();

// Moneditas usage tracking: phone -> { periodKey -> { used, lastOperation } }
const moneditasUsage = new Map();

// Legacy usage tracking (kept for backward compatibility)
const usage = new Map();

/**
 * Subscription Plan operations (read-only, static data)
 */
export const SubscriptionPlanDB = {
  get(planId) {
    return PLANS[planId] || null;
  },

  getAll() {
    return Object.values(PLANS);
  },

  getDefault() {
    return PLANS.free;
  },
};

/**
 * User Subscription operations
 */
export const UserSubscriptionDB = {
  create(phone, planId = 'free') {
    const plan = SubscriptionPlanDB.get(planId);
    if (!plan) {
      throw new Error(`Invalid plan: ${planId}`);
    }

    const subscription = {
      phone,
      planId,
      startedAt: new Date(),
      expiresAt: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    subscriptions.set(phone, subscription);
    return subscription;
  },

  get(phone) {
    return subscriptions.get(phone) || null;
  },

  getOrCreate(phone) {
    let subscription = this.get(phone);
    if (!subscription) {
      subscription = this.create(phone, 'free');
    }
    return subscription;
  },

  update(phone, data) {
    const subscription = subscriptions.get(phone);
    if (subscription) {
      Object.assign(subscription, data, { updatedAt: new Date() });
      subscriptions.set(phone, subscription);
    }
    return subscription;
  },

  upgradePlan(phone, newPlanId) {
    const plan = SubscriptionPlanDB.get(newPlanId);
    if (!plan) {
      throw new Error(`Invalid plan: ${newPlanId}`);
    }

    let subscription = this.get(phone);
    if (!subscription) {
      subscription = this.create(phone, newPlanId);
    } else {
      subscription.planId = newPlanId;
      subscription.startedAt = new Date(); // Reset billing period on upgrade
      subscription.updatedAt = new Date();
      subscriptions.set(phone, subscription);
    }

    return subscription;
  },

  getPlan(phone) {
    const subscription = this.getOrCreate(phone);
    return SubscriptionPlanDB.get(subscription.planId);
  },

  /**
   * Get the start of the current billing period for a user
   * Based on when they subscribed
   */
  getBillingPeriodStart(phone) {
    const subscription = this.getOrCreate(phone);
    const startedAt = new Date(subscription.startedAt);
    const now = new Date();

    // Calculate how many full months have passed since subscription started
    let periodStart = new Date(startedAt);
    while (periodStart.getTime() + 30 * 24 * 60 * 60 * 1000 <= now.getTime()) {
      periodStart = new Date(periodStart.getTime() + 30 * 24 * 60 * 60 * 1000);
    }

    return periodStart;
  },
};

/**
 * Moneditas Usage Tracking - New unified system
 */
export const MoneditasDB = {
  /**
   * Get the period key for storage
   */
  _getPeriodKey(phone) {
    const periodStart = UserSubscriptionDB.getBillingPeriodStart(phone);
    return periodStart.toISOString().split('T')[0]; // YYYY-MM-DD
  },

  /**
   * Get current moneditas usage for this billing period
   */
  getUsage(phone) {
    const periodKey = this._getPeriodKey(phone);
    const userUsage = moneditasUsage.get(phone);
    if (!userUsage || !userUsage[periodKey]) return 0;
    return userUsage[periodKey].used || 0;
  },

  /**
   * Increment moneditas usage
   * @param {string} phone - User's phone number
   * @param {number} amount - Number of moneditas to consume
   * @param {string} operationType - Type of operation for logging
   * @returns {number} New total usage
   */
  increment(phone, amount, operationType = "unknown") {
    const periodKey = this._getPeriodKey(phone);

    let userUsage = moneditasUsage.get(phone);
    if (!userUsage) {
      userUsage = {};
      moneditasUsage.set(phone, userUsage);
    }

    if (!userUsage[periodKey]) {
      userUsage[periodKey] = { used: 0, lastOperation: null };
    }

    userUsage[periodKey].used += amount;
    userUsage[periodKey].lastOperation = operationType;
    userUsage[periodKey].updatedAt = new Date();

    return userUsage[periodKey].used;
  },

  /**
   * Reset usage for a new billing period
   */
  resetPeriod(phone) {
    const userUsage = moneditasUsage.get(phone);
    if (userUsage) {
      const periodKey = this._getPeriodKey(phone);
      delete userUsage[periodKey];
    }
  },

  /**
   * Get usage details including last operation
   */
  getUsageDetails(phone) {
    const periodKey = this._getPeriodKey(phone);
    const userUsage = moneditasUsage.get(phone);
    if (!userUsage || !userUsage[periodKey]) {
      return { used: 0, lastOperation: null, periodKey };
    }
    return { ...userUsage[periodKey], periodKey };
  },
};

/**
 * Legacy Usage Tracking operations (kept for backward compatibility)
 * Will be deprecated once migration is complete
 */
export const UsageDB = {
  /**
   * Get the period key for storage
   */
  _getPeriodKey(phone) {
    const periodStart = UserSubscriptionDB.getBillingPeriodStart(phone);
    return periodStart.toISOString().split('T')[0]; // YYYY-MM-DD
  },

  /**
   * Get current usage count for a specific type
   */
  getUsage(phone, usageType) {
    const periodKey = this._getPeriodKey(phone);
    const userUsage = usage.get(phone);
    if (!userUsage) return 0;

    const typeUsage = userUsage[usageType];
    if (!typeUsage) return 0;

    return typeUsage[periodKey] || 0;
  },

  /**
   * Increment usage count for a specific type
   */
  increment(phone, usageType) {
    const periodKey = this._getPeriodKey(phone);

    let userUsage = usage.get(phone);
    if (!userUsage) {
      userUsage = {};
      usage.set(phone, userUsage);
    }

    if (!userUsage[usageType]) {
      userUsage[usageType] = {};
    }

    userUsage[usageType][periodKey] = (userUsage[usageType][periodKey] || 0) + 1;

    return userUsage[usageType][periodKey];
  },

  /**
   * Get all usage for current period
   */
  getAllUsage(phone) {
    const periodKey = this._getPeriodKey(phone);
    const userUsage = usage.get(phone) || {};

    return {
      text: userUsage.text?.[periodKey] || 0,
      voice: userUsage.voice?.[periodKey] || 0,
      image: userUsage.image?.[periodKey] || 0,
      ai_conversation: userUsage.ai_conversation?.[periodKey] || 0,
      budget: userUsage.budget?.[periodKey] || 0,
    };
  },

  /**
   * Reset usage for a new billing period (usually automatic based on period key)
   */
  resetPeriod(phone) {
    const userUsage = usage.get(phone);
    if (userUsage) {
      const periodKey = this._getPeriodKey(phone);
      for (const type of Object.keys(userUsage)) {
        delete userUsage[type][periodKey];
      }
    }
  },

  /**
   * Check if user has exceeded limit for a specific type
   * Now uses moneditas system - maps to unified limit
   */
  checkLimit(phone, usageType) {
    // Use the new moneditas system
    const plan = UserSubscriptionDB.getPlan(phone);
    const moneditasUsed = MoneditasDB.getUsage(phone);
    const moneditasLimit = plan.moneditasMonthly;

    // For backward compatibility, we check against moneditas limit
    const remaining = Math.max(0, moneditasLimit - moneditasUsed);

    return {
      allowed: remaining > 0,
      used: moneditasUsed,
      limit: moneditasLimit,
      remaining,
    };
  },
};
