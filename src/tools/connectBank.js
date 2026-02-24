/**
 * Tool: Connect Bank
 * Allows users to connect their bank account via Belvo Open Banking
 * Premium feature only
 */

import { BankLinkDB, UserSubscriptionDB, SubscriptionPlanDB } from "../database/index.js";
import { isBelvoConfigured } from "../services/belvoService.js";
import { createWidgetSession } from "../routes/bankRoutes.js";
import { getMessage } from "../utils/languageUtils.js";

export const definition = {
  name: "connect_bank",
  description: "Connect a bank account for automatic expense import. Use when user says 'connect bank', 'link my bank', 'conectar banco', 'vincular cuenta bancaria', or similar requests to connect their financial institution.",
  input_schema: {
    type: "object",
    properties: {},
    required: [],
  },
};

// Bank messages for different languages
const BANK_MESSAGES = {
  en: {
    premium_required: `*Connect Your Bank*

Automatic expense import is a Premium feature.

With Open Banking you can:
• Import expenses automatically
• No more manual entry
• Up to 500 transactions/month

Upgrade to Premium to connect your bank.`,

    not_configured: "Bank connection is not available at this time. Please try again later.",

    already_connected: `You already have a bank connected: *{institution}*

To add another bank, you need to disconnect the current one first.

Use "disconnect bank" to remove the current connection.`,

    connection_limit: `You've reached the maximum number of bank connections ({limit}).

Disconnect an existing bank to connect a new one.`,

    connect_instructions: `*Connect Your Bank*

Click the link below to securely connect your bank account:

{widgetUrl}

This will open a secure page where you can select your bank and log in.

Your credentials are encrypted and never shared with us.`,

    widget_error: "There was an error generating the bank connection link. Please try again.",
  },
  es: {
    premium_required: `*Conecta Tu Banco*

La importación automática de gastos es una función Premium.

Con Open Banking puedes:
• Importar gastos automáticamente
• Sin más entrada manual
• Hasta 500 transacciones/mes

Mejora a Premium para conectar tu banco.`,

    not_configured: "La conexión bancaria no está disponible en este momento. Por favor intenta más tarde.",

    already_connected: `Ya tienes un banco conectado: *{institution}*

Para agregar otro banco, primero debes desconectar el actual.

Usa "desconectar banco" para eliminar la conexión actual.`,

    connection_limit: `Has alcanzado el número máximo de conexiones bancarias ({limit}).

Desconecta un banco existente para conectar uno nuevo.`,

    connect_instructions: `*Conecta Tu Banco*

Haz clic en el enlace de abajo para conectar tu cuenta bancaria de forma segura:

{widgetUrl}

Esto abrirá una página segura donde puedes seleccionar tu banco e iniciar sesión.

Tus credenciales están encriptadas y nunca se comparten con nosotros.`,

    widget_error: "Hubo un error al generar el enlace de conexión bancaria. Por favor intenta de nuevo.",
  },
  pt: {
    premium_required: `*Conecte Seu Banco*

A importação automática de despesas é um recurso Premium.

Com Open Banking você pode:
• Importar despesas automaticamente
• Sem mais entrada manual
• Até 500 transações/mês

Atualize para Premium para conectar seu banco.`,

    not_configured: "A conexão bancária não está disponível no momento. Por favor, tente novamente mais tarde.",

    already_connected: `Você já tem um banco conectado: *{institution}*

Para adicionar outro banco, você precisa desconectar o atual primeiro.

Use "desconectar banco" para remover a conexão atual.`,

    connection_limit: `Você atingiu o número máximo de conexões bancárias ({limit}).

Desconecte um banco existente para conectar um novo.`,

    connect_instructions: `*Conecte Seu Banco*

Clique no link abaixo para conectar sua conta bancária com segurança:

{widgetUrl}

Isso abrirá uma página segura onde você pode selecionar seu banco e fazer login.

Suas credenciais são criptografadas e nunca compartilhadas conosco.`,

    widget_error: "Houve um erro ao gerar o link de conexão bancária. Por favor, tente novamente.",
  },
};

function getBankMessage(key, lang, params = {}) {
  const messages = BANK_MESSAGES[lang] || BANK_MESSAGES.en;
  let message = messages[key] || BANK_MESSAGES.en[key] || key;

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
      message: getBankMessage("not_configured", lang),
    };
  }

  // Check if user has Premium plan
  const subscription = await UserSubscriptionDB.getOrCreate(phone);
  const plan = await SubscriptionPlanDB.get(subscription.planId);

  const bankConnectionsLimit = plan.bank_connections || plan.bankConnections || 0;

  if (bankConnectionsLimit === 0) {
    return {
      success: false,
      message: getBankMessage("premium_required", lang) + "\n\n" + getMessage("upgrade_cta_free", lang),
    };
  }

  // Check current connections
  const currentLinks = await BankLinkDB.getActiveByUser(phone);

  if (currentLinks.length >= bankConnectionsLimit) {
    if (currentLinks.length === 1) {
      // User has exactly 1 connection (typical for Premium)
      return {
        success: false,
        message: getBankMessage("already_connected", lang, {
          institution: currentLinks[0].institution,
        }),
      };
    }

    return {
      success: false,
      message: getBankMessage("connection_limit", lang, {
        limit: bankConnectionsLimit,
      }),
    };
  }

  // Create widget session
  const sessionResult = await createWidgetSession(phone);

  if (!sessionResult.success) {
    console.error("[connectBank] Failed to create widget session:", sessionResult.error);
    return {
      success: false,
      message: getBankMessage("widget_error", lang),
    };
  }

  // Generate the widget page URL (hosted on our server)
  const baseUrl = process.env.BACKEND_URL || "https://budget-agent-production.up.railway.app";
  const widgetUrl = `${baseUrl}/connect-bank.html?session=${sessionResult.sessionId}`;

  return {
    success: true,
    message: getBankMessage("connect_instructions", lang, { widgetUrl }),
  };
}

export default { definition, handler };
