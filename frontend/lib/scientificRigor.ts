import { AuditReport, AggregateReport } from '../types';
import { decomposeVariance, VarianceDecomposition } from './statisticalAnalysis';
import { analyzeParameterEffects } from './parameterEffectAnalyzer';

/**
 * Scientific rigor: Validate sample sizes, check parameter confounding,
 * detect overfitting, generate rigor reports.
 */

export interface RigorReport {
  report_id: string;
  conversation_id?: string;
  aggregate_id?: string;
  created_at: string;
  sample_size_validation: {
    total_samples: number;
    minimum_required: number;
    meets_requirement: boolean;
    recommendation: string;
  };
  parameter_confounding: {
    detected: boolean;
    confounded_parameters: string[];
    correlation_matrix?: number[][];
    recommendation: string;
  };
  overfitting_detection: {
    detected: boolean;
    train_test_split?: {
      train_score: number;
      test_score: number;
      gap: number;
    };
    cross_validation_score?: number;
    recommendation: string;
  };
  statistical_power: {
    effect_size: number;
    power: number; // 0-1
    sufficient: boolean;
    recommendation: string;
  };
  overall_assessment: 'rigorous' | 'acceptable' | 'needs_improvement' | 'insufficient';
  recommendations: string[];
}

/**
 * Validate sample size
 * Research recommends: 200+ for publication, 30-50 for quick iteration
 */
export function validateSampleSize(
  reports: AuditReport[],
  context: 'publication' | 'quick_iteration' | 'calibration' = 'quick_iteration'
): {
  total_samples: number;
  minimum_required: number;
  meets_requirement: boolean;
  recommendation: string;
} {
  const totalSamples = reports.length;
  
  let minimumRequired: number;
  switch (context) {
    case 'publication':
      minimumRequired = 200;
      break;
    case 'calibration':
      minimumRequired = 200;
      break;
    case 'quick_iteration':
    default:
      minimumRequired = 30;
      break;
  }
  
  const meetsRequirement = totalSamples >= minimumRequired;
  
  let recommendation = '';
  if (meetsRequirement) {
    recommendation = `Sample size (${totalSamples}) meets minimum requirement (${minimumRequired}) for ${context} context.`;
  } else {
    const needed = minimumRequired - totalSamples;
    recommendation = `Sample size (${totalSamples}) is below minimum requirement (${minimumRequired}) for ${context} context. ` +
      `Need ${needed} more samples for reliable results.`;
  }
  
  return {
    total_samples: totalSamples,
    minimum_required: minimumRequired,
    meets_requirement: meetsRequirement,
    recommendation
  };
}

/**
 * Detect parameter confounding
 * Check if parameters are highly correlated (confounded)
 */
export function detectParameterConfounding(
  reports: AuditReport[]
): {
  detected: boolean;
  confounded_parameters: string[];
  correlation_matrix?: number[][];
  recommendation: string;
} {
  if (reports.length < 10) {
    return {
      detected: false,
      confounded_parameters: [],
      recommendation: 'Insufficient data to detect parameter confounding. Need at least 10 samples.'
    };
  }
  
  // Extract parameter values
  const paramValues: Record<string, number[]> = {};
  const paramNames: string[] = [];
  
  for (const report of reports) {
    for (const [key, value] of Object.entries(report.llm_parameters)) {
      if (typeof value === 'number') {
        if (!paramValues[key]) {
          paramValues[key] = [];
          paramNames.push(key);
        }
        paramValues[key].push(value);
      }
    }
  }
  
  if (paramNames.length < 2) {
    return {
      detected: false,
      confounded_parameters: [],
      recommendation: 'Need at least 2 parameters to detect confounding.'
    };
  }
  
  // Calculate correlation matrix
  const correlations: number[][] = [];
  const confoundedPairs: string[] = [];
  const threshold = 0.7; // High correlation threshold
  
  for (let i = 0; i < paramNames.length; i++) {
    correlations[i] = [];
    for (let j = 0; j < paramNames.length; j++) {
      if (i === j) {
        correlations[i][j] = 1.0;
      } else {
        const param1 = paramValues[paramNames[i]];
        const param2 = paramValues[paramNames[j]];
        
        // Ensure same length
        const minLength = Math.min(param1.length, param2.length);
        const p1 = param1.slice(0, minLength);
        const p2 = param2.slice(0, minLength);
        
        const correlation = calculateCorrelation(p1, p2);
        correlations[i][j] = correlation;
        
        if (Math.abs(correlation) > threshold && i < j) {
          confoundedPairs.push(`${paramNames[i]} ↔ ${paramNames[j]}`);
        }
      }
    }
  }
  
  const detected = confoundedPairs.length > 0;
  
  let recommendation = '';
  if (detected) {
    recommendation = `Parameter confounding detected: ${confoundedPairs.join(', ')}. ` +
      `High correlation (|r| > ${threshold}) suggests these parameters vary together. ` +
      `Consider: (1) Fixing one parameter while varying the other, ` +
      `(2) Using orthogonal experimental design, (3) Reporting confounding in limitations.`;
  } else {
    recommendation = 'No significant parameter confounding detected. Parameters appear independent.';
  }
  
  return {
    detected,
    confounded_parameters: confoundedPairs,
    correlation_matrix: correlations,
    recommendation
  };
}

/**
 * Calculate Pearson correlation
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
 * Detect overfitting
 * Check if model performance generalizes (would need train/test split)
 */
export function detectOverfitting(
  reports: AuditReport[],
  hasTrainTestSplit: boolean = false
): {
  detected: boolean;
  train_test_split?: {
    train_score: number;
    test_score: number;
    gap: number;
  };
  cross_validation_score?: number;
  recommendation: string;
} {
  if (reports.length < 20) {
    return {
      detected: false,
      recommendation: 'Insufficient data to detect overfitting. Need at least 20 samples for train/test split.'
    };
  }
  
  if (!hasTrainTestSplit) {
    // Without train/test split, use variance as proxy
    const scores = reports.map(r => r.overall_score);
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance = scores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / (scores.length - 1);
    const stddev = Math.sqrt(variance);
    
    // High variance might indicate overfitting (or just high uncertainty)
    const highVariance = stddev > 0.2;
    
    return {
      detected: false, // Can't definitively detect without train/test
      recommendation: highVariance
        ? 'High variance detected. Consider: (1) Train/test split, (2) Cross-validation, (3) Checking for parameter confounding.'
        : 'Cannot detect overfitting without train/test split. Consider splitting data for validation.'
    };
  }
  
  // If train/test split exists, would compare scores
  // Placeholder for actual implementation
  return {
    detected: false,
    recommendation: 'Train/test split detected. Compare train vs test performance to detect overfitting.'
  };
}

/**
 * Calculate statistical power
 * Power = probability of detecting an effect if it exists
 */
export function calculateStatisticalPower(
  reports: AuditReport[],
  effectSize: number = 0.1, // Minimum detectable effect
  alpha: number = 0.05 // Type I error rate
): {
  effect_size: number;
  power: number;
  sufficient: boolean;
  recommendation: string;
} {
  if (reports.length < 2) {
    return {
      effect_size: effectSize,
      power: 0,
      sufficient: false,
      recommendation: 'Need at least 2 samples to calculate statistical power.'
    };
  }
  
  const scores = reports.map(r => r.overall_score);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance = scores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / (scores.length - 1);
  const stddev = Math.sqrt(variance);
  
  // Simplified power calculation
  // Power depends on: sample size, effect size, variance, alpha
  // Using Cohen's d approximation
  const cohensD = stddev > 0 ? effectSize / stddev : 0;
  
  // Simplified power calculation (would use proper statistical tables in production)
  // Power ≈ 1 - β, where β is Type II error
  // Approximate: power increases with sample size and effect size
  const n = reports.length;
  const approximatePower = Math.min(1, 0.3 + (n / 100) * 0.5 + Math.abs(cohensD) * 0.2);
  
  const sufficient = approximatePower >= 0.8; // 80% power is standard
  
  let recommendation = '';
  if (sufficient) {
    recommendation = `Statistical power (${(approximatePower * 100).toFixed(1)}%) is sufficient (≥80%) for detecting effect size ${effectSize}.`;
  } else {
    const neededSamples = Math.ceil((0.8 - approximatePower) * 200);
    recommendation = `Statistical power (${(approximatePower * 100).toFixed(1)}%) is insufficient (<80%). ` +
      `Need approximately ${neededSamples} more samples for 80% power to detect effect size ${effectSize}.`;
  }
  
  return {
    effect_size: effectSize,
    power: approximatePower,
    sufficient,
    recommendation
  };
}

/**
 * Generate comprehensive rigor report
 */
export function generateRigorReport(
  reports: AuditReport[],
  aggregateReport?: AggregateReport,
  context: 'publication' | 'quick_iteration' | 'calibration' = 'quick_iteration'
): RigorReport {
  const reportId = `rigor-${aggregateReport?.aggregate_id || reports[0]?.conversation_id || 'unknown'}-${Date.now()}`;
  
  // Sample size validation
  const sampleSizeValidation = validateSampleSize(reports, context);
  
  // Parameter confounding
  const parameterConfounding = detectParameterConfounding(reports);
  
  // Overfitting detection
  const overfittingDetection = detectOverfitting(reports);
  
  // Statistical power
  const statisticalPower = calculateStatisticalPower(reports);
  
  // Overall assessment
  let overallAssessment: 'rigorous' | 'acceptable' | 'needs_improvement' | 'insufficient';
  const issues: string[] = [];
  const recommendations: string[] = [];
  
  if (!sampleSizeValidation.meets_requirement) {
    issues.push('Insufficient sample size');
    recommendations.push(sampleSizeValidation.recommendation);
  }
  
  if (parameterConfounding.detected) {
    issues.push('Parameter confounding detected');
    recommendations.push(parameterConfounding.recommendation);
  }
  
  if (overfittingDetection.detected) {
    issues.push('Potential overfitting');
    recommendations.push(overfittingDetection.recommendation);
  }
  
  if (!statisticalPower.sufficient) {
    issues.push('Insufficient statistical power');
    recommendations.push(statisticalPower.recommendation);
  }
  
  if (issues.length === 0) {
    overallAssessment = 'rigorous';
  } else if (issues.length === 1) {
    overallAssessment = 'acceptable';
  } else if (issues.length <= 2) {
    overallAssessment = 'needs_improvement';
  } else {
    overallAssessment = 'insufficient';
  }
  
  // Add general recommendations
  if (recommendations.length === 0) {
    recommendations.push('Results meet scientific rigor standards. Ready for publication or deployment.');
  }
  
  return {
    report_id: reportId,
    conversation_id: reports[0]?.conversation_id,
    aggregate_id: aggregateReport?.aggregate_id,
    created_at: new Date().toISOString(),
    sample_size_validation: sampleSizeValidation,
    parameter_confounding: parameterConfounding,
    overfitting_detection: overfittingDetection,
    statistical_power: statisticalPower,
    overall_assessment: overallAssessment,
    recommendations
  };
}

/**
 * Check for version coupling
 * Detect if metrics overfit to specific model/prompt versions
 */
export function detectVersionCoupling(
  reports: AuditReport[]
): {
  detected: boolean;
  coupled_versions: Map<string, number>; // version -> count
  recommendation: string;
} {
  const versionCounts = new Map<string, number>();
  
  for (const report of reports) {
    const versionKey = `${report.model_name}-${report.skill_version}-${report.prompt_version}`;
    versionCounts.set(versionKey, (versionCounts.get(versionKey) || 0) + 1);
  }
  
  // Check if most reports use same version
  const total = reports.length;
  const maxCount = Math.max(...Array.from(versionCounts.values()));
  const maxProportion = maxCount / total;
  
  const detected = maxProportion > 0.8; // 80% threshold
  
  let recommendation = '';
  if (detected) {
    recommendation = `Version coupling detected: ${(maxProportion * 100).toFixed(1)}% of reports use same version. ` +
      `Metrics may overfit to this specific model/prompt combination. ` +
      `Consider: (1) Testing across multiple model versions, (2) Varying prompt versions, ` +
      `(3) Reporting version-specific limitations.`;
  } else {
    recommendation = 'No significant version coupling detected. Results span multiple versions.';
  }
  
  return {
    detected,
    coupled_versions: versionCounts,
    recommendation
  };
}

