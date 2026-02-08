import {
  sendTextMessage,
  sendInteractiveButtons,
  markAsRead,
  downloadMedia,
} from "../utils/whatsappClient.js";
import { UserDB, ExpenseDB, BudgetDB } from "../database/index.js";
import { FinanceAgent } from "../agents/financeAgent.js";
import {
  getCurrencyFromPhone,
  validateAmount,
  formatAmount,
  isValidCurrency,
  getCurrencyName,
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

/**
 * Handle incoming WhatsApp messages
 */
export async function handleIncomingMessage(message, phone) {
  try {
    // Mark message as read
    await markAsRead(message.id);

    // Get or create user
    const user = await UserDB.getOrCreate(phone);

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

    // Handle different message types
    let response;

    if (message.type === "text") {
      const messageText = message.text.body;
      console.log(`📨 Text from ${phone}: ${messageText}`);
      response = await processCommand(phone, messageText, lang);
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
        // Other button responses - process as command
        response = await processCommand(phone, buttonTitle, lang);
      }
    } else if (message.type === "image") {
      console.log(`📷 Image from ${phone}`);
      response = await processImageMessage(phone, message.image, user.currency, lang);
    } else if (message.type === "audio") {
      console.log(`🎤 Audio from ${phone}`);
      response = await processAudioMessage(phone, message.audio, user.currency, lang);
    } else {
      await sendTextMessage(
        phone,
        getMessage('unsupported_message', lang),
      );
      return;
    }

    if (response) {
      await sendTextMessage(phone, response);
    }
  } catch (error) {
    console.error("Error handling message:", error);
    const errorLang = user?.language || 'en';
    await sendTextMessage(
      phone,
      getMessage('error_generic', errorLang),
    );
  }
}

/**
 * Process user commands and messages
 */
async function processCommand(phone, message, lang = 'en') {
  const agent = new FinanceAgent(phone);
  const lowerMsg = message.toLowerCase().trim();

  // Command: Start/Help (detect Spanish greetings too)
  if (
    lowerMsg === "hi" ||
    lowerMsg === "hello" ||
    lowerMsg === "start" ||
    lowerMsg === "help" ||
    lowerMsg === "hola" ||
    lowerMsg === "ayuda" ||
    lowerMsg === "inicio"
  ) {
    return getMessage('welcome', lang);
  }

  // Command: Set currency (supports English and Spanish)
  const currencyMatch = lowerMsg.match(/(?:my currency is|mi moneda es)\s+([a-z]{3})/i);
  if (currencyMatch) {
    return await handleSetCurrency(phone, currencyMatch[1].toUpperCase(), lang);
  }

  // Command: Rename category (EN/ES/PT)
  const renameMatch = message.match(/(?:rename|renombrar|renomear)\s+(.+?)\s+(?:to|a|para)\s+(.+)/i);
  if (renameMatch) {
    const oldName = renameMatch[1].trim().toLowerCase();
    const newName = renameMatch[2].trim().toLowerCase();
    return await handleRenameCategory(phone, oldName, newName, lang);
  }

  // Command: Set budget (supports English and Spanish)
  if ((lowerMsg.includes("set") && lowerMsg.includes("budget")) ||
      (lowerMsg.includes("pon") && lowerMsg.includes("presupuesto"))) {
    return await handleSetBudget(phone, message, lang);
  }

  // Command: Show budgets
  if (lowerMsg.includes("show budget") || lowerMsg === "budgets" ||
      lowerMsg.includes("ver presupuesto") || lowerMsg === "presupuestos") {
    return await handleShowBudgets(phone, lang);
  }

  // Command: Summary
  if (
    lowerMsg.includes("summary") ||
    lowerMsg.includes("how am i doing") ||
    lowerMsg.includes("status") ||
    lowerMsg.includes("resumen") ||
    lowerMsg.includes("cómo voy") ||
    lowerMsg.includes("como voy")
  ) {
    return await handleSummary(phone, lang);
  }

  // Command: Show expenses
  if (
    lowerMsg.includes("show expenses") ||
    lowerMsg.includes("list expenses") ||
    lowerMsg.includes("ver gastos") ||
    lowerMsg.includes("mis gastos")
  ) {
    return await handleShowExpenses(phone, lang);
  }

  // Auto-detect and log expenses (supports multiple expenses in one message)
  const categories = await getUserCategories(phone, lang);
  const expenseDetection = await agent.detectExpenses(message, categories);

  if (expenseDetection.detected && expenseDetection.expenses.length > 0) {
    // Get user's currency
    const userCurrency = await UserDB.getCurrency(phone);

    // Check if currency is set
    if (!userCurrency) {
      return getMessage('currency_not_set', lang);
    }

    // Validate all amounts first
    const validationErrors = [];
    for (const exp of expenseDetection.expenses) {
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

    for (const exp of expenseDetection.expenses) {
      const expense = await ExpenseDB.create(phone, {
        amount: exp.amount,
        category: exp.category,
        description: exp.description,
      });
      createdExpenses.push(expense);

      // Check budget alert for each category
      const budgetAlert = await checkBudgetAlert(phone, exp.category, userCurrency, lang);
      if (budgetAlert && !budgetAlerts.includes(budgetAlert)) {
        budgetAlerts.push(budgetAlert);
      }
    }

    // Build response
    let response;
    if (createdExpenses.length === 1) {
      const expense = createdExpenses[0];
      response = `${getMessage('expense_logged', lang)} ${formatAmount(expense.amount, userCurrency)} ${getMessage('expense_for', lang)} ${expense.category}`;
      if (expense.description) {
        response += ` (${expense.description})`;
      }
    } else {
      response = getMessage('expense_logged_multi', lang, { count: createdExpenses.length }) + "\n";
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
  }

  // Default: Use AI to respond
  return await agent.processMessage(message);
}

/**
 * Handle budget setting
 */
async function handleSetBudget(phone, message, lang = 'en') {
  // Support both English and Spanish patterns
  const regexEn = /set\s+(\w+)\s+budget\s+(?:to\s+)?(\d+)/i;
  const regexEs = /(?:pon|establecer?)\s+presupuesto\s+(?:de\s+)?(\w+)\s+(?:en\s+)?(\d+)/i;

  let match = message.match(regexEn);
  let category, amount;

  if (match) {
    category = match[1].toLowerCase();
    amount = parseFloat(match[2]);
  } else {
    match = message.match(regexEs);
    if (match) {
      category = match[1].toLowerCase();
      amount = parseFloat(match[2]);
    }
  }

  if (category && amount) {
    const userCurrency = await UserDB.getCurrency(phone);
    const existing = await BudgetDB.getByCategory(phone, category);

    if (existing) {
      await BudgetDB.update(phone, category, amount);
      return getMessage('budget_updated', lang, { category, amount: formatAmount(amount, userCurrency) });
    } else {
      await BudgetDB.create(phone, { category, amount, period: "monthly" });
      return getMessage('budget_set', lang, { category, amount: formatAmount(amount, userCurrency) });
    }
  }

  return getMessage('budget_help', lang);
}

/**
 * Handle setting user currency
 */
async function handleSetCurrency(phone, currencyCode, lang = 'en') {
  // Check if currency is already set
  const existingCurrency = await UserDB.getCurrency(phone);
  if (existingCurrency) {
    return getMessage('currency_already_set', lang, { currency: `${getCurrencyName(existingCurrency)} (${existingCurrency})` });
  }

  // Validate currency code
  if (!isValidCurrency(currencyCode)) {
    return getMessage('currency_invalid', lang, { code: currencyCode });
  }

  // Set the currency
  await UserDB.setCurrency(phone, currencyCode);
  return getMessage('currency_set', lang, { currency: `${getCurrencyName(currencyCode)} (${currencyCode})` });
}

/**
 * Handle renaming a category
 */
async function handleRenameCategory(phone, oldName, newName, lang = 'en') {
  // Check if old category exists in user's expenses or budgets
  const allExpenses = await ExpenseDB.getByUser(phone);
  const allBudgets = await BudgetDB.getByUser(phone);

  const hasExpenses = allExpenses.some(e => e.category === oldName);
  const hasBudget = allBudgets.some(b => b.category === oldName);

  if (!hasExpenses && !hasBudget) {
    return getMessage('category_not_found', lang, { category: oldName });
  }

  // Rename in expenses and budgets
  await ExpenseDB.renameCategory(phone, oldName, newName);
  await BudgetDB.renameCategory(phone, oldName, newName);

  // Update user's custom categories list
  const categories = await getUserCategories(phone, lang);
  const updatedCategories = categories.map(c => c === oldName ? newName : c);
  // Add newName if oldName wasn't in the default list (edge case)
  if (!updatedCategories.includes(newName)) {
    updatedCategories.push(newName);
  }
  await UserDB.setCategories(phone, updatedCategories);

  return getMessage('category_renamed', lang, { old: oldName, new: newName });
}

/**
 * Show user budgets
 */
async function handleShowBudgets(phone, lang = 'en') {
  const budgets = (await BudgetDB.getByUser(phone)) || [];

  if (budgets.length === 0) {
    return getMessage('budget_none', lang);
  }

  const userCurrency = await UserDB.getCurrency(phone);
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const monthName = now.toLocaleString(lang === 'es' ? 'es' : 'en', { month: "long" });
  let response = `${getMessage('budget_title', lang)} (${monthName})\n\n`;

  for (const budget of budgets) {
    const spent = await ExpenseDB.getTotalByCategory(
      phone,
      budget.category,
      startOfMonth,
      endOfMonth,
    );
    const remaining = budget.amount - spent;
    const percentage = ((spent / parseFloat(budget.amount || 0)) * 100).toFixed(0);

    response += `*${budget.category}*\n`;
    response += `${getMessage('budget_label', lang)} ${formatAmount(budget.amount, userCurrency)} | ${getMessage('budget_spent', lang)} ${formatAmount(spent, userCurrency)} (${percentage}%)\n`;
    response += `${getMessage('budget_remaining', lang)} ${formatAmount(remaining, userCurrency)}\n`;
    response += `${getProgressBar(percentage)}\n\n`;
  }

  return response;
}

/**
 * Show spending summary
 */
async function handleSummary(phone, lang = 'en') {
  const userCurrency = await UserDB.getCurrency(phone);
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const expenses = (await ExpenseDB.getByDateRange(phone, startOfMonth, endOfMonth)) || [];
  const categorySummary = (await ExpenseDB.getCategorySummary(
    phone,
    startOfMonth,
    endOfMonth,
  )) || {};
  const budgets = (await BudgetDB.getByUser(phone)) || [];

  const totalSpent = expenses.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
  const totalBudget = budgets.reduce((sum, b) => sum + parseFloat(b.amount || 0), 0);

  const monthName = now.toLocaleString(lang === 'es' ? 'es' : 'en', { month: "long" });
  let response = getMessage('summary_title', lang, { month: monthName }) + "\n\n";
  response += `${getMessage('summary_total_spent', lang)} ${formatAmount(totalSpent, userCurrency)}\n`;

  if (totalBudget > 0) {
    response += `${getMessage('summary_total_budget', lang)} ${formatAmount(totalBudget, userCurrency)}\n`;
    response += `${getMessage('summary_remaining', lang)} ${formatAmount(totalBudget - totalSpent, userCurrency)}\n\n`;
  }

  response += `${getMessage('summary_by_category', lang)}\n`;
  const sortedCategories = Object.entries(categorySummary).sort(
    (a, b) => b[1].total - a[1].total,
  );

  for (const [category, data] of sortedCategories) {
    response += `• ${category}: ${formatAmount(data.total, userCurrency)} (${data.count} ${getMessage('summary_expenses', lang)})\n`;
  }

  return response;
}

/**
 * Show recent expenses
 */
async function handleShowExpenses(phone, lang = 'en') {
  const expenses = (await ExpenseDB.getByUser(phone)).slice(-10).reverse();

  if (expenses.length === 0) {
    return getMessage('expenses_none', lang);
  }

  const userCurrency = await UserDB.getCurrency(phone);
  let response = `${getMessage('expenses_title', lang)}\n\n`;

  for (const expense of expenses) {
    const date = new Date(expense.date).toLocaleDateString(lang === 'es' ? 'es' : 'en');
    response += `• ${formatAmount(expense.amount, userCurrency)} - ${expense.category}`;
    if (expense.description) {
      response += ` (${expense.description})`;
    }
    response += ` - ${date}\n`;
  }

  return response;
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

  const spent = await ExpenseDB.getTotalByCategory(
    phone,
    category,
    startOfMonth,
    endOfMonth,
  );
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

/**
 * Generate progress bar
 */
function getProgressBar(percentage) {
  const filled = Math.min(Math.floor(percentage / 10), 10);
  const empty = 10 - filled;
  return "█".repeat(filled) + "░".repeat(empty);
}

/**
 * Process image message (receipt/bill OCR)
 */
async function processImageMessage(phone, imageData, userCurrency, lang = 'en') {
  try {
    // Check if currency is set
    if (!userCurrency) {
      return getMessage('currency_not_set', lang);
    }

    // Download the image
    const { buffer, mimeType } = await downloadMedia(imageData.id);

    // Process with Claude Vision (pass localized categories)
    const categories = await getUserCategories(phone, lang);
    const result = await processExpenseImage(buffer, mimeType, categories);

    if (!result.detected || result.expenses.length === 0) {
      return getMessage('image_no_expense', lang);
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
    return getMessage('image_error', lang);
  }
}

/**
 * Process audio message (voice note)
 */
async function processAudioMessage(phone, audioData, userCurrency, lang = 'en') {
  try {
    // Check if currency is set
    if (!userCurrency) {
      return getMessage('currency_not_set', lang);
    }

    // Download the audio
    const { buffer, mimeType } = await downloadMedia(audioData.id);

    // Process: transcribe and extract expenses (pass localized categories)
    const categories = await getUserCategories(phone, lang);
    const result = await processExpenseAudio(buffer, mimeType, categories);

    if (result.error) {
      return getMessage('audio_error', lang);
    }

    if (!result.detected || result.expenses.length === 0) {
      if (result.transcription) {
        return `${getMessage('audio_heard', lang)} "${result.transcription}"\n\n${getMessage('audio_no_expense', lang)}`;
      }
      return getMessage('audio_error', lang);
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
    return getMessage('audio_error', lang);
  }
}
