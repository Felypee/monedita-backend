/**
 * Reminder Service
 * Sends scheduled reminders to users to log their expenses
 * Uses user's local timezone based on phone country code
 */

import cron from "node-cron";
import { UserDB } from "../database/index.js";
import { sendInteractiveButtons } from "../utils/whatsappClient.js";
import { getMessage } from "../utils/languageUtils.js";
import { getUserLocalHour, getTimezoneFromPhone } from "../utils/timezoneUtils.js";

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
 * Start the cron scheduler for reminders
 * Runs every hour and sends reminders to users whose local time matches:
 * - 12:00 PM (noon) - afternoon reminder
 * - 9:00 PM - evening reminder
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
  });

  console.log("⏰ Reminder scheduler started (checks every hour for local 12 PM and 9 PM)");
}
