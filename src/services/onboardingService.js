/**
 * Onboarding Service - Manages guided tutorial flow for new users
 *
 * Tutorial is a step-by-step guided tour where users learn by doing.
 * Each step focuses on ONE action with minimal text.
 *
 * SANDBOX MODE: During tutorial, all actions (expenses, budgets) are
 * simulated and NOT saved to real database tables. This lets users
 * practice without affecting their real data.
 */

import { TutorialDB } from "../database/index.js";
import { getMessage } from "../utils/languageUtils.js";
import { formatAmount } from "../utils/currencyUtils.js";

// Tutorial steps - simplified flow, auto-advance after each action
const TUTORIAL_STEPS = {
  1: 'welcome',           // Quick greeting → user replies → step 2
  2: 'try_expense',       // User logs expense → auto-advance to step 3
  3: 'try_summary',       // User checks status (shows their expense) → step 4
  4: 'try_media',         // Mention photos/audio → step 5
  5: 'try_budget',        // User sets budget → auto-advance to complete
  6: 'complete',          // Done!
};

const TOTAL_STEPS = 6;

// Temporary storage for tutorial expenses (in-memory, per user)
const tutorialExpenses = new Map();

/**
 * Check if user is in tutorial mode
 */
export async function isInTutorial(phone) {
  const tutorial = await TutorialDB.get(phone);
  return !!tutorial;
}

/**
 * Start tutorial for a user
 */
export async function startTutorial(phone, lang = 'en') {
  // Check if already in tutorial
  const existing = await TutorialDB.get(phone);
  if (existing) {
    // Reset to step 1
    await TutorialDB.updateStep(phone, 1);
  } else {
    await TutorialDB.create(phone, 1);
  }

  return getTutorialStep(1, lang);
}

/**
 * Get current tutorial step message
 */
export function getTutorialStep(step, lang = 'en') {
  const stepKey = TUTORIAL_STEPS[step];
  if (!stepKey) return null;

  return getMessage(`tutorial_${stepKey}`, lang);
}

/**
 * Process tutorial response and advance to next step
 * Returns either a message string OR an action object for special handling
 */
export async function processTutorialResponse(phone, message, lang = 'en') {
  const tutorial = await TutorialDB.get(phone);
  if (!tutorial) return null;

  const currentStep = tutorial.currentStep;
  const lowerMsg = message.toLowerCase().trim();

  // Check for skip command at any step
  if (lowerMsg === 'skip' || lowerMsg === 'saltar' || lowerMsg === 'pular') {
    await completeTutorial(phone);
    return getMessage('tutorial_skipped', lang);
  }

  // Check for continue command (force advance if stuck)
  const continueCommands = ['continue', 'continuar', 'next', 'siguiente', 'próximo', 'proximo'];
  if (continueCommands.includes(lowerMsg)) {
    return await advanceTutorial(phone, lang);
  }

  // Handle based on current step
  switch (currentStep) {
    case 1: // Welcome - any response advances to step 2
      return await advanceTutorial(phone, lang);

    case 2: // Waiting for expense
      if (hasExpensePattern(message)) {
        return { advance: true, processExpense: true, nextStep: 3 };
      }
      return getMessage('tutorial_try_expense_hint', lang);

    case 3: // Waiting for summary command
      if (isSummaryCommand(lowerMsg)) {
        return { advance: true, processSummary: true, nextStep: 4 };
      }
      return getMessage('tutorial_try_summary_hint', lang);

    case 4: // Media tip - any response advances to step 5
      return await advanceTutorial(phone, lang);

    case 5: // Waiting for budget command
      if (isBudgetCommand(lowerMsg, message)) {
        return { advance: true, processBudget: true, nextStep: 6 };
      }
      return getMessage('tutorial_try_budget_hint', lang);

    case 6: // Complete - should not reach here
      await completeTutorial(phone);
      return null;

    default:
      return await advanceTutorial(phone, lang);
  }
}

/**
 * Check if message is a summary/status command
 */
function isSummaryCommand(lowerMsg) {
  const summaryPatterns = [
    'summary', 'how am i doing', 'status', 'how am i',
    'resumen', 'cómo voy', 'como voy', 'estado',
    'resumo', 'como estou'
  ];
  return summaryPatterns.some(p => lowerMsg.includes(p));
}

/**
 * Check if message is a budget command
 */
function isBudgetCommand(lowerMsg, originalMsg) {
  const budgetPatterns = [
    /set\s+\w+\s+budget/i,
    /budget\s+\d+/i,
    /presupuesto/i,
    /orçamento/i
  ];
  return budgetPatterns.some(p => p.test(originalMsg));
}

/**
 * Advance to next tutorial step
 */
export async function advanceTutorial(phone, lang = 'en') {
  const tutorial = await TutorialDB.get(phone);
  if (!tutorial) return null;

  const nextStep = tutorial.currentStep + 1;

  if (nextStep > TOTAL_STEPS) {
    await completeTutorial(phone);
    return getMessage('tutorial_complete', lang);
  }

  await TutorialDB.updateStep(phone, nextStep);

  // Step 5 is completion - delete tutorial data after showing message
  if (nextStep === TOTAL_STEPS) {
    await completeTutorial(phone);
    return getMessage('tutorial_complete', lang);
  }

  return getTutorialStep(nextStep, lang);
}

/**
 * Advance tutorial to a specific step (used after action steps)
 */
export async function advanceToStep(phone, step, lang = 'en') {
  const tutorial = await TutorialDB.get(phone);
  if (!tutorial) return null;

  if (step > TOTAL_STEPS) {
    await completeTutorial(phone);
    return getMessage('tutorial_complete', lang);
  }

  await TutorialDB.updateStep(phone, step);

  if (step === TOTAL_STEPS) {
    const completeMsg = getTutorialStep(step, lang);
    await completeTutorial(phone);
    return completeMsg;
  }

  return getTutorialStep(step, lang);
}

/**
 * Complete and clean up tutorial
 */
export async function completeTutorial(phone) {
  await TutorialDB.delete(phone);
  // Clean up temporary tutorial data
  tutorialExpenses.delete(phone);
}

/**
 * Get tutorial progress
 */
export async function getTutorialProgress(phone) {
  const tutorial = await TutorialDB.get(phone);
  if (!tutorial) return null;

  return {
    currentStep: tutorial.currentStep,
    totalSteps: TOTAL_STEPS,
    stepName: TUTORIAL_STEPS[tutorial.currentStep],
  };
}

/**
 * Check if message looks like an expense
 */
function hasExpensePattern(message) {
  const expensePatterns = [
    /\d+/,  // Contains a number
    /spent|gast[eéo]|compré|bought/i,
  ];

  return expensePatterns.some(pattern => pattern.test(message));
}

// ============================================
// SANDBOX MODE - Simulated actions for tutorial
// These don't save to real database tables
// ============================================

/**
 * Simulate expense logging during tutorial (no real DB save)
 * Stores the expense temporarily for use in summary
 */
export function simulateExpenseResponse(phone, message, currency, lang = 'en') {
  // Extract amount from message
  const amountMatch = message.match(/(\d+(?:[.,]\d+)?)/);
  const amount = amountMatch ? parseFloat(amountMatch[1].replace(',', '.')) : 25;

  // Try to detect category
  const categoryPatterns = {
    food: /food|comida|almuerzo|lunch|dinner|cena|breakfast|desayuno|coffee|café|cafe|restaurant|mercado|groceries/i,
    transport: /transport|uber|taxi|bus|gas|gasolina|transporte/i,
    shopping: /shopping|compras|clothes|ropa|amazon/i,
    entertainment: /entertainment|movie|película|netflix|spotify|entretenimiento/i,
    bills: /bills|bill|luz|agua|internet|telefono|phone|facturas/i,
    health: /health|doctor|medicina|pharmacy|farmacia|salud/i,
  };

  let category = 'other';
  for (const [cat, pattern] of Object.entries(categoryPatterns)) {
    if (pattern.test(message)) {
      category = cat;
      break;
    }
  }

  // Store expense for summary step
  tutorialExpenses.set(phone, { amount, category, currency });

  // Return simulated success message
  const formattedAmount = formatAmount(amount, currency);
  return `${getMessage('expense_logged', lang)} ${formattedAmount} ${getMessage('expense_for', lang)} ${category}`;
}

/**
 * Simulate summary during tutorial - uses the expense they just logged
 */
export function simulateSummaryResponse(phone, currency, lang = 'en') {
  const now = new Date();
  const monthName = now.toLocaleString(lang === 'es' ? 'es-ES' : lang === 'pt' ? 'pt-BR' : 'en-US', { month: 'long' });

  // Get the expense they logged in step 2
  const tutorialExpense = tutorialExpenses.get(phone);

  let totalSpent = 0;
  let categories = [];

  if (tutorialExpense) {
    totalSpent = tutorialExpense.amount;
    categories = [{ name: tutorialExpense.category, total: tutorialExpense.amount, count: 1 }];
  } else {
    // Fallback if no expense stored
    totalSpent = 25;
    categories = [{ name: 'other', total: 25, count: 1 }];
  }

  let response = getMessage('summary_title', lang, { month: monthName }) + '\n\n';
  response += `${getMessage('summary_total_spent', lang)} ${formatAmount(totalSpent, currency)}\n\n`;
  response += `${getMessage('summary_by_category', lang)}\n`;

  for (const cat of categories) {
    response += `• ${cat.name}: ${formatAmount(cat.total, currency)} (${cat.count} ${getMessage('summary_expenses', lang)})\n`;
  }

  return response;
}

/**
 * Simulate budget setting during tutorial (no real DB save)
 */
export function simulateBudgetResponse(message, currency, lang = 'en') {
  // Extract category and amount
  const amountMatch = message.match(/(\d+(?:[.,]\d+)?)/);
  const amount = amountMatch ? parseFloat(amountMatch[1].replace(',', '.')) : 500;

  // Try to extract category name
  let category = 'food'; // default
  const categoryMatch = message.match(/(?:set|pon|defina)\s+(\w+)\s+(?:budget|presupuesto|orçamento)/i) ||
                        message.match(/(?:budget|presupuesto|orçamento)\s+(?:de\s+)?(\w+)/i);
  if (categoryMatch) {
    category = categoryMatch[1].toLowerCase();
  }

  return getMessage('budget_set', lang, {
    category,
    amount: formatAmount(amount, currency)
  });
}
