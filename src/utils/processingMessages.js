/**
 * Processing messages - Motivational messages shown while processing user requests
 */

const PROCESSING_MESSAGES = {
  expense: {
    es: [
      "Anotando tu gasto... 💰",
      "Registrando en tu billetera virtual... 📝",
      "Un momento mientras organizo tus finanzas... 🧮",
      "Guardando para que no se te escape ni un peso... 💵",
      "Procesando con cariño tu registro... 💜",
      "Dame un segundo para anotar esto... ✏️",
      "Trabajando en tus números... 📊",
      "Sumando a tu historial de gastos... ➕",
      "Registrando tu movimiento... 🏃",
      "Actualizando tu balance... ⚖️",
    ],
    en: [
      "Logging your expense... 💰",
      "Adding this to your wallet... 📝",
      "One moment while I organize your finances... 🧮",
      "Saving so you don't miss a penny... 💵",
      "Processing your record with care... 💜",
      "Give me a second to note this down... ✏️",
      "Working on your numbers... 📊",
      "Adding to your expense history... ➕",
      "Recording your transaction... 🏃",
      "Updating your balance... ⚖️",
    ],
    pt: [
      "Anotando sua despesa... 💰",
      "Adicionando à sua carteira virtual... 📝",
      "Um momento enquanto organizo suas finanças... 🧮",
      "Salvando para não perder um centavo... 💵",
      "Processando seu registro com carinho... 💜",
      "Me dê um segundo para anotar isso... ✏️",
      "Trabalhando nos seus números... 📊",
      "Adicionando ao seu histórico de gastos... ➕",
      "Registrando sua transação... 🏃",
      "Atualizando seu saldo... ⚖️",
    ],
  },
  image: {
    es: [
      "Analizando tu recibo con lupa... 🔍",
      "Leyendo los detalles de tu compra... 📷",
      "Escaneando tu ticket... 🤖",
      "Extrayendo la información de tu recibo... 📃",
      "Revisando tu factura... 🧾",
      "Procesando tu imagen... 🖼️",
    ],
    en: [
      "Analyzing your receipt with a magnifying glass... 🔍",
      "Reading the details of your purchase... 📷",
      "Scanning your ticket... 🤖",
      "Extracting information from your receipt... 📃",
      "Reviewing your invoice... 🧾",
      "Processing your image... 🖼️",
    ],
    pt: [
      "Analisando seu recibo com lupa... 🔍",
      "Lendo os detalhes da sua compra... 📷",
      "Escaneando seu ticket... 🤖",
      "Extraindo informações do seu recibo... 📃",
      "Revisando sua fatura... 🧾",
      "Processando sua imagem... 🖼️",
    ],
  },
  audio: {
    es: [
      "Escuchando atentamente tu mensaje... 🎤",
      "Procesando tu nota de voz... 🎧",
      "Dame un momento para entenderte... 👂",
      "Transcribiendo tu audio... 📝",
      "Escuchando lo que me cuentas... 🔊",
    ],
    en: [
      "Listening carefully to your message... 🎤",
      "Processing your voice note... 🎧",
      "Give me a moment to understand you... 👂",
      "Transcribing your audio... 📝",
      "Listening to what you're telling me... 🔊",
    ],
    pt: [
      "Ouvindo atentamente sua mensagem... 🎤",
      "Processando sua nota de voz... 🎧",
      "Me dê um momento para entender... 👂",
      "Transcrevendo seu áudio... 📝",
      "Escutando o que você me conta... 🔊",
    ],
  },
  general: {
    es: [
      "Pensando en la mejor respuesta... 💭",
      "Un momentito, ya te respondo... 🙌",
      "Procesando tu mensaje... ⏳",
      "Dame un segundo... ✨",
      "Trabajando en ello... 🛠️",
    ],
    en: [
      "Thinking of the best response... 💭",
      "Just a moment, I'll respond... 🙌",
      "Processing your message... ⏳",
      "Give me a second... ✨",
      "Working on it... 🛠️",
    ],
    pt: [
      "Pensando na melhor resposta... 💭",
      "Um momentinho, já respondo... 🙌",
      "Processando sua mensagem... ⏳",
      "Me dê um segundo... ✨",
      "Trabalhando nisso... 🛠️",
    ],
  },
};

/**
 * Get a random processing message based on language and context
 * @param {string} lang - Language code (es, en, pt)
 * @param {string} context - Context type (expense, image, audio, general)
 * @returns {string} Random processing message
 */
export function getRandomProcessingMessage(lang = 'es', context = 'general') {
  // Get messages for the context, fallback to general
  const contextMessages = PROCESSING_MESSAGES[context] || PROCESSING_MESSAGES.general;

  // Get messages for the language, fallback to Spanish then English
  const messages = contextMessages[lang]
    || contextMessages.es
    || contextMessages.en
    || PROCESSING_MESSAGES.general.es;

  // Return a random message
  return messages[Math.floor(Math.random() * messages.length)];
}

export default { getRandomProcessingMessage };
