/**
 * Tool: Show Stats
 * Generates a magic link to the visual stats page
 */

import { generateStatsUrl, getTokenExpiryDescription } from "../services/statsTokenService.js";
import { getMessage } from "../utils/languageUtils.js";

export const definition = {
  name: "show_stats",
  description: "Show user's expense statistics and reports. Use when user asks for stats, reports, graphics, charts, visual summary, or wants to see their spending analysis. Examples: 'show my stats', 'ver mis estadísticas', 'quiero ver gráficos', 'my report'",
  input_schema: {
    type: "object",
    properties: {},
    required: []
  }
};

export async function handler(phone, params, lang, userCurrency) {
  const statsUrl = generateStatsUrl(phone);
  const expiryTime = getTokenExpiryDescription();

  const messages = {
    en: `📊 *Your Stats Page*

Click here to see your expense report with charts and filters:

${statsUrl}

This link is valid for ${expiryTime}.`,
    es: `📊 *Tu Página de Estadísticas*

Haz clic aquí para ver tu reporte de gastos con gráficos y filtros:

${statsUrl}

Este link es válido por ${expiryTime}.`,
    pt: `📊 *Sua Página de Estatísticas*

Clique aqui para ver seu relatório de despesas com gráficos e filtros:

${statsUrl}

Este link é válido por ${expiryTime}.`
  };

  return {
    success: true,
    message: messages[lang] || messages.es
  };
}

export default { definition, handler };
