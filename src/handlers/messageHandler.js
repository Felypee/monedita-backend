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
  isInTutorial,
  startTutorial,
  processTutorialResponse,
  advanceToStep,
  simulateExpenseResponse,
  simulateSummaryResponse,
  simulateBudgetResponse,
} from "../services/onboardingService.js";
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
  try {
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

    // Start tutorial for new users
    if (isNewUser) {
      const tutorialMsg = await startTutorial(phone, lang);
      await sendTextMessage(phone, tutorialMsg);
      return;
    }

    // Handle tutorial mode for text messages (don't batch during tutorial)
    if (message.type === "text") {
      const messageText = message.text.body;
      const lowerMsg = messageText.toLowerCase().trim();

      // Handle "tutorial" command to restart tutorial
      if (lowerMsg === "tutorial") {
        const tutorialMsg = await startTutorial(phone, lang);
        await sendTextMessage(phone, tutorialMsg);
        return;
      }

      // Check if in tutorial and process response (no batching in tutorial)
      if (await isInTutorial(phone)) {
        const tutorialResult = await processTutorialResponse(phone, messageText, lang);

        if (tutorialResult) {
          if (tutorialResult.advance) {
            const userCurrency = user.currency || 'USD';

            if (tutorialResult.processExpense) {
              const expenseResponse = simulateExpenseResponse(phone, messageText, userCurrency, lang);
              await sendTextMessage(phone, expenseResponse);
              const nextStepMsg = await advanceToStep(phone, tutorialResult.nextStep, lang);
              if (nextStepMsg) await sendTextMessage(phone, nextStepMsg);
              return;
            } else if (tutorialResult.processSummary) {
              const summaryResponse = simulateSummaryResponse(phone, userCurrency, lang);
              await sendTextMessage(phone, summaryResponse);
              const nextStepMsg = await advanceToStep(phone, tutorialResult.nextStep, lang);
              if (nextStepMsg) await sendTextMessage(phone, nextStepMsg);
              return;
            } else if (tutorialResult.processBudget) {
              const budgetResponse = simulateBudgetResponse(messageText, userCurrency, lang);
              await sendTextMessage(phone, budgetResponse);
              const nextStepMsg = await advanceToStep(phone, tutorialResult.nextStep, lang);
              if (nextStepMsg) await sendTextMessage(phone, nextStepMsg);
              return;
            }
          } else {
            await sendTextMessage(phone, tutorialResult);
            return;
          }
        }
      }
    }

    // For text messages, use batching (10-second window)
    if (message.type === "text") {
      const wasQueued = queueMessage(phone, message, async (batchPhone, batchedMessage) => {
        // This callback is called after 10 seconds of no new messages
        await processBatchedMessage(batchPhone, batchedMessage, user, lang);
      });

      if (wasQueued) {
        // Message was queued, will be processed later
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

      const clearIndicator = await showProcessingIndicator(phone, message.id);
      const agent = new FinanceAgent(phone, user.currency, lang);
      response = await agent.processMessage(messageText);
      await clearIndicator();

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
        const clearIndicator = await showProcessingIndicator(phone, message.id);
        const agent = new FinanceAgent(phone, user.currency, lang);
        response = await agent.processMessage(buttonTitle);
        await clearIndicator();
      }

    } else if (message.type === "image") {
      console.log(`📷 Image from ${phone}`);
      const clearIndicator = await showProcessingIndicator(phone, message.id);
      response = await processImageMessage(phone, message.image, user.currency, lang);
      await clearIndicator();

    } else if (message.type === "audio") {
      console.log(`🎤 Audio from ${phone}`);
      const clearIndicator = await showProcessingIndicator(phone, message.id);
      response = await processAudioMessage(phone, message.audio, user.currency, lang);
      await clearIndicator();

    } else {
      await sendTextMessage(phone, getMessage('unsupported_message', lang));
      return;
    }

    if (response) {
      await sendTextMessage(phone, response);
    }
  } catch (error) {
    console.error("Error handling message:", error);
    const errorLang = user?.language || 'en';
    await sendTextMessage(phone, getMessage('error_generic', errorLang));
  }
}

/**
 * Process batched messages (called after 10-second window)
 * @param {string} phone - User's phone number
 * @param {object} batchedMessage - Combined message object
 * @param {object} user - User object
 * @param {string} lang - Language code
 */
async function processBatchedMessage(phone, batchedMessage, user, lang) {
  try {
    const messageText = batchedMessage.text.body;
    const messageCount = batchedMessage.messageCount || 1;
    const messageId = batchedMessage.lastMessageId;

    console.log(`📨 Processing batch for ${phone}: ${messageCount} messages -> "${messageText.substring(0, 50)}..."`);

    // Show processing indicator (⏳ reaction on last message)
    const clearIndicator = await showProcessingIndicator(phone, messageId);

    // Use the AI agent to process the combined message
    const agent = new FinanceAgent(phone, user.currency, lang);
    const response = await agent.processMessage(messageText);

    // Clear the processing indicator
    await clearIndicator();

    if (response) {
      await sendTextMessage(phone, response);
    }
  } catch (error) {
    console.error("Error processing batched message:", error);
    await sendTextMessage(phone, getMessage('error_generic', lang));
  }
}

/**
 * Process image message (receipt/bill OCR)
 */
async function processImageMessage(phone, imageData, userCurrency, lang = 'en') {
  try {
    // Check image message limit
    const imageLimitCheck = await checkLimit(phone, USAGE_TYPES.IMAGE);
    if (!imageLimitCheck.allowed) {
      const status = await getSubscriptionStatus(phone);
      const limitMsg = getLimitExceededMessage(USAGE_TYPES.IMAGE, lang, imageLimitCheck);
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
    const result = await processExpenseImage(buffer, mimeType, categories);

    if (!result.detected || result.expenses.length === 0) {
      await UnprocessedDB.create(phone, {
        type: 'image',
        media_id: imageData.id,
        reason: 'no_expense_detected',
        raw_result: result,
      });
      return getMessage('image_saved_for_review', lang);
    }

    // Validate all amounts
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

    // Track image usage after successful processing
    await trackUsage(phone, USAGE_TYPES.IMAGE);

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
 */
async function processAudioMessage(phone, audioData, userCurrency, lang = 'en') {
  try {
    // Check voice message limit
    const voiceLimitCheck = await checkLimit(phone, USAGE_TYPES.VOICE);
    if (!voiceLimitCheck.allowed) {
      const status = await getSubscriptionStatus(phone);
      const limitMsg = getLimitExceededMessage(USAGE_TYPES.VOICE, lang, voiceLimitCheck);
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
      if (result.transcription) {
        return `${getMessage('audio_heard', lang)} "${result.transcription}"\n\n${getMessage('audio_saved_for_review', lang)}`;
      }
      return getMessage('audio_saved_for_review', lang);
    }

    // Validate all amounts
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

    // Track voice usage after successful processing
    await trackUsage(phone, USAGE_TYPES.VOICE);

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
