/**
 * Tool: Show Expenses
 * Lists recent expenses
 */

import { ExpenseDB, UserDB } from "../database/index.js";
import { formatAmount } from "../utils/currencyUtils.js";
import { getMessage } from "../utils/languageUtils.js";

export const definition = {
  name: "show_expenses",
  description: "Show recent expenses list. Use when user asks to see their expenses, transactions, or purchase history. Examples: 'show expenses', 'list expenses', 'my transactions', 'what did I spend on'",
  input_schema: {
    type: "object",
    properties: {
      limit: {
        type: "number",
        description: "Number of expenses to show (default 10)"
      }
    },
    required: []
  }
};

export async function handler(phone, params, lang, userCurrency) {
  const limit = params.limit || 10;
  const expenses = (await ExpenseDB.getByUser(phone)).slice(-limit).reverse();

  if (expenses.length === 0) {
    return { success: true, message: getMessage('expenses_none', lang) };
  }

  const locale = lang === 'es' ? 'es' : lang === 'pt' ? 'pt' : 'en';
  let response = `${getMessage('expenses_title', lang)}\n\n`;

  for (const expense of expenses) {
    const date = new Date(expense.date).toLocaleDateString(locale);
    response += `#${expense.id} • ${formatAmount(expense.amount, userCurrency)} - ${expense.category}`;
    if (expense.description) {
      response += ` (${expense.description})`;
    }
    response += ` - ${date}\n`;
  }

  return { success: true, message: response };
}

export default { definition, handler };
