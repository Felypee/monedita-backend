/**
 * Conversation Context Service
 * Manages the last 20 messages per user for context in AI conversations.
 * STRICT LIMIT: Always maintains exactly 20 messages max, older ones are dropped.
 *
 * Persistence: Messages are saved to Supabase and cached in memory.
 * On server restart, context is restored from the database.
 */

import { saveMessage, getRecentMessages, clearMessages as dbClearMessages } from '../database/conversationDB.js';

const MAX_MESSAGES = 20;

// In-memory store: phone -> messages[]
// Each message: { role: 'user'|'assistant', content: string, timestamp: number }
const contexts = new Map();

/**
 * Add a message to user's conversation context
 * Automatically trims to keep only last 20 messages
 * Persists to database asynchronously
 * @param {string} phone - User's phone number
 * @param {string} role - 'user' or 'assistant'
 * @param {string} content - Message content
 */
export function addMessage(phone, role, content) {
  if (!content || content.trim() === '') return;

  let context = contexts.get(phone);

  if (!context) {
    context = [];
    contexts.set(phone, context);
  }

  const trimmedContent = content.trim();

  // Add new message to memory (synchronous)
  context.push({
    role,
    content: trimmedContent,
    timestamp: Date.now()
  });

  // STRICT: Keep only last 20 messages
  if (context.length > MAX_MESSAGES) {
    const excess = context.length - MAX_MESSAGES;
    context.splice(0, excess);
  }

  console.log(`[context] Added ${role} message for ${phone}, total: ${context.length}/${MAX_MESSAGES}`);

  // Persist to database (async, fire-and-forget)
  // Errors are logged but don't interrupt the chat flow
  saveMessage(phone, role, trimmedContent).catch(err => {
    console.error(`[context] Failed to persist message for ${phone}:`, err);
  });
}

/**
 * Get conversation context for a user
 * If memory is empty, loads from database first
 * @param {string} phone - User's phone number
 * @returns {Array<{role: string, content: string}>} - Last 20 messages
 */
export function getContext(phone) {
  const context = contexts.get(phone);
  return context ? [...context] : [];
}

/**
 * Get context formatted for Claude API
 * Loads from database if memory cache is empty
 * @param {string} phone - User's phone number
 * @returns {Promise<Array<{role: string, content: string}>>} - Formatted for Claude
 */
export async function getContextForClaude(phone) {
  // Check if we have context in memory
  let context = contexts.get(phone);

  // If memory is empty, try to load from database
  if (!context || context.length === 0) {
    try {
      const dbMessages = await getRecentMessages(phone, MAX_MESSAGES);

      if (dbMessages && dbMessages.length > 0) {
        // Convert DB format to our format and cache
        context = dbMessages.map(msg => ({
          role: msg.role,
          content: msg.content,
          timestamp: new Date(msg.created_at).getTime()
        }));
        contexts.set(phone, context);
        console.log(`[context] Loaded ${context.length} messages from DB for ${phone}`);
      } else {
        context = [];
      }
    } catch (err) {
      console.error(`[context] Failed to load from DB for ${phone}:`, err);
      context = [];
    }
  }

  // Claude expects alternating user/assistant messages
  // Filter and format appropriately
  return context.map(msg => ({
    role: msg.role,
    content: msg.content
  }));
}

/**
 * Get context as a single string (for system prompt injection)
 * @param {string} phone - User's phone number
 * @returns {string} - Formatted conversation history
 */
export function getContextAsString(phone) {
  const context = getContext(phone);

  if (context.length === 0) return '';

  return context
    .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
    .join('\n');
}

/**
 * Clear conversation context for a user
 * Clears both memory and database
 * @param {string} phone - User's phone number
 */
export function clearContext(phone) {
  contexts.delete(phone);
  console.log(`[context] Cleared memory context for ${phone}`);

  // Also clear from database (async, fire-and-forget)
  dbClearMessages(phone).catch(err => {
    console.error(`[context] Failed to clear DB context for ${phone}:`, err);
  });
}

/**
 * Get context size for a user
 * @param {string} phone - User's phone number
 * @returns {number}
 */
export function getContextSize(phone) {
  const context = contexts.get(phone);
  return context ? context.length : 0;
}

/**
 * Estimate token count for context
 * Rough estimate: ~4 characters per token
 * @param {string} phone - User's phone number
 * @returns {number} - Estimated tokens
 */
export function estimateContextTokens(phone) {
  const context = getContext(phone);
  const totalChars = context.reduce((sum, msg) => sum + msg.content.length, 0);
  return Math.ceil(totalChars / 4);
}

/**
 * Prune context to fit within token limit
 * Removes oldest messages first
 * @param {string} phone - User's phone number
 * @param {number} maxTokens - Maximum tokens allowed
 */
export function pruneToTokenLimit(phone, maxTokens) {
  const context = contexts.get(phone);
  if (!context) return;

  while (context.length > 0 && estimateContextTokens(phone) > maxTokens) {
    context.shift(); // Remove oldest
  }

  console.log(`[context] Pruned context for ${phone} to ${context.length} messages`);
}

export default {
  addMessage,
  getContext,
  getContextForClaude,
  getContextAsString,
  clearContext,
  getContextSize,
  estimateContextTokens,
  pruneToTokenLimit,
  MAX_MESSAGES
};
