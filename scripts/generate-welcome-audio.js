#!/usr/bin/env node
/**
 * Generate Welcome Audio Files
 *
 * Uses ElevenLabs TTS to generate welcome messages in multiple languages.
 * Run once to create the audio files, then deploy them with the app.
 *
 * Usage: node scripts/generate-welcome-audio.js
 *
 * Requires: ELEVENLABS_API_KEY environment variable
 * Cost: Free tier has 10k chars/month (we use ~1,200 chars total)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const AUDIO_DIR = path.join(__dirname, "../public/audio");

// Welcome messages by language (shorter versions for audio)
const WELCOME_MESSAGES = {
  es: `¡Hola! Bienvenido a Monedita, tu asistente de gastos con inteligencia artificial.
Solo dime cuánto gastaste y en qué, y yo me encargo del resto.
¿Cómo te llamas?`,

  en: `Hi! Welcome to Monedita, your AI expense assistant.
Just tell me how much you spent and on what, and I'll take care of the rest.
What's your name?`,

  pt: `Oi! Bem-vindo ao Monedita, seu assistente de despesas com inteligência artificial.
Só me diga quanto gastou e em quê, e eu cuido do resto.
Qual é o seu nome?`,
};

// ElevenLabs voice IDs
// Rachel: warm, friendly female voice (works well for all languages)
const VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // Rachel

async function generateAudio(lang, text) {
  console.log(`Generating ${lang} audio...`);

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
    {
      method: "POST",
      headers: {
        "Accept": "audio/mpeg",
        "Content-Type": "application/json",
        "xi-api-key": process.env.ELEVENLABS_API_KEY,
      },
      body: JSON.stringify({
        text: text,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`ElevenLabs API error: ${response.status} - ${error}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const filepath = path.join(AUDIO_DIR, `welcome-${lang}.mp3`);

  fs.writeFileSync(filepath, buffer);
  console.log(`  Created: ${filepath} (${buffer.length} bytes)`);

  return filepath;
}

async function main() {
  // Check for API key
  if (!process.env.ELEVENLABS_API_KEY) {
    console.error("Error: ELEVENLABS_API_KEY environment variable is required");
    console.error("Get your free key at: https://elevenlabs.io");
    process.exit(1);
  }

  // Ensure audio directory exists
  if (!fs.existsSync(AUDIO_DIR)) {
    fs.mkdirSync(AUDIO_DIR, { recursive: true });
  }

  console.log("Generating welcome audio files with ElevenLabs...\n");

  const languages = Object.keys(WELCOME_MESSAGES);
  let totalChars = 0;

  for (const lang of languages) {
    const text = WELCOME_MESSAGES[lang];
    totalChars += text.length;

    try {
      await generateAudio(lang, text);
    } catch (error) {
      console.error(`  Error generating ${lang}:`, error.message);
    }
  }

  console.log(`\nDone! Generated ${languages.length} audio files.`);
  console.log(`Total characters used: ${totalChars}`);
}

main().catch(console.error);
