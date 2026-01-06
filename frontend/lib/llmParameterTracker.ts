import { LLMParameters } from '../types';

/**
 * Utility for tracking and managing LLM parameters.
 * Handles serialization, cache key generation, validation, and metadata extraction.
 */

/**
 * Serialize LLM parameters to JSON string for storage
 */
export function serializeLLMParameters(params: LLMParameters): string {
  // Sort keys for consistent serialization
  const sorted: Record<string, any> = {};
  const keys = Object.keys(params).sort();
  for (const key of keys) {
    if (params[key as keyof LLMParameters] !== undefined) {
      sorted[key] = params[key as keyof LLMParameters];
    }
  }
  return JSON.stringify(sorted);
}

/**
 * Deserialize LLM parameters from JSON string
 */
export function deserializeLLMParameters(json: string): LLMParameters {
  try {
    return JSON.parse(json);
  } catch (error) {
    console.error('Failed to deserialize LLM parameters:', error);
    return {};
  }
}

/**
 * Generate a hash from LLM parameters for cache keys
 * Uses a simple hash function (for production, consider crypto.subtle.digest)
 */
export function hashLLMParameters(params: LLMParameters): string {
  const serialized = serializeLLMParameters(params);
  // Simple hash function (for production, use crypto.subtle.digest)
  let hash = 0;
  for (let i = 0; i < serialized.length; i++) {
    const char = serialized.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Generate cache key from conversation_id, skill_id, skill_version, and LLM parameters
 */
export function generateCacheKey(
  conversationId: string,
  skillId: string,
  skillVersion: string,
  params: LLMParameters
): string {
  const paramsHash = hashLLMParameters(params);
  return `${conversationId}:${skillId}:${skillVersion}:${paramsHash}`;
}

/**
 * Validate parameter combinations
 * Per Anthropic recommendation: don't modify both temperature AND top_p simultaneously
 */
export function validateParameterCombination(params: LLMParameters): {
  valid: boolean;
  warnings: string[];
  errors: string[];
} {
  const warnings: string[] = [];
  const errors: string[] = [];

  // Check for simultaneous temperature and top_p modification
  // (Anthropic recommends modifying either temperature OR top_p, but not both)
  if (params.temperature !== undefined && params.top_p !== undefined) {
    warnings.push(
      'Both temperature and top_p are set. Anthropic recommends modifying either temperature OR top_p, but not both simultaneously.'
    );
  }

  // Validate temperature range
  if (params.temperature !== undefined) {
    if (params.temperature < 0) {
      errors.push('Temperature must be >= 0');
    }
    if (params.temperature > 2.0) {
      warnings.push('Temperature > 2.0 may produce unstable outputs');
    }
  }

  // Validate top_p range
  if (params.top_p !== undefined) {
    if (params.top_p < 0 || params.top_p > 1) {
      errors.push('top_p must be between 0 and 1');
    }
  }

  // Validate top_k range
  if (params.top_k !== undefined) {
    if (params.top_k < 0) {
      errors.push('top_k must be >= 0');
    }
  }

  // Validate max_tokens
  if (params.max_tokens !== undefined) {
    if (params.max_tokens < 1) {
      errors.push('max_tokens must be >= 1');
    }
  }

  // Validate penalty ranges
  if (params.presence_penalty !== undefined) {
    if (params.presence_penalty < -2 || params.presence_penalty > 2) {
      warnings.push('presence_penalty typically ranges from -2 to 2');
    }
  }

  if (params.frequency_penalty !== undefined) {
    if (params.frequency_penalty < -2 || params.frequency_penalty > 2) {
      warnings.push('frequency_penalty typically ranges from -2 to 2');
    }
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors
  };
}

/**
 * Extract parameters from API response (provider-specific)
 * Supports OpenAI, Anthropic, and Gemini APIs
 */
export function extractParametersFromResponse(
  response: any,
  provider: 'openai' | 'anthropic' | 'gemini'
): {
  system_fingerprint?: string;
  cached_tokens?: number;
  response_hash: string;
  finish_reason?: string;
} {
  const result: {
    system_fingerprint?: string;
    cached_tokens?: number;
    response_hash: string;
    finish_reason?: string;
  } = {
    response_hash: ''
  };

  // Generate response hash from response text
  const responseText = extractResponseText(response, provider);
  result.response_hash = hashString(responseText);

  switch (provider) {
    case 'openai':
      // OpenAI: system_fingerprint, cached_tokens from usage.prompt_tokens_details.cached_tokens
      if (response.system_fingerprint) {
        result.system_fingerprint = response.system_fingerprint;
      }
      if (response.usage?.prompt_tokens_details?.cached_tokens) {
        result.cached_tokens = response.usage.prompt_tokens_details.cached_tokens;
      }
      if (response.choices?.[0]?.finish_reason) {
        result.finish_reason = response.choices[0].finish_reason;
      }
      break;

    case 'anthropic':
      // Anthropic: cached_tokens from usage.cache_read_input_tokens
      if (response.usage?.cache_read_input_tokens) {
        result.cached_tokens = response.usage.cache_read_input_tokens;
      }
      if (response.stop_reason) {
        result.finish_reason = response.stop_reason;
      }
      break;

    case 'gemini':
      // Gemini: cached_tokens from usage_metadata.cached_content_token_count
      if (response.usageMetadata?.cachedContentTokenCount) {
        result.cached_tokens = response.usageMetadata.cachedContentTokenCount;
      }
      if (response.candidates?.[0]?.finishReason) {
        result.finish_reason = response.candidates[0].finishReason;
      }
      break;
  }

  return result;
}

/**
 * Extract response text from provider-specific response format
 */
function extractResponseText(response: any, provider: 'openai' | 'anthropic' | 'gemini'): string {
  switch (provider) {
    case 'openai':
      return response.choices?.[0]?.message?.content || response.text || '';

    case 'anthropic':
      return response.content?.[0]?.text || response.text || '';

    case 'gemini':
      return response.text || response.candidates?.[0]?.content?.parts?.[0]?.text || '';

    default:
      return JSON.stringify(response);
  }
}

/**
 * Generate prompt hash for reproducibility
 */
export function generatePromptHash(prompt: string): string {
  return hashString(prompt);
}

/**
 * Simple hash function for strings
 * For production, consider using crypto.subtle.digest for better security
 */
export function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Normalize LLM parameters (remove undefined values, set defaults)
 */
export function normalizeLLMParameters(params: Partial<LLMParameters>): LLMParameters {
  const normalized: LLMParameters = {};

  // Only include defined values
  if (params.temperature !== undefined) normalized.temperature = params.temperature;
  if (params.top_p !== undefined) normalized.top_p = params.top_p;
  if (params.top_k !== undefined) normalized.top_k = params.top_k;
  if (params.max_tokens !== undefined) normalized.max_tokens = params.max_tokens;
  if (params.presence_penalty !== undefined) normalized.presence_penalty = params.presence_penalty;
  if (params.frequency_penalty !== undefined) normalized.frequency_penalty = params.frequency_penalty;
  if (params.seed !== undefined) normalized.seed = params.seed;
  if (params.stop_sequences !== undefined) normalized.stop_sequences = params.stop_sequences;
  if (params.response_mime_type !== undefined) normalized.response_mime_type = params.response_mime_type;
  if (params.thinking_budget !== undefined) normalized.thinking_budget = params.thinking_budget;
  if (params.system_instruction !== undefined) normalized.system_instruction = params.system_instruction;
  if (params.safety_settings !== undefined) normalized.safety_settings = params.safety_settings;

  return normalized;
}

/**
 * Compare two LLM parameter sets for equality
 */
export function parametersEqual(a: LLMParameters, b: LLMParameters): boolean {
  const aNorm = normalizeLLMParameters(a);
  const bNorm = normalizeLLMParameters(b);
  return serializeLLMParameters(aNorm) === serializeLLMParameters(bNorm);
}

/**
 * Get default LLM parameters for a provider
 */
export function getDefaultParameters(provider: 'openai' | 'anthropic' | 'gemini'): LLMParameters {
  const defaults: LLMParameters = {
    temperature: 0.7,
    max_tokens: 8192
  };

  switch (provider) {
    case 'openai':
      return {
        ...defaults,
        top_p: 1.0
      };

    case 'anthropic':
      return {
        ...defaults,
        top_p: 0.95
      };

    case 'gemini':
      return {
        ...defaults,
        top_p: 0.95,
        top_k: 40
      };
  }
}

