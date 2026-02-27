/**
 * Tool: Create Category
 * Creates a new expense category for the user
 */

import { UserDB } from "../database/index.js";

// Default emojis based on common category names
const CATEGORY_EMOJIS = {
  comida: '🍔', food: '🍔', alimentacion: '🍔',
  transporte: '🚗', transport: '🚗', uber: '🚗', taxi: '🚗',
  compras: '🛒', shopping: '🛒',
  entretenimiento: '🎬', entertainment: '🎬', ocio: '🎬',
  servicios: '📄', bills: '📄', cuentas: '📄', facturas: '📄',
  salud: '💊', health: '💊', medicina: '💊',
  hogar: '🏠', home: '🏠', casa: '🏠', arriendo: '🏠', alquiler: '🏠',
  educacion: '📚', education: '📚',
  ahorro: '💰', savings: '💰',
  viajes: '✈️', travel: '✈️',
  mascotas: '🐕', pets: '🐕',
  ropa: '👕', clothes: '👕',
  gym: '💪', gimnasio: '💪', deporte: '💪',
  cafe: '☕', coffee: '☕',
  suscripciones: '📱', subscriptions: '📱',
};

function getEmoji(categoryName) {
  const normalized = categoryName.toLowerCase().trim();
  return CATEGORY_EMOJIS[normalized] || '📦';
}

export const definition = {
  name: "create_category",
  description: `Create a new expense category for the user. Use when:
- User confirms they want to create a category you suggested
- User explicitly asks to create a new category
- User is new and needs their first category to log an expense`,
  input_schema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Category name (e.g., 'Comida', 'Transporte', 'Entretenimiento')"
      },
      emoji: {
        type: "string",
        description: "Optional emoji for the category. If not provided, one will be auto-assigned."
      }
    },
    required: ["name"]
  }
};

export async function handler(phone, params, lang) {
  const { name, emoji } = params;

  if (!name || name.trim().length === 0) {
    const messages = {
      en: "Please provide a category name",
      es: "Por favor indica el nombre de la categoría",
      pt: "Por favor, informe o nome da categoria",
    };
    return { success: false, message: messages[lang] || messages.en };
  }

  const categoryName = name.trim();
  const categoryId = categoryName.toLowerCase().replace(/\s+/g, '_');
  const categoryEmoji = emoji || getEmoji(categoryName);

  try {
    // Get existing categories
    let categories = [];
    try {
      categories = await UserDB.getCategories(phone) || [];
    } catch (err) {
      categories = [];
    }

    // Check if category already exists
    const exists = categories.some(c =>
      (typeof c === 'string' ? c : c.id).toLowerCase() === categoryId
    );

    if (exists) {
      const messages = {
        en: `Category "${categoryName}" already exists`,
        es: `La categoría "${categoryName}" ya existe`,
        pt: `A categoria "${categoryName}" já existe`,
      };
      return { success: false, message: messages[lang] || messages.es };
    }

    // Add new category
    const newCategory = { id: categoryId, name: categoryName, emoji: categoryEmoji };
    categories.push(newCategory);

    await UserDB.setCategories(phone, categories);

    const messages = {
      en: `${categoryEmoji} Category "${categoryName}" created!`,
      es: `${categoryEmoji} Categoría "${categoryName}" creada!`,
      pt: `${categoryEmoji} Categoria "${categoryName}" criada!`,
    };

    return { success: true, message: messages[lang] || messages.es };
  } catch (error) {
    console.error('[createCategory] Error:', error);
    const messages = {
      en: "Error creating category. Please try again.",
      es: "Error al crear la categoría. Intenta de nuevo.",
      pt: "Erro ao criar categoria. Tente novamente.",
    };
    return { success: false, message: messages[lang] || messages.es };
  }
}

export default { definition, handler };
