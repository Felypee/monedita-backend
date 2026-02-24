import {
  sendTextMessage,
  sendInteractiveButtons,
  sendDocument,
  markAsRead,
  downloadMedia,
  showProcessingIndicator,
  sendContactCard,
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
  checkMoneditas,
  consumeMoneditas,
  getMoneditasStatus,
  getUpgradeMessage,
} from "../services/moneditasService.js";
import {
  calculateTotalCost,
  formatCostLog,
  MAX_ESTIMATES,
} from "../services/costTracker.js";
import { sendContextSticker, STICKER_CONTEXTS } from "../services/stickerService.js";
import { sendWelcomeAudio } from "../services/welcomeAudioService.js";

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

    // For new users, send vCard first, then welcome message
    if (isNewUser) {
      if (clearIndicator) await clearIndicator();

      // Send welcome sticker
      await sendContextSticker(phone, STICKER_CONTEXTS.WELCOME);

      // Send vCard so they can save the contact
      await sendMoneditaContactCard(phone, lang);

      // Send welcome audio (if available for this language)
      const audioSent = await sendWelcomeAudio(phone, lang);

      // Also send text message for accessibility (and if audio isn't available)
      if (!audioSent) {
        const welcomeMsg = getWelcomeMessage(lang);
        await sendTextMessage(phone, welcomeMsg);
      }
      return; // Wait for them to respond with their name
    }

    // If user doesn't have a name yet, check if this message is their name
    if (!user.name && message.type === "text") {
      const messageText = message.text.body;
      if (looksLikeName(messageText)) {
        const name = messageText.trim();
        await UserDB.update(phone, { name });
        if (clearIndicator) await clearIndicator();
        await sendContextSticker(phone, STICKER_CONTEXTS.CELEBRATE);
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
You have *100 free moneditas*. Just tell me your expenses!`,
    es: `¡Mucho gusto, *${name}*! 🎉
Tienes *100 moneditas gratis*. ¡Solo dime tus gastos!`,
    pt: `Prazer, *${name}*! 🎉
Você tem *100 moneditas grátis*. Só me diga seus gastos!`
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
 * Get moneditas exhausted message
 */
function getMoneditasExhaustedMessage(lang, details) {
  const messages = {
    en: `You've used all your moneditas (${details.used}/${details.limit}).

Your moneditas reset on the next billing cycle.`,
    es: `Se acabaron tus moneditas (${details.used}/${details.limit}).

Tus moneditas se renuevan en el próximo ciclo de facturación.`,
    pt: `Suas moneditas acabaram (${details.used}/${details.limit}).

Suas moneditas renovam no próximo ciclo de cobrança.`
  };
  return messages[lang] || messages.en;
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

    // Check moneditas before processing (use max estimate for pre-check)
    const moneditasCheck = await checkMoneditas(phone, MAX_ESTIMATES.TEXT_MESSAGE);
    if (!moneditasCheck.allowed) {
      const status = await getMoneditasStatus(phone);
      const exhaustedMsg = getMoneditasExhaustedMessage(lang, moneditasCheck);
      const upgradeMsg = getUpgradeMessage(status.plan.id, lang);
      if (clearIndicator) await clearIndicator();
      await sendTextMessage(phone, `${exhaustedMsg}\n\n${upgradeMsg}`);
      return;
    }

    // Use the AI agent to process the combined message
    const agent = new FinanceAgent(phone, user.currency, lang);
    const response = await agent.processMessage(messageText);

    // Calculate REAL cost based on actual token usage
    const tokenUsage = agent.getLastTokenUsage();
    const costResult = calculateTotalCost({
      claude: tokenUsage,
      whatsappMessages: 1, // Response message
    });

    console.log(formatCostLog(costResult));

    // Consume actual moneditas (minimum 1)
    const actualCost = Math.max(1, costResult.totalMoneditas);
    await consumeMoneditas(phone, actualCost, "text_message");

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
 * Charges based on actual Claude Vision tokens used
 */
async function processImageMessage(phone, imageData, userCurrency, lang = 'en') {
  try {
    // Check moneditas before processing (use max estimate for pre-check)
    const moneditasCheck = await checkMoneditas(phone, MAX_ESTIMATES.IMAGE_RECEIPT);
    if (!moneditasCheck.allowed) {
      const status = await getMoneditasStatus(phone);
      const exhaustedMsg = getMoneditasExhaustedMessage(lang, moneditasCheck);
      const upgradeMsg = getUpgradeMessage(status.plan.id, lang);
      return `${exhaustedMsg}\n\n${upgradeMsg}`;
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

    // Calculate REAL cost based on actual token usage
    const costResult = calculateTotalCost({
      claude: result._tokenUsage,
      whatsappMessages: 1, // Response message
    });

    console.log(formatCostLog(costResult));

    // Consume actual moneditas (minimum 1)
    const actualCost = Math.max(1, costResult.totalMoneditas);
    await consumeMoneditas(phone, actualCost, "image_receipt");

    if (!result.detected || result.expenses.length === 0) {
      await UnprocessedDB.create(phone, {
        type: 'image',
        media_id: imageData.id,
        reason: 'no_expense_detected',
        raw_result: result,
      });
      return getMessage('image_saved_for_review', lang);
    }

    // Validate amounts for detected expenses
    const validationErrors = [];
    for (const exp of result.expenses) {
      const validation = validateAmount(exp.amount, userCurrency);
      if (!validation.valid) {
        validationErrors.push(`• ${exp.description || exp.category}: ${validation.error}`);
      }
    }

    if (validationErrors.length > 0) {
      return getMessage('validation_error_multi', lang) + validationErrors.join("\n");
    }

    // Create all expenses
    const createdExpenses = [];
    const budgetAlerts = [];

    for (const exp of result.expenses) {
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
 * Charges based on actual Whisper + Claude tokens used
 */
async function processAudioMessage(phone, audioData, userCurrency, lang = 'en') {
  try {
    // Check moneditas before processing (use max estimate for pre-check)
    const moneditasCheck = await checkMoneditas(phone, MAX_ESTIMATES.AUDIO_MESSAGE);
    if (!moneditasCheck.allowed) {
      const status = await getMoneditasStatus(phone);
      const exhaustedMsg = getMoneditasExhaustedMessage(lang, moneditasCheck);
      const upgradeMsg = getUpgradeMessage(status.plan.id, lang);
      return `${exhaustedMsg}\n\n${upgradeMsg}`;
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

    // Calculate REAL cost based on actual usage
    const costResult = calculateTotalCost({
      claude: result._tokenUsage,
      whisper: result._whisperUsage,
      whatsappMessages: 1, // Response message
    });

    console.log(formatCostLog(costResult));

    // Consume actual moneditas (minimum 1)
    const actualCost = Math.max(1, costResult.totalMoneditas);
    await consumeMoneditas(phone, actualCost, "audio_message");

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
      if (result.transcription) {
        return `${getMessage('audio_heard', lang)} "${result.transcription}"\n\n${getMessage('audio_saved_for_review', lang)}`;
      }
      return getMessage('audio_saved_for_review', lang);
    }

    // Validate amounts for detected expenses
    const validationErrors = [];
    for (const exp of result.expenses) {
      const validation = validateAmount(exp.amount, userCurrency);
      if (!validation.valid) {
        validationErrors.push(`• ${exp.description || exp.category}: ${validation.error}`);
      }
    }

    if (validationErrors.length > 0) {
      return `${getMessage('audio_heard', lang)} "${result.transcription}"\n\n${getMessage('validation_error_multi', lang)}${validationErrors.join("\n")}`;
    }

    // Create all expenses
    const createdExpenses = [];
    const budgetAlerts = [];

    for (const exp of result.expenses) {
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
 * Send Monedita contact card so user can save it
 */
async function sendMoneditaContactCard(phone, lang = 'en') {
  const botNumber = process.env.WHATSAPP_BOT_NUMBER;
  if (!botNumber) {
    console.log('[vCard] WHATSAPP_BOT_NUMBER not set, skipping contact card');
    return;
  }

  try {
    await sendContactCard(phone, {
      name: 'Monedita',
      phone: `+${botNumber}`,
      website: 'https://monedita.app'
    });
  } catch (error) {
    console.error('Error sending Monedita contact card:', error);
    // Don't fail the flow if vCard fails
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
