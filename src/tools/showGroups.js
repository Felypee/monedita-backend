/**
 * Tool: Show Groups
 * Lists user's expense groups
 */

import { ExpenseGroupDB, GroupMemberDB, UserDB } from "../database/index.js";

export const definition = {
  name: "show_groups",
  description: "List all expense groups the user belongs to. Use when user asks about their groups, wants to see groups, or manage group memberships. Examples: 'my groups', 'show groups', 'list groups', 'mis grupos', 'ver grupos'",
  input_schema: {
    type: "object",
    properties: {},
    required: []
  }
};

export async function handler(phone, params, lang, userCurrency) {
  try {
    const groups = await ExpenseGroupDB.getByUser(phone);

    if (!groups || groups.length === 0) {
      const messages = {
        en: "You don't have any expense groups yet.\n\nCreate one: 'create group Roommates'",
        es: "No tienes grupos de gastos aún.\n\nCrea uno: 'crear grupo Compas de depa'",
        pt: "Você ainda não tem grupos de despesas.\n\nCrie um: 'criar grupo Colegas'",
      };
      return { success: true, message: messages[lang] || messages.es };
    }

    const headers = {
      en: "*Your expense groups:*\n\n",
      es: "*Tus grupos de gastos:*\n\n",
      pt: "*Seus grupos de despesas:*\n\n",
    };

    let response = headers[lang] || headers.es;

    for (const group of groups) {
      const members = await GroupMemberDB.getByGroup(group.id);
      const isOwner = members.some(m => m.phone === phone && m.role === 'owner');

      // Get member names
      const memberNames = [];
      for (const member of members) {
        if (member.phone !== phone) {
          const user = await UserDB.get(member.phone);
          memberNames.push(user?.name || `...${member.phone.slice(-4)}`);
        }
      }

      const roleEmoji = isOwner ? '👑' : '👤';
      response += `${roleEmoji} *${group.name}*\n`;
      response += `   ${members.length} ${lang === 'es' ? 'miembros' : lang === 'pt' ? 'membros' : 'members'}`;

      if (memberNames.length > 0) {
        const othersLabel = {
          en: memberNames.length === 1 ? 'with' : 'with',
          es: 'con',
          pt: 'com',
        };
        const displayNames = memberNames.slice(0, 3).join(', ');
        const moreCount = memberNames.length > 3 ? ` +${memberNames.length - 3}` : '';
        response += ` (${othersLabel[lang] || othersLabel.es} ${displayNames}${moreCount})`;
      }
      response += '\n\n';
    }

    // Add helpful tips
    const tips = {
      en: "Share expense: 'share 50k dinner with [group]'\nAdd member: 'add +573... to [group]'",
      es: "Compartir gasto: 'compartir 50k cena con [grupo]'\nAgregar miembro: 'agregar +573... a [grupo]'",
      pt: "Compartilhar despesa: 'compartilhar 50k jantar com [grupo]'\nAdicionar membro: 'adicionar +55... a [grupo]'",
    };

    response += tips[lang] || tips.es;

    return { success: true, message: response };
  } catch (error) {
    console.error('[showGroups] Error:', error);
    const errorMessages = {
      en: "Failed to load groups. Please try again.",
      es: "No pude cargar los grupos. Intenta de nuevo.",
      pt: "Não consegui carregar os grupos. Tente novamente.",
    };
    return { success: false, message: errorMessages[lang] || errorMessages.es };
  }
}

export default { definition, handler };
