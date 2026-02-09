import axios from "axios";
import dotenv from "dotenv";
import { ExpenseDB, BudgetDB, UserDB } from "../database/index.js";
import { getToolDefinitions, executeTool } from "../tools/index.js";
import { checkLimit, trackUsage, getSubscriptionStatus, getLimitExceededMessage, getUpgradeMessage, USAGE_TYPES } from "../services/subscriptionService.js";
import { getMessage } from "../utils/languageUtils.js";

dotenv.config();

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

/**
 * AI Agent for processing expense-related queries using tool-based routing
 */
export class FinanceAgent {
  constructor(userPhone, userCurrency = null, userLanguage = 'en') {
    this.userPhone = userPhone;
    this.userCurrency = userCurrency;
    this.userLanguage = userLanguage;
  }

  /**
   * Get user's financial context for the AI
   */
  async getFinancialContext() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const expenses = (await ExpenseDB.getByDateRange(
      this.userPhone,
      startOfMonth,
      endOfMonth,
    )) || [];

    const budgets = (await BudgetDB.getByUser(this.userPhone)) || [];

    const categorySummary = (await ExpenseDB.getCategorySummary(
      this.userPhone,
      startOfMonth,
      endOfMonth,
    )) || {};

    const totalSpent = expenses.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
    const totalBudget = budgets.reduce((sum, b) => sum + parseFloat(b.amount || 0), 0);

    return {
      expenses,
      budgets,
      categorySummary,
      totalSpent,
      totalBudget,
      month: now.toLocaleString("default", { month: "long", year: "numeric" }),
    };
  }

  /**
   * Process user message using tool-based routing
   * Claude decides which tool to call based on user intent
   */
  async processMessage(userMessage) {
    const context = await this.getFinancialContext();
    const tools = getToolDefinitions();

    const systemPrompt = `You are FinanceFlow, a helpful AI expense manager via WhatsApp.
You help users track expenses, manage budgets, and understand their spending.

Current user context for ${context.month}:
- Currency: ${this.userCurrency || 'Not set'}
- Total spent: ${context.totalSpent.toFixed(2)}
- Total budget: ${context.totalBudget.toFixed(2)}
- Categories used: ${Object.keys(context.categorySummary).join(', ') || 'None yet'}

Recent expenses: ${context.expenses.slice(-3).map(e => `${e.category}: ${e.amount}`).join(', ') || 'None'}
Active budgets: ${context.budgets.map(b => `${b.category}: ${b.amount}`).join(', ') || 'None'}

IMPORTANT INSTRUCTIONS:
1. Analyze the user's message to determine their intent
2. Use the appropriate tool to fulfill their request
3. For expense logging, extract ALL expenses mentioned (can be multiple)
4. For categories, use: food, transport, shopping, entertainment, bills, health, other
5. Be helpful and concise - this is WhatsApp, keep responses short
6. Respond in the same language as the user's message

When logging expenses:
- Parse amounts as numbers (e.g., "50 dollars" → 50, "mil pesos" → 1000)
- Detect category from context (lunch → food, uber → transport, etc.)
- Include description from the message`;

    try {
      const response = await axios.post(
        ANTHROPIC_API_URL,
        {
          model: "claude-sonnet-4-20250514",
          max_tokens: 1024,
          system: systemPrompt,
          tools: tools,
          messages: [{ role: "user", content: userMessage }],
        },
        {
          headers: {
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          },
        },
      );

      // Process the response
      const content = response.data.content;
      let toolResults = [];
      let textResponse = null;

      for (const block of content) {
        if (block.type === "tool_use") {
          // Execute the tool
          const result = await executeTool(
            block.name,
            this.userPhone,
            block.input,
            this.userLanguage,
            this.userCurrency
          );
          toolResults.push(result);
        } else if (block.type === "text") {
          textResponse = block.text;
        }
      }

      // If tools were called, return their results
      if (toolResults.length > 0) {
        // Filter out null messages (e.g., document sent)
        const messages = toolResults
          .map(r => r.message)
          .filter(m => m !== null);

        if (messages.length > 0) {
          return messages.join("\n\n");
        }
        // If all messages are null (e.g., only documents sent), return nothing
        return null;
      }

      // If no tools were called, check AI limit and return text response
      if (textResponse) {
        // Check AI conversation limit
        const aiLimitCheck = await checkLimit(this.userPhone, USAGE_TYPES.AI_CONVERSATION);
        if (!aiLimitCheck.allowed) {
          const status = await getSubscriptionStatus(this.userPhone);
          const limitMsg = getLimitExceededMessage(USAGE_TYPES.AI_CONVERSATION, this.userLanguage, aiLimitCheck);
          const upgradeMsg = getUpgradeMessage(status.plan.id, this.userLanguage);
          return `${limitMsg}\n\n${upgradeMsg}`;
        }

        // Track AI usage
        await trackUsage(this.userPhone, USAGE_TYPES.AI_CONVERSATION);
        return textResponse;
      }

      return getMessage('error_generic', this.userLanguage);
    } catch (error) {
      console.error(
        "Error calling Anthropic API:",
        error.response?.data || error.message,
      );
      return getMessage('error_generic', this.userLanguage);
    }
  }

  /**
   * Legacy method - kept for backward compatibility
   * @deprecated Use processMessage() which now handles everything
   */
  async detectExpenses(message, categories = null) {
    // This is now handled by the tool-based system
    // Kept for any code that might still call it directly
    const categoryList = categories ? categories.join(', ') : 'food, transport, shopping, entertainment, bills, health, other';
    const systemPrompt = `Extract ALL expense information from user messages. A single message may contain multiple expenses.
Return ONLY a JSON object with: {"detected": boolean, "expenses": [...]}
Each expense in the array should have: amount (number), category (string), description (string).
If no expenses are detected, return: {"detected": false, "expenses": []}

Categories: ${categoryList}

Examples:
"Spent 45 on groceries" → {"detected": true, "expenses": [{"amount": 45, "category": "food", "description": "groceries"}]}
"Lunch was 15 dollars" → {"detected": true, "expenses": [{"amount": 15, "category": "food", "description": "lunch"}]}
"Uber 12, coffee 5" → {"detected": true, "expenses": [{"amount": 12, "category": "transport", "description": "Uber"}, {"amount": 5, "category": "food", "description": "coffee"}]}
"How am I doing?" → {"detected": false, "expenses": []}`;

    try {
      const response = await axios.post(
        ANTHROPIC_API_URL,
        {
          model: "claude-sonnet-4-20250514",
          max_tokens: 500,
          messages: [{ role: "user", content: message }],
          system: systemPrompt,
        },
        {
          headers: {
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          },
        },
      );

      const result = response.data.content[0].text;
      const cleaned = result
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();
      return JSON.parse(cleaned);
    } catch (error) {
      console.error(
        "Error detecting expenses:",
        error.response?.data || error.message,
      );
      return { detected: false, expenses: [] };
    }
  }
}
