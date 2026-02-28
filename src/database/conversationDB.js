/**
 * Conversation Database Layer
 * Handles persistence of conversation messages in Supabase
 */

import { supabase } from './supabaseDB.js';

const MAX_MESSAGES = 20;

/**
 * Save a message to the database and cleanup old messages
 * @param {string} phone - User's phone number
 * @param {string} role - 'user' or 'assistant'
 * @param {string} content - Message content
 * @returns {Promise<object|null>} - Saved message or null on error
 */
export async function saveMessage(phone, role, content) {
  try {
    // Insert the new message
    const { data, error } = await supabase
      .from('conversation_messages')
      .insert([{ phone, role, content }])
      .select()
      .single();

    if (error) {
      console.error('[conversationDB] Error saving message:', error);
      return null;
    }

    // Cleanup: keep only the last 20 messages for this user
    // We do this asynchronously to not block the main flow
    cleanupOldMessages(phone).catch(err => {
      console.error('[conversationDB] Error cleaning up old messages:', err);
    });

    return data;
  } catch (err) {
    console.error('[conversationDB] saveMessage failed:', err?.message || err);
    return null;
  }
}

/**
 * Delete old messages keeping only the most recent MAX_MESSAGES
 * @param {string} phone - User's phone number
 */
async function cleanupOldMessages(phone) {
  // Get IDs of messages to keep (most recent 20)
  const { data: keepMessages, error: selectError } = await supabase
    .from('conversation_messages')
    .select('id')
    .eq('phone', phone)
    .order('created_at', { ascending: false })
    .limit(MAX_MESSAGES);

  if (selectError) {
    console.error('[conversationDB] Error selecting messages to keep:', selectError);
    return;
  }

  if (!keepMessages || keepMessages.length < MAX_MESSAGES) {
    // Not enough messages to need cleanup
    return;
  }

  const keepIds = keepMessages.map(m => m.id);

  // Delete messages not in the keep list
  const { error: deleteError } = await supabase
    .from('conversation_messages')
    .delete()
    .eq('phone', phone)
    .not('id', 'in', `(${keepIds.join(',')})`);

  if (deleteError) {
    console.error('[conversationDB] Error deleting old messages:', deleteError);
  }
}

/**
 * Get recent messages for a user
 * @param {string} phone - User's phone number
 * @param {number} limit - Maximum number of messages (default 20)
 * @returns {Promise<Array>} - Array of messages ordered by created_at ASC (oldest first)
 */
export async function getRecentMessages(phone, limit = MAX_MESSAGES) {
  try {
    const { data, error } = await supabase
      .from('conversation_messages')
      .select('role, content, created_at')
      .eq('phone', phone)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[conversationDB] Error getting messages:', error);
      return [];
    }

    // Reverse to get chronological order (oldest first)
    return (data || []).reverse();
  } catch (err) {
    console.error('[conversationDB] getRecentMessages failed:', err?.message || err);
    return [];
  }
}

/**
 * Clear all messages for a user
 * @param {string} phone - User's phone number
 * @returns {Promise<boolean>} - Success status
 */
export async function clearMessages(phone) {
  try {
    const { error } = await supabase
      .from('conversation_messages')
      .delete()
      .eq('phone', phone);

    if (error) {
      console.error('[conversationDB] Error clearing messages:', error);
      return false;
    }

    console.log(`[conversationDB] Cleared messages for ${phone}`);
    return true;
  } catch (err) {
    console.error('[conversationDB] clearMessages failed:', err?.message || err);
    return false;
  }
}

export default {
  saveMessage,
  getRecentMessages,
  clearMessages,
  MAX_MESSAGES
};
