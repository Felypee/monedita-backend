/**
 * Tool: send_contact
 * Sends the Monedita vCard so users can save the contact
 */

import { sendContactCard, sendTextMessage } from "../utils/whatsappClient.js";

export const definition = {
  name: "send_contact",
  description:
    "Use this when the user asks to save the contact, wants the vCard, or asks how to see 'Monedita' instead of the phone number in their chats. Keywords: guardar contacto, save contact, vCard, ver nombre, show name, agregar contacto",
  input_schema: {
    type: "object",
    properties: {},
    required: [],
  },
};

export async function handler(phone, params, lang, userCurrency) {
  const botNumber = process.env.WHATSAPP_BOT_NUMBER;

  if (!botNumber) {
    console.error("[send_contact] WHATSAPP_BOT_NUMBER not configured");
    return {
      success: false,
      message: null, // Agent will handle error
    };
  }

  try {
    // Send the vCard
    await sendContactCard(phone, {
      name: "Monedita",
      phone: `+${botNumber}`,
      website: "https://monedita.app",
    });

    // Send instruction message
    const messages = {
      en: `Tap to save me as *Monedita* in your contacts.`,
      es: `Toca para guardarme como *Monedita* en tus contactos.`,
      pt: `Toque para me salvar como *Monedita* nos seus contatos.`,
    };

    return {
      success: true,
      message: messages[lang] || messages.en,
    };
  } catch (error) {
    console.error("[send_contact] Error:", error);
    return {
      success: false,
      message: null,
    };
  }
}

export default { definition, handler };
