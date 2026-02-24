#!/usr/bin/env node
/**
 * Generate Welcome Audio Files
 *
 * Uses OpenAI TTS to generate welcome messages in multiple languages.
 * Run once to create the audio files, then deploy them with the app.
 *
 * Usage: node scripts/generate-welcome-audio.js
 *
 * Requires: OPENAI_API_KEY environment variable
 * Cost: ~$0.02 total (3 languages x ~400 chars each at $15/1M chars)
 */

import OpenAI from "openai";
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

// Voice settings per language
const VOICE_SETTINGS = {
  es: { voice: "nova", speed: 1.0 },    // Nova: warm, friendly female voice
  en: { voice: "nova", speed: 1.0 },
  pt: { voice: "nova", speed: 1.0 },
};

async function generateAudio(lang, text, settings) {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  console.log(`Generating ${lang} audio...`);

  const response = await openai.audio.speech.create({
    model: "tts-1",           // Use tts-1-hd for higher quality
    voice: settings.voice,
    input: text,
    speed: settings.speed,
    response_format: "mp3",
  });

  const buffer = Buffer.from(await response.arrayBuffer());
  const filepath = path.join(AUDIO_DIR, `welcome-${lang}.mp3`);

  fs.writeFileSync(filepath, buffer);
  console.log(`  Created: ${filepath} (${buffer.length} bytes)`);

  return filepath;
}

async function main() {
  // Check for API key
  if (!process.env.OPENAI_API_KEY) {
    console.error("Error: OPENAI_API_KEY environment variable is required");
    console.error("Get your key at: https://platform.openai.com/api-keys");
    process.exit(1);
  }

  // Ensure audio directory exists
  if (!fs.existsSync(AUDIO_DIR)) {
    fs.mkdirSync(AUDIO_DIR, { recursive: true });
  }

  console.log("Generating welcome audio files...\n");

  const languages = Object.keys(WELCOME_MESSAGES);
  let totalChars = 0;

  for (const lang of languages) {
    const text = WELCOME_MESSAGES[lang];
    const settings = VOICE_SETTINGS[lang];
    totalChars += text.length;

    try {
      await generateAudio(lang, text, settings);
    } catch (error) {
      console.error(`  Error generating ${lang}:`, error.message);
    }
  }

  console.log(`\nDone! Generated ${languages.length} audio files.`);
  console.log(`Total characters: ${totalChars}`);
  console.log(`Estimated cost: $${((totalChars / 1_000_000) * 15).toFixed(4)}`);
}

main().catch(console.error);
