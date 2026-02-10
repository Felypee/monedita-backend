/**
 * Usage Monitor - Tracks API calls to prevent cost overruns
 *
 * This provides a safety net by tracking daily API usage and
 * blocking requests when limits are exceeded.
 */

// Daily limits (adjust based on your budget)
const DAILY_LIMITS = {
  claude_calls: parseInt(process.env.DAILY_LIMIT_CLAUDE) || 500,      // ~$5/day at $0.01/call
  whisper_calls: parseInt(process.env.DAILY_LIMIT_WHISPER) || 100,    // ~$0.60/day
  vision_calls: parseInt(process.env.DAILY_LIMIT_VISION) || 100,      // ~$1/day
  whatsapp_messages: parseInt(process.env.DAILY_LIMIT_WHATSAPP) || 1000,
};

// In-memory counters (reset daily)
const usage = {
  claude_calls: 0,
  whisper_calls: 0,
  vision_calls: 0,
  whatsapp_messages: 0,
  lastReset: new Date().toDateString(),
};

/**
 * Check if we should reset counters (new day)
 */
function checkDailyReset() {
  const today = new Date().toDateString();
  if (usage.lastReset !== today) {
    console.log('[usage] Daily reset - clearing counters');
    usage.claude_calls = 0;
    usage.whisper_calls = 0;
    usage.vision_calls = 0;
    usage.whatsapp_messages = 0;
    usage.lastReset = today;
  }
}

/**
 * Track an API call
 * @param {string} type - Type of call (claude_calls, whisper_calls, etc.)
 * @returns {boolean} - true if allowed, false if limit exceeded
 */
export function trackUsage(type) {
  checkDailyReset();

  if (!DAILY_LIMITS[type]) {
    console.warn(`[usage] Unknown usage type: ${type}`);
    return true;
  }

  usage[type]++;

  const limit = DAILY_LIMITS[type];
  const current = usage[type];
  const percentage = (current / limit) * 100;

  // Warn at 80%
  if (percentage >= 80 && percentage < 100) {
    console.warn(`[usage] ⚠️ ${type} at ${percentage.toFixed(0)}% of daily limit (${current}/${limit})`);
  }

  // Block at 100%
  if (current > limit) {
    console.error(`[usage] 🛑 ${type} EXCEEDED daily limit (${current}/${limit})`);
    return false;
  }

  return true;
}

/**
 * Check if a call type is allowed (without incrementing)
 * @param {string} type - Type of call
 * @returns {boolean}
 */
export function isAllowed(type) {
  checkDailyReset();

  const limit = DAILY_LIMITS[type];
  if (!limit) return true;

  return usage[type] < limit;
}

/**
 * Get current usage stats
 * @returns {object}
 */
export function getUsageStats() {
  checkDailyReset();

  return {
    ...usage,
    limits: DAILY_LIMITS,
    percentages: {
      claude_calls: ((usage.claude_calls / DAILY_LIMITS.claude_calls) * 100).toFixed(1),
      whisper_calls: ((usage.whisper_calls / DAILY_LIMITS.whisper_calls) * 100).toFixed(1),
      vision_calls: ((usage.vision_calls / DAILY_LIMITS.vision_calls) * 100).toFixed(1),
      whatsapp_messages: ((usage.whatsapp_messages / DAILY_LIMITS.whatsapp_messages) * 100).toFixed(1),
    },
  };
}

export default { trackUsage, isAllowed, getUsageStats };
