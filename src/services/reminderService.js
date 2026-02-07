/**
 * Reminder Service
 * Sends scheduled reminders to users to log their expenses
 */

import cron from "node-cron";
import { UserDB } from "../database/index.js";
import { sendInteractiveButtons } from "../utils/whatsappClient.js";
import { getMessage } from "../utils/languageUtils.js";

// Track reminder state per user (to handle Yes responses)
const pendingReminders = new Map();

/**
 * Send expense reminder to a single user
 */
export async function sendExpenseReminder(phone) {
  try {
    // Get user's language
    const userLang = await UserDB.getLanguage(phone) || 'en';

    const now = new Date();
    const hour = now.getHours();

    // Select appropriate greeting based on time
    const messageKey = hour < 14 ? 'reminder_afternoon' : 'reminder_evening';
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

    console.log(`📬 Sent reminder to ${phone} (${userLang})`);
    return true;
  } catch (error) {
    console.error(`Error sending reminder to ${phone}:`, error.message);
    return false;
  }
}

/**
 * Send reminders to all active users
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
 * - 12:00 PM (noon)
 * - 9:00 PM
 */
export function startReminderScheduler() {
  // Reminder at 12:00 PM (noon)
  cron.schedule("0 12 * * *", async () => {
    console.log("⏰ Running 12 PM reminder job...");
    await sendRemindersToAllUsers();
  });

  // Reminder at 9:00 PM
  cron.schedule("0 21 * * *", async () => {
    console.log("⏰ Running 9 PM reminder job...");
    await sendRemindersToAllUsers();
  });

  console.log("⏰ Reminder scheduler started (12 PM and 9 PM daily)");
}
