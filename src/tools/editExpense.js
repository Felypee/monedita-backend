/**
 * Tool: Edit Expense
 * Updates an existing expense (amount, category, or description)
 * Supports filtering by time period and category to narrow down search
 */

import { ExpenseDB } from "../database/index.js";
import { validateAmount, formatAmount } from "../utils/currencyUtils.js";
import { getMessage } from "../utils/languageUtils.js";
import { resolveDateRange, getPeriodLabel } from "../utils/dateUtils.js";
import { getUserCategories, getCategoryNames } from "../utils/categoryUtils.js";
import { validateCategory } from "../schemas/expenseSchema.js";

export const definition = {
  name: "edit_expense",
  description: "Edit/update an existing expense. Can change amount, category, or description. Use when user wants to fix, edit, update, correct, or change an expense. Can find expense by ID, by description/category name, by time period, or edit the last one. If multiple expenses match, will ask user to confirm which one. Examples: 'change expense 5 to 100', 'fix the rent expense to 1000000', 'correct the arriendo amount', 'update last expense category to food', 'edit yesterday food expense', 'editar el gasto de comida de hoy'",
  input_schema: {
    type: "object",
    properties: {
      expenseId: {
        type: "number",
        description: "The ID of the expense to edit"
      },
      editLast: {
        type: "boolean",
        description: "If true, edit the most recent expense"
      },
      searchTerm: {
        type: "string",
        description: "Find expense by matching description or category name (e.g., 'arriendo', 'rent', 'coffee', 'comida')"
      },
      period: {
        type: "string",
        enum: ["today", "yesterday", "this_week", "last_week", "this_month", "last_month"],
        description: "Filter expenses by time period before selecting"
      },
      category: {
        type: "string",
        description: "Filter by category before selecting (e.g., 'food', 'transport')"
      },
      newAmount: {
        type: "number",
        description: "New amount for the expense"
      },
      newCategory: {
        type: "string",
        description: "New category for the expense"
      },
      newDescription: {
        type: "string",
        description: "New description for the expense"
      }
    },
    required: []
  }
};

export async function handler(phone, params, lang, userCurrency) {
  const {
    expenseId,
    editLast,
    searchTerm,
    period,
    category,
    newAmount,
    newCategory,
    newDescription
  } = params;

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

  // Find the expense to edit
  let expenseToEdit = null;

  if (expenseId) {
    expenseToEdit = expenses.find(e => e.id === expenseId);
    if (!expenseToEdit) {
      return {
        success: false,
        message: getLocalizedMessage('expense_not_found', lang, { id: expenseId })
      };
    }
  } else if (editLast) {
    // Get the most recent expense from filtered list
    expenseToEdit = expenses[0]; // Already sorted desc
  } else if (searchTerm) {
    // Search by description or category
    const termLower = searchTerm.toLowerCase();
    const matches = expenses.filter(e =>
      (e.description && e.description.toLowerCase().includes(termLower)) ||
      (e.category && e.category.toLowerCase().includes(termLower))
    );

    if (matches.length === 0) {
      return {
        success: false,
        message: getLocalizedMessage('expense_not_found_search', lang, { term: searchTerm })
      };
    } else if (matches.length === 1) {
      expenseToEdit = matches[0];
    } else {
      // Multiple matches - ask user to confirm which one
      return formatMultipleMatches(matches, searchTerm, period, category, lang, userCurrency, 'edit');
    }
  } else if (period || category) {
    // We have filters but no search term - check how many expenses match
    if (expenses.length === 1) {
      expenseToEdit = expenses[0];
    } else {
      // Multiple matches with just period/category filters
      return formatMultipleMatches(expenses, null, period, category, lang, userCurrency, 'edit');
    }
  } else {
    return {
      success: false,
      message: getLocalizedMessage('edit_expense_help', lang)
    };
  }

  // Check if there's something to update
  if (!newAmount && !newCategory && !newDescription) {
    return {
      success: false,
      message: getLocalizedMessage('edit_nothing_specified', lang)
    };
  }

  // Validate new amount if provided
  if (newAmount) {
    const validation = validateAmount(newAmount, userCurrency);
    if (!validation.valid) {
      return { success: false, message: validation.error };
    }
  }

  // Validate new category if provided
  let normalizedCategory = null;
  if (newCategory) {
    const allowedCategories = await getUserCategories(phone, lang);
    const categoryValidation = validateCategory(newCategory, allowedCategories);

    if (!categoryValidation.valid) {
      const categoryNames = getCategoryNames(allowedCategories);
      const messages = {
        en: `"${newCategory}" is not a valid category.\n\nAvailable categories: ${categoryNames}`,
        es: `"${newCategory}" no es una categoría válida.\n\nCategorías disponibles: ${categoryNames}`,
        pt: `"${newCategory}" não é uma categoria válida.\n\nCategorias disponíveis: ${categoryNames}`,
      };
      return { success: false, message: messages[lang] || messages.en };
    }
    normalizedCategory = categoryValidation.matchedCategory.id;
  }

  // Build update object
  const updates = {};
  const changes = [];

  if (newAmount) {
    updates.amount = newAmount;
    changes.push(`${getLocalizedMessage('amount', lang)}: ${formatAmount(newAmount, userCurrency)}`);
  }
  if (normalizedCategory) {
    updates.category = normalizedCategory;
    changes.push(`${getLocalizedMessage('category', lang)}: ${normalizedCategory}`);
  }
  if (newDescription) {
    updates.description = newDescription;
    changes.push(`${getLocalizedMessage('description', lang)}: ${newDescription}`);
  }

  // Update the expense in database (preserves original ID)
  await ExpenseDB.update(phone, expenseToEdit.id, updates);

  return {
    success: true,
    message: getLocalizedMessage('expense_updated', lang, {
      id: expenseToEdit.id,
      changes: changes.join(', ')
    })
  };
}

/**
 * Format multiple matches response
 */
function formatMultipleMatches(matches, searchTerm, period, category, lang, userCurrency, action) {
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

  listMsg += '\n' + getLocalizedMessage('specify_id', lang, { action });

  return { success: false, message: listMsg };
}

function getLocalizedMessage(key, lang, params = {}) {
  const messages = {
    en: {
      expense_not_found: "Expense #{id} not found. Use 'show expenses' to see your list with IDs.",
      expense_not_found_search: "Couldn't find an expense matching \"{term}\". Use 'show expenses' to see your list.",
      no_expenses_filtered: "No expenses found{period}{category}.",
      multiple_matches: "Found {count} expenses{context}:",
      specify_id: "Which one do you want to {action}? Tell me the number. Example: '{action} expense #5'",
      and_more: "and {count} more",
      edit_expense_help: "To edit an expense, say: 'edit expense 5 amount to 100' or 'change last expense category to food' or 'edit yesterday food expense'",
      edit_nothing_specified: "Please specify what to change: amount, category, or description.",
      expense_updated: "Updated expense #{id}: {changes}",
      amount: "Amount",
      category: "Category",
      description: "Description"
    },
    es: {
      expense_not_found: "Gasto #{id} no encontrado. Usa 'ver gastos' para ver tu lista con IDs.",
      expense_not_found_search: "No encontré un gasto con \"{term}\". Usa 'ver gastos' para ver tu lista.",
      no_expenses_filtered: "No se encontraron gastos{period}{category}.",
      multiple_matches: "Encontré {count} gastos{context}:",
      specify_id: "¿Cuál quieres {action}? Dime el número. Ejemplo: '{action} gasto #5'",
      and_more: "y {count} más",
      edit_expense_help: "Para editar un gasto, di: 'editar gasto 5 monto a 100' o 'cambiar último gasto categoría a comida' o 'editar gasto de comida de ayer'",
      edit_nothing_specified: "Por favor especifica qué cambiar: monto, categoría o descripción.",
      expense_updated: "Gasto #{id} actualizado: {changes}",
      amount: "Monto",
      category: "Categoría",
      description: "Descripción"
    },
    pt: {
      expense_not_found: "Despesa #{id} não encontrada. Use 'ver despesas' para ver sua lista com IDs.",
      expense_not_found_search: "Não encontrei uma despesa com \"{term}\". Use 'ver despesas' para ver sua lista.",
      no_expenses_filtered: "Nenhuma despesa encontrada{period}{category}.",
      multiple_matches: "Encontrei {count} despesas{context}:",
      specify_id: "Qual você quer {action}? Me diga o número. Exemplo: '{action} despesa #5'",
      and_more: "e mais {count}",
      edit_expense_help: "Para editar uma despesa, diga: 'editar despesa 5 valor para 100' ou 'mudar última despesa categoria para comida' ou 'editar despesa de comida de ontem'",
      edit_nothing_specified: "Por favor especifique o que mudar: valor, categoria ou descrição.",
      expense_updated: "Despesa #{id} atualizada: {changes}",
      amount: "Valor",
      category: "Categoria",
      description: "Descrição"
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
