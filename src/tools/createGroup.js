/**
 * Tool: Create Group
 * Creates an expense group for shared expenses
 */

import { ExpenseGroupDB, GroupMemberDB, UserDB } from "../database/index.js";
import { sendTextMessage } from "../utils/whatsappClient.js";

export const definition = {
  name: "create_group",
  description: "Create a new expense group for sharing expenses with others. Use when user wants to create a group, share expenses with others, or split costs. Examples: 'create group Casa', 'crear grupo vacaciones', 'new expense group with roommates', 'grupo para gastos del departamento'",
  input_schema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Name of the expense group (e.g., 'Casa', 'Trip to Paris', 'Roommates')"
      },
      members: {
        type: "array",
        description: "Phone numbers of members to add (with country code, e.g., '+573001234567')",
        items: {
          type: "string"
        }
      }
    },
    required: ["name"]
  }
};

export async function handler(phone, params, lang, userCurrency) {
  const { name, members = [] } = params;

  if (!name || name.trim().length === 0) {
    const messages = {
      en: "Please provide a name for the group. Example: 'create group Roommates'",
      es: "Por favor dame un nombre para el grupo. Ejemplo: 'crear grupo Compas de depa'",
      pt: "Por favor, dê um nome para o grupo. Exemplo: 'criar grupo Colegas de apartamento'",
    };
    return { success: false, message: messages[lang] || messages.en };
  }

  try {
    // Create the group
    const group = await ExpenseGroupDB.create(phone, { name: name.trim() });

    // Get creator's name
    const creator = await UserDB.get(phone);
    const creatorName = creator?.name || phone;

    // Track added members
    const addedMembers = [];
    const failedMembers = [];

    // Add other members
    for (const memberPhone of members) {
      // Clean phone number
      const cleanPhone = memberPhone.replace(/[^\d+]/g, '');
      if (!cleanPhone || cleanPhone === phone) continue;

      try {
        await GroupMemberDB.add(group.id, cleanPhone, 'member');
        addedMembers.push(cleanPhone);

        // Notify the member (in their language if they exist)
        const memberUser = await UserDB.get(cleanPhone);
        const memberLang = memberUser?.language || 'es';

        const inviteMessages = {
          en: `${creatorName} added you to the expense group "${name}".\n\nYou can now share expenses with this group!`,
          es: `${creatorName} te agregó al grupo de gastos "${name}".\n\n¡Ya puedes compartir gastos con este grupo!`,
          pt: `${creatorName} adicionou você ao grupo de despesas "${name}".\n\nAgora você pode compartilhar despesas com este grupo!`,
        };

        await sendTextMessage(cleanPhone, inviteMessages[memberLang] || inviteMessages.es);
      } catch (err) {
        console.error(`[createGroup] Failed to add member ${cleanPhone}:`, err.message);
        failedMembers.push(cleanPhone);
      }
    }

    // Build response
    let response;
    const messages = {
      en: {
        created: `Group "${name}" created!`,
        withMembers: `with ${addedMembers.length} member${addedMembers.length !== 1 ? 's' : ''}`,
        howToAdd: `\n\nTo add members: "add +573001234567 to ${name}"`,
        howToShare: `\nTo share expense: "share 50k dinner with ${name}"`,
      },
      es: {
        created: `¡Grupo "${name}" creado!`,
        withMembers: `con ${addedMembers.length} miembro${addedMembers.length !== 1 ? 's' : ''}`,
        howToAdd: `\n\nPara agregar miembros: "agregar +573001234567 a ${name}"`,
        howToShare: `\nPara compartir gasto: "compartir 50k cena con ${name}"`,
      },
      pt: {
        created: `Grupo "${name}" criado!`,
        withMembers: `com ${addedMembers.length} membro${addedMembers.length !== 1 ? 's' : ''}`,
        howToAdd: `\n\nPara adicionar membros: "adicionar +573001234567 a ${name}"`,
        howToShare: `\nPara compartilhar despesa: "compartilhar 50k jantar com ${name}"`,
      },
    };

    const msg = messages[lang] || messages.es;
    response = msg.created;
    if (addedMembers.length > 0) {
      response += ` ${msg.withMembers}`;
    }
    response += msg.howToAdd + msg.howToShare;

    return { success: true, message: response, sticker: 'celebration' };
  } catch (error) {
    console.error('[createGroup] Error:', error);
    const errorMessages = {
      en: "Failed to create group. Please try again.",
      es: "No pude crear el grupo. Intenta de nuevo.",
      pt: "Não consegui criar o grupo. Tente novamente.",
    };
    return { success: false, message: errorMessages[lang] || errorMessages.es };
  }
}

export default { definition, handler };
