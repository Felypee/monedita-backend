/**
 * Subscribe Token Service - Generates and validates JWT tokens for subscription page access
 * Uses short-lived tokens (15 min) for security since they contain payment intent
 */

import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'monedita-stats-secret-change-in-production';
const TOKEN_EXPIRY = '15m'; // Short expiry for security
const SUBSCRIBE_BASE_URL = process.env.STATS_BASE_URL || 'https://monedita.app';

/**
 * Generate a subscribe token for a user with plan info
 * @param {string} phone - User's phone number
 * @param {string} planId - Selected plan (basic or premium)
 * @returns {string} JWT token
 */
export function generateSubscribeToken(phone, planId) {
  const payload = {
    phone,
    planId,
    type: 'subscribe',
    iat: Math.floor(Date.now() / 1000),
  };

  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

/**
 * Validate a subscribe token
 * @param {string} token - JWT token to validate
 * @returns {{valid: boolean, phone?: string, planId?: string, error?: string}}
 */
export function validateSubscribeToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    if (decoded.type !== 'subscribe') {
      return { valid: false, error: 'Invalid token type' };
    }

    return {
      valid: true,
      phone: decoded.phone,
      planId: decoded.planId,
    };
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return { valid: false, error: 'Token expired' };
    }
    if (error.name === 'JsonWebTokenError') {
      return { valid: false, error: 'Invalid token' };
    }
    return { valid: false, error: 'Token validation failed' };
  }
}

/**
 * Generate full subscribe URL with token
 * @param {string} phone - User's phone number
 * @param {string} planId - Selected plan (basic or premium)
 * @returns {string} Full URL to subscribe page
 */
export function generateSubscribeUrl(phone, planId) {
  const token = generateSubscribeToken(phone, planId);
  return `${SUBSCRIBE_BASE_URL}/subscribe?token=${token}`;
}

export default {
  generateSubscribeToken,
  validateSubscribeToken,
  generateSubscribeUrl,
};
