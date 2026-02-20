/**
 * Setup Routes - API endpoints for the category/budget setup page
 * Uses JWT tokens for authentication (same as stats page)
 */

import express from 'express';
import { UserDB, BudgetDB } from '../database/index.js';
import { validateSetupToken } from '../services/statsTokenService.js';

const router = express.Router();

/**
 * Middleware to validate setup token
 */
function requireSetupToken(req, res, next) {
  const token = req.query.token || req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'Token required' });
  }

  const validation = validateSetupToken(token);

  if (!validation.valid) {
    return res.status(401).json({ error: validation.error });
  }

  req.userPhone = validation.phone;
  next();
}

/**
 * GET /api/setup
 * Get user's current setup (categories, budgets, currency)
 */
router.get('/api/setup', requireSetupToken, async (req, res) => {
  try {
    const phone = req.userPhone;

    const user = await UserDB.get(phone);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const categories = await UserDB.getCategories(phone);
    const budgets = await BudgetDB.getByUser(phone);

    res.json({
      phone,
      currency: user.currency,
      language: user.language,
      setup_complete: user.setup_complete || false,
      categories: categories || null,
      budgets: budgets || [],
    });
  } catch (error) {
    console.error('[setupRoutes] Error getting setup:', error);
    res.status(500).json({ error: 'Failed to get configuration' });
  }
});

/**
 * POST /api/setup
 * Save user's category and budget configuration
 * Body: {
 *   categories: [
 *     { id: "food", name: "Comida", emoji: "🍔", budget: 500000 },
 *     { id: "transport", name: "Transporte", emoji: "🚗", budget: 200000 }
 *   ]
 * }
 */
router.post('/api/setup', requireSetupToken, async (req, res) => {
  try {
    const phone = req.userPhone;
    const { categories } = req.body;

    // Validate categories
    if (!categories || !Array.isArray(categories) || categories.length === 0) {
      return res.status(400).json({ error: 'At least one category is required' });
    }

    // Save categories to user
    const categoryList = categories.map(cat => ({
      id: cat.id,
      name: cat.name,
      emoji: cat.emoji || '📦',
    }));
    await UserDB.setCategories(phone, categoryList);

    // Create/update budgets for categories that have a budget set
    const budgetsCreated = [];
    for (const cat of categories) {
      if (cat.budget && parseFloat(cat.budget) > 0) {
        await BudgetDB.create(phone, {
          category: cat.id,
          amount: parseFloat(cat.budget),
          period: 'monthly',
        });
        budgetsCreated.push({
          category: cat.id,
          amount: parseFloat(cat.budget),
        });
      }
    }

    // Mark user as setup complete
    await UserDB.update(phone, { setup_complete: true });

    res.json({
      success: true,
      message: 'Configuration saved successfully',
      data: {
        categoriesCount: categoryList.length,
        budgetsCount: budgetsCreated.length,
      },
    });
  } catch (error) {
    console.error('[setupRoutes] Error saving setup:', error);
    res.status(500).json({ error: 'Failed to save configuration' });
  }
});

/**
 * GET /api/setup/categories
 * Get default categories for a language (public, no auth required)
 */
router.get('/api/setup/categories', (req, res) => {
  const lang = req.query.lang || 'es';

  const categories = {
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

  res.json({
    language: lang,
    categories: categories[lang] || categories.es,
  });
});

export default router;
