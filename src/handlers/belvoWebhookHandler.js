/**
 * Belvo Webhook Handler
 * Processes webhook events from Belvo Open Banking
 *
 * Events:
 * - LINK_CREATED: User successfully connected a bank
 * - LINK_DELETED: Bank connection was removed
 * - ACCOUNTS_CREATED: Accounts were retrieved
 * - TRANSACTIONS_CREATED: New transactions available
 */

import { BankLinkDB, BankImportUsageDB, ExpenseDB, UserDB, UserSubscriptionDB, SubscriptionPlanDB } from "../database/index.js";
import { getLink, getTransactions, formatDateForBelvo } from "../services/belvoService.js";
import { categorizeTransaction } from "../services/transactionCategorizer.js";
import { sendTextMessage } from "../utils/whatsappClient.js";
import { formatAmount } from "../utils/currencyUtils.js";

// Webhook messages for different languages
const WEBHOOK_MESSAGES = {
  en: {
    link_success: `*Bank Connected!*

{institution} has been successfully connected to your Monedita account.

From now on, your transactions will be imported automatically.`,

    link_success_with_sync: `*Bank Connected!*

{institution} has been successfully connected.

*{count}* transactions imported ({total}).

From now on, new transactions will be imported automatically.`,

    link_error: `*Bank Connection Failed*

There was an error connecting to {institution}.

Please try again by saying "connect bank".`,
  },
  es: {
    link_success: `*¡Banco Conectado!*

{institution} ha sido conectado exitosamente a tu cuenta de Monedita.

A partir de ahora, tus transacciones se importarán automáticamente.`,

    link_success_with_sync: `*¡Banco Conectado!*

{institution} ha sido conectado exitosamente.

Se importaron *{count}* transacciones ({total}).

A partir de ahora, las nuevas transacciones se importarán automáticamente.`,

    link_error: `*Conexión Bancaria Fallida*

Hubo un error al conectar con {institution}.

Por favor intenta de nuevo diciendo "conectar banco".`,
  },
  pt: {
    link_success: `*Banco Conectado!*

{institution} foi conectado com sucesso à sua conta Monedita.

A partir de agora, suas transações serão importadas automaticamente.`,

    link_success_with_sync: `*Banco Conectado!*

{institution} foi conectado com sucesso.

*{count}* transações importadas ({total}).

A partir de agora, novas transações serão importadas automaticamente.`,

    link_error: `*Conexão Bancária Falhou*

Houve um erro ao conectar com {institution}.

Por favor, tente novamente dizendo "conectar banco".`,
  },
};

function getWebhookMessage(key, lang, params = {}) {
  const messages = WEBHOOK_MESSAGES[lang] || WEBHOOK_MESSAGES.en;
  let message = messages[key] || WEBHOOK_MESSAGES.en[key] || key;

  for (const [param, value] of Object.entries(params)) {
    message = message.replace(new RegExp(`\\{${param}\\}`, "g"), value);
  }

  return message;
}

/**
 * Handle incoming Belvo webhook event
 * @param {object} payload - Webhook payload from Belvo
 * @param {string} token - Authorization Bearer token
 */
export async function handleBelvoWebhook(payload, token) {
  console.log("[belvo webhook] ========================================");
  console.log("[belvo webhook] Received event:", payload.event_type || payload.webhook_type);
  console.log("[belvo webhook] Payload:", JSON.stringify(payload, null, 2));

  // Verify token in production
  const expectedToken = process.env.BELVO_WEBHOOK_SECRET;
  if (expectedToken && token !== expectedToken) {
    console.error("[belvo webhook] Invalid token");
    throw new Error("Invalid webhook token");
  }

  const eventType = payload.event_type || payload.webhook_type;
  const data = payload.data || payload;

  switch (eventType) {
    case "LINK_CREATED":
    case "link.created":
      await handleLinkCreated(data);
      break;

    case "LINK_DELETED":
    case "link.deleted":
      await handleLinkDeleted(data);
      break;

    case "LINK_ERROR":
    case "link.error":
      await handleLinkError(data);
      break;

    case "ACCOUNTS_CREATED":
    case "accounts.created":
      console.log("[belvo webhook] Accounts created for link:", data.link_id || data.link);
      break;

    case "TRANSACTIONS_CREATED":
    case "transactions.created":
      console.log("[belvo webhook] New transactions for link:", data.link_id || data.link);
      // Could trigger auto-sync here if desired
      break;

    default:
      console.log("[belvo webhook] Ignoring event:", eventType);
  }

  console.log("[belvo webhook] ========================================");
}

/**
 * Handle LINK_CREATED event
 * Saves the bank link and auto-syncs transactions from TODAY only
 * @param {object} data - Event data
 */
async function handleLinkCreated(data) {
  const linkId = data.link_id || data.link || data.id;
  const externalId = data.external_id; // This is the phone number

  if (!linkId) {
    console.error("[belvo webhook] No link_id in LINK_CREATED event");
    return;
  }

  console.log(`[belvo webhook] Link created: ${linkId} for user: ${externalId}`);

  try {
    // Get link details from Belvo
    const linkDetails = await getLink(linkId);

    if (!linkDetails) {
      console.error("[belvo webhook] Could not fetch link details");
      return;
    }

    const phone = externalId || linkDetails.external_id;
    const institution = linkDetails.institution;
    const institutionName = linkDetails.institution_name || institution;

    if (!phone) {
      console.error("[belvo webhook] No phone number (external_id) for link");
      return;
    }

    // Check if link already exists
    const existingLink = await BankLinkDB.getByLinkId(linkId);

    if (existingLink) {
      // Update existing link to active
      await BankLinkDB.updateStatus(linkId, "active");
      console.log(`[belvo webhook] Updated existing link to active: ${linkId}`);
    } else {
      // Create new bank link record
      await BankLinkDB.create(phone, {
        linkId,
        institution: institutionName,
        institutionId: institution,
        status: "active",
      });
      console.log(`[belvo webhook] Created new bank link: ${linkId}`);
    }

    // Get user info
    const user = await UserDB.get(phone);
    const lang = user?.language || "es";
    const userCurrency = user?.currency || "COP";

    // AUTO-SYNC: Import transactions from TODAY only (not historical)
    const syncResult = await autoSyncTransactions(phone, linkId, institutionName, userCurrency);

    // Notify user via WhatsApp
    if (syncResult.count > 0) {
      await sendTextMessage(
        phone,
        getWebhookMessage("link_success_with_sync", lang, {
          institution: institutionName,
          count: syncResult.count,
          total: syncResult.totalFormatted,
        })
      );
    } else {
      await sendTextMessage(
        phone,
        getWebhookMessage("link_success", lang, {
          institution: institutionName,
        })
      );
    }

    console.log(`[belvo webhook] ✅ Successfully processed LINK_CREATED for ${phone} (synced ${syncResult.count} transactions)`);
  } catch (error) {
    console.error("[belvo webhook] Error processing LINK_CREATED:", error);
    throw error;
  }
}

/**
 * Auto-sync transactions from TODAY only (no historical data)
 * @param {string} phone - User's phone number
 * @param {string} linkId - Belvo link ID
 * @param {string} institution - Institution name
 * @param {string} currency - User's currency
 * @returns {Promise<{count: number, total: number, totalFormatted: string}>}
 */
async function autoSyncTransactions(phone, linkId, institution, currency) {
  let totalImported = 0;
  let totalAmount = 0;

  try {
    // Get user's plan limits
    const subscription = await UserSubscriptionDB.getOrCreate(phone);
    const plan = await SubscriptionPlanDB.get(subscription.planId);
    const monthlyLimit = plan.bank_transactions_per_month || plan.bankTransactionsPerMonth || 500;

    // Sync only TODAY's transactions (from midnight)
    const today = new Date();
    const dateStr = formatDateForBelvo(today);

    console.log(`[belvo webhook] Auto-syncing transactions from ${dateStr}`);

    // Fetch transactions from Belvo (today only)
    const transactions = await getTransactions(linkId, dateStr, dateStr);

    if (!transactions || transactions.length === 0) {
      console.log("[belvo webhook] No transactions found for today");
      return { count: 0, total: 0, totalFormatted: formatAmount(0, currency) };
    }

    console.log(`[belvo webhook] Found ${transactions.length} transactions for today`);

    // Filter and process transactions
    for (const transaction of transactions) {
      // Skip income (positive amounts)
      if (transaction.amount >= 0) continue;

      // Skip pending transactions
      if (transaction.status === "PENDING") continue;

      // Check if we've hit the limit
      const currentUsage = await BankImportUsageDB.getUsage(phone);
      if (currentUsage >= monthlyLimit) {
        console.log("[belvo webhook] Monthly limit reached, stopping sync");
        break;
      }

      // Check if transaction already exists (by external_id)
      const externalId = `belvo_${transaction.id}`;
      const expenses = await ExpenseDB.getByUser(phone);
      const exists = expenses.some(e => e.external_id === externalId);

      if (exists) {
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

      totalImported++;
      totalAmount += expenseData.amount;
    }

    // Update last sync timestamp
    await BankLinkDB.updateLastSync(linkId);

  } catch (error) {
    console.error("[belvo webhook] Error auto-syncing:", error);
  }

  return {
    count: totalImported,
    total: totalAmount,
    totalFormatted: formatAmount(totalAmount, currency),
  };
}

/**
 * Handle LINK_DELETED event
 * @param {object} data - Event data
 */
async function handleLinkDeleted(data) {
  const linkId = data.link_id || data.link || data.id;

  if (!linkId) {
    console.error("[belvo webhook] No link_id in LINK_DELETED event");
    return;
  }

  console.log(`[belvo webhook] Link deleted: ${linkId}`);

  try {
    // Get the link from our database before deleting
    const link = await BankLinkDB.getByLinkId(linkId);

    if (link) {
      // Delete from our database
      await BankLinkDB.delete(linkId);
      console.log(`[belvo webhook] Deleted bank link from database: ${linkId}`);
    } else {
      console.log(`[belvo webhook] Link not found in database: ${linkId}`);
    }
  } catch (error) {
    console.error("[belvo webhook] Error processing LINK_DELETED:", error);
  }
}

/**
 * Handle LINK_ERROR event
 * @param {object} data - Event data
 */
async function handleLinkError(data) {
  const linkId = data.link_id || data.link || data.id;
  const errorMessage = data.message || data.error || "Unknown error";
  const externalId = data.external_id;

  console.log(`[belvo webhook] Link error: ${linkId} - ${errorMessage}`);

  try {
    // Update link status
    if (linkId) {
      await BankLinkDB.updateStatus(linkId, "error", errorMessage);
    }

    // Notify user if we have their phone
    const phone = externalId;
    if (phone) {
      const user = await UserDB.get(phone);
      const lang = user?.language || "es";
      const institution = data.institution_name || data.institution || "your bank";

      await sendTextMessage(
        phone,
        getWebhookMessage("link_error", lang, { institution })
      );
    }
  } catch (error) {
    console.error("[belvo webhook] Error processing LINK_ERROR:", error);
  }
}

export default { handleBelvoWebhook };
