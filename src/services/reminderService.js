/**
 * Reminder Service
 * Sends scheduled reminders to users to log their expenses
 * Uses user's local timezone based on phone country code
 */

import cron from "node-cron";
import { UserDB, ExpenseDB } from "../database/index.js";
import { sendInteractiveButtons, sendTextMessage } from "../utils/whatsappClient.js";
import { getMessage } from "../utils/languageUtils.js";
import { getUserLocalHour, getTimezoneFromPhone, getUserLocalDay } from "../utils/timezoneUtils.js";
import { generateStatsUrl, getTokenExpiryDescription } from "./statsTokenService.js";
import { formatAmount } from "../utils/currencyUtils.js";

// Track reminder state per user (to handle Yes responses)
const pendingReminders = new Map();

/**
 * Send expense reminder to a single user
 * @param {string} phone - User's phone number
 * @param {string} reminderType - 'afternoon' or 'evening'
 */
export async function sendExpenseReminder(phone, reminderType = null) {
  try {
    // Get user's language
    const userLang = await UserDB.getLanguage(phone) || 'en';

    // Get user's local hour based on their phone country code
    const userHour = getUserLocalHour(phone);

    // Determine the correct greeting based on user's LOCAL time
    let messageKey;
    if (reminderType) {
      // Use specified type
      messageKey = reminderType === 'afternoon' ? 'reminder_afternoon' : 'reminder_evening';
    } else {
      // Auto-detect based on user's local time
      if (userHour >= 5 && userHour < 14) {
        messageKey = 'reminder_afternoon'; // "Good afternoon" for late morning/early afternoon
      } else {
        messageKey = 'reminder_evening'; // "Good evening" for afternoon/night
      }
    }

    const message = getMessage(messageKey, userLang);

    await sendInteractiveButtons(phone, message, [
      { id: "reminder_yes", title: getMessage('reminder_btn_yes', userLang) },
      { id: "reminder_no", title: getMessage('reminder_btn_no', userLang) },
    ]);

    // Mark that this user has a pending reminder
    pendingReminders.set(phone, {
      timestamp: Date.now(),
      type: "expense_check",
    });

    const timezone = getTimezoneFromPhone(phone);
    console.log(`📬 Sent ${messageKey} reminder to ${phone} (${userLang}, ${timezone}, local hour: ${userHour})`);
    return true;
  } catch (error) {
    console.error(`Error sending reminder to ${phone}:`, error.message);
    return false;
  }
}

/**
 * Send reminders to users whose local time matches the target hour
 * @param {number} targetHour - The hour in user's local time to send reminders (e.g., 12 for noon)
 * @param {string} reminderType - 'afternoon' or 'evening'
 */
export async function sendRemindersForLocalHour(targetHour, reminderType) {
  try {
    const users = await UserDB.all();

    if (!users || users.length === 0) {
      console.log("📭 No users to remind");
      return { sent: 0, skipped: 0, failed: 0 };
    }

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const user of users) {
      // Check if user's local hour matches the target
      const userHour = getUserLocalHour(user.phone);

      // Allow a 1-hour window (e.g., if target is 12, allow 12-13)
      if (userHour >= targetHour && userHour < targetHour + 1) {
        const success = await sendExpenseReminder(user.phone, reminderType);
        if (success) {
          sent++;
        } else {
          failed++;
        }
        // Small delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 100));
      } else {
        skipped++;
      }
    }

    console.log(`📬 Reminder job (target ${targetHour}:00 local): ${sent} sent, ${skipped} skipped (wrong hour), ${failed} failed`);
    return { sent, skipped, failed };
  } catch (error) {
    console.error("Error sending reminders:", error);
    return { sent: 0, skipped: 0, failed: 0, error: error.message };
  }
}

/**
 * Send reminders to all active users (legacy function for manual triggers)
 */
export async function sendRemindersToAllUsers() {
  try {
    const users = await UserDB.all();

    if (!users || users.length === 0) {
      console.log("📭 No users to remind");
      return { sent: 0, failed: 0 };
    }

    let sent = 0;
    let failed = 0;

    for (const user of users) {
      const success = await sendExpenseReminder(user.phone);
      if (success) {
        sent++;
      } else {
        failed++;
      }

      // Small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    console.log(`📬 Reminders sent: ${sent} success, ${failed} failed`);
    return { sent, failed };
  } catch (error) {
    console.error("Error sending reminders:", error);
    return { sent: 0, failed: 0, error: error.message };
  }
}

/**
 * Check if user has a pending reminder
 */
export function hasPendingReminder(phone) {
  const reminder = pendingReminders.get(phone);
  if (!reminder) return false;

  // Expire reminders after 1 hour
  if (Date.now() - reminder.timestamp > 60 * 60 * 1000) {
    pendingReminders.delete(phone);
    return false;
  }

  return true;
}

/**
 * Clear pending reminder for user
 */
export function clearPendingReminder(phone) {
  pendingReminders.delete(phone);
}

/**
 * Send weekly summary with stats link to a single user
 * @param {string} phone - User's phone number
 */
export async function sendWeeklySummary(phone) {
  try {
    const userLang = await UserDB.getLanguage(phone) || 'es';
    const user = await UserDB.get(phone);
    const userCurrency = user?.currency || 'COP';

    // Calculate last week's date range
    const now = new Date();
    const endOfWeek = new Date(now);
    endOfWeek.setHours(23, 59, 59, 999);
    const startOfWeek = new Date(now);
    startOfWeek.setDate(startOfWeek.getDate() - 7);
    startOfWeek.setHours(0, 0, 0, 0);

    // Get expenses from last week
    const expenses = (await ExpenseDB.getByDateRange(phone, startOfWeek, endOfWeek)) || [];
    const totalSpent = expenses.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);

    // Generate stats URL
    const statsUrl = generateStatsUrl(phone);
    const expiryTime = getTokenExpiryDescription();

    const messages = {
      en: `📊 *Your Weekly Summary*

This week you spent ${formatAmount(totalSpent, userCurrency)} in ${expenses.length} expenses.

See your complete report with charts and category breakdown:

${statsUrl}

This link is valid for ${expiryTime}.`,
      es: `📊 *Tu Resumen Semanal*

Esta semana gastaste ${formatAmount(totalSpent, userCurrency)} en ${expenses.length} gastos.

Ve tu reporte completo con gráficos y desglose por categoría:

${statsUrl}

Este link es válido por ${expiryTime}.`,
      pt: `📊 *Seu Resumo Semanal*

Esta semana você gastou ${formatAmount(totalSpent, userCurrency)} em ${expenses.length} despesas.

Veja seu relatório completo com gráficos e detalhamento por categoria:

${statsUrl}

Este link é válido por ${expiryTime}.`
    };

    await sendTextMessage(phone, messages[userLang] || messages.es);
    console.log(`📊 Sent weekly summary to ${phone}`);
    return true;
  } catch (error) {
    console.error(`Error sending weekly summary to ${phone}:`, error.message);
    return false;
  }
}

/**
 * Send weekly summaries to users whose local time is Sunday evening
 */
export async function sendWeeklySummaries() {
  try {
    const users = await UserDB.all();

    if (!users || users.length === 0) {
      console.log("📭 No users for weekly summary");
      return { sent: 0, skipped: 0, failed: 0 };
    }

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const user of users) {
      // Check if user's local day is Sunday and hour is around 7 PM
      const userDay = getUserLocalDay(user.phone);
      const userHour = getUserLocalHour(user.phone);

      // Sunday = 0, send around 7 PM (19:00)
      if (userDay === 0 && userHour >= 19 && userHour < 20) {
        const success = await sendWeeklySummary(user.phone);
        if (success) {
          sent++;
        } else {
          failed++;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      } else {
        skipped++;
      }
    }

    console.log(`📊 Weekly summary job: ${sent} sent, ${skipped} skipped (wrong day/hour), ${failed} failed`);
    return { sent, skipped, failed };
  } catch (error) {
    console.error("Error sending weekly summaries:", error);
    return { sent: 0, skipped: 0, failed: 0, error: error.message };
  }
}

/**
 * Start the cron scheduler for reminders
 * Runs every hour and sends reminders to users whose local time matches:
 * - 12:00 PM (noon) - afternoon reminder
 * - 9:00 PM - evening reminder
 * - Sunday 7:00 PM - weekly summary
 */
export function startReminderScheduler() {
  // Run every hour at minute 0 to check all timezones
  cron.schedule("0 * * * *", async () => {
    const serverHour = new Date().getUTCHours();
    console.log(`⏰ Running hourly reminder check (UTC hour: ${serverHour})...`);

    // Send afternoon reminders (noon local time)
    await sendRemindersForLocalHour(12, 'afternoon');

    // Send evening reminders (9 PM local time)
    await sendRemindersForLocalHour(21, 'evening');

    // Send weekly summaries (Sunday 7 PM local time)
    await sendWeeklySummaries();
  });

  console.log("⏰ Reminder scheduler started (checks every hour for local 12 PM, 9 PM, and Sunday 7 PM weekly summary)");
}
