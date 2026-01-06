/**
 * Chat API Routes - Handles AI chat interactions
 */

import { Hono } from 'hono';
import type { Env } from '../index';

export const chatRoutes = new Hono<{ Bindings: Env }>();

// Available tools for the chatbot
const AVAILABLE_TOOLS = [
  'lookup_product',
  'check_inventory',
  'get_customer_history',
  'check_competitor_prices',
  'get_policy',
  'get_order_details',
  'create_order',
  'process_return',
  'apply_discount',
  'send_email',
  'escalate_to_human'
];

// Chat completion endpoint
chatRoutes.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const {
      messages,
      model,
      provider,
      temperature,
      max_tokens,
      system_prompt,
      conversation_id,
      customer_id
    } = body;

    if (!messages || !Array.isArray(messages)) {
      return c.json({ error: 'messages array is required' }, 400);
    }

    // Determine which provider to use
    const selectedProvider = provider || 'gemini';

    let response;
    switch (selectedProvider.toLowerCase()) {
      case 'gemini':
      case 'google':
        response = await handleGeminiChat(c.env, messages, model, temperature, max_tokens, system_prompt);
        break;
      case 'openai':
        response = await handleOpenAIChat(c.env, messages, model, temperature, max_tokens, system_prompt);
        break;
      case 'anthropic':
      case 'claude':
        response = await handleAnthropicChat(c.env, messages, model, temperature, max_tokens, system_prompt);
        break;
      case 'deepseek':
        response = await handleDeepSeekChat(c.env, messages, model, temperature, max_tokens, system_prompt);
        break;
      case 'qwen':
        response = await handleQwenChat(c.env, messages, model, temperature, max_tokens, system_prompt);
        break;
      default:
        return c.json({ error: `Unknown provider: ${selectedProvider}` }, 400);
    }

    return c.json(response);
  } catch (error: any) {
    console.error('Chat error:', error);
    return c.json({ error: error.message || 'Chat request failed' }, 500);
  }
});

// Get available models
chatRoutes.get('/models', async (c) => {
  return c.json({
    providers: {
      gemini: {
        available: !!c.env.GEMINI_API_KEY || !!c.env.GOOGLE_API_KEY,
        models: ['gemini-2.0-flash-exp', 'gemini-1.5-pro', 'gemini-1.5-flash']
      },
      openai: {
        available: !!c.env.OPENAI_API_KEY,
        models: ['gpt-4o', 'gpt-4o-mini', 'o1', 'o1-mini', 'o3-mini']
      },
      anthropic: {
        available: !!c.env.ANTHROPIC_API_KEY,
        models: ['claude-sonnet-4-20250514', 'claude-3-5-sonnet-20241022', 'claude-3-haiku-20240307']
      },
      deepseek: {
        available: !!c.env.DEEPSEEK_API_KEY,
        models: ['deepseek-reasoner', 'deepseek-chat']
      },
      qwen: {
        available: !!c.env.QWEN_API_KEY,
        models: ['qwq-32b-preview', 'qwen-turbo']
      }
    }
  });
});

// Gemini chat handler
async function handleGeminiChat(
  env: Env,
  messages: any[],
  model?: string,
  temperature?: number,
  maxTokens?: number,
  systemPrompt?: string
) {
  const apiKey = env.GEMINI_API_KEY || env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY or GOOGLE_API_KEY not configured');
  }

  const modelName = model || 'gemini-2.0-flash-exp';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

  // Convert messages to Gemini format
  const contents = messages.map((msg: any) => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }]
  }));

  const requestBody: any = {
    contents,
    generationConfig: {
      temperature: temperature ?? 0.7,
      maxOutputTokens: maxTokens ?? 8192
    }
  };

  if (systemPrompt) {
    requestBody.systemInstruction = { parts: [{ text: systemPrompt }] };
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${error}`);
  }

  const data: any = await response.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

  return {
    content,
    model: modelName,
    provider: 'gemini',
    usage: {
      prompt_tokens: data.usageMetadata?.promptTokenCount || 0,
      completion_tokens: data.usageMetadata?.candidatesTokenCount || 0,
      total_tokens: data.usageMetadata?.totalTokenCount || 0
    }
  };
}

// OpenAI chat handler
async function handleOpenAIChat(
  env: Env,
  messages: any[],
  model?: string,
  temperature?: number,
  maxTokens?: number,
  systemPrompt?: string
) {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const modelName = model || 'gpt-4o';
  const url = 'https://api.openai.com/v1/chat/completions';

  // Add system prompt if provided
  const allMessages = systemPrompt
    ? [{ role: 'system', content: systemPrompt }, ...messages]
    : messages;

  const requestBody: any = {
    model: modelName,
    messages: allMessages,
    temperature: temperature ?? 0.7,
    max_tokens: maxTokens ?? 4096
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${error}`);
  }

  const data: any = await response.json();

  return {
    content: data.choices?.[0]?.message?.content || '',
    model: modelName,
    provider: 'openai',
    usage: data.usage || {}
  };
}

// Anthropic chat handler
async function handleAnthropicChat(
  env: Env,
  messages: any[],
  model?: string,
  temperature?: number,
  maxTokens?: number,
  systemPrompt?: string
) {
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const modelName = model || 'claude-sonnet-4-20250514';
  const url = 'https://api.anthropic.com/v1/messages';

  const requestBody: any = {
    model: modelName,
    messages,
    max_tokens: maxTokens ?? 4096
  };

  if (temperature !== undefined) {
    requestBody.temperature = temperature;
  }

  if (systemPrompt) {
    requestBody.system = systemPrompt;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${error}`);
  }

  const data: any = await response.json();

  return {
    content: data.content?.[0]?.text || '',
    model: modelName,
    provider: 'anthropic',
    usage: {
      prompt_tokens: data.usage?.input_tokens || 0,
      completion_tokens: data.usage?.output_tokens || 0,
      total_tokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0)
    }
  };
}

// DeepSeek chat handler
async function handleDeepSeekChat(
  env: Env,
  messages: any[],
  model?: string,
  temperature?: number,
  maxTokens?: number,
  systemPrompt?: string
) {
  const apiKey = env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY not configured');
  }

  const modelName = model || 'deepseek-chat';
  const url = 'https://api.deepseek.com/v1/chat/completions';

  const allMessages = systemPrompt
    ? [{ role: 'system', content: systemPrompt }, ...messages]
    : messages;

  const requestBody: any = {
    model: modelName,
    messages: allMessages,
    temperature: temperature ?? 0.7,
    max_tokens: maxTokens ?? 4096
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`DeepSeek API error: ${error}`);
  }

  const data: any = await response.json();

  return {
    content: data.choices?.[0]?.message?.content || '',
    reasoning_content: data.choices?.[0]?.message?.reasoning_content || '',
    model: modelName,
    provider: 'deepseek',
    usage: data.usage || {}
  };
}

// Qwen chat handler
async function handleQwenChat(
  env: Env,
  messages: any[],
  model?: string,
  temperature?: number,
  maxTokens?: number,
  systemPrompt?: string
) {
  const apiKey = env.QWEN_API_KEY;
  if (!apiKey) {
    throw new Error('QWEN_API_KEY not configured');
  }

  const modelName = model || 'qwq-32b-preview';
  const url = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';

  const allMessages = systemPrompt
    ? [{ role: 'system', content: systemPrompt }, ...messages]
    : messages;

  const requestBody: any = {
    model: modelName,
    messages: allMessages,
    temperature: temperature ?? 0.7,
    max_tokens: maxTokens ?? 4096
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Qwen API error: ${error}`);
  }

  const data: any = await response.json();

  return {
    content: data.choices?.[0]?.message?.content || '',
    model: modelName,
    provider: 'qwen',
    usage: data.usage || {}
  };
}
