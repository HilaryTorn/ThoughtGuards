import { Conversation, AuditReport, LLMParameters } from '../types';
import { executeReport, ReportExecutionConfig } from './reportExecutor';

/**
 * Batch report executor: Execute array of report configurations
 * sequentially or in parallel with progress callbacks.
 */

export interface BatchReportConfig {
  conversation: Conversation;
  skillId: string;
  skillVersion?: string;
  modelName: string;
  llmParameters: LLMParameters;
  evaluatorModel: string;
  evaluationSeed?: number;
  tags?: string[];
  notes?: string;
}

export interface BatchExecutionResult {
  total: number;
  completed: number;
  failed: number;
  reportIds: string[];
  results: Array<{
    config: BatchReportConfig;
    report?: AuditReport;
    error?: string;
  }>;
  durationMs: number;
}

export interface BatchProgress {
  total: number;
  completed: number;
  failed: number;
  current?: BatchReportConfig;
}

/**
 * Execute batch of reports sequentially
 */
export async function executeBatchSequential(
  configs: BatchReportConfig[],
  db?: any, // D1Database
  cacheLookup?: (cacheKey: string) => Promise<AuditReport | null>,
  cacheStore?: (cacheKey: string, report: AuditReport) => Promise<void>,
  progressCallback?: (progress: BatchProgress) => void
): Promise<BatchExecutionResult> {
  const startTime = Date.now();
  const reportIds: string[] = [];
  const results: BatchExecutionResult['results'] = [];
  let completed = 0;
  let failed = 0;
  
  for (const config of configs) {
    // Report progress
    if (progressCallback) {
      progressCallback({
        total: configs.length,
        completed,
        failed,
        current: config
      });
    }
    
    try {
      const executionConfig: ReportExecutionConfig = {
        conversation: config.conversation,
        skillId: config.skillId,
        skillVersion: config.skillVersion,
        modelName: config.modelName,
        llmParameters: config.llmParameters,
        evaluatorModel: config.evaluatorModel,
        evaluationSeed: config.evaluationSeed,
        tags: config.tags,
        notes: config.notes,
        checkCache: true
      };
      
      const result = await executeReport(
        executionConfig,
        db,
        cacheLookup,
        cacheStore
      );
      
      reportIds.push(result.report.report_id);
      completed++;
      
      results.push({
        config,
        report: result.report
      });
      
    } catch (error: any) {
      failed++;
      console.error('Error executing batch report:', error);
      
      results.push({
        config,
        error: error.message || 'Unknown error'
      });
    }
  }
  
  const durationMs = Date.now() - startTime;
  
  return {
    total: configs.length,
    completed,
    failed,
    reportIds,
    results,
    durationMs
  };
}

/**
 * Execute batch of reports in parallel with concurrency limit
 */
export async function executeBatchParallel(
  configs: BatchReportConfig[],
  maxConcurrent: number = 5,
  db?: any, // D1Database
  cacheLookup?: (cacheKey: string) => Promise<AuditReport | null>,
  cacheStore?: (cacheKey: string, report: AuditReport) => Promise<void>,
  progressCallback?: (progress: BatchProgress) => void
): Promise<BatchExecutionResult> {
  const startTime = Date.now();
  const reportIds: string[] = [];
  const results: BatchExecutionResult['results'] = [];
  let completed = 0;
  let failed = 0;
  
  // Process in batches
  for (let i = 0; i < configs.length; i += maxConcurrent) {
    const batch = configs.slice(i, i + maxConcurrent);
    
    const batchPromises = batch.map(async (config) => {
      try {
        const executionConfig: ReportExecutionConfig = {
          conversation: config.conversation,
          skillId: config.skillId,
          skillVersion: config.skillVersion,
          modelName: config.modelName,
          llmParameters: config.llmParameters,
          evaluatorModel: config.evaluatorModel,
          evaluationSeed: config.evaluationSeed,
          tags: config.tags,
          notes: config.notes,
          checkCache: true
        };
        
        const result = await executeReport(
          executionConfig,
          db,
          cacheLookup,
          cacheStore
        );
        
        completed++;
        reportIds.push(result.report.report_id);
        
        // Update progress
        if (progressCallback) {
          progressCallback({
            total: configs.length,
            completed,
            failed
          });
        }
        
        return {
          config,
          report: result.report
        };
        
      } catch (error: any) {
        failed++;
        console.error('Error executing batch report:', error);
        
        // Update progress
        if (progressCallback) {
          progressCallback({
            total: configs.length,
            completed,
            failed
          });
        }
        
        return {
          config,
          error: error.message || 'Unknown error'
        };
      }
    });
    
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
  }
  
  const durationMs = Date.now() - startTime;
  
  return {
    total: configs.length,
    completed,
    failed,
    reportIds,
    results,
    durationMs
  };
}

/**
 * Execute batch (chooses sequential or parallel based on config)
 */
export async function executeBatch(
  configs: BatchReportConfig[],
  options: {
    parallel?: boolean;
    maxConcurrent?: number;
  } = {},
  db?: any, // D1Database
  cacheLookup?: (cacheKey: string) => Promise<AuditReport | null>,
  cacheStore?: (cacheKey: string, report: AuditReport) => Promise<void>,
  progressCallback?: (progress: BatchProgress) => void
): Promise<BatchExecutionResult> {
  if (options.parallel !== false && configs.length > 1) {
    return executeBatchParallel(
      configs,
      options.maxConcurrent || 5,
      db,
      cacheLookup,
      cacheStore,
      progressCallback
    );
  } else {
    return executeBatchSequential(
      configs,
      db,
      cacheLookup,
      cacheStore,
      progressCallback
    );
  }
}

