/**
 * Expense validation schemas using Zod
 *
 * Provides validation for expense inputs and category validation
 */

import { z } from 'zod';

/**
 * Schema for a single expense input
 */
export const ExpenseInputSchema = z.object({
  amount: z.number().positive('Amount must be positive'),
  category: z.string().min(1, 'Category is required'),
  description: z.string().optional().default(''),
});

/**
 * Schema for multiple expenses input (from log_expense tool)
 */
export const ExpensesInputSchema = z.object({
  expenses: z.array(ExpenseInputSchema).min(1, 'At least one expense is required'),
});

/**
 * Validate that a category exists in the user's allowed categories
 * @param {string} category - Category to validate
 * @param {Array<{id: string, name: string}>} allowedCategories - User's allowed categories
 * @returns {{valid: boolean, matchedCategory: {id: string, name: string}|null}}
 */
export function validateCategory(category, allowedCategories) {
  if (!category || !allowedCategories || allowedCategories.length === 0) {
    return { valid: false, matchedCategory: null };
  }

  const normalized = category.toLowerCase().trim();

  // Try exact match on ID first
  const exactIdMatch = allowedCategories.find(c => c.id.toLowerCase() === normalized);
  if (exactIdMatch) {
    return { valid: true, matchedCategory: exactIdMatch };
  }

  // Try exact match on name
  const exactNameMatch = allowedCategories.find(c => c.name.toLowerCase() === normalized);
  if (exactNameMatch) {
    return { valid: true, matchedCategory: exactNameMatch };
  }

  // Try partial match on ID or name
  const partialMatch = allowedCategories.find(c =>
    c.id.toLowerCase().includes(normalized) ||
    c.name.toLowerCase().includes(normalized) ||
    normalized.includes(c.id.toLowerCase()) ||
    normalized.includes(c.name.toLowerCase())
  );
  if (partialMatch) {
    return { valid: true, matchedCategory: partialMatch };
  }

  return { valid: false, matchedCategory: null };
}

/**
 * Validate an expense and normalize the category
 * @param {object} expense - Expense to validate
 * @param {Array<{id: string, name: string}>} allowedCategories - User's allowed categories
 * @returns {{valid: boolean, expense: object|null, error: string|null}}
 */
export function validateExpense(expense, allowedCategories) {
  // Parse with Zod first
  const result = ExpenseInputSchema.safeParse(expense);
  if (!result.success) {
    const firstError = result.error.errors[0];
    return { valid: false, expense: null, error: firstError.message };
  }

  // Validate category
  const categoryValidation = validateCategory(result.data.category, allowedCategories);
  if (!categoryValidation.valid) {
    return {
      valid: false,
      expense: null,
      error: `invalid_category:${result.data.category}`,
      originalCategory: result.data.category,
    };
  }

  // Return normalized expense with matched category ID
  return {
    valid: true,
    expense: {
      ...result.data,
      category: categoryValidation.matchedCategory.id,
    },
    error: null,
  };
}

/**
 * Validate multiple expenses
 * @param {Array} expenses - Expenses to validate
 * @param {Array<{id: string, name: string}>} allowedCategories - User's allowed categories
 * @returns {{valid: boolean, validExpenses: Array, invalidExpenses: Array}}
 */
export function validateExpenses(expenses, allowedCategories) {
  const validExpenses = [];
  const invalidExpenses = [];

  for (const expense of expenses) {
    const result = validateExpense(expense, allowedCategories);
    if (result.valid) {
      validExpenses.push(result.expense);
    } else {
      invalidExpenses.push({
        original: expense,
        error: result.error,
        originalCategory: result.originalCategory,
      });
    }
  }

  return {
    valid: invalidExpenses.length === 0,
    validExpenses,
    invalidExpenses,
  };
}

export default {
  ExpenseInputSchema,
  ExpensesInputSchema,
  validateCategory,
  validateExpense,
  validateExpenses,
};
