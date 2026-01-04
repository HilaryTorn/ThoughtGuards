import { GoogleGenAI, GenerateContentParameters, GenerateContentResponse, Type } from "@google/genai";

/**
 * AI service "Factory Proxy" to centralize all LLM interactions.
 * Handles token tracking, cost calculation, and strictly uses process.env.API_KEY.
 */

type UsageCallback = (usage: TokenUsage, model: string) => void;
type RequestLogCallback = (log: RequestLog) => void;

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
   * Get the active API key, checking BYOK first, then environment variable.
   */
  private static getApiKey(): string {
    // Check for BYOK (Bring Your Own Key) in localStorage first
    if (typeof window !== 'undefined') {
      const byokKey = localStorage.getItem('BYOK_API_KEY');
      if (byokKey && byokKey.trim().length > 0) {
        return byokKey.trim();
      }
    }
    // Fall back to environment variable
    return process.env.API_KEY || '';
  }

  /**
   * Centralized content generation.
   * Creates a fresh GoogleGenAI instance right before making an API call to ensure it always uses the most up-to-date API key.
   */
  public static async generateContent(params: GenerateContentParameters & { model: string }): Promise<GenerateContentResponse> {
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
   * Streamed content generation.
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
}

export default AIService;
