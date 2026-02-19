import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { handleIncomingMessage } from './handlers/messageHandler.js';
import { verifyWebhook } from './utils/webhookVerification.js';
import {
  startReminderScheduler,
  sendRemindersToAllUsers,
  sendExpenseReminder,
} from './services/reminderService.js';
import { handleWompiWebhook } from './handlers/wompiWebhookHandler.js';
import { getUsageStats } from './utils/usageMonitor.js';
import statsRoutes from './routes/statsRoutes.js';

dotenv.config();

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy for accurate IP detection (required for Vercel, Railway, etc.)
app.set('trust proxy', 1);

// CORS configuration for stats page
app.use(cors({
  origin: ['https://monedita.app', 'http://localhost:3000', 'http://localhost:5500'],
  methods: ['GET', 'POST'],
  credentials: true
}));

app.use(bodyParser.json());

// Serve static files (stickers, etc.)
app.use(express.static(path.join(__dirname, '../public')));

// ======================
// RATE LIMITING (DDoS Protection)
// ======================

// Global rate limit: 100 requests per minute per IP
const globalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(globalLimiter);

// Strict limit for WhatsApp webhook: 30 messages per minute per IP
// This prevents API cost explosion from DDoS
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  message: { error: 'Rate limit exceeded' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, ip: false },
  keyGenerator: (req) => {
    // Use phone number if available, otherwise IP
    const phone = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from;
    return phone || req.ip;
  },
});

// Wompi webhook limit: 10 per minute (payments shouldn't be that frequent)
const wompiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Rate limit exceeded' },
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Monedita server is running' });
});

// Stats API routes (JWT protected)
app.use(statsRoutes);

// Usage stats endpoint (protected)
app.get('/api/usage', (req, res) => {
  // Protect with same reminder secret
  if (REMINDER_SECRET) {
    const token = req.headers['x-reminder-secret'] || req.query.secret;
    if (token !== REMINDER_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }
  res.json(getUsageStats());
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

// Wompi payment webhook (with rate limiting)
app.post('/webhook/wompi', wompiLimiter, async (req, res) => {
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

// Webhook endpoint to receive messages (with rate limiting)
app.post('/webhook', webhookLimiter, async (req, res) => {
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
