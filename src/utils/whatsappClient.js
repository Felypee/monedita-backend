import axios from 'axios';
import FormData from 'form-data';
import dotenv from 'dotenv';
import { formatWhatsAppMessage } from './messageUtils.js';

dotenv.config();

const WHATSAPP_API_URL = 'https://graph.facebook.com/v21.0';
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const ACCESS_TOKEN = process.env.WHATSAPP_TOKEN;

/**
 * Send a text message via WhatsApp
 * Automatically truncates messages to 12 lines max
 */
export async function sendTextMessage(to, message) {
  try {
    // Format message: truncate to 12 lines, clean up whitespace
    const formattedMessage = formatWhatsAppMessage(message);

    const response = await axios.post(
      `${WHATSAPP_API_URL}/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to,
        type: 'text',
        text: { body: formattedMessage }
      },
      {
        headers: {
          'Authorization': `Bearer ${ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error sending WhatsApp message:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Send an interactive message with buttons
 */
export async function sendInteractiveButtons(to, bodyText, buttons) {
  try {
    const response = await axios.post(
      `${WHATSAPP_API_URL}/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: bodyText },
          action: {
            buttons: buttons.map((btn, idx) => ({
              type: 'reply',
              reply: {
                id: btn.id || `btn_${idx}`,
                title: btn.title
              }
            }))
          }
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error sending interactive message:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Mark message as read
 */
export async function markAsRead(messageId) {
  try {
    await axios.post(
      `${WHATSAPP_API_URL}/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId
      },
      {
        headers: {
          'Authorization': `Bearer ${ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
  } catch (error) {
    console.error('Error marking message as read:', error.response?.data || error.message);
  }
}

/**
 * Send a document (file) via WhatsApp
 * @param {string} to - Recipient phone number
 * @param {Buffer} fileBuffer - File content as Buffer
 * @param {string} filename - Filename with extension (e.g. "expenses_2026-02-08.csv")
 * @param {string} caption - Caption shown below the document
 */
export async function sendDocument(to, fileBuffer, filename, caption) {
  // Step 1: Upload media
  const formData = new FormData();
  formData.append('messaging_product', 'whatsapp');
  formData.append('type', 'text/csv');
  formData.append('file', fileBuffer, {
    filename,
    contentType: 'text/csv',
  });

  const uploadResponse = await axios.post(
    `${WHATSAPP_API_URL}/${PHONE_NUMBER_ID}/media`,
    formData,
    {
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        ...formData.getHeaders(),
      },
    }
  );

  const mediaId = uploadResponse.data.id;

  // Step 2: Send document message
  const response = await axios.post(
    `${WHATSAPP_API_URL}/${PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'document',
      document: {
        id: mediaId,
        filename,
        caption,
      },
    },
    {
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
    }
  );

  return response.data;
}

/**
 * Send a reaction to a message (used for typing indicator)
 * @param {string} to - Recipient phone number
 * @param {string} messageId - Message ID to react to
 * @param {string} emoji - Emoji to react with (empty string to remove)
 */
export async function sendReaction(to, messageId, emoji) {
  try {
    const response = await axios.post(
      `${WHATSAPP_API_URL}/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to,
        type: 'reaction',
        reaction: {
          message_id: messageId,
          emoji: emoji  // Empty string "" removes the reaction
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error sending reaction:', error.response?.data || error.message);
    return null;
  }
}

/**
 * Show "processing" indicator using reaction
 * Returns a function to clear the indicator when done
 * @param {string} to - Recipient phone number
 * @param {string} messageId - Message ID to react to
 * @returns {Function} - Call this to remove the reaction
 */
export async function showProcessingIndicator(to, messageId) {
  if (!messageId) {
    console.log('[whatsapp] No messageId for processing indicator');
    return () => {};
  }

  // Add ⏳ reaction to show processing
  await sendReaction(to, messageId, '⏳');
  console.log(`[whatsapp] Processing indicator shown for ${to}`);

  // Return function to clear the indicator
  return async () => {
    await sendReaction(to, messageId, '');  // Empty string removes reaction
    console.log(`[whatsapp] Processing indicator cleared for ${to}`);
  };
}

/**
 * Simple typing indicator (legacy - just logs)
 * Use showProcessingIndicator for actual visual feedback
 */
export async function sendTypingIndicator(to) {
  console.log(`[whatsapp] Typing indicator for ${to}`);
  return true;
}

/**
 * Send a contact card (vCard) via WhatsApp
 * @param {string} to - Recipient phone number
 * @param {object} contact - Contact info { name, phone, website }
 */
export async function sendContactCard(to, contact) {
  try {
    // Extract wa_id (phone number without + sign)
    const waId = contact.phone.replace(/^\+/, '');

    const response = await axios.post(
      `${WHATSAPP_API_URL}/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to,
        type: 'contacts',
        contacts: [
          {
            name: {
              formatted_name: contact.name,
              first_name: contact.name
            },
            phones: [
              {
                phone: contact.phone,
                type: 'WORK',
                wa_id: waId  // This tells WhatsApp the number is registered
              }
            ],
            ...(contact.website && {
              urls: [
                {
                  url: contact.website,
                  type: 'WORK'
                }
              ]
            })
          }
        ]
      },
      {
        headers: {
          'Authorization': `Bearer ${ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error sending contact card:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Send a sticker via WhatsApp
 * @param {string} to - Recipient phone number
 * @param {string} stickerUrl - URL to the sticker (.webp format, 512x512)
 *   - Static stickers: max 100KB
 *   - Animated stickers: max 500KB, must be animated WebP
 */
export async function sendSticker(to, stickerUrl) {
  try {
    const response = await axios.post(
      `${WHATSAPP_API_URL}/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to,
        type: 'sticker',
        sticker: {
          link: stickerUrl
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error sending sticker:', error.response?.data || error.message);
    return null; // Don't throw, stickers are optional
  }
}

/**
 * Download media from WhatsApp
 * @param {string} mediaId - The media ID from the message
 * @returns {Promise<{buffer: Buffer, mimeType: string}>}
 */
export async function downloadMedia(mediaId) {
  try {
    // First, get the media URL
    const mediaResponse = await axios.get(
      `${WHATSAPP_API_URL}/${mediaId}`,
      {
        headers: {
          'Authorization': `Bearer ${ACCESS_TOKEN}`
        }
      }
    );

    const mediaUrl = mediaResponse.data.url;
    const mimeType = mediaResponse.data.mime_type;

    // Download the actual media file
    const fileResponse = await axios.get(mediaUrl, {
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`
      },
      responseType: 'arraybuffer'
    });

    return {
      buffer: Buffer.from(fileResponse.data),
      mimeType
    };
  } catch (error) {
    console.error('Error downloading media:', error.response?.data || error.message);
    throw error;
  }
}
