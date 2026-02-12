/**
 * Tool: Delete Expense
 * Removes an expense by ID, description, time period, or the most recent one
 * Supports filtering by time period and category to narrow down search
 */

import { ExpenseDB } from "../database/index.js";
import { formatAmount } from "../utils/currencyUtils.js";
import { getMessage } from "../utils/languageUtils.js";
import { resolveDateRange, getPeriodLabel } from "../utils/dateUtils.js";

export const definition = {
  name: "delete_expense",
  description: "Delete an expense. Use when user wants to remove, delete, or undo an expense. Can delete by ID, by description/category name, by time period, or the last expense. If multiple expenses match, will ask user to confirm which one. Examples: 'delete expense 5', 'remove last expense', 'undo', 'delete the coffee expense', 'eliminar el de arriendo', 'eliminar gasto de comida de ayer', 'delete yesterday food expense'",
  input_schema: {
    type: "object",
    properties: {
      expenseId: {
        type: "number",
        description: "The ID of the expense to delete (shown in expense list)"
      },
      deleteLast: {
        type: "boolean",
        description: "If true, delete the most recent expense"
      },
      description: {
        type: "string",
        description: "Description to match if user refers to expense by name"
      },
      period: {
        type: "string",
        enum: ["today", "yesterday", "this_week", "last_week", "this_month", "last_month"],
        description: "Filter expenses by time period before selecting"
      },
      category: {
        type: "string",
        description: "Filter by category before selecting (e.g., 'food', 'transport', 'comida')"
      }
    },
    required: []
  }
};

export async function handler(phone, params, lang, userCurrency) {
  const { expenseId, deleteLast, description, period, category } = params;

  // Get expenses based on filters
  let expenses;

  // If we have period or category filters, use getByFilter
  if ((period || category) && typeof ExpenseDB.getByFilter === 'function') {
    const filters = {};

    if (period) {
      const { startDate, endDate } = resolveDateRange(period, null, null);
      if (startDate) filters.startDate = startDate;
      if (endDate) filters.endDate = endDate;
    }

    if (category) {
      filters.category = category;
    }

    const result = await ExpenseDB.getByFilter(phone, filters, { sortBy: 'date', sortOrder: 'desc' });
    expenses = result.expenses;
  } else {
    expenses = await ExpenseDB.getByUser(phone);
  }

  if (!expenses || expenses.length === 0) {
    if (period || category) {
      return {
        success: false,
        message: getLocalizedMessage('no_expenses_filtered', lang, {
          period: period ? getPeriodLabel(period, lang) : '',
          category: category || ''
        })
      };
    }
    return { success: false, message: getMessage('expenses_none', lang) };
  }

  let expenseToDelete = null;

  // Find expense by ID
  if (expenseId) {
    expenseToDelete = expenses.find(e => e.id === expenseId);
    if (!expenseToDelete) {
      return {
        success: false,
        message: getLocalizedMessage('expense_not_found', lang, { id: expenseId })
      };
    }
  }
  // Delete last expense
  else if (deleteLast) {
    // Get the most recent expense from filtered list
    expenseToDelete = expenses[0]; // Already sorted desc
  }
  // Find by description
  else if (description) {
    const descLower = description.toLowerCase();
    const matches = expenses.filter(e =>
      (e.description && e.description.toLowerCase().includes(descLower)) ||
      (e.category && e.category.toLowerCase().includes(descLower))
    );

    if (matches.length === 0) {
      return {
        success: false,
        message: getLocalizedMessage('expense_not_found_desc', lang, { description })
      };
    } else if (matches.length === 1) {
      expenseToDelete = matches[0];
    } else {
      // Multiple matches - ask user to confirm which one
      return formatMultipleMatches(matches, description, period, category, lang, userCurrency);
    }
  }
  // We have filters but no specific selector - check how many expenses match
  else if (period || category) {
    if (expenses.length === 1) {
      expenseToDelete = expenses[0];
    } else {
      // Multiple matches with just period/category filters
      return formatMultipleMatches(expenses, null, period, category, lang, userCurrency);
    }
  }
  else {
    return {
      success: false,
      message: getLocalizedMessage('delete_expense_help', lang)
    };
  }

  // Delete the expense
  await ExpenseDB.delete(phone, expenseToDelete.id);

  const expenseInfo = `${formatAmount(expenseToDelete.amount, userCurrency)} - ${expenseToDelete.category}`;
  const desc = expenseToDelete.description ? ` (${expenseToDelete.description})` : '';

  return {
    success: true,
    message: getLocalizedMessage('expense_deleted', lang, { expense: expenseInfo + desc })
  };
}

/**
 * Format multiple matches response
 */
function formatMultipleMatches(matches, searchTerm, period, category, lang, userCurrency) {
  const locale = lang === 'es' ? 'es-CO' : lang === 'pt' ? 'pt-BR' : 'en-US';
  const maxShow = 5;

  // Build context string
  let context = '';
  if (searchTerm) {
    context = ` "${searchTerm}"`;
  }
  if (period) {
    context += ` ${getPeriodLabel(period, lang)}`;
  }
  if (category) {
    context += ` (${category})`;
  }

  let listMsg = getLocalizedMessage('multiple_matches', lang, {
    count: matches.length,
    context: context.trim()
  }) + '\n\n';

  for (const exp of matches.slice(0, maxShow)) {
    const date = new Date(exp.date);
    const timeStr = date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
    const dateStr = date.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
    listMsg += `#${exp.id} • ${formatAmount(exp.amount, userCurrency)} - ${exp.category}`;
    if (exp.description) {
      listMsg += ` (${exp.description})`;
    }
    listMsg += ` - ${dateStr} ${timeStr}\n`;
  }

  if (matches.length > maxShow) {
    listMsg += `\n... ${getLocalizedMessage('and_more', lang, { count: matches.length - maxShow })}`;
  }

  listMsg += '\n' + getLocalizedMessage('specify_id', lang);

  return { success: false, message: listMsg };
}

function getLocalizedMessage(key, lang, params = {}) {
  const messages = {
    en: {
      expense_not_found: "Expense #{id} not found. Use 'show expenses' to see your expense list with IDs.",
      expense_not_found_desc: "Couldn't find an expense matching \"{description}\". Use 'show expenses' to see your list.",
      no_expenses_filtered: "No expenses found{period}{category}.",
      multiple_matches: "Found {count} expenses{context}:",
      specify_id: "Which one do you want to delete? Tell me the number. Example: 'delete expense #5'",
      and_more: "and {count} more",
      delete_expense_help: "To delete an expense, say: 'delete expense #5' or 'delete last expense' or 'remove yesterday coffee expense'",
      expense_deleted: "Deleted: {expense}"
    },
    es: {
      expense_not_found: "Gasto #{id} no encontrado. Usa 'ver gastos' para ver tu lista con IDs.",
      expense_not_found_desc: "No encontré un gasto con \"{description}\". Usa 'ver gastos' para ver tu lista.",
      no_expenses_filtered: "No se encontraron gastos{period}{category}.",
      multiple_matches: "Encontré {count} gastos{context}:",
      specify_id: "¿Cuál quieres eliminar? Dime el número. Ejemplo: 'eliminar gasto #5'",
      and_more: "y {count} más",
      delete_expense_help: "Para eliminar un gasto, di: 'eliminar gasto #5' o 'eliminar último gasto' o 'borrar el gasto del café de ayer'",
      expense_deleted: "Eliminado: {expense}"
    },
    pt: {
      expense_not_found: "Despesa #{id} não encontrada. Use 'ver despesas' para ver sua lista com IDs.",
      expense_not_found_desc: "Não encontrei uma despesa com \"{description}\". Use 'ver despesas' para ver sua lista.",
      no_expenses_filtered: "Nenhuma despesa encontrada{period}{category}.",
      multiple_matches: "Encontrei {count} despesas{context}:",
      specify_id: "Qual você quer excluir? Me diga o número. Exemplo: 'excluir despesa #5'",
      and_more: "e mais {count}",
      delete_expense_help: "Para excluir uma despesa, diga: 'excluir despesa #5' ou 'excluir última despesa' ou 'remover despesa do café de ontem'",
      expense_deleted: "Excluído: {expense}"
    }
  };

  const langMessages = messages[lang] || messages.en;
  let message = langMessages[key] || messages.en[key] || key;

  for (const [param, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      message = message.replace(new RegExp(`\\{${param}\\}`, 'g'), value);
    } else {
      message = message.replace(new RegExp(`\\{${param}\\}`, 'g'), '');
    }
  }

  // Clean up extra spaces
  message = message.replace(/\s+/g, ' ').trim();

  return message;
}

export default { definition, handler };
