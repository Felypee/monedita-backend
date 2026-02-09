/**
 * Tool: Help/Welcome Info
 * Shows help and welcome message
 */

import { getMessage } from "../utils/languageUtils.js";

export const definition = {
  name: "help_info",
  description: "Show help information and available commands. Use when user greets, asks for help, or wants to know what the bot can do. Examples: 'hi', 'hello', 'help', 'start', 'what can you do'",
  input_schema: {
    type: "object",
    properties: {},
    required: []
  }
};

export async function handler(phone, params, lang, userCurrency) {
  return { success: true, message: getMessage('welcome', lang) };
}

export default { definition, handler };
