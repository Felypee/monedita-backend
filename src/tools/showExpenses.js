/**
 * Tool: Show Expenses
 * Lists recent expenses with optional filtering
 */

import { ExpenseDB } from "../database/index.js";
import { formatAmount } from "../utils/currencyUtils.js";
import { getMessage } from "../utils/languageUtils.js";
import { resolveDateRange, getPeriodLabel } from "../utils/dateUtils.js";

export const definition = {
  name: "show_expenses",
  description: "Show recent expenses list with optional filtering. Use when user asks to see their expenses, transactions, or purchase history. Examples: 'show expenses', 'list expenses', 'my transactions', 'what did I spend on', 'gastos de hoy', 'gastos de esta semana', 'gastos en comida'",
  input_schema: {
    type: "object",
    properties: {
      limit: {
        type: "number",
        description: "Number of expenses to show (default 10, max 50)"
      },
      period: {
        type: "string",
        enum: ["today", "yesterday", "this_week", "last_week", "this_month", "last_month"],
        description: "Time period filter for expenses"
      },
      category: {
        type: "string",
        description: "Filter expenses by category (e.g., 'food', 'transport', 'comida')"
      },
      sortBy: {
        type: "string",
        enum: ["date", "amount"],
        description: "Sort expenses by date or amount (default: date)"
      },
      sortOrder: {
        type: "string",
        enum: ["asc", "desc"],
        description: "Sort order: ascending or descending (default: desc for newest first)"
      }
    },
    required: []
  }
};

export async function handler(phone, params, lang, userCurrency) {
  const {
    limit = 10,
    period = null,
    category = null,
    sortBy = 'date',
    sortOrder = 'desc'
  } = params;

  // Build filters
  const filters = {};
  const options = {
    sortBy,
    sortOrder,
    limit: Math.min(limit, 50)
  };

  // Resolve date range if period is specified
  if (period) {
    const { startDate, endDate } = resolveDateRange(period, null, null);
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;
  }

  // Category filter
  if (category) {
    filters.category = category;
  }

  // Check if getByFilter exists, otherwise fall back to legacy behavior
  let expenses;
  let total;

  if (typeof ExpenseDB.getByFilter === 'function') {
    const result = await ExpenseDB.getByFilter(phone, filters, options);
    expenses = result.expenses;
    total = result.total;
  } else {
    // Legacy fallback for backward compatibility
    expenses = (await ExpenseDB.getByUser(phone)).slice(-limit).reverse();
    total = expenses.length;
  }

  if (!expenses || expenses.length === 0) {
    if (period || category) {
      return {
        success: true,
        message: getLocalizedMessage('expenses_none_filtered', lang, {
          period: period ? getPeriodLabel(period, lang) : '',
          category: category || ''
        })
      };
    }
    return { success: true, message: getMessage('expenses_none', lang) };
  }

  const locale = lang === 'es' ? 'es-CO' : lang === 'pt' ? 'pt-BR' : 'en-US';

  // Build title
  let title = getMessage('expenses_title', lang);
  if (period) {
    title += ` - ${getPeriodLabel(period, lang)}`;
  }
  if (category) {
    title += ` (${category})`;
  }

  let response = `${title}\n\n`;

  // Calculate total for displayed expenses
  let displayedTotal = 0;

  for (const expense of expenses) {
    const date = new Date(expense.date);
    const dateStr = date.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
    const timeStr = date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });

    response += `#${expense.id} • ${formatAmount(expense.amount, userCurrency)} - ${expense.category}`;
    if (expense.description) {
      response += ` (${expense.description})`;
    }
    response += ` - ${dateStr} ${timeStr}\n`;

    displayedTotal += parseFloat(expense.amount);
  }

  // Add total
  response += `\n${getLocalizedMessage('total', lang)}: ${formatAmount(displayedTotal, userCurrency)}`;

  // Show if there are more
  if (total > expenses.length) {
    response += `\n${getLocalizedMessage('showing_of', lang, { showing: expenses.length, total })}`;
  }

  return { success: true, message: response };
}

function getLocalizedMessage(key, lang, params = {}) {
  const messages = {
    en: {
      total: 'Total',
      showing_of: 'Showing {showing} of {total}',
      expenses_none_filtered: 'No expenses found{period}{category}.',
    },
    es: {
      total: 'Total',
      showing_of: 'Mostrando {showing} de {total}',
      expenses_none_filtered: 'No se encontraron gastos{period}{category}.',
    },
    pt: {
      total: 'Total',
      showing_of: 'Mostrando {showing} de {total}',
      expenses_none_filtered: 'Nenhuma despesa encontrada{period}{category}.',
    }
  };

  const langMessages = messages[lang] || messages.en;
  let message = langMessages[key] || messages.en[key] || key;

  for (const [param, value] of Object.entries(params)) {
    if (value) {
      message = message.replace(`{${param}}`, ` ${value}`);
    } else {
      message = message.replace(`{${param}}`, '');
    }
  }

  return message;
}

export default { definition, handler };
