/**
 * Pending Expense Service
 * Stores expenses temporarily while waiting for category creation
 * Similar to reminderService but for expenses that need categories
 */

// Track pending expenses per user
// Map<phone, { amount, description, timestamp, originalMessage }>
const pendingExpenses = new Map();

/**
 * Store a pending expense while waiting for category
 * @param {string} phone - User's phone number
 * @param {number} amount - Expense amount
 * @param {string} description - Optional description
 * @param {string} originalMessage - Original user message for context
 */
export function setPendingExpense(phone, amount, description = null, originalMessage = null) {
  pendingExpenses.set(phone, {
    amount,
    description,
    originalMessage,
    timestamp: Date.now(),
  });
  console.log(`💾 Stored pending expense for ${phone}: ${amount} - ${description || 'no description'}`);
}

/**
 * Get pending expense for user
 * @param {string} phone - User's phone number
 * @returns {object|null} - Pending expense data or null
 */
export function getPendingExpense(phone) {
  const pending = pendingExpenses.get(phone);
  if (!pending) return null;

  // Expire pending expenses after 10 minutes
  if (Date.now() - pending.timestamp > 10 * 60 * 1000) {
    pendingExpenses.delete(phone);
    console.log(`⏰ Pending expense expired for ${phone}`);
    return null;
  }

  return pending;
}

/**
 * Check if user has a pending expense
 * @param {string} phone - User's phone number
 * @returns {boolean}
 */
export function hasPendingExpense(phone) {
  return getPendingExpense(phone) !== null;
}

/**
 * Clear pending expense for user
 * @param {string} phone - User's phone number
 */
export function clearPendingExpense(phone) {
  const had = pendingExpenses.has(phone);
  pendingExpenses.delete(phone);
  if (had) {
    console.log(`🗑️ Cleared pending expense for ${phone}`);
  }
}

/**
 * Get and clear pending expense (consume it)
 * @param {string} phone - User's phone number
 * @returns {object|null} - Pending expense data or null
 */
export function consumePendingExpense(phone) {
  const pending = getPendingExpense(phone);
  if (pending) {
    clearPendingExpense(phone);
  }
  return pending;
}
