/**
 * Tool: Rename Category
 * Renames a category across all expenses and budgets
 */

import { ExpenseDB, BudgetDB, UserDB } from "../database/index.js";
import { getMessage } from "../utils/languageUtils.js";
import { getUserCategories } from "../utils/categoryUtils.js";

export const definition = {
  name: "rename_category",
  description: "Rename a spending category. Updates all expenses and budgets with the old category name. Examples: 'rename food to groceries', 'change transport category to transportation'",
  input_schema: {
    type: "object",
    properties: {
      oldName: {
        type: "string",
        description: "Current category name"
      },
      newName: {
        type: "string",
        description: "New category name"
      }
    },
    required: ["oldName", "newName"]
  }
};

export async function handler(phone, params, lang, userCurrency) {
  const { oldName, newName } = params;

  if (!oldName || !newName) {
    return { success: false, message: getMessage('rename_help', lang) };
  }

  const oldNameLower = oldName.toLowerCase();
  const newNameLower = newName.toLowerCase();

  // Check if old category exists in user's expenses or budgets
  const allExpenses = await ExpenseDB.getByUser(phone);
  const allBudgets = await BudgetDB.getByUser(phone);

  const hasExpenses = allExpenses.some(e => e.category === oldNameLower);
  const hasBudget = allBudgets.some(b => b.category === oldNameLower);

  if (!hasExpenses && !hasBudget) {
    return { success: false, message: getMessage('category_not_found', lang, { category: oldNameLower }) };
  }

  // Rename in expenses and budgets
  await ExpenseDB.renameCategory(phone, oldNameLower, newNameLower);
  await BudgetDB.renameCategory(phone, oldNameLower, newNameLower);

  // Update user's custom categories list
  const categories = await getUserCategories(phone, lang);
  const updatedCategories = categories.map(c => c === oldNameLower ? newNameLower : c);
  if (!updatedCategories.includes(newNameLower)) {
    updatedCategories.push(newNameLower);
  }
  await UserDB.setCategories(phone, updatedCategories);

  return {
    success: true,
    message: getMessage('category_renamed', lang, { old: oldNameLower, new: newNameLower })
  };
}

export default { definition, handler };
