/**
 * Message Batcher Service
 * Collects messages from users and batches them with a 10-second window.
 * If user sends multiple messages within 10 seconds, they're combined into one.
 */

const BATCH_WINDOW_MS = 10000; // 10 seconds
const CLEANUP_INTERVAL_MS = 300000; // 5 minutes - cleanup stale batches

// Store: phone -> { messages: [], timer: NodeJS.Timeout, callback: Function }
const userBatches = new Map();

/**
 * Add a message to the user's batch queue
 * @param {string} phone - User's phone number
 * @param {object} message - Message object { type, content, id, ... }
 * @param {Function} onBatchReady - Callback when batch is ready to process
 * @returns {boolean} - true if message was queued, false if should process immediately
 */
export function queueMessage(phone, message, onBatchReady) {
  // Immediately process non-text messages (images, audio, etc.)
  // They shouldn't be batched
  if (message.type !== 'text') {
    return false; // Signal to process immediately
  }

  let batch = userBatches.get(phone);

  if (!batch) {
    // Create new batch for this user
    batch = {
      messages: [],
      timer: null,
      callback: onBatchReady,
      createdAt: Date.now(),
      lastMessageId: null
    };
    userBatches.set(phone, batch);
  }

  // Add message to batch and track last message ID
  batch.messages.push({
    type: message.type,
    content: message.text?.body || '',
    timestamp: Date.now(),
    id: message.id
  });

  // Keep track of the last message ID for processing indicator
  batch.lastMessageId = message.id;

  // Clear existing timer and set new one
  if (batch.timer) {
    clearTimeout(batch.timer);
  }

  batch.timer = setTimeout(() => {
    processBatch(phone);
  }, BATCH_WINDOW_MS);

  console.log(`[batcher] Queued message for ${phone}, batch size: ${batch.messages.length}`);

  return true; // Message was queued
}

/**
 * Process the batched messages for a user
 * @param {string} phone - User's phone number
 */
function processBatch(phone) {
  const batch = userBatches.get(phone);

  if (!batch || batch.messages.length === 0) {
    userBatches.delete(phone);
    return;
  }

  // Combine all text messages into one
  const combinedContent = batch.messages
    .map(m => m.content)
    .join(' ')
    .trim();

  console.log(`[batcher] Processing batch for ${phone}: "${combinedContent.substring(0, 50)}..."`);

  // Call the callback with combined message and last message ID for indicator
  if (batch.callback) {
    batch.callback(phone, {
      type: 'text',
      text: { body: combinedContent },
      batched: true,
      messageCount: batch.messages.length,
      lastMessageId: batch.lastMessageId
    });
  }

  // Clear the batch
  userBatches.delete(phone);
}

/**
 * Force process a user's batch immediately (e.g., on media message)
 * @param {string} phone - User's phone number
 */
export function flushBatch(phone) {
  const batch = userBatches.get(phone);

  if (batch && batch.timer) {
    clearTimeout(batch.timer);
    processBatch(phone);
  }
}

/**
 * Check if user has pending messages in batch
 * @param {string} phone - User's phone number
 * @returns {boolean}
 */
export function hasPendingBatch(phone) {
  return userBatches.has(phone);
}

/**
 * Get batch size for a user
 * @param {string} phone - User's phone number
 * @returns {number}
 */
export function getBatchSize(phone) {
  const batch = userBatches.get(phone);
  return batch ? batch.messages.length : 0;
}

/**
 * Cancel a user's pending batch
 * @param {string} phone - User's phone number
 */
export function cancelBatch(phone) {
  const batch = userBatches.get(phone);

  if (batch) {
    if (batch.timer) {
      clearTimeout(batch.timer);
    }
    userBatches.delete(phone);
    console.log(`[batcher] Cancelled batch for ${phone}`);
  }
}

/**
 * Cleanup stale batches (older than 5 minutes)
 */
function cleanupStaleBatches() {
  const now = Date.now();
  const staleThreshold = 5 * 60 * 1000; // 5 minutes

  for (const [phone, batch] of userBatches.entries()) {
    if (now - batch.createdAt > staleThreshold) {
      console.log(`[batcher] Cleaning up stale batch for ${phone}`);
      if (batch.timer) {
        clearTimeout(batch.timer);
      }
      userBatches.delete(phone);
    }
  }
}

// Run cleanup every 5 minutes
setInterval(cleanupStaleBatches, CLEANUP_INTERVAL_MS);

export default {
  queueMessage,
  flushBatch,
  hasPendingBatch,
  getBatchSize,
  cancelBatch
};
