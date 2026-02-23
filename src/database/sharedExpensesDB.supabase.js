/**
 * Supabase Shared Expenses Database
 * Stores expense groups, members, shared expenses, and splits
 */

import { supabase } from "./supabaseDB.js";
import { nanoid } from "nanoid";

/**
 * Generate a short unique ID for groups
 */
function generateGroupId() {
  return nanoid(8);
}

/**
 * Expense Groups operations
 */
export const ExpenseGroupDB = {
  /**
   * Create a new expense group
   * @param {string} createdBy - Creator's phone number
   * @param {object} data - Group data { name }
   * @returns {Promise<object>} Created group
   */
  async create(createdBy, data) {
    const groupId = generateGroupId();

    const { data: group, error } = await supabase
      .from("expense_groups")
      .insert([
        {
          id: groupId,
          name: data.name,
          created_by: createdBy,
        },
      ])
      .select()
      .single();

    if (error) throw error;

    // Add creator as owner
    await GroupMemberDB.add(groupId, createdBy, "owner");

    return this._mapToJs(group);
  },

  /**
   * Get a group by ID
   * @param {string} groupId - Group ID
   * @returns {Promise<object|null>} Group or null
   */
  async get(groupId) {
    const { data, error } = await supabase
      .from("expense_groups")
      .select("*")
      .eq("id", groupId)
      .single();

    if (error && error.code !== "PGRST116") throw error;
    return data ? this._mapToJs(data) : null;
  },

  /**
   * Get all groups for a user (where they are a member)
   * @param {string} phone - User's phone number
   * @returns {Promise<Array>} User's groups
   */
  async getByUser(phone) {
    const { data, error } = await supabase
      .from("group_members")
      .select("group_id, expense_groups(*)")
      .eq("member_phone", phone);

    if (error) throw error;
    return (data || [])
      .filter((m) => m.expense_groups)
      .map((m) => this._mapToJs(m.expense_groups));
  },

  /**
   * Update a group
   * @param {string} groupId - Group ID
   * @param {object} updates - Fields to update
   * @returns {Promise<object|null>} Updated group or null
   */
  async update(groupId, updates) {
    const dbUpdates = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;

    const { data, error } = await supabase
      .from("expense_groups")
      .update(dbUpdates)
      .eq("id", groupId)
      .select()
      .single();

    if (error && error.code !== "PGRST116") throw error;
    return data ? this._mapToJs(data) : null;
  },

  /**
   * Delete a group (cascades to members, expenses, splits via DB)
   * @param {string} groupId - Group ID
   * @returns {Promise<boolean>} True if deleted
   */
  async delete(groupId) {
    const { error } = await supabase
      .from("expense_groups")
      .delete()
      .eq("id", groupId);

    if (error) throw error;
    return true;
  },

  /**
   * Find a group by name for a user
   * @param {string} phone - User's phone number
   * @param {string} name - Group name (partial match)
   * @returns {Promise<object|null>} Matched group or null
   */
  async findByName(phone, name) {
    const userGroups = await this.getByUser(phone);
    const nameLower = name.toLowerCase();
    return userGroups.find((g) => g.name.toLowerCase().includes(nameLower)) || null;
  },

  /**
   * Map database row to JS object
   * @private
   */
  _mapToJs(row) {
    return {
      id: row.id,
      name: row.name,
      createdBy: row.created_by,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  },
};

/**
 * Group Members operations
 */
export const GroupMemberDB = {
  /**
   * Add a member to a group
   * @param {string} groupId - Group ID
   * @param {string} phone - Member's phone number
   * @param {string} role - 'owner' or 'member'
   * @returns {Promise<object>} Created member record
   */
  async add(groupId, phone, role = "member") {
    const { data, error } = await supabase
      .from("group_members")
      .upsert(
        [
          {
            group_id: groupId,
            member_phone: phone,
            role,
          },
        ],
        { onConflict: "group_id,member_phone" }
      )
      .select()
      .single();

    if (error) throw error;
    return this._mapToJs(data);
  },

  /**
   * Get all members of a group
   * @param {string} groupId - Group ID
   * @returns {Promise<Array>} Group members
   */
  async getByGroup(groupId) {
    const { data, error } = await supabase
      .from("group_members")
      .select("*")
      .eq("group_id", groupId);

    if (error) throw error;
    return (data || []).map(this._mapToJs);
  },

  /**
   * Get all group IDs for a user
   * @param {string} phone - User's phone number
   * @returns {Promise<Array<string>>} Group IDs
   */
  async getGroupIds(phone) {
    const { data, error } = await supabase
      .from("group_members")
      .select("group_id")
      .eq("member_phone", phone);

    if (error) throw error;
    return (data || []).map((m) => m.group_id);
  },

  /**
   * Remove a member from a group
   * @param {string} groupId - Group ID
   * @param {string} phone - Member's phone number
   * @returns {Promise<boolean>} True if removed
   */
  async remove(groupId, phone) {
    const { error } = await supabase
      .from("group_members")
      .delete()
      .eq("group_id", groupId)
      .eq("member_phone", phone);

    if (error) throw error;
    return true;
  },

  /**
   * Check if user is a member of a group
   * @param {string} groupId - Group ID
   * @param {string} phone - User's phone number
   * @returns {Promise<boolean>}
   */
  async isMember(groupId, phone) {
    const { count, error } = await supabase
      .from("group_members")
      .select("*", { count: "exact", head: true })
      .eq("group_id", groupId)
      .eq("member_phone", phone);

    if (error) throw error;
    return count > 0;
  },

  /**
   * Check if user is owner of a group
   * @param {string} groupId - Group ID
   * @param {string} phone - User's phone number
   * @returns {Promise<boolean>}
   */
  async isOwner(groupId, phone) {
    const { count, error } = await supabase
      .from("group_members")
      .select("*", { count: "exact", head: true })
      .eq("group_id", groupId)
      .eq("member_phone", phone)
      .eq("role", "owner");

    if (error) throw error;
    return count > 0;
  },

  /**
   * Map database row to JS object
   * @private
   */
  _mapToJs(row) {
    return {
      groupId: row.group_id,
      phone: row.member_phone,
      role: row.role,
      joinedAt: new Date(row.joined_at),
    };
  },
};

/**
 * Shared Expenses operations
 */
export const SharedExpenseDB = {
  /**
   * Create a shared expense
   * @param {string} creatorPhone - Creator's phone number
   * @param {object} data - Expense data
   * @returns {Promise<object>} Created shared expense
   */
  async create(creatorPhone, data) {
    const { data: expense, error } = await supabase
      .from("shared_expenses")
      .insert([
        {
          group_id: data.groupId || null,
          creator_phone: creatorPhone,
          amount: data.amount,
          category: data.category,
          description: data.description || "",
          split_type: data.splitType || "equal",
        },
      ])
      .select()
      .single();

    if (error) throw error;
    return this._mapToJs(expense);
  },

  /**
   * Get a shared expense by ID
   * @param {number} expenseId - Expense ID
   * @returns {Promise<object|null>} Expense or null
   */
  async get(expenseId) {
    const { data, error } = await supabase
      .from("shared_expenses")
      .select("*")
      .eq("id", expenseId)
      .single();

    if (error && error.code !== "PGRST116") throw error;
    return data ? this._mapToJs(data) : null;
  },

  /**
   * Get shared expenses for a group
   * @param {string} groupId - Group ID
   * @returns {Promise<Array>} Group's shared expenses
   */
  async getByGroup(groupId) {
    const { data, error } = await supabase
      .from("shared_expenses")
      .select("*")
      .eq("group_id", groupId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return (data || []).map(this._mapToJs);
  },

  /**
   * Get shared expenses created by a user
   * @param {string} phone - User's phone number
   * @returns {Promise<Array>} User's created shared expenses
   */
  async getByCreator(phone) {
    const { data, error } = await supabase
      .from("shared_expenses")
      .select("*")
      .eq("creator_phone", phone)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return (data || []).map(this._mapToJs);
  },

  /**
   * Get shared expenses where user has a split
   * @param {string} phone - User's phone number
   * @returns {Promise<Array>} Expenses with user splits
   */
  async getByParticipant(phone) {
    const { data, error } = await supabase
      .from("expense_splits")
      .select("expense_id, shared_expenses(*)")
      .eq("member_phone", phone);

    if (error) throw error;
    return (data || [])
      .filter((s) => s.shared_expenses)
      .map((s) => this._mapToJs(s.shared_expenses));
  },

  /**
   * Delete a shared expense (cascades to splits via DB)
   * @param {number} expenseId - Expense ID
   * @returns {Promise<boolean>} True if deleted
   */
  async delete(expenseId) {
    const { error } = await supabase
      .from("shared_expenses")
      .delete()
      .eq("id", expenseId);

    if (error) throw error;
    return true;
  },

  /**
   * Map database row to JS object
   * @private
   */
  _mapToJs(row) {
    return {
      id: row.id,
      groupId: row.group_id,
      creatorPhone: row.creator_phone,
      amount: parseFloat(row.amount),
      category: row.category,
      description: row.description,
      splitType: row.split_type,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  },
};

/**
 * Expense Splits operations
 */
export const ExpenseSplitDB = {
  /**
   * Create splits for a shared expense
   * @param {number} expenseId - Expense ID
   * @param {Array} splits - Array of { phone, amount }
   * @returns {Promise<Array>} Created splits
   */
  async createMany(expenseId, splits) {
    const inserts = splits.map((s) => ({
      expense_id: expenseId,
      member_phone: s.phone,
      amount: s.amount,
      status: "pending",
    }));

    const { data, error } = await supabase
      .from("expense_splits")
      .insert(inserts)
      .select();

    if (error) throw error;
    return (data || []).map(this._mapToJs);
  },

  /**
   * Get splits for an expense
   * @param {number} expenseId - Expense ID
   * @returns {Promise<Array>} Expense splits
   */
  async getByExpense(expenseId) {
    const { data, error } = await supabase
      .from("expense_splits")
      .select("*")
      .eq("expense_id", expenseId);

    if (error) throw error;
    return (data || []).map(this._mapToJs);
  },

  /**
   * Get expense IDs where a user has a split
   * @param {string} phone - User's phone number
   * @returns {Promise<Array<number>>} Expense IDs
   */
  async getExpenseIdsByMember(phone) {
    const { data, error } = await supabase
      .from("expense_splits")
      .select("expense_id")
      .eq("member_phone", phone);

    if (error) throw error;
    return (data || []).map((s) => s.expense_id);
  },

  /**
   * Get all splits for a user (what they owe)
   * @param {string} phone - User's phone number
   * @param {string} status - Filter by status ('pending', 'paid', or null for all)
   * @returns {Promise<Array>} User's splits with expense info
   */
  async getByMember(phone, status = null) {
    let query = supabase
      .from("expense_splits")
      .select("*, shared_expenses(*)")
      .eq("member_phone", phone);

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;
    if (error) throw error;

    return (data || []).map((row) => ({
      ...this._mapToJs(row),
      expense: row.shared_expenses ? SharedExpenseDB._mapToJs(row.shared_expenses) : null,
    }));
  },

  /**
   * Mark a split as paid
   * @param {number} splitId - Split ID
   * @returns {Promise<object|null>} Updated split or null
   */
  async markPaid(splitId) {
    const { data, error } = await supabase
      .from("expense_splits")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("id", splitId)
      .select()
      .single();

    if (error && error.code !== "PGRST116") throw error;
    return data ? this._mapToJs(data) : null;
  },

  /**
   * Mark a split as paid by expense and member
   * @param {number} expenseId - Expense ID
   * @param {string} phone - Member's phone number
   * @returns {Promise<object|null>} Updated split or null
   */
  async markPaidByMember(expenseId, phone) {
    const { data, error } = await supabase
      .from("expense_splits")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("expense_id", expenseId)
      .eq("member_phone", phone)
      .select()
      .single();

    if (error && error.code !== "PGRST116") throw error;
    return data ? this._mapToJs(data) : null;
  },

  /**
   * Calculate balances between users
   * Returns who owes whom and how much
   * @param {string} phone - User's phone number
   * @returns {Promise<{owes: Array, owed: Array, netBalance: number}>}
   */
  async calculateBalances(phone) {
    // Get pending splits where user owes others
    const { data: owesData, error: owesError } = await supabase
      .from("expense_splits")
      .select("amount, shared_expenses(creator_phone)")
      .eq("member_phone", phone)
      .eq("status", "pending")
      .neq("shared_expenses.creator_phone", phone);

    if (owesError) throw owesError;

    // Get pending splits where others owe user
    const { data: owedData, error: owedError } = await supabase
      .from("expense_splits")
      .select("amount, member_phone, shared_expenses!inner(creator_phone)")
      .eq("shared_expenses.creator_phone", phone)
      .eq("status", "pending")
      .neq("member_phone", phone);

    if (owedError) throw owedError;

    // Aggregate owes
    const owesMap = new Map();
    for (const row of owesData || []) {
      if (row.shared_expenses?.creator_phone) {
        const creditor = row.shared_expenses.creator_phone;
        const current = owesMap.get(creditor) || 0;
        owesMap.set(creditor, current + parseFloat(row.amount));
      }
    }

    // Aggregate owed
    const owedMap = new Map();
    for (const row of owedData || []) {
      const debtor = row.member_phone;
      const current = owedMap.get(debtor) || 0;
      owedMap.set(debtor, current + parseFloat(row.amount));
    }

    // Calculate net balances
    const netBalances = new Map();
    for (const [creditor, amount] of owesMap.entries()) {
      netBalances.set(creditor, -(amount));
    }
    for (const [debtor, amount] of owedMap.entries()) {
      const current = netBalances.get(debtor) || 0;
      netBalances.set(debtor, current + amount);
    }

    // Format results
    const owesArray = [];
    const owedArray = [];
    let netBalance = 0;

    for (const [person, net] of netBalances.entries()) {
      if (net < 0) {
        owesArray.push({ phone: person, amount: Math.abs(net) });
        netBalance += net;
      } else if (net > 0) {
        owedArray.push({ phone: person, amount: net });
        netBalance += net;
      }
    }

    return { owes: owesArray, owed: owedArray, netBalance };
  },

  /**
   * Settle debt between two users
   * Marks all pending splits between them as paid
   * @param {string} payerPhone - Who is paying
   * @param {string} creditorPhone - Who is receiving
   * @returns {Promise<number>} Amount settled
   */
  async settleDebt(payerPhone, creditorPhone) {
    // Find all pending splits where payer owes creditor
    const { data: expenses, error: expError } = await supabase
      .from("shared_expenses")
      .select("id")
      .eq("creator_phone", creditorPhone);

    if (expError) throw expError;

    const expenseIds = (expenses || []).map((e) => e.id);
    if (expenseIds.length === 0) return 0;

    // Get pending splits for these expenses where payer is the member
    const { data: splits, error: splitError } = await supabase
      .from("expense_splits")
      .select("id, amount")
      .in("expense_id", expenseIds)
      .eq("member_phone", payerPhone)
      .eq("status", "pending");

    if (splitError) throw splitError;

    if (!splits || splits.length === 0) return 0;

    const splitIds = splits.map((s) => s.id);
    const totalSettled = splits.reduce((sum, s) => sum + parseFloat(s.amount), 0);

    // Mark all as paid
    const { error: updateError } = await supabase
      .from("expense_splits")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .in("id", splitIds);

    if (updateError) throw updateError;

    return totalSettled;
  },

  /**
   * Map database row to JS object
   * @private
   */
  _mapToJs(row) {
    return {
      id: row.id,
      expenseId: row.expense_id,
      memberPhone: row.member_phone,
      amount: parseFloat(row.amount),
      status: row.status,
      paidAt: row.paid_at ? new Date(row.paid_at) : null,
      createdAt: new Date(row.created_at),
    };
  },
};

export default {
  ExpenseGroupDB,
  GroupMemberDB,
  SharedExpenseDB,
  ExpenseSplitDB,
};
