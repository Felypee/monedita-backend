/**
 * Tool Registry
 * Collects all tools and provides interface for the FinanceAgent
 */

import logExpense from "./logExpense.js";
import setBudget from "./setBudget.js";
import showSummary from "./showSummary.js";
import showBudgets from "./showBudgets.js";
import showExpenses from "./showExpenses.js";
import exportExpenses from "./exportExpenses.js";
import renameCategory from "./renameCategory.js";
import setCurrency from "./setCurrency.js";
import subscriptionStatus from "./subscriptionStatus.js";
import upgradeInfo from "./upgradeInfo.js";
import helpInfo from "./helpInfo.js";
import deleteExpense from "./deleteExpense.js";
import editExpense from "./editExpense.js";
import deleteBudget from "./deleteBudget.js";

// Registry of all available tools
const tools = {
  log_expense: logExpense,
  set_budget: setBudget,
  show_summary: showSummary,
  show_budgets: showBudgets,
  show_expenses: showExpenses,
  export_expenses: exportExpenses,
  rename_category: renameCategory,
  set_currency: setCurrency,
  subscription_status: subscriptionStatus,
  upgrade_info: upgradeInfo,
  help_info: helpInfo,
  delete_expense: deleteExpense,
  edit_expense: editExpense,
  delete_budget: deleteBudget,
};

/**
 * Get tool definitions for Claude API
 * @returns {Array} Array of tool definitions in Claude format
 */
export function getToolDefinitions() {
  return Object.values(tools).map(tool => ({
    name: tool.definition.name,
    description: tool.definition.description,
    input_schema: tool.definition.input_schema,
  }));
}

/**
 * Execute a tool by name
 * @param {string} toolName - Name of the tool to execute
 * @param {string} phone - User's phone number
 * @param {object} params - Tool parameters
 * @param {string} lang - User's language
 * @param {string} userCurrency - User's currency
 * @returns {Promise<{success: boolean, message: string|null}>}
 */
export async function executeTool(toolName, phone, params, lang, userCurrency) {
  const tool = tools[toolName];

  if (!tool) {
    console.error(`[tools] Unknown tool: ${toolName}`);
    return { success: false, message: `Unknown tool: ${toolName}` };
  }

  try {
    console.log(`[tools] Executing ${toolName} with params:`, JSON.stringify(params));
    const result = await tool.handler(phone, params, lang, userCurrency);
    console.log(`[tools] ${toolName} completed:`, result.success ? "success" : "failed");
    return result;
  } catch (error) {
    console.error(`[tools] Error executing ${toolName}:`, error);
    return { success: false, message: "An error occurred while processing your request." };
  }
}

/**
 * Get list of tool names
 * @returns {Array<string>}
 */
export function getToolNames() {
  return Object.keys(tools);
}

/**
 * Get a specific tool
 * @param {string} name - Tool name
 * @returns {object|null}
 */
export function getTool(name) {
  return tools[name] || null;
}

export default {
  getToolDefinitions,
  executeTool,
  getToolNames,
  getTool,
};
