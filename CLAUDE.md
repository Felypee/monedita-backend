# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Monedita is a WhatsApp-based AI expense manager that uses Claude for natural language expense tracking and financial insights. Users interact via WhatsApp to log expenses, set budgets, and get spending summaries.

## Commands

```bash
# Install dependencies
npm install

# Start main Express server (port 3000)
npm start

# Start with file watching (development)
npm run dev

# Start MCP analytics server (separate process)
npm run mcp-server

# MCP server has separate dependencies
cd mcp-servers/expense-analytics && npm install
```

## Architecture

### Request Flow
1. WhatsApp message → Meta webhook → Express `/webhook` endpoint
2. `messageHandler.js` handles media (images/audio) and user onboarding (name collection)
3. Text messages → `FinanceAgent` uses Claude's tool_use to intelligently route to appropriate tool
4. Tool executes and returns response → sent back via WhatsApp Business API

### Tool-Based Architecture

The agent uses Claude's `tool_use` feature to intelligently route user messages. Each tool is a self-contained module in `src/tools/`:

```
src/tools/
├── index.js              # Tool registry + executor
├── logExpense.js         # Log expenses (amount, category, description)
├── editExpense.js        # Edit existing expense (by ID, description, or last)
├── deleteExpense.js      # Delete expense (by ID, description, or last)
├── setBudget.js          # Create/update budgets
├── deleteBudget.js       # Delete a budget
├── showSummary.js        # Monthly spending summary
├── showBudgets.js        # List budgets with progress
├── showExpenses.js       # Recent transactions
├── exportExpenses.js     # Export to CSV
├── renameCategory.js     # Rename categories
├── setCurrency.js        # Set user currency
├── subscriptionStatus.js # Show plan & usage
├── upgradeInfo.js        # Upgrade options + payment links
└── helpInfo.js           # Welcome/help message
```

Each tool exports:
- `definition` - Tool name, description, and JSON schema for Claude
- `handler(phone, params, lang, currency)` - Execution function

### Key Components

- **src/server.js**: Express entry point with `/webhook` (POST for messages, GET for verification) and `/health` endpoints
- **src/handlers/messageHandler.js**: Handles message types (text → agent, image → OCR, audio → transcription), user onboarding (name collection), and media processing
- **src/agents/financeAgent.js**: Uses Claude's tool_use to analyze user intent and call appropriate tools. Provides financial context to Claude.
- **src/tools/index.js**: Tool registry with `getToolDefinitions()` and `executeTool()` functions
- **src/services/subscriptionService.js**: Subscription tiers (Free/Basic/Premium), moneditas (tokens) system, and usage tracking
- **src/utils/currencyUtils.js**: Currency detection from phone country codes, amount validation, and formatting
- **src/utils/mediaProcessor.js**: Image OCR (Claude Vision) and audio transcription (Whisper) for expense extraction
- **src/services/reminderService.js**: Scheduled reminders at 12 PM and 9 PM using node-cron
- **src/database/index.js**: DB selector using `DB_DRIVER` env var (`inmemory` or `supabase`)
- **src/database/inMemoryDB.js**: In-memory storage with UserDB, ExpenseDB, BudgetDB classes
- **src/database/supabaseDB.js**: Supabase implementation (same interface as inMemoryDB)
- **src/database/subscriptionDB.*.js**: Subscription plans, user subscriptions, and usage tracking
- **src/utils/whatsappClient.js**: WhatsApp API wrapper for sending messages
- **src/services/wompiService.js**: Wompi payment gateway integration for subscription upgrades
- **src/handlers/wompiWebhookHandler.js**: Processes Wompi payment webhooks and updates user subscriptions

### Payment Flow (Wompi)
1. User types "upgrade" or "quiero premium" → `upgrade_info` tool shows plans
2. User selects plan → Wompi payment link is generated and sent via WhatsApp
3. User clicks link → pays on Wompi checkout page
4. Wompi sends webhook to `/webhook/wompi` → plan is upgraded
5. User receives confirmation message via WhatsApp

### MCP Server (mcp-servers/expense-analytics/)
Standalone MCP server providing analytics tools: `analyze_spending_trends`, `predict_budget_overrun`, `get_category_insights`, `compare_to_average`. Currently returns simulated data.

## Adding New Tools

1. Create `src/tools/yourTool.js`:
```javascript
export const definition = {
  name: "your_tool",
  description: "When to use this tool...",
  input_schema: {
    type: "object",
    properties: { /* params */ },
    required: []
  }
};

export async function handler(phone, params, lang, userCurrency) {
  // Implementation
  return { success: true, message: "Response to user" };
}

export default { definition, handler };
```

2. Register in `src/tools/index.js`:
```javascript
import yourTool from "./yourTool.js";
const tools = { ..., your_tool: yourTool };
```

## Environment Variables

Required in `.env`:
- `WHATSAPP_TOKEN` - WhatsApp Business API access token
- `WHATSAPP_VERIFY_TOKEN` - Custom string for webhook verification
- `WHATSAPP_PHONE_NUMBER_ID` - Phone number ID from Meta
- `ANTHROPIC_API_KEY` - For Claude API calls
- `PORT` - Server port (default 3000)

For Supabase:
- `DB_DRIVER=supabase`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

For voice messages (at least one required):
- `GROQ_API_KEY` - Groq Whisper API (free tier available, preferred)
- `OPENAI_API_KEY` - OpenAI Whisper API ($0.006/min fallback)

For reminders (optional):
- `REMINDER_SECRET` - Secret token to protect the /api/reminders endpoint

For payments (Wompi):
- `WOMPI_PUBLIC_KEY` - Wompi public key (starts with pub_)
- `WOMPI_PRIVATE_KEY` - Wompi private key (starts with prv_)
- `WOMPI_EVENTS_SECRET` - Wompi events secret for webhook verification
- `WOMPI_INTEGRITY_SECRET` - Wompi integrity secret for checkout widget
- `WOMPI_ENV` - "sandbox" or "production" (default: sandbox)
- `WHATSAPP_BOT_NUMBER` - WhatsApp number for redirect after payment (e.g., 573001234567)
- `WOMPI_REDIRECT_URL` - Optional custom redirect URL (default: WhatsApp link with bot number)

## Code Patterns

- ES modules (`"type": "module"` in package.json)
- Async/await throughout
- Database operations return promises and handle null gracefully
- Expense categories: `food`, `transport`, `shopping`, `entertainment`, `bills`, `health`, `other`
- Claude model: `claude-sonnet-4-20250514`
- Tool handlers return `{ success: boolean, message: string|null }`
- Moneditas system: each operation consumes tokens (1 for text, 2 for audio, 3 for images)

## Subscription Tiers (Moneditas System)

The app uses a token-based system called "moneditas" instead of separate limits per feature.

| Feature | Free | Basic ($5.99) | Premium ($12.99) |
|---------|------|---------------|------------------|
| Moneditas/month | 100 | 1,200 | 3,500 |
| Budgets | Unlimited | Unlimited | Unlimited |
| Weekly Summary | Yes | Yes | Yes |
| Visual Report Page | Yes | Yes | Yes |
| History | 30 days | 6 months | 12 months |

### Moneditas Consumption

| Action | Cost |
|--------|------|
| Log expense (text) | 5 moneditas |
| Process receipt (image) | 6 moneditas |
| Process audio | 4 moneditas |
| Weekly summary | 5 moneditas |
| Reminder message | 1 monedita |

See `docs/COST_ANALYSIS.md` for detailed pricing analysis and profitability calculations.
