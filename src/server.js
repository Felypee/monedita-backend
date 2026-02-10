import express from 'express';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import { handleIncomingMessage } from './handlers/messageHandler.js';
import { verifyWebhook } from './utils/webhookVerification.js';
import {
  startReminderScheduler,
  sendRemindersToAllUsers,
  sendExpenseReminder,
} from './services/reminderService.js';
import { handleWompiWebhook } from './handlers/wompiWebhookHandler.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Monedita server is running' });
});

// Reminder endpoint - can be triggered by external cron services (e.g., cron-job.org)
// Optional: Add a secret token for security
const REMINDER_SECRET = process.env.REMINDER_SECRET;

app.post('/api/reminders/send', async (req, res) => {
  // Verify secret if configured
  if (REMINDER_SECRET) {
    const token = req.headers['x-reminder-secret'] || req.query.secret;
    if (token !== REMINDER_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  try {
    const result = await sendRemindersToAllUsers();
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Send reminder to a specific user
app.post('/api/reminders/send/:phone', async (req, res) => {
  if (REMINDER_SECRET) {
    const token = req.headers['x-reminder-secret'] || req.query.secret;
    if (token !== REMINDER_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  try {
    const success = await sendExpenseReminder(req.params.phone);
    res.json({ success });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Wompi payment webhook
app.post('/webhook/wompi', async (req, res) => {
  try {
    const signature = req.headers['x-event-checksum'];
    const timestamp = req.headers['x-event-timestamp'];

    await handleWompiWebhook(req.body, signature, timestamp);

    res.sendStatus(200);
  } catch (error) {
    console.error('[wompi webhook] Error:', error);
    res.sendStatus(500);
  }
});

// Webhook verification endpoint (required by WhatsApp)
app.get('/webhook', verifyWebhook);

// Webhook endpoint to receive messages
app.post('/webhook', async (req, res) => {
  try {
    const body = req.body;

    // Check if it's a WhatsApp message
    if (body.object === 'whatsapp_business_account') {
      if (body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
        const message = body.entry[0].changes[0].value.messages[0];
        const phone = message.from;
        
        // Handle the message asynchronously
        handleIncomingMessage(message, phone).catch(err => {
          console.error('Error handling message:', err);
        });
      }

      // Acknowledge receipt immediately
      res.sendStatus(200);
    } else {
      res.sendStatus(404);
    }
  } catch (error) {
    console.error('Webhook error:', error);
    res.sendStatus(500);
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Monedita server running on port ${PORT}`);
  console.log(`📱 Webhook endpoint: http://localhost:${PORT}/webhook`);
  console.log(`💡 Make sure to configure your WhatsApp Business API webhook to point here`);

  // Start the reminder scheduler
  startReminderScheduler();
});
