/**
 * Tool: Store Pending Expense
 * Stores an expense temporarily while waiting for category creation
 * Used when user tries to log an expense but has no categories
 */

import { setPendingExpense } from "../services/pendingExpenseService.js";
import { formatAmount } from "../utils/currencyUtils.js";

export const definition = {
  name: "store_pending_expense",
  description: `Store an expense temporarily while waiting for category creation.
ONLY use this when:
- User mentions an expense (has amount)
- User has NO categories yet (or category is unclear)
- You are about to suggest creating a category

This saves the expense so it can be automatically logged after category is created.

Example flow:
1. User: "gasté 50mil en almuerzo"
2. You call store_pending_expense(amount: 50000, description: "almuerzo")
3. You suggest: "¡Vamos a crear tu primera categoría! ¿La llamamos 'Comida' 🍔?"
4. User confirms
5. You call create_category(name: "Comida")
6. The expense is AUTOMATICALLY logged with the new category`,
  input_schema: {
    type: "object",
    properties: {
      amount: {
        type: "number",
        description: "The expense amount as a number"
      },
      description: {
        type: "string",
        description: "Brief description of what the expense was for (e.g., 'almuerzo', 'uber', 'netflix')"
      }
    },
    required: ["amount"]
  }
};

export async function handler(phone, params, lang, userCurrency) {
  const { amount, description } = params;

  if (!amount || amount <= 0) {
    const messages = {
      en: "Invalid amount",
      es: "Monto inválido",
      pt: "Valor inválido",
    };
    return { success: false, message: messages[lang] || messages.en };
  }

  // Store the pending expense
  setPendingExpense(phone, amount, description || null, null);

  console.log(`[storePendingExpense] Stored ${formatAmount(amount, userCurrency)}${description ? ` (${description})` : ''} for ${phone}`);

  // Return success silently - let Claude handle the response
  return { 
    success: true, 
    message: null, // No message - agent will respond with text
    silent: true // Don't send a message, let the agent's text response come through
  };
}

export default { definition, handler };
