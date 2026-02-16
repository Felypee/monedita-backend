import {
  sendTextMessage,
  sendInteractiveButtons,
  sendDocument,
  markAsRead,
  downloadMedia,
  showProcessingIndicator,
} from "../utils/whatsappClient.js";
import {
  queueMessage,
  flushBatch,
} from "../services/messageBatcher.js";
import { UserDB, ExpenseDB, BudgetDB, UnprocessedDB } from "../database/index.js";
import { FinanceAgent } from "../agents/financeAgent.js";
import {
  getCurrencyFromPhone,
  validateAmount,
  formatAmount,
} from "../utils/currencyUtils.js";
import {
  processExpenseImage,
  processExpenseAudio,
} from "../utils/mediaProcessor.js";
import {
  hasPendingReminder,
  clearPendingReminder,
} from "../services/reminderService.js";
import {
  getLanguageFromPhone,
  getMessage,
} from "../utils/languageUtils.js";
import { getUserCategories } from "../utils/categoryUtils.js";
import {
  checkLimit,
  trackUsage,
  getSubscriptionStatus,
  getLimitExceededMessage,
  getUpgradeMessage,
  USAGE_TYPES,
} from "../services/subscriptionService.js";

/**
 * Handle incoming WhatsApp messages
 * Uses message batching (10s window) for text messages
 */
export async function handleIncomingMessage(message, phone) {
  let user;
  let clearIndicator = null;

  try {
    // Show processing indicator IMMEDIATELY (before any DB calls)
    clearIndicator = await showProcessingIndicator(phone, message.id);

    // Mark message as read
    await markAsRead(message.id);

    // Check if this is an existing user
    const existingUser = await UserDB.get(phone);
    const isNewUser = !existingUser;

    // Get or create user
    user = await UserDB.getOrCreate(phone);

    // Try to set currency from phone if not already set
    if (!user.currency) {
      const detectedCurrency = getCurrencyFromPhone(phone);
      if (detectedCurrency) {
        await UserDB.setCurrency(phone, detectedCurrency);
        user.currency = detectedCurrency;
      }
    }

    // Try to set language from phone if not already set
    if (!user.language) {
      const detectedLanguage = getLanguageFromPhone(phone);
      if (detectedLanguage) {
        await UserDB.setLanguage(phone, detectedLanguage);
        user.language = detectedLanguage;
      }
    }

    const lang = user.language || 'en';

    // For new users, send welcome message asking for name
    if (isNewUser) {
      const welcomeMsg = getWelcomeMessage(lang);
      if (clearIndicator) await clearIndicator();
      await sendTextMessage(phone, welcomeMsg);
      return; // Wait for them to respond with their name
    }

    // If user doesn't have a name yet, check if this message is their name
    if (!user.name && message.type === "text") {
      const messageText = message.text.body;
      if (looksLikeName(messageText)) {
        const name = messageText.trim();
        await UserDB.update(phone, { name });
        if (clearIndicator) await clearIndicator();
        await sendTextMessage(phone, getNameSavedMessage(name, lang));
        return;
      }
      // If doesn't look like a name, ask again
      if (clearIndicator) await clearIndicator();
      await sendTextMessage(phone, getMessage('ask_name_again', lang) || getWelcomeMessage(lang));
      return;
    }

    // For text messages, use batching (10-second window)
    if (message.type === "text") {
      const wasQueued = queueMessage(phone, message, async (batchPhone, batchedMessage) => {
        // This callback is called after 10 seconds of no new messages
        await processBatchedMessage(batchPhone, batchedMessage, user, lang);
      }, clearIndicator);  // Pass the indicator so batcher can clear when done

      if (wasQueued) {
        // Message was queued, indicator stays on until batch is processed
        console.log(`📨 Text queued for ${phone}: ${message.text.body.substring(0, 30)}...`);
        return;
      }
    }

    // For non-text messages (image, audio, interactive), flush any pending batch first
    if (message.type === "image" || message.type === "audio") {
      flushBatch(phone);
    }

    // Handle different message types immediately
    let response;

    if (message.type === "text") {
      // This path is only hit if queueMessage returns false (shouldn't happen for text)
      const messageText = message.text.body;
      console.log(`📨 Text from ${phone}: ${messageText}`);

      const agent = new FinanceAgent(phone, user.currency, lang);
      response = await agent.processMessage(messageText);

    } else if (message.type === "interactive") {
      const buttonId = message.interactive.button_reply.id;
      const buttonTitle = message.interactive.button_reply.title;
      console.log(`📨 Button from ${phone}: ${buttonTitle} (${buttonId})`);

      // Handle reminder button responses
      if (buttonId === "reminder_yes") {
        clearPendingReminder(phone);
        response = getMessage('reminder_yes_response', lang);
      } else if (buttonId === "reminder_no") {
        clearPendingReminder(phone);
        response = getMessage('reminder_no_response', lang);
      } else {
        // Other button responses - process via agent
        const agent = new FinanceAgent(phone, user.currency, lang);
        response = await agent.processMessage(buttonTitle);
      }

    } else if (message.type === "image") {
      console.log(`📷 Image from ${phone}`);
      response = await processImageMessage(phone, message.image, user.currency, lang);

    } else if (message.type === "audio") {
      console.log(`🎤 Audio from ${phone}`);
      response = await processAudioMessage(phone, message.audio, user.currency, lang);

    } else {
      if (clearIndicator) await clearIndicator();
      await sendTextMessage(phone, getMessage('unsupported_message', lang));
      return;
    }

    // Clear processing indicator before sending response
    if (clearIndicator) await clearIndicator();

    if (response) {
      await sendTextMessage(phone, response);
    }
  } catch (error) {
    console.error("Error handling message:", error);
    // Clear indicator on error too
    if (clearIndicator) await clearIndicator();
    const errorLang = user?.language || 'en';
    await sendTextMessage(phone, getMessage('error_generic', errorLang));
  }
}

/**
 * Get welcome message for new users - asks for name
 */
function getWelcomeMessage(lang) {
  const messages = {
    en: `👋 Welcome to Monedita!

I'm your AI expense assistant.

What's your name?`,
    es: `👋 ¡Bienvenido a Monedita!

Soy tu asistente de gastos con IA.

¿Cómo te llamas?`,
    pt: `👋 Bem-vindo ao Monedita!

Sou seu assistente de despesas com IA.

Qual é o seu nome?`
  };
  return messages[lang] || messages.en;
}

/**
 * Get message after saving user's name
 */
function getNameSavedMessage(name, lang) {
  const messages = {
    en: `Nice to meet you, *${name}*! 🎉

You have *50 free moneditas* to start.

Just tell me your expenses:
• "Spent 20 on coffee"
• Send a receipt photo
• Or send a voice note

Let's go! 💪`,
    es: `¡Mucho gusto, *${name}*! 🎉

Tienes *50 moneditas gratis* para empezar.

Solo dime tus gastos:
• "Gasté 20000 en café"
• Envía foto de un recibo
• O envía una nota de voz

¡Vamos! 💪`,
    pt: `Prazer, *${name}*! 🎉

Você tem *50 moneditas grátis* para começar.

Só me diga seus gastos:
• "Gastei 20 em café"
• Envie foto de um recibo
• Ou envie uma nota de voz

Vamos lá! 💪`
  };
  return messages[lang] || messages.en;
}

/**
 * Check if message looks like a name (simple heuristic)
 */
function looksLikeName(message) {
  const trimmed = message.trim();
  // Name should be 1-50 chars, no numbers, no special expense patterns
  if (trimmed.length < 1 || trimmed.length > 50) return false;
  if (/\d/.test(trimmed)) return false; // Has numbers
  if (/spent|gast[eéo]|compré|bought|\$/i.test(trimmed)) return false; // Expense pattern
  // Should be 1-3 words max
  const words = trimmed.split(/\s+/);
  return words.length <= 3;
}

/**
 * Process batched messages (called after 10-second window)
 * @param {string} phone - User's phone number
 * @param {object} batchedMessage - Combined message object
 * @param {object} user - User object
 * @param {string} lang - Language code
 */
async function processBatchedMessage(phone, batchedMessage, user, lang) {
  const clearIndicator = batchedMessage.clearIndicator;
  try {
    const messageText = batchedMessage.text.body;
    const messageCount = batchedMessage.messageCount || 1;

    console.log(`📨 Processing batch for ${phone}: ${messageCount} messages -> "${messageText.substring(0, 50)}..."`);

    // Check text message limit before processing
    const textLimitCheck = await checkLimit(phone, USAGE_TYPES.TEXT);
    if (!textLimitCheck.allowed) {
      const status = await getSubscriptionStatus(phone);
      const limitMsg = getLimitExceededMessage(USAGE_TYPES.TEXT, lang, textLimitCheck);
      const upgradeMsg = getUpgradeMessage(status.plan.id, lang);
      if (clearIndicator) await clearIndicator();
      await sendTextMessage(phone, `${limitMsg}\n\n${upgradeMsg}`);
      return;
    }

    // Track text usage BEFORE processing (so this message counts)
    await trackUsage(phone, USAGE_TYPES.TEXT);

    // Use the AI agent to process the combined message
    const agent = new FinanceAgent(phone, user.currency, lang);
    const response = await agent.processMessage(messageText);

    // Clear the processing indicator (was set when first message arrived)
    if (clearIndicator) await clearIndicator();

    if (response) {
      await sendTextMessage(phone, response);
    }
  } catch (error) {
    console.error("Error processing batched message:", error);
    // Clear indicator on error too
    if (clearIndicator) await clearIndicator();
    await sendTextMessage(phone, getMessage('error_generic', lang));
  }
}

/**
 * Process image message (receipt/bill OCR)
 * Charges 1 monedita per expense detected in the image
 */
async function processImageMessage(phone, imageData, userCurrency, lang = 'en') {
  try {
    // First check if user has at least 1 monedita available
    const initialCheck = await checkLimit(phone, USAGE_TYPES.TEXT);
    if (!initialCheck.allowed) {
      const status = await getSubscriptionStatus(phone);
      const limitMsg = getLimitExceededMessage(USAGE_TYPES.TEXT, lang, initialCheck);
      const upgradeMsg = getUpgradeMessage(status.plan.id, lang);
      return `${limitMsg}\n\n${upgradeMsg}`;
    }

    // Check if currency is set
    if (!userCurrency) {
      return getMessage('currency_not_set', lang);
    }

    // Download the image
    const { buffer, mimeType } = await downloadMedia(imageData.id);

    // Process with Claude Vision
    const categories = await getUserCategories(phone, lang);
    const result = await processExpenseImage(buffer, mimeType, categories, userCurrency);

    if (!result.detected || result.expenses.length === 0) {
      await UnprocessedDB.create(phone, {
        type: 'image',
        media_id: imageData.id,
        reason: 'no_expense_detected',
        raw_result: result,
      });
      // Still charge 1 monedita for processing the image (API cost)
      await trackUsage(phone, USAGE_TYPES.TEXT);
      return getMessage('image_saved_for_review', lang);
    }

    // Check how many moneditas the user has available
    const expenseCount = result.expenses.length;
    const currentCheck = await checkLimit(phone, USAGE_TYPES.TEXT);
    const availableMoneditas = currentCheck.remaining === -1 ? expenseCount : currentCheck.remaining;

    // Determine how many expenses we can process
    const expensesToProcess = result.expenses.slice(0, availableMoneditas);
    const skippedExpenses = result.expenses.slice(availableMoneditas);

    if (expensesToProcess.length === 0) {
      const status = await getSubscriptionStatus(phone);
      return getMessage('not_enough_moneditas', lang, {
        needed: expenseCount,
        remaining: 0
      }) + `\n\n${getUpgradeMessage(status.plan.id, lang)}`;
    }

    // Validate amounts for expenses we'll process
    const validationErrors = [];
    for (const exp of expensesToProcess) {
      const validation = validateAmount(exp.amount, userCurrency);
      if (!validation.valid) {
        validationErrors.push(`• ${exp.description || exp.category}: ${validation.error}`);
      }
    }

    if (validationErrors.length > 0) {
      return getMessage('validation_error_multi', lang) + validationErrors.join("\n");
    }

    // Create expenses (only the ones we can afford)
    const createdExpenses = [];
    const budgetAlerts = [];

    for (const exp of expensesToProcess) {
      const expense = await ExpenseDB.create(phone, {
        amount: exp.amount,
        category: exp.category,
        description: exp.description,
      });
      createdExpenses.push(expense);

      const budgetAlert = await checkBudgetAlert(phone, exp.category, userCurrency, lang);
      if (budgetAlert && !budgetAlerts.includes(budgetAlert)) {
        budgetAlerts.push(budgetAlert);
      }
    }

    // Track usage: 1 monedita per expense processed
    for (let i = 0; i < createdExpenses.length; i++) {
      await trackUsage(phone, USAGE_TYPES.TEXT);
    }

    // Build response
    let response;
    if (createdExpenses.length === 1) {
      const expense = createdExpenses[0];
      response = `${getMessage('image_logged', lang)} ${formatAmount(expense.amount, userCurrency)} ${getMessage('expense_for', lang)} ${expense.category}`;
      if (expense.description) {
        response += ` (${expense.description})`;
      }
    } else {
      response = getMessage('image_logged_multi', lang, { count: createdExpenses.length }) + "\n";
      for (const expense of createdExpenses) {
        response += `• ${formatAmount(expense.amount, userCurrency)} - ${expense.category}`;
        if (expense.description) {
          response += ` (${expense.description})`;
        }
        response += "\n";
      }
    }

    // Notify about skipped expenses due to insufficient moneditas
    if (skippedExpenses.length > 0) {
      const status = await getSubscriptionStatus(phone);
      response += `\n⚠️ ${getMessage('expenses_skipped', lang, { count: skippedExpenses.length })}`;
      response += `\n${getUpgradeMessage(status.plan.id, lang)}`;
    }

    if (budgetAlerts.length > 0) {
      response += `\n${budgetAlerts.join("\n")}`;
    }

    return response;
  } catch (error) {
    console.error("Error processing image:", error);
    await UnprocessedDB.create(phone, {
      type: 'image',
      media_id: imageData.id,
      reason: 'processing_error',
      content: error.message,
    });
    return getMessage('image_error', lang);
  }
}

/**
 * Process audio message (voice note)
 * Charges 1 monedita per expense detected in the audio
 */
async function processAudioMessage(phone, audioData, userCurrency, lang = 'en') {
  try {
    // First check if user has at least 1 monedita available
    const initialCheck = await checkLimit(phone, USAGE_TYPES.TEXT);
    if (!initialCheck.allowed) {
      const status = await getSubscriptionStatus(phone);
      const limitMsg = getLimitExceededMessage(USAGE_TYPES.TEXT, lang, initialCheck);
      const upgradeMsg = getUpgradeMessage(status.plan.id, lang);
      return `${limitMsg}\n\n${upgradeMsg}`;
    }

    // Check if currency is set
    if (!userCurrency) {
      return getMessage('currency_not_set', lang);
    }

    // Download the audio
    const { buffer, mimeType } = await downloadMedia(audioData.id);

    // Process: transcribe and extract expenses
    const categories = await getUserCategories(phone, lang);
    const result = await processExpenseAudio(buffer, mimeType, categories);

    if (result.error) {
      return getMessage('audio_error', lang);
    }

    if (!result.detected || result.expenses.length === 0) {
      await UnprocessedDB.create(phone, {
        type: 'audio',
        media_id: audioData.id,
        content: result.transcription || null,
        reason: 'no_expense_detected',
        raw_result: result,
      });
      // Still charge 1 monedita for processing the audio (API cost)
      await trackUsage(phone, USAGE_TYPES.TEXT);
      if (result.transcription) {
        return `${getMessage('audio_heard', lang)} "${result.transcription}"\n\n${getMessage('audio_saved_for_review', lang)}`;
      }
      return getMessage('audio_saved_for_review', lang);
    }

    // Check how many moneditas the user has available
    const expenseCount = result.expenses.length;
    const currentCheck = await checkLimit(phone, USAGE_TYPES.TEXT);
    const availableMoneditas = currentCheck.remaining === -1 ? expenseCount : currentCheck.remaining;

    // Determine how many expenses we can process
    const expensesToProcess = result.expenses.slice(0, availableMoneditas);
    const skippedExpenses = result.expenses.slice(availableMoneditas);

    if (expensesToProcess.length === 0) {
      const status = await getSubscriptionStatus(phone);
      return `${getMessage('audio_heard', lang)} "${result.transcription}"\n\n${getMessage('not_enough_moneditas', lang, {
        needed: expenseCount,
        remaining: 0
      })}\n\n${getUpgradeMessage(status.plan.id, lang)}`;
    }

    // Validate amounts for expenses we'll process
    const validationErrors = [];
    for (const exp of expensesToProcess) {
      const validation = validateAmount(exp.amount, userCurrency);
      if (!validation.valid) {
        validationErrors.push(`• ${exp.description || exp.category}: ${validation.error}`);
      }
    }

    if (validationErrors.length > 0) {
      return `${getMessage('audio_heard', lang)} "${result.transcription}"\n\n${getMessage('validation_error_multi', lang)}${validationErrors.join("\n")}`;
    }

    // Create expenses (only the ones we can afford)
    const createdExpenses = [];
    const budgetAlerts = [];

    for (const exp of expensesToProcess) {
      const expense = await ExpenseDB.create(phone, {
        amount: exp.amount,
        category: exp.category,
        description: exp.description,
      });
      createdExpenses.push(expense);

      const budgetAlert = await checkBudgetAlert(phone, exp.category, userCurrency, lang);
      if (budgetAlert && !budgetAlerts.includes(budgetAlert)) {
        budgetAlerts.push(budgetAlert);
      }
    }

    // Track usage: 1 monedita per expense processed
    for (let i = 0; i < createdExpenses.length; i++) {
      await trackUsage(phone, USAGE_TYPES.TEXT);
    }

    // Build response
    let response = `${getMessage('audio_heard', lang)} "${result.transcription}"\n\n`;
    if (createdExpenses.length === 1) {
      const expense = createdExpenses[0];
      response += `${getMessage('expense_logged', lang)} ${formatAmount(expense.amount, userCurrency)} ${getMessage('expense_for', lang)} ${expense.category}`;
      if (expense.description) {
        response += ` (${expense.description})`;
      }
    } else {
      response += getMessage('expense_logged_multi', lang, { count: createdExpenses.length }) + "\n";
      for (const expense of createdExpenses) {
        response += `• ${formatAmount(expense.amount, userCurrency)} - ${expense.category}`;
        if (expense.description) {
          response += ` (${expense.description})`;
        }
        response += "\n";
      }
    }

    // Notify about skipped expenses due to insufficient moneditas
    if (skippedExpenses.length > 0) {
      const status = await getSubscriptionStatus(phone);
      response += `\n⚠️ ${getMessage('expenses_skipped', lang, { count: skippedExpenses.length })}`;
      response += `\n${getUpgradeMessage(status.plan.id, lang)}`;
    }

    if (budgetAlerts.length > 0) {
      response += `\n${budgetAlerts.join("\n")}`;
    }

    return response;
  } catch (error) {
    console.error("Error processing audio:", error);
    await UnprocessedDB.create(phone, {
      type: 'audio',
      media_id: audioData.id,
      reason: 'processing_error',
      content: error.message,
    });
    return getMessage('audio_error', lang);
  }
}

/**
 * Check if expense triggers budget alert
 */
async function checkBudgetAlert(phone, category, userCurrency, lang = 'en') {
  const budget = await BudgetDB.getByCategory(phone, category);
  if (!budget) return null;

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const spent = await ExpenseDB.getTotalByCategory(phone, category, startOfMonth, endOfMonth);
  const percentage = (spent / parseFloat(budget.amount || 0)) * 100;

  if (percentage >= 100) {
    return getMessage('budget_alert_exceeded', lang, {
      category,
      spent: formatAmount(spent, userCurrency),
      budget: formatAmount(budget.amount, userCurrency)
    });
  } else if (percentage >= 80) {
    return getMessage('budget_alert_warning', lang, {
      percentage: percentage.toFixed(0),
      category
    });
  }

  return null;
}
