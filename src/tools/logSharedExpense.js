/**
 * Tool: Log Shared Expense
 * Records a shared expense and splits it among group members
 */

import { ExpenseGroupDB, GroupMemberDB, SharedExpenseDB, ExpenseSplitDB, UserDB } from "../database/index.js";
import { formatAmount } from "../utils/currencyUtils.js";
import { sendTextMessage } from "../utils/whatsappClient.js";
import { getUserCategories, getCategoryNames } from "../utils/categoryUtils.js";
import { validateCategory } from "../schemas/expenseSchema.js";

export const definition = {
  name: "log_shared_expense",
  description: "Log a shared expense to split with a group or specific people. Use when user wants to share/split an expense, divide costs, or record group spending. Examples: 'share 100k dinner with Casa', 'split 50 uber with Maria', 'compartir 200k mercado con grupo Casa', 'dividir cena 80k entre todos'",
  input_schema: {
    type: "object",
    properties: {
      amount: {
        type: "number",
        description: "The total expense amount to split"
      },
      category: {
        type: "string",
        description: "Expense category (food, transport, etc.)"
      },
      description: {
        type: "string",
        description: "Description of the expense"
      },
      groupName: {
        type: "string",
        description: "Name of the expense group to split with"
      },
      members: {
        type: "array",
        description: "Specific phone numbers to split with (if not using a group)",
        items: {
          type: "string"
        }
      },
      splitType: {
        type: "string",
        enum: ["equal", "custom"],
        description: "How to split: 'equal' divides evenly, 'custom' for specific amounts"
      }
    },
    required: ["amount", "description"]
  }
};

export async function handler(phone, params, lang, userCurrency) {
  const {
    amount,
    category = 'otros',
    description = '',
    groupName,
    members = [],
    splitType = 'equal'
  } = params;

  if (!amount || amount <= 0) {
    const messages = {
      en: "Please specify a valid amount to share.",
      es: "Por favor especifica un monto válido para compartir.",
      pt: "Por favor, especifique um valor válido para compartilhar.",
    };
    return { success: false, message: messages[lang] || messages.es };
  }

  // Validate category
  const allowedCategories = await getUserCategories(phone, lang);
  const categoryValidation = validateCategory(category, allowedCategories);
  const normalizedCategory = categoryValidation.valid
    ? categoryValidation.matchedCategory.id
    : allowedCategories[0]?.id || 'otros';

  try {
    let targetMembers = [];
    let groupId = null;
    let groupDisplay = '';

    // If group name provided, find the group and get its members
    if (groupName) {
      const group = await ExpenseGroupDB.findByName(phone, groupName);
      if (!group) {
        const categoryNames = getCategoryNames(allowedCategories);
        const messages = {
          en: `Group "${groupName}" not found. Your groups: `,
          es: `Grupo "${groupName}" no encontrado. Tus grupos: `,
          pt: `Grupo "${groupName}" não encontrado. Seus grupos: `,
        };
        const userGroups = await ExpenseGroupDB.getByUser(phone);
        const groupList = userGroups.map(g => g.name).join(', ') || (lang === 'es' ? 'ninguno' : 'none');
        return { success: false, message: messages[lang] + groupList };
      }

      groupId = group.id;
      groupDisplay = group.name;
      const groupMembers = await GroupMemberDB.getByGroup(group.id);
      targetMembers = groupMembers
        .filter(m => m.phone !== phone)
        .map(m => m.phone);
    } else if (members.length > 0) {
      // Use provided members
      targetMembers = members
        .map(m => m.replace(/[^\d+]/g, ''))
        .filter(m => m && m !== phone);
      groupDisplay = `${targetMembers.length} ${lang === 'es' ? 'personas' : 'people'}`;
    } else {
      const messages = {
        en: "Please specify a group or people to share with.\nExample: 'share 50k dinner with Casa' or 'split 30 with +573001234567'",
        es: "Por favor especifica un grupo o personas para compartir.\nEjemplo: 'compartir 50k cena con Casa' o 'dividir 30 con +573001234567'",
        pt: "Por favor, especifique um grupo ou pessoas para compartilhar.\nExemplo: 'compartilhar 50k jantar com Casa' ou 'dividir 30 com +5511999999999'",
      };
      return { success: false, message: messages[lang] || messages.es };
    }

    if (targetMembers.length === 0) {
      const messages = {
        en: "The group has no other members yet. Add members first!",
        es: "El grupo no tiene otros miembros aún. ¡Agrega miembros primero!",
        pt: "O grupo ainda não tem outros membros. Adicione membros primeiro!",
      };
      return { success: false, message: messages[lang] || messages.es };
    }

    // Create the shared expense
    const expense = await SharedExpenseDB.create(phone, {
      groupId,
      amount,
      category: normalizedCategory,
      description,
      splitType,
    });

    // Calculate splits (equal split for now)
    const totalPeople = targetMembers.length + 1; // Include creator
    const splitAmount = amount / totalPeople;

    // Create splits for each member (not including creator - they paid)
    const splits = targetMembers.map(memberPhone => ({
      phone: memberPhone,
      amount: splitAmount,
    }));

    await ExpenseSplitDB.createMany(expense.id, splits);

    // Get creator's name
    const creator = await UserDB.get(phone);
    const creatorName = creator?.name || phone;

    // Notify each member
    for (const memberPhone of targetMembers) {
      try {
        const memberUser = await UserDB.get(memberPhone);
        const memberLang = memberUser?.language || 'es';
        const memberCurrency = memberUser?.currency || userCurrency;

        const notifyMessages = {
          en: `${creatorName} shared an expense:\n\n📝 ${description}\n💰 Total: ${formatAmount(amount, memberCurrency)}\n👤 Your share: ${formatAmount(splitAmount, memberCurrency)}\n\nReply "pay ${creatorName}" when you've paid.`,
          es: `${creatorName} compartió un gasto:\n\n📝 ${description}\n💰 Total: ${formatAmount(amount, memberCurrency)}\n👤 Tu parte: ${formatAmount(splitAmount, memberCurrency)}\n\nResponde "pagar a ${creatorName}" cuando hayas pagado.`,
          pt: `${creatorName} compartilhou uma despesa:\n\n📝 ${description}\n💰 Total: ${formatAmount(amount, memberCurrency)}\n👤 Sua parte: ${formatAmount(splitAmount, memberCurrency)}\n\nResponda "pagar ${creatorName}" quando tiver pago.`,
        };

        await sendTextMessage(memberPhone, notifyMessages[memberLang] || notifyMessages.es);
      } catch (err) {
        console.error(`[logSharedExpense] Failed to notify ${memberPhone}:`, err.message);
      }
    }

    // Build response for creator
    const responseMessages = {
      en: `Shared expense logged!\n\n📝 ${description}\n💰 Total: ${formatAmount(amount, userCurrency)}\n👥 Split with: ${groupDisplay}\n👤 Each person: ${formatAmount(splitAmount, userCurrency)}\n\n${targetMembers.length} ${targetMembers.length === 1 ? 'person notified' : 'people notified'}`,
      es: `¡Gasto compartido registrado!\n\n📝 ${description}\n💰 Total: ${formatAmount(amount, userCurrency)}\n👥 Dividido con: ${groupDisplay}\n👤 Cada uno: ${formatAmount(splitAmount, userCurrency)}\n\n${targetMembers.length} ${targetMembers.length === 1 ? 'persona notificada' : 'personas notificadas'}`,
      pt: `Despesa compartilhada registrada!\n\n📝 ${description}\n💰 Total: ${formatAmount(amount, userCurrency)}\n👥 Dividido com: ${groupDisplay}\n👤 Cada um: ${formatAmount(splitAmount, userCurrency)}\n\n${targetMembers.length} ${targetMembers.length === 1 ? 'pessoa notificada' : 'pessoas notificadas'}`,
    };

    return { success: true, message: responseMessages[lang] || responseMessages.es, sticker: 'money' };
  } catch (error) {
    console.error('[logSharedExpense] Error:', error);
    const errorMessages = {
      en: "Failed to create shared expense. Please try again.",
      es: "No pude crear el gasto compartido. Intenta de nuevo.",
      pt: "Não consegui criar a despesa compartilhada. Tente novamente.",
    };
    return { success: false, message: errorMessages[lang] || errorMessages.es };
  }
}

export default { definition, handler };
