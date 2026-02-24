/**
 * Supabase Database Implementation
 * Drop-in replacement for inMemoryDB.js
 *
 * Setup:
 * 1. npm install @supabase/supabase-js
 * 2. Add to .env:
 *    SUPABASE_URL=https://xxxxx.supabase.co
 *    SUPABASE_ANON_KEY=eyJxxx...
 * 3. Run SQL schema in Supabase dashboard
 * 4. Replace imports in your app
 */

import { createClient } from "@supabase/supabase-js";
import { getDayKey, getWeekKey, getMonthKey } from '../utils/dateUtils.js';

const supabaseUrl = process.env.SUPABASE_URL;

// Prefer service role key for server-side usage (bypasses RLS). Fall back to anon key.
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY in your .env or environment.",
  );
}

if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.log(
    "Using SUPABASE_SERVICE_ROLE_KEY for Supabase client (server-side).",
  );
} else {
  console.warn(
    "Warning: using SUPABASE_ANON_KEY. If you encounter permission errors for writes, provide SUPABASE_SERVICE_ROLE_KEY or adjust RLS policies.",
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * User operations
 */
export const UserDB = {
  async create(phone, data = {}) {
    try {
      console.log("[supabase] Inserting user for", phone);
      const { data: user, error } = await supabase
        .from("users")
        .insert([
          {
            phone,
            preferences: data.preferences || {},
            currency: data.currency || null,
            language: data.language || null,
            setup_complete: data.setup_complete || false,
            setup_reminded: data.setup_reminded || false,
          },
        ])
        .select()
        .single();

      if (error) {
        console.error("[supabase] Error inserting user:", error);
        throw error;
      }

      console.log("[supabase] Inserted user id=", user?.id);
      return user;
    } catch (err) {
      console.error("[supabase] create(user) failed:", err?.message || err);
      throw err;
    }
  },

  async get(phone) {
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("phone", phone)
      .single();

    // PGRST116 = row not found, which is ok
    if (error && error.code !== "PGRST116") throw error;
    return data;
  },

  async getOrCreate(phone) {
    let user = await this.get(phone);
    if (!user) {
      user = await this.create(phone);
    }
    return user;
  },

  async update(phone, data) {
    const { data: user, error } = await supabase
      .from("users")
      .update(data)
      .eq("phone", phone)
      .select()
      .single();

    if (error) throw error;
    return user;
  },

  async all() {
    const { data, error } = await supabase.from("users").select("*");

    if (error) throw error;
    return data;
  },

  async setCurrency(phone, currency) {
    const { data: user, error } = await supabase
      .from("users")
      .update({ currency })
      .eq("phone", phone)
      .select()
      .single();

    if (error) throw error;
    return user;
  },

  async getCurrency(phone) {
    const { data, error } = await supabase
      .from("users")
      .select("currency")
      .eq("phone", phone)
      .single();

    if (error && error.code !== "PGRST116") throw error;
    return data ? data.currency : null;
  },

  async setLanguage(phone, language) {
    const { data: user, error } = await supabase
      .from("users")
      .update({ language })
      .eq("phone", phone)
      .select()
      .single();

    if (error) throw error;
    return user;
  },

  async getLanguage(phone) {
    const { data, error } = await supabase
      .from("users")
      .select("language")
      .eq("phone", phone)
      .single();

    if (error && error.code !== "PGRST116") throw error;
    return data ? data.language : null;
  },

  async setCategories(phone, categories) {
    const { data: user, error } = await supabase
      .from("users")
      .update({ categories })
      .eq("phone", phone)
      .select()
      .single();

    if (error) throw error;
    return user;
  },

  async getCategories(phone) {
    const { data, error } = await supabase
      .from("users")
      .select("categories")
      .eq("phone", phone)
      .single();

    if (error && error.code !== "PGRST116") throw error;
    return data ? data.categories : null;
  },

  async setSetupComplete(phone, complete = true) {
    const { data: user, error } = await supabase
      .from("users")
      .update({ setup_complete: complete })
      .eq("phone", phone)
      .select()
      .single();

    if (error) throw error;
    return user;
  },

  async setSetupReminded(phone, reminded = true) {
    const { data: user, error } = await supabase
      .from("users")
      .update({ setup_reminded: reminded })
      .eq("phone", phone)
      .select()
      .single();

    if (error) throw error;
    return user;
  },
};

/**
 * Expense operations
 */
export const ExpenseDB = {
  async create(phone, expenseData) {
    try {
      console.log("[supabase] Inserting expense for", phone, expenseData);
      const { data, error } = await supabase
        .from("expenses")
        .insert([
          {
            phone,
            amount: expenseData.amount,
            category: expenseData.category || "uncategorized",
            description: expenseData.description || "",
            date: expenseData.date || new Date().toISOString(),
            source: expenseData.source || "manual",
            external_id: expenseData.external_id || null,
          },
        ])
        .select()
        .single();

      if (error) {
        console.error("[supabase] Error inserting expense:", error);
        throw error;
      }

      console.log("[supabase] Inserted expense id=", data?.id);
      return data;
    } catch (err) {
      console.error("[supabase] create(expense) failed:", err?.message || err);
      throw err;
    }
  },

  async getByExternalId(phone, externalId) {
    const { data, error } = await supabase
      .from("expenses")
      .select("*")
      .eq("phone", phone)
      .eq("external_id", externalId)
      .single();

    if (error && error.code !== "PGRST116") throw error;
    return data;
  },

  /**
   * Find duplicate expense by amount, date (±24h), and similar description
   * Used for Excel import deduplication
   */
  async findDuplicate(phone, { amount, date, description }) {
    const targetDate = new Date(date);
    const dayBefore = new Date(targetDate.getTime() - 24 * 60 * 60 * 1000);
    const dayAfter = new Date(targetDate.getTime() + 24 * 60 * 60 * 1000);

    const { data, error } = await supabase
      .from("expenses")
      .select("*")
      .eq("phone", phone)
      .eq("amount", amount)
      .gte("date", dayBefore.toISOString())
      .lte("date", dayAfter.toISOString());

    if (error) throw error;
    if (!data || data.length === 0) return null;

    // If description matches (fuzzy), it's a duplicate
    if (description) {
      const normalizedDesc = description.toLowerCase().trim();
      const match = data.find(e =>
        e.description && e.description.toLowerCase().trim().includes(normalizedDesc.substring(0, 10))
      );
      if (match) return match;
    }

    // If same amount on same day, likely duplicate
    return data[0];
  },

  async getByUser(phone) {
    const { data, error } = await supabase
      .from("expenses")
      .select("*")
      .eq("phone", phone)
      .order("date", { ascending: false });

    if (error) throw error;
    return data || [];
  },

  async getById(phone, id) {
    const { data, error } = await supabase
      .from("expenses")
      .select("*")
      .eq("phone", phone)
      .eq("id", id)
      .single();

    if (error && error.code !== "PGRST116") throw error;
    return data;
  },

  async getByDateRange(phone, startDate, endDate) {
    const { data, error } = await supabase
      .from("expenses")
      .select("*")
      .eq("phone", phone)
      .gte("date", startDate.toISOString())
      .lte("date", endDate.toISOString())
      .order("date", { ascending: false });

    if (error) throw error;
    return data || [];
  },

  async delete(phone, id) {
    const { error } = await supabase
      .from("expenses")
      .delete()
      .eq("phone", phone)
      .eq("id", id);

    if (error) throw error;
    return true;
  },

  async update(phone, id, updates) {
    const { data, error } = await supabase
      .from("expenses")
      .update(updates)
      .eq("phone", phone)
      .eq("id", id)
      .select()
      .single();

    if (error && error.code !== "PGRST116") throw error;
    return data;
  },

  async getTotalByCategory(phone, category, startDate, endDate) {
    const expenses = await this.getByDateRange(phone, startDate, endDate);
    return expenses
      .filter((e) => e.category === category)
      .reduce((sum, e) => sum + parseFloat(e.amount), 0);
  },

  async renameCategory(phone, oldName, newName) {
    const { data, error } = await supabase
      .from("expenses")
      .update({ category: newName })
      .eq("phone", phone)
      .eq("category", oldName)
      .select();

    if (error) throw error;
    return data ? data.length : 0;
  },

  async getCategorySummary(phone, startDate, endDate) {
    const expenses = await this.getByDateRange(phone, startDate, endDate);
    const summary = {};

    expenses.forEach((e) => {
      if (!summary[e.category]) {
        summary[e.category] = { total: 0, count: 0 };
      }
      summary[e.category].total += parseFloat(e.amount);
      summary[e.category].count += 1;
    });

    return summary;
  },

  /**
   * Advanced filtering method for expenses
   * @param {string} phone - User's phone number
   * @param {object} filters - Filter criteria
   * @param {Date|null} filters.startDate - Start date filter
   * @param {Date|null} filters.endDate - End date filter
   * @param {string|null} filters.category - Single category filter
   * @param {string[]|null} filters.categories - Multiple categories filter (OR)
   * @param {number|null} filters.minAmount - Minimum amount filter
   * @param {number|null} filters.maxAmount - Maximum amount filter
   * @param {string|null} filters.searchText - Text search in description
   * @param {object} options - Query options
   * @param {string} options.sortBy - Sort field: 'date', 'amount', 'category' (default: 'date')
   * @param {string} options.sortOrder - Sort order: 'asc', 'desc' (default: 'desc')
   * @param {number} options.limit - Max results (default: 50, max: 100)
   * @param {number} options.offset - Skip first N results (default: 0)
   * @param {boolean} options.aggregate - Return summary instead of list (default: false)
   * @param {string|null} options.groupBy - Group by: 'category', 'day', 'week', 'month'
   * @returns {Promise<object>} { expenses, total, hasMore } or { summary, byGroup } if aggregate
   */
  async getByFilter(phone, filters = {}, options = {}) {
    const {
      startDate = null,
      endDate = null,
      category = null,
      categories = null,
      minAmount = null,
      maxAmount = null,
      searchText = null
    } = filters;

    const {
      sortBy = 'date',
      sortOrder = 'desc',
      limit = 50,
      offset = 0,
      aggregate = false,
      groupBy = null
    } = options;

    // Build query
    let query = supabase
      .from("expenses")
      .select("*", { count: 'exact' })
      .eq("phone", phone);

    // Date filters
    if (startDate) {
      query = query.gte("date", startDate.toISOString());
    }
    if (endDate) {
      query = query.lte("date", endDate.toISOString());
    }

    // Category filter
    if (category) {
      query = query.ilike("category", category);
    } else if (categories && categories.length > 0) {
      query = query.in("category", categories.map(c => c.toLowerCase()));
    }

    // Amount filters
    if (minAmount !== null) {
      query = query.gte("amount", minAmount);
    }
    if (maxAmount !== null) {
      query = query.lte("amount", maxAmount);
    }

    // Text search in description (ilike for case-insensitive)
    if (searchText) {
      // Search in both description and category
      query = query.or(`description.ilike.%${searchText}%,category.ilike.%${searchText}%`);
    }

    // If aggregate mode, we need all matching expenses for computation
    if (aggregate) {
      const { data, error } = await query.order("date", { ascending: false });
      if (error) throw error;
      return this._computeAggregate(data || [], groupBy);
    }

    // Sorting
    const sortColumn = sortBy === 'date' ? 'date' : sortBy === 'amount' ? 'amount' : 'category';
    query = query.order(sortColumn, { ascending: sortOrder === 'asc' });

    // Pagination
    const effectiveLimit = Math.min(limit, 100);
    query = query.range(offset, offset + effectiveLimit - 1);

    const { data, error, count } = await query;

    if (error) throw error;

    return {
      expenses: data || [],
      total: count || 0,
      hasMore: (count || 0) > offset + effectiveLimit
    };
  },

  /**
   * Compute aggregation for expenses
   * @private
   */
  _computeAggregate(expenses, groupBy) {
    if (expenses.length === 0) {
      return {
        summary: { total: 0, count: 0, average: 0, max: 0, min: 0 },
        byGroup: null
      };
    }

    // Overall summary
    const total = expenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);
    const count = expenses.length;
    const amounts = expenses.map(e => parseFloat(e.amount));

    const summary = {
      total,
      count,
      average: total / count,
      max: Math.max(...amounts),
      min: Math.min(...amounts)
    };

    // Group if requested
    if (!groupBy) {
      return { summary, byGroup: null };
    }

    const groups = {};
    for (const expense of expenses) {
      let key;
      switch (groupBy) {
        case 'category':
          key = expense.category;
          break;
        case 'day':
          key = getDayKey(new Date(expense.date));
          break;
        case 'week':
          key = getWeekKey(new Date(expense.date));
          break;
        case 'month':
          key = getMonthKey(new Date(expense.date));
          break;
        default:
          key = 'unknown';
      }

      if (!groups[key]) {
        groups[key] = { total: 0, count: 0, expenses: [] };
      }
      groups[key].total += parseFloat(expense.amount);
      groups[key].count += 1;
      groups[key].expenses.push(expense);
    }

    // Calculate average for each group
    for (const key of Object.keys(groups)) {
      groups[key].average = groups[key].total / groups[key].count;
    }

    return { summary, byGroup: groups };
  },
};

/**
 * Budget operations
 */
export const BudgetDB = {
  async create(phone, budgetData) {
    // Use upsert to handle duplicates gracefully
    const { data, error } = await supabase
      .from("budgets")
      .upsert(
        [
          {
            phone,
            category: budgetData.category,
            amount: budgetData.amount,
            period: budgetData.period || "monthly",
          },
        ],
        {
          onConflict: "phone,category",
        },
      )
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async getByUser(phone) {
    const { data, error } = await supabase
      .from("budgets")
      .select("*")
      .eq("phone", phone);

    if (error) throw error;
    return data || [];
  },

  async getByCategory(phone, category) {
    const { data, error } = await supabase
      .from("budgets")
      .select("*")
      .eq("phone", phone)
      .eq("category", category)
      .single();

    if (error && error.code !== "PGRST116") throw error;
    return data;
  },

  async update(phone, category, amount) {
    const { data, error } = await supabase
      .from("budgets")
      .update({ amount })
      .eq("phone", phone)
      .eq("category", category)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async delete(phone, category) {
    const { error } = await supabase
      .from("budgets")
      .delete()
      .eq("phone", phone)
      .eq("category", category);

    if (error) throw error;
    return true;
  },

  async renameCategory(phone, oldName, newName) {
    const { data, error } = await supabase
      .from("budgets")
      .update({ category: newName })
      .eq("phone", phone)
      .eq("category", oldName)
      .select();

    if (error) throw error;
    return data ? data.length : 0;
  },

  /**
   * Get budget status with current spending
   * Uses the budget_status view created in SQL schema
   */
  async getBudgetStatus(phone) {
    const { data, error } = await supabase
      .from("budget_status")
      .select("*")
      .eq("phone", phone);

    if (error) throw error;
    return data || [];
  },
};

/**
 * Unprocessed cases — messages the system couldn't handle
 */
export const UnprocessedDB = {
  async create(phone, caseData) {
    try {
      const { data, error } = await supabase
        .from("unprocessed_cases")
        .insert([
          {
            phone,
            type: caseData.type,
            content: caseData.content || null,
            media_id: caseData.media_id || null,
            reason: caseData.reason || 'unknown',
            raw_result: caseData.raw_result || null,
            resolved: false,
          },
        ])
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (err) {
      // Don't crash the main flow if saving the case fails
      console.error("[supabase] Failed to save unprocessed case:", err?.message || err);
      return null;
    }
  },

  async getAll() {
    const { data, error } = await supabase
      .from("unprocessed_cases")
      .select("*")
      .eq("resolved", false)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  },

  async getByPhone(phone) {
    const { data, error } = await supabase
      .from("unprocessed_cases")
      .select("*")
      .eq("phone", phone)
      .eq("resolved", false)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  },

  async resolve(id) {
    const { data, error } = await supabase
      .from("unprocessed_cases")
      .update({ resolved: true })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }
};

/**
 * Health check
 */
export async function testConnection() {
  try {
    const { data, error } = await supabase
      .from("users")
      .select("count")
      .limit(1);

    if (error) throw error;
    console.log("✅ Supabase connection successful");
    return true;
  } catch (error) {
    console.error("❌ Supabase connection failed:", error);
    return false;
  }
}
