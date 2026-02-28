/**
 * Budget Prompt Service
 * Handles the flow for prompting users to set budgets for categories
 * that don't have one, and processing their responses.
 */

import { BudgetDB, UserDB } from "../database/index.js";
import { getMessage } from "../utils/languageUtils.js";
import { formatAmount, parseAmount } from "../utils/currencyUtils.js";

// In-memory store for pending budget prompts
// Key: phone, Value: { category, timestamp }
const pendingPrompts = new Map();

// How long a pending prompt is valid (5 minutes)
const PROMPT_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Set a pending budget prompt for a user
 * @param {string} phone - User's phone number
 * @param {string} category - Category that needs a budget
 */
export async function setPendingBudgetPrompt(phone, category) {
  pendingPrompts.set(phone, {
    category: category.toLowerCase(),
    timestamp: Date.now()
  });
}

/**
 * Get pending budget prompt for a user (if any and not expired)
 * @param {string} phone - User's phone number
 * @returns {{ category: string } | null}
 */
export function getPendingBudgetPrompt(phone) {
  const pending = pendingPrompts.get(phone);
  if (!pending) return null;

  // Check if expired
  if (Date.now() - pending.timestamp > PROMPT_TIMEOUT_MS) {
    pendingPrompts.delete(phone);
    return null;
  }

  return { category: pending.category };
}

/**
 * Clear pending budget prompt for a user
 * @param {string} phone - User's phone number
 */
export function clearPendingBudgetPrompt(phone) {
  pendingPrompts.delete(phone);
}

/**
 * Check if a message is a response to a budget prompt
 * Returns the response type and data
 * @param {string} message - User's message
 * @returns {{ type: 'amount' | 'skip' | 'none', amount?: number }}
 */
export function parseBudgetResponse(message) {
  const text = message.toLowerCase().trim();

  // Check for skip/silence responses
  const skipPatterns = [
    'no', 'nope', 'skip', 'omitir', 'saltar', 'después', 'despues',
    'no quiero', 'no gracias', 'ahora no', 'luego', 'later',
    'não', 'nao', 'pular', 'depois'
  ];

  for (const pattern of skipPatterns) {
    if (text === pattern || text.startsWith(pattern + ' ') || text.startsWith(pattern + ',')) {
      return { type: 'skip' };
    }
  }

  // Try to parse as amount
  // Support formats: "200k", "200000", "200.000", "200,000", "200 mil"
  const amount = parseAmount(message);
  if (amount && amount > 0) {
    return { type: 'amount', amount };
  }

  return { type: 'none' };
}

/**
 * Handle a budget prompt response
 * @param {string} phone - User's phone number
 * @param {string} message - User's message
 * @param {string} lang - User's language
 * @param {string} userCurrency - User's currency
 * @returns {{ handled: boolean, response?: string }}
 */
export async function handleBudgetPromptResponse(phone, message, lang, userCurrency) {
  const pending = getPendingBudgetPrompt(phone);
  if (!pending) {
    return { handled: false };
  }

  const parsed = parseBudgetResponse(message);

  if (parsed.type === 'none') {
    // Not a budget response, let normal flow handle it
    return { handled: false };
  }

  // Clear the pending prompt
  clearPendingBudgetPrompt(phone);

  if (parsed.type === 'skip') {
    // User wants to skip - silence the category for 30 days
    await UserDB.silenceBudgetCategory(phone, pending.category);
    return {
      handled: true,
      response: getMessage('budget_prompt_silenced', lang, { category: pending.category })
    };
  }

  if (parsed.type === 'amount') {
    // Create the budget
    await BudgetDB.create(phone, {
      category: pending.category,
      amount: parsed.amount,
      period: 'monthly'
    });

    // Remove any silence for this category
    await UserDB.unsilenceBudgetCategory(phone, pending.category);

    return {
      handled: true,
      response: getMessage('budget_prompt_created', lang, {
        category: pending.category,
        amount: formatAmount(parsed.amount, userCurrency)
      })
    };
  }

  return { handled: false };
}

export default {
  setPendingBudgetPrompt,
  getPendingBudgetPrompt,
  clearPendingBudgetPrompt,
  parseBudgetResponse,
  handleBudgetPromptResponse
};
