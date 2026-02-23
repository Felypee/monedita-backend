/**
 * Tool: Settle Debt
 * Marks debt as paid between two users
 */

import { ExpenseSplitDB, UserDB } from "../database/index.js";
import { formatAmount } from "../utils/currencyUtils.js";
import { sendTextMessage } from "../utils/whatsappClient.js";

export const definition = {
  name: "settle_debt",
  description: "Mark a debt as paid/settled with someone. Use when user says they paid someone or want to settle up. Examples: 'I paid Maria', 'settle with Juan', 'ya le pagué a Pedro', 'pagar a Carlos', 'liquidar con Ana'",
  input_schema: {
    type: "object",
    properties: {
      creditorName: {
        type: "string",
        description: "Name or phone of the person being paid (the creditor)"
      },
      creditorPhone: {
        type: "string",
        description: "Phone number of the creditor (if known)"
      }
    },
    required: []
  }
};

export async function handler(phone, params, lang, userCurrency) {
  const { creditorName, creditorPhone } = params;

  if (!creditorName && !creditorPhone) {
    const messages = {
      en: "Who did you pay? Example: 'I paid Maria' or 'settle with +573001234567'",
      es: "¿A quién le pagaste? Ejemplo: 'pagué a María' o 'liquidar con +573001234567'",
      pt: "Para quem você pagou? Exemplo: 'paguei Maria' ou 'acertar com +5511999999999'",
    };
    return { success: false, message: messages[lang] || messages.es };
  }

  try {
    // Get the payer's balances to find the creditor
    const balances = await ExpenseSplitDB.calculateBalances(phone);

    if (balances.owes.length === 0) {
      const messages = {
        en: "You don't owe anyone right now!",
        es: "¡No le debes a nadie en este momento!",
        pt: "Você não deve nada a ninguém agora!",
      };
      return { success: true, message: messages[lang] || messages.es };
    }

    // Find the creditor
    let targetCreditor = null;

    // If phone provided, search by phone
    if (creditorPhone) {
      const cleanPhone = creditorPhone.replace(/[^\d+]/g, '');
      targetCreditor = balances.owes.find(d => d.phone === cleanPhone);
    }

    // If name provided, search by name
    if (!targetCreditor && creditorName) {
      const nameLower = creditorName.toLowerCase();

      for (const debt of balances.owes) {
        const user = await UserDB.get(debt.phone);
        if (user?.name && user.name.toLowerCase().includes(nameLower)) {
          targetCreditor = { ...debt, userName: user.name };
          break;
        }
      }

      // Also try partial phone match
      if (!targetCreditor) {
        targetCreditor = balances.owes.find(d => d.phone.includes(creditorName));
      }
    }

    if (!targetCreditor) {
      // Build list of people user owes
      const owedNames = [];
      for (const debt of balances.owes) {
        const user = await UserDB.get(debt.phone);
        const name = user?.name || `...${debt.phone.slice(-4)}`;
        owedNames.push(`${name}: ${formatAmount(debt.amount, userCurrency)}`);
      }

      const messages = {
        en: `I couldn't find "${creditorName || creditorPhone}" in your debts.\n\nYou owe:\n${owedNames.join('\n')}`,
        es: `No encontré a "${creditorName || creditorPhone}" en tus deudas.\n\nDebes a:\n${owedNames.join('\n')}`,
        pt: `Não encontrei "${creditorName || creditorPhone}" nas suas dívidas.\n\nVocê deve:\n${owedNames.join('\n')}`,
      };
      return { success: false, message: messages[lang] || messages.es };
    }

    // Settle the debt
    const amountSettled = await ExpenseSplitDB.settleDebt(phone, targetCreditor.phone);

    if (amountSettled === 0) {
      const messages = {
        en: "No pending debt found with this person.",
        es: "No hay deuda pendiente con esta persona.",
        pt: "Não há dívida pendente com esta pessoa.",
      };
      return { success: true, message: messages[lang] || messages.es };
    }

    // Get names for notification
    const payer = await UserDB.get(phone);
    const payerName = payer?.name || phone;
    const creditorUser = await UserDB.get(targetCreditor.phone);
    const displayName = targetCreditor.userName || creditorUser?.name || targetCreditor.phone;

    // Notify the creditor
    try {
      const creditorLang = creditorUser?.language || 'es';
      const creditorCurrency = creditorUser?.currency || userCurrency;

      const notifyMessages = {
        en: `${payerName} marked their debt of ${formatAmount(amountSettled, creditorCurrency)} as paid.\n\nIf you received the money, you're all settled!`,
        es: `${payerName} marcó su deuda de ${formatAmount(amountSettled, creditorCurrency)} como pagada.\n\n¡Si recibiste el dinero, ya están a mano!`,
        pt: `${payerName} marcou a dívida de ${formatAmount(amountSettled, creditorCurrency)} como paga.\n\nSe você recebeu o dinheiro, estão quites!`,
      };

      await sendTextMessage(targetCreditor.phone, notifyMessages[creditorLang] || notifyMessages.es);
    } catch (err) {
      console.error('[settleDebt] Failed to notify creditor:', err.message);
    }

    // Response for payer
    const responseMessages = {
      en: `Settled ${formatAmount(amountSettled, userCurrency)} with ${displayName}.\n\n${displayName} has been notified.`,
      es: `Liquidado ${formatAmount(amountSettled, userCurrency)} con ${displayName}.\n\n${displayName} ha sido notificado.`,
      pt: `Acertado ${formatAmount(amountSettled, userCurrency)} com ${displayName}.\n\n${displayName} foi notificado.`,
    };

    return { success: true, message: responseMessages[lang] || responseMessages.es, sticker: 'celebration' };
  } catch (error) {
    console.error('[settleDebt] Error:', error);
    const errorMessages = {
      en: "Failed to settle debt. Please try again.",
      es: "No pude liquidar la deuda. Intenta de nuevo.",
      pt: "Não consegui acertar a dívida. Tente novamente.",
    };
    return { success: false, message: errorMessages[lang] || errorMessages.es };
  }
}

export default { definition, handler };
