/**
 * Tool: Show Summary
 * Shows spending summary for the current month
 */

import { ExpenseDB, BudgetDB, UserDB } from "../database/index.js";
import { formatAmount } from "../utils/currencyUtils.js";
import { getMessage } from "../utils/languageUtils.js";

export const definition = {
  name: "show_summary",
  description: "Show spending summary and financial status for current month. Use when user asks about their spending, status, overview, or 'how am I doing'. Examples: 'show summary', 'how am I doing', 'my spending', 'status'",
  input_schema: {
    type: "object",
    properties: {},
    required: []
  }
};

export async function handler(phone, params, lang, userCurrency) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const expenses = (await ExpenseDB.getByDateRange(phone, startOfMonth, endOfMonth)) || [];
  const categorySummary = (await ExpenseDB.getCategorySummary(phone, startOfMonth, endOfMonth)) || {};
  const budgets = (await BudgetDB.getByUser(phone)) || [];

  const totalSpent = expenses.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
  const totalBudget = budgets.reduce((sum, b) => sum + parseFloat(b.amount || 0), 0);

  const locale = lang === 'es' ? 'es' : lang === 'pt' ? 'pt' : 'en';
  const monthName = now.toLocaleString(locale, { month: "long" });

  let response = getMessage('summary_title', lang, { month: monthName }) + "\n\n";
  response += `${getMessage('summary_total_spent', lang)} ${formatAmount(totalSpent, userCurrency)}\n`;

  if (totalBudget > 0) {
    response += `${getMessage('summary_total_budget', lang)} ${formatAmount(totalBudget, userCurrency)}\n`;
    response += `${getMessage('summary_remaining', lang)} ${formatAmount(totalBudget - totalSpent, userCurrency)}\n\n`;
  }

  response += `${getMessage('summary_by_category', lang)}\n`;
  const sortedCategories = Object.entries(categorySummary).sort((a, b) => b[1].total - a[1].total);

  for (const [category, data] of sortedCategories) {
    response += `• ${category}: ${formatAmount(data.total, userCurrency)} (${data.count} ${getMessage('summary_expenses', lang)})\n`;
  }

  if (sortedCategories.length === 0) {
    response += getMessage('expenses_none', lang);
  }

  return { success: true, message: response };
}

export default { definition, handler };
