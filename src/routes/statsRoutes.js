/**
 * Stats Routes - API endpoints for the stats page
 * Protected by JWT token authentication
 */

import express from 'express';
import { validateStatsToken } from '../services/statsTokenService.js';
import { ExpenseDB, BudgetDB, UserDB } from '../database/index.js';
import { getSubscriptionStatus } from '../services/subscriptionService.js';
import { formatAmount } from '../utils/currencyUtils.js';

const router = express.Router();

/**
 * Middleware to validate stats token
 */
function requireStatsToken(req, res, next) {
  const token = req.query.token || req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'Token required' });
  }

  const validation = validateStatsToken(token);

  if (!validation.valid) {
    return res.status(401).json({ error: validation.error });
  }

  req.userPhone = validation.phone;
  next();
}

/**
 * GET /api/stats
 * Get user stats with optional date filters
 * Query params: filter (today, yesterday, week, month, custom), startDate, endDate
 */
router.get('/api/stats', requireStatsToken, async (req, res) => {
  try {
    const phone = req.userPhone;
    const { filter = 'month' } = req.query;

    // Get user info
    const user = await UserDB.get(phone);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get subscription status
    const subscription = await getSubscriptionStatus(phone);

    // Calculate date range based on filter
    const { startDate, endDate } = getDateRange(filter, req.query, subscription.plan.id);

    // Get expenses in date range
    const expenses = await ExpenseDB.getByDateRange(phone, startDate, endDate) || [];

    // Get budgets
    const budgets = await BudgetDB.getByUser(phone) || [];

    // Calculate stats
    const totalSpent = expenses.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);

    // Group by category
    const byCategory = {};
    for (const expense of expenses) {
      const cat = expense.category || 'other';
      if (!byCategory[cat]) {
        byCategory[cat] = { total: 0, count: 0, expenses: [] };
      }
      byCategory[cat].total += parseFloat(expense.amount || 0);
      byCategory[cat].count++;
      byCategory[cat].expenses.push(expense);
    }

    // Group by day for chart
    const byDay = {};
    for (const expense of expenses) {
      const day = new Date(expense.createdAt).toISOString().split('T')[0];
      if (!byDay[day]) {
        byDay[day] = 0;
      }
      byDay[day] += parseFloat(expense.amount || 0);
    }

    // Calculate budget progress
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const budgetProgress = [];
    for (const budget of budgets) {
      const categoryExpenses = await ExpenseDB.getTotalByCategory(phone, budget.category, monthStart, monthEnd);
      budgetProgress.push({
        category: budget.category,
        budgetAmount: parseFloat(budget.amount),
        spent: categoryExpenses,
        percentage: Math.round((categoryExpenses / parseFloat(budget.amount)) * 100),
      });
    }

    res.json({
      user: {
        name: user.name || 'Usuario',
        currency: user.currency || 'COP',
        plan: subscription.plan.name,
        moneditas: {
          used: subscription.usage.text || 0,
          limit: subscription.limits.text,
          remaining: subscription.limits.text === -1 ? -1 : subscription.limits.text - (subscription.usage.text || 0),
        },
      },
      filter: {
        type: filter,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
      stats: {
        totalSpent,
        expenseCount: expenses.length,
        averageExpense: expenses.length > 0 ? totalSpent / expenses.length : 0,
      },
      byCategory: Object.entries(byCategory).map(([category, data]) => ({
        category,
        total: data.total,
        count: data.count,
        percentage: totalSpent > 0 ? Math.round((data.total / totalSpent) * 100) : 0,
      })).sort((a, b) => b.total - a.total),
      byDay: Object.entries(byDay).map(([date, total]) => ({ date, total })).sort((a, b) => a.date.localeCompare(b.date)),
      budgets: budgetProgress,
      recentExpenses: expenses
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 20)
        .map(e => ({
          id: e.id,
          amount: parseFloat(e.amount),
          category: e.category,
          description: e.description,
          date: e.createdAt,
        })),
    });
  } catch (error) {
    console.error('[statsRoutes] Error getting stats:', error);
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

/**
 * Calculate date range based on filter type and subscription plan
 */
function getDateRange(filter, query, planId) {
  const now = new Date();
  let startDate, endDate;

  // Set end date to end of today
  endDate = new Date(now);
  endDate.setHours(23, 59, 59, 999);

  switch (filter) {
    case 'today':
      startDate = new Date(now);
      startDate.setHours(0, 0, 0, 0);
      break;

    case 'yesterday':
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 1);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(startDate);
      endDate.setHours(23, 59, 59, 999);
      break;

    case 'week':
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 7);
      startDate.setHours(0, 0, 0, 0);
      break;

    case 'month':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      break;

    case 'last_month':
      // Only available for Basic and Premium
      if (planId === 'free') {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      } else {
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), 0);
        endDate.setHours(23, 59, 59, 999);
      }
      break;

    case '6months':
      // Only available for Basic and Premium
      if (planId === 'free') {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      } else {
        startDate = new Date(now);
        startDate.setMonth(startDate.getMonth() - 6);
        startDate.setHours(0, 0, 0, 0);
      }
      break;

    case 'year':
      // Only available for Premium
      if (planId !== 'premium') {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      } else {
        startDate = new Date(now);
        startDate.setFullYear(startDate.getFullYear() - 1);
        startDate.setHours(0, 0, 0, 0);
      }
      break;

    case 'custom':
      // Only available for Premium
      if (planId === 'premium' && query.startDate && query.endDate) {
        startDate = new Date(query.startDate);
        endDate = new Date(query.endDate);
        endDate.setHours(23, 59, 59, 999);
      } else {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      }
      break;

    default:
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  return { startDate, endDate };
}

export default router;
