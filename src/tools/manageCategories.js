/**
 * Tool: Manage Categories
 * Sends user a magic link to configure their categories
 */

import { generateSetupUrl } from "../services/statsTokenService.js";

export const definition = {
  name: "manage_categories",
  description: "Use when user wants to manage, add, edit, delete, change, or configure their expense categories. Examples: 'quiero agregar una categoría', 'cambiar mis categorías', 'editar categorías', 'add category', 'delete category', 'configurar categorías'",
  input_schema: {
    type: "object",
    properties: {},
    required: []
  }
};

export async function handler(phone, params, lang) {
  const setupUrl = generateSetupUrl(phone);

  const messages = {
    en: `⚙️ Set up your categories and budgets here:\n${setupUrl}`,
    es: `⚙️ Configura tus categorías y presupuestos aquí:\n${setupUrl}`,
    pt: `⚙️ Configure suas categorias e orçamentos aqui:\n${setupUrl}`,
  };

  return { success: true, message: messages[lang] || messages.en };
}

export default { definition, handler };
