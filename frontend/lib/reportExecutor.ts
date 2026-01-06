import { Conversation, AuditReport, LLMParameters } from '../types';
import { executeMultiSkillAudit, CombinedAuditResult } from './multiSkillExecutor';
import { 
  generateCacheKey, 
  generatePromptHash, 
  normalizeLLMParameters,
  validateParameterCombination,
  extractParametersFromResponse,
  serializeLLMParameters,
  hashString
} from './llmParameterTracker';
import { getActiveSkillVersion } from './skillVersioning';
import { generateReportId as generateReportIdUtil } from './reportIdGenerator';

/**
 * Enhanced report executor that accepts full LLMParameters,
 * tracks metadata, stores skill version, and supports caching.
 */

export interface ReportExecutionConfig {
  conversation: Conversation;
  skillId: string;
  skillVersion?: string; // If not provided, uses active version
  modelName: string;
  llmParameters: LLMParameters;
  evaluatorModel: string;
  evaluationSeed?: number;
  evaluationPromptVersion?: string;
  positionVariant?: 'A_first' | 'B_first';
  promptPatchId?: string;
  tags?: string[];
  notes?: string;
  createdBy?: string;
  checkCache?: boolean; // Whether to check cache before execution
}

export interface ReportExecutionResult {
  report: AuditReport;
  fromCache: boolean;
  executionDurationMs: number;
}

// Report ID generation is imported from reportIdGenerator

/**
 * Execute a single audit report with full parameter tracking
 */
export async function executeReport(
  config: ReportExecutionConfig,
  db?: any, // D1Database (optional, for caching and skill version lookup)
  cacheLookup?: (cacheKey: string) => Promise<AuditReport | null>,
  cacheStore?: (cacheKey: string, report: AuditReport) => Promise<void>
): Promise<ReportExecutionResult> {
  const startTime = Date.now();
  
  // Normalize and validate parameters
  const normalizedParams = normalizeLLMParameters(config.llmParameters);
  const validation = validateParameterCombination(normalizedParams);
  
  if (!validation.valid) {
    throw new Error(`Invalid parameter combination: ${validation.errors.join(', ')}`);
  }
  
  if (validation.warnings.length > 0) {
    console.warn('Parameter warnings:', validation.warnings);
  }
  
  // Get skill version (use provided or fetch active)
  let skillVersion = config.skillVersion;
  if (!skillVersion && db) {
    const activeVersion = await getActiveSkillVersion(db, config.skillId);
    skillVersion = activeVersion?.version || '1.0.0';
  } else {
    skillVersion = skillVersion || '1.0.0';
  }
  
  // Generate cache key
  const cacheKey = generateCacheKey(
    config.conversation.conversation_id,
    config.skillId,
    skillVersion,
    normalizedParams
  );
  
  // Check cache if enabled
  let cachedReport: AuditReport | null = null;
  if (config.checkCache !== false && cacheLookup) {
    cachedReport = await cacheLookup(cacheKey);
    if (cachedReport) {
      console.log(`✅ Cache hit for report: ${cacheKey}`);
      return {
        report: cachedReport,
        fromCache: true,
        executionDurationMs: Date.now() - startTime
      };
    }
  }
  
  // Generate prompt hash for reproducibility
  const promptText = buildPromptText(config.conversation, config.skillId);
  const promptHash = generatePromptHash(promptText);
  const promptVersion = config.evaluationPromptVersion || '1.0.0';
  
  // Execute audit (using existing multi-skill executor)
  // Note: In a full implementation, we'd pass LLM parameters to the executor
  // For now, we'll execute and then track parameters separately
  let auditResult: CombinedAuditResult;
  let apiResponse: any = null;
  let responseMetadata: {
    system_fingerprint?: string;
    cached_tokens?: number;
    response_hash: string;
    finish_reason?: string;
  };
  
  try {
    // Execute the audit
    auditResult = await executeMultiSkillAudit(
      config.conversation,
      config.evaluatorModel,
      {
        // Pass LLM parameters through options if supported
        // For now, we'll track them separately
      }
    );
    
    // Extract metadata from API response (if available)
    // In a full implementation, executeMultiSkillAudit would return this
    responseMetadata = {
      response_hash: generatePromptHash(JSON.stringify(auditResult)),
      finish_reason: 'stop' // Default, should be extracted from actual API response
    };
    
    // TODO: Extract actual API response metadata when available
    // This requires modifying executeMultiSkillAudit to return raw API responses
    
  } catch (error: any) {
    // Create error report
    const timestamp = new Date().toISOString();
    const paramsHash = hashString(serializeLLMParameters(normalizedParams));
    const reportId = generateReportIdUtil(
      config.conversation.conversation_id,
      timestamp,
      paramsHash
    );
    
    const errorReport: AuditReport = {
      report_id: reportId,
      conversation_id: config.conversation.conversation_id,
      created_at: timestamp,
      created_by: config.createdBy,
      execution_duration_ms: Date.now() - startTime,
      skill_id: config.skillId,
      skill_version: skillVersion,
      model_name: config.modelName,
      model_version: undefined,
      llm_parameters: normalizedParams,
      prompt_hash: promptHash,
      prompt_version: promptVersion,
      timestamp_utc: new Date().toISOString(),
      system_fingerprint: undefined,
      response_hash: '',
      completion_tokens: 0,
      prompt_tokens: 0,
      cached_tokens: 0,
      latency_ms: Date.now() - startTime,
      finish_reason: undefined,
      cache_hit: false,
      evaluator_model: config.evaluatorModel,
      evaluation_seed: config.evaluationSeed,
      evaluation_prompt_version: promptVersion,
      position_variant: config.positionVariant,
      prompt_patch_id: config.promptPatchId,
      cache_key: cacheKey,
      overall_score: 0,
      confidence: 'low',
      detected_types: [],
      metrics: {},
      recommendations: [],
      limitations: [],
      usage: undefined,
      skill_results: [],
      combined_score: 0,
      primary_category: undefined,
      secondary_categories: [],
      detection_metadata: undefined,
      conversation_snapshot: convertConversationToMessages(config.conversation),
      tags: config.tags,
      notes: config.notes,
      error_message: error.message || 'Unknown error'
    };
    
    return {
      report: errorReport,
      fromCache: false,
      executionDurationMs: Date.now() - startTime
    };
  }
  
  // Build the full report
  const timestamp = new Date().toISOString();
  const paramsHash = hashString(serializeLLMParameters(normalizedParams));
  const reportId = generateReportIdUtil(
    config.conversation.conversation_id,
    timestamp,
    paramsHash
  );
  
  const executionDuration = Date.now() - startTime;
  
  const report: AuditReport = {
    report_id: reportId,
    conversation_id: config.conversation.conversation_id,
    created_at: timestamp,
    created_by: config.createdBy,
    execution_duration_ms: executionDuration,
    skill_id: config.skillId,
    skill_version: skillVersion,
    model_name: config.modelName,
    model_version: undefined, // TODO: Extract from API response if available
    llm_parameters: normalizedParams,
    prompt_hash: promptHash,
    prompt_version: promptVersion,
    timestamp_utc: new Date().toISOString(),
    system_fingerprint: responseMetadata.system_fingerprint,
    response_hash: responseMetadata.response_hash,
    completion_tokens: auditResult.usage?.candidates_tokens || 0,
    prompt_tokens: auditResult.usage?.prompt_tokens || 0,
    cached_tokens: responseMetadata.cached_tokens || 0,
    latency_ms: executionDuration,
    finish_reason: responseMetadata.finish_reason,
    cache_hit: false,
    evaluator_model: config.evaluatorModel,
    evaluation_seed: config.evaluationSeed,
    evaluation_prompt_version: promptVersion,
    position_variant: config.positionVariant,
    prompt_patch_id: config.promptPatchId,
    cache_key: cacheKey,
    overall_score: auditResult.overall_score,
    confidence: auditResult.confidence,
    detected_types: auditResult.detected_types,
    metrics: auditResult.metrics,
    recommendations: auditResult.recommendations,
    limitations: auditResult.limitations,
    usage: auditResult.usage,
    skill_results: auditResult.skill_results,
    combined_score: auditResult.combined_score,
    primary_category: auditResult.primary_category,
    secondary_categories: auditResult.secondary_categories,
    detection_metadata: auditResult.detection_metadata,
    conversation_snapshot: config.conversation.messages || [],
    tags: config.tags,
    notes: config.notes,
    error_message: undefined
  };
  
  // Store in cache if enabled
  if (cacheStore && config.checkCache !== false) {
    await cacheStore(cacheKey, report);
  }
  
  return {
    report,
    fromCache: false,
    executionDurationMs: executionDuration
  };
}

/**
 * Convert Conversation (with turns) to Message[] format for snapshot
 */
function convertConversationToMessages(conversation: Conversation): Array<{
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
  reasoning_trace?: string;
}> {
  return conversation.turns.map(turn => ({
    role: turn.role === 'user' ? 'user' : 'assistant',
    content: turn.content,
    timestamp: turn.timestamp,
    reasoning_trace: conversation.reasoning_trace // Include if available
  }));
}

/**
 * Build prompt text for hashing (for reproducibility)
 */
function buildPromptText(conversation: Conversation, skillId: string): string {
  // Build a canonical representation of the prompt
  // This should match what's actually sent to the LLM
  const messageTexts = conversation.turns.map(t => `${t.role}: ${t.content}`).join('\n');
  return `${skillId}\n${messageTexts}`;
}

