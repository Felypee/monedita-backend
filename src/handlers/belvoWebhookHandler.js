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

import { BankLinkDB, UserDB } from "../database/index.js";
import { getLink } from "../services/belvoService.js";
import { sendTextMessage } from "../utils/whatsappClient.js";

// Webhook messages for different languages
const WEBHOOK_MESSAGES = {
  en: {
    link_success: `*Bank Connected!*

{institution} has been successfully connected to your Monedita account.

Say "sync bank" to import your recent transactions.`,

    link_error: `*Bank Connection Failed*

There was an error connecting to {institution}.

Please try again by saying "connect bank".`,
  },
  es: {
    link_success: `*¡Banco Conectado!*

{institution} ha sido conectado exitosamente a tu cuenta de Monedita.

Di "sincronizar banco" para importar tus transacciones recientes.`,

    link_error: `*Conexión Bancaria Fallida*

Hubo un error al conectar con {institution}.

Por favor intenta de nuevo diciendo "conectar banco".`,
  },
  pt: {
    link_success: `*Banco Conectado!*

{institution} foi conectado com sucesso à sua conta Monedita.

Diga "sincronizar banco" para importar suas transações recentes.`,

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

    // Notify user via WhatsApp
    const user = await UserDB.get(phone);
    const lang = user?.language || "es";

    await sendTextMessage(
      phone,
      getWebhookMessage("link_success", lang, {
        institution: institutionName,
      })
    );

    console.log(`[belvo webhook] ✅ Successfully processed LINK_CREATED for ${phone}`);
  } catch (error) {
    console.error("[belvo webhook] Error processing LINK_CREATED:", error);
    throw error;
  }
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
