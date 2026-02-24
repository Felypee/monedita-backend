/**
 * Supabase database for subscription management
 * Drop-in replacement for subscriptionDB.inMemory.js
 *
 * New moneditas-based system (February 2026):
 * - 1 monedita = $0.002 USD
 * - Costs: TEXT=5, IMAGE=6, AUDIO=4, WEEKLY_SUMMARY=5
 */

import { supabase } from "./supabaseDB.js";

/**
 * Subscription Plan operations (read from DB, but plans are static)
 */
export const SubscriptionPlanDB = {
  async get(planId) {
    const { data, error } = await supabase
      .from("subscription_plans")
      .select("*")
      .eq("id", planId)
      .single();

    if (error && error.code !== "PGRST116") throw error;
    return data ? this._mapPlan(data) : null;
  },

  async getAll() {
    const { data, error } = await supabase
      .from("subscription_plans")
      .select("*")
      .order("price_monthly", { ascending: true });

    if (error) throw error;
    return (data || []).map(this._mapPlan);
  },

  async getDefault() {
    return this.get("free");
  },

  // Map DB column names to JS camelCase
  _mapPlan(row) {
    return {
      id: row.id,
      name: row.name,
      priceMonthly: parseFloat(row.price_monthly),
      moneditasMonthly: row.moneditas_monthly || this._getLegacyMoneditas(row.id),
      historyDays: row.history_days || this._getLegacyHistoryDays(row.id),
      // Legacy fields for backward compatibility
      limitTextMessages: row.limit_text_messages,
      limitVoiceMessages: row.limit_voice_messages,
      limitImageMessages: row.limit_image_messages,
      limitAiConversations: row.limit_ai_conversations,
      limitBudgets: row.limit_budgets,
      canExportCsv: row.can_export_csv,
      canExportPdf: row.can_export_pdf,
      // Open Banking limits
      bankConnections: row.bank_connections || 0,
      bankTransactionsPerMonth: row.bank_transactions_per_month || 0,
    };
  },

  // Fallback values if DB doesn't have new columns yet
  _getLegacyMoneditas(planId) {
    const defaults = { free: 50, basic: 1200, premium: 3500 };
    return defaults[planId] || 50;
  },

  _getLegacyHistoryDays(planId) {
    const defaults = { free: 30, basic: 180, premium: 365 };
    return defaults[planId] || 30;
  },
};

/**
 * User Subscription operations
 */
export const UserSubscriptionDB = {
  async create(phone, planId = "free") {
    const { data, error } = await supabase
      .from("user_subscriptions")
      .insert([
        {
          phone,
          plan_id: planId,
          started_at: new Date().toISOString(),
          is_active: true,
        },
      ])
      .select()
      .single();

    if (error) throw error;
    return this._mapSubscription(data);
  },

  async get(phone) {
    const { data, error } = await supabase
      .from("user_subscriptions")
      .select("*")
      .eq("phone", phone)
      .eq("is_active", true)
      .single();

    if (error && error.code !== "PGRST116") throw error;
    return data ? this._mapSubscription(data) : null;
  },

  async getOrCreate(phone) {
    let subscription = await this.get(phone);
    if (!subscription) {
      subscription = await this.create(phone, "free");
    }
    return subscription;
  },

  async update(phone, data) {
    const updateData = {};
    if (data.planId !== undefined) updateData.plan_id = data.planId;
    if (data.startedAt !== undefined) updateData.started_at = data.startedAt;
    if (data.expiresAt !== undefined) updateData.expires_at = data.expiresAt;
    if (data.isActive !== undefined) updateData.is_active = data.isActive;
    if (data.autoRenew !== undefined) updateData.auto_renew = data.autoRenew;
    if (data.nextBillingDate !== undefined) updateData.next_billing_date = data.nextBillingDate;
    if (data.cancelledAt !== undefined) updateData.cancelled_at = data.cancelledAt;
    updateData.updated_at = new Date().toISOString();

    const { data: result, error } = await supabase
      .from("user_subscriptions")
      .update(updateData)
      .eq("phone", phone)
      .select()
      .single();

    if (error) throw error;
    return this._mapSubscription(result);
  },

  async upgradePlan(phone, newPlanId) {
    let subscription = await this.get(phone);

    if (!subscription) {
      subscription = await this.create(phone, newPlanId);
    } else {
      subscription = await this.update(phone, {
        planId: newPlanId,
        startedAt: new Date().toISOString(), // Reset billing period
      });
    }

    return subscription;
  },

  async getPlan(phone) {
    const subscription = await this.getOrCreate(phone);
    return SubscriptionPlanDB.get(subscription.planId);
  },

  /**
   * Get the start of the current billing period for a user
   */
  async getBillingPeriodStart(phone) {
    const subscription = await this.getOrCreate(phone);
    const startedAt = new Date(subscription.startedAt);
    const now = new Date();

    // Calculate how many full months have passed since subscription started
    let periodStart = new Date(startedAt);
    while (periodStart.getTime() + 30 * 24 * 60 * 60 * 1000 <= now.getTime()) {
      periodStart = new Date(periodStart.getTime() + 30 * 24 * 60 * 60 * 1000);
    }

    return periodStart;
  },

  _mapSubscription(row) {
    return {
      id: row.id,
      phone: row.phone,
      planId: row.plan_id,
      startedAt: row.started_at,
      expiresAt: row.expires_at,
      isActive: row.is_active,
      autoRenew: row.auto_renew || false,
      nextBillingDate: row.next_billing_date,
      cancelledAt: row.cancelled_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  },
};

/**
 * Moneditas Usage Tracking - New unified system
 */
export const MoneditasDB = {
  /**
   * Get the period start for storage
   */
  async _getPeriodStart(phone) {
    return UserSubscriptionDB.getBillingPeriodStart(phone);
  },

  /**
   * Get current moneditas usage for this billing period
   */
  async getUsage(phone) {
    const periodStart = await this._getPeriodStart(phone);

    const { data, error } = await supabase
      .from("moneditas_usage")
      .select("moneditas_used")
      .eq("phone", phone)
      .eq("period_start", periodStart.toISOString())
      .single();

    if (error && error.code !== "PGRST116") throw error;
    return data ? data.moneditas_used : 0;
  },

  /**
   * Increment moneditas usage
   * @param {string} phone - User's phone number
   * @param {number} amount - Number of moneditas to consume
   * @param {string} operationType - Type of operation for logging
   * @returns {Promise<number>} New total usage
   */
  async increment(phone, amount, operationType = "unknown") {
    const periodStart = await this._getPeriodStart(phone);
    const plan = await UserSubscriptionDB.getPlan(phone);

    // Use upsert to either create or increment
    const { data: existing } = await supabase
      .from("moneditas_usage")
      .select("id, moneditas_used, text_count, image_count, voice_count")
      .eq("phone", phone)
      .eq("period_start", periodStart.toISOString())
      .single();

    // Determine which counter to increment based on operation type
    const counterField = operationType === "text_message" ? "text_count"
      : operationType === "image_receipt" ? "image_count"
      : operationType === "audio_message" ? "voice_count"
      : null;

    if (existing) {
      // Update existing record
      const updateData = {
        moneditas_used: existing.moneditas_used + amount,
        last_operation: operationType,
        updated_at: new Date().toISOString(),
      };

      // Increment the specific counter if applicable
      if (counterField && existing[counterField] !== undefined) {
        updateData[counterField] = (existing[counterField] || 0) + 1;
      }

      const { data, error } = await supabase
        .from("moneditas_usage")
        .update(updateData)
        .eq("id", existing.id)
        .select("moneditas_used")
        .single();

      if (error) throw error;
      return data.moneditas_used;
    } else {
      // Insert new record with counter
      const insertData = {
        phone,
        period_start: periodStart.toISOString(),
        moneditas_used: amount,
        moneditas_limit: plan.moneditasMonthly,
        last_operation: operationType,
        text_count: operationType === "text_message" ? 1 : 0,
        image_count: operationType === "image_receipt" ? 1 : 0,
        voice_count: operationType === "audio_message" ? 1 : 0,
      };

      const { data, error } = await supabase
        .from("moneditas_usage")
        .insert([insertData])
        .select("moneditas_used")
        .single();

      if (error) throw error;
      return data.moneditas_used;
    }
  },

  /**
   * Reset usage for a billing period
   */
  async resetPeriod(phone) {
    const periodStart = await this._getPeriodStart(phone);

    const { error } = await supabase
      .from("moneditas_usage")
      .delete()
      .eq("phone", phone)
      .eq("period_start", periodStart.toISOString());

    if (error) throw error;
  },

  /**
   * Get usage details including last operation
   */
  async getUsageDetails(phone) {
    const periodStart = await this._getPeriodStart(phone);

    const { data, error } = await supabase
      .from("moneditas_usage")
      .select("*")
      .eq("phone", phone)
      .eq("period_start", periodStart.toISOString())
      .single();

    if (error && error.code !== "PGRST116") throw error;

    if (!data) {
      return {
        used: 0,
        lastOperation: null,
        periodKey: periodStart.toISOString().split("T")[0],
      };
    }

    return {
      used: data.moneditas_used,
      limit: data.moneditas_limit,
      lastOperation: data.last_operation,
      periodKey: periodStart.toISOString().split("T")[0],
      updatedAt: data.updated_at,
    };
  },
};

/**
 * Legacy Usage Tracking operations (kept for backward compatibility)
 */
export const UsageDB = {
  /**
   * Get the period start for storage
   */
  async _getPeriodStart(phone) {
    return UserSubscriptionDB.getBillingPeriodStart(phone);
  },

  /**
   * Get current usage count for a specific type
   */
  async getUsage(phone, usageType) {
    const periodStart = await this._getPeriodStart(phone);

    const { data, error } = await supabase
      .from("usage_tracking")
      .select("count")
      .eq("phone", phone)
      .eq("usage_type", usageType)
      .eq("period_start", periodStart.toISOString())
      .single();

    if (error && error.code !== "PGRST116") throw error;
    return data ? data.count : 0;
  },

  /**
   * Increment usage count for a specific type
   */
  async increment(phone, usageType) {
    const periodStart = await this._getPeriodStart(phone);

    // Use upsert to either create or increment
    const { data: existing } = await supabase
      .from("usage_tracking")
      .select("id, count")
      .eq("phone", phone)
      .eq("usage_type", usageType)
      .eq("period_start", periodStart.toISOString())
      .single();

    if (existing) {
      // Update existing record
      const { data, error } = await supabase
        .from("usage_tracking")
        .update({
          count: existing.count + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .select("count")
        .single();

      if (error) throw error;
      return data.count;
    } else {
      // Insert new record
      const { data, error } = await supabase
        .from("usage_tracking")
        .insert([
          {
            phone,
            usage_type: usageType,
            count: 1,
            period_start: periodStart.toISOString(),
          },
        ])
        .select("count")
        .single();

      if (error) throw error;
      return data.count;
    }
  },

  /**
   * Get all usage for current period
   */
  async getAllUsage(phone) {
    const periodStart = await this._getPeriodStart(phone);

    const { data, error } = await supabase
      .from("usage_tracking")
      .select("usage_type, count")
      .eq("phone", phone)
      .eq("period_start", periodStart.toISOString());

    if (error) throw error;

    const usageMap = {
      text: 0,
      voice: 0,
      image: 0,
      ai_conversation: 0,
      budget: 0,
    };

    for (const row of data || []) {
      usageMap[row.usage_type] = row.count;
    }

    return usageMap;
  },

  /**
   * Reset usage for current billing period
   */
  async resetPeriod(phone) {
    const periodStart = await this._getPeriodStart(phone);

    const { error } = await supabase
      .from("usage_tracking")
      .delete()
      .eq("phone", phone)
      .eq("period_start", periodStart.toISOString());

    if (error) throw error;
  },

  /**
   * Check if user has exceeded limit - now uses moneditas system
   */
  async checkLimit(phone, usageType) {
    const plan = await UserSubscriptionDB.getPlan(phone);
    const moneditasUsed = await MoneditasDB.getUsage(phone);
    const moneditasLimit = plan.moneditasMonthly;

    const remaining = Math.max(0, moneditasLimit - moneditasUsed);

    return {
      allowed: remaining > 0,
      used: moneditasUsed,
      limit: moneditasLimit,
      remaining,
    };
  },
};
