import axios from "axios";
import dotenv from "dotenv";
import { ExpenseDB, BudgetDB, UserDB } from "../database/index.js";
import { getToolDefinitions, executeTool } from "../tools/index.js";
import { checkLimit, trackUsage, getSubscriptionStatus, getLimitExceededMessage, getUpgradeMessage, USAGE_TYPES } from "../services/subscriptionService.js";
import { getMessage } from "../utils/languageUtils.js";
import { getContextForClaude, addMessage } from "../services/conversationContext.js";
import { trackUsage as trackDailyUsage, isAllowed } from "../utils/usageMonitor.js";
import { sendContextStickerWithLimit } from "../services/stickerService.js";
import { getUserCategories, getCategoryNames, getCategoryIds } from "../utils/categoryUtils.js";

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
    this.lastTokenUsage = null; // Tracks tokens from last API call
  }

  /**
   * Get token usage from the last processMessage call
   * @returns {{inputTokens: number, outputTokens: number} | null}
   */
  getLastTokenUsage() {
    return this.lastTokenUsage;
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

    // Get user's categories (custom or defaults for their language)
    const userCategories = await getUserCategories(this.userPhone, this.userLanguage);

    return {
      expenses,
      budgets,
      categorySummary,
      totalSpent,
      totalBudget,
      month: now.toLocaleString("default", { month: "long", year: "numeric" }),
      userCategories,
      categoryNames: getCategoryNames(userCategories),
      categoryIds: getCategoryIds(userCategories),
    };
  }

  /**
   * Process user message using tool-based routing
   * Claude decides which tool to call based on user intent
   * Uses conversation context (last 20 messages) for better understanding
   */
  async processMessage(userMessage) {
    const financialContext = await this.getFinancialContext();
    const tools = getToolDefinitions();

    // Filter out "otros/other/outro" from available categories
    // This forces Claude to ask when category is unclear instead of defaulting to "otros"
    const otrosVariants = ['otros', 'other', 'outro', 'misc', 'miscellaneous', 'general'];
    const allowedCategoryIds = financialContext.categoryIds.filter(c =>
      !otrosVariants.includes(c.toLowerCase())
    );

    // Inject enum constraint into log_expense tool schema
    // This makes it physically impossible for Claude to send invalid categories
    const logExpenseTool = tools.find(t => t.name === 'log_expense');
    if (logExpenseTool && allowedCategoryIds.length > 0) {
      // Deep clone to avoid mutating the original definition
      logExpenseTool.input_schema = JSON.parse(JSON.stringify(logExpenseTool.input_schema));
      logExpenseTool.input_schema.properties.expenses.items.properties.category = {
        type: "string",
        enum: allowedCategoryIds,
        description: "Category ID - MUST be one of the enum values. If none fits clearly, DO NOT call this tool."
      };
    }

    // Get conversation history (max 20 messages)
    const conversationHistory = getContextForClaude(this.userPhone);

    const systemPrompt = `You are Monedita, a helpful AI expense manager via WhatsApp.
You help users track expenses, manage budgets, and understand their spending.

Current user context for ${financialContext.month}:
- Currency: ${this.userCurrency || 'Not set'}
- Total spent: ${financialContext.totalSpent.toFixed(2)}
- Total budget: ${financialContext.totalBudget.toFixed(2)}
- Categories used: ${Object.keys(financialContext.categorySummary).join(', ') || 'None yet'}

User's available categories: ${financialContext.categoryNames}
ALLOWED category IDs (ONLY these): ${allowedCategoryIds.join(', ')}

Recent expenses: ${financialContext.expenses.slice(-3).map(e => `${e.category}: ${e.amount}`).join(', ') || 'None'}
Active budgets: ${financialContext.budgets.map(b => `${b.category}: ${b.amount}`).join(', ') || 'None'}

IMPORTANT INSTRUCTIONS:
1. Analyze the user's message to determine their intent
2. Use the appropriate tool to fulfill their request
3. For expense logging, extract ALL expenses mentioned (can be multiple)
4. CRITICAL: Keep responses SHORT - maximum 10 lines. This is WhatsApp, users read on mobile
5. Respond in the same language as the user's message
6. Use conversation history for context when needed

CATEGORY RULES (CRITICAL - YOU MUST FOLLOW THESE):
- You can ONLY use these category IDs: ${allowedCategoryIds.join(', ')}
- "otros/other" is NOT available - if no category fits clearly, you MUST ask the user
- If user says just an amount without context (e.g., "gasté 50mil", "pagué 200k"), DO NOT call log_expense - respond asking "¿En qué categoría lo registro?"
- Only call log_expense when category is OBVIOUS from context
- Map clear intents: almuerzo/comida → ${allowedCategoryIds[0] || 'comida'}, uber/taxi → ${allowedCategoryIds[1] || 'transporte'}
- When category is unclear, respond: "¿En qué categoría lo registro?\n${financialContext.categoryNames}"

When logging expenses:
- Parse amounts as numbers (e.g., "50 dollars" → 50, "mil pesos" → 1000)

For shared/split expenses:
- If user mentions "share", "split", "divide" with a group or people → use log_shared_expense
- If user wants to create a group → use create_group
- If user asks who owes them or their balances → use show_balances
- If user says they paid someone → use settle_debt
- If user wants to see their groups → use show_groups`;

    // Build messages array with conversation history + current message
    const messages = [
      ...conversationHistory,
      { role: "user", content: userMessage }
    ];

    try {
      // Check daily API limit (DDoS/cost protection)
      if (!isAllowed('claude_calls')) {
        console.error('[financeAgent] Daily Claude API limit exceeded');
        return getMessage('error_service_unavailable', this.userLanguage) ||
          'Service temporarily unavailable. Please try again later.';
      }

      // Track the API call
      trackDailyUsage('claude_calls');

      const response = await axios.post(
        ANTHROPIC_API_URL,
        {
          model: "claude-sonnet-4-20250514",
          max_tokens: 1024,
          system: systemPrompt,
          tools: tools,
          messages: messages,
        },
        {
          headers: {
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          },
        },
      );

      // Capture token usage for dynamic cost calculation
      const tokenUsage = response.data.usage || { input_tokens: 0, output_tokens: 0 };
      this.lastTokenUsage = {
        inputTokens: tokenUsage.input_tokens,
        outputTokens: tokenUsage.output_tokens,
      };

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

      // Save user message to context
      addMessage(this.userPhone, 'user', userMessage);

      // If tools were called, return their results
      if (toolResults.length > 0) {
        // Send stickers if any tool returned one (rate limited to 1/hour)
        for (const result of toolResults) {
          if (result.sticker) {
            await sendContextStickerWithLimit(this.userPhone, result.sticker);
          }
        }

        // Filter out null messages (e.g., document sent)
        const responseMessages = toolResults
          .map(r => r.message)
          .filter(m => m !== null);

        if (responseMessages.length > 0) {
          const finalResponse = responseMessages.join("\n\n");
          // Save assistant response to context
          addMessage(this.userPhone, 'assistant', finalResponse);
          return finalResponse;
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

        // Save assistant response to context
        addMessage(this.userPhone, 'assistant', textResponse);

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
    let categoryList;
    if (categories) {
      categoryList = Array.isArray(categories)
        ? categories.map(c => typeof c === 'string' ? c : c.id).join(', ')
        : categories;
    } else {
      const userCategories = await getUserCategories(this.userPhone, this.userLanguage);
      categoryList = getCategoryIds(userCategories).join(', ');
    }
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
      // Check daily limit
      if (!isAllowed('claude_calls')) {
        return { detected: false, expenses: [] };
      }
      trackDailyUsage('claude_calls');

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
