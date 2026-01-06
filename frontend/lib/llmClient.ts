/**
 * LLM Client with Function Calling Support
 * Supports multiple providers: DeepSeek, Claude, GPT, Gemini
 * For use in Cloudflare Pages Functions (server-side)
 */

import { TOOLS, ToolDefinition } from './toolRegistry';

export interface LLMConfig {
  provider: 'deepseek' | 'claude' | 'openai' | 'google';
  model: string;
  apiKey: string;
  temperature?: number;
  thinkingBudget?: number;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string; // For tool calls
  tool_call_id?: string; // For tool responses
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface LLMResponse {
  text: string;
  reasoning_content?: string; // CoT/reasoning trace
  tool_calls?: ToolCall[];
  usage?: {
    prompt_tokens: number;
    candidates_tokens: number;
    total_tokens: number;
  };
}

/**
 * Extract reasoning trace from response based on provider
 */
function extractReasoningTrace(provider: string, response: any): string | undefined {
  if (provider === 'deepseek') {
    // DeepSeek R1 returns reasoning in reasoning_content field
    return response.reasoning_content || response.reasoning;
  } else if (provider === 'claude') {
    // Claude 3.7+ returns in thinking field or extended thinking
    return response.thinking || response.extended_thinking || response.content?.[0]?.thinking;
  } else if (provider === 'openai') {
    // o4-mini returns reasoning summaries
    return response.reasoning_summary;
  }
  return undefined;
}

/**
 * Call LLM with function calling support
 */
export async function callLLM(
  config: LLMConfig,
  messages: LLMMessage[],
  systemPrompt?: string
): Promise<LLMResponse> {
  const { provider, model, apiKey, temperature = 0.7, thinkingBudget } = config;

  // Convert tools to provider-specific format
  const tools = TOOLS.map(tool => ({
    type: 'function' as const,
    function: {
      name: tool.function.name,
      description: tool.function.description,
      parameters: tool.function.parameters
    }
  }));

  if (provider === 'google') {
    // Use Gemini REST API directly (Cloudflare Workers compatible)
    // Build messages for Gemini (filter out system messages, handle tool messages)
    const geminiMessages = messages
      .filter(msg => msg.role !== 'system')
      .map(msg => {
        if (msg.role === 'tool') {
          // Gemini doesn't support tool role directly, convert to user message with tool result
          return {
            role: 'user' as const,
            parts: [{ text: `Tool result: ${msg.content}` }]
          };
        }
        return {
          role: msg.role === 'assistant' ? 'model' as const : 'user' as const,
          parts: [{ text: msg.content }]
        };
      });

    // Use Gemini REST API directly (Cloudflare Workers compatible)
    const httpResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: geminiMessages,
        systemInstruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
        generationConfig: {
          temperature,
          ...(thinkingBudget ? { thinkingBudget } : {})
        },
        tools: tools.length > 0 ? [{ functionDeclarations: tools.map(t => t.function) }] : undefined
      })
    });

    if (!httpResponse.ok) {
      const error = await httpResponse.json();
      throw new Error(error.error?.message || 'Google API error');
    }

    const data = await httpResponse.json();
    const candidate = data.candidates?.[0];
    const content = candidate?.content;

    if (!content) {
      throw new Error('No content in response');
    }

    // Extract text and tool calls
    let text = '';
    const toolCalls: ToolCall[] = [];

    for (const part of content.parts || []) {
      if (part.text) {
        text += part.text;
      } else if (part.functionCall) {
        toolCalls.push({
          id: part.functionCall.name + '-' + Date.now(),
          type: 'function',
          function: {
            name: part.functionCall.name,
            arguments: JSON.stringify(part.functionCall.args || {})
          }
        });
      }
    }

    return {
      text,
      reasoning_content: extractReasoningTrace('google', data),
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: data.usageMetadata ? {
        prompt_tokens: data.usageMetadata.promptTokenCount || 0,
        candidates_tokens: data.usageMetadata.candidatesTokenCount || 0,
        total_tokens: data.usageMetadata.totalTokenCount || 0
      } : undefined
    };
  } else if (provider === 'openai') {
    // Use OpenAI API
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: messages.map(msg => {
          if (msg.role === 'tool') {
            return {
              role: 'tool',
              content: msg.content,
              tool_call_id: msg.tool_call_id
            };
          }
          return {
            role: msg.role,
            content: msg.content,
            name: msg.name
          };
        }),
        ...(systemPrompt ? { system: systemPrompt } : {}),
        temperature,
        tools: tools.length > 0 ? tools : undefined,
        tool_choice: tools.length > 0 ? 'auto' : undefined,
        ...(thinkingBudget ? { thinking_budget: thinkingBudget } : {})
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'OpenAI API error');
    }

    const data = await response.json();
    const choice = data.choices[0];
    const message = choice.message;

    const toolCalls: ToolCall[] = (message.tool_calls || []).map((tc: any) => ({
      id: tc.id,
      type: 'function',
      function: {
        name: tc.function.name,
        arguments: tc.function.arguments
      }
    }));

    return {
      text: message.content || '',
      reasoning_content: extractReasoningTrace('openai', data),
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: data.usage ? {
        prompt_tokens: data.usage.prompt_tokens,
        candidates_tokens: data.usage.completion_tokens,
        total_tokens: data.usage.total_tokens
      } : undefined
    };
  } else if (provider === 'claude') {
    // Use Anthropic Claude API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        temperature,
        system: systemPrompt || '',
        messages: messages.filter(msg => msg.role !== 'system').map(msg => {
          if (msg.role === 'tool') {
            return {
              role: 'user',
              content: [{
                type: 'tool_result',
                tool_use_id: msg.tool_call_id || '',
                content: msg.content
              }]
            };
          }
          return {
            role: msg.role === 'assistant' ? 'assistant' : 'user',
            content: msg.content
          };
        }),
        tools: tools.length > 0 ? tools : undefined,
        ...(thinkingBudget ? { thinking_budget: thinkingBudget } : {})
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Claude API error');
    }

    const data = await response.json();
    const content = data.content[0];

    const toolCalls: ToolCall[] = [];
    let text = '';

    for (const item of data.content) {
      if (item.type === 'text') {
        text += item.text;
      } else if (item.type === 'tool_use') {
        toolCalls.push({
          id: item.id,
          type: 'function',
          function: {
            name: item.name,
            arguments: JSON.stringify(item.input || {})
          }
        });
      }
    }

    return {
      text,
      reasoning_content: extractReasoningTrace('claude', data),
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: data.usage ? {
        prompt_tokens: data.usage.input_tokens,
        candidates_tokens: data.usage.output_tokens,
        total_tokens: data.usage.input_tokens + data.usage.output_tokens
      } : undefined
    };
  } else if (provider === 'deepseek') {
    // Use DeepSeek API
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: messages.map(msg => {
          if (msg.role === 'tool') {
            return {
              role: 'tool',
              content: msg.content,
              tool_call_id: msg.tool_call_id
            };
          }
          return {
            role: msg.role,
            content: msg.content,
            name: msg.name
          };
        }),
        ...(systemPrompt ? { system: systemPrompt } : {}),
        temperature,
        tools: tools.length > 0 ? tools : undefined,
        tool_choice: tools.length > 0 ? 'auto' : undefined
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'DeepSeek API error');
    }

    const data = await response.json();
    const choice = data.choices[0];
    const message = choice.message;

    const toolCalls: ToolCall[] = (message.tool_calls || []).map((tc: any) => ({
      id: tc.id,
      type: 'function',
      function: {
        name: tc.function.name,
        arguments: tc.function.arguments
      }
    }));

    return {
      text: message.content || '',
      reasoning_content: extractReasoningTrace('deepseek', data),
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: data.usage ? {
        prompt_tokens: data.usage.prompt_tokens,
        candidates_tokens: data.usage.completion_tokens,
        total_tokens: data.usage.total_tokens
      } : undefined
    };
  }

  throw new Error(`Unsupported provider: ${provider}`);
}

/**
 * Parse provider and model from string (e.g., "gemini-3-flash-preview" -> {provider: "google", model: "gemini-3-flash-preview"})
 */
export function parseModelString(modelString: string): { provider: 'deepseek' | 'claude' | 'openai' | 'google'; model: string } {
  const lower = modelString.toLowerCase();
  
  if (lower.includes('deepseek') || lower.includes('deepseek-r1') || lower.includes('deepseek-reasoner')) {
    return { provider: 'deepseek', model: modelString };
  } else if (lower.includes('claude') || lower.includes('sonnet') || lower.includes('haiku') || lower.includes('opus')) {
    return { provider: 'claude', model: modelString };
  } else if (lower.includes('gpt') || lower.includes('o1') || lower.includes('o2') || lower.includes('o3') || lower.includes('o4')) {
    return { provider: 'openai', model: modelString };
  } else if (lower.includes('gemini') || lower.includes('flash') || lower.includes('pro')) {
    return { provider: 'google', model: modelString };
  }
  
  // Default to Google/Gemini
  return { provider: 'google', model: modelString };
}

