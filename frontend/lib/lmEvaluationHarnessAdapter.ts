/**
 * lm-evaluation-harness Integration Adapter
 * 
 * Integrates with the lm-evaluation-harness framework to run standard
 * evaluations and export results to audit_reports format.
 * 
 * Reference: https://github.com/EleutherAI/lm-evaluation-harness
 * 
 * This adapter provides a bridge between lm-evaluation-harness and our
 * audit report system, enabling:
 * - Running standard evaluations through the harness
 * - Converting results to audit_reports format
 * - Comparing with other evaluation systems
 * - Supporting standard evaluation metrics
 */

import { AuditReport, Conversation, LLMParameters } from '../types';
import { executeReport, ReportExecutionConfig } from './reportExecutor';

export interface LMHarnessTask {
  task_name: string;
  task_type: 'multiple_choice' | 'generation' | 'classification' | 'perplexity';
  dataset_name: string;
  dataset_config?: string;
  num_fewshot?: number;
  batch_size?: number;
}

export interface LMHarnessEvaluationConfig {
  model: string;
  model_args?: string; // Model arguments string (e.g., "pretrained=model_name")
  tasks: LMHarnessTask[];
  limit?: number; // Limit number of examples
  output_path?: string;
  log_samples?: boolean;
  llm_parameters?: LLMParameters; // Our LLM parameters to map to harness
}

export interface LMHarnessResult {
  task_name: string;
  dataset_name: string;
  results: {
    [metric: string]: number | string;
  };
  samples?: Array<{
    request: any;
    response: any;
    metrics: { [key: string]: any };
  }>;
  config: {
    model: string;
    model_args: string;
    num_fewshot: number;
    batch_size: number;
    limit?: number;
  };
}

export interface LMHarnessEvaluationSummary {
  model: string;
  tasks_evaluated: number;
  total_samples: number;
  results: LMHarnessResult[];
  aggregate_metrics: {
    [metric: string]: {
      mean: number;
      stddev?: number;
      min?: number;
      max?: number;
    };
  };
  evaluation_timestamp: string;
}

/**
 * Map lm-evaluation-harness task to our conversation format
 * 
 * Note: This is a simplified mapping. Full implementation would handle
 * all task types and dataset formats.
 */
function harnessTaskToConversations(
  task: LMHarnessTask,
  samples: any[]
): Conversation[] {
  const conversations: Conversation[] = [];
  
  for (const sample of samples) {
    let userContent = '';
    let assistantContent = '';
    
    if (task.task_type === 'multiple_choice') {
      // Multiple choice format: question + choices
      userContent = sample.input || sample.question || '';
      if (sample.choices) {
        userContent += '\n\nChoices:\n' + sample.choices.map((c: string, i: number) => 
          `${String.fromCharCode(65 + i)}. ${c}`
        ).join('\n');
      }
      assistantContent = sample.target || sample.answer || '';
    } else if (task.task_type === 'generation') {
      // Generation format: prompt -> response
      userContent = sample.input || sample.prompt || '';
      assistantContent = sample.target || sample.output || '';
    } else if (task.task_type === 'classification') {
      // Classification format: text -> label
      userContent = sample.input || sample.text || '';
      assistantContent = sample.target || sample.label || '';
    }
    
    conversations.push({
      conversation_id: `harness_${task.task_name}_${sample.id || Date.now()}`,
      turns: [
        {
          turn_number: 1,
          role: 'user',
          content: userContent,
          timestamp: new Date().toISOString()
        },
        ...(assistantContent ? [{
          turn_number: 2,
          role: 'assistant',
          content: assistantContent,
          timestamp: new Date().toISOString()
        }] : [])
      ],
      metadata: {
        domain: task.dataset_name,
        tags: ['lm_evaluation_harness', task.task_name, task.task_type]
      }
    });
  }
  
  return conversations;
}

/**
 * Map our LLM parameters to lm-evaluation-harness format
 */
function mapLLMParametersToHarness(
  params: LLMParameters
): Record<string, any> {
  const harnessArgs: Record<string, any> = {};
  
  // Map temperature
  if (params.temperature !== undefined) {
    harnessArgs.temperature = params.temperature;
  }
  
  // Map top_p
  if (params.top_p !== undefined) {
    harnessArgs.top_p = params.top_p;
  }
  
  // Map top_k
  if (params.top_k !== undefined) {
    harnessArgs.top_k = params.top_k;
  }
  
  // Map max_tokens
  if (params.max_tokens !== undefined) {
    harnessArgs.max_tokens = params.max_tokens;
  }
  
  // Map seed
  if (params.seed !== undefined) {
    harnessArgs.seed = params.seed;
  }
  
  return harnessArgs;
}

/**
 * Convert lm-evaluation-harness result to AuditReport format
 */
export function convertHarnessResultToAuditReport(
  harnessResult: LMHarnessResult,
  conversation: Conversation,
  skillId: string,
  modelName: string,
  llmParameters: LLMParameters
): AuditReport {
  // Extract overall score from harness metrics
  // Common metrics: accuracy, f1, bleu, rouge, perplexity, etc.
  let overallScore = 0;
  
  if (harnessResult.results.accuracy !== undefined) {
    overallScore = harnessResult.results.accuracy as number;
  } else if (harnessResult.results.f1 !== undefined) {
    overallScore = harnessResult.results.f1 as number;
  } else if (harnessResult.results.bleu !== undefined) {
    overallScore = (harnessResult.results.bleu as number) / 100; // Normalize to 0-1
  } else if (harnessResult.results.rouge !== undefined) {
    overallScore = (harnessResult.results.rouge as number) / 100; // Normalize to 0-1
  } else if (harnessResult.results.perplexity !== undefined) {
    // Lower perplexity is better, so invert and normalize
    const perplexity = harnessResult.results.perplexity as number;
    overallScore = Math.max(0, 1 - (perplexity / 100)); // Rough normalization
  }
  
  // Determine confidence based on score
  let confidence: 'low' | 'medium' | 'high' = 'low';
  if (overallScore >= 0.7) {
    confidence = 'high';
  } else if (overallScore >= 0.4) {
    confidence = 'medium';
  }
  
  // Generate report ID
  const reportId = `harness_${harnessResult.task_name}_${conversation.conversation_id}_${Date.now()}`;
  
  return {
    report_id: reportId,
    conversation_id: conversation.conversation_id,
    skill_id: skillId,
    model_name: modelName,
    overall_score: overallScore,
    confidence,
    detected_types: [],
    metrics: {
      ...harnessResult.results,
      task_name: harnessResult.task_name,
      dataset_name: harnessResult.dataset_name,
      task_type: harnessResult.config.num_fewshot > 0 ? 'fewshot' : 'zero_shot'
    },
    recommendations: [],
    limitations: [
      'Evaluation performed via lm-evaluation-harness adapter',
      'Results may differ from direct model evaluation'
    ],
    usage: {
      prompt_tokens: 0, // Would be populated from actual API response
      candidates_tokens: 0,
      total_tokens: 0
    },
    llm_parameters: llmParameters,
    skill_version: '1.0.0',
    created_at: new Date().toISOString(),
    conversation_snapshot: conversation,
    tags: ['lm_evaluation_harness', harnessResult.task_name],
    notes: `lm-evaluation-harness task: ${harnessResult.task_name}, dataset: ${harnessResult.dataset_name}`
  };
}

/**
 * Run evaluation through lm-evaluation-harness (simulated)
 * 
 * Note: Full implementation would call the actual lm-evaluation-harness
 * Python library or API. This is a placeholder that demonstrates the
 * integration pattern.
 * 
 * For actual integration, you would:
 * 1. Call lm-evaluation-harness Python library via subprocess or API
 * 2. Parse the JSON results
 * 3. Convert to our format
 */
export async function runLMHarnessEvaluation(
  config: LMHarnessEvaluationConfig
): Promise<LMHarnessEvaluationSummary> {
  // TODO: Actual implementation would call lm-evaluation-harness
  // Example:
  /*
  const { spawn } = require('child_process');
  const harnessProcess = spawn('lm_eval', [
    '--model', config.model,
    '--model_args', config.model_args || '',
    '--tasks', config.tasks.map(t => t.task_name).join(','),
    '--output_path', config.output_path || '/tmp/harness_results.json',
    '--log_samples', config.log_samples ? 'true' : 'false',
    ...(config.limit ? ['--limit', config.limit.toString()] : [])
  ]);
  
  // Wait for completion and parse results
  const results = await parseHarnessOutput(config.output_path);
  */
  
  // Placeholder: Return empty results
  console.warn('lm-evaluation-harness integration requires Python environment and harness installation.');
  console.warn('See WILDChat_DATASET_README.md for integration instructions.');
  
  return {
    model: config.model,
    tasks_evaluated: 0,
    total_samples: 0,
    results: [],
    aggregate_metrics: {},
    evaluation_timestamp: new Date().toISOString()
  };
}

/**
 * Run evaluation and convert results to audit reports
 */
export async function runHarnessEvaluationAsAuditReports(
  config: LMHarnessEvaluationConfig,
  skillId: string = 'lm_harness_evaluation'
): Promise<AuditReport[]> {
  // Run harness evaluation
  const summary = await runLMHarnessEvaluation(config);
  
  // Convert each result to audit report
  const auditReports: AuditReport[] = [];
  
  for (const result of summary.results) {
    // Find corresponding task config
    const taskConfig = config.tasks.find(t => t.task_name === result.task_name);
    if (!taskConfig) continue;
    
    // Convert samples to conversations
    if (result.samples && result.samples.length > 0) {
      const conversations = harnessTaskToConversations(taskConfig, result.samples);
      
      for (const conversation of conversations) {
        const auditReport = convertHarnessResultToAuditReport(
          result,
          conversation,
          skillId,
          config.model,
          config.llm_parameters || {}
        );
        auditReports.push(auditReport);
      }
    } else {
      // Create placeholder conversation if no samples
      const conversation: Conversation = {
        conversation_id: `harness_${result.task_name}_placeholder`,
        turns: [{
          turn_number: 1,
          role: 'user',
          content: `Task: ${result.task_name}`,
          timestamp: new Date().toISOString()
        }],
        metadata: {
          domain: result.dataset_name,
          tags: ['lm_evaluation_harness', result.task_name]
        }
      };
      
      const auditReport = convertHarnessResultToAuditReport(
        result,
        conversation,
        skillId,
        config.model,
        config.llm_parameters || {}
      );
      auditReports.push(auditReport);
    }
  }
  
  return auditReports;
}

/**
 * Compare harness results with our audit reports
 */
export interface HarnessComparisonResult {
  task_name: string;
  harness_score: number;
  audit_score: number;
  difference: number;
  relative_difference: number;
  metrics_comparison: {
    [metric: string]: {
      harness: number | string;
      audit: number | string;
      difference: number | string;
    };
  };
}

export function compareHarnessWithAuditReports(
  harnessResults: LMHarnessResult[],
  auditReports: AuditReport[]
): HarnessComparisonResult[] {
  const comparisons: HarnessComparisonResult[] = [];
  
  // Group audit reports by task
  const auditByTask = new Map<string, AuditReport[]>();
  auditReports.forEach(report => {
    const taskName = report.metrics?.task_name as string || 'unknown';
    if (!auditByTask.has(taskName)) {
      auditByTask.set(taskName, []);
    }
    auditByTask.get(taskName)!.push(report);
  });
  
  // Compare each harness result with corresponding audit reports
  for (const harnessResult of harnessResults) {
    const taskAudits = auditByTask.get(harnessResult.task_name) || [];
    
    if (taskAudits.length === 0) {
      // No corresponding audit reports
      continue;
    }
    
    // Calculate average audit score
    const avgAuditScore = taskAudits.reduce((sum, r) => sum + r.overall_score, 0) / taskAudits.length;
    
    // Extract harness score
    let harnessScore = 0;
    if (harnessResult.results.accuracy !== undefined) {
      harnessScore = harnessResult.results.accuracy as number;
    } else if (harnessResult.results.f1 !== undefined) {
      harnessScore = harnessResult.results.f1 as number;
    }
    
    const difference = harnessScore - avgAuditScore;
    const relativeDifference = harnessScore > 0 ? difference / harnessScore : 0;
    
    // Compare individual metrics
    const metricsComparison: Record<string, { harness: number | string; audit: number | string; difference: number | string }> = {};
    
    Object.keys(harnessResult.results).forEach(metric => {
      const harnessValue = harnessResult.results[metric];
      // Find corresponding metric in audit reports
      const auditValue = taskAudits[0]?.metrics?.[metric] || 0;
      
      metricsComparison[metric] = {
        harness: harnessValue,
        audit: auditValue,
        difference: typeof harnessValue === 'number' && typeof auditValue === 'number'
          ? harnessValue - auditValue
          : 'N/A'
      };
    });
    
    comparisons.push({
      task_name: harnessResult.task_name,
      harness_score: harnessScore,
      audit_score: avgAuditScore,
      difference,
      relative_difference: relativeDifference,
      metrics_comparison: metricsComparison
    });
  }
  
  return comparisons;
}

/**
 * Export harness results to standard format
 */
export function exportHarnessResultsToJSON(summary: LMHarnessEvaluationSummary): string {
  return JSON.stringify(summary, null, 2);
}

/**
 * Export harness results to CSV
 */
export function exportHarnessResultsToCSV(summary: LMHarnessEvaluationSummary): string {
  const headers = ['task_name', 'dataset_name', 'model', ...Object.keys(summary.aggregate_metrics)];
  const rows: string[] = [];
  
  summary.results.forEach(result => {
    const row = [
      result.task_name,
      result.dataset_name,
      summary.model,
      ...Object.keys(summary.aggregate_metrics).map(metric => {
        const value = summary.aggregate_metrics[metric].mean;
        return value.toString();
      })
    ];
    rows.push(row.map(cell => `"${cell.toString().replace(/"/g, '""')}"`).join(','));
  });
  
  return [
    headers.map(h => `"${h}"`).join(','),
    ...rows
  ].join('\n');
}

