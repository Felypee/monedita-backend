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
 * Tutorial progress operations
 */
export const TutorialDB = {
  async create(phone, step = 1) {
    try {
      const { data, error } = await supabase
        .from("tutorials")
        .insert([{ phone, current_step: step }])
        .select()
        .single();

      if (error) throw error;
      return { phone: data.phone, currentStep: data.current_step, createdAt: data.created_at };
    } catch (err) {
      console.error("[supabase] create(tutorial) failed:", err?.message || err);
      throw err;
    }
  },

  async get(phone) {
    const { data, error } = await supabase
      .from("tutorials")
      .select("*")
      .eq("phone", phone)
      .single();

    if (error && error.code !== "PGRST116") throw error;
    if (!data) return null;
    return { phone: data.phone, currentStep: data.current_step, createdAt: data.created_at };
  },

  async updateStep(phone, step) {
    const { data, error } = await supabase
      .from("tutorials")
      .update({ current_step: step })
      .eq("phone", phone)
      .select()
      .single();

    if (error) throw error;
    return { phone: data.phone, currentStep: data.current_step, createdAt: data.created_at };
  },

  async delete(phone) {
    const { error } = await supabase
      .from("tutorials")
      .delete()
      .eq("phone", phone);

    if (error) throw error;
    return true;
  },

  async exists(phone) {
    const { data, error } = await supabase
      .from("tutorials")
      .select("phone")
      .eq("phone", phone)
      .single();

    if (error && error.code !== "PGRST116") throw error;
    return !!data;
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
