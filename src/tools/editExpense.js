/**
 * Tool: Edit Expense
 * Updates an existing expense (amount, category, or description)
 */

import { ExpenseDB } from "../database/index.js";
import { validateAmount, formatAmount } from "../utils/currencyUtils.js";
import { getMessage } from "../utils/languageUtils.js";

export const definition = {
  name: "edit_expense",
  description: "Edit/update an existing expense. Can change amount, category, or description. Use when user wants to fix, edit, update, or change an expense. Examples: 'change expense 5 to 100', 'fix last expense category to food', 'update expense 3 description to lunch with team'",
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
  const { expenseId, editLast, newAmount, newCategory, newDescription } = params;

  const expenses = await ExpenseDB.getByUser(phone);

  if (!expenses || expenses.length === 0) {
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
    expenseToEdit = expenses[expenses.length - 1];
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

  // Build update object
  const updates = {};
  const changes = [];

  if (newAmount) {
    updates.amount = newAmount;
    changes.push(`${getLocalizedMessage('amount', lang)}: ${formatAmount(newAmount, userCurrency)}`);
  }
  if (newCategory) {
    updates.category = newCategory.toLowerCase();
    changes.push(`${getLocalizedMessage('category', lang)}: ${newCategory.toLowerCase()}`);
  }
  if (newDescription) {
    updates.description = newDescription;
    changes.push(`${getLocalizedMessage('description', lang)}: ${newDescription}`);
  }

  // Update the expense in database
  // Since ExpenseDB doesn't have a direct update method, we'll delete and recreate
  // Or we can add an update method - for now, let's work with what we have
  const updatedExpense = {
    ...expenseToEdit,
    ...updates
  };

  // Delete old and create new (preserving date)
  await ExpenseDB.delete(phone, expenseToEdit.id);
  const newExpense = await ExpenseDB.create(phone, {
    amount: updatedExpense.amount,
    category: updatedExpense.category,
    description: updatedExpense.description,
    date: expenseToEdit.date
  });

  return {
    success: true,
    message: getLocalizedMessage('expense_updated', lang, {
      id: expenseToEdit.id,
      changes: changes.join(', ')
    })
  };
}

function getLocalizedMessage(key, lang, params = {}) {
  const messages = {
    en: {
      expense_not_found: "Expense #{id} not found. Use 'show expenses' to see your list with IDs.",
      edit_expense_help: "To edit an expense, say: 'edit expense 5 amount to 100' or 'change last expense category to food'",
      edit_nothing_specified: "Please specify what to change: amount, category, or description.",
      expense_updated: "Updated expense #{id}: {changes}",
      amount: "Amount",
      category: "Category",
      description: "Description"
    },
    es: {
      expense_not_found: "Gasto #{id} no encontrado. Usa 'ver gastos' para ver tu lista con IDs.",
      edit_expense_help: "Para editar un gasto, di: 'editar gasto 5 monto a 100' o 'cambiar último gasto categoría a comida'",
      edit_nothing_specified: "Por favor especifica qué cambiar: monto, categoría o descripción.",
      expense_updated: "Gasto #{id} actualizado: {changes}",
      amount: "Monto",
      category: "Categoría",
      description: "Descripción"
    },
    pt: {
      expense_not_found: "Despesa #{id} não encontrada. Use 'ver despesas' para ver sua lista com IDs.",
      edit_expense_help: "Para editar uma despesa, diga: 'editar despesa 5 valor para 100' ou 'mudar última despesa categoria para comida'",
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
    message = message.replace(new RegExp(`\\{${param}\\}`, 'g'), value);
  }

  return message;
}

export default { definition, handler };
