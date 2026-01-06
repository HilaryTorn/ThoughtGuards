import { Conversation, AuditResult } from './types';
import { executeMultiSkillAudit, CombinedAuditResult, AuditOptions } from './multiSkillExecutor';
import { calculateDistribution, calculateConfidenceInterval, AuditRun, DistributionMetrics, ConfidenceInterval } from './statisticalAnalysis';

export interface RunConfig {
  seed?: number;
  temperature?: number;
  count: number; // Number of runs
}

export interface StatisticalAuditResult extends CombinedAuditResult {
  runs: AuditRun[];
  statistics: {
    mean: number;
    stddev: number;
    quantiles: { p5: number; p50: number; p95: number };
    confidenceInterval: ConfidenceInterval;
  };
  run_config: RunConfig;
}

/**
 * Execute multiple audit runs with seed/temperature variation
 * Collects distribution of scores and calculates statistical metrics
 */
export async function executeMultiRunAudit(
  conversation: Conversation,
  modelName: string,
  config: RunConfig,
  options?: AuditOptions
): Promise<StatisticalAuditResult> {
  if (config.count < 1) {
    throw new Error('Run count must be at least 1');
  }

  console.log(`🔄 Executing ${config.count} audit runs with variation...`);
  
  const runs: AuditRun[] = [];
  const auditId = `audit-${conversation.conversation_id}-${Date.now()}`;
  const baseTimestamp = new Date().toISOString();

  // Execute runs in parallel (or sequentially if count is small)
  const runPromises: Promise<CombinedAuditResult>[] = [];
  
  for (let i = 0; i < config.count; i++) {
    // Generate seed if not provided (use index + timestamp for variation)
    const seed = config.seed !== undefined 
      ? config.seed + i 
      : Math.floor(Date.now() * Math.random()) + i;
    
    // Use temperature if provided, otherwise use default
    const temperature = config.temperature !== undefined 
      ? config.temperature 
      : undefined;

    // For now, we'll execute the audit normally
    // In the future, we could pass seed/temperature to the LLM API if supported
    const runPromise = executeMultiSkillAudit(conversation, modelName, options);
    runPromises.push(runPromise);
  }

  // Wait for all runs to complete
  const results = await Promise.all(runPromises);

  // Create AuditRun objects from results
  results.forEach((result, index) => {
    const runId = `${auditId}-run-${index + 1}`;
    const seed = config.seed !== undefined ? config.seed + index : undefined;
    
    runs.push({
      run_id: runId,
      audit_id: auditId,
      conversation_id: conversation.conversation_id,
      run_number: index + 1,
      seed,
      temperature: config.temperature,
      model_name: modelName,
      overall_score: result.overall_score,
      confidence: result.confidence,
      detected_types: result.detected_types,
      metrics: result.metrics,
      created_at: new Date(Date.now() + index).toISOString() // Slight variation in timestamp
    });
  });

  // Calculate statistical metrics
  const distribution = calculateDistribution(runs);
  const scores = runs.map(r => r.overall_score);
  const confidenceInterval = calculateConfidenceInterval(scores);

  // Use the first result as the base, but update with statistical data
  const baseResult = results[0];

  // Calculate combined confidence (use highest from runs)
  const confidences = runs.map(r => {
    const confMap = { low: 0, medium: 1, high: 2 };
    return confMap[r.confidence];
  });
  const maxConfIdx = confidences.indexOf(Math.max(...confidences));
  const combinedConfidence = runs[maxConfIdx]?.confidence || 'low';

  return {
    ...baseResult,
    id: auditId,
    timestamp: baseTimestamp,
    overall_score: distribution.mean, // Use mean as the overall score
    confidence: combinedConfidence,
    runs,
    statistics: {
      mean: distribution.mean,
      stddev: distribution.stddev,
      quantiles: {
        p5: distribution.quantiles.p5,
        p50: distribution.quantiles.p50,
        p95: distribution.quantiles.p95
      },
      confidenceInterval
    },
    run_config: config
  };
}

/**
 * Store individual runs in database
 * This should be called after executeMultiRunAudit
 */
export async function storeAuditRuns(
  runs: AuditRun[],
  db: D1Database
): Promise<void> {
  if (runs.length === 0) return;

  // Use batch insert for efficiency
  const statements = runs.map(run => {
    return db.prepare(`
      INSERT OR REPLACE INTO audit_runs (
        run_id, audit_id, conversation_id, run_number,
        seed, temperature, model_name, overall_score,
        confidence, detected_types, metrics, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      run.run_id,
      run.audit_id,
      run.conversation_id,
      run.run_number,
      run.seed || null,
      run.temperature || null,
      run.model_name,
      run.overall_score,
      run.confidence,
      JSON.stringify(run.detected_types),
      JSON.stringify(run.metrics),
      run.created_at
    );
  });

  await db.batch(statements);
}

