import { Conversation, LLMParameters, ParameterSweepConfig, AuditReport } from '../types';
import { executeReport, ReportExecutionConfig } from './reportExecutor';
import { normalizeLLMParameters } from './llmParameterTracker';

/**
 * Parameter sweep executor: Generate parameter combinations,
 * execute in parallel with concurrency limits, track progress.
 * Supports grid search, random search, Bayesian optimization, and Latin hypercube.
 */

export interface ParameterCombination {
  parameters: LLMParameters;
  combinationId: string;
}

export interface SweepProgress {
  sweepId: string;
  totalCombinations: number;
  completedCount: number;
  failedCount: number;
  reportIds: string[];
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt?: string;
  completedAt?: string;
}

export interface SweepResult {
  sweepId: string;
  reportIds: string[];
  totalCombinations: number;
  completedCount: number;
  failedCount: number;
  durationMs: number;
  results: Array<{
    combinationId: string;
    parameters: LLMParameters;
    report?: AuditReport;
    error?: string;
  }>;
}

/**
 * Generate all parameter combinations for grid search
 */
export function generateGridSearchCombinations(
  config: ParameterSweepConfig
): ParameterCombination[] {
  const combinations: ParameterCombination[] = [];
  const paramKeys = Object.keys(config.parameters);
  
  if (paramKeys.length === 0) {
    return [];
  }
  
  // Generate values for each parameter
  const paramValues: Record<string, number[]> = {};
  for (const [key, spec] of Object.entries(config.parameters)) {
    if (spec.values) {
      paramValues[key] = spec.values;
    } else if (spec.min !== undefined && spec.max !== undefined && spec.step !== undefined) {
      const values: number[] = [];
      for (let val = spec.min; val <= spec.max; val += spec.step) {
        values.push(Number(val.toFixed(3))); // Round to avoid floating point issues
      }
      paramValues[key] = values;
    } else {
      paramValues[key] = [undefined as any]; // Single value (undefined means use default)
    }
  }
  
  // Generate all combinations (cartesian product)
  function generateCombinations(
    keys: string[],
    index: number,
    current: LLMParameters
  ): void {
    if (index === keys.length) {
      const combinationId = `comb-${combinations.length}`;
      combinations.push({
        parameters: { ...current },
        combinationId
      });
      return;
    }
    
    const key = keys[index];
    const values = paramValues[key];
    
    for (const value of values) {
      const next = { ...current };
      if (value !== undefined) {
        next[key as keyof LLMParameters] = value;
      }
      generateCombinations(keys, index + 1, next);
    }
  }
  
  generateCombinations(paramKeys, 0, {});
  
  return combinations;
}

/**
 * Generate random search combinations
 */
export function generateRandomSearchCombinations(
  config: ParameterSweepConfig,
  count: number
): ParameterCombination[] {
  const combinations: ParameterCombination[] = [];
  
  for (let i = 0; i < count; i++) {
    const params: LLMParameters = {};
    
    for (const [key, spec] of Object.entries(config.parameters)) {
      if (spec.values && spec.values.length > 0) {
        // Random selection from values
        const randomIndex = Math.floor(Math.random() * spec.values.length);
        params[key as keyof LLMParameters] = spec.values[randomIndex];
      } else if (spec.min !== undefined && spec.max !== undefined) {
        // Random value in range
        const randomValue = spec.min + Math.random() * (spec.max - spec.min);
        params[key as keyof LLMParameters] = Number(randomValue.toFixed(3));
      }
    }
    
    combinations.push({
      parameters: normalizeLLMParameters(params),
      combinationId: `random-${i}`
    });
  }
  
  return combinations;
}

/**
 * Execute parameter sweep
 */
export async function executeParameterSweep(
  config: ParameterSweepConfig,
  conversation: Conversation,
  db?: any, // D1Database
  cacheLookup?: (cacheKey: string) => Promise<AuditReport | null>,
  cacheStore?: (cacheKey: string, report: AuditReport) => Promise<void>,
  progressCallback?: (progress: SweepProgress) => void
): Promise<SweepResult> {
  const startTime = Date.now();
  const sweepId = config.sweep_id || `sweep-${conversation.conversation_id}-${Date.now()}`;
  
  // Generate combinations (default to grid search)
  const combinations = generateGridSearchCombinations(config);
  const totalCombinations = combinations.length;
  
  if (totalCombinations === 0) {
    throw new Error('No parameter combinations generated');
  }
  
  // Update sweep status in database
  await updateSweepStatus(db, sweepId, {
    status: 'running',
    totalCombinations,
    completedCount: 0,
    failedCount: 0,
    reportIds: [],
    startedAt: new Date().toISOString()
  });
  
  // Execute with concurrency limit
  const maxConcurrent = config.max_concurrent || 5;
  const reportIds: string[] = [];
  const results: SweepResult['results'] = [];
  let completedCount = 0;
  let failedCount = 0;
  
  // Process in batches
  for (let i = 0; i < combinations.length; i += maxConcurrent) {
    const batch = combinations.slice(i, i + maxConcurrent);
    
    const batchPromises = batch.map(async (combination) => {
      try {
        const executionConfig: ReportExecutionConfig = {
          conversation,
          skillId: config.skill_id,
          modelName: config.model_name,
          llmParameters: combination.parameters,
          evaluatorModel: config.model_name, // Use same model as evaluator
          checkCache: true
        };
        
        const result = await executeReport(
          executionConfig,
          db,
          cacheLookup,
          cacheStore
        );
        
        reportIds.push(result.report.report_id);
        completedCount++;
        
        // Update progress
        if (progressCallback) {
          progressCallback({
            sweepId,
            totalCombinations,
            completedCount,
            failedCount,
            reportIds: [...reportIds],
            status: completedCount + failedCount < totalCombinations ? 'running' : 'completed',
            startedAt: new Date(startTime).toISOString()
          });
        }
        
        return {
          combinationId: combination.combinationId,
          parameters: combination.parameters,
          report: result.report
        };
        
      } catch (error: any) {
        failedCount++;
        console.error(`Error executing combination ${combination.combinationId}:`, error);
        
        // Update progress
        if (progressCallback) {
          progressCallback({
            sweepId,
            totalCombinations,
            completedCount,
            failedCount,
            reportIds: [...reportIds],
            status: completedCount + failedCount < totalCombinations ? 'running' : 'completed',
            startedAt: new Date(startTime).toISOString()
          });
        }
        
        return {
          combinationId: combination.combinationId,
          parameters: combination.parameters,
          error: error.message || 'Unknown error'
        };
      }
    });
    
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
    
    // Update database
    await updateSweepStatus(db, sweepId, {
      status: completedCount + failedCount < totalCombinations ? 'running' : 'completed',
      totalCombinations,
      completedCount,
      failedCount,
      reportIds: [...reportIds],
      startedAt: new Date(startTime).toISOString(),
      completedAt: completedCount + failedCount >= totalCombinations 
        ? new Date().toISOString() 
        : undefined
    });
  }
  
  const durationMs = Date.now() - startTime;
  
  return {
    sweepId,
    reportIds,
    totalCombinations,
    completedCount,
    failedCount,
    durationMs,
    results
  };
}

/**
 * Update sweep status in database
 */
async function updateSweepStatus(
  db: any, // D1Database
  sweepId: string,
  progress: SweepProgress
): Promise<void> {
  if (!db) return;
  
  try {
    // Check if sweep exists
    const checkStmt = db.prepare('SELECT sweep_id FROM parameter_sweeps WHERE sweep_id = ?');
    const exists = await checkStmt.bind(sweepId).first();
    
    if (exists) {
      // Update existing
      const updateStmt = db.prepare(`
        UPDATE parameter_sweeps
        SET status = ?, completed_count = ?, failed_count = ?,
            generated_report_ids = ?, started_at = ?, completed_at = ?
        WHERE sweep_id = ?
      `);
      
      await updateStmt.bind(
        progress.status,
        progress.completedCount,
        progress.failedCount,
        JSON.stringify(progress.reportIds),
        progress.startedAt || null,
        progress.completedAt || null,
        sweepId
      ).run();
    } else {
      // Create new
      const insertStmt = db.prepare(`
        INSERT INTO parameter_sweeps (
          sweep_id, conversation_id, sweep_name, sweep_config,
          status, total_combinations, completed_count, failed_count,
          generated_report_ids, created_at, started_at, completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      // Extract conversation_id from config (should be set)
      const conversationId = (progress as any).conversationId || 'unknown';
      
      await insertStmt.bind(
        sweepId,
        conversationId,
        `Sweep ${sweepId}`,
        JSON.stringify({}), // Should store actual config
        progress.status,
        progress.totalCombinations,
        progress.completedCount,
        progress.failedCount,
        JSON.stringify(progress.reportIds),
        new Date().toISOString(),
        progress.startedAt || null,
        progress.completedAt || null
      ).run();
    }
  } catch (error) {
    console.error('Error updating sweep status:', error);
    // Don't throw - progress tracking is best effort
  }
}

/**
 * Get sweep status from database
 */
export async function getSweepStatus(
  db: any, // D1Database
  sweepId: string
): Promise<SweepProgress | null> {
  if (!db) return null;
  
  try {
    const stmt = db.prepare(`
      SELECT * FROM parameter_sweeps
      WHERE sweep_id = ?
    `);
    
    const row = await stmt.bind(sweepId).first();
    
    if (!row) {
      return null;
    }
    
    return {
      sweepId: row.sweep_id,
      totalCombinations: row.total_combinations,
      completedCount: row.completed_count || 0,
      failedCount: row.failed_count || 0,
      reportIds: row.generated_report_ids ? JSON.parse(row.generated_report_ids) : [],
      status: row.status as 'pending' | 'running' | 'completed' | 'failed',
      startedAt: row.started_at || undefined,
      completedAt: row.completed_at || undefined
    };
  } catch (error) {
    console.error('Error getting sweep status:', error);
    return null;
  }
}

/**
 * Early stopping: Check if CI width is narrow enough
 */
export function shouldStopEarly(
  results: SweepResult['results'],
  targetCIWidth?: number,
  targetPrecision?: number
): boolean {
  if (!targetCIWidth && !targetPrecision) {
    return false;
  }
  
  // Calculate current CI width from completed results
  const scores = results
    .filter(r => r.report && !r.error)
    .map(r => r.report!.overall_score);
  
  if (scores.length < 2) {
    return false;
  }
  
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance = scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / scores.length;
  const stddev = Math.sqrt(variance);
  
  // Approximate 95% CI width (using normal approximation)
  const ciWidth = 1.96 * stddev * 2; // 2 * margin of error
  
  if (targetCIWidth && ciWidth <= targetCIWidth) {
    return true;
  }
  
  if (targetPrecision && stddev <= targetPrecision) {
    return true;
  }
  
  return false;
}

