/**
 * Category utilities - Default categories per language and user category management
 */

import { UserDB } from '../database/index.js';

const DEFAULT_CATEGORIES = {
  en: ['food', 'transport', 'shopping', 'entertainment', 'bills', 'health', 'other'],
  es: ['comida', 'transporte', 'compras', 'entretenimiento', 'servicios', 'salud', 'otros'],
  pt: ['comida', 'transporte', 'compras', 'entretenimento', 'contas', 'saúde', 'outros'],
};

/**
 * Get default categories for a language
 * @param {string} language - Language code (en, es, pt)
 * @returns {string[]} Array of default category names
 */
export function getDefaultCategories(language) {
  return DEFAULT_CATEGORIES[language] || DEFAULT_CATEGORIES.en;
}

/**
 * Get user's categories (custom if set, otherwise defaults for their language)
 * @param {string} phone - User phone number
 * @param {string} language - Language code
 * @returns {Promise<string[]>} Array of category names
 */
export async function getUserCategories(phone, language) {
  const custom = await UserDB.getCategories(phone);
  if (custom && custom.length > 0) {
    return custom;
  }
  return getDefaultCategories(language);
}
