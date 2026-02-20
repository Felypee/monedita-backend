/**
 * Media Processing Utilities
 * - Images: Uses Claude Vision API for OCR (tokens tracked for dynamic pricing)
 * - Audio: Uses OpenAI Whisper API (very cheap) or Groq (free tier)
 *
 * Returns token/duration usage for dynamic monedita calculation
 */

import axios from "axios";
import FormData from "form-data";
import dotenv from "dotenv";
import { trackUsage, isAllowed } from "./usageMonitor.js";
import { estimateAudioDuration } from "../services/costTracker.js";

dotenv.config();

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

// For audio: Use OpenAI Whisper (cheap) or Groq (free tier)
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// Currencies that use comma as thousand separator (not decimal)
// Includes all Latin American + European + Asian currencies that use this format
const COMMA_THOUSAND_CURRENCIES = [
  // Latin America
  'COP', 'CLP', 'ARS', 'PEN', 'MXN', 'BRL',
  // Europe
  'EUR',
  // Asia
  'IDR', 'VND', 'KRW', 'JPY'
];

/**
 * Extract expense data from an image using Claude Vision
 * @param {Buffer} imageBuffer - The image data
 * @param {string} mimeType - The image MIME type (image/jpeg, image/png, etc.)
 * @param {string[]} categories - List of expense categories
 * @param {string} currency - User's currency code (e.g., 'COP', 'USD')
 * @returns {Promise<{detected: boolean, expenses: Array}>}
 */
export async function processExpenseImage(imageBuffer, mimeType, categories = null, currency = null) {
  const base64Image = imageBuffer.toString("base64");

  // Normalize mime type for Claude API
  const supportedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  let mediaType = mimeType;
  if (!supportedTypes.includes(mediaType)) {
    // Default to jpeg for unsupported types
    mediaType = "image/jpeg";
  }

  const categoryList = categories ? categories.join(', ') : 'food, transport, shopping, entertainment, bills, health, other';

  // Build currency context for the prompt
  let currencyContext = '';
  if (currency && COMMA_THOUSAND_CURRENCIES.includes(currency)) {
    currencyContext = `
IMPORTANT: The user's currency is ${currency}, which uses COMMA as thousand separator (not decimal).
- "13,489" means 13489 (thirteen thousand four hundred eighty-nine), NOT 13.489
- "27,181" means 27181 (twenty-seven thousand), NOT 27.181
- Always return whole numbers for this currency. Do NOT include decimals.`;
  }

  const systemPrompt = `You are an expense extraction assistant. Analyze the image (receipt, invoice, bill, or photo of expenses) and extract ALL expense information.

Return ONLY a JSON object with: {"detected": boolean, "expenses": [...]}
Each expense should have: amount (number), category (string), description (string).

Categories: ${categoryList}
${currencyContext}

If the image shows a receipt or bill:
- Extract the total amount as the main expense
- If there are multiple distinct items that should be tracked separately, list them
- Use the store/vendor name or items as the description

If no expenses can be detected, return: {"detected": false, "expenses": []}

Examples of good responses:
- Receipt from McDonald's for $15.50 → {"detected": true, "expenses": [{"amount": 15.50, "category": "food", "description": "McDonald's"}]}
- Uber receipt for $23 → {"detected": true, "expenses": [{"amount": 23, "category": "transport", "description": "Uber ride"}]}
- Electric bill for $85 → {"detected": true, "expenses": [{"amount": 85, "category": "bills", "description": "electric bill"}]}`;

  try {
    // Check daily API limit (DDoS/cost protection)
    if (!isAllowed('vision_calls')) {
      console.error('[mediaProcessor] Daily vision API limit exceeded');
      return { detected: false, expenses: [], error: 'Daily limit exceeded' };
    }
    trackUsage('vision_calls');

    const response = await axios.post(
      ANTHROPIC_API_URL,
      {
        model: "claude-sonnet-4-20250514",
        max_tokens: 500,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mediaType,
                  data: base64Image,
                },
              },
              {
                type: "text",
                text: "Extract all expense information from this image. Return only JSON.",
              },
            ],
          },
        ],
        system: systemPrompt,
      },
      {
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
      }
    );

    // Capture token usage for dynamic cost calculation
    const tokenUsage = response.data.usage || { input_tokens: 0, output_tokens: 0 };

    const result = response.data.content[0].text;
    const cleaned = result
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();
    const parsed = JSON.parse(cleaned);

    // Add token usage to result
    return {
      ...parsed,
      _tokenUsage: {
        inputTokens: tokenUsage.input_tokens,
        outputTokens: tokenUsage.output_tokens,
      },
    };
  } catch (error) {
    console.error(
      "Error processing image:",
      error.response?.data || error.message
    );
    return { detected: false, expenses: [], _tokenUsage: null };
  }
}

/**
 * Transcribe audio to text using Whisper
 * Tries Groq first (free), falls back to OpenAI (cheap)
 * @param {Buffer} audioBuffer - The audio data
 * @param {string} mimeType - The audio MIME type
 * @returns {Promise<{text: string, provider: 'groq'|'openai', durationSeconds: number}>}
 */
export async function transcribeAudio(audioBuffer, mimeType) {
  // Check daily API limit (DDoS/cost protection)
  if (!isAllowed('whisper_calls')) {
    console.error('[mediaProcessor] Daily whisper API limit exceeded');
    throw new Error('Daily transcription limit exceeded');
  }
  trackUsage('whisper_calls');

  // Estimate audio duration from buffer size
  const durationSeconds = estimateAudioDuration(audioBuffer.length);

  // Try Groq first (free tier available)
  if (GROQ_API_KEY) {
    try {
      const text = await transcribeWithGroq(audioBuffer, mimeType);
      return { text, provider: 'groq', durationSeconds };
    } catch (error) {
      console.log("Groq transcription failed, trying OpenAI...");
    }
  }

  // Fall back to OpenAI Whisper
  if (OPENAI_API_KEY) {
    const text = await transcribeWithOpenAI(audioBuffer, mimeType);
    return { text, provider: 'openai', durationSeconds };
  }

  throw new Error(
    "No speech-to-text API key configured. Set GROQ_API_KEY or OPENAI_API_KEY."
  );
}

/**
 * Transcribe using Groq's Whisper (free tier available)
 */
async function transcribeWithGroq(audioBuffer, mimeType) {
  const formData = new FormData();

  // Determine file extension from mime type
  const ext = getAudioExtension(mimeType);
  formData.append("file", audioBuffer, {
    filename: `audio.${ext}`,
    contentType: mimeType,
  });
  formData.append("model", "whisper-large-v3");

  const response = await axios.post(
    "https://api.groq.com/openai/v1/audio/transcriptions",
    formData,
    {
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        ...formData.getHeaders(),
      },
    }
  );

  return response.data.text;
}

/**
 * Transcribe using OpenAI Whisper ($0.006/minute)
 */
async function transcribeWithOpenAI(audioBuffer, mimeType) {
  const formData = new FormData();

  const ext = getAudioExtension(mimeType);
  formData.append("file", audioBuffer, {
    filename: `audio.${ext}`,
    contentType: mimeType,
  });
  formData.append("model", "whisper-1");

  const response = await axios.post(
    "https://api.openai.com/v1/audio/transcriptions",
    formData,
    {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        ...formData.getHeaders(),
      },
    }
  );

  return response.data.text;
}

/**
 * Get file extension from MIME type
 */
function getAudioExtension(mimeType) {
  const mimeToExt = {
    "audio/ogg": "ogg",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/wav": "wav",
    "audio/webm": "webm",
    "audio/amr": "amr",
    "audio/aac": "aac",
    // WhatsApp voice messages are typically ogg with opus codec
    "audio/ogg; codecs=opus": "ogg",
  };

  // Handle codecs in mime type
  const baseMime = mimeType.split(";")[0].trim();
  return mimeToExt[baseMime] || "ogg";
}

/**
 * Process audio message: transcribe and extract expenses
 * @param {Buffer} audioBuffer - The audio data
 * @param {string} mimeType - The audio MIME type
 * @returns {Promise<{transcription: string, detected: boolean, expenses: Array, _whisperUsage: object, _tokenUsage: object}>}
 */
export async function processExpenseAudio(audioBuffer, mimeType, categories = null) {
  try {
    // First, transcribe the audio
    const whisperResult = await transcribeAudio(audioBuffer, mimeType);
    const transcription = whisperResult.text;
    console.log(`📝 Transcription (${whisperResult.provider}): ${transcription}`);

    const categoryList = categories ? categories.join(', ') : 'food, transport, shopping, entertainment, bills, health, other';

    // Then extract expenses from the transcription using Claude
    const systemPrompt = `Extract ALL expense information from the transcribed voice message.
Return ONLY a JSON object with: {"detected": boolean, "expenses": [...]}
Each expense should have: amount (number), category (string), description (string).

Categories: ${categoryList}

Examples:
"Gasté mil pesos en el almuerzo" → {"detected": true, "expenses": [{"amount": 1000, "category": "food", "description": "almuerzo"}]}
"I spent 50 dollars on groceries and 20 on gas" → {"detected": true, "expenses": [{"amount": 50, "category": "food", "description": "groceries"}, {"amount": 20, "category": "transport", "description": "gas"}]}

If no expenses mentioned, return: {"detected": false, "expenses": []}`;

    const response = await axios.post(
      ANTHROPIC_API_URL,
      {
        model: "claude-sonnet-4-20250514",
        max_tokens: 500,
        messages: [{ role: "user", content: transcription }],
        system: systemPrompt,
      },
      {
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
      }
    );

    // Capture token usage for dynamic cost calculation
    const tokenUsage = response.data.usage || { input_tokens: 0, output_tokens: 0 };

    const result = response.data.content[0].text;
    const cleaned = result
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();
    const expenseData = JSON.parse(cleaned);

    return {
      transcription,
      ...expenseData,
      _whisperUsage: {
        provider: whisperResult.provider,
        durationSeconds: whisperResult.durationSeconds,
        isGroq: whisperResult.provider === 'groq',
      },
      _tokenUsage: {
        inputTokens: tokenUsage.input_tokens,
        outputTokens: tokenUsage.output_tokens,
      },
    };
  } catch (error) {
    console.error(
      "Error processing audio:",
      error.response?.data || error.message
    );
    return {
      transcription: "",
      detected: false,
      expenses: [],
      error: error.message,
      _whisperUsage: null,
      _tokenUsage: null,
    };
  }
}
