/**
 * Language utilities - Maps country codes to languages and provides translations
 */

// Map phone country codes to language codes
export const COUNTRY_CODE_TO_LANGUAGE = {
  '1': 'en',      // USA, Canada
  '44': 'en',     // UK
  '61': 'en',     // Australia
  '64': 'en',     // New Zealand
  '57': 'es',     // Colombia
  '52': 'es',     // Mexico
  '54': 'es',     // Argentina
  '56': 'es',     // Chile
  '51': 'es',     // Peru
  '58': 'es',     // Venezuela
  '34': 'es',     // Spain
  '55': 'pt',     // Brazil
  '351': 'pt',    // Portugal
  '33': 'fr',     // France
  '49': 'de',     // Germany
  '43': 'de',     // Austria
  '41': 'de',     // Switzerland (German)
  '39': 'it',     // Italy
  '81': 'ja',     // Japan
  '82': 'ko',     // South Korea
  '86': 'zh',     // China
  '91': 'hi',     // India
};

// Message templates per language
const MESSAGES = {
  en: {
    // Welcome
    welcome: `👋 Welcome to FinanceFlow!

I'm your AI expense manager. Here's what I can do:

💰 *Track Expenses*
Just tell me: "Spent 45 on groceries"

📊 *Check Status*
Ask: "How am I doing?" or "Show my spending"

🎯 *Set Budgets*
Say: "Set food budget to 500"

📈 *Get Insights*
Ask: "What's my biggest expense?"

Try it now! Tell me about a recent expense.`,

    // Expense logging
    expense_logged: "✅ Logged:",
    expense_logged_multi: "✅ Logged {count} expenses:",
    expense_for: "for",

    // Image/Audio
    image_logged: "📷 ✅ Logged from image:",
    image_logged_multi: "📷 ✅ Logged {count} expenses from image:",
    image_no_expense: "📷 I couldn't detect any expenses in this image. Please send a clearer photo of your receipt or bill, or type the expense manually.",
    image_error: "📷 Sorry, I couldn't process that image. Please try again or type the expense manually.",
    audio_heard: "🎤 I heard:",
    audio_no_expense: "But I couldn't detect any expenses. Try saying something like \"Spent 30 dollars on groceries\".",
    audio_error: "🎤 Sorry, I couldn't process that voice message. Please try again or type the expense.",

    // Currency
    currency_not_set: "I couldn't detect your currency from your phone number. Please tell me your currency (e.g., \"My currency is COP\" or \"My currency is USD\").",
    currency_already_set: "Your currency is already set to {currency}. Currency cannot be changed once set.",
    currency_invalid: "Sorry, \"{code}\" is not a supported currency. Please use a valid 3-letter currency code like USD, EUR, COP, etc.",
    currency_set: "✅ Your currency has been set to {currency}. All your expenses will now be tracked in this currency.",

    // Budget
    budget_set: "✅ Set {category} budget to {amount}/month",
    budget_updated: "✅ Updated {category} budget to {amount}/month",
    budget_help: "To set a budget, say: \"Set food budget to 500\"",
    budget_none: "You haven't set any budgets yet. Try: \"Set food budget to 500\"",
    budget_title: "🎯 *Your Budgets*",
    budget_label: "Budget:",
    budget_spent: "Spent:",
    budget_remaining: "Remaining:",
    budget_alert_exceeded: "⚠️ *Budget Alert!* You've exceeded your {category} budget ({spent}/{budget})",
    budget_alert_warning: "⚠️ You've used {percentage}% of your {category} budget",

    // Summary
    summary_title: "📊 *{month} Summary*",
    summary_total_spent: "Total Spent:",
    summary_total_budget: "Total Budget:",
    summary_remaining: "Remaining:",
    summary_by_category: "*By Category:*",
    summary_expenses: "expenses",

    // Expenses list
    expenses_title: "📝 *Recent Expenses*",
    expenses_none: "You haven't logged any expenses yet. Try: \"Spent 45 on groceries\"",

    // Validation errors
    validation_no_decimals: "{currency} does not allow decimals. Please enter a whole number.",
    validation_min_amount: "Amount must be at least {min}. You entered {amount}.",
    validation_error_prefix: "Sorry, I couldn't log that expense.\n\n",
    validation_error_multi: "Sorry, I couldn't log some expenses:\n\n",

    // Reminders
    reminder_afternoon: "Good afternoon! Have you made any purchases today that you'd like to track?",
    reminder_evening: "Good evening! Have you made any purchases today that you'd like to track?",
    reminder_btn_yes: "Yes, log expense",
    reminder_btn_no: "No, all good",
    reminder_yes_response: "Great! Tell me what you spent. You can:\n\n• Type: \"Spent 50 on lunch\"\n• Send a photo of your receipt\n• Send a voice message",
    reminder_no_response: "No problem! I'll check in with you later. Keep tracking your expenses!",

    // General
    unsupported_message: "I can process text, images (receipts), and voice messages. Try one of those!",
    error_generic: "Sorry, I encountered an error. Please try again.",
  },

  es: {
    // Welcome
    welcome: `👋 ¡Bienvenido a FinanceFlow!

Soy tu asistente de gastos con IA. Esto es lo que puedo hacer:

💰 *Registrar Gastos*
Solo dime: "Gasté 45000 en mercado"

📊 *Ver Estado*
Pregunta: "¿Cómo voy?" o "Muestra mis gastos"

🎯 *Definir Presupuestos*
Di: "Pon presupuesto de comida en 500000"

📈 *Obtener Información*
Pregunta: "¿Cuál es mi mayor gasto?"

¡Pruébalo ahora! Cuéntame sobre un gasto reciente.`,

    // Expense logging
    expense_logged: "✅ Registrado:",
    expense_logged_multi: "✅ Registrados {count} gastos:",
    expense_for: "en",

    // Image/Audio
    image_logged: "📷 ✅ Registrado desde imagen:",
    image_logged_multi: "📷 ✅ Registrados {count} gastos desde imagen:",
    image_no_expense: "📷 No pude detectar gastos en esta imagen. Por favor envía una foto más clara del recibo o escribe el gasto manualmente.",
    image_error: "📷 Lo siento, no pude procesar esa imagen. Intenta de nuevo o escribe el gasto manualmente.",
    audio_heard: "🎤 Escuché:",
    audio_no_expense: "Pero no pude detectar gastos. Intenta decir algo como \"Gasté 30 mil en mercado\".",
    audio_error: "🎤 Lo siento, no pude procesar ese mensaje de voz. Intenta de nuevo o escribe el gasto.",

    // Currency
    currency_not_set: "No pude detectar tu moneda desde tu número de teléfono. Por favor dime tu moneda (ej: \"Mi moneda es COP\" o \"Mi moneda es USD\").",
    currency_already_set: "Tu moneda ya está configurada como {currency}. La moneda no se puede cambiar una vez establecida.",
    currency_invalid: "Lo siento, \"{code}\" no es una moneda soportada. Usa un código de 3 letras válido como USD, EUR, COP, etc.",
    currency_set: "✅ Tu moneda ha sido configurada como {currency}. Todos tus gastos serán registrados en esta moneda.",

    // Budget
    budget_set: "✅ Presupuesto de {category} establecido en {amount}/mes",
    budget_updated: "✅ Presupuesto de {category} actualizado a {amount}/mes",
    budget_help: "Para establecer un presupuesto, di: \"Pon presupuesto de comida en 500000\"",
    budget_none: "No has establecido presupuestos aún. Intenta: \"Pon presupuesto de comida en 500000\"",
    budget_title: "🎯 *Tus Presupuestos*",
    budget_label: "Presupuesto:",
    budget_spent: "Gastado:",
    budget_remaining: "Restante:",
    budget_alert_exceeded: "⚠️ *¡Alerta de Presupuesto!* Has excedido tu presupuesto de {category} ({spent}/{budget})",
    budget_alert_warning: "⚠️ Has usado el {percentage}% de tu presupuesto de {category}",

    // Summary
    summary_title: "📊 *Resumen de {month}*",
    summary_total_spent: "Total Gastado:",
    summary_total_budget: "Presupuesto Total:",
    summary_remaining: "Restante:",
    summary_by_category: "*Por Categoría:*",
    summary_expenses: "gastos",

    // Expenses list
    expenses_title: "📝 *Gastos Recientes*",
    expenses_none: "No has registrado gastos aún. Intenta: \"Gasté 45000 en mercado\"",

    // Validation errors
    validation_no_decimals: "{currency} no permite decimales. Por favor ingresa un número entero.",
    validation_min_amount: "El monto debe ser al menos {min}. Ingresaste {amount}.",
    validation_error_prefix: "Lo siento, no pude registrar ese gasto.\n\n",
    validation_error_multi: "Lo siento, no pude registrar algunos gastos:\n\n",

    // Reminders
    reminder_afternoon: "¡Buenas tardes! ¿Has hecho alguna compra hoy que quieras registrar?",
    reminder_evening: "¡Buenas noches! ¿Has hecho alguna compra hoy que quieras registrar?",
    reminder_btn_yes: "Sí, registrar gasto",
    reminder_btn_no: "No, todo bien",
    reminder_yes_response: "¡Perfecto! Cuéntame qué gastaste. Puedes:\n\n• Escribir: \"Gasté 50000 en almuerzo\"\n• Enviar una foto del recibo\n• Enviar un mensaje de voz",
    reminder_no_response: "¡No hay problema! Te escribiré más tarde. ¡Sigue registrando tus gastos!",

    // General
    unsupported_message: "Puedo procesar texto, imágenes (recibos) y mensajes de voz. ¡Intenta uno de esos!",
    error_generic: "Lo siento, ocurrió un error. Por favor intenta de nuevo.",
  },

  pt: {
    // Welcome
    welcome: `👋 Bem-vindo ao FinanceFlow!

Sou seu assistente de despesas com IA. Aqui está o que posso fazer:

💰 *Registrar Despesas*
Basta me dizer: "Gastei 45 em mercado"

📊 *Ver Status*
Pergunte: "Como estou?" ou "Mostre meus gastos"

🎯 *Definir Orçamentos*
Diga: "Defina orçamento de comida para 500"

📈 *Obter Informações*
Pergunte: "Qual é minha maior despesa?"

Experimente agora! Me conte sobre uma despesa recente.`,

    // Expense logging
    expense_logged: "✅ Registrado:",
    expense_logged_multi: "✅ Registradas {count} despesas:",
    expense_for: "em",

    // Image/Audio
    image_logged: "📷 ✅ Registrado da imagem:",
    image_logged_multi: "📷 ✅ Registradas {count} despesas da imagem:",
    image_no_expense: "📷 Não consegui detectar despesas nesta imagem. Por favor, envie uma foto mais clara do recibo ou digite a despesa manualmente.",
    image_error: "📷 Desculpe, não consegui processar essa imagem. Tente novamente ou digite a despesa manualmente.",
    audio_heard: "🎤 Eu ouvi:",
    audio_no_expense: "Mas não consegui detectar despesas. Tente dizer algo como \"Gastei 30 reais em mercado\".",
    audio_error: "🎤 Desculpe, não consegui processar essa mensagem de voz. Tente novamente ou digite a despesa.",

    // Currency
    currency_not_set: "Não consegui detectar sua moeda pelo número de telefone. Por favor, me diga sua moeda (ex: \"Minha moeda é BRL\" ou \"Minha moeda é USD\").",
    currency_already_set: "Sua moeda já está configurada como {currency}. A moeda não pode ser alterada depois de definida.",
    currency_invalid: "Desculpe, \"{code}\" não é uma moeda suportada. Use um código válido de 3 letras como USD, EUR, BRL, etc.",
    currency_set: "✅ Sua moeda foi configurada como {currency}. Todas as suas despesas serão registradas nesta moeda.",

    // Budget
    budget_set: "✅ Orçamento de {category} definido para {amount}/mês",
    budget_updated: "✅ Orçamento de {category} atualizado para {amount}/mês",
    budget_help: "Para definir um orçamento, diga: \"Defina orçamento de comida para 500\"",
    budget_none: "Você ainda não definiu orçamentos. Tente: \"Defina orçamento de comida para 500\"",
    budget_title: "🎯 *Seus Orçamentos*",
    budget_label: "Orçamento:",
    budget_spent: "Gasto:",
    budget_remaining: "Restante:",
    budget_alert_exceeded: "⚠️ *Alerta de Orçamento!* Você excedeu seu orçamento de {category} ({spent}/{budget})",
    budget_alert_warning: "⚠️ Você usou {percentage}% do seu orçamento de {category}",

    // Summary
    summary_title: "📊 *Resumo de {month}*",
    summary_total_spent: "Total Gasto:",
    summary_total_budget: "Orçamento Total:",
    summary_remaining: "Restante:",
    summary_by_category: "*Por Categoria:*",
    summary_expenses: "despesas",

    // Expenses list
    expenses_title: "📝 *Despesas Recentes*",
    expenses_none: "Você ainda não registrou despesas. Tente: \"Gastei 45 em mercado\"",

    // Validation errors
    validation_no_decimals: "{currency} não permite decimais. Por favor, insira um número inteiro.",
    validation_min_amount: "O valor deve ser pelo menos {min}. Você inseriu {amount}.",
    validation_error_prefix: "Desculpe, não consegui registrar essa despesa.\n\n",
    validation_error_multi: "Desculpe, não consegui registrar algumas despesas:\n\n",

    // Reminders
    reminder_afternoon: "Boa tarde! Você fez alguma compra hoje que gostaria de registrar?",
    reminder_evening: "Boa noite! Você fez alguma compra hoje que gostaria de registrar?",
    reminder_btn_yes: "Sim, registrar",
    reminder_btn_no: "Não, tudo certo",
    reminder_yes_response: "Ótimo! Me conte o que você gastou. Você pode:\n\n• Digitar: \"Gastei 50 em almoço\"\n• Enviar uma foto do recibo\n• Enviar uma mensagem de voz",
    reminder_no_response: "Sem problemas! Falo com você mais tarde. Continue registrando suas despesas!",

    // General
    unsupported_message: "Posso processar texto, imagens (recibos) e mensagens de voz. Tente um desses!",
    error_generic: "Desculpe, ocorreu um erro. Por favor, tente novamente.",
  },
};

// Default language
const DEFAULT_LANGUAGE = 'en';

/**
 * Get language code from phone number
 * @param {string} phone - Phone number
 * @returns {string} Language code (en, es, pt, etc.)
 */
export function getLanguageFromPhone(phone) {
  if (!phone) return DEFAULT_LANGUAGE;

  const cleanPhone = phone.replace(/\D/g, '');

  // Try matching country codes from longest to shortest
  for (const length of [3, 2, 1]) {
    const prefix = cleanPhone.substring(0, length);
    if (COUNTRY_CODE_TO_LANGUAGE[prefix]) {
      return COUNTRY_CODE_TO_LANGUAGE[prefix];
    }
  }

  return DEFAULT_LANGUAGE;
}

/**
 * Get a translated message
 * @param {string} key - Message key
 * @param {string} language - Language code
 * @param {object} params - Parameters to replace in the message
 * @returns {string} Translated message
 */
export function getMessage(key, language = DEFAULT_LANGUAGE, params = {}) {
  const lang = MESSAGES[language] || MESSAGES[DEFAULT_LANGUAGE];
  let message = lang[key] || MESSAGES[DEFAULT_LANGUAGE][key] || key;

  // Replace parameters
  for (const [param, value] of Object.entries(params)) {
    message = message.replace(new RegExp(`\\{${param}\\}`, 'g'), value);
  }

  return message;
}

/**
 * Check if a language is supported
 * @param {string} language - Language code
 * @returns {boolean}
 */
export function isLanguageSupported(language) {
  return MESSAGES.hasOwnProperty(language);
}

/**
 * Get all supported languages
 * @returns {string[]}
 */
export function getSupportedLanguages() {
  return Object.keys(MESSAGES);
}
