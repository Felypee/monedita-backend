/**
 * Tool: Show Budgets
 * Lists all user budgets with spending progress
 */

import { ExpenseDB, BudgetDB, UserDB } from "../database/index.js";
import { formatAmount } from "../utils/currencyUtils.js";
import { getMessage } from "../utils/languageUtils.js";

export const definition = {
  name: "show_budgets",
  description: "Show all budgets with current spending progress. Use when user asks to see their budgets, budget status, or budget list. Examples: 'show budgets', 'my budgets', 'budget status'",
  input_schema: {
    type: "object",
    properties: {},
    required: []
  }
};

export async function handler(phone, params, lang, userCurrency) {
  const budgets = (await BudgetDB.getByUser(phone)) || [];

  if (budgets.length === 0) {
    return { success: true, message: getMessage('budget_none', lang) };
  }

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const locale = lang === 'es' ? 'es' : lang === 'pt' ? 'pt' : 'en';
  const monthName = now.toLocaleString(locale, { month: "long" });

  let response = `${getMessage('budget_title', lang)} (${monthName})\n\n`;

  for (const budget of budgets) {
    const spent = await ExpenseDB.getTotalByCategory(phone, budget.category, startOfMonth, endOfMonth);
    const remaining = budget.amount - spent;
    const percentage = ((spent / parseFloat(budget.amount || 1)) * 100).toFixed(0);

    response += `*${budget.category}*\n`;
    response += `${getMessage('budget_label', lang)} ${formatAmount(budget.amount, userCurrency)} | ${getMessage('budget_spent', lang)} ${formatAmount(spent, userCurrency)} (${percentage}%)\n`;
    response += `${getMessage('budget_remaining', lang)} ${formatAmount(remaining, userCurrency)}\n`;
    response += `${getProgressBar(percentage)}\n\n`;
  }

  return { success: true, message: response };
}

function getProgressBar(percentage) {
  const filled = Math.min(Math.floor(percentage / 10), 10);
  const empty = 10 - filled;
  return "█".repeat(filled) + "░".repeat(empty);
}

export default { definition, handler };
