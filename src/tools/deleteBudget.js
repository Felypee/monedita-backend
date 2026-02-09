/**
 * Tool: Delete Budget
 * Removes a budget for a category
 */

import { BudgetDB } from "../database/index.js";
import { formatAmount } from "../utils/currencyUtils.js";
import { getMessage } from "../utils/languageUtils.js";

export const definition = {
  name: "delete_budget",
  description: "Delete/remove a budget for a category. Use when user wants to remove, delete, or cancel a budget. Examples: 'delete food budget', 'remove transport budget', 'cancel entertainment budget'",
  input_schema: {
    type: "object",
    properties: {
      category: {
        type: "string",
        description: "The category of the budget to delete (food, transport, shopping, etc.)"
      }
    },
    required: ["category"]
  }
};

export async function handler(phone, params, lang, userCurrency) {
  const { category } = params;

  if (!category) {
    return {
      success: false,
      message: getLocalizedMessage('delete_budget_help', lang)
    };
  }

  const categoryLower = category.toLowerCase();

  // Check if budget exists
  const budget = await BudgetDB.getByCategory(phone, categoryLower);

  if (!budget) {
    return {
      success: false,
      message: getLocalizedMessage('budget_not_found', lang, { category: categoryLower })
    };
  }

  // Delete the budget
  await BudgetDB.delete(phone, categoryLower);

  return {
    success: true,
    message: getLocalizedMessage('budget_deleted', lang, {
      category: categoryLower,
      amount: formatAmount(budget.amount, userCurrency)
    })
  };
}

function getLocalizedMessage(key, lang, params = {}) {
  const messages = {
    en: {
      delete_budget_help: "To delete a budget, say: 'delete food budget' or 'remove transport budget'",
      budget_not_found: "No budget found for '{category}'. Use 'show budgets' to see your budgets.",
      budget_deleted: "Deleted {category} budget ({amount}/month)"
    },
    es: {
      delete_budget_help: "Para eliminar un presupuesto, di: 'eliminar presupuesto de comida' o 'borrar presupuesto de transporte'",
      budget_not_found: "No hay presupuesto para '{category}'. Usa 'ver presupuestos' para ver tus presupuestos.",
      budget_deleted: "Presupuesto de {category} eliminado ({amount}/mes)"
    },
    pt: {
      delete_budget_help: "Para excluir um orçamento, diga: 'excluir orçamento de comida' ou 'remover orçamento de transporte'",
      budget_not_found: "Nenhum orçamento encontrado para '{category}'. Use 'ver orçamentos' para ver seus orçamentos.",
      budget_deleted: "Orçamento de {category} excluído ({amount}/mês)"
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
