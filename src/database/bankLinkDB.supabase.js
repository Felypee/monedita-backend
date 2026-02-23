/**
 * Supabase Bank Link Database
 * Stores Belvo bank connections for Open Banking integration
 */

import { supabase } from "./supabaseDB.js";

/**
 * Bank Link operations
 */
export const BankLinkDB = {
  /**
   * Create a new bank link
   * @param {string} phone - User's phone number
   * @param {object} data - Link data
   * @returns {Promise<object>} Created bank link
   */
  async create(phone, data) {
    const { data: link, error } = await supabase
      .from("bank_links")
      .insert([
        {
          phone,
          link_id: data.linkId,
          institution: data.institution,
          institution_id: data.institutionId,
          status: data.status || "pending",
        },
      ])
      .select()
      .single();

    if (error) throw error;

    return this._mapToJs(link);
  },

  /**
   * Get all bank links for a user
   * @param {string} phone - User's phone number
   * @returns {Promise<Array>} User's bank links
   */
  async getByUser(phone) {
    const { data, error } = await supabase
      .from("bank_links")
      .select("*")
      .eq("phone", phone)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return (data || []).map(this._mapToJs);
  },

  /**
   * Get a bank link by Belvo link ID
   * @param {string} linkId - Belvo link ID
   * @returns {Promise<object|null>} Bank link or null
   */
  async getByLinkId(linkId) {
    const { data, error } = await supabase
      .from("bank_links")
      .select("*")
      .eq("link_id", linkId)
      .single();

    if (error && error.code !== "PGRST116") throw error;
    return data ? this._mapToJs(data) : null;
  },

  /**
   * Get active bank links for a user
   * @param {string} phone - User's phone number
   * @returns {Promise<Array>} Active bank links
   */
  async getActiveByUser(phone) {
    const { data, error } = await supabase
      .from("bank_links")
      .select("*")
      .eq("phone", phone)
      .eq("status", "active")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return (data || []).map(this._mapToJs);
  },

  /**
   * Update a bank link
   * @param {string} linkId - Belvo link ID
   * @param {object} updates - Fields to update
   * @returns {Promise<object|null>} Updated link or null
   */
  async update(linkId, updates) {
    const dbUpdates = {};
    if (updates.status !== undefined) dbUpdates.status = updates.status;
    if (updates.lastSyncAt !== undefined) dbUpdates.last_sync_at = updates.lastSyncAt;
    if (updates.errorMessage !== undefined) dbUpdates.error_message = updates.errorMessage;

    const { data, error } = await supabase
      .from("bank_links")
      .update(dbUpdates)
      .eq("link_id", linkId)
      .select()
      .single();

    if (error && error.code !== "PGRST116") throw error;
    return data ? this._mapToJs(data) : null;
  },

  /**
   * Update link status
   * @param {string} linkId - Belvo link ID
   * @param {string} status - New status
   * @param {string|null} errorMessage - Error message if status is 'error'
   * @returns {Promise<object|null>} Updated link or null
   */
  async updateStatus(linkId, status, errorMessage = null) {
    return this.update(linkId, {
      status,
      errorMessage: status === "error" ? errorMessage : null,
    });
  },

  /**
   * Update last sync timestamp
   * @param {string} linkId - Belvo link ID
   * @returns {Promise<object|null>} Updated link or null
   */
  async updateLastSync(linkId) {
    return this.update(linkId, { lastSyncAt: new Date().toISOString() });
  },

  /**
   * Delete a bank link
   * @param {string} linkId - Belvo link ID
   * @returns {Promise<boolean>} True if deleted
   */
  async delete(linkId) {
    const { error } = await supabase
      .from("bank_links")
      .delete()
      .eq("link_id", linkId);

    if (error) throw error;
    return true;
  },

  /**
   * Count active bank links for a user
   * @param {string} phone - User's phone number
   * @returns {Promise<number>} Count of active links
   */
  async countActiveByUser(phone) {
    const { count, error } = await supabase
      .from("bank_links")
      .select("*", { count: "exact", head: true })
      .eq("phone", phone)
      .eq("status", "active");

    if (error) throw error;
    return count || 0;
  },

  /**
   * Map database row to JS object
   * @private
   */
  _mapToJs(row) {
    return {
      id: row.id,
      phone: row.phone,
      linkId: row.link_id,
      institution: row.institution,
      institutionId: row.institution_id,
      status: row.status,
      lastSyncAt: row.last_sync_at ? new Date(row.last_sync_at) : null,
      errorMessage: row.error_message,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  },
};

/**
 * Bank Import Usage tracking
 */
export const BankImportUsageDB = {
  /**
   * Get period start for current month
   * @returns {string} ISO date string
   */
  _getPeriodStart() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  },

  /**
   * Get current period usage
   * @param {string} phone - User's phone number
   * @returns {Promise<number>} Transactions imported this period
   */
  async getUsage(phone) {
    const periodStart = this._getPeriodStart();

    const { data, error } = await supabase
      .from("bank_import_usage")
      .select("transactions_imported")
      .eq("phone", phone)
      .eq("period_start", periodStart)
      .single();

    if (error && error.code !== "PGRST116") throw error;
    return data?.transactions_imported || 0;
  },

  /**
   * Increment usage
   * @param {string} phone - User's phone number
   * @param {number} count - Number of transactions to add
   * @returns {Promise<number>} New usage count
   */
  async increment(phone, count = 1) {
    const periodStart = this._getPeriodStart();

    // Use upsert to create or update
    const { data, error } = await supabase
      .from("bank_import_usage")
      .upsert(
        {
          phone,
          period_start: periodStart,
          transactions_imported: count,
        },
        {
          onConflict: "phone,period_start",
          ignoreDuplicates: false,
        }
      )
      .select()
      .single();

    if (error) {
      // If upsert fails, try update
      const current = await this.getUsage(phone);
      const newCount = current + count;

      const { data: updated, error: updateError } = await supabase
        .from("bank_import_usage")
        .update({ transactions_imported: newCount })
        .eq("phone", phone)
        .eq("period_start", periodStart)
        .select()
        .single();

      if (updateError) throw updateError;
      return updated?.transactions_imported || newCount;
    }

    return data?.transactions_imported || count;
  },

  /**
   * Check if user can import more transactions
   * @param {string} phone - User's phone number
   * @param {number} limit - Monthly limit
   * @param {number} count - Number to import
   * @returns {Promise<{allowed: boolean, used: number, remaining: number}>}
   */
  async canImport(phone, limit, count = 1) {
    const used = await this.getUsage(phone);
    const remaining = Math.max(0, limit - used);
    return {
      allowed: remaining >= count,
      used,
      remaining,
      limit,
    };
  },
};

export default { BankLinkDB, BankImportUsageDB };
