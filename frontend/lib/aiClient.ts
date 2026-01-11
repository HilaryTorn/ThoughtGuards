import { GoogleGenAI, GenerateContentParameters, GenerateContentResponse, Type } from "@google/genai";
import Anthropic from "@anthropic-ai/sdk";

/**
 * AI service "Factory Proxy" to centralize all LLM interactions.
 * Supports multiple providers: Gemini (Google) and Anthropic (Claude).
 * Handles token tracking, cost calculation, and API key management.
 *
 * In production (no localStorage keys), routes through server-side API.
 * In development (with localStorage keys), calls APIs directly.
 */

/**
 * Check if we should use server-side API for Gemini (no BYOK key)
 */
function shouldUseServerSideGemini(): boolean {
  if (typeof window === 'undefined') return false;
  const hasGeminiKey = !!(localStorage.getItem('BYOK_API_KEY') || localStorage.getItem('GEMINI_API_KEY'));
  return !hasGeminiKey;
}

/**
 * Check if we should use server-side API for Anthropic (no BYOK key)
 */
function shouldUseServerSideAnthropic(): boolean {
  if (typeof window === 'undefined') return false;
  const hasAnthropicKey = !!localStorage.getItem('ANTHROPIC_API_KEY');
  return !hasAnthropicKey;
}

export type AIProvider = 'gemini' | 'anthropic';

type UsageCallback = (usage: TokenUsage, model: string) => void;
type RequestLogCallback = (log: RequestLog) => void;

/**
 * Detect provider from model name.
 */
export function getProviderFromModel(model: string): AIProvider {
  console.log(`[getProviderFromModel] Input model: "${model}", type: ${typeof model}`);
  const isClaudeModel = model && typeof model === 'string' && model.startsWith('claude-');
  const provider = isClaudeModel ? 'anthropic' : 'gemini';
  console.log(`[getProviderFromModel] Result: ${provider} (isClaudeModel: ${isClaudeModel})`);
  return provider;
}

/**
 * Parameters for Anthropic content generation.
 */
export interface AnthropicGenerateParams {
  model: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  system?: string;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
}

/**
 * Unified response format for both providers.
 */
export interface UnifiedAIResponse {
  text: string;
  provider: AIProvider;
  model: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  rawResponse?: any;
}

export interface TokenUsage {
  prompt_tokens: number;
  candidates_tokens: number;
  total_tokens: number;
}

export interface RequestLog {
  id: string;
  timestamp: string;
  model: string;
  request: {
    contents: string;
    config?: any;
  };
  response?: {
    text?: string;
    fullResponse?: any;
  };
  usage?: {
    prompt_tokens?: number;
    candidates_tokens?: number;
    total_tokens?: number;
  };
  error?: string;
  duration?: number; // milliseconds
}

class AIService {
  private static usageCallbacks: UsageCallback[] = [];
  private static requestLogCallbacks: RequestLogCallback[] = [];

  /**
   * Subscribe to token usage events for global analytics.
   */
  public static onUsage(callback: UsageCallback) {
    this.usageCallbacks.push(callback);
    return () => {
      this.usageCallbacks = this.usageCallbacks.filter(c => c !== callback);
    };
  }

  /**
   * Subscribe to request/response logging events.
   */
  public static onRequestLog(callback: RequestLogCallback) {
    this.requestLogCallbacks.push(callback);
    return () => {
      this.requestLogCallbacks = this.requestLogCallbacks.filter(c => c !== callback);
    };
  }

  private static notifyUsage(usage: TokenUsage, model: string) {
    this.usageCallbacks.forEach(cb => cb(usage, model));
  }

  private static notifyRequestLog(log: RequestLog) {
    this.requestLogCallbacks.forEach(cb => cb(log));
  }

  /**
   * Get the Gemini API key, checking BYOK first, then environment variable.
   */
  private static getGeminiApiKey(): string {
    // Check for BYOK (Bring Your Own Key) in localStorage first
    if (typeof window !== 'undefined') {
      const byokKey = localStorage.getItem('BYOK_API_KEY') || localStorage.getItem('GEMINI_API_KEY');
      if (byokKey && byokKey.trim().length > 0) {
        return byokKey.trim();
      }
    }
    // Fall back to environment variable
    return process.env.API_KEY || process.env.GEMINI_API_KEY || '';
  }

  /**
   * Get the Anthropic API key, checking localStorage first, then environment variable.
   */
  private static getAnthropicApiKey(): string {
    if (typeof window !== 'undefined') {
      const key = localStorage.getItem('ANTHROPIC_API_KEY');
      if (key && key.trim().length > 0) {
        return key.trim();
      }
    }
    return process.env.ANTHROPIC_API_KEY || '';
  }

  /**
   * Legacy method for backward compatibility.
   */
  private static getApiKey(): string {
    return this.getGeminiApiKey();
  }

  /**
   * Centralized content generation.
   * Uses server-side API in production (no BYOK keys), or direct API calls with BYOK keys.
   */
  public static async generateContent(params: GenerateContentParameters & { model: string }): Promise<GenerateContentResponse> {
    // Safeguard: Prevent Claude models from being sent to Gemini API
    if (params.model.startsWith('claude-')) {
      console.error(`[AIService.generateContent] ERROR: Claude model "${params.model}" was passed to Gemini API!`);
      console.error('[AIService.generateContent] This is a bug - Claude models should use generateWithAnthropic()');
      throw new Error(`Claude model "${params.model}" cannot be used with Gemini API. Use generateWithAnthropic() instead.`);
    }

    // Use server-side API if no Gemini key is configured
    if (shouldUseServerSideGemini()) {
      return this.generateContentViaServer(params);
    }

    const apiKey = this.getApiKey();
    const ai = new GoogleGenAI({ apiKey });
    const startTime = Date.now();
    const logId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Prepare request log
    const requestLog: RequestLog = {
      id: logId,
      timestamp: new Date().toISOString(),
      model: params.model,
      request: {
        contents: typeof params.contents === 'string' ? params.contents : JSON.stringify(params.contents, null, 2),
        config: params.config
      }
    };

    try {
      const response = await ai.models.generateContent({
        model: params.model,
        contents: params.contents,
        config: params.config
      });
      
      const duration = Date.now() - startTime;
      
      if (response.usageMetadata) {
        this.notifyUsage({
          prompt_tokens: response.usageMetadata.promptTokenCount,
          candidates_tokens: response.usageMetadata.candidatesTokenCount,
          total_tokens: response.usageMetadata.totalTokenCount
        }, params.model);

        requestLog.usage = {
          prompt_tokens: response.usageMetadata.promptTokenCount,
          candidates_tokens: response.usageMetadata.candidatesTokenCount,
          total_tokens: response.usageMetadata.totalTokenCount
        };
      }

      // Extract response text
      let responseText = '';
      if (response.text) {
        responseText = response.text;
      } else if ((response as any).candidates?.[0]?.content?.parts?.[0]?.text) {
        responseText = (response as any).candidates[0].content.parts[0].text;
      }

      requestLog.response = {
        text: responseText,
        fullResponse: response
      };
      requestLog.duration = duration;

      // Notify log subscribers
      this.notifyRequestLog(requestLog);

      return response;
    } catch (error: any) {
      const duration = Date.now() - startTime;
      
      // Capture comprehensive error information
      let errorMessage = '';
      
      // Try different ways to extract error message
      if (error?.message) {
        errorMessage = error.message;
      } else if (error?.error?.message) {
        errorMessage = error.error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      } else {
        errorMessage = String(error);
      }
      
      // Add additional error context
      const errorDetails: string[] = [];
      if (error?.response?.data) {
        errorDetails.push(`Response: ${JSON.stringify(error.response.data)}`);
      }
      if (error?.status) {
        errorDetails.push(`Status: ${error.status}`);
      }
      if (error?.statusCode) {
        errorDetails.push(`Status Code: ${error.statusCode}`);
      }
      if (error?.code) {
        errorDetails.push(`Code: ${error.code}`);
      }
      if (error?.stack) {
        errorDetails.push(`Stack: ${error.stack.substring(0, 500)}`);
      }
      
      if (errorDetails.length > 0) {
        errorMessage += ` | ${errorDetails.join(' | ')}`;
      }
      
      requestLog.error = errorMessage;
      requestLog.duration = duration;
      
      // Also try to capture any partial response if available
      if (error?.response) {
        requestLog.response = {
          text: undefined,
          fullResponse: error.response
        };
      }
      
      // Always notify log subscribers, even on error
      try {
        this.notifyRequestLog(requestLog);
      } catch (logError) {
        // If logging fails, at least log to console
        console.error('Failed to log request error:', logError);
        console.error('Original error:', error);
      }

      if (error?.message?.includes("Requested entity was not found")) {
        console.warn("AI Client: API Key resolution error or model unavailable in your region.");
      }
      throw error;
    }
  }

  /**
   * Generate content via server-side API (for production without BYOK keys).
   */
  private static async generateContentViaServer(params: GenerateContentParameters & { model: string }): Promise<GenerateContentResponse> {
    const startTime = Date.now();
    const logId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

    const requestLog: RequestLog = {
      id: logId,
      timestamp: new Date().toISOString(),
      model: params.model,
      request: {
        contents: typeof params.contents === 'string' ? params.contents : JSON.stringify(params.contents, null, 2),
        config: params.config
      }
    };

    try {
      const response = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'gemini',
          model: params.model,
          contents: params.contents,
          config: params.config,
        }),
      });

      const data = await response.json() as {
        success: boolean;
        error?: string;
        text?: string;
        candidates?: any[];
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
      };
      const duration = Date.now() - startTime;

      if (!data.success) {
        throw new Error(data.error || 'Server-side AI generation failed');
      }

      // Build a response object compatible with GenerateContentResponse
      const result: GenerateContentResponse = {
        text: data.text,
        candidates: data.candidates,
        usageMetadata: data.usageMetadata,
      } as GenerateContentResponse;

      if (data.usageMetadata) {
        this.notifyUsage({
          prompt_tokens: data.usageMetadata.promptTokenCount || 0,
          candidates_tokens: data.usageMetadata.candidatesTokenCount || 0,
          total_tokens: data.usageMetadata.totalTokenCount || 0,
        }, params.model);

        requestLog.usage = {
          prompt_tokens: data.usageMetadata.promptTokenCount || 0,
          candidates_tokens: data.usageMetadata.candidatesTokenCount || 0,
          total_tokens: data.usageMetadata.totalTokenCount || 0,
        };
      }

      requestLog.response = { text: data.text, fullResponse: data };
      requestLog.duration = duration;
      this.notifyRequestLog(requestLog);

      return result;
    } catch (error: any) {
      const duration = Date.now() - startTime;
      requestLog.error = error.message || String(error);
      requestLog.duration = duration;
      this.notifyRequestLog(requestLog);
      throw error;
    }
  }

  /**
   * Streamed content generation (Gemini only).
   */
  public static async *generateContentStream(params: GenerateContentParameters & { model: string }) {
    const apiKey = this.getApiKey();
    const ai = new GoogleGenAI({ apiKey });

    const result = await ai.models.generateContentStream({
      model: params.model,
      contents: params.contents,
      config: params.config
    });

    for await (const chunk of result) {
      if (chunk.usageMetadata) {
        this.notifyUsage({
          prompt_tokens: chunk.usageMetadata.promptTokenCount,
          candidates_tokens: chunk.usageMetadata.candidatesTokenCount,
          total_tokens: chunk.usageMetadata.totalTokenCount
        }, params.model);
      }
      yield chunk;
    }
  }

  /**
   * Generate content using Anthropic Claude models.
   * Uses server-side API in production (no BYOK keys), or direct API calls with BYOK keys.
   */
  public static async generateWithAnthropic(params: AnthropicGenerateParams): Promise<UnifiedAIResponse> {
    // Use server-side API if no Anthropic key is configured
    if (shouldUseServerSideAnthropic()) {
      return this.generateWithAnthropicViaServer(params);
    }

    const apiKey = this.getAnthropicApiKey();
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY not configured. Please add it in Settings.');
    }

    const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
    const startTime = Date.now();
    const logId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Prepare request log
    const requestLog: RequestLog = {
      id: logId,
      timestamp: new Date().toISOString(),
      model: params.model,
      request: {
        contents: JSON.stringify(params.messages, null, 2),
        config: { system: params.system, max_tokens: params.max_tokens, temperature: params.temperature }
      }
    };

    try {
      const response = await client.messages.create({
        model: params.model,
        max_tokens: params.max_tokens || 4096,
        system: params.system,
        messages: params.messages,
        temperature: params.temperature,
        top_p: params.top_p,
      });

      const duration = Date.now() - startTime;

      // Extract text from response
      let text = '';
      for (const block of response.content) {
        if (block.type === 'text') {
          text += block.text;
        }
      }

      // Track usage
      const usage = {
        prompt_tokens: response.usage.input_tokens,
        completion_tokens: response.usage.output_tokens,
        total_tokens: response.usage.input_tokens + response.usage.output_tokens,
      };

      this.notifyUsage({
        prompt_tokens: usage.prompt_tokens,
        candidates_tokens: usage.completion_tokens,
        total_tokens: usage.total_tokens,
      }, params.model);

      requestLog.usage = {
        prompt_tokens: usage.prompt_tokens,
        candidates_tokens: usage.completion_tokens,
        total_tokens: usage.total_tokens,
      };
      requestLog.response = { text, fullResponse: response };
      requestLog.duration = duration;
      this.notifyRequestLog(requestLog);

      return {
        text,
        provider: 'anthropic',
        model: params.model,
        usage,
        rawResponse: response,
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;

      let errorMessage = error?.message || String(error);
      if (error?.status) {
        errorMessage = `${error.status}: ${errorMessage}`;
      }

      // Enhanced error logging for Anthropic API errors
      console.error(`[Anthropic API Error] Model: ${params.model}, Status: ${error?.status || 'unknown'}`);
      console.error(`[Anthropic API Error] Message: ${errorMessage}`);
      if (error?.error) {
        console.error(`[Anthropic API Error] Details:`, error.error);
      }

      requestLog.error = errorMessage;
      requestLog.duration = duration;
      this.notifyRequestLog(requestLog);

      throw error;
    }
  }

  /**
   * Generate content via server-side Anthropic API (for production without BYOK keys).
   */
  private static async generateWithAnthropicViaServer(params: AnthropicGenerateParams): Promise<UnifiedAIResponse> {
    const startTime = Date.now();
    const logId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

    const requestLog: RequestLog = {
      id: logId,
      timestamp: new Date().toISOString(),
      model: params.model,
      request: {
        contents: JSON.stringify(params.messages, null, 2),
        config: { system: params.system, max_tokens: params.max_tokens, temperature: params.temperature }
      }
    };

    try {
      const response = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'anthropic',
          model: params.model,
          messages: params.messages,
          system: params.system,
          max_tokens: params.max_tokens || 4096,
          temperature: params.temperature,
        }),
      });

      const data = await response.json() as {
        success: boolean;
        error?: string;
        text?: string;
        usage?: { input_tokens?: number; output_tokens?: number };
      };
      const duration = Date.now() - startTime;

      if (!data.success) {
        throw new Error(data.error || 'Server-side Anthropic API call failed');
      }

      const usage = {
        prompt_tokens: data.usage?.input_tokens || 0,
        completion_tokens: data.usage?.output_tokens || 0,
        total_tokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
      };

      this.notifyUsage({
        prompt_tokens: usage.prompt_tokens,
        candidates_tokens: usage.completion_tokens,
        total_tokens: usage.total_tokens,
      }, params.model);

      requestLog.usage = {
        prompt_tokens: usage.prompt_tokens,
        candidates_tokens: usage.completion_tokens,
        total_tokens: usage.total_tokens,
      };
      requestLog.response = { text: data.text, fullResponse: data };
      requestLog.duration = duration;
      this.notifyRequestLog(requestLog);

      return {
        text: data.text || '',
        provider: 'anthropic',
        model: params.model,
        usage,
        rawResponse: data,
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      requestLog.error = error.message || String(error);
      requestLog.duration = duration;
      this.notifyRequestLog(requestLog);
      throw error;
    }
  }

  /**
   * Unified content generation that auto-detects provider from model name.
   * Use this for provider-agnostic code.
   */
  public static async generateUnified(params: {
    model: string;
    prompt: string;
    systemPrompt?: string;
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    responseFormat?: 'text' | 'json';
  }): Promise<UnifiedAIResponse> {
    const provider = getProviderFromModel(params.model);

    if (provider === 'anthropic') {
      return this.generateWithAnthropic({
        model: params.model,
        messages: [{ role: 'user', content: params.prompt }],
        system: params.systemPrompt,
        max_tokens: params.maxTokens || 4096,
        temperature: params.temperature,
        top_p: params.topP,
      });
    }

    // Gemini
    const response = await this.generateContent({
      model: params.model,
      contents: params.prompt,
      config: {
        systemInstruction: params.systemPrompt,
        maxOutputTokens: params.maxTokens,
        temperature: params.temperature,
        topP: params.topP,
        responseMimeType: params.responseFormat === 'json' ? 'application/json' : undefined,
      }
    });

    let text = response.text || '';
    if (!text && (response as any).candidates?.[0]?.content?.parts?.[0]?.text) {
      text = (response as any).candidates[0].content.parts[0].text;
    }

    return {
      text,
      provider: 'gemini',
      model: params.model,
      usage: response.usageMetadata ? {
        prompt_tokens: response.usageMetadata.promptTokenCount || 0,
        completion_tokens: response.usageMetadata.candidatesTokenCount || 0,
        total_tokens: response.usageMetadata.totalTokenCount || 0,
      } : undefined,
      rawResponse: response,
    };
  }
}

export default AIService;
