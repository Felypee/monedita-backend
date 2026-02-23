/**
 * Subscribe Routes - API endpoints for subscription tokenization flow
 * Handles card tokenization via Wompi widget for recurring payments
 */

import express from 'express';
import rateLimit from 'express-rate-limit';
import { UserDB } from '../database/index.js';
import { validateSubscribeToken } from '../services/subscribeTokenService.js';
import {
  createPaymentSource,
  chargeRecurringPayment,
  getSubscriptionStatus,
  cancelAutoRenewal,
  getAcceptanceToken,
} from '../services/wompiRecurringService.js';
import { SUBSCRIPTION_PLANS, formatPriceCOP } from '../services/wompiService.js';
import { sendTextMessage } from '../utils/whatsappClient.js';

const router = express.Router();

// Rate limiting for subscription endpoints
const subscribeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 requests per 15 min
  message: { error: 'Too many subscription requests, please try again later' },
});

/**
 * Middleware to validate subscribe token
 */
function requireSubscribeToken(req, res, next) {
  const token = req.query.token || req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'Token required' });
  }

  const validation = validateSubscribeToken(token);

  if (!validation.valid) {
    return res.status(401).json({ error: validation.error });
  }

  req.userPhone = validation.phone;
  req.planId = validation.planId;
  next();
}

/**
 * GET /api/subscribe
 * Get subscription info and Wompi config for the widget
 */
router.get('/api/subscribe', requireSubscribeToken, async (req, res) => {
  try {
    const { userPhone, planId } = req;

    // Validate plan
    const plan = SUBSCRIPTION_PLANS[planId];
    if (!plan) {
      return res.status(400).json({ error: 'Invalid plan' });
    }

    // Get user info
    const user = await UserDB.get(userPhone);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get acceptance token for Wompi widget
    const acceptance = await getAcceptanceToken();
    if (!acceptance) {
      return res.status(500).json({ error: 'Could not get payment configuration' });
    }

    res.json({
      phone: userPhone,
      userName: user.name || `Usuario ${userPhone.slice(-4)}`,
      email: user.email || `${userPhone}@monedita.app`,
      plan: {
        id: plan.id,
        name: plan.name,
        price: plan.priceCOP,
        priceFormatted: formatPriceCOP(plan.priceCOP),
        description: plan.description,
      },
      wompiConfig: {
        publicKey: process.env.WOMPI_PUBLIC_KEY,
        acceptanceToken: acceptance.acceptanceToken,
        acceptancePermalink: acceptance.permalink,
        currency: 'COP',
        amountInCents: plan.priceCOP * 100,
      },
    });
  } catch (error) {
    console.error('[subscribeRoutes] Error getting subscribe info:', error);
    res.status(500).json({ error: 'Failed to get subscription info' });
  }
});

/**
 * POST /api/subscribe/tokenize
 * Receive card token from Wompi widget and create payment source
 */
router.post('/api/subscribe/tokenize', subscribeLimiter, requireSubscribeToken, async (req, res) => {
  try {
    const { userPhone, planId } = req;
    const { cardToken, cardInfo } = req.body;

    if (!cardToken) {
      return res.status(400).json({ error: 'Card token is required' });
    }

    console.log(`[subscribeRoutes] Creating payment source for ${userPhone}, plan: ${planId}`);

    // Create payment source from card token
    const result = await createPaymentSource(userPhone, cardToken, cardInfo || {});

    if (!result.success) {
      console.error('[subscribeRoutes] Failed to create payment source:', result.error);
      return res.status(400).json({ error: result.error });
    }

    console.log(`[subscribeRoutes] Payment source created: ${result.paymentSourceId}`);

    res.json({
      success: true,
      paymentSourceId: result.paymentSourceId,
      message: 'Payment method saved successfully',
    });
  } catch (error) {
    console.error('[subscribeRoutes] Error tokenizing card:', error);
    res.status(500).json({ error: 'Failed to save payment method' });
  }
});

/**
 * POST /api/subscribe/charge
 * Charge the first payment using the saved payment source
 */
router.post('/api/subscribe/charge', subscribeLimiter, requireSubscribeToken, async (req, res) => {
  try {
    const { userPhone, planId } = req;

    console.log(`[subscribeRoutes] Charging first payment for ${userPhone}, plan: ${planId}`);

    // Charge using the saved payment source
    const result = await chargeRecurringPayment(userPhone, planId);

    if (!result.success) {
      console.error('[subscribeRoutes] Charge failed:', result.error);
      return res.status(400).json({
        success: false,
        error: result.error,
      });
    }

    // Get user for notification
    const user = await UserDB.get(userPhone);
    const lang = user?.language || 'es';
    const plan = SUBSCRIPTION_PLANS[planId];

    // Send WhatsApp confirmation
    const messages = {
      es: `*Tu suscripción ${plan.name} está activa*

Gracias por confiar en Monedita.

Tu tarjeta quedó guardada para renovación automática mensual. Puedes cancelar cuando quieras escribiendo "cancelar suscripción".

¡Ya puedes empezar a registrar tus gastos!`,
      en: `*Your ${plan.name} subscription is active*

Thanks for trusting Monedita.

Your card is saved for automatic monthly renewal. You can cancel anytime by typing "cancel subscription".

Start tracking your expenses now!`,
      pt: `*Sua assinatura ${plan.name} está ativa*

Obrigado por confiar no Monedita.

Seu cartão foi salvo para renovação automática mensal. Você pode cancelar a qualquer momento digitando "cancelar assinatura".

Comece a registrar seus gastos agora!`,
    };

    await sendTextMessage(userPhone, messages[lang] || messages.es);

    res.json({
      success: true,
      transactionId: result.transactionId,
      message: 'Subscription activated successfully',
    });
  } catch (error) {
    console.error('[subscribeRoutes] Error charging payment:', error);
    res.status(500).json({ error: 'Failed to process payment' });
  }
});

/**
 * GET /api/subscribe/status
 * Get current subscription status including auto-renewal info
 */
router.get('/api/subscribe/status', requireSubscribeToken, async (req, res) => {
  try {
    const { userPhone } = req;

    const status = await getSubscriptionStatus(userPhone);

    res.json({
      success: true,
      subscription: status,
    });
  } catch (error) {
    console.error('[subscribeRoutes] Error getting status:', error);
    res.status(500).json({ error: 'Failed to get subscription status' });
  }
});

/**
 * POST /api/subscribe/cancel
 * Cancel auto-renewal (subscription remains active until expiry)
 */
router.post('/api/subscribe/cancel', subscribeLimiter, requireSubscribeToken, async (req, res) => {
  try {
    const { userPhone } = req;

    console.log(`[subscribeRoutes] Cancelling auto-renewal for ${userPhone}`);

    const result = await cancelAutoRenewal(userPhone);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    // Get user for notification
    const user = await UserDB.get(userPhone);
    const lang = user?.language || 'es';

    const messages = {
      es: `Tu renovación automática ha sido cancelada. Tu plan actual seguirá activo hasta el final del período.

Puedes reactivar cuando quieras escribiendo "upgrade".`,
      en: `Your auto-renewal has been cancelled. Your current plan will remain active until the end of the period.

You can reactivate anytime by typing "upgrade".`,
      pt: `Sua renovação automática foi cancelada. Seu plano atual permanecerá ativo até o final do período.

Você pode reativar a qualquer momento digitando "upgrade".`,
    };

    await sendTextMessage(userPhone, messages[lang] || messages.es);

    res.json({
      success: true,
      message: 'Auto-renewal cancelled',
    });
  } catch (error) {
    console.error('[subscribeRoutes] Error cancelling:', error);
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

export default router;
