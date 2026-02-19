/**
 * Message utilities for WhatsApp formatting
 */

const MAX_MESSAGE_LINES = 12;

/**
 * Truncate message to maximum number of lines
 * If message exceeds limit, adds "..." indicator
 * @param {string} message - The message to truncate
 * @param {number} maxLines - Maximum number of lines (default: 12)
 * @returns {string} - Truncated message
 */
export function truncateMessage(message, maxLines = MAX_MESSAGE_LINES) {
  if (!message) return message;

  const lines = message.split('\n');

  if (lines.length <= maxLines) {
    return message;
  }

  // Keep first maxLines-1 lines and add truncation indicator
  const truncatedLines = lines.slice(0, maxLines - 1);
  truncatedLines.push('...');

  return truncatedLines.join('\n');
}

/**
 * Format message for WhatsApp (truncate and clean)
 * @param {string} message - The message to format
 * @returns {string} - Formatted message
 */
export function formatWhatsAppMessage(message) {
  if (!message) return message;

  // Truncate to max lines
  let formatted = truncateMessage(message);

  // Remove excessive empty lines (max 2 consecutive)
  formatted = formatted.replace(/\n{3,}/g, '\n\n');

  // Trim whitespace
  formatted = formatted.trim();

  return formatted;
}

export default {
  truncateMessage,
  formatWhatsAppMessage,
  MAX_MESSAGE_LINES,
};
