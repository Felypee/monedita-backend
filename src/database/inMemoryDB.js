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
  }
};

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
      createdAt: new Date()
    };
    
    const userExpenses = expenses.get(phone) || [];
    userExpenses.push(expense);
    expenses.set(phone, userExpenses);
    
    return expense;
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
