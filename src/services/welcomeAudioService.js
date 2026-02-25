/**
 * Welcome Audio Service
 * Sends pre-generated TTS audio welcome messages to new users
 */

import { sendAudio } from "../utils/whatsappClient.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Server URL for audio files
const SERVER_URL = process.env.SERVER_URL || "http://localhost:3000";

// Path to audio files
const AUDIO_DIR = path.join(__dirname, "../../public/audio");

// Audio version for cache busting (increment when audio files change)
const AUDIO_VERSION = "v5";

// Welcome audio files by language (with cache busting)
const WELCOME_AUDIO = {
  es: `${SERVER_URL}/audio/welcome-es.mp3?${AUDIO_VERSION}`,
  en: `${SERVER_URL}/audio/welcome-en.mp3?${AUDIO_VERSION}`,
  pt: `${SERVER_URL}/audio/welcome-pt.mp3?${AUDIO_VERSION}`,
};

/**
 * Check if welcome audio exists for a language
 * @param {string} lang - Language code (es, en, pt)
 * @returns {boolean}
 */
export function hasWelcomeAudio(lang) {
  const filename = `welcome-${lang}.mp3`;
  const filepath = path.join(AUDIO_DIR, filename);
  return fs.existsSync(filepath);
}

/**
 * Send welcome audio message to a new user
 * @param {string} phone - User's phone number
 * @param {string} lang - User's language (es, en, pt)
 * @returns {Promise<boolean>} - True if audio was sent
 */
export async function sendWelcomeAudio(phone, lang = "es") {
  // Check if audio file exists
  if (!hasWelcomeAudio(lang)) {
    console.log(`[welcome-audio] No audio file for language: ${lang}`);
    return false;
  }

  const audioUrl = WELCOME_AUDIO[lang] || WELCOME_AUDIO.es;

  try {
    const result = await sendAudio(phone, audioUrl);
    if (result) {
      console.log(`[welcome-audio] Sent ${lang} welcome audio to ${phone}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`[welcome-audio] Failed to send:`, error);
    return false;
  }
}

export default {
  hasWelcomeAudio,
  sendWelcomeAudio,
};
