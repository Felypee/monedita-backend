/**
 * Tool: Sync Bank Transactions
 * Imports transactions from connected bank accounts as expenses
 */

import {
  BankLinkDB,
  BankImportUsageDB,
  ExpenseDB,
  UserSubscriptionDB,
  SubscriptionPlanDB,
} from "../database/index.js";
import {
  getTransactions,
  parseTransactionToExpense,
  getDefaultSyncRange,
  isBelvoConfigured,
} from "../services/belvoService.js";
import { categorizeTransaction } from "../services/transactionCategorizer.js";
import { formatAmount } from "../utils/currencyUtils.js";

export const definition = {
  name: "sync_transactions",
  description: "Sync and import transactions from connected bank account. Use when user says 'sync bank', 'import transactions', 'sincronizar banco', 'importar transacciones', or similar requests to update their expenses from the bank.",
  input_schema: {
    type: "object",
    properties: {
      days: {
        type: "number",
        description: "Number of days to sync (default 30, max 90)",
      },
    },
    required: [],
  },
};

// Sync messages for different languages
const SYNC_MESSAGES = {
  en: {
    not_configured: "Bank sync is not available at this time. Please try again later.",

    no_bank_connected: `You don't have a bank connected yet.

Say "connect bank" to link your bank account and start importing transactions automatically.`,

    bank_inactive: `Your bank connection is inactive.

Please reconnect your bank by saying "connect bank".`,

    sync_started: "Syncing your bank transactions...",

    sync_complete: `*Bank Sync Complete*

Imported *{count}* new transactions from {institution}.

{summary}

Total: {total}`,

    sync_no_new: `*Bank Sync Complete*

No new transactions found from {institution}.

Your expenses are up to date!`,

    sync_partial: `*Bank Sync Partial*

Imported *{imported}* of {total} transactions.
{skipped} were skipped (limit reached: {limit}/month).

Upgrade your plan for more imports.`,

    sync_error: "There was an error syncing your bank. Please try again later.",

    limit_reached: `You've reached your monthly limit of {limit} bank transactions.

Your limit will reset at the start of next month.`,
  },
  es: {
    not_configured: "La sincronización bancaria no está disponible en este momento. Por favor intenta más tarde.",

    no_bank_connected: `No tienes un banco conectado aún.

Di "conectar banco" para vincular tu cuenta bancaria y comenzar a importar transacciones automáticamente.`,

    bank_inactive: `Tu conexión bancaria está inactiva.

Por favor reconecta tu banco diciendo "conectar banco".`,

    sync_started: "Sincronizando tus transacciones bancarias...",

    sync_complete: `*Sincronización Completa*

Se importaron *{count}* nuevas transacciones de {institution}.

{summary}

Total: {total}`,

    sync_no_new: `*Sincronización Completa*

No se encontraron transacciones nuevas de {institution}.

¡Tus gastos están actualizados!`,

    sync_partial: `*Sincronización Parcial*

Se importaron *{imported}* de {total} transacciones.
{skipped} fueron omitidas (límite alcanzado: {limit}/mes).

Mejora tu plan para más importaciones.`,

    sync_error: "Hubo un error al sincronizar tu banco. Por favor intenta más tarde.",

    limit_reached: `Has alcanzado tu límite mensual de {limit} transacciones bancarias.

Tu límite se reiniciará al inicio del próximo mes.`,
  },
  pt: {
    not_configured: "A sincronização bancária não está disponível no momento. Por favor, tente novamente mais tarde.",

    no_bank_connected: `Você ainda não tem um banco conectado.

Diga "conectar banco" para vincular sua conta bancária e começar a importar transações automaticamente.`,

    bank_inactive: `Sua conexão bancária está inativa.

Por favor, reconecte seu banco dizendo "conectar banco".`,

    sync_started: "Sincronizando suas transações bancárias...",

    sync_complete: `*Sincronização Completa*

Importadas *{count}* novas transações de {institution}.

{summary}

Total: {total}`,

    sync_no_new: `*Sincronização Completa*

Nenhuma transação nova encontrada de {institution}.

Suas despesas estão atualizadas!`,

    sync_partial: `*Sincronização Parcial*

Importadas *{imported}* de {total} transações.
{skipped} foram ignoradas (limite atingido: {limit}/mês).

Atualize seu plano para mais importações.`,

    sync_error: "Houve um erro ao sincronizar seu banco. Por favor, tente novamente mais tarde.",

    limit_reached: `Você atingiu seu limite mensal de {limit} transações bancárias.

Seu limite será reiniciado no início do próximo mês.`,
  },
};

function getSyncMessage(key, lang, params = {}) {
  const messages = SYNC_MESSAGES[lang] || SYNC_MESSAGES.en;
  let message = messages[key] || SYNC_MESSAGES.en[key] || key;

  for (const [param, value] of Object.entries(params)) {
    message = message.replace(new RegExp(`\\{${param}\\}`, "g"), value);
  }

  return message;
}

export async function handler(phone, params, lang, userCurrency) {
  // Check if Belvo is configured
  if (!isBelvoConfigured()) {
    return {
      success: false,
      message: getSyncMessage("not_configured", lang),
    };
  }

  // Get user's active bank links
  const activeLinks = await BankLinkDB.getActiveByUser(phone);

  if (activeLinks.length === 0) {
    return {
      success: false,
      message: getSyncMessage("no_bank_connected", lang),
    };
  }

  // Get user's plan limits
  const subscription = await UserSubscriptionDB.getOrCreate(phone);
  const plan = await SubscriptionPlanDB.get(subscription.planId);
  const monthlyLimit = plan.bank_transactions_per_month || plan.bankTransactionsPerMonth || 500;

  // Check current usage
  const usageCheck = await BankImportUsageDB.canImport(phone, monthlyLimit, 1);

  if (!usageCheck.allowed) {
    return {
      success: false,
      message: getSyncMessage("limit_reached", lang, { limit: monthlyLimit }),
    };
  }

  // Calculate date range
  const days = Math.min(params.days || 30, 90);
  const dateTo = new Date();
  const dateFrom = new Date();
  dateFrom.setDate(dateFrom.getDate() - days);

  const dateToStr = dateTo.toISOString().split("T")[0];
  const dateFromStr = dateFrom.toISOString().split("T")[0];

  let totalImported = 0;
  let totalSkipped = 0;
  let totalAmount = 0;
  const categorySummary = {};
  let lastInstitution = "";

  // Process each connected bank
  for (const link of activeLinks) {
    if (link.status !== "active") continue;

    lastInstitution = link.institution;

    try {
      // Fetch transactions from Belvo
      const transactions = await getTransactions(link.linkId, dateFromStr, dateToStr);

      if (!transactions || transactions.length === 0) {
        continue;
      }

      // Filter and process transactions
      for (const transaction of transactions) {
        // Skip income (positive amounts)
        if (transaction.amount >= 0) continue;

        // Skip pending transactions
        if (transaction.status === "PENDING") continue;

        // Check if we've hit the limit
        const currentUsage = await BankImportUsageDB.getUsage(phone);
        if (currentUsage >= monthlyLimit) {
          totalSkipped++;
          continue;
        }

        // Check if transaction already exists (by external_id)
        const externalId = `belvo_${transaction.id}`;
        const existingExpense = await checkExpenseExists(phone, externalId);

        if (existingExpense) {
          // Already imported
          continue;
        }

        // Categorize transaction
        const category = categorizeTransaction(transaction);

        // Create expense
        const expenseData = {
          amount: Math.abs(transaction.amount),
          category,
          description: transaction.description || transaction.merchant?.name || "",
          date: new Date(transaction.value_date || transaction.accounting_date),
          source: "bank_import",
          external_id: externalId,
        };

        await ExpenseDB.create(phone, expenseData);

        // Track usage
        await BankImportUsageDB.increment(phone, 1);

        // Update stats
        totalImported++;
        totalAmount += expenseData.amount;

        if (!categorySummary[category]) {
          categorySummary[category] = { count: 0, total: 0 };
        }
        categorySummary[category].count++;
        categorySummary[category].total += expenseData.amount;
      }

      // Update last sync timestamp
      await BankLinkDB.updateLastSync(link.linkId);
    } catch (error) {
      console.error(`[syncTransactions] Error syncing ${link.institution}:`, error);
    }
  }

  // Build response
  if (totalImported === 0 && totalSkipped === 0) {
    return {
      success: true,
      message: getSyncMessage("sync_no_new", lang, {
        institution: lastInstitution,
      }),
    };
  }

  if (totalSkipped > 0 && totalImported > 0) {
    return {
      success: true,
      message: getSyncMessage("sync_partial", lang, {
        imported: totalImported,
        total: totalImported + totalSkipped,
        skipped: totalSkipped,
        limit: monthlyLimit,
      }),
    };
  }

  // Build category summary
  const summaryLines = [];
  for (const [cat, data] of Object.entries(categorySummary)) {
    summaryLines.push(`• ${cat}: ${data.count} (${formatAmount(data.total, userCurrency)})`);
  }

  return {
    success: true,
    message: getSyncMessage("sync_complete", lang, {
      count: totalImported,
      institution: lastInstitution,
      summary: summaryLines.join("\n"),
      total: formatAmount(totalAmount, userCurrency),
    }),
  };
}

/**
 * Check if an expense with the given external_id exists
 * @param {string} phone - User's phone
 * @param {string} externalId - External ID to check
 * @returns {Promise<boolean>}
 */
async function checkExpenseExists(phone, externalId) {
  // For in-memory DB
  if (typeof ExpenseDB.getByExternalId === "function") {
    return await ExpenseDB.getByExternalId(phone, externalId);
  }

  // Fallback: search through expenses
  const expenses = await ExpenseDB.getByUser(phone);
  return expenses.some(e => e.external_id === externalId);
}

export default { definition, handler };
