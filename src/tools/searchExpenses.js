/**
 * Tool: Search Expenses
 * Advanced expense search with filters, aggregations, and sorting
 */

import { ExpenseDB } from "../database/index.js";
import { formatAmount } from "../utils/currencyUtils.js";
import { resolveDateRange, getPeriodLabel, formatDateRange } from "../utils/dateUtils.js";

export const definition = {
  name: "search_expenses",
  description: "Advanced expense search with filters, aggregations, and sorting. Use for complex queries like totals, averages, amount ranges, text search, date ranges. Examples: 'how much did I spend this month', 'total by category', 'expenses over 100', 'search uber', 'average spending this week', 'cuanto gaste en comida la semana pasada', 'gasto promedio'",
  input_schema: {
    type: "object",
    properties: {
      // Time filters
      period: {
        type: "string",
        enum: ["today", "yesterday", "this_week", "last_week", "this_month", "last_month", "last_7_days", "last_30_days"],
        description: "Time period filter"
      },
      startDate: {
        type: "string",
        description: "Start date in YYYY-MM-DD format for custom date range"
      },
      endDate: {
        type: "string",
        description: "End date in YYYY-MM-DD format for custom date range"
      },
      // Category filters
      category: {
        type: "string",
        description: "Filter by single category"
      },
      categories: {
        type: "array",
        items: { type: "string" },
        description: "Filter by multiple categories (OR logic)"
      },
      // Amount filters
      minAmount: {
        type: "number",
        description: "Minimum amount filter (>=)"
      },
      maxAmount: {
        type: "number",
        description: "Maximum amount filter (<=)"
      },
      // Text search
      searchText: {
        type: "string",
        description: "Search text in expense descriptions"
      },
      // Aggregation
      aggregate: {
        type: "boolean",
        description: "Return totals/summary instead of expense list (default: false)"
      },
      groupBy: {
        type: "string",
        enum: ["category", "day", "week", "month"],
        description: "Group results by category, day, week, or month"
      },
      // Sorting and pagination
      sortBy: {
        type: "string",
        enum: ["date", "amount", "category"],
        description: "Sort field (default: date)"
      },
      sortOrder: {
        type: "string",
        enum: ["asc", "desc"],
        description: "Sort order (default: desc)"
      },
      limit: {
        type: "number",
        description: "Maximum number of results (default: 50, max: 100)"
      }
    },
    required: []
  }
};

export async function handler(phone, params, lang, userCurrency) {
  const {
    period = null,
    startDate = null,
    endDate = null,
    category = null,
    categories = null,
    minAmount = null,
    maxAmount = null,
    searchText = null,
    aggregate = false,
    groupBy = null,
    sortBy = 'date',
    sortOrder = 'desc',
    limit = 50
  } = params;

  // Build filters
  const filters = {};

  // Resolve date range
  const dateRange = resolveDateRange(period, startDate, endDate);
  if (dateRange.startDate) filters.startDate = dateRange.startDate;
  if (dateRange.endDate) filters.endDate = dateRange.endDate;

  // Category filters
  if (category) filters.category = category;
  if (categories && categories.length > 0) filters.categories = categories;

  // Amount filters
  if (minAmount !== null) filters.minAmount = minAmount;
  if (maxAmount !== null) filters.maxAmount = maxAmount;

  // Text search
  if (searchText) filters.searchText = searchText;

  // Build options
  const options = {
    sortBy,
    sortOrder,
    limit: Math.min(limit, 100),
    aggregate: aggregate || groupBy !== null, // Enable aggregate if groupBy is set
    groupBy
  };

  try {
    const result = await ExpenseDB.getByFilter(phone, filters, options);

    // Format response based on aggregate mode
    if (options.aggregate) {
      return formatAggregateResponse(result, filters, params, lang, userCurrency);
    } else {
      return formatListResponse(result, filters, params, lang, userCurrency);
    }
  } catch (error) {
    console.error('[searchExpenses] Error:', error);
    return {
      success: false,
      message: getLocalizedMessage('error_searching', lang)
    };
  }
}

/**
 * Format aggregate/summary response
 */
function formatAggregateResponse(result, filters, params, lang, userCurrency) {
  const { summary, byGroup } = result;
  const { period, groupBy, category, categories, minAmount, maxAmount, searchText } = params;

  if (summary.count === 0) {
    return {
      success: true,
      message: getLocalizedMessage('no_results', lang)
    };
  }

  const locale = lang === 'es' ? 'es-CO' : lang === 'pt' ? 'pt-BR' : 'en-US';

  // Build title
  let title = getLocalizedMessage('summary_title', lang);
  if (period) {
    title += `: ${getPeriodLabel(period, lang)}`;
  } else if (filters.startDate && filters.endDate) {
    title += `: ${formatDateRange(filters.startDate, filters.endDate, lang)}`;
  }

  let response = `${title}\n\n`;

  // Overall summary
  response += `${getLocalizedMessage('total', lang)}: ${formatAmount(summary.total, userCurrency)}\n`;
  response += `${getLocalizedMessage('expenses_count', lang)}: ${summary.count}\n`;
  response += `${getLocalizedMessage('average', lang)}: ${formatAmount(summary.average, userCurrency)}\n`;
  response += `${getLocalizedMessage('highest', lang)}: ${formatAmount(summary.max, userCurrency)}\n`;
  response += `${getLocalizedMessage('lowest', lang)}: ${formatAmount(summary.min, userCurrency)}\n`;

  // Filter info
  if (category || (categories && categories.length > 0)) {
    response += `\n${getLocalizedMessage('category_filter', lang)}: ${category || categories.join(', ')}`;
  }
  if (minAmount !== null || maxAmount !== null) {
    const amountRange = [];
    if (minAmount !== null) amountRange.push(`>= ${formatAmount(minAmount, userCurrency)}`);
    if (maxAmount !== null) amountRange.push(`<= ${formatAmount(maxAmount, userCurrency)}`);
    response += `\n${getLocalizedMessage('amount_filter', lang)}: ${amountRange.join(' ')}`;
  }
  if (searchText) {
    response += `\n${getLocalizedMessage('search_filter', lang)}: "${searchText}"`;
  }

  // Grouped results
  if (byGroup && Object.keys(byGroup).length > 0) {
    response += `\n\n${getLocalizedMessage('by_group', lang, { group: getGroupLabel(groupBy, lang) })}:\n`;

    // Sort groups by total (descending)
    const sortedGroups = Object.entries(byGroup)
      .sort(([, a], [, b]) => b.total - a.total);

    for (const [key, data] of sortedGroups) {
      const groupLabel = formatGroupKey(key, groupBy, lang, locale);
      const emoji = groupBy === 'category' ? getCategoryEmoji(key) : '';
      response += `${emoji} ${groupLabel}: ${formatAmount(data.total, userCurrency)} (${data.count} ${getLocalizedMessage('expenses', lang)})\n`;
    }
  }

  return { success: true, message: response };
}

/**
 * Format list response
 */
function formatListResponse(result, filters, params, lang, userCurrency) {
  const { expenses, total, hasMore } = result;
  const { period, category, categories, minAmount, maxAmount, searchText } = params;

  if (expenses.length === 0) {
    return {
      success: true,
      message: getLocalizedMessage('no_results', lang)
    };
  }

  const locale = lang === 'es' ? 'es-CO' : lang === 'pt' ? 'pt-BR' : 'en-US';

  // Build title
  let title = getLocalizedMessage('results_title', lang);
  if (period) {
    title += ` - ${getPeriodLabel(period, lang)}`;
  }

  let response = `${title}\n\n`;

  // Calculate displayed total
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

  // Show filters applied
  const appliedFilters = [];
  if (category || (categories && categories.length > 0)) {
    appliedFilters.push(`${getLocalizedMessage('category', lang)}: ${category || categories.join(', ')}`);
  }
  if (minAmount !== null || maxAmount !== null) {
    const amountRange = [];
    if (minAmount !== null) amountRange.push(`>= ${formatAmount(minAmount, userCurrency)}`);
    if (maxAmount !== null) amountRange.push(`<= ${formatAmount(maxAmount, userCurrency)}`);
    appliedFilters.push(`${getLocalizedMessage('amount', lang)}: ${amountRange.join(' ')}`);
  }
  if (searchText) {
    appliedFilters.push(`${getLocalizedMessage('search', lang)}: "${searchText}"`);
  }

  if (appliedFilters.length > 0) {
    response += `\n${getLocalizedMessage('filters', lang)}: ${appliedFilters.join(' | ')}`;
  }

  // Total
  response += `\n\n${getLocalizedMessage('total', lang)}: ${formatAmount(displayedTotal, userCurrency)}`;

  // Pagination info
  if (hasMore) {
    response += `\n${getLocalizedMessage('showing_of', lang, { showing: expenses.length, total })}`;
  } else if (total > 1) {
    response += ` (${total} ${getLocalizedMessage('expenses', lang)})`;
  }

  return { success: true, message: response };
}

/**
 * Get emoji for category
 */
function getCategoryEmoji(category) {
  const emojis = {
    food: '',
    comida: '',
    transport: '',
    transporte: '',
    shopping: '',
    compras: '',
    entertainment: '',
    entretenimiento: '',
    bills: '',
    servicios: '',
    health: '',
    salud: '',
    other: '',
    otro: ''
  };
  return emojis[category.toLowerCase()] || '';
}

/**
 * Get label for group type
 */
function getGroupLabel(groupBy, lang) {
  const labels = {
    en: { category: 'Category', day: 'Day', week: 'Week', month: 'Month' },
    es: { category: 'Categoría', day: 'Día', week: 'Semana', month: 'Mes' },
    pt: { category: 'Categoria', day: 'Dia', week: 'Semana', month: 'Mês' }
  };
  return (labels[lang] || labels.en)[groupBy] || groupBy;
}

/**
 * Format group key for display
 */
function formatGroupKey(key, groupBy, lang, locale) {
  if (groupBy === 'category') {
    return key;
  }

  if (groupBy === 'day') {
    const date = new Date(key);
    return date.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' });
  }

  if (groupBy === 'week') {
    // key is YYYY-Wxx
    return key;
  }

  if (groupBy === 'month') {
    // key is YYYY-MM
    const [year, month] = key.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1, 1);
    return date.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  }

  return key;
}

function getLocalizedMessage(key, lang, params = {}) {
  const messages = {
    en: {
      summary_title: 'Summary',
      results_title: 'Search Results',
      total: 'Total',
      expenses_count: 'Expenses',
      average: 'Average',
      highest: 'Highest',
      lowest: 'Lowest',
      by_group: 'By {group}',
      expenses: 'expenses',
      no_results: 'No expenses found matching your criteria.',
      error_searching: 'An error occurred while searching. Please try again.',
      showing_of: 'Showing {showing} of {total}',
      category_filter: 'Category',
      amount_filter: 'Amount',
      search_filter: 'Search',
      filters: 'Filters',
      category: 'Category',
      amount: 'Amount',
      search: 'Search'
    },
    es: {
      summary_title: 'Resumen',
      results_title: 'Resultados',
      total: 'Total',
      expenses_count: 'Gastos',
      average: 'Promedio',
      highest: 'Mayor',
      lowest: 'Menor',
      by_group: 'Por {group}',
      expenses: 'gastos',
      no_results: 'No se encontraron gastos con esos criterios.',
      error_searching: 'Ocurrió un error al buscar. Por favor intenta de nuevo.',
      showing_of: 'Mostrando {showing} de {total}',
      category_filter: 'Categoría',
      amount_filter: 'Monto',
      search_filter: 'Búsqueda',
      filters: 'Filtros',
      category: 'Categoría',
      amount: 'Monto',
      search: 'Búsqueda'
    },
    pt: {
      summary_title: 'Resumo',
      results_title: 'Resultados',
      total: 'Total',
      expenses_count: 'Despesas',
      average: 'Média',
      highest: 'Maior',
      lowest: 'Menor',
      by_group: 'Por {group}',
      expenses: 'despesas',
      no_results: 'Nenhuma despesa encontrada com esses critérios.',
      error_searching: 'Ocorreu um erro ao pesquisar. Por favor, tente novamente.',
      showing_of: 'Mostrando {showing} de {total}',
      category_filter: 'Categoria',
      amount_filter: 'Valor',
      search_filter: 'Busca',
      filters: 'Filtros',
      category: 'Categoria',
      amount: 'Valor',
      search: 'Busca'
    }
  };

  const langMessages = messages[lang] || messages.en;
  let message = langMessages[key] || messages.en[key] || key;

  for (const [param, value] of Object.entries(params)) {
    message = message.replace(new RegExp(`\\{${param}\\}`, 'g'), value);
  }

  return message;
}

export default { definition, handler };
