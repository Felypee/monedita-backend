/**
 * Tool: Import Expenses from Excel/CSV
 * Parses uploaded file and imports expenses in batch
 */

import { ExpenseDB, UserDB } from "../database/index.js";
import { formatAmount } from "../utils/currencyUtils.js";
import { getMessage } from "../utils/languageUtils.js";
import { getUserCategories, findCategory } from "../utils/categoryUtils.js";
import { parseExcelFile } from "../utils/excelProcessor.js";
import { downloadMedia } from "../utils/whatsappClient.js";
import {
  checkMoneditas,
  consumeMoneditas,
  getMoneditasStatus,
  getUpgradeMessage,
} from "../services/moneditasService.js";

// Cost per imported expense (minimal since no AI processing)
const MONEDITAS_PER_IMPORT = 0.5;
const MAX_IMPORT_ROWS = 500;

export const definition = {
  name: "import_expenses",
  description: `Import expenses from an Excel or CSV file. Use this when user sends a spreadsheet file or asks to import expenses from a file.`,
  input_schema: {
    type: "object",
    properties: {
      mediaId: {
        type: "string",
        description: "Media ID of the uploaded document"
      },
      confirm: {
        type: "boolean",
        description: "Set to true to confirm import after preview"
      }
    },
    required: ["mediaId"]
  }
};

// Store pending imports for confirmation flow
const pendingImports = new Map(); // phone -> { expenses, timestamp }

export async function handler(phone, params, lang, userCurrency) {
  const { mediaId, confirm } = params;

  // If confirming a previous import
  if (confirm) {
    return await confirmImport(phone, lang, userCurrency);
  }

  // New import - download and parse file
  try {
    // Check if currency is set
    if (!userCurrency) {
      return { success: false, message: getMessage('currency_not_set', lang) };
    }

    // Download the document
    const { buffer, mimeType } = await downloadMedia(mediaId);

    // Validate file type
    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel', // .xls
      'text/csv',
      'application/csv',
    ];

    if (!validTypes.some(t => mimeType.includes(t) || mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType.includes('csv'))) {
      const messages = {
        en: "Please send an Excel file (.xlsx, .xls) or CSV file.",
        es: "Por favor envía un archivo Excel (.xlsx, .xls) o CSV.",
        pt: "Por favor envie um arquivo Excel (.xlsx, .xls) ou CSV."
      };
      return { success: false, message: messages[lang] || messages.es };
    }

    // Parse the file
    const result = parseExcelFile(buffer, mimeType, userCurrency);

    if (!result.success) {
      return {
        success: false,
        message: getMessage('import_parse_error', lang) || `Error parsing file: ${result.errors.join(', ')}`
      };
    }

    if (result.expenses.length === 0) {
      const messages = {
        en: "No expenses found in the file. Make sure it has an 'amount' column.",
        es: "No se encontraron gastos en el archivo. Asegúrate de que tenga una columna de 'monto' o 'amount'.",
        pt: "Nenhuma despesa encontrada no arquivo. Certifique-se de que tenha uma coluna 'valor' ou 'amount'."
      };
      return { success: false, message: messages[lang] || messages.es };
    }

    // Estimate moneditas cost
    const estimatedCost = Math.ceil(result.expenses.length * MONEDITAS_PER_IMPORT);

    // Check if user has enough moneditas
    const moneditasCheck = await checkMoneditas(phone, estimatedCost);
    if (!moneditasCheck.allowed) {
      const status = await getMoneditasStatus(phone);
      const messages = {
        en: `Importing ${result.expenses.length} expenses requires ${estimatedCost} moneditas.`,
        es: `Importar ${result.expenses.length} gastos requiere ${estimatedCost} moneditas.`,
        pt: `Importar ${result.expenses.length} despesas requer ${estimatedCost} moneditas.`
      };
      const upgradeMsg = getUpgradeMessage(status.plan.id, lang);
      return {
        success: false,
        message: `${messages[lang] || messages.es}\n\n${moneditasCheck.message || ''}\n\n${upgradeMsg}`
      };
    }

    // Store pending import
    pendingImports.set(phone, {
      expenses: result.expenses,
      timestamp: Date.now(),
      estimatedCost,
    });

    // Clean old pending imports (older than 10 minutes)
    setTimeout(() => {
      const pending = pendingImports.get(phone);
      if (pending && Date.now() - pending.timestamp > 10 * 60 * 1000) {
        pendingImports.delete(phone);
      }
    }, 10 * 60 * 1000);

    // Build preview message
    const messages = {
      en: `📊 **Preview** (${result.expenses.length} expenses)\n\n${result.preview}\n\n💰 Cost: ${estimatedCost} moneditas\n\nReply "yes" or "sí" to import, or "no" to cancel.`,
      es: `📊 **Vista previa** (${result.expenses.length} gastos)\n\n${result.preview}\n\n💰 Costo: ${estimatedCost} moneditas\n\nResponde "sí" para importar o "no" para cancelar.`,
      pt: `📊 **Prévia** (${result.expenses.length} despesas)\n\n${result.preview}\n\n💰 Custo: ${estimatedCost} moneditas\n\nResponda "sim" para importar ou "não" para cancelar.`
    };

    let message = messages[lang] || messages.es;

    // Add errors if any
    if (result.errors.length > 0) {
      const errorMessages = {
        en: "\n\n⚠️ Warnings:",
        es: "\n\n⚠️ Advertencias:",
        pt: "\n\n⚠️ Avisos:"
      };
      message += (errorMessages[lang] || errorMessages.es) + '\n' + result.errors.slice(0, 3).join('\n');
    }

    return {
      success: true,
      message,
      awaitingConfirmation: true,
    };

  } catch (error) {
    console.error('[importExpenses] Error:', error);
    return {
      success: false,
      message: getMessage('error_generic', lang)
    };
  }
}

/**
 * Confirm and execute pending import
 */
async function confirmImport(phone, lang, userCurrency) {
  const pending = pendingImports.get(phone);

  if (!pending) {
    const messages = {
      en: "No pending import found. Please send the file again.",
      es: "No hay importación pendiente. Por favor envía el archivo de nuevo.",
      pt: "Nenhuma importação pendente. Por favor envie o arquivo novamente."
    };
    return { success: false, message: messages[lang] || messages.es };
  }

  // Check if expired (10 minutes)
  if (Date.now() - pending.timestamp > 10 * 60 * 1000) {
    pendingImports.delete(phone);
    const messages = {
      en: "Import expired. Please send the file again.",
      es: "La importación expiró. Por favor envía el archivo de nuevo.",
      pt: "A importação expirou. Por favor envie o arquivo novamente."
    };
    return { success: false, message: messages[lang] || messages.es };
  }

  try {
    // Get user's categories for mapping
    const userCategories = await getUserCategories(phone, lang);

    // Import expenses
    let imported = 0;
    let skipped = 0;
    const categoryStats = {};

    for (const exp of pending.expenses) {
      // Map category if exists
      let finalCategory = 'otros';
      if (exp.category) {
        const found = findCategory(userCategories, exp.category);
        finalCategory = found ? found.id : exp.category;
      }

      // Check for duplicates (same date, amount, description)
      const existing = await ExpenseDB.findDuplicate(phone, {
        amount: exp.amount,
        date: exp.date,
        description: exp.description,
      });

      if (existing) {
        skipped++;
        continue;
      }

      // Create expense
      await ExpenseDB.create(phone, {
        amount: exp.amount,
        category: finalCategory,
        description: exp.description || '',
        created_at: exp.date,
        source: 'excel_import',
      });

      imported++;
      categoryStats[finalCategory] = (categoryStats[finalCategory] || 0) + 1;
    }

    // Consume moneditas
    const actualCost = Math.max(1, Math.ceil(imported * MONEDITAS_PER_IMPORT));
    await consumeMoneditas(phone, actualCost, "excel_import");

    // Clear pending import
    pendingImports.delete(phone);

    // Build success message
    const categoryList = Object.entries(categoryStats)
      .map(([cat, count]) => `• ${cat}: ${count}`)
      .join('\n');

    const messages = {
      en: `✅ **Import complete!**\n\n📥 Imported: ${imported}\n⏭️ Skipped (duplicates): ${skipped}\n💰 Cost: ${actualCost} moneditas\n\n**By category:**\n${categoryList}`,
      es: `✅ **¡Importación completa!**\n\n📥 Importados: ${imported}\n⏭️ Omitidos (duplicados): ${skipped}\n💰 Costo: ${actualCost} moneditas\n\n**Por categoría:**\n${categoryList}`,
      pt: `✅ **Importação concluída!**\n\n📥 Importados: ${imported}\n⏭️ Ignorados (duplicados): ${skipped}\n💰 Custo: ${actualCost} moneditas\n\n**Por categoria:**\n${categoryList}`
    };

    return {
      success: true,
      message: messages[lang] || messages.es,
      sticker: 'celebrate',
    };

  } catch (error) {
    console.error('[importExpenses] Error confirming import:', error);
    pendingImports.delete(phone);
    return {
      success: false,
      message: getMessage('error_generic', lang)
    };
  }
}

/**
 * Cancel pending import
 */
export function cancelImport(phone) {
  pendingImports.delete(phone);
}

/**
 * Check if user has pending import
 */
export function hasPendingImport(phone) {
  const pending = pendingImports.get(phone);
  if (!pending) return false;
  // Check if not expired
  return Date.now() - pending.timestamp < 10 * 60 * 1000;
}

export default { definition, handler, cancelImport, hasPendingImport };
