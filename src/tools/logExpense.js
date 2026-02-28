/**
 * Tool: Log Expense
 * Records one or more expenses from user message
 */

import { ExpenseDB, BudgetDB, UserDB } from "../database/index.js";
import { validateAmount, formatAmount } from "../utils/currencyUtils.js";
import { getMessage } from "../utils/languageUtils.js";
import { generateSetupUrl } from "../services/statsTokenService.js";
import { getUserCategories, getCategoryNames } from "../utils/categoryUtils.js";
import { validateExpenses } from "../schemas/expenseSchema.js";
import { setPendingBudgetPrompt } from "../services/budgetPromptService.js";

export const definition = {
  name: "log_expense",
  description: `Log one or more expenses. ONLY use this tool when you have BOTH amount AND a clear category.

IMPORTANT: If the user does NOT specify a category or it's unclear, DO NOT call this tool. Instead, ask the user which category to use.

Good examples (clear category - use this tool):
- "gasté 50 en almuerzo" → category: comida ✓
- "uber 12mil" → category: transporte ✓
- "pagué la luz 85k" → category: servicios ✓

Bad examples (unclear category - DO NOT use this tool, ask first):
- "gasté 214000" → NO category mentioned, ASK USER
- "pagué 50mil" → unclear what for, ASK USER
- "compré algo por 30k" → "algo" is too vague, ASK USER

When category is unclear, respond with: "¿En qué categoría lo registro? [list categories]"`,
  input_schema: {
    type: "object",
    properties: {
      expenses: {
        type: "array",
        description: "List of expenses to log. ONLY include expenses where category is CLEAR from context.",
        items: {
          type: "object",
          properties: {
            amount: {
              type: "number",
              description: "The expense amount as a number"
            },
            category: {
              type: "string",
              description: "Category ID from user's available categories. Must be clearly identifiable from the message context."
            },
            description: {
              type: "string",
              description: "Brief description of the expense"
            }
          },
          required: ["amount", "category", "description"]
        }
      }
    },
    required: ["expenses"]
  }
};

export async function handler(phone, params, lang, userCurrency) {
  const { expenses } = params;

  if (!expenses || expenses.length === 0) {
    return { success: false, message: getMessage('expenses_none', lang) };
  }

  // Check if currency is set
  if (!userCurrency) {
    return { success: false, message: getMessage('currency_not_set', lang) };
  }

  // Note: Usage is tracked in messageHandler.js before calling the agent
  // No need to check/track here to avoid double charging

  // Get user's allowed categories
  const allowedCategories = await getUserCategories(phone, lang);

  // Validate categories using Zod schema
  const categoryValidation = validateExpenses(expenses, allowedCategories);

  // If there are invalid categories, ask user to clarify
  if (!categoryValidation.valid && categoryValidation.invalidExpenses.length > 0) {
    const invalidExp = categoryValidation.invalidExpenses[0];
    const categoryNames = getCategoryNames(allowedCategories);

    const messages = {
      en: `I couldn't classify "${invalidExp.original.description || 'this expense'}" (${formatAmount(invalidExp.original.amount, userCurrency)}).\n\nWhich category should I use?\n${categoryNames}`,
      es: `No pude clasificar "${invalidExp.original.description || 'este gasto'}" (${formatAmount(invalidExp.original.amount, userCurrency)}).\n\n¿En qué categoría lo pongo?\n${categoryNames}`,
      pt: `Não consegui classificar "${invalidExp.original.description || 'esta despesa'}" (${formatAmount(invalidExp.original.amount, userCurrency)}).\n\nQual categoria devo usar?\n${categoryNames}`,
    };

    return {
      success: false,
      message: messages[lang] || messages.en,
      sticker: 'thinking',
    };
  }

  // Safety net: ALWAYS reject "otros/other" variants
  // The enum constraint in financeAgent should prevent this, but this is a backup
  // We never want to save expenses with a generic "otros" category
  const genericCategories = ['otros', 'other', 'outro', 'misc', 'miscellaneous', 'general'];

  for (const exp of categoryValidation.validExpenses) {
    const isGenericCategory = genericCategories.includes(exp.category.toLowerCase());

    // Always reject generic categories - no exceptions
    if (isGenericCategory) {
      const categoryNames = getCategoryNames(allowedCategories);
      const messages = {
        en: `I can't use "${exp.category}" as a category.\n\nWhich category should I use for ${formatAmount(exp.amount, userCurrency)}?\n${categoryNames}`,
        es: `No puedo usar "${exp.category}" como categoría.\n\n¿En qué categoría registro ${formatAmount(exp.amount, userCurrency)}?\n${categoryNames}`,
        pt: `Não posso usar "${exp.category}" como categoria.\n\nEm qual categoria registro ${formatAmount(exp.amount, userCurrency)}?\n${categoryNames}`,
      };
      return {
        success: false,
        message: messages[lang] || messages.es,
        sticker: 'thinking',
      };
    }

    // Also reject vague descriptions that suggest uncertainty
    const hasVagueDescription = !exp.description || exp.description.length < 3 ||
      ['gasto', 'pago', 'compra', 'expense', 'payment', 'algo', 'cosa', 'thing'].includes(exp.description.toLowerCase().trim());

    // If description is vague AND category seems auto-assigned, ask for clarification
    if (hasVagueDescription) {
      const categoryNames = getCategoryNames(allowedCategories);
      const messages = {
        en: `I need a bit more context for ${formatAmount(exp.amount, userCurrency)}.\n\nWhat was it for? Or which category?\n${categoryNames}`,
        es: `Necesito un poco más de contexto para ${formatAmount(exp.amount, userCurrency)}.\n\n¿En qué fue? O ¿qué categoría?\n${categoryNames}`,
        pt: `Preciso de um pouco mais de contexto para ${formatAmount(exp.amount, userCurrency)}.\n\nNo que foi? Ou qual categoria?\n${categoryNames}`,
      };
      return {
        success: false,
        message: messages[lang] || messages.es,
        sticker: 'thinking',
      };
    }
  }

  // Use validated expenses with normalized category IDs
  const validatedExpenses = categoryValidation.validExpenses;

  // Validate all amounts
  const validationErrors = [];
  for (const exp of validatedExpenses) {
    const validation = validateAmount(exp.amount, userCurrency);
    if (!validation.valid) {
      validationErrors.push(`• ${exp.description || exp.category}: ${validation.error}`);
    }
  }

  if (validationErrors.length > 0) {
    return {
      success: false,
      message: getMessage('validation_error_multi', lang) + validationErrors.join("\n")
    };
  }

  // Create all expenses
  const createdExpenses = [];
  const budgetAlerts = [];

  for (const exp of validatedExpenses) {
    const expense = await ExpenseDB.create(phone, {
      amount: exp.amount,
      category: exp.category,
      description: exp.description || "",
    });
    createdExpenses.push(expense);

    // Check budget alert for each category
    const budgetAlert = await checkBudgetAlert(phone, exp.category, userCurrency, lang);
    if (budgetAlert && !budgetAlerts.includes(budgetAlert)) {
      budgetAlerts.push(budgetAlert);
    }
  }

  // Usage already tracked in messageHandler.js

  // Build response
  let response;
  if (createdExpenses.length === 1) {
    const expense = createdExpenses[0];
    response = `${getMessage('expense_logged', lang)} ${formatAmount(expense.amount, userCurrency)} ${getMessage('expense_for', lang)} ${expense.category}`;
    if (expense.description) {
      response += ` (${expense.description})`;
    }
  } else {
    response = getMessage('expense_logged_multi', lang, { count: createdExpenses.length }) + "\n";
    for (const expense of createdExpenses) {
      response += `• ${formatAmount(expense.amount, userCurrency)} - ${expense.category}`;
      if (expense.description) {
        response += ` (${expense.description})`;
      }
      response += "\n";
    }
  }

  // Determine sticker based on budget status
  let sticker = 'money'; // Default for expense logged
  if (budgetAlerts.length > 0) {
    response += `\n${budgetAlerts.join("\n")}`;
    // Check if any alert is "exceeded" (100%+)
    const hasExceeded = budgetAlerts.some(a => a.includes('100%') || a.includes('exceeded') || a.includes('excediste'));
    sticker = hasExceeded ? 'sad' : 'warning';
  }

  // Check if this is a good time to show setup reminder
  const setupReminder = await getSetupReminder(phone, lang);
  if (setupReminder) {
    response += `\n\n${setupReminder}`;
  }

  // Check for categories without budgets (only if no budget alerts were shown)
  if (budgetAlerts.length === 0) {
    const budgetPrompt = await checkNoBudgetPrompt(phone, createdExpenses, userCurrency, lang);
    if (budgetPrompt) {
      response += `\n\n${budgetPrompt}`;
    }
  }

  return { success: true, message: response, sticker };
}

/**
 * Get setup reminder message if user hasn't completed setup
 * Only shows once after first few expenses
 */
async function getSetupReminder(phone, lang) {
  try {
    const user = await UserDB.get(phone);
    if (!user) return null;

    // Don't show if already completed setup or already reminded
    if (user.setup_complete || user.setup_reminded) return null;

    // Count user's expenses - only show reminder after 2-3 expenses
    const expenses = await ExpenseDB.getByUser(phone);
    if (expenses.length < 2 || expenses.length > 5) return null;

    // Mark as reminded so we don't show again
    await UserDB.setSetupReminded(phone, true);

    const setupUrl = generateSetupUrl(phone);

    const messages = {
      en: `💡 *Tip:* Set up your categories and budgets:\n${setupUrl}`,
      es: `💡 *Tip:* Configura tus categorías y presupuestos:\n${setupUrl}`,
      pt: `💡 *Dica:* Configure suas categorias e orçamentos:\n${setupUrl}`,
    };

    return messages[lang] || messages.en;
  } catch (error) {
    console.error('[logExpense] Error checking setup reminder:', error);
    return null;
  }
}

/**
 * Check if any expense category has no budget and should prompt user
 * Only prompts once per unique category, and respects silenced categories
 */
async function checkNoBudgetPrompt(phone, expenses, userCurrency, lang) {
  try {
    // Get unique categories from expenses
    const categories = [...new Set(expenses.map(e => e.category))];

    // Check each category
    for (const category of categories) {
      // Check if budget exists
      const budget = await BudgetDB.getByCategory(phone, category);
      if (budget) continue; // Has budget, skip

      // Check if category is silenced
      const isSilenced = await UserDB.isCategorySilenced(phone, category);
      if (isSilenced) continue; // Silenced, skip

      // No budget and not silenced - prompt user
      // Store pending prompt state for follow-up handling
      await setPendingBudgetPrompt(phone, category);

      return getMessage('budget_prompt_no_budget', lang, { category });
    }

    return null;
  } catch (error) {
    console.error('[logExpense] Error checking budget prompt:', error);
    return null;
  }
}

/**
 * Generate a progress bar string
 * @param {number} percentage - 0-100+
 * @param {number} length - bar length (default 10)
 * @returns {string} - e.g. "[████████░░]"
 */
function generateProgressBar(percentage, length = 10) {
  const filled = Math.min(Math.round((percentage / 100) * length), length);
  const empty = length - filled;
  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}]`;
}

/**
 * Check budget status and return progress bar with alert if needed
 */
async function checkBudgetAlert(phone, category, userCurrency, lang) {
  const budget = await BudgetDB.getByCategory(phone, category);
  if (!budget) return null;

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const spent = await ExpenseDB.getTotalByCategory(phone, category, startOfMonth, endOfMonth);
  const budgetAmount = parseFloat(budget.amount || 0);
  const percentage = budgetAmount > 0 ? (spent / budgetAmount) * 100 : 0;

  const progressBar = generateProgressBar(percentage);
  const remaining = budgetAmount - spent;

  // Build the message based on percentage
  if (percentage >= 100) {
    // Exceeded budget
    return `🚨 *${category}*: ${progressBar} ${percentage.toFixed(0)}%\n${getMessage('budget_exceeded_simple', lang, {
      spent: formatAmount(spent, userCurrency),
      budget: formatAmount(budgetAmount, userCurrency)
    })}`;
  } else if (percentage >= 80) {
    // Warning: 80%+ used (20% or less remaining)
    return `⚠️ *${category}*: ${progressBar} ${percentage.toFixed(0)}%\n${getMessage('budget_warning_remaining', lang, {
      remaining: formatAmount(remaining, userCurrency)
    })}`;
  } else {
    // Normal progress (only show if > 0%)
    if (percentage > 0) {
      return `📊 *${category}*: ${progressBar} ${percentage.toFixed(0)}%`;
    }
    return null;
  }
}

export default { definition, handler };
