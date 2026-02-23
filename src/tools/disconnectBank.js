/**
 * Tool: Disconnect Bank
 * Removes a connected bank account
 */

import { BankLinkDB } from "../database/index.js";
import { deleteLink, isBelvoConfigured } from "../services/belvoService.js";

export const definition = {
  name: "disconnect_bank",
  description: "Disconnect a bank account. Use when user wants to remove their bank connection, says 'disconnect bank', 'remove bank', 'desconectar banco', 'eliminar banco', or similar requests to unlink their financial institution.",
  input_schema: {
    type: "object",
    properties: {
      institution: {
        type: "string",
        description: "Name of the bank to disconnect (optional, will disconnect only bank if user has just one)",
      },
      confirm: {
        type: "boolean",
        description: "Set to true if user has confirmed they want to disconnect",
      },
    },
    required: [],
  },
};

// Disconnect messages for different languages
const DISCONNECT_MESSAGES = {
  en: {
    not_configured: "Bank connections are not available at this time.",

    no_banks: "You don't have any bank connected.",

    confirm_disconnect: `*Disconnect {institution}?*

This will:
• Remove the bank connection
• Stop importing new transactions
• Keep your existing imported expenses

Are you sure? Say "yes, disconnect" to confirm.`,

    disconnected: `*Bank Disconnected*

{institution} has been disconnected from your account.

Your existing imported expenses are still saved.

Say "connect bank" if you want to reconnect.`,

    disconnect_error: "There was an error disconnecting the bank. Please try again.",

    multiple_banks: `You have multiple banks connected:

{bankList}

Please specify which bank to disconnect. For example:
"disconnect {firstBank}"`,
  },
  es: {
    not_configured: "Las conexiones bancarias no están disponibles en este momento.",

    no_banks: "No tienes ningún banco conectado.",

    confirm_disconnect: `*¿Desconectar {institution}?*

Esto:
• Eliminará la conexión bancaria
• Dejará de importar nuevas transacciones
• Mantendrá tus gastos importados existentes

¿Estás seguro? Di "sí, desconectar" para confirmar.`,

    disconnected: `*Banco Desconectado*

{institution} ha sido desconectado de tu cuenta.

Tus gastos importados existentes siguen guardados.

Di "conectar banco" si quieres reconectar.`,

    disconnect_error: "Hubo un error al desconectar el banco. Por favor intenta de nuevo.",

    multiple_banks: `Tienes múltiples bancos conectados:

{bankList}

Por favor especifica cuál banco desconectar. Por ejemplo:
"desconectar {firstBank}"`,
  },
  pt: {
    not_configured: "As conexões bancárias não estão disponíveis no momento.",

    no_banks: "Você não tem nenhum banco conectado.",

    confirm_disconnect: `*Desconectar {institution}?*

Isso irá:
• Remover a conexão bancária
• Parar de importar novas transações
• Manter suas despesas importadas existentes

Tem certeza? Diga "sim, desconectar" para confirmar.`,

    disconnected: `*Banco Desconectado*

{institution} foi desconectado da sua conta.

Suas despesas importadas existentes ainda estão salvas.

Diga "conectar banco" se quiser reconectar.`,

    disconnect_error: "Houve um erro ao desconectar o banco. Por favor, tente novamente.",

    multiple_banks: `Você tem múltiplos bancos conectados:

{bankList}

Por favor, especifique qual banco desconectar. Por exemplo:
"desconectar {firstBank}"`,
  },
};

function getDisconnectMessage(key, lang, params = {}) {
  const messages = DISCONNECT_MESSAGES[lang] || DISCONNECT_MESSAGES.en;
  let message = messages[key] || DISCONNECT_MESSAGES.en[key] || key;

  for (const [param, value] of Object.entries(params)) {
    message = message.replace(new RegExp(`\\{${param}\\}`, "g"), value);
  }

  return message;
}

export async function handler(phone, params, lang, userCurrency) {
  const { institution, confirm } = params;

  // Check if Belvo is configured
  if (!isBelvoConfigured()) {
    return {
      success: false,
      message: getDisconnectMessage("not_configured", lang),
    };
  }

  // Get user's bank links
  const bankLinks = await BankLinkDB.getByUser(phone);

  if (bankLinks.length === 0) {
    return {
      success: false,
      message: getDisconnectMessage("no_banks", lang),
    };
  }

  // If user has multiple banks and didn't specify which one
  if (bankLinks.length > 1 && !institution) {
    const bankList = bankLinks.map((l) => `• ${l.institution}`).join("\n");
    return {
      success: false,
      message: getDisconnectMessage("multiple_banks", lang, {
        bankList,
        firstBank: bankLinks[0].institution,
      }),
    };
  }

  // Find the bank to disconnect
  let linkToDisconnect;

  if (bankLinks.length === 1) {
    linkToDisconnect = bankLinks[0];
  } else {
    // Match by institution name (case-insensitive partial match)
    const searchTerm = institution.toLowerCase();
    linkToDisconnect = bankLinks.find((l) =>
      l.institution.toLowerCase().includes(searchTerm)
    );
  }

  if (!linkToDisconnect) {
    return {
      success: false,
      message: `Could not find bank "${institution}". Please check the bank name and try again.`,
    };
  }

  // If not confirmed, ask for confirmation
  if (!confirm) {
    return {
      success: true,
      message: getDisconnectMessage("confirm_disconnect", lang, {
        institution: linkToDisconnect.institution,
      }),
      requiresConfirmation: true,
    };
  }

  // Perform the disconnect
  try {
    // Delete from Belvo
    await deleteLink(linkToDisconnect.linkId);

    // Delete from our database
    await BankLinkDB.delete(linkToDisconnect.linkId);

    return {
      success: true,
      message: getDisconnectMessage("disconnected", lang, {
        institution: linkToDisconnect.institution,
      }),
    };
  } catch (error) {
    console.error("[disconnectBank] Error:", error);
    return {
      success: false,
      message: getDisconnectMessage("disconnect_error", lang),
    };
  }
}

export default { definition, handler };
