/**
 * Tool: Show Expenses
 * Redirects user to the visual stats page with a magic link
 */

import { ExpenseDB } from "../database/index.js";
import { formatAmount } from "../utils/currencyUtils.js";
import { getMessage } from "../utils/languageUtils.js";
import { resolveDateRange, getPeriodLabel } from "../utils/dateUtils.js";
import { generateStatsUrl, getTokenExpiryDescription } from "../services/statsTokenService.js";

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

  // Calculate total for displayed expenses
  const displayedTotal = expenses.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);

  // Generate stats URL
  const statsUrl = generateStatsUrl(phone);
  const expiryTime = getTokenExpiryDescription();

  // Build teaser with period/category info
  let periodLabel = '';
  if (period) {
    periodLabel = getPeriodLabel(period, lang);
  }

  const messages = {
    en: buildMessage('en', expenses.length, total, displayedTotal, userCurrency, periodLabel, category, statsUrl, expiryTime),
    es: buildMessage('es', expenses.length, total, displayedTotal, userCurrency, periodLabel, category, statsUrl, expiryTime),
    pt: buildMessage('pt', expenses.length, total, displayedTotal, userCurrency, periodLabel, category, statsUrl, expiryTime)
  };

  return { success: true, message: messages[lang] || messages.es };
}

function buildMessage(lang, count, total, amount, currency, period, category, url, expiry) {
  const formattedAmount = formatAmount(amount, currency);

  const labels = {
    en: {
      title: '📝 *Your expenses*',
      total: 'Total',
      expenses: 'expenses',
      viewComplete: 'View complete details with charts and filters',
      linkValid: 'This link is valid for'
    },
    es: {
      title: '📝 *Tus gastos*',
      total: 'Total',
      expenses: 'gastos',
      viewComplete: 'Ve el detalle completo con gráficos y filtros',
      linkValid: 'Este link es válido por'
    },
    pt: {
      title: '📝 *Suas despesas*',
      total: 'Total',
      expenses: 'despesas',
      viewComplete: 'Veja os detalhes completos com gráficos e filtros',
      linkValid: 'Este link é válido por'
    }
  };

  const l = labels[lang] || labels.es;

  let title = l.title;
  if (period) {
    title += ` - ${period}`;
  }
  if (category) {
    title += ` (${category})`;
  }

  let showing = '';
  if (total > count) {
    const showingLabels = {
      en: `(showing ${count} of ${total})`,
      es: `(mostrando ${count} de ${total})`,
      pt: `(mostrando ${count} de ${total})`
    };
    showing = ` ${showingLabels[lang] || showingLabels.es}`;
  }

  return `${title}

💰 ${l.total}: ${formattedAmount} (${count} ${l.expenses})${showing}

${l.viewComplete}:

${url}

${l.linkValid} ${expiry}.`;
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
