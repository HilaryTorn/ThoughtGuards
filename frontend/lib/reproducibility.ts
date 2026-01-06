import { AuditReport, AggregateReport } from '../types';
import { serializeLLMParameters } from './llmParameterTracker';

/**
 * Reproducibility infrastructure: Generate reproducibility reports,
 * include all parameters/seeds/fingerprints, link to bootstrap samples,
 * export reproducibility packages.
 */

export interface ReproducibilityReport {
  report_id: string;
  conversation_id?: string;
  aggregate_id?: string;
  created_at: string;
  parameters: {
    llm_parameters: string; // Serialized JSON
    skill_id: string;
    skill_version: string;
    model_name: string;
    evaluator_model: string;
    evaluation_seed?: number;
    prompt_version: string;
    prompt_hash: string;
  };
  fingerprints: {
    system_fingerprint?: string;
    response_hash?: string;
    prompt_hash: string;
  };
  seeds: {
    evaluation_seed?: number;
    llm_seed?: number;
  };
  bootstrap_samples?: {
    bootstrap_id?: string;
    sample_count: number;
    method: string;
  };
  reproducibility_score: number; // 0-1, higher = more reproducible
  reproducibility_assessment: 'high' | 'medium' | 'low';
  missing_elements: string[];
  recommendations: string[];
}

/**
 * Generate reproducibility report for a single audit report
 */
export function generateReproducibilityReport(
  report: AuditReport
): ReproducibilityReport {
  const missingElements: string[] = [];
  let reproducibilityScore = 1.0;
  
  // Check for required reproducibility elements
  if (!report.evaluation_seed) {
    missingElements.push('evaluation_seed');
    reproducibilityScore -= 0.2;
  }
  
  if (!report.llm_parameters.seed) {
    missingElements.push('llm_seed');
    reproducibilityScore -= 0.1;
  }
  
  if (!report.system_fingerprint) {
    missingElements.push('system_fingerprint');
    reproducibilityScore -= 0.1;
  }
  
  if (!report.prompt_hash) {
    missingElements.push('prompt_hash');
    reproducibilityScore -= 0.2;
  }
  
  if (!report.response_hash) {
    missingElements.push('response_hash');
    reproducibilityScore -= 0.1;
  }
  
  // Clamp score to [0, 1]
  reproducibilityScore = Math.max(0, Math.min(1, reproducibilityScore));
  
  // Assess reproducibility level
  let assessment: 'high' | 'medium' | 'low';
  if (reproducibilityScore >= 0.8) {
    assessment = 'high';
  } else if (reproducibilityScore >= 0.5) {
    assessment = 'medium';
  } else {
    assessment = 'low';
  }
  
  // Generate recommendations
  const recommendations: string[] = [];
  if (missingElements.includes('evaluation_seed')) {
    recommendations.push('Set evaluation_seed for reproducible evaluation runs');
  }
  if (missingElements.includes('llm_seed')) {
    recommendations.push('Set seed in llm_parameters for reproducible LLM outputs');
  }
  if (missingElements.includes('system_fingerprint')) {
    recommendations.push('Track system_fingerprint to detect model version changes');
  }
  if (missingElements.includes('prompt_hash')) {
    recommendations.push('Generate prompt_hash to verify prompt consistency');
  }
  
  if (recommendations.length === 0) {
    recommendations.push('All reproducibility elements present. Report is fully reproducible.');
  }
  
  return {
    report_id: `reproducibility-${report.report_id}-${Date.now()}`,
    conversation_id: report.conversation_id,
    created_at: new Date().toISOString(),
    parameters: {
      llm_parameters: serializeLLMParameters(report.llm_parameters),
      skill_id: report.skill_id,
      skill_version: report.skill_version,
      model_name: report.model_name,
      evaluator_model: report.evaluator_model,
      evaluation_seed: report.evaluation_seed,
      prompt_version: report.prompt_version,
      prompt_hash: report.prompt_hash
    },
    fingerprints: {
      system_fingerprint: report.system_fingerprint,
      response_hash: report.response_hash,
      prompt_hash: report.prompt_hash
    },
    seeds: {
      evaluation_seed: report.evaluation_seed,
      llm_seed: report.llm_parameters.seed
    },
    reproducibility_score: reproducibilityScore,
    reproducibility_assessment: assessment,
    missing_elements: missingElements,
    recommendations
  };
}

/**
 * Generate reproducibility report for aggregate report
 */
export function generateAggregateReproducibilityReport(
  aggregate: AggregateReport,
  sourceReports: AuditReport[]
): ReproducibilityReport {
  // Check reproducibility of all source reports
  const sourceReproducibility = sourceReports.map(r => generateReproducibilityReport(r));
  const avgScore = sourceReproducibility.reduce((sum, r) => sum + r.reproducibility_score, 0) / sourceReproducibility.length;
  
  // Collect all missing elements
  const allMissing = new Set<string>();
  for (const r of sourceReproducibility) {
    for (const elem of r.missing_elements) {
      allMissing.add(elem);
    }
  }
  
  // Check if all reports have same parameters (important for reproducibility)
  const paramConsistency = checkParameterConsistency(sourceReports);
  
  let assessment: 'high' | 'medium' | 'low';
  if (avgScore >= 0.8 && paramConsistency) {
    assessment = 'high';
  } else if (avgScore >= 0.5) {
    assessment = 'medium';
  } else {
    assessment = 'low';
  }
  
  const recommendations: string[] = [];
  if (!paramConsistency) {
    recommendations.push('Source reports have inconsistent parameters. Ensure all reports use same parameter configuration for reproducibility.');
  }
  if (allMissing.size > 0) {
    recommendations.push(`Missing reproducibility elements: ${Array.from(allMissing).join(', ')}`);
  }
  
  return {
    report_id: `reproducibility-${aggregate.aggregate_id}-${Date.now()}`,
    aggregate_id: aggregate.aggregate_id,
    created_at: new Date().toISOString(),
    parameters: {
      llm_parameters: 'mixed', // Multiple parameter sets
      skill_id: 'mixed', // Could be multiple skills
      skill_version: 'mixed',
      model_name: 'mixed',
      evaluator_model: 'mixed',
      prompt_version: 'mixed',
      prompt_hash: 'mixed'
    },
    fingerprints: {
      prompt_hash: 'mixed'
    },
    seeds: {},
    reproducibility_score: avgScore,
    reproducibility_assessment: assessment,
    missing_elements: Array.from(allMissing),
    recommendations
  };
}

/**
 * Check if all reports have consistent parameters
 */
function checkParameterConsistency(reports: AuditReport[]): boolean {
  if (reports.length <= 1) return true;
  
  const first = reports[0];
  const firstParams = serializeLLMParameters(first.llm_parameters);
  
  for (let i = 1; i < reports.length; i++) {
    const otherParams = serializeLLMParameters(reports[i].llm_parameters);
    if (otherParams !== firstParams) {
      return false;
    }
  }
  
  return true;
}

/**
 * Export reproducibility package
 * Includes all data needed to reproduce the results
 */
export interface ReproducibilityPackage {
  package_id: string;
  created_at: string;
  reports: AuditReport[];
  aggregate_reports?: AggregateReport[];
  metadata: {
    total_reports: number;
    conversation_ids: string[];
    skill_ids: string[];
    model_names: string[];
  };
  parameters_summary: {
    unique_parameter_combinations: number;
    parameter_ranges: Record<string, { min: number; max: number }>;
  };
  reproducibility_report: ReproducibilityReport;
  export_format: 'json' | 'zip' | 'tar';
}

/**
 * Create reproducibility package
 */
export function createReproducibilityPackage(
  reports: AuditReport[],
  aggregateReports?: AggregateReport[]
): ReproducibilityPackage {
  const packageId = `repro-package-${Date.now()}`;
  
  // Collect metadata
  const conversationIds = [...new Set(reports.map(r => r.conversation_id))];
  const skillIds = [...new Set(reports.map(r => r.skill_id))];
  const modelNames = [...new Set(reports.map(r => r.model_name))];
  
  // Analyze parameter ranges
  const paramRanges: Record<string, { min: number; max: number }> = {};
  const paramKeys = new Set<string>();
  
  for (const report of reports) {
    for (const [key, value] of Object.entries(report.llm_parameters)) {
      if (typeof value === 'number') {
        paramKeys.add(key);
        if (!paramRanges[key]) {
          paramRanges[key] = { min: value, max: value };
        } else {
          paramRanges[key].min = Math.min(paramRanges[key].min, value);
          paramRanges[key].max = Math.max(paramRanges[key].max, value);
        }
      }
    }
  }
  
  // Count unique parameter combinations
  const uniqueCombinations = new Set(
    reports.map(r => serializeLLMParameters(r.llm_parameters))
  ).size;
  
  // Generate reproducibility report (use first report as representative)
  const reproducibilityReport = reports.length > 0
    ? generateReproducibilityReport(reports[0])
    : {
        report_id: packageId,
        created_at: new Date().toISOString(),
        parameters: {} as any,
        fingerprints: { prompt_hash: '' },
        seeds: {},
        reproducibility_score: 0,
        reproducibility_assessment: 'low' as const,
        missing_elements: [],
        recommendations: []
      };
  
  return {
    package_id: packageId,
    created_at: new Date().toISOString(),
    reports,
    aggregate_reports: aggregateReports,
    metadata: {
      total_reports: reports.length,
      conversation_ids: conversationIds,
      skill_ids: skillIds,
      model_names: modelNames
    },
    parameters_summary: {
      unique_parameter_combinations: uniqueCombinations,
      parameter_ranges: paramRanges
    },
    reproducibility_report: reproducibilityReport,
    export_format: 'json'
  };
}

/**
 * Export reproducibility package as JSON
 */
export function exportReproducibilityPackageJSON(
  package: ReproducibilityPackage
): string {
  return JSON.stringify(package, null, 2);
}

/**
 * Link to bootstrap samples for reproducibility
 */
export async function linkBootstrapSamples(
  db: any, // D1Database
  reportId: string,
  bootstrapId?: string
): Promise<void> {
  if (!bootstrapId) return;
  
  try {
    // Store link in bootstrap_samples table
    const stmt = db.prepare(`
      UPDATE bootstrap_samples
      SET analysis_id = ?
      WHERE bootstrap_id = ?
    `);
    
    await stmt.bind(reportId, bootstrapId).run();
  } catch (error) {
    console.error('Error linking bootstrap samples:', error);
    // Don't throw - linking is best effort
  }
}

/**
 * Generate reproducibility checklist
 */
export function generateReproducibilityChecklist(
  report: AuditReport
): {
  checklist: Array<{ item: string; present: boolean; critical: boolean }>;
  score: number;
  ready_for_publication: boolean;
} {
  const checklist: Array<{ item: string; present: boolean; critical: boolean }> = [
    {
      item: 'LLM parameters fully specified',
      present: Object.keys(report.llm_parameters).length > 0,
      critical: true
    },
    {
      item: 'Evaluation seed set',
      present: report.evaluation_seed !== undefined,
      critical: true
    },
    {
      item: 'LLM seed set',
      present: report.llm_parameters.seed !== undefined,
      critical: false
    },
    {
      item: 'System fingerprint tracked',
      present: report.system_fingerprint !== undefined,
      critical: false
    },
    {
      item: 'Prompt hash generated',
      present: report.prompt_hash !== undefined && report.prompt_hash.length > 0,
      critical: true
    },
    {
      item: 'Response hash generated',
      present: report.response_hash !== undefined && report.response_hash.length > 0,
      critical: false
    },
    {
      item: 'Skill version specified',
      present: report.skill_version !== undefined && report.skill_version.length > 0,
      critical: true
    },
    {
      item: 'Model name specified',
      present: report.model_name !== undefined && report.model_name.length > 0,
      critical: true
    },
    {
      item: 'Timestamp recorded',
      present: report.created_at !== undefined && report.created_at.length > 0,
      critical: true
    }
  ];
  
  const criticalPresent = checklist.filter(c => c.critical && c.present).length;
  const criticalTotal = checklist.filter(c => c.critical).length;
  const allPresent = checklist.filter(c => c.present).length;
  
  const score = checklist.length > 0 ? allPresent / checklist.length : 0;
  const readyForPublication = criticalPresent === criticalTotal && score >= 0.8;
  
  return {
    checklist,
    score,
    ready_for_publication: readyForPublication
  };
}

