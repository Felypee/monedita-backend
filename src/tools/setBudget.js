/**
 * Tool: Set Budget
 * Creates or updates a budget for a category
 */

import { BudgetDB, UserDB } from "../database/index.js";
import { formatAmount } from "../utils/currencyUtils.js";
import { getMessage } from "../utils/languageUtils.js";
import { clearPendingBudgetPrompt } from "../services/budgetPromptService.js";
// Note: Budgets are unlimited for all plans in the new moneditas system

export const definition = {
  name: "set_budget",
  description: "Set or update a monthly budget for a spending category. Use when user wants to set, create, or change a budget limit. Examples: 'set food budget to 500', 'budget 1000 for transport'",
  input_schema: {
    type: "object",
    properties: {
      category: {
        type: "string",
        description: "The category to set budget for (food, transport, shopping, entertainment, bills, health, other)"
      },
      amount: {
        type: "number",
        description: "The budget amount"
      }
    },
    required: ["category", "amount"]
  }
};

export async function handler(phone, params, lang, userCurrency) {
  const { category, amount } = params;

  if (!category || !amount) {
    return { success: false, message: getMessage('budget_help', lang) };
  }

  const existing = await BudgetDB.getByCategory(phone, category.toLowerCase());

  if (existing) {
    // Update existing budget
    await BudgetDB.update(phone, category.toLowerCase(), amount);
    return {
      success: true,
      message: getMessage('budget_updated', lang, {
        category: category.toLowerCase(),
        amount: formatAmount(amount, userCurrency)
      }),
      sticker: 'success'
    };
  } else {
    // Budgets are unlimited for all plans
    await BudgetDB.create(phone, {
      category: category.toLowerCase(),
      amount,
      period: "monthly"
    });

    // Clear any pending budget prompt and unsilence this category
    clearPendingBudgetPrompt(phone);
    await UserDB.unsilenceBudgetCategory(phone, category.toLowerCase());

    return {
      success: true,
      message: getMessage('budget_set', lang, {
        category: category.toLowerCase(),
        amount: formatAmount(amount, userCurrency)
      }),
      sticker: 'success'
    };
  }
}

export default { definition, handler };
