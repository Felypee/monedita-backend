/**
 * Tool: Show Summary
 * Redirects user to the visual stats page with a magic link
 */

import { generateStatsUrl, getTokenExpiryDescription } from "../services/statsTokenService.js";
import { ExpenseDB } from "../database/index.js";
import { formatAmount } from "../utils/currencyUtils.js";

export const definition = {
  name: "show_summary",
  description: "Show spending summary and financial status for current month. Use when user asks about their spending, status, overview, or 'how am I doing'. Examples: 'show summary', 'how am I doing', 'my spending', 'status'",
  input_schema: {
    type: "object",
    properties: {},
    required: []
  }
};

export async function handler(phone, params, lang, userCurrency) {
  const statsUrl = generateStatsUrl(phone);
  const expiryTime = getTokenExpiryDescription();

  // Get quick stats for the teaser
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const expenses = (await ExpenseDB.getByDateRange(phone, startOfMonth, endOfMonth)) || [];
  const totalSpent = expenses.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);

  const locale = lang === 'es' ? 'es' : lang === 'pt' ? 'pt' : 'en';
  const monthName = now.toLocaleString(locale, { month: "long" });

  const messages = {
    en: `📊 *Summary for ${monthName}*

💰 Total: ${formatAmount(totalSpent, userCurrency)} (${expenses.length} expenses)

View your complete report with charts and filters:

${statsUrl}

This link is valid for ${expiryTime}.`,
    es: `📊 *Resumen de ${monthName}*

💰 Total: ${formatAmount(totalSpent, userCurrency)} (${expenses.length} gastos)

Ve tu reporte completo con gráficos y filtros:

${statsUrl}

Este link es válido por ${expiryTime}.`,
    pt: `📊 *Resumo de ${monthName}*

💰 Total: ${formatAmount(totalSpent, userCurrency)} (${expenses.length} despesas)

Veja seu relatório completo com gráficos e filtros:

${statsUrl}

Este link é válido por ${expiryTime}.`
  };

  return { success: true, message: messages[lang] || messages.es };
}

export default { definition, handler };
