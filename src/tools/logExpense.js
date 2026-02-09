/**
 * Tool: Log Expense
 * Records one or more expenses from user message
 */

import { ExpenseDB, BudgetDB, UserDB } from "../database/index.js";
import { validateAmount, formatAmount } from "../utils/currencyUtils.js";
import { getMessage } from "../utils/languageUtils.js";
import { checkLimit, trackUsage, getSubscriptionStatus, getLimitExceededMessage, getUpgradeMessage, USAGE_TYPES } from "../services/subscriptionService.js";

export const definition = {
  name: "log_expense",
  description: "Log one or more expenses. Use when user mentions spending money, purchases, payments, or costs. Examples: 'spent 50 on groceries', 'lunch was 15 dollars', 'uber 12, coffee 5'",
  input_schema: {
    type: "object",
    properties: {
      expenses: {
        type: "array",
        description: "List of expenses to log",
        items: {
          type: "object",
          properties: {
            amount: {
              type: "number",
              description: "The expense amount as a number"
            },
            category: {
              type: "string",
              description: "Category: food, transport, shopping, entertainment, bills, health, or other"
            },
            description: {
              type: "string",
              description: "Brief description of the expense"
            }
          },
          required: ["amount", "category"]
        }
      }
    },
    required: ["expenses"]
  }
};

export async function handler(phone, params, lang, userCurrency) {
  const { expenses } = params;

  if (!expenses || expenses.length === 0) {
    return { success: false, message: getMessage('expenses_none', lang) };
  }

  // Check if currency is set
  if (!userCurrency) {
    return { success: false, message: getMessage('currency_not_set', lang) };
  }

  // Check text message limit
  const limitCheck = await checkLimit(phone, USAGE_TYPES.TEXT);
  if (!limitCheck.allowed) {
    const status = await getSubscriptionStatus(phone);
    const limitMsg = getLimitExceededMessage(USAGE_TYPES.TEXT, lang, limitCheck);
    const upgradeMsg = getUpgradeMessage(status.plan.id, lang);
    return { success: false, message: `${limitMsg}\n\n${upgradeMsg}` };
  }

  // Validate all amounts first
  const validationErrors = [];
  for (const exp of expenses) {
    const validation = validateAmount(exp.amount, userCurrency);
    if (!validation.valid) {
      validationErrors.push(`• ${exp.description || exp.category}: ${validation.error}`);
    }
  }

  if (validationErrors.length > 0) {
    return {
      success: false,
      message: getMessage('validation_error_multi', lang) + validationErrors.join("\n")
    };
  }

  // Create all expenses
  const createdExpenses = [];
  const budgetAlerts = [];

  for (const exp of expenses) {
    const expense = await ExpenseDB.create(phone, {
      amount: exp.amount,
      category: exp.category,
      description: exp.description || "",
    });
    createdExpenses.push(expense);

    // Check budget alert for each category
    const budgetAlert = await checkBudgetAlert(phone, exp.category, userCurrency, lang);
    if (budgetAlert && !budgetAlerts.includes(budgetAlert)) {
      budgetAlerts.push(budgetAlert);
    }
  }

  // Track usage after successful logging
  await trackUsage(phone, USAGE_TYPES.TEXT);

  // Build response
  let response;
  if (createdExpenses.length === 1) {
    const expense = createdExpenses[0];
    response = `${getMessage('expense_logged', lang)} ${formatAmount(expense.amount, userCurrency)} ${getMessage('expense_for', lang)} ${expense.category}`;
    if (expense.description) {
      response += ` (${expense.description})`;
    }
  } else {
    response = getMessage('expense_logged_multi', lang, { count: createdExpenses.length }) + "\n";
    for (const expense of createdExpenses) {
      response += `• ${formatAmount(expense.amount, userCurrency)} - ${expense.category}`;
      if (expense.description) {
        response += ` (${expense.description})`;
      }
      response += "\n";
    }
  }

  if (budgetAlerts.length > 0) {
    response += `\n${budgetAlerts.join("\n")}`;
  }

  return { success: true, message: response };
}

/**
 * Check if expense triggers budget alert
 */
async function checkBudgetAlert(phone, category, userCurrency, lang) {
  const budget = await BudgetDB.getByCategory(phone, category);
  if (!budget) return null;

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const spent = await ExpenseDB.getTotalByCategory(phone, category, startOfMonth, endOfMonth);
  const percentage = (spent / parseFloat(budget.amount || 0)) * 100;

  if (percentage >= 100) {
    return getMessage('budget_alert_exceeded', lang, {
      category,
      spent: formatAmount(spent, userCurrency),
      budget: formatAmount(budget.amount, userCurrency)
    });
  } else if (percentage >= 80) {
    return getMessage('budget_alert_warning', lang, {
      percentage: percentage.toFixed(0),
      category
    });
  }

  return null;
}

export default { definition, handler };
