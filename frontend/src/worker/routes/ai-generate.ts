/**
 * Server-side AI Generation Route
 *
 * Proxies AI calls through the Cloudflare Worker to use server-side API keys.
 * This allows production demos without requiring users to provide their own keys.
 */

import { Hono } from 'hono';
import { Env } from '../index';

const aiGenerateRoutes = new Hono<{ Bindings: Env }>();

interface GeminiRequest {
  model: string;
  contents: string | any[];
  config?: {
    temperature?: number;
    topP?: number;
    topK?: number;
    maxOutputTokens?: number;
    responseMimeType?: string;
    responseSchema?: any;
    thinkingConfig?: {
      thinkingBudget?: number;
    };
  };
}

interface AnthropicRequest {
  model: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  system?: string;
  max_tokens?: number;
  temperature?: number;
}

/**
 * POST /api/ai/generate
 *
 * Unified AI generation endpoint that routes to appropriate provider.
 */
aiGenerateRoutes.post('/generate', async (c) => {
  try {
    const body = await c.req.json();
    const { provider, ...params } = body;

    if (provider === 'anthropic') {
      return handleAnthropicRequest(c, params as AnthropicRequest);
    } else {
      return handleGeminiRequest(c, params as GeminiRequest);
    }
  } catch (error: any) {
    console.error('AI generation error:', error);
    return c.json({
      success: false,
      error: error.message || 'AI generation failed',
    }, 500);
  }
});

/**
 * Handle Gemini API requests
 */
async function handleGeminiRequest(c: any, params: GeminiRequest) {
  const apiKey = c.env.GEMINI_API_KEY || c.env.GOOGLE_API_KEY;

  if (!apiKey) {
    return c.json({
      success: false,
      error: 'Gemini API key not configured on server',
    }, 500);
  }

  const { model, contents, config } = params;

  // Build the request body for Gemini API
  const requestBody: any = {
    contents: typeof contents === 'string'
      ? [{ role: 'user', parts: [{ text: contents }] }]
      : contents,
  };

  // Add generation config if provided
  if (config) {
    requestBody.generationConfig = {
      temperature: config.temperature,
      topP: config.topP,
      topK: config.topK,
      maxOutputTokens: config.maxOutputTokens,
      responseMimeType: config.responseMimeType,
      responseSchema: config.responseSchema,
    };

    // Handle thinking config for models that support it
    if (config.thinkingConfig) {
      requestBody.generationConfig.thinkingConfig = config.thinkingConfig;
    }
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Gemini API error:', errorText);
    return c.json({
      success: false,
      error: `Gemini API error: ${response.status} - ${errorText}`,
    }, response.status);
  }

  const data = await response.json();

  // Extract text from response
  let text = '';
  if (data.candidates?.[0]?.content?.parts) {
    text = data.candidates[0].content.parts
      .filter((p: any) => p.text)
      .map((p: any) => p.text)
      .join('');
  }

  return c.json({
    success: true,
    text,
    usageMetadata: data.usageMetadata,
    candidates: data.candidates,
    rawResponse: data,
  });
}

/**
 * Handle Anthropic API requests
 */
async function handleAnthropicRequest(c: any, params: AnthropicRequest) {
  const apiKey = c.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return c.json({
      success: false,
      error: 'Anthropic API key not configured on server',
    }, 500);
  }

  const { model, messages, system, max_tokens = 4096, temperature } = params;

  const requestBody: any = {
    model,
    messages,
    max_tokens,
  };

  if (system) {
    requestBody.system = system;
  }

  if (temperature !== undefined) {
    requestBody.temperature = temperature;
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Anthropic API error:', errorText);
    return c.json({
      success: false,
      error: `Anthropic API error: ${response.status} - ${errorText}`,
    }, response.status);
  }

  const data = await response.json();

  // Extract text from response
  let text = '';
  if (data.content) {
    text = data.content
      .filter((block: any) => block.type === 'text')
      .map((block: any) => block.text)
      .join('');
  }

  return c.json({
    success: true,
    text,
    usage: data.usage,
    rawResponse: data,
  });
}

/**
 * GET /api/ai/models
 *
 * Returns available models based on configured API keys.
 */
aiGenerateRoutes.get('/models', async (c) => {
  const hasGemini = !!(c.env.GEMINI_API_KEY || c.env.GOOGLE_API_KEY);
  const hasAnthropic = !!c.env.ANTHROPIC_API_KEY;

  const models: Array<{ id: string; name: string; provider: string }> = [];

  if (hasGemini) {
    models.push(
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash (Recommended)', provider: 'gemini' },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', provider: 'gemini' },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', provider: 'gemini' },
    );
  }

  if (hasAnthropic) {
    models.push(
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', provider: 'anthropic' },
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', provider: 'anthropic' },
    );
  }

  return c.json({
    success: true,
    models,
    hasGemini,
    hasAnthropic,
  });
});

export default aiGenerateRoutes;
