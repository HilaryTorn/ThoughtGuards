import { AuditReport, AggregateReport, DistributionMetrics, ParameterEffectAnalysis, ParameterEffect, ParameterInteraction, LLMParameters } from '../types';
import { calculateDistribution, calculateConfidenceInterval, calculateBCaConfidenceInterval, calculateClusterBootstrapCI, DistributionMetrics as StatsDistributionMetrics, ConfidenceInterval } from './statisticalAnalysis';

/**
 * Aggregate report calculator: Implement mean/median/mode,
 * parameter effect analysis, time-series aggregation, statistical distributions.
 * Supports hierarchical aggregation methods per research requirements.
 */

export interface AggregationConfig {
  method: 'mean' | 'median' | 'mode' | 'parameter_effect' | 'time_series' | 'custom';
  group_by?: string[]; // e.g., ['temperature', 'model_name']
  filters?: Record<string, any>;
  weight_function?: string; // Custom weight function
}

/**
 * Calculate mean aggregate from reports
 */
export function calculateMeanAggregate(
  reports: AuditReport[]
): {
  aggregatedScore: number;
  distribution: DistributionMetrics;
  confidenceInterval: ConfidenceInterval;
} {
  if (reports.length === 0) {
    throw new Error('Cannot aggregate empty reports array');
  }
  
  const scores = reports.map(r => r.overall_score);
  const distribution = calculateDistributionFromScores(scores);
  const ci = calculateConfidenceInterval(scores);
  
  return {
    aggregatedScore: distribution.mean,
    distribution: {
      mean: distribution.mean,
      stddev: distribution.stddev,
      p5: distribution.quantiles.p5,
      p25: distribution.quantiles.p25,
      p50: distribution.quantiles.p50,
      p75: distribution.quantiles.p75,
      p95: distribution.quantiles.p95,
      ci_lower: ci.lower,
      ci_upper: ci.upper
    },
    confidenceInterval: ci
  };
}

/**
 * Calculate median aggregate from reports
 */
export function calculateMedianAggregate(
  reports: AuditReport[]
): {
  aggregatedScore: number;
  distribution: DistributionMetrics;
} {
  if (reports.length === 0) {
    throw new Error('Cannot aggregate empty reports array');
  }
  
  const scores = reports.map(r => r.overall_score).sort((a, b) => a - b);
  const median = scores.length % 2 === 0
    ? (scores[scores.length / 2 - 1] + scores[scores.length / 2]) / 2
    : scores[Math.floor(scores.length / 2)];
  
  const distribution = calculateDistributionFromScores(scores);
  
  return {
    aggregatedScore: median,
    distribution: {
      mean: distribution.mean,
      stddev: distribution.stddev,
      p5: distribution.quantiles.p5,
      p25: distribution.quantiles.p25,
      p50: median,
      p75: distribution.quantiles.p75,
      p95: distribution.quantiles.p95,
      ci_lower: distribution.quantiles.p25, // Approximate
      ci_upper: distribution.quantiles.p75
    }
  };
}

/**
 * Calculate mode aggregate (most common score range)
 */
export function calculateModeAggregate(
  reports: AuditReport[],
  binSize: number = 0.1
): {
  aggregatedScore: number;
  distribution: DistributionMetrics;
} {
  if (reports.length === 0) {
    throw new Error('Cannot aggregate empty reports array');
  }
  
  const scores = reports.map(r => r.overall_score);
  
  // Create bins
  const bins = new Map<number, number>();
  for (const score of scores) {
    const bin = Math.floor(score / binSize) * binSize;
    bins.set(bin, (bins.get(bin) || 0) + 1);
  }
  
  // Find mode (most frequent bin)
  let maxCount = 0;
  let modeBin = 0;
  for (const [bin, count] of bins.entries()) {
    if (count > maxCount) {
      maxCount = count;
      modeBin = bin;
    }
  }
  
  const distribution = calculateDistributionFromScores(scores);
  
  return {
    aggregatedScore: modeBin + binSize / 2, // Center of mode bin
    distribution: {
      mean: distribution.mean,
      stddev: distribution.stddev,
      p5: distribution.quantiles.p5,
      p25: distribution.quantiles.p25,
      p50: distribution.quantiles.p50,
      p75: distribution.quantiles.p75,
      p95: distribution.quantiles.p95,
      ci_lower: distribution.quantiles.p25,
      ci_upper: distribution.quantiles.p75
    }
  };
}

/**
 * Analyze parameter effects on scores
 */
export function analyzeParameterEffects(
  reports: AuditReport[]
): ParameterEffectAnalysis {
  const effects: ParameterEffectAnalysis = {};
  
  // Analyze temperature effect
  const temperatureReports = reports.filter(r => r.llm_parameters.temperature !== undefined);
  if (temperatureReports.length > 0) {
    effects.temperature = analyzeSingleParameterEffect(
      temperatureReports,
      'temperature',
      (r) => r.llm_parameters.temperature!
    );
  }
  
  // Analyze top_p effect
  const topPReports = reports.filter(r => r.llm_parameters.top_p !== undefined);
  if (topPReports.length > 0) {
    effects.top_p = analyzeSingleParameterEffect(
      topPReports,
      'top_p',
      (r) => r.llm_parameters.top_p!
    );
  }
  
  // Analyze seed effect
  const seedReports = reports.filter(r => r.llm_parameters.seed !== undefined);
  if (seedReports.length > 0) {
    effects.seed = analyzeSingleParameterEffect(
      seedReports,
      'seed',
      (r) => r.llm_parameters.seed!
    );
  }
  
  // Analyze interactions
  if (temperatureReports.length > 0 && topPReports.length > 0) {
    effects.interactions = analyzeParameterInteractions(reports);
  }
  
  return effects;
}

/**
 * Analyze effect of a single parameter
 */
function analyzeSingleParameterEffect(
  reports: AuditReport[],
  paramName: string,
  extractValue: (r: AuditReport) => number
): ParameterEffect {
  const data = reports.map(r => ({
    param: extractValue(r),
    score: r.overall_score
  }));
  
  // Calculate correlation
  const n = data.length;
  const paramMean = data.reduce((sum, d) => sum + d.param, 0) / n;
  const scoreMean = data.reduce((sum, d) => sum + d.score, 0) / n;
  
  const paramVariance = data.reduce((sum, d) => sum + Math.pow(d.param - paramMean, 2), 0) / (n - 1);
  const scoreVariance = data.reduce((sum, d) => sum + Math.pow(d.score - scoreMean, 2), 0) / (n - 1);
  const covariance = data.reduce((sum, d) => sum + (d.param - paramMean) * (d.score - scoreMean), 0) / (n - 1);
  
  const correlation = paramVariance > 0 && scoreVariance > 0
    ? covariance / Math.sqrt(paramVariance * scoreVariance)
    : 0;
  
  // Calculate effect size (slope of regression line)
  const effectSize = paramVariance > 0 ? covariance / paramVariance : 0;
  
  // Simple p-value approximation (would need proper statistical test in production)
  const tStat = Math.abs(correlation) * Math.sqrt((n - 2) / (1 - correlation * correlation));
  const pValue = approximatePValue(tStat, n - 2);
  
  return {
    correlation,
    effect_size: effectSize,
    p_value: pValue,
    samples: n
  };
}

/**
 * Analyze parameter interactions (e.g., temperature × top_p)
 */
function analyzeParameterInteractions(
  reports: AuditReport[]
): ParameterInteraction[] {
  const interactions: ParameterInteraction[] = [];
  
  // Temperature × top_p interaction
  const bothParams = reports.filter(
    r => r.llm_parameters.temperature !== undefined && r.llm_parameters.top_p !== undefined
  );
  
  if (bothParams.length > 10) {
    // Calculate interaction strength
    // This is a simplified version - full implementation would use ANOVA
    const interactionStrength = calculateInteractionStrength(
      bothParams,
      (r) => r.llm_parameters.temperature!,
      (r) => r.llm_parameters.top_p!,
      (r) => r.overall_score
    );
    
    interactions.push({
      parameters: ['temperature', 'top_p'],
      interaction_strength: interactionStrength,
      p_value: undefined // Would need proper ANOVA test
    });
  }
  
  return interactions;
}

/**
 * Calculate interaction strength between two parameters
 */
function calculateInteractionStrength(
  reports: AuditReport[],
  extractParam1: (r: AuditReport) => number,
  extractParam2: (r: AuditReport) => number,
  extractScore: (r: AuditReport) => number
): number {
  // Simplified interaction calculation
  // Full implementation would use ANOVA or regression with interaction terms
  
  const data = reports.map(r => ({
    p1: extractParam1(r),
    p2: extractParam2(r),
    score: extractScore(r)
  }));
  
  // Group by param1 and calculate mean scores
  const groups1 = new Map<number, number[]>();
  for (const d of data) {
    const key = Math.round(d.p1 * 10) / 10; // Round to 0.1
    if (!groups1.has(key)) {
      groups1.set(key, []);
    }
    groups1.get(key)!.push(d.score);
  }
  
  // Calculate variance within groups vs between groups
  const groupMeans = Array.from(groups1.entries()).map(([key, scores]) => ({
    param: key,
    mean: scores.reduce((a, b) => a + b, 0) / scores.length,
    variance: scores.reduce((sum, s) => {
      const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
      return sum + Math.pow(s - mean, 2);
    }, 0) / scores.length
  }));
  
  // Interaction strength is variance of group means
  const overallMean = groupMeans.reduce((sum, g) => sum + g.mean, 0) / groupMeans.length;
  const interactionVariance = groupMeans.reduce(
    (sum, g) => sum + Math.pow(g.mean - overallMean, 2),
    0
  ) / groupMeans.length;
  
  return Math.sqrt(interactionVariance);
}

/**
 * Approximate p-value from t-statistic (simplified)
 */
function approximatePValue(tStat: number, df: number): number {
  // Simplified approximation - in production, use proper t-distribution
  if (tStat > 3) return 0.001;
  if (tStat > 2) return 0.01;
  if (tStat > 1.5) return 0.05;
  return 0.1;
}

/**
 * Calculate time-series aggregation (trends over time)
 */
export function calculateTimeSeriesAggregate(
  reports: AuditReport[]
): {
  aggregatedScore: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  trendStrength: number;
  timePoints: Array<{ timestamp: string; score: number }>;
} {
  if (reports.length === 0) {
    throw new Error('Cannot aggregate empty reports array');
  }
  
  // Sort by timestamp
  const sorted = [...reports].sort((a, b) => 
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  
  const timePoints = sorted.map(r => ({
    timestamp: r.created_at,
    score: r.overall_score
  }));
  
  // Calculate trend (linear regression slope)
  const n = timePoints.length;
  const xValues = timePoints.map((_, i) => i);
  const yValues = timePoints.map(tp => tp.score);
  
  const xMean = xValues.reduce((a, b) => a + b, 0) / n;
  const yMean = yValues.reduce((a, b) => a + b, 0) / n;
  
  const numerator = xValues.reduce((sum, x, i) => 
    sum + (x - xMean) * (yValues[i] - yMean), 0
  );
  const denominator = xValues.reduce((sum, x) => 
    sum + Math.pow(x - xMean, 2), 0
  );
  
  const slope = denominator > 0 ? numerator / denominator : 0;
  
  let trend: 'increasing' | 'decreasing' | 'stable';
  if (Math.abs(slope) < 0.001) {
    trend = 'stable';
  } else if (slope > 0) {
    trend = 'increasing';
  } else {
    trend = 'decreasing';
  }
  
  return {
    aggregatedScore: yMean,
    trend,
    trendStrength: Math.abs(slope),
    timePoints
  };
}

/**
 * Create aggregate report from source reports
 */
export function createAggregateReport(
  sourceReports: AuditReport[],
  aggregateType: 'mean' | 'median' | 'parameter_effect' | 'time_series',
  conversationId: string,
  aggregationConfig: AggregationConfig
): AggregateReport {
  if (sourceReports.length === 0) {
    throw new Error('Cannot create aggregate from empty reports');
  }
  
  const aggregateId = `aggregate-${conversationId}-${Date.now()}`;
  const timestamp = new Date().toISOString();
  
  let aggregatedScore: number | undefined;
  let scoreDistribution: DistributionMetrics | undefined;
  let parameterEffects: ParameterEffectAnalysis | undefined;
  
  switch (aggregateType) {
    case 'mean':
      const meanResult = calculateMeanAggregate(sourceReports);
      aggregatedScore = meanResult.aggregatedScore;
      scoreDistribution = meanResult.distribution;
      break;
      
    case 'median':
      const medianResult = calculateMedianAggregate(sourceReports);
      aggregatedScore = medianResult.aggregatedScore;
      scoreDistribution = medianResult.distribution;
      break;
      
    case 'parameter_effect':
      parameterEffects = analyzeParameterEffects(sourceReports);
      // Use mean as aggregated score
      const meanAgg = calculateMeanAggregate(sourceReports);
      aggregatedScore = meanAgg.aggregatedScore;
      scoreDistribution = meanAgg.distribution;
      break;
      
    case 'time_series':
      const tsResult = calculateTimeSeriesAggregate(sourceReports);
      aggregatedScore = tsResult.aggregatedScore;
      // Create distribution from time series
      const scores = tsResult.timePoints.map(tp => tp.score);
      scoreDistribution = calculateDistributionFromScores(scores);
      break;
  }
  
  // Aggregate detected types
  const detectedTypesMap = new Map<string, number>();
  for (const report of sourceReports) {
    for (const dt of report.detected_types) {
      const key = typeof dt === 'string' ? dt : dt.type || 'unknown';
      detectedTypesMap.set(key, (detectedTypesMap.get(key) || 0) + 1);
    }
  }
  const detectedTypesAggregated = Array.from(detectedTypesMap.entries()).map(([type, count]) => ({
    type,
    count,
    frequency: count / sourceReports.length
  }));
  
  // Aggregate metrics (simple average for numeric metrics)
  const metricsAggregated: Record<string, any> = {};
  const metricKeys = new Set<string>();
  for (const report of sourceReports) {
    for (const key of Object.keys(report.metrics)) {
      metricKeys.add(key);
    }
  }
  
  for (const key of metricKeys) {
    const values = sourceReports
      .map(r => r.metrics[key])
      .filter(v => typeof v === 'number');
    if (values.length > 0) {
      metricsAggregated[key] = values.reduce((a, b) => a + b, 0) / values.length;
    }
  }
  
  return {
    aggregate_id: aggregateId,
    conversation_id: conversationId,
    aggregate_type: aggregateType,
    source_report_ids: sourceReports.map(r => r.report_id),
    source_count: sourceReports.length,
    aggregation_config: aggregationConfig,
    aggregated_score: aggregatedScore,
    score_distribution: scoreDistribution,
    parameter_effects: parameterEffects,
    detected_types_aggregated: detectedTypesAggregated,
    metrics_aggregated: metricsAggregated,
    created_at: timestamp,
    created_by: undefined,
    computation_duration_ms: undefined,
    notes: undefined
  };
}

/**
 * Helper: Calculate distribution from scores array
 */
function calculateDistributionFromScores(scores: number[]): DistributionMetrics {
  const sorted = [...scores].sort((a, b) => a - b);
  const n = sorted.length;
  
  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  const variance = sorted.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / (n - 1);
  const stddev = Math.sqrt(variance);
  
  const quantile = (p: number): number => {
    if (p <= 0) return sorted[0];
    if (p >= 1) return sorted[n - 1];
    const index = (n - 1) * p;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  };
  
  const ci = calculateConfidenceInterval(scores);
  
  return {
    mean,
    stddev,
    p5: quantile(0.05),
    p25: quantile(0.25),
    p50: quantile(0.50),
    p75: quantile(0.75),
    p95: quantile(0.95),
    ci_lower: ci.lower,
    ci_upper: ci.upper
  };
}

/**
 * Group reports by parameter values
 */
export function groupReportsByParameters(
  reports: AuditReport[],
  groupBy: string[]
): Map<string, AuditReport[]> {
  const groups = new Map<string, AuditReport[]>();
  
  for (const report of reports) {
    const keyParts: string[] = [];
    for (const param of groupBy) {
      const value = report.llm_parameters[param as keyof LLMParameters];
      keyParts.push(`${param}=${value !== undefined ? value : 'default'}`);
    }
    const key = keyParts.join('|');
    
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(report);
  }
  
  return groups;
}

/**
 * Hierarchical aggregation using cluster bootstrap
 * Respects data structure (e.g., multiple runs per conversation)
 */
export function calculateHierarchicalAggregate(
  clusters: Array<{
    clusterId: string;
    reports: AuditReport[];
  }>,
  method: 'cluster_bootstrap' | 'bradley_terry' | 'mixed_effects' = 'cluster_bootstrap'
): {
  aggregatedScore: number;
  distribution: DistributionMetrics;
  confidenceInterval: ConfidenceInterval;
  method: string;
} {
  if (clusters.length === 0) {
    throw new Error('Cannot aggregate empty clusters');
  }
  
  // Calculate cluster-level means
  const clusterMeans = clusters.map(c => {
    const scores = c.reports.map(r => r.overall_score);
    return {
      clusterId: c.clusterId,
      mean: scores.reduce((sum, s) => sum + s, 0) / scores.length,
      scores
    };
  });
  
  const overallMean = clusterMeans.reduce((sum, c) => sum + c.mean, 0) / clusterMeans.length;
  
  switch (method) {
    case 'cluster_bootstrap':
      // Use cluster bootstrap CI
      const clusterData = clusters.map(c => ({
        clusterId: c.clusterId,
        scores: c.reports.map(r => r.overall_score)
      }));
      
      const ci = calculateClusterBootstrapCI(clusterData);
      
      // Calculate distribution from cluster means
      const clusterMeanScores = clusterMeans.map(c => c.mean);
      const distribution = calculateDistributionFromScores(clusterMeanScores);
      
      return {
        aggregatedScore: overallMean,
        distribution: {
          ...distribution,
          ci_lower: ci.lower,
          ci_upper: ci.upper
        },
        confidenceInterval: ci,
        method: 'cluster_bootstrap'
      };
      
    case 'bradley_terry':
      // Simplified Bradley-Terry model
      // Full implementation would require pairwise comparisons
      return calculateBradleyTerryAggregate(clusterMeans);
      
    case 'mixed_effects':
      // Simplified mixed effects model
      // Full implementation would use proper statistical modeling
      return calculateMixedEffectsAggregate(clusters);
      
    default:
      throw new Error(`Unknown hierarchical aggregation method: ${method}`);
  }
}

/**
 * Simplified Bradley-Terry model aggregation
 * Full implementation would require pairwise comparison data
 */
function calculateBradleyTerryAggregate(
  clusterMeans: Array<{ clusterId: string; mean: number; scores: number[] }>
): {
  aggregatedScore: number;
  distribution: DistributionMetrics;
  confidenceInterval: ConfidenceInterval;
  method: string;
} {
  // Simplified: use cluster means with weighted average
  // Full Bradley-Terry would estimate strength parameters from pairwise comparisons
  const weights = clusterMeans.map(c => c.scores.length);
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  
  const weightedMean = clusterMeans.reduce((sum, c, i) => 
    sum + c.mean * (weights[i] / totalWeight), 0
  );
  
  const allScores = clusterMeans.flatMap(c => c.scores);
  const distribution = calculateDistributionFromScores(allScores);
  const ci = calculateBCaConfidenceInterval(allScores);
  
  return {
    aggregatedScore: weightedMean,
    distribution: {
      ...distribution,
      ci_lower: ci.lower,
      ci_upper: ci.upper
    },
    confidenceInterval: ci,
    method: 'bradley_terry'
  };
}

/**
 * Simplified mixed effects model aggregation
 * Full implementation would use proper statistical modeling (e.g., lme4)
 */
function calculateMixedEffectsAggregate(
  clusters: Array<{ clusterId: string; reports: AuditReport[] }>
): {
  aggregatedScore: number;
  distribution: DistributionMetrics;
  confidenceInterval: ConfidenceInterval;
  method: string;
} {
  // Simplified: calculate fixed effect (overall mean) and random effects (cluster deviations)
  const allScores = clusters.flatMap(c => c.reports.map(r => r.overall_score));
  const overallMean = allScores.reduce((sum, s) => sum + s, 0) / allScores.length;
  
  // Calculate cluster-level random effects
  const clusterEffects: number[] = [];
  for (const cluster of clusters) {
    const clusterScores = cluster.reports.map(r => r.overall_score);
    const clusterMean = clusterScores.reduce((sum, s) => sum + s, 0) / clusterScores.length;
    clusterEffects.push(clusterMean - overallMean);
  }
  
  // Use cluster bootstrap for CI (accounts for cluster structure)
  const clusterData = clusters.map(c => ({
    clusterId: c.clusterId,
    scores: c.reports.map(r => r.overall_score)
  }));
  
  const ci = calculateClusterBootstrapCI(clusterData);
  const distribution = calculateDistributionFromScores(allScores);
  
  return {
    aggregatedScore: overallMean,
    distribution: {
      ...distribution,
      ci_lower: ci.lower,
      ci_upper: ci.upper
    },
    confidenceInterval: ci,
    method: 'mixed_effects'
  };
}

