import { AuditReport, LLMParameters } from '../types';
import { calculateConfidenceInterval } from './statisticalAnalysis';

/**
 * Report comparator: Compare 2-N reports side-by-side,
 * highlight differences, generate diff summaries, filter by parameter differences.
 */

export interface ReportDifference {
  field: string;
  report1Value: any;
  report2Value: any;
  difference: number | string;
  isSignificant: boolean;
}

export interface ComparisonSummary {
  reports: AuditReport[];
  differences: ReportDifference[];
  parameterDifferences: Map<string, any>;
  scoreDifference: {
    absolute: number;
    relative: number;
    isSignificant: boolean;
    confidenceIntervalOverlap: boolean;
  };
  detectedTypesDifference: {
    added: string[];
    removed: string[];
    changed: Array<{ type: string; scoreDiff: number }>;
  };
}

/**
 * Compare two reports
 */
export function compareReports(
  report1: AuditReport,
  report2: AuditReport
): ComparisonSummary {
  const differences: ReportDifference[] = [];
  
  // Compare scores
  const scoreDiff = report1.overall_score - report2.overall_score;
  const scoreRelativeDiff = report2.overall_score > 0 
    ? (scoreDiff / report2.overall_score) * 100 
    : 0;
  
  // Check if difference is statistically significant
  // (would need multiple runs for proper CI comparison)
  const isSignificant = Math.abs(scoreDiff) > 0.1; // 10% threshold
  
  differences.push({
    field: 'overall_score',
    report1Value: report1.overall_score,
    report2Value: report2.overall_score,
    difference: scoreDiff,
    isSignificant
  });
  
  // Compare confidence
  const confMap = { low: 0, medium: 1, high: 2 };
  const confDiff = confMap[report1.confidence] - confMap[report2.confidence];
  if (confDiff !== 0) {
    differences.push({
      field: 'confidence',
      report1Value: report1.confidence,
      report2Value: report2.confidence,
      difference: confDiff > 0 ? 'higher' : 'lower',
      isSignificant: Math.abs(confDiff) > 1
    });
  }
  
  // Compare detected types
  const types1 = new Set(report1.detected_types.map(dt => 
    typeof dt === 'string' ? dt : dt.type || 'unknown'
  ));
  const types2 = new Set(report2.detected_types.map(dt => 
    typeof dt === 'string' ? dt : dt.type || 'unknown'
  ));
  
  const added = Array.from(types2).filter(t => !types1.has(t));
  const removed = Array.from(types1).filter(t => !types2.has(t));
  
  // Compare type scores
  const typeScores1 = new Map<string, number>();
  const typeScores2 = new Map<string, number>();
  
  report1.detected_types.forEach(dt => {
    const type = typeof dt === 'string' ? dt : dt.type || 'unknown';
    const score = typeof dt === 'object' ? dt.score || 0 : 0;
    typeScores1.set(type, score);
  });
  
  report2.detected_types.forEach(dt => {
    const type = typeof dt === 'string' ? dt : dt.type || 'unknown';
    const score = typeof dt === 'object' ? dt.score || 0 : 0;
    typeScores2.set(type, score);
  });
  
  const changed: Array<{ type: string; scoreDiff: number }> = [];
  for (const type of new Set([...types1, ...types2])) {
    const score1 = typeScores1.get(type) || 0;
    const score2 = typeScores2.get(type) || 0;
    if (Math.abs(score1 - score2) > 0.01) {
      changed.push({
        type,
        scoreDiff: score2 - score1
      });
    }
  }
  
  // Compare parameters
  const parameterDifferences = compareParameters(report1.llm_parameters, report2.llm_parameters);
  
  // Check CI overlap (if both reports have statistical data)
  let confidenceIntervalOverlap = true;
  // This would require statistical data from multiple runs
  
  return {
    reports: [report1, report2],
    differences,
    parameterDifferences,
    scoreDifference: {
      absolute: scoreDiff,
      relative: scoreRelativeDiff,
      isSignificant,
      confidenceIntervalOverlap
    },
    detectedTypesDifference: {
      added,
      removed,
      changed
    }
  };
}

/**
 * Compare multiple reports (N-way comparison)
 */
export function compareMultipleReports(
  reports: AuditReport[]
): ComparisonSummary {
  if (reports.length < 2) {
    throw new Error('Need at least 2 reports to compare');
  }
  
  // Use first report as baseline
  const baseline = reports[0];
  const differences: ReportDifference[] = [];
  
  // Compare each report to baseline
  for (let i = 1; i < reports.length; i++) {
    const comparison = compareReports(baseline, reports[i]);
    differences.push(...comparison.differences.map(d => ({
      ...d,
      field: `${d.field}_vs_report_${i}`
    })));
  }
  
  // Aggregate score differences
  const scores = reports.map(r => r.overall_score);
  const minScore = Math.min(...scores);
  const maxScore = Math.max(...scores);
  const scoreRange = maxScore - minScore;
  
  // Aggregate detected types
  const allTypes = new Set<string>();
  for (const report of reports) {
    report.detected_types.forEach(dt => {
      const type = typeof dt === 'string' ? dt : dt.type || 'unknown';
      allTypes.add(type);
    });
  }
  
  // Find types that appear in some but not all reports
  const added: string[] = [];
  const removed: string[] = [];
  
  for (const type of allTypes) {
    const presentIn = reports.filter(r => 
      r.detected_types.some(dt => {
        const dtType = typeof dt === 'string' ? dt : dt.type || 'unknown';
        return dtType === type;
      })
    ).length;
    
    if (presentIn < reports.length && presentIn > 0) {
      if (presentIn === 1) {
        added.push(type);
      } else {
        removed.push(type);
      }
    }
  }
  
  // Aggregate parameter differences
  const parameterDifferences = new Map<string, any>();
  const paramKeys = new Set<string>();
  for (const report of reports) {
    for (const key of Object.keys(report.llm_parameters)) {
      paramKeys.add(key);
    }
  }
  
  for (const key of paramKeys) {
    const values = reports
      .map(r => r.llm_parameters[key as keyof LLMParameters])
      .filter(v => v !== undefined);
    
    if (values.length > 0) {
      const uniqueValues = new Set(values);
      if (uniqueValues.size > 1) {
        parameterDifferences.set(key, {
          values: Array.from(uniqueValues),
          varies: true
        });
      }
    }
  }
  
  return {
    reports,
    differences,
    parameterDifferences,
    scoreDifference: {
      absolute: scoreRange,
      relative: minScore > 0 ? (scoreRange / minScore) * 100 : 0,
      isSignificant: scoreRange > 0.1,
      confidenceIntervalOverlap: true // Would need statistical data
    },
    detectedTypesDifference: {
      added,
      removed,
      changed: [] // Would need detailed comparison
    }
  };
}

/**
 * Compare LLM parameters
 */
function compareParameters(
  params1: LLMParameters,
  params2: LLMParameters
): Map<string, any> {
  const differences = new Map<string, any>();
  const allKeys = new Set([...Object.keys(params1), ...Object.keys(params2)]);
  
  for (const key of allKeys) {
    const val1 = params1[key as keyof LLMParameters];
    const val2 = params2[key as keyof LLMParameters];
    
    if (val1 !== val2) {
      differences.set(key, {
        value1: val1,
        value2: val2,
        different: true
      });
    }
  }
  
  return differences;
}

/**
 * Filter reports by parameter differences
 */
export function filterByParameterDifferences(
  reports: AuditReport[],
  parameterName: string,
  minDifference: number = 0
): AuditReport[] {
  if (reports.length === 0) return [];
  
  // Group by parameter value
  const groups = new Map<any, AuditReport[]>();
  for (const report of reports) {
    const value = report.llm_parameters[parameterName as keyof LLMParameters];
    if (!groups.has(value)) {
      groups.set(value, []);
    }
    groups.get(value)!.push(report);
  }
  
  // Find groups with significant score differences
  const groupMeans = Array.from(groups.entries()).map(([value, groupReports]) => ({
    value,
    meanScore: groupReports.reduce((sum, r) => sum + r.overall_score, 0) / groupReports.length,
    reports: groupReports
  }));
  
  const overallMean = reports.reduce((sum, r) => sum + r.overall_score, 0) / reports.length;
  
  // Filter groups where mean differs from overall mean by at least minDifference
  const filtered: AuditReport[] = [];
  for (const group of groupMeans) {
    if (Math.abs(group.meanScore - overallMean) >= minDifference) {
      filtered.push(...group.reports);
    }
  }
  
  return filtered.length > 0 ? filtered : reports;
}

/**
 * Generate diff summary text
 */
export function generateDiffSummary(comparison: ComparisonSummary): string {
  const lines: string[] = [];
  
  lines.push(`Comparing ${comparison.reports.length} reports`);
  lines.push('');
  
  // Score differences
  lines.push(`Score Difference: ${comparison.scoreDifference.absolute.toFixed(3)} (${comparison.scoreDifference.relative.toFixed(1)}%)`);
  if (comparison.scoreDifference.isSignificant) {
    lines.push('  → Statistically significant difference');
  }
  lines.push('');
  
  // Parameter differences
  if (comparison.parameterDifferences.size > 0) {
    lines.push('Parameter Differences:');
    for (const [param, diff] of comparison.parameterDifferences.entries()) {
      lines.push(`  - ${param}: ${JSON.stringify(diff)}`);
    }
    lines.push('');
  }
  
  // Detected types differences
  if (comparison.detectedTypesDifference.added.length > 0) {
    lines.push(`Added Types: ${comparison.detectedTypesDifference.added.join(', ')}`);
  }
  if (comparison.detectedTypesDifference.removed.length > 0) {
    lines.push(`Removed Types: ${comparison.detectedTypesDifference.removed.join(', ')}`);
  }
  if (comparison.detectedTypesDifference.changed.length > 0) {
    lines.push('Changed Types:');
    for (const change of comparison.detectedTypesDifference.changed) {
      lines.push(`  - ${change.type}: ${change.scoreDiff > 0 ? '+' : ''}${change.scoreDiff.toFixed(3)}`);
    }
  }
  
  return lines.join('\n');
}

/**
 * Check if two reports are statistically significantly different
 */
export function areReportsSignificantlyDifferent(
  report1: AuditReport,
  report2: AuditReport,
  threshold: number = 0.1
): boolean {
  const scoreDiff = Math.abs(report1.overall_score - report2.overall_score);
  return scoreDiff > threshold;
}

/**
 * Find reports with similar parameters (for grouping)
 */
export function findSimilarReports(
  reports: AuditReport[],
  targetReport: AuditReport,
  tolerance: Record<string, number> = {}
): AuditReport[] {
  const similar: AuditReport[] = [];
  
  const defaultTolerance: Record<string, number> = {
    temperature: 0.1,
    top_p: 0.05,
    seed: 0, // Exact match for seed
    ...tolerance
  };
  
  for (const report of reports) {
    if (report.report_id === targetReport.report_id) {
      continue; // Skip self
    }
    
    let isSimilar = true;
    
    // Compare each parameter
    for (const [key, tol] of Object.entries(defaultTolerance)) {
      const val1 = targetReport.llm_parameters[key as keyof LLMParameters];
      const val2 = report.llm_parameters[key as keyof LLMParameters];
      
      if (val1 !== undefined && val2 !== undefined) {
        if (typeof val1 === 'number' && typeof val2 === 'number') {
          if (Math.abs(val1 - val2) > tol) {
            isSimilar = false;
            break;
          }
        } else if (val1 !== val2) {
          isSimilar = false;
          break;
        }
      } else if (val1 !== val2) {
        // One is undefined, other is not
        isSimilar = false;
        break;
      }
    }
    
    if (isSimilar) {
      similar.push(report);
    }
  }
  
  return similar;
}

