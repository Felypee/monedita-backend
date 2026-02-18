/**
 * Stats Token Service - Generates and validates JWT tokens for stats page access
 * Uses magic links sent via WhatsApp for passwordless authentication
 */

import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'monedita-stats-secret-change-in-production';
const TOKEN_EXPIRY = process.env.STATS_TOKEN_EXPIRY || '1h'; // 1 hour default
const STATS_BASE_URL = process.env.STATS_BASE_URL || 'https://monedita.app';

/**
 * Generate a stats token for a user
 * @param {string} phone - User's phone number
 * @returns {string} JWT token
 */
export function generateStatsToken(phone) {
  const payload = {
    phone,
    type: 'stats',
    iat: Math.floor(Date.now() / 1000),
  };

  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

/**
 * Validate a stats token
 * @param {string} token - JWT token to validate
 * @returns {{valid: boolean, phone?: string, error?: string}}
 */
export function validateStatsToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    if (decoded.type !== 'stats') {
      return { valid: false, error: 'Invalid token type' };
    }

    return { valid: true, phone: decoded.phone };
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
 * Generate full stats URL with token
 * @param {string} phone - User's phone number
 * @returns {string} Full URL to stats page
 */
export function generateStatsUrl(phone) {
  const token = generateStatsToken(phone);
  return `${STATS_BASE_URL}/stats?token=${token}`;
}

/**
 * Get token expiry time in human readable format
 * @returns {string}
 */
export function getTokenExpiryDescription() {
  if (TOKEN_EXPIRY === '1h') return '1 hour';
  if (TOKEN_EXPIRY === '24h') return '24 hours';
  return TOKEN_EXPIRY;
}

export default {
  generateStatsToken,
  validateStatsToken,
  generateStatsUrl,
  getTokenExpiryDescription,
};
