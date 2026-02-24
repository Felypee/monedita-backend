/**
 * Bank Routes
 * Handles Open Banking related endpoints for the web widget
 */

import express from 'express';
import { createWidgetToken } from '../services/belvoService.js';
import { BankLinkDB, UserSubscriptionDB, SubscriptionPlanDB } from '../database/index.js';

const router = express.Router();

// Store pending widget sessions (phone -> token mapping)
// In production, this should be in Redis or database with TTL
const pendingWidgetSessions = new Map();

/**
 * Create a widget session for a phone number
 * Called by the connectBank tool when user wants to connect bank
 */
export async function createWidgetSession(phone) {
  const tokenResult = await createWidgetToken(phone);

  if (!tokenResult.success) {
    return { success: false, error: tokenResult.error };
  }

  // Generate a short session ID
  const sessionId = Math.random().toString(36).substring(2, 10);

  // Store the mapping (expires in 10 minutes)
  pendingWidgetSessions.set(sessionId, {
    phone,
    token: tokenResult.widgetToken,
    createdAt: Date.now(),
  });

  // Also store by phone for direct lookup
  pendingWidgetSessions.set(`phone:${phone}`, {
    phone,
    token: tokenResult.widgetToken,
    createdAt: Date.now(),
  });

  // Clean up old sessions
  setTimeout(() => {
    pendingWidgetSessions.delete(sessionId);
    pendingWidgetSessions.delete(`phone:${phone}`);
  }, 10 * 60 * 1000); // 10 minutes

  return {
    success: true,
    sessionId,
    widgetToken: tokenResult.widgetToken,
  };
}

/**
 * GET /api/bank/widget-token
 * Returns the widget token for a session or phone number
 */
router.get('/api/bank/widget-token', async (req, res) => {
  const { phone, session } = req.query;

  let sessionData = null;

  // Try to find by session ID first
  if (session) {
    sessionData = pendingWidgetSessions.get(session);
  }

  // Fall back to phone lookup
  if (!sessionData && phone) {
    sessionData = pendingWidgetSessions.get(`phone:${phone}`);
  }

  // If no existing session, try to create one (for direct phone access)
  if (!sessionData && phone) {
    // Verify user has premium plan
    try {
      const subscription = await UserSubscriptionDB.getOrCreate(phone);
      const plan = await SubscriptionPlanDB.get(subscription.planId);
      const bankConnectionsLimit = plan.bankConnections || 0;

      if (bankConnectionsLimit === 0) {
        return res.status(403).json({ error: 'Esta función requiere plan Premium' });
      }

      // Check if already has max connections
      const currentLinks = await BankLinkDB.getActiveByUser(phone);
      if (currentLinks.length >= bankConnectionsLimit) {
        return res.status(403).json({ error: 'Ya tienes el máximo de bancos conectados' });
      }

      // Create new token on the fly
      const result = await createWidgetSession(phone);
      if (!result.success) {
        return res.status(500).json({ error: result.error });
      }

      return res.json({ token: result.widgetToken, phone });
    } catch (error) {
      console.error('[bankRoutes] Error creating widget token:', error);
      return res.status(500).json({ error: 'Error al crear sesión' });
    }
  }

  if (!sessionData) {
    return res.status(404).json({
      error: 'Sesión expirada o inválida. Solicita un nuevo link desde WhatsApp.'
    });
  }

  // Check if session is expired (10 minutes)
  if (Date.now() - sessionData.createdAt > 10 * 60 * 1000) {
    return res.status(410).json({
      error: 'Sesión expirada. Solicita un nuevo link desde WhatsApp.'
    });
  }

  res.json({
    token: sessionData.token,
    phone: sessionData.phone,
  });
});

export default router;
