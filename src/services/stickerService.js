/**
 * Sticker Service
 * Manages sticker URLs and random selection for different contexts
 *
 * Sticker Requirements (WhatsApp):
 * - Format: WebP (static or animated)
 * - Dimensions: 512x512 pixels
 * - Static stickers: max 100KB
 * - Animated stickers: max 500KB, animated WebP format
 *
 * To create animated stickers:
 * 1. Create animation as GIF or video
 * 2. Convert to animated WebP using tools like:
 *    - ffmpeg: ffmpeg -i input.gif -vcodec libwebp -lossless 0 -loop 0 -vf scale=512:512 output.webp
 *    - Online: ezgif.com/gif-to-webp
 * 3. Ensure file is under 500KB
 */

import { sendSticker } from "../utils/whatsappClient.js";

// Rate limiting: track last sticker sent per user
const lastStickerSent = new Map(); // phone -> { timestamp, stickerId }

// Cooldown: 1 hour by default, configurable via env
const STICKER_COOLDOWN_MS = (parseInt(process.env.STICKER_COOLDOWN_MINUTES, 10) || 60) * 60 * 1000;

// Sticker URLs - Served from the Express server's public folder
// Set SERVER_URL in production (e.g., https://budget-agent-production.up.railway.app)
const SERVER_URL = process.env.SERVER_URL || "http://localhost:3000";
const STICKER_BASE_URL = `${SERVER_URL}/stickers`;

const STICKERS = {
  welcome: [
    `${STICKER_BASE_URL}/welcome-1.webp`,
  ],
  success: [
    `${STICKER_BASE_URL}/success-1.webp`,
  ],
  celebrate: [
    `${STICKER_BASE_URL}/celebrate-1.webp`,
  ],
  warning: [
    `${STICKER_BASE_URL}/warning-1.webp`,
  ],
  sad: [
    `${STICKER_BASE_URL}/sad-1.webp`,
  ],
  money: [
    `${STICKER_BASE_URL}/money-1.webp`,
  ],
};

/**
 * Check if enough time has passed to show another sticker
 * @param {string} phone - User phone number
 * @returns {boolean} - True if sticker can be shown
 */
export function shouldShowSticker(phone) {
  const last = lastStickerSent.get(phone);
  if (!last) return true;
  return Date.now() - last.timestamp > STICKER_COOLDOWN_MS;
}

/**
 * Get a random sticker URL for a given context, avoiding repetition
 * @param {string} phone - User phone number (for anti-repetition)
 * @param {string} context - The sticker context (welcome, success, etc.)
 * @returns {string|null} - Sticker URL or null if not found
 */
export function getRandomSticker(phone, context) {
  const stickers = STICKERS[context];
  if (!stickers || stickers.length === 0) return null;

  const last = lastStickerSent.get(phone);
  let selectedSticker;

  // If only one sticker, just return it
  if (stickers.length === 1) {
    selectedSticker = stickers[0];
  } else {
    // Avoid repeating the same sticker consecutively
    do {
      const randomIndex = Math.floor(Math.random() * stickers.length);
      selectedSticker = stickers[randomIndex];
    } while (last?.stickerId === selectedSticker);
  }

  return selectedSticker;
}

/**
 * Send a sticker for a given context (no rate limiting)
 * @param {string} phone - Recipient phone number
 * @param {string} context - The sticker context
 * @returns {Promise<boolean>} - True if sent successfully
 */
export async function sendContextSticker(phone, context) {
  const stickerUrl = getRandomSticker(phone, context);
  if (!stickerUrl) {
    console.log(`[sticker] No sticker found for context: ${context}`);
    return false;
  }

  try {
    await sendSticker(phone, stickerUrl);
    lastStickerSent.set(phone, { timestamp: Date.now(), stickerId: stickerUrl });
    console.log(`[sticker] Sent ${context} sticker to ${phone}`);
    return true;
  } catch (error) {
    console.error(`[sticker] Failed to send ${context} sticker:`, error);
    return false;
  }
}

/**
 * Send a sticker with rate limiting (1 hour cooldown)
 * @param {string} phone - Recipient phone number
 * @param {string} context - The sticker context
 * @returns {Promise<boolean>} - True if sent, false if skipped or failed
 */
export async function sendContextStickerWithLimit(phone, context) {
  if (!shouldShowSticker(phone)) {
    console.log(`[sticker] Skipping for ${phone}, cooldown active`);
    return false;
  }

  return sendContextSticker(phone, context);
}

/**
 * Available sticker contexts
 */
export const STICKER_CONTEXTS = {
  WELCOME: 'welcome',       // New user joins
  SUCCESS: 'success',       // Expense logged successfully
  CELEBRATE: 'celebrate',   // Budget goal achieved, milestone
  WARNING: 'warning',       // Budget alert (80%+)
  SAD: 'sad',              // Budget exceeded
  THINKING: 'thinking',    // Processing/analyzing
};

export default {
  shouldShowSticker,
  getRandomSticker,
  sendContextSticker,
  sendContextStickerWithLimit,
  STICKER_CONTEXTS,
};
