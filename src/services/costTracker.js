/**
 * Cost Tracker Service - Dynamic cost calculation based on real API usage
 *
 * Instead of fixed monedita costs, this service calculates real costs based on:
 * - Claude API tokens (input/output)
 * - WhatsApp messages sent
 * - Whisper transcription (if using OpenAI, not Groq)
 *
 * 1 monedita = $0.002 USD
 */

// API Pricing (as of February 2026)
const PRICING = {
  // Claude Sonnet 4
  claude: {
    inputPerMillion: 3,    // $3 per 1M input tokens
    outputPerMillion: 15,  // $15 per 1M output tokens
  },
  // WhatsApp Business API (Colombia average)
  whatsapp: {
    perMessage: 0.0008,    // ~$0.0008 per message
  },
  // OpenAI Whisper (Groq is FREE)
  whisper: {
    perMinute: 0.006,      // $0.006 per minute
  },
  // Monedita value
  moneditaValue: 0.002,    // 1 monedita = $0.002 USD
};

// Estimated maximums for pre-check (worst case scenarios)
export const MAX_ESTIMATES = {
  TEXT_MESSAGE: 10,    // ~2000 input + 500 output tokens max
  IMAGE_RECEIPT: 12,   // Vision uses more tokens
  AUDIO_MESSAGE: 8,    // Whisper + Claude extraction
};

/**
 * Calculate moneditas from Claude API usage
 * @param {number} inputTokens - Input tokens used
 * @param {number} outputTokens - Output tokens used
 * @returns {{costUSD: number, moneditas: number}}
 */
export function calculateClaudeCost(inputTokens, outputTokens) {
  const inputCost = (inputTokens / 1_000_000) * PRICING.claude.inputPerMillion;
  const outputCost = (outputTokens / 1_000_000) * PRICING.claude.outputPerMillion;
  const costUSD = inputCost + outputCost;

  return {
    inputTokens,
    outputTokens,
    costUSD,
    moneditas: Math.ceil(costUSD / PRICING.moneditaValue),
  };
}

/**
 * Calculate moneditas from WhatsApp messages
 * @param {number} messageCount - Number of messages sent
 * @returns {{costUSD: number, moneditas: number}}
 */
export function calculateWhatsAppCost(messageCount) {
  const costUSD = messageCount * PRICING.whatsapp.perMessage;

  return {
    messageCount,
    costUSD,
    moneditas: Math.ceil(costUSD / PRICING.moneditaValue),
  };
}

/**
 * Calculate moneditas from Whisper usage (OpenAI only, Groq is free)
 * @param {number} durationSeconds - Audio duration in seconds
 * @param {boolean} isGroq - Whether Groq was used (free)
 * @returns {{costUSD: number, moneditas: number}}
 */
export function calculateWhisperCost(durationSeconds, isGroq = false) {
  if (isGroq) {
    return { durationSeconds, costUSD: 0, moneditas: 0, provider: 'groq' };
  }

  const durationMinutes = durationSeconds / 60;
  const costUSD = durationMinutes * PRICING.whisper.perMinute;

  return {
    durationSeconds,
    costUSD,
    moneditas: Math.ceil(costUSD / PRICING.moneditaValue),
    provider: 'openai',
  };
}

/**
 * Calculate total moneditas for an operation
 * @param {object} usage - Usage data from various APIs
 * @param {object} usage.claude - {inputTokens, outputTokens}
 * @param {number} usage.whatsappMessages - Number of WA messages
 * @param {object} usage.whisper - {durationSeconds, isGroq}
 * @returns {{totalCostUSD: number, totalMoneditas: number, breakdown: object}}
 */
export function calculateTotalCost(usage = {}) {
  const breakdown = {};
  let totalCostUSD = 0;

  // Claude costs
  if (usage.claude) {
    const claudeCost = calculateClaudeCost(
      usage.claude.inputTokens || 0,
      usage.claude.outputTokens || 0
    );
    breakdown.claude = claudeCost;
    totalCostUSD += claudeCost.costUSD;
  }

  // WhatsApp costs
  if (usage.whatsappMessages) {
    const waCost = calculateWhatsAppCost(usage.whatsappMessages);
    breakdown.whatsapp = waCost;
    totalCostUSD += waCost.costUSD;
  }

  // Whisper costs
  if (usage.whisper) {
    const whisperCost = calculateWhisperCost(
      usage.whisper.durationSeconds || 0,
      usage.whisper.isGroq || false
    );
    breakdown.whisper = whisperCost;
    totalCostUSD += whisperCost.costUSD;
  }

  // Calculate total moneditas (minimum 1 if any API was used)
  const totalMoneditas = totalCostUSD > 0
    ? Math.max(1, Math.ceil(totalCostUSD / PRICING.moneditaValue))
    : 0;

  return {
    totalCostUSD,
    totalMoneditas,
    breakdown,
  };
}

/**
 * Estimate audio duration from buffer size
 * WhatsApp voice messages are typically Opus codec at ~16kbps
 * @param {number} bufferSize - Size of audio buffer in bytes
 * @returns {number} Estimated duration in seconds
 */
export function estimateAudioDuration(bufferSize) {
  // Opus at 16kbps = 2KB per second approximately
  const bytesPerSecond = 2000;
  return Math.ceil(bufferSize / bytesPerSecond);
}

/**
 * Format cost breakdown for logging
 * @param {object} costResult - Result from calculateTotalCost
 * @returns {string}
 */
export function formatCostLog(costResult) {
  const parts = [];

  if (costResult.breakdown.claude) {
    const c = costResult.breakdown.claude;
    parts.push(`Claude: ${c.inputTokens}in/${c.outputTokens}out = $${c.costUSD.toFixed(4)}`);
  }

  if (costResult.breakdown.whatsapp) {
    const w = costResult.breakdown.whatsapp;
    parts.push(`WA: ${w.messageCount}msg = $${w.costUSD.toFixed(4)}`);
  }

  if (costResult.breakdown.whisper) {
    const wh = costResult.breakdown.whisper;
    parts.push(`Whisper(${wh.provider}): ${wh.durationSeconds}s = $${wh.costUSD.toFixed(4)}`);
  }

  return `[Cost] ${parts.join(' | ')} → ${costResult.totalMoneditas} moneditas ($${costResult.totalCostUSD.toFixed(4)})`;
}

export default {
  PRICING,
  MAX_ESTIMATES,
  calculateClaudeCost,
  calculateWhatsAppCost,
  calculateWhisperCost,
  calculateTotalCost,
  estimateAudioDuration,
  formatCostLog,
};
