/**
 * Simple in-memory database for MVP
 * In production, replace with PostgreSQL/MongoDB
 */

// Store user data
const users = new Map();

// Store expenses
const expenses = new Map();

// Store budgets
const budgets = new Map();

// Store unprocessed cases
const unprocessedCases = [];

let expenseIdCounter = 1;
let budgetIdCounter = 1;
let unprocessedIdCounter = 1;

/**
 * User operations
 */
export const UserDB = {
  create(phone, data = {}) {
    const user = {
      phone,
      createdAt: new Date(),
      preferences: {},
      currency: null,
      language: null,
      setup_complete: false,
      setup_reminded: false,
      ...data
    };
    users.set(phone, user);
    return user;
  },

  get(phone) {
    return users.get(phone);
  },

  getOrCreate(phone) {
    return this.get(phone) || this.create(phone);
  },

  update(phone, data) {
    const user = users.get(phone);
    if (user) {
      Object.assign(user, data);
      users.set(phone, user);
    }
    return user;
  },

  all() {
    return Array.from(users.values());
  },

  setCurrency(phone, currency) {
    const user = users.get(phone);
    if (user) {
      user.currency = currency;
      users.set(phone, user);
    }
    return user;
  },

  getCurrency(phone) {
    const user = users.get(phone);
    return user ? user.currency : null;
  },

  setLanguage(phone, language) {
    const user = users.get(phone);
    if (user) {
      user.language = language;
      users.set(phone, user);
    }
    return user;
  },

  getLanguage(phone) {
    const user = users.get(phone);
    return user ? user.language : null;
  },

  setCategories(phone, categories) {
    const user = users.get(phone);
    if (user) {
      user.categories = categories;
      users.set(phone, user);
    }
    return user;
  },

  getCategories(phone) {
    const user = users.get(phone);
    return user ? user.categories || null : null;
  },

  setSetupComplete(phone, complete = true) {
    const user = users.get(phone);
    if (user) {
      user.setup_complete = complete;
      users.set(phone, user);
    }
    return user;
  },

  setSetupReminded(phone, reminded = true) {
    const user = users.get(phone);
    if (user) {
      user.setup_reminded = reminded;
      users.set(phone, user);
    }
    return user;
  },

  /**
   * Get silenced budget categories for a user
   * Returns array of { category, silenced_at } objects
   */
  getSilencedBudgetCategories(phone) {
    const user = users.get(phone);
    return user?.silenced_budget_categories || [];
  },

  /**
   * Silence budget prompt for a category (won't ask for 30 days)
   */
  silenceBudgetCategory(phone, category) {
    const user = users.get(phone);
    if (!user) return null;

    if (!user.silenced_budget_categories) {
      user.silenced_budget_categories = [];
    }

    // Remove old entry for this category if exists
    user.silenced_budget_categories = user.silenced_budget_categories.filter(
      s => s.category !== category.toLowerCase()
    );

    // Add new entry
    user.silenced_budget_categories.push({
      category: category.toLowerCase(),
      silenced_at: new Date().toISOString()
    });

    users.set(phone, user);
    return user;
  },

  /**
   * Remove silence for a category (used when budget is created)
   */
  unsilenceBudgetCategory(phone, category) {
    const user = users.get(phone);
    if (!user || !user.silenced_budget_categories) return user;

    user.silenced_budget_categories = user.silenced_budget_categories.filter(
      s => s.category !== category.toLowerCase()
    );

    users.set(phone, user);
    return user;
  },

  /**
   * Check if a category is currently silenced (within 30 days)
   */
  isCategorySilenced(phone, category) {
    const silenced = this.getSilencedBudgetCategories(phone);
    const entry = silenced.find(s => s.category === category.toLowerCase());

    if (!entry) return false;

    const daysSinceSilenced = (Date.now() - new Date(entry.silenced_at).getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceSilenced < 30;
  },

  /**
   * Clean up old silenced entries (older than 30 days)
   */
  cleanupSilencedCategories(phone) {
    const user = users.get(phone);
    if (!user || !user.silenced_budget_categories) return [];

    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);

    user.silenced_budget_categories = user.silenced_budget_categories.filter(s => {
      const silencedAt = new Date(s.silenced_at).getTime();
      return silencedAt > thirtyDaysAgo;
    });

    users.set(phone, user);
    return user.silenced_budget_categories;
  }
};

import { getDayKey, getWeekKey, getMonthKey } from '../utils/dateUtils.js';

/**
 * Expense operations
 */
export const ExpenseDB = {
  create(phone, expenseData) {
    const expense = {
      id: expenseIdCounter++,
      phone,
      amount: expenseData.amount,
      category: expenseData.category || 'uncategorized',
      description: expenseData.description || '',
      date: expenseData.date || new Date(),
      source: expenseData.source || 'manual',
      external_id: expenseData.external_id || null,
      createdAt: new Date()
    };

    const userExpenses = expenses.get(phone) || [];
    userExpenses.push(expense);
    expenses.set(phone, userExpenses);

    return expense;
  },

  getByExternalId(phone, externalId) {
    const userExpenses = expenses.get(phone) || [];
    return userExpenses.find(e => e.external_id === externalId);
  },

  /**
   * Find duplicate expense by amount, date (±24h), and similar description
   */
  findDuplicate(phone, { amount, date, description }) {
    const userExpenses = expenses.get(phone) || [];
    const targetDate = new Date(date);
    const dayBefore = new Date(targetDate.getTime() - 24 * 60 * 60 * 1000);
    const dayAfter = new Date(targetDate.getTime() + 24 * 60 * 60 * 1000);

    const matches = userExpenses.filter(e => {
      const expDate = new Date(e.date);
      return e.amount === amount && expDate >= dayBefore && expDate <= dayAfter;
    });

    if (matches.length === 0) return null;

    if (description) {
      const normalizedDesc = description.toLowerCase().trim();
      const match = matches.find(e =>
        e.description && e.description.toLowerCase().trim().includes(normalizedDesc.substring(0, 10))
      );
      if (match) return match;
    }

    return matches[0];
  },

  getByUser(phone) {
    return expenses.get(phone) || [];
  },

  getById(phone, id) {
    const userExpenses = expenses.get(phone) || [];
    return userExpenses.find(e => e.id === id);
  },

  getByDateRange(phone, startDate, endDate) {
    const userExpenses = expenses.get(phone) || [];
    return userExpenses.filter(e => {
      const expenseDate = new Date(e.date);
      return expenseDate >= startDate && expenseDate <= endDate;
    });
  },

  delete(phone, id) {
    const userExpenses = expenses.get(phone) || [];
    const filtered = userExpenses.filter(e => e.id !== id);
    expenses.set(phone, filtered);
    return filtered.length < userExpenses.length;
  },

  update(phone, id, updates) {
    const userExpenses = expenses.get(phone) || [];
    const expense = userExpenses.find(e => e.id === id);
    if (expense) {
      Object.assign(expense, updates);
      expenses.set(phone, userExpenses);
      return expense;
    }
    return null;
  },

  getTotalByCategory(phone, category, startDate, endDate) {
    const userExpenses = this.getByDateRange(phone, startDate, endDate);
    return userExpenses
      .filter(e => e.category === category)
      .reduce((sum, e) => sum + e.amount, 0);
  },

  renameCategory(phone, oldName, newName) {
    const userExpenses = expenses.get(phone) || [];
    let count = 0;
    for (const expense of userExpenses) {
      if (expense.category === oldName) {
        expense.category = newName;
        count++;
      }
    }
    return count;
  },

  getCategorySummary(phone, startDate, endDate) {
    const userExpenses = this.getByDateRange(phone, startDate, endDate);
    const summary = {};

    userExpenses.forEach(e => {
      if (!summary[e.category]) {
        summary[e.category] = { total: 0, count: 0 };
      }
      summary[e.category].total += e.amount;
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
   * @returns {object} { expenses, total, hasMore } or { summary, byGroup } if aggregate
   */
  getByFilter(phone, filters = {}, options = {}) {
    let userExpenses = expenses.get(phone) || [];

    // Apply filters
    const {
      startDate = null,
      endDate = null,
      category = null,
      categories = null,
      minAmount = null,
      maxAmount = null,
      searchText = null
    } = filters;

    // Date filter
    if (startDate) {
      userExpenses = userExpenses.filter(e => new Date(e.date) >= startDate);
    }
    if (endDate) {
      userExpenses = userExpenses.filter(e => new Date(e.date) <= endDate);
    }

    // Category filter
    if (category) {
      const catLower = category.toLowerCase();
      userExpenses = userExpenses.filter(e => e.category.toLowerCase() === catLower);
    } else if (categories && categories.length > 0) {
      const catsLower = categories.map(c => c.toLowerCase());
      userExpenses = userExpenses.filter(e => catsLower.includes(e.category.toLowerCase()));
    }

    // Amount filter
    if (minAmount !== null) {
      userExpenses = userExpenses.filter(e => e.amount >= minAmount);
    }
    if (maxAmount !== null) {
      userExpenses = userExpenses.filter(e => e.amount <= maxAmount);
    }

    // Text search in description
    if (searchText) {
      const searchLower = searchText.toLowerCase();
      userExpenses = userExpenses.filter(e =>
        (e.description && e.description.toLowerCase().includes(searchLower)) ||
        (e.category && e.category.toLowerCase().includes(searchLower))
      );
    }

    // Parse options
    const {
      sortBy = 'date',
      sortOrder = 'desc',
      limit = 50,
      offset = 0,
      aggregate = false,
      groupBy = null
    } = options;

    // If aggregate mode, compute summary
    if (aggregate) {
      return this._computeAggregate(userExpenses, groupBy);
    }

    // Sort
    const sortedExpenses = [...userExpenses].sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'amount':
          comparison = a.amount - b.amount;
          break;
        case 'category':
          comparison = a.category.localeCompare(b.category);
          break;
        case 'date':
        default:
          comparison = new Date(a.date) - new Date(b.date);
          break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    // Pagination
    const effectiveLimit = Math.min(limit, 100);
    const paginatedExpenses = sortedExpenses.slice(offset, offset + effectiveLimit);

    return {
      expenses: paginatedExpenses,
      total: sortedExpenses.length,
      hasMore: offset + effectiveLimit < sortedExpenses.length
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
    const total = expenses.reduce((sum, e) => sum + e.amount, 0);
    const count = expenses.length;
    const amounts = expenses.map(e => e.amount);

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
      groups[key].total += expense.amount;
      groups[key].count += 1;
      groups[key].expenses.push(expense);
    }

    // Calculate average for each group
    for (const key of Object.keys(groups)) {
      groups[key].average = groups[key].total / groups[key].count;
    }

    return { summary, byGroup: groups };
  }
};

/**
 * Budget operations
 */
export const BudgetDB = {
  create(phone, budgetData) {
    const budget = {
      id: budgetIdCounter++,
      phone,
      category: budgetData.category,
      amount: budgetData.amount,
      period: budgetData.period || 'monthly', // weekly, monthly, yearly
      createdAt: new Date()
    };
    
    const userBudgets = budgets.get(phone) || [];
    userBudgets.push(budget);
    budgets.set(phone, userBudgets);
    
    return budget;
  },

  getByUser(phone) {
    return budgets.get(phone) || [];
  },

  getByCategory(phone, category) {
    const userBudgets = budgets.get(phone) || [];
    return userBudgets.find(b => b.category === category);
  },

  update(phone, category, amount) {
    const userBudgets = budgets.get(phone) || [];
    const budget = userBudgets.find(b => b.category === category);
    
    if (budget) {
      budget.amount = amount;
      budgets.set(phone, userBudgets);
    }
    
    return budget;
  },

  delete(phone, category) {
    const userBudgets = budgets.get(phone) || [];
    const filtered = userBudgets.filter(b => b.category !== category);
    budgets.set(phone, filtered);
    return filtered.length < userBudgets.length;
  },

  renameCategory(phone, oldName, newName) {
    const userBudgets = budgets.get(phone) || [];
    let count = 0;
    for (const budget of userBudgets) {
      if (budget.category === oldName) {
        budget.category = newName;
        count++;
      }
    }
    return count;
  }
};

/**
 * Unprocessed cases — messages the system couldn't handle
 */
export const UnprocessedDB = {
  create(phone, caseData) {
    const entry = {
      id: unprocessedIdCounter++,
      phone,
      type: caseData.type,           // 'text', 'image', 'audio'
      content: caseData.content || null,       // message text or transcription
      media_id: caseData.media_id || null,     // WhatsApp media ID
      reason: caseData.reason || 'unknown',    // 'no_expense_detected', 'processing_error', etc.
      raw_result: caseData.raw_result || null,  // partial AI response
      resolved: false,
      createdAt: new Date()
    };
    unprocessedCases.push(entry);
    return entry;
  },

  getAll() {
    return unprocessedCases.filter(c => !c.resolved);
  },

  getByPhone(phone) {
    return unprocessedCases.filter(c => c.phone === phone && !c.resolved);
  },

  resolve(id) {
    const entry = unprocessedCases.find(c => c.id === id);
    if (entry) {
      entry.resolved = true;
    }
    return entry;
  }
};
