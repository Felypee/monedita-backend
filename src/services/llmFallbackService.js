/**
 * LLM Fallback Service
 * Provides fallback to Gemini/OpenAI when Claude API is overloaded
 *
 * Order: Claude → Gemini → OpenAI
 */

import axios from "axios";

// API configurations
const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

// Check if error is recoverable (should try fallback)
function isRecoverableError(error) {
  const status = error.response?.status;
  const errorType = error.response?.data?.error?.type;

  // Overloaded, rate limited, or server errors
  return (
    status === 429 ||
    status === 503 ||
    status === 502 ||
    status === 500 ||
    errorType === 'overloaded_error' ||
    errorType === 'rate_limit_error'
  );
}

/**
 * Call Claude API
 */
async function callClaude(systemPrompt, messages, tools) {
  const response = await axios.post(
    CLAUDE_API_URL,
    {
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: systemPrompt,
      tools: tools,
      messages: messages,
    },
    {
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      timeout: 30000,
    }
  );

  return {
    provider: 'claude',
    content: response.data.content,
    usage: response.data.usage || { input_tokens: 0, output_tokens: 0 },
  };
}

/**
 * Convert Claude tools format to Gemini function declarations
 */
function convertToolsToGemini(tools) {
  return tools.map(tool => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.input_schema,
  }));
}

/**
 * Call Gemini API
 */
async function callGemini(systemPrompt, messages, tools) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not configured');
  }

  // Convert messages to Gemini format
  const geminiMessages = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  // Add system prompt as first user message (Gemini doesn't have system role in same way)
  geminiMessages.unshift({
    role: 'user',
    parts: [{ text: `System instructions: ${systemPrompt}\n\nNow respond to the user's messages.` }],
  });
  geminiMessages.splice(1, 0, {
    role: 'model',
    parts: [{ text: 'Understood. I will follow these instructions.' }],
  });

  const requestBody = {
    contents: geminiMessages,
    generationConfig: {
      maxOutputTokens: 1024,
      temperature: 0.7,
    },
  };

  // Add tools if provided
  if (tools && tools.length > 0) {
    requestBody.tools = [{
      functionDeclarations: convertToolsToGemini(tools),
    }];
  }

  const response = await axios.post(
    `${GEMINI_API_URL}?key=${apiKey}`,
    requestBody,
    {
      headers: { "content-type": "application/json" },
      timeout: 30000,
    }
  );

  const candidate = response.data.candidates?.[0];
  if (!candidate) {
    throw new Error('No response from Gemini');
  }

  // Convert Gemini response to Claude-like format
  const content = [];
  for (const part of candidate.content.parts) {
    if (part.text) {
      content.push({ type: 'text', text: part.text });
    } else if (part.functionCall) {
      content.push({
        type: 'tool_use',
        name: part.functionCall.name,
        input: part.functionCall.args,
      });
    }
  }

  return {
    provider: 'gemini',
    content: content,
    usage: {
      input_tokens: response.data.usageMetadata?.promptTokenCount || 0,
      output_tokens: response.data.usageMetadata?.candidatesTokenCount || 0,
    },
  };
}

/**
 * Convert Claude tools format to OpenAI functions
 */
function convertToolsToOpenAI(tools) {
  return tools.map(tool => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema,
    },
  }));
}

/**
 * Call OpenAI API
 */
async function callOpenAI(systemPrompt, messages, tools) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  // Convert messages to OpenAI format
  const openaiMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.map(m => ({ role: m.role, content: m.content })),
  ];

  const requestBody = {
    model: 'gpt-4o-mini',
    messages: openaiMessages,
    max_tokens: 1024,
  };

  // Add tools if provided
  if (tools && tools.length > 0) {
    requestBody.tools = convertToolsToOpenAI(tools);
  }

  const response = await axios.post(
    OPENAI_API_URL,
    requestBody,
    {
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      timeout: 30000,
    }
  );

  const choice = response.data.choices?.[0];
  if (!choice) {
    throw new Error('No response from OpenAI');
  }

  // Convert OpenAI response to Claude-like format
  const content = [];
  const message = choice.message;

  if (message.content) {
    content.push({ type: 'text', text: message.content });
  }

  if (message.tool_calls) {
    for (const toolCall of message.tool_calls) {
      content.push({
        type: 'tool_use',
        name: toolCall.function.name,
        input: JSON.parse(toolCall.function.arguments),
      });
    }
  }

  return {
    provider: 'openai',
    content: content,
    usage: {
      input_tokens: response.data.usage?.prompt_tokens || 0,
      output_tokens: response.data.usage?.completion_tokens || 0,
    },
  };
}

/**
 * Call LLM with automatic fallback
 * Tries Claude → Gemini → OpenAI
 *
 * @param {string} systemPrompt - System prompt
 * @param {Array} messages - Conversation messages
 * @param {Array} tools - Tool definitions
 * @returns {Promise<{provider: string, content: Array, usage: object}>}
 */
export async function callWithFallback(systemPrompt, messages, tools) {
  const providers = [
    // { name: 'claude', fn: callClaude }, // TEST: disabled to test Gemini
    { name: 'gemini', fn: callGemini },
    { name: 'openai', fn: callOpenAI },
  ];

  let lastError = null;

  for (const provider of providers) {
    try {
      console.log(`[llmFallback] Trying ${provider.name}...`);
      const result = await provider.fn(systemPrompt, messages, tools);
      console.log(`[llmFallback] ✅ ${provider.name} succeeded`);
      return result;
    } catch (error) {
      console.error(`[llmFallback] ❌ ${provider.name} failed:`, error.response?.data?.error || error.message);
      lastError = error;

      // If not recoverable, don't try fallbacks
      if (!isRecoverableError(error) && provider.name === 'claude') {
        console.log(`[llmFallback] Non-recoverable error, not trying fallbacks`);
        throw error;
      }
    }
  }

  // All providers failed
  console.error('[llmFallback] All providers failed');
  throw lastError;
}

export default { callWithFallback };
