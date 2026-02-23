/**
 * Category utilities - Default categories per language and user category management
 *
 * Unified source of truth for category definitions across the app.
 * Categories have: id (for DB), name (localized display), emoji
 */

import { UserDB } from '../database/index.js';

/**
 * Default categories with full structure (id, name, emoji) per language
 */
export const DEFAULT_CATEGORIES = {
  en: [
    { id: 'food', name: 'Food', emoji: '🍔' },
    { id: 'transport', name: 'Transport', emoji: '🚗' },
    { id: 'shopping', name: 'Shopping', emoji: '🛒' },
    { id: 'entertainment', name: 'Entertainment', emoji: '🎬' },
    { id: 'bills', name: 'Bills', emoji: '📄' },
    { id: 'health', name: 'Health', emoji: '💊' },
    { id: 'other', name: 'Other', emoji: '📦' },
  ],
  es: [
    { id: 'comida', name: 'Comida', emoji: '🍔' },
    { id: 'transporte', name: 'Transporte', emoji: '🚗' },
    { id: 'compras', name: 'Compras', emoji: '🛒' },
    { id: 'entretenimiento', name: 'Entretenimiento', emoji: '🎬' },
    { id: 'servicios', name: 'Servicios', emoji: '📄' },
    { id: 'salud', name: 'Salud', emoji: '💊' },
    { id: 'otros', name: 'Otros', emoji: '📦' },
  ],
  pt: [
    { id: 'comida', name: 'Comida', emoji: '🍔' },
    { id: 'transporte', name: 'Transporte', emoji: '🚗' },
    { id: 'compras', name: 'Compras', emoji: '🛒' },
    { id: 'entretenimento', name: 'Entretenimento', emoji: '🎬' },
    { id: 'contas', name: 'Contas', emoji: '📄' },
    { id: 'saude', name: 'Saúde', emoji: '💊' },
    { id: 'outros', name: 'Outros', emoji: '📦' },
  ],
};

/**
 * Get default categories for a language
 * @param {string} language - Language code (en, es, pt)
 * @returns {Array<{id: string, name: string, emoji: string}>} Array of category objects
 */
export function getDefaultCategories(language) {
  return DEFAULT_CATEGORIES[language] || DEFAULT_CATEGORIES.en;
}

/**
 * Get default category IDs for a language (for backwards compatibility)
 * @param {string} language - Language code (en, es, pt)
 * @returns {string[]} Array of category IDs
 */
export function getDefaultCategoryIds(language) {
  return getDefaultCategories(language).map(c => c.id);
}

/**
 * Get user's categories (custom if set, otherwise defaults for their language)
 * @param {string} phone - User phone number
 * @param {string} language - Language code
 * @returns {Promise<Array<{id: string, name: string, emoji: string}>>} Array of category objects
 */
export async function getUserCategories(phone, language) {
  try {
    const custom = await UserDB.getCategories(phone);
    if (custom && custom.length > 0) {
      // Ensure each category has proper structure
      return custom.map(c => {
        if (typeof c === 'string') {
          // Legacy format: just string names
          return { id: c, name: c, emoji: '📦' };
        }
        return { id: c.id, name: c.name, emoji: c.emoji || '📦' };
      });
    }
  } catch (err) {
    // Gracefully handle missing column or DB errors — fall back to defaults
    console.warn('[categoryUtils] Could not load custom categories, using defaults:', err.message || err);
  }
  return getDefaultCategories(language);
}

/**
 * Get category names as a comma-separated string (for Claude prompts)
 * @param {Array<{id: string, name: string, emoji: string}>} categories
 * @returns {string} Comma-separated category names
 */
export function getCategoryNames(categories) {
  return categories.map(c => c.name || c.id).join(', ');
}

/**
 * Get category IDs as array
 * @param {Array<{id: string, name: string, emoji: string}>} categories
 * @returns {string[]} Array of category IDs
 */
export function getCategoryIds(categories) {
  return categories.map(c => c.id);
}

/**
 * Find a category by ID or name (case-insensitive)
 * @param {Array<{id: string, name: string, emoji: string}>} categories
 * @param {string} searchTerm - ID or name to search for
 * @returns {{id: string, name: string, emoji: string}|null}
 */
export function findCategory(categories, searchTerm) {
  if (!searchTerm) return null;
  const term = searchTerm.toLowerCase();
  return categories.find(c =>
    c.id.toLowerCase() === term ||
    c.name.toLowerCase() === term
  ) || null;
}
