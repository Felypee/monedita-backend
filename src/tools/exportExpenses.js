/**
 * Tool: Export Expenses
 * Exports expenses to CSV file
 */

import { ExpenseDB, UserDB } from "../database/index.js";
import { sendDocument } from "../utils/whatsappClient.js";
import { getMessage } from "../utils/languageUtils.js";
import { canExport, getSubscriptionStatus, getUpgradeMessage } from "../services/subscriptionService.js";

export const definition = {
  name: "export_expenses",
  description: "Export all expenses to a CSV file. Use when user wants to export, download, or get a file of their expenses. Examples: 'export', 'download expenses', 'export to csv', 'get my data'",
  input_schema: {
    type: "object",
    properties: {
      format: {
        type: "string",
        description: "Export format: csv or pdf (default csv)"
      }
    },
    required: []
  }
};

export async function handler(phone, params, lang, userCurrency) {
  const format = params.format || "csv";

  // Check if export is allowed for user's plan
  const canExportFile = await canExport(phone, format);
  if (!canExportFile) {
    const status = await getSubscriptionStatus(phone);
    const upgradeMsg = getUpgradeMessage(status.plan.id, lang);
    const msgKey = format === "pdf" ? "export_pdf_not_allowed" : "export_not_allowed";
    return { success: false, message: `${getMessage(msgKey, lang)}\n\n${upgradeMsg}` };
  }

  const expenses = await ExpenseDB.getByUser(phone);

  if (!expenses || expenses.length === 0) {
    return { success: true, message: getMessage('export_empty', lang) };
  }

  // Build CSV
  const rows = ['Date,Amount,Currency,Category,Description'];
  for (const exp of expenses) {
    const date = new Date(exp.date).toISOString().split('T')[0];
    const amount = exp.amount;
    const currency = userCurrency || '';
    const category = csvEscape(exp.category || '');
    const description = csvEscape(exp.description || '');
    rows.push(`${date},${amount},${currency},${category},${description}`);
  }

  const csvString = rows.join('\n');
  const buffer = Buffer.from(csvString, 'utf-8');
  const today = new Date().toISOString().split('T')[0];
  const filename = `expenses_${today}.csv`;

  try {
    await sendDocument(phone, buffer, filename, getMessage('export_caption', lang));
    return { success: true, message: null }; // null means document was sent, no text response
  } catch (error) {
    console.error('Error exporting expenses:', error);
    return { success: false, message: getMessage('export_error', lang) };
  }
}

function csvEscape(value) {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export default { definition, handler };
