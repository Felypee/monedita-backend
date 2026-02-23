/**
 * Tool: Bank Status
 * Shows the status of connected bank accounts and import usage
 */

import {
  BankLinkDB,
  BankImportUsageDB,
  UserSubscriptionDB,
  SubscriptionPlanDB,
} from "../database/index.js";
import { isBelvoConfigured } from "../services/belvoService.js";
import { getMessage } from "../utils/languageUtils.js";

export const definition = {
  name: "bank_status",
  description: "Show connected bank accounts and sync status. Use when user asks about their bank connection, sync status, bank status, 'estado del banco', 'mis bancos conectados', or similar questions about their banking integration.",
  input_schema: {
    type: "object",
    properties: {},
    required: [],
  },
};

// Status messages for different languages
const STATUS_MESSAGES = {
  en: {
    not_configured: "Bank connections are not available at this time.",

    not_premium: `*Bank Connection Status*

Open Banking is a Premium feature.

Upgrade to Premium to:
• Connect your bank account
• Auto-import transactions
• Up to 500 imports/month`,

    no_banks: `*Bank Connection Status*

You don't have any bank connected.

Say "connect bank" to link your bank account and start importing transactions automatically.`,

    status_header: "*Bank Connection Status*",

    bank_active: `*{institution}*
Status: Active
Last sync: {lastSync}`,

    bank_pending: `*{institution}*
Status: Pending connection
Please complete the bank login process.`,

    bank_error: `*{institution}*
Status: Error
{error}
Try reconnecting with "connect bank".`,

    usage_section: `
*Monthly Usage*
Transactions imported: {used}/{limit}
Remaining: {remaining}`,

    tip_sync: `
*Tip:* Say "sync bank" to import new transactions.`,

    tip_disconnect: `
To remove a bank: "disconnect bank"`,
  },
  es: {
    not_configured: "Las conexiones bancarias no están disponibles en este momento.",

    not_premium: `*Estado de Conexión Bancaria*

Open Banking es una función Premium.

Mejora a Premium para:
• Conectar tu cuenta bancaria
• Importar transacciones automáticamente
• Hasta 500 importaciones/mes`,

    no_banks: `*Estado de Conexión Bancaria*

No tienes ningún banco conectado.

Di "conectar banco" para vincular tu cuenta bancaria y comenzar a importar transacciones automáticamente.`,

    status_header: "*Estado de Conexión Bancaria*",

    bank_active: `*{institution}*
Estado: Activo
Última sincronización: {lastSync}`,

    bank_pending: `*{institution}*
Estado: Conexión pendiente
Por favor completa el proceso de inicio de sesión del banco.`,

    bank_error: `*{institution}*
Estado: Error
{error}
Intenta reconectar con "conectar banco".`,

    usage_section: `
*Uso Mensual*
Transacciones importadas: {used}/{limit}
Restantes: {remaining}`,

    tip_sync: `
*Tip:* Di "sincronizar banco" para importar nuevas transacciones.`,

    tip_disconnect: `
Para eliminar un banco: "desconectar banco"`,
  },
  pt: {
    not_configured: "As conexões bancárias não estão disponíveis no momento.",

    not_premium: `*Status da Conexão Bancária*

Open Banking é um recurso Premium.

Atualize para Premium para:
• Conectar sua conta bancária
• Importar transações automaticamente
• Até 500 importações/mês`,

    no_banks: `*Status da Conexão Bancária*

Você não tem nenhum banco conectado.

Diga "conectar banco" para vincular sua conta bancária e começar a importar transações automaticamente.`,

    status_header: "*Status da Conexão Bancária*",

    bank_active: `*{institution}*
Status: Ativo
Última sincronização: {lastSync}`,

    bank_pending: `*{institution}*
Status: Conexão pendente
Por favor, complete o processo de login do banco.`,

    bank_error: `*{institution}*
Status: Erro
{error}
Tente reconectar com "conectar banco".`,

    usage_section: `
*Uso Mensal*
Transações importadas: {used}/{limit}
Restantes: {remaining}`,

    tip_sync: `
*Dica:* Diga "sincronizar banco" para importar novas transações.`,

    tip_disconnect: `
Para remover um banco: "desconectar banco"`,
  },
};

function getStatusMessage(key, lang, params = {}) {
  const messages = STATUS_MESSAGES[lang] || STATUS_MESSAGES.en;
  let message = messages[key] || STATUS_MESSAGES.en[key] || key;

  for (const [param, value] of Object.entries(params)) {
    message = message.replace(new RegExp(`\\{${param}\\}`, "g"), value);
  }

  return message;
}

function formatDate(date, lang) {
  if (!date) return "Never";

  const options = {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  };

  const locale = lang === "es" ? "es-CO" : lang === "pt" ? "pt-BR" : "en-US";
  return new Date(date).toLocaleDateString(locale, options);
}

export async function handler(phone, params, lang, userCurrency) {
  // Check if Belvo is configured
  if (!isBelvoConfigured()) {
    return {
      success: false,
      message: getStatusMessage("not_configured", lang),
    };
  }

  // Check if user has Premium plan
  const subscription = await UserSubscriptionDB.getOrCreate(phone);
  const plan = await SubscriptionPlanDB.get(subscription.planId);
  const bankConnectionsLimit = plan.bank_connections || plan.bankConnections || 0;

  if (bankConnectionsLimit === 0) {
    return {
      success: false,
      message: getStatusMessage("not_premium", lang) + "\n\n" + getMessage("upgrade_cta_free", lang),
    };
  }

  // Get user's bank links
  const bankLinks = await BankLinkDB.getByUser(phone);

  if (bankLinks.length === 0) {
    return {
      success: true,
      message: getStatusMessage("no_banks", lang),
    };
  }

  // Get usage stats
  const monthlyLimit = plan.bank_transactions_per_month || plan.bankTransactionsPerMonth || 500;
  const used = await BankImportUsageDB.getUsage(phone);
  const remaining = Math.max(0, monthlyLimit - used);

  // Build response
  const lines = [getStatusMessage("status_header", lang)];

  for (const link of bankLinks) {
    lines.push("");

    if (link.status === "active") {
      lines.push(
        getStatusMessage("bank_active", lang, {
          institution: link.institution,
          lastSync: formatDate(link.lastSyncAt, lang),
        })
      );
    } else if (link.status === "pending") {
      lines.push(
        getStatusMessage("bank_pending", lang, {
          institution: link.institution,
        })
      );
    } else if (link.status === "error") {
      lines.push(
        getStatusMessage("bank_error", lang, {
          institution: link.institution,
          error: link.errorMessage || "",
        })
      );
    } else {
      lines.push(`*${link.institution}*\nStatus: ${link.status}`);
    }
  }

  // Add usage stats
  lines.push(
    getStatusMessage("usage_section", lang, {
      used,
      limit: monthlyLimit,
      remaining,
    })
  );

  // Add tips
  const hasActiveBank = bankLinks.some((l) => l.status === "active");
  if (hasActiveBank) {
    lines.push(getStatusMessage("tip_sync", lang));
  }
  lines.push(getStatusMessage("tip_disconnect", lang));

  return {
    success: true,
    message: lines.join("\n"),
  };
}

export default { definition, handler };
