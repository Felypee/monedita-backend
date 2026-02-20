/**
 * Tool: Log Expense
 * Records one or more expenses from user message
 */

import { ExpenseDB, BudgetDB, UserDB } from "../database/index.js";
import { validateAmount, formatAmount } from "../utils/currencyUtils.js";
import { getMessage } from "../utils/languageUtils.js";
import { generateSetupUrl } from "../services/statsTokenService.js";

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

  // Note: Usage is tracked in messageHandler.js before calling the agent
  // No need to check/track here to avoid double charging

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

  // Usage already tracked in messageHandler.js

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

  // Determine sticker based on budget status
  let sticker = 'money'; // Default for expense logged
  if (budgetAlerts.length > 0) {
    response += `\n${budgetAlerts.join("\n")}`;
    // Check if any alert is "exceeded" (100%+)
    const hasExceeded = budgetAlerts.some(a => a.includes('100%') || a.includes('exceeded') || a.includes('excediste'));
    sticker = hasExceeded ? 'sad' : 'warning';
  }

  // Check if this is a good time to show setup reminder
  const setupReminder = await getSetupReminder(phone, lang);
  if (setupReminder) {
    response += `\n\n${setupReminder}`;
  }

  return { success: true, message: response, sticker };
}

/**
 * Get setup reminder message if user hasn't completed setup
 * Only shows once after first few expenses
 */
async function getSetupReminder(phone, lang) {
  try {
    const user = await UserDB.get(phone);
    if (!user) return null;

    // Don't show if already completed setup or already reminded
    if (user.setup_complete || user.setup_reminded) return null;

    // Count user's expenses - only show reminder after 2-3 expenses
    const expenses = await ExpenseDB.getByUser(phone);
    if (expenses.length < 2 || expenses.length > 5) return null;

    // Mark as reminded so we don't show again
    await UserDB.setSetupReminded(phone, true);

    const setupUrl = generateSetupUrl(phone);

    const messages = {
      en: `💡 *Tip:* Set up your categories and budgets:\n${setupUrl}`,
      es: `💡 *Tip:* Configura tus categorías y presupuestos:\n${setupUrl}`,
      pt: `💡 *Dica:* Configure suas categorias e orçamentos:\n${setupUrl}`,
    };

    return messages[lang] || messages.en;
  } catch (error) {
    console.error('[logExpense] Error checking setup reminder:', error);
    return null;
  }
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
