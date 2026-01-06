import { AuditReport, ParameterEffectAnalysis, ParameterEffect, ParameterInteraction, LLMParameters } from '../types';

/**
 * Parameter effect analyzer: Analyze how parameters affect scores,
 * generate correlation matrices, identify interactions.
 */

export interface CorrelationMatrix {
  parameters: string[];
  correlations: number[][]; // correlations[i][j] = correlation between parameters[i] and parameters[j]
}

export interface ParameterEffectSummary {
  parameter: string;
  effectSize: number;
  correlation: number;
  pValue?: number;
  samples: number;
  meanScore: number;
  stddevScore: number;
}

/**
 * Analyze how individual parameters affect scores
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
  
  // Analyze max_tokens effect
  const maxTokensReports = reports.filter(r => r.llm_parameters.max_tokens !== undefined);
  if (maxTokensReports.length > 0) {
    effects.max_tokens = analyzeSingleParameterEffect(
      maxTokensReports,
      'max_tokens',
      (r) => r.llm_parameters.max_tokens!
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
  
  // Temperature × seed interaction
  const tempSeedParams = reports.filter(
    r => r.llm_parameters.temperature !== undefined && r.llm_parameters.seed !== undefined
  );
  
  if (tempSeedParams.length > 10) {
    const interactionStrength = calculateInteractionStrength(
      tempSeedParams,
      (r) => r.llm_parameters.temperature!,
      (r) => r.llm_parameters.seed!,
      (r) => r.overall_score
    );
    
    interactions.push({
      parameters: ['temperature', 'seed'],
      interaction_strength: interactionStrength,
      p_value: undefined
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
 * Generate correlation matrix for all parameters
 */
export function generateCorrelationMatrix(
  reports: AuditReport[]
): CorrelationMatrix {
  const paramNames: string[] = [];
  const paramData: Map<string, number[]> = new Map();
  
  // Collect all parameters that appear in reports
  const paramSet = new Set<string>();
  for (const report of reports) {
    for (const key of Object.keys(report.llm_parameters)) {
      if (report.llm_parameters[key as keyof LLMParameters] !== undefined) {
        paramSet.add(key);
      }
    }
  }
  
  // Extract parameter values
  for (const param of paramSet) {
    const values = reports
      .map(r => r.llm_parameters[param as keyof LLMParameters])
      .filter(v => typeof v === 'number') as number[];
    
    if (values.length > 0) {
      paramNames.push(param);
      paramData.set(param, values);
    }
  }
  
  // Calculate correlation matrix
  const correlations: number[][] = [];
  for (let i = 0; i < paramNames.length; i++) {
    correlations[i] = [];
    for (let j = 0; j < paramNames.length; j++) {
      if (i === j) {
        correlations[i][j] = 1.0; // Self-correlation
      } else {
        const param1Values = paramData.get(paramNames[i])!;
        const param2Values = paramData.get(paramNames[j])!;
        
        // Match reports by index (assuming same order)
        const matched = param1Values.map((v1, idx) => ({
          v1,
          v2: param2Values[idx]
        })).filter(d => d.v1 !== undefined && d.v2 !== undefined);
        
        if (matched.length > 1) {
          correlations[i][j] = calculateCorrelation(
            matched.map(d => d.v1),
            matched.map(d => d.v2)
          );
        } else {
          correlations[i][j] = 0;
        }
      }
    }
  }
  
  return {
    parameters: paramNames,
    correlations
  };
}

/**
 * Calculate Pearson correlation coefficient
 */
function calculateCorrelation(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length === 0) {
    return 0;
  }
  
  const n = x.length;
  const xMean = x.reduce((a, b) => a + b, 0) / n;
  const yMean = y.reduce((a, b) => a + b, 0) / n;
  
  const numerator = x.reduce((sum, xi, i) => 
    sum + (xi - xMean) * (y[i] - yMean), 0
  );
  
  const xVariance = x.reduce((sum, xi) => sum + Math.pow(xi - xMean, 2), 0);
  const yVariance = y.reduce((sum, yi) => sum + Math.pow(yi - yMean, 2), 0);
  
  const denominator = Math.sqrt(xVariance * yVariance);
  
  return denominator > 0 ? numerator / denominator : 0;
}

/**
 * Identify significant parameter interactions
 */
export function identifySignificantInteractions(
  reports: AuditReport[],
  threshold: number = 0.3
): ParameterInteraction[] {
  const interactions = analyzeParameterInteractions(reports);
  
  // Filter by interaction strength threshold
  return interactions.filter(i => Math.abs(i.interaction_strength) >= threshold);
}

/**
 * Generate parameter effect summary for visualization
 */
export function generateParameterEffectSummary(
  reports: AuditReport[]
): ParameterEffectSummary[] {
  const effects = analyzeParameterEffects(reports);
  const summaries: ParameterEffectSummary[] = [];
  
  if (effects.temperature) {
    const tempReports = reports.filter(r => r.llm_parameters.temperature !== undefined);
    const scores = tempReports.map(r => r.overall_score);
    summaries.push({
      parameter: 'temperature',
      effectSize: effects.temperature.effect_size,
      correlation: effects.temperature.correlation,
      pValue: effects.temperature.p_value,
      samples: effects.temperature.samples,
      meanScore: scores.reduce((a, b) => a + b, 0) / scores.length,
      stddevScore: Math.sqrt(scores.reduce((sum, s) => {
        const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
        return sum + Math.pow(s - mean, 2);
      }, 0) / (scores.length - 1))
    });
  }
  
  if (effects.top_p) {
    const topPReports = reports.filter(r => r.llm_parameters.top_p !== undefined);
    const scores = topPReports.map(r => r.overall_score);
    summaries.push({
      parameter: 'top_p',
      effectSize: effects.top_p.effect_size,
      correlation: effects.top_p.correlation,
      pValue: effects.top_p.p_value,
      samples: effects.top_p.samples,
      meanScore: scores.reduce((a, b) => a + b, 0) / scores.length,
      stddevScore: Math.sqrt(scores.reduce((sum, s) => {
        const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
        return sum + Math.pow(s - mean, 2);
      }, 0) / (scores.length - 1))
    });
  }
  
  if (effects.seed) {
    const seedReports = reports.filter(r => r.llm_parameters.seed !== undefined);
    const scores = seedReports.map(r => r.overall_score);
    summaries.push({
      parameter: 'seed',
      effectSize: effects.seed.effect_size,
      correlation: effects.seed.correlation,
      pValue: effects.seed.p_value,
      samples: effects.seed.samples,
      meanScore: scores.reduce((a, b) => a + b, 0) / scores.length,
      stddevScore: Math.sqrt(scores.reduce((sum, s) => {
        const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
        return sum + Math.pow(s - mean, 2);
      }, 0) / (scores.length - 1))
    });
  }
  
  return summaries;
}

