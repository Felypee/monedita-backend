/**
 * Onboarding Service - Manages guided tutorial flow for new users
 *
 * Tutorial is a step-by-step guided tour where users learn by doing.
 * Each step focuses on ONE action with minimal text.
 */

import { TutorialDB } from "../database/index.js";
import { getMessage } from "../utils/languageUtils.js";

// Tutorial steps configuration - designed as a guided tour
const TUTORIAL_STEPS = {
  1: 'welcome',           // Quick greeting
  2: 'try_expense',       // Prompt to log first expense
  3: 'expense_logged',    // Celebrate + intro to summaries
  4: 'try_summary',       // Prompt to check status
  5: 'summary_shown',     // Intro to budgets
  6: 'try_budget',        // Prompt to set a budget
  7: 'complete',          // All done!
};

const TOTAL_STEPS = 7;

// Steps that wait for user action (not just "next")
const ACTION_STEPS = {
  2: 'expense',   // Waiting for expense
  4: 'summary',   // Waiting for summary command
  6: 'budget',    // Waiting for budget command
};

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

  // Handle based on current step
  switch (currentStep) {
    case 1: // Welcome - waiting for any response to continue
      return await advanceTutorial(phone, lang);

    case 2: // Waiting for user to log an expense
      if (hasExpensePattern(message)) {
        // Let the expense be processed, then advance
        return { advance: true, processExpense: true, nextStep: 3 };
      }
      // Remind them to try logging an expense
      return getMessage('tutorial_try_expense_hint', lang);

    case 3: // After expense logged - waiting for "next" or any response
      return await advanceTutorial(phone, lang);

    case 4: // Waiting for user to check summary
      if (isSummaryCommand(lowerMsg)) {
        // Let the summary be processed, then advance
        return { advance: true, processSummary: true, nextStep: 5 };
      }
      return getMessage('tutorial_try_summary_hint', lang);

    case 5: // After summary shown - waiting for "next" or any response
      return await advanceTutorial(phone, lang);

    case 6: // Waiting for user to set a budget
      if (isBudgetCommand(lowerMsg, message)) {
        // Let the budget be processed, then advance
        return { advance: true, processBudget: true, nextStep: 7 };
      }
      return getMessage('tutorial_try_budget_hint', lang);

    case 7: // Complete - should not reach here
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

  // Step 7 is completion - delete tutorial data after showing message
  if (nextStep === TOTAL_STEPS) {
    const completeMsg = getTutorialStep(nextStep, lang);
    await completeTutorial(phone);
    return completeMsg;
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
