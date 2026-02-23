/**
 * Tool: Show Balances
 * Shows who owes whom in shared expenses
 */

import { ExpenseSplitDB, UserDB } from "../database/index.js";
import { formatAmount } from "../utils/currencyUtils.js";

export const definition = {
  name: "show_balances",
  description: "Show balance summary for shared expenses - who owes you and who you owe. Use when user asks about debts, balances, who owes them, or what they owe. Examples: 'who owes me', 'what do I owe', 'show balances', 'mis deudas', 'cuanto me deben', 'saldos'",
  input_schema: {
    type: "object",
    properties: {},
    required: []
  }
};

export async function handler(phone, params, lang, userCurrency) {
  try {
    const balances = await ExpenseSplitDB.calculateBalances(phone);

    // If no balances
    if (balances.owes.length === 0 && balances.owed.length === 0) {
      const messages = {
        en: "You have no pending balances.\n\nTo share an expense: 'share 50k dinner with Casa'",
        es: "No tienes saldos pendientes.\n\nPara compartir un gasto: 'compartir 50k cena con Casa'",
        pt: "Você não tem saldos pendentes.\n\nPara compartilhar uma despesa: 'compartilhar 50k jantar com Casa'",
      };
      return { success: true, message: messages[lang] || messages.es };
    }

    // Get user names
    const getDisplayName = async (memberPhone) => {
      const user = await UserDB.get(memberPhone);
      return user?.name || formatPhoneForDisplay(memberPhone);
    };

    // Format phone for display
    const formatPhoneForDisplay = (p) => {
      if (p.length > 8) {
        return `...${p.slice(-4)}`;
      }
      return p;
    };

    // Build response
    let response = '';

    // People who owe you
    if (balances.owed.length > 0) {
      const headers = {
        en: "💰 *People owe you:*\n",
        es: "💰 *Te deben:*\n",
        pt: "💰 *Te devem:*\n",
      };
      response += headers[lang] || headers.es;

      for (const debt of balances.owed) {
        const name = await getDisplayName(debt.phone);
        response += `• ${name}: ${formatAmount(debt.amount, userCurrency)}\n`;
      }
      response += '\n';
    }

    // People you owe
    if (balances.owes.length > 0) {
      const headers = {
        en: "📤 *You owe:*\n",
        es: "📤 *Debes:*\n",
        pt: "📤 *Você deve:*\n",
      };
      response += headers[lang] || headers.es;

      for (const debt of balances.owes) {
        const name = await getDisplayName(debt.phone);
        response += `• ${name}: ${formatAmount(debt.amount, userCurrency)}\n`;
      }
      response += '\n';
    }

    // Net balance
    const netLabels = {
      en: balances.netBalance >= 0 ? "✅ Net: you're owed" : "⚠️ Net: you owe",
      es: balances.netBalance >= 0 ? "✅ Balance neto: te deben" : "⚠️ Balance neto: debes",
      pt: balances.netBalance >= 0 ? "✅ Saldo líquido: te devem" : "⚠️ Saldo líquido: você deve",
    };
    response += `${netLabels[lang] || netLabels.es} ${formatAmount(Math.abs(balances.netBalance), userCurrency)}`;

    // Add settle hint if there are debts
    if (balances.owes.length > 0) {
      const hints = {
        en: "\n\nTo settle: 'pay [name]'",
        es: "\n\nPara liquidar: 'pagar a [nombre]'",
        pt: "\n\nPara acertar: 'pagar [nome]'",
      };
      response += hints[lang] || hints.es;
    }

    return { success: true, message: response };
  } catch (error) {
    console.error('[showBalances] Error:', error);
    const errorMessages = {
      en: "Failed to load balances. Please try again.",
      es: "No pude cargar los saldos. Intenta de nuevo.",
      pt: "Não consegui carregar os saldos. Tente novamente.",
    };
    return { success: false, message: errorMessages[lang] || errorMessages.es };
  }
}

export default { definition, handler };
